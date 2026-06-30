import { Injectable, Logger, Inject } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { EMBEDDING_INGEST } from '../embedding/embedding.module';
import { ChunkService } from './chunk.service';
import { ContentExtractorService } from './content-extractor.service';
import { RssService, RawFeedItem } from './rss.service';
import { FeedSource } from './feeds.config';

const toVectorLiteral = (v: number[]) => `[${v.join(',')}]`;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Use the ingestion-dedicated Ollama (11435), NOT the chat instance.
    @Inject(EMBEDDING_INGEST) private readonly embedding: EmbeddingService,
    private readonly chunker: ChunkService,
    private readonly extractor: ContentExtractorService,
    private readonly rss: RssService,
  ) {}

  async ingestFeed(feed: FeedSource): Promise<{ processed: number; skipped: number }> {
    const items = await this.rss.fetchFeed(feed);
    let processed = 0;
    let skipped = 0;
    for (const item of items) {
      const r = await this.ingestArticle(item).catch((e) => {
        this.logger.warn(`article failed ${item.url}: ${String(e)}`);
        return 'skipped' as const;
      });
      if (r === 'inserted') processed++;
      else skipped++;
    }
    this.logger.log(`Feed ${feed.id}: processed=${processed} skipped=${skipped}`);
    return { processed, skipped };
  }

  async ingestArticle(item: RawFeedItem): Promise<'inserted' | 'skipped'> {
    if (await this.prisma.article.findUnique({ where: { url: item.url } })) {
      return 'skipped';
    }
    const content = await this.extractor.extract(item.url, item.summaryHtml);
    if (!content) return 'skipped';
    const contentHash = createHash('sha256').update(content).digest('hex');
    if (await this.prisma.article.findUnique({ where: { contentHash } })) {
      return 'skipped';
    }
    const chunks = this.chunker.chunk(content);
    if (chunks.length === 0) return 'skipped';
    const vectors = await this.embedding.embedBatch(chunks.map((c) => c.content));

    await this.prisma.$transaction(async (tx) => {
      const article = await tx.article.create({
        data: {
          url: item.url,
          title: item.title,
          source: item.source,
          publishedAt: item.publishedAt ?? undefined,
          content,
          contentHash,
        },
      });
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        await tx.$executeRaw`
          INSERT INTO "Chunk" ("id","articleId","ord","content","tokenCount","embedding","createdAt")
          VALUES (${createId()}, ${article.id}, ${c.ord}, ${c.content}, ${c.tokenCount},
                  ${toVectorLiteral(vectors[i])}::vector, now())`;
      }
    });
    return 'inserted';
  }
}
