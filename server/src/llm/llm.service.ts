import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import {
  SystemMessage,
  HumanMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { buildQaMessages } from './qa.prompt';
import { UsageService } from '../usage/usage.service';

const STREAM_TIMEOUT_MS = 60_000;

// (B1) Capability tiers — map task difficulty to a model chain.
export type Tier = 'nano' | 'standard' | 'reasoning';
export interface LlmOpts {
  feature?: string;
  tier?: Tier;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly modelBySlug = new Map<string, ChatOpenAI>();
  private readonly tierChains: Record<Tier, string[]>;
  // Raw OpenRouter access — used by generateStructured / generateWeb.
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly attrHeaders: Record<string, string>;

  constructor(
    config: ConfigService,
    private readonly usage: UsageService,
  ) {
    this.apiKey = config.getOrThrow<string>('OPENROUTER_API_KEY');
    this.baseURL = config.get<string>(
      'OPENROUTER_BASE_URL',
      'https://openrouter.ai/api/v1',
    );
    this.attrHeaders = {
      'HTTP-Referer': config.get<string>('APP_PUBLIC_URL', ''),
      'X-Title': config.get<string>('APP_TITLE', 'NewsQA'),
    };

    const primary = config.getOrThrow<string>('LLM_PRIMARY_MODEL');
    const fallback = config.getOrThrow<string>('LLM_FALLBACK_MODEL');
    // Tier slugs default to the reliable pair, so behaviour is unchanged until a
    // real nano/standard/reasoning model is set in env. Heavy tasks lean on the
    // big model, light tasks on the small one — which also spreads 429 load.
    const reasoning = config.get<string>('LLM_MODEL_REASONING', primary);
    const standard = config.get<string>('LLM_MODEL_STANDARD', fallback);
    const nano = config.get<string>('LLM_MODEL_NANO', fallback);

    const dedup = (a: string[]) => [...new Set(a)];
    this.tierChains = {
      reasoning: dedup([reasoning, primary, fallback]),
      standard: dedup([standard, fallback, primary]),
      nano: dedup([nano, fallback, primary]),
    };

    const base = {
      apiKey: this.apiKey,
      configuration: {
        baseURL: this.baseURL,
        defaultHeaders: this.attrHeaders,
      },
      temperature: 0.2,
      streaming: true,
      streamUsage: true, // (B3) get token counts on the final stream chunk
      maxRetries: 0,
    };
    for (const slug of new Set(Object.values(this.tierChains).flat())) {
      this.modelBySlug.set(slug, new ChatOpenAI({ ...base, model: slug }));
    }
  }

  /** Stream the grounded chat answer. Chat is the flagship → reasoning tier. */
  async *streamAnswer(
    question: string,
    context: string,
    opts?: LlmOpts,
  ): AsyncIterable<string> {
    yield* this.streamMessages(buildQaMessages(question, context), {
      tier: 'reasoning',
      feature: 'chat',
      ...opts,
    });
  }

  /** Single-shot generation (summary / brief / compare / timeline / rewrite…). */
  async generate(
    systemText: string,
    userText: string,
    opts?: LlmOpts,
  ): Promise<string> {
    let out = '';
    for await (const t of this.streamMessages(
      [new SystemMessage(systemText), new HumanMessage(userText)],
      opts,
    )) {
      out += t;
    }
    return out;
  }

  /**
   * (B2) Structured generation — force JSON matching a schema. Non-streaming;
   * captures usage from the response. Throws if no model returns valid JSON.
   */
  async generateStructured<T>(
    systemText: string,
    userText: string,
    schema: { name: string; schema: Record<string, unknown> },
    opts?: LlmOpts,
  ): Promise<T> {
    const responseFormat = {
      type: 'json_schema',
      json_schema: { name: schema.name, strict: true, schema: schema.schema },
    };
    const feature = opts?.feature ?? 'structured';
    let lastErr: unknown;
    for (const slug of this.tierChains[opts?.tier ?? 'standard']) {
      const { signal, clear } = this.timeout();
      try {
        const data = await this.callOpenRouter(
          {
            model: slug,
            temperature: 0.2,
            stream: false,
            response_format: responseFormat,
            usage: { include: true },
            messages: [
              { role: 'system', content: systemText },
              { role: 'user', content: userText },
            ],
          },
          signal,
        );
        this.logUsage(feature, slug, data.usage);
        const text = data.choices?.[0]?.message?.content ?? '';
        const parsed = this.extractJson(text);
        if (parsed !== null) return parsed as T;
        throw new Error('response was not valid JSON');
      } catch (err) {
        lastErr = err;
        this.logger.warn(`structured ${slug} failed: ${String(err)}`);
      } finally {
        clear();
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error('all structured models failed');
  }

  /**
   * (B4) Web-grounded generation via OpenRouter's `web` plugin. Single attempt
   * (web search costs money, so no fallback loop). Returns text + web citations.
   */
  async generateWeb(
    systemText: string,
    userText: string,
    opts?: LlmOpts,
  ): Promise<{ text: string; webSources: { url: string; title: string }[] }> {
    const slug = this.tierChains[opts?.tier ?? 'reasoning'][0];
    const { signal, clear } = this.timeout();
    try {
      const data = await this.callOpenRouter(
        {
          model: slug,
          temperature: 0.2,
          stream: false,
          plugins: [{ id: 'web', max_results: 3 }],
          usage: { include: true },
          messages: [
            { role: 'system', content: systemText },
            { role: 'user', content: userText },
          ],
        },
        signal,
      );
      this.logUsage(opts?.feature ?? 'web', slug, data.usage);
      const msg = data.choices?.[0]?.message;
      const text = msg?.content ?? '';
      const webSources = (msg?.annotations ?? [])
        .filter((a) => a.type === 'url_citation' && a.url_citation)
        .map((a) => ({
          url: a.url_citation!.url,
          title: a.url_citation!.title || a.url_citation!.url,
        }));
      return { text, webSources };
    } finally {
      clear();
    }
  }

  // ── internals ──────────────────────────────────────────────

  private async callOpenRouter(
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<{
    choices?: {
      message?: {
        content?: string;
        annotations?: {
          type?: string;
          url_citation?: { url: string; title?: string };
        }[];
      };
    }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
    };
  }> {
    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...this.attrHeaders,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    return res.json() as Promise<
      Awaited<ReturnType<typeof this.callOpenRouter>>
    >;
  }

  private logUsage(
    feature: string,
    model: string,
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
    },
  ): void {
    this.usage.record({
      feature,
      model,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      cost: usage?.cost ?? 0,
    });
  }

  private timeout(): { signal: AbortSignal; clear: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
  }

  /** Best-effort JSON extraction: strip code fences, take the outermost {…}. */
  private extractJson(text: string): unknown {
    const cleaned = text.replace(/```(?:json)?/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }

  /**
   * Try each model in the tier chain with an abortable timeout; manual fallback.
   * Only falls over if NO token has been emitted yet. Records token usage.
   */
  private async *streamMessages(
    messages: BaseMessage[],
    opts?: LlmOpts,
  ): AsyncIterable<string> {
    const feature = opts?.feature ?? 'misc';
    const chain = this.tierChains[opts?.tier ?? 'standard'];
    let lastErr: unknown;
    for (const slug of chain) {
      const model = this.modelBySlug.get(slug);
      if (!model) continue;
      const { signal, clear } = this.timeout();
      let yielded = 0;
      let inTok = 0;
      let outTok = 0;
      try {
        const stream = await model.stream(messages, { signal });
        for await (const chunk of stream) {
          const text = typeof chunk.content === 'string' ? chunk.content : '';
          if (text) {
            yielded++;
            yield text;
          }
          const u = chunk.usage_metadata;
          if (u) {
            inTok = u.input_tokens ?? inTok;
            outTok = u.output_tokens ?? outTok;
          }
        }
        this.usage.record({
          feature,
          model: slug,
          inputTokens: inTok,
          outputTokens: outTok,
          cost: 0,
        });
        return;
      } catch (err) {
        lastErr = err;
        this.logger.warn(`model ${slug} failed: ${String(err)}`);
        if (yielded > 0) throw err;
      } finally {
        clear();
      }
    }
    if (lastErr instanceof Error) throw lastErr;
    throw new Error(
      typeof lastErr === 'string' ? lastErr : 'All LLM models failed',
    );
  }
}
