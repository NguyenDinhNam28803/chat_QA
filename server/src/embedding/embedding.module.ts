import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';

/** Injection token for the ingestion-dedicated embedding instance (ollama-ingest). */
export const EMBEDDING_INGEST = 'EMBEDDING_INGEST';

@Module({
  providers: [
    // Default instance -> chat/retrieval Ollama (EMBEDDING_BASE_URL, 11434).
    EmbeddingService,
    // Second instance -> ingestion Ollama (EMBEDDING_INGEST_BASE_URL, 11435),
    // so background nạp never competes with chat embeds.
    {
      provide: EMBEDDING_INGEST,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new EmbeddingService(
          config,
          config.get<string>(
            'EMBEDDING_INGEST_BASE_URL',
            'http://localhost:11435',
          ),
        ),
    },
  ],
  exports: [EmbeddingService, EMBEDDING_INGEST],
})
export class EmbeddingModule {}
