import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmService,
  ) {}

  stream(question: string, conversationId?: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((sub) => {
      (async () => {
        const { context, citations } = await this.retrieval.search(question);
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

        await this.prisma.message.create({
          data: {
            conversationId: convo.id,
            role: 'assistant',
            content: answer,
            citations: citations as unknown as Prisma.InputJsonValue,
          },
        });
        sub.next({
          data: { done: true, citations, conversationId: convo.id },
        } as MessageEvent);
        sub.complete();
      })().catch((err) => sub.error(err));
    });
  }
}
