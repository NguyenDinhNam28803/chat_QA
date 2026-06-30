import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
}

/**
 * Stable, provider-fixed embedding layer (bge-m3 via Ollama).
 *
 * Deliberately NOT routed through OpenRouter: embeddings run for every chunk on
 * ingest (thousands/day) and the dimension is baked into the DB schema
 * (vector(1024)). Keeping this layer fixed means we never have to re-embed the
 * whole DB because a generation model changed.
 */
@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly dim: number;

  constructor(config: ConfigService, @Optional() baseUrlOverride?: string) {
    // baseUrlOverride lets us run a second instance against a dedicated Ollama
    // (e.g. ollama-ingest on 11435) without duplicating this class.
    this.baseUrl = (
      baseUrlOverride ??
      config.get<string>('EMBEDDING_BASE_URL', 'http://localhost:11434')
    ).replace(/\/$/, '');
    this.model = config.get<string>('EMBEDDING_MODEL', 'bge-m3');
    this.dim = Number(config.get<string>('EMBEDDING_DIM', '1024'));
  }

  onModuleInit(): void {
    this.logger.log(
      `Embedding via ${this.model} @ ${this.baseUrl} (dim=${this.dim})`,
    );
  }

  /** Embed a single piece of text. */
  async embed(text: string): Promise<number[]> {
    const [vector] = await this.embedBatch([text]);
    return vector;
  }

  /** Embed many texts in one call (used by ingestion). */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Embedding request failed (${res.status} ${res.statusText}): ${body}`,
      );
    }

    const data = (await res.json()) as OllamaEmbedResponse;
    const embeddings = data.embeddings;

    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
      throw new Error(
        `Embedding response shape mismatch: expected ${texts.length} vectors, got ${embeddings?.length}`,
      );
    }

    for (const vector of embeddings) {
      if (vector.length !== this.dim) {
        // Hard fail: a wrong dimension silently corrupts the vector column.
        throw new Error(
          `Embedding dimension mismatch: model returned ${vector.length}, schema expects ${this.dim}. ` +
            `Check EMBEDDING_MODEL / EMBEDDING_DIM and the vector(N) column in schema.prisma.`,
        );
      }
    }

    return embeddings;
  }
}
