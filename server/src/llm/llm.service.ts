import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { buildQaMessages } from './qa.prompt';

@Injectable()
export class LlmService {
  private readonly model: ChatOpenAI;

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
      // Free models on OpenRouter get 429-rate-limited upstream often; fail fast
      // so withFallbacks() actually switches to the fallback instead of hanging
      // on LangChain's default exponential-backoff retries.
      maxRetries: 1,
    };
    const primary = new ChatOpenAI({
      ...base,
      model: config.getOrThrow('LLM_PRIMARY_MODEL'),
    });
    const fallback = new ChatOpenAI({
      ...base,
      model: config.getOrThrow('LLM_FALLBACK_MODEL'),
    });
    this.model = primary.withFallbacks([fallback]) as unknown as ChatOpenAI;
  }

  async *streamAnswer(
    question: string,
    context: string,
  ): AsyncIterable<string> {
    const stream = await this.model.stream(buildQaMessages(question, context));
    for await (const chunk of stream) {
      const text = typeof chunk.content === 'string' ? chunk.content : '';
      if (text) yield text;
    }
  }
}
