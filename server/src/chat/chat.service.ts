import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { LlmService } from '../llm/llm.service';
import { rewriteFollowupPrompt } from '../llm/features.prompts';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmService,
  ) {}

  /** List conversations for the history sidebar, newest first. */
  listConversations() {
    return this.prisma.conversation.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true },
    });
  }

  /** All messages of one conversation, in chronological order. */
  getMessages(conversationId: string) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        citations: true,
        feedback: true,
      },
    });
  }

  /** Record 👍 (1) / 👎 (-1) / clear (0→null) feedback on an assistant message. */
  async setFeedback(id: string, value: number): Promise<{ ok: boolean }> {
    await this.prisma.message.update({
      where: { id },
      data: { feedback: value === 0 ? null : value },
    });
    return { ok: true };
  }

  stream(
    question: string,
    conversationId?: string,
    topic?: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((sub) => {
      (async () => {
        // (E1) For a follow-up in an existing conversation, rewrite the question
        // into a standalone query using recent turns, so retrieval isn't blind to
        // context ("còn ông ấy thì sao?" → a self-contained query).
        const searchQuery = conversationId
          ? await this.rewriteFollowup(question, conversationId)
          : question;

        const { context, citations, confidence } = await this.retrieval.search(
          searchQuery,
          5,
          topic,
        );
        const convo = conversationId
          ? { id: conversationId }
          : await this.prisma.conversation.create({
              data: { title: question.slice(0, 80) },
            });

        await this.prisma.message.create({
          data: { conversationId: convo.id, role: 'user', content: question },
        });

        let answer = '';
        for await (const token of this.llm.streamAnswer(question, context)) {
          answer += token;
          sub.next({ data: { token } } as MessageEvent);
        }

        const assistantMsg = await this.prisma.message.create({
          data: {
            conversationId: convo.id,
            role: 'assistant',
            content: answer,
            citations: citations as unknown as Prisma.InputJsonValue,
          },
        });
        sub.next({
          data: {
            done: true,
            citations,
            confidence,
            conversationId: convo.id,
            messageId: assistantMsg.id,
          },
        } as MessageEvent);
        sub.complete();
      })().catch((err) => sub.error(err));
    });
  }

  /**
   * (E1) Rewrite a follow-up question into a self-contained search query using
   * the last few turns. Best-effort: on any failure we fall back to the raw
   * question, so chat never breaks because of the rewrite step.
   */
  private async rewriteFollowup(
    question: string,
    conversationId: string,
  ): Promise<string> {
    try {
      const history = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { role: true, content: true },
      });
      if (history.length === 0) return question;
      const turns = history
        .reverse()
        .map(
          (m) =>
            `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.content.slice(0, 300)}`,
        )
        .join('\n');
      const { system, user } = rewriteFollowupPrompt(turns, question);
      const rewritten = (await this.llm.generate(system, user)).trim();
      // Guard against a runaway/empty rewrite.
      if (!rewritten || rewritten.length > 300) return question;
      return rewritten;
    } catch {
      return question;
    }
  }
}
