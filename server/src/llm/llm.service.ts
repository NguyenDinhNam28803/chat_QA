import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import {
  SystemMessage,
  HumanMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { buildQaMessages } from './qa.prompt';

const STREAM_TIMEOUT_MS = 60_000;

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly models: { name: string; model: ChatOpenAI }[];

  constructor(config: ConfigService) {
    const base = {
      apiKey: config.getOrThrow<string>('OPENROUTER_API_KEY'),
      configuration: {
        baseURL: config.get<string>(
          'OPENROUTER_BASE_URL',
          'https://openrouter.ai/api/v1',
        ),
        defaultHeaders: {
          'HTTP-Referer': config.get<string>('APP_PUBLIC_URL', ''),
          'X-Title': config.get<string>('APP_TITLE', 'NewsQA'),
        },
      },
      temperature: 0.2,
      streaming: true,
      // Free OpenRouter models 429 often; fail fast and we fall over manually.
      maxRetries: 0,
    };
    const primary = config.getOrThrow<string>('LLM_PRIMARY_MODEL');
    const fallback = config.getOrThrow<string>('LLM_FALLBACK_MODEL');
    this.models = [
      { name: primary, model: new ChatOpenAI({ ...base, model: primary }) },
      { name: fallback, model: new ChatOpenAI({ ...base, model: fallback }) },
    ];
  }

  /**
   * Stream the answer, trying each model in order. We do the fallback manually
   * (instead of LangChain's withFallbacks) because withFallbacks + streaming
   * intermittently hangs when the primary returns 429: the stream is opened but
   * never errors cleanly. Here each attempt is wrapped in an abortable timeout,
   * and we only fall over if NO token has been emitted yet (can't safely restart
   * a half-streamed answer).
   */
  async *streamAnswer(
    question: string,
    context: string,
  ): AsyncIterable<string> {
    yield* this.streamMessages(buildQaMessages(question, context));
  }

  /** Single-shot generation (used by summary / brief / compare / timeline). */
  async generate(systemText: string, userText: string): Promise<string> {
    let out = '';
    for await (const t of this.streamMessages([
      new SystemMessage(systemText),
      new HumanMessage(userText),
    ])) {
      out += t;
    }
    return out;
  }

  /** Try each model in order with an abortable timeout; manual fallback. */
  private async *streamMessages(
    messages: BaseMessage[],
  ): AsyncIterable<string> {
    let lastErr: unknown;
    for (const { name, model } of this.models) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
      let yielded = 0;
      try {
        const stream = await model.stream(messages, {
          signal: controller.signal,
        });
        for await (const chunk of stream) {
          const text = typeof chunk.content === 'string' ? chunk.content : '';
          if (text) {
            yielded++;
            yield text;
          }
        }
        return;
      } catch (err) {
        lastErr = err;
        this.logger.warn(`model ${name} failed: ${String(err)}`);
        if (yielded > 0) throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastErr instanceof Error) throw lastErr;
    throw new Error(
      typeof lastErr === 'string' ? lastErr : 'All LLM models failed',
    );
  }
}
