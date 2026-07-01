import { ChatService } from './chat.service';
import type { MessageEvent } from '@nestjs/common';

describe('ChatService.stream', () => {
  it('emits tokens then a done event, and persists user + assistant messages', async () => {
    const citations = [
      { index: 1, articleId: 'a', url: 'u', title: 't', source: 's' },
    ];
    const retrieval = {
      search: jest.fn().mockResolvedValue({ context: '[1] ctx', citations }),
    };
    async function* gen(): AsyncIterable<string> {
      await Promise.resolve();
      yield 'Xin';
      yield ' chào';
    }
    const llm = { streamAnswer: jest.fn().mockReturnValue(gen()) };
    const saved: { role: string; content: string }[] = [];
    const prisma = {
      conversation: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
      message: {
        create: jest.fn().mockImplementation((args: { data: never }) => {
          saved.push(args.data);
          return Promise.resolve(args.data);
        }),
      },
    };

    const svc = new ChatService(
      prisma as never,
      retrieval as never,
      llm as never,
    );

    const events: {
      token?: string;
      done?: boolean;
      citations?: unknown;
      conversationId?: string;
    }[] = [];
    await new Promise<void>((resolve, reject) => {
      svc.stream('câu hỏi').subscribe({
        next: (e: MessageEvent) => events.push(e.data as never),
        error: reject,
        complete: resolve,
      });
    });

    const tokens = events
      .filter((e) => e.token)
      .map((e) => e.token)
      .join('');
    expect(tokens).toBe('Xin chào');

    const done = events.find((e) => e.done);
    expect(done).toBeTruthy();
    expect(done?.citations).toEqual(citations);
    expect(done?.conversationId).toBe('c1');

    expect(prisma.message.create).toHaveBeenCalledTimes(2);
    expect(saved[0].role).toBe('user');
    expect(saved[1].role).toBe('assistant');
    expect(saved[1].content).toBe('Xin chào');
  });
});
