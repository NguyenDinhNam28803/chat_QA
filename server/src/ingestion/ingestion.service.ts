import { Injectable, Logger, Inject } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { EMBEDDING_INGEST } from '../embedding/embedding.module';
import { ChunkService } from './chunk.service';
import {
  titleBodyScore,
  cosineSimilarity,
  parseVectorLiteral,
} from '../embedding/vector.util';
import { ContentExtractorService } from './content-extractor.service';
import { RssService, RawFeedItem } from './rss.service';
import { FeedSource } from './feeds.config';
import { classifyTopic } from './topic.classifier';

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

  async ingestFeed(
    feed: FeedSource,
  ): Promise<{ processed: number; skipped: number }> {
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
    this.logger.log(
      `Feed ${feed.id}: processed=${processed} skipped=${skipped}`,
    );
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
    // Embed the title alongside the body chunks in one call (F2): the first
    // vector is the title, the rest are the body. titleBodyScore = how well the
    // headline reflects the article — low means possible clickbait.
    const embedded = await this.embedding.embedBatch([
      item.title,
      ...chunks.map((c) => c.content),
    ]);
    const titleVec = embedded[0];
    const vectors = embedded.slice(1);
    const score = titleBodyScore(titleVec, vectors);

    await this.prisma.$transaction(async (tx) => {
      const article = await tx.article.create({
        data: {
          url: item.url,
          title: item.title,
          source: item.source,
          publishedAt: item.publishedAt ?? undefined,
          content,
          contentHash,
          topic: classifyTopic(item.title, content),
          titleBodyScore: score,
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

  /**
   * One-off F2 backfill: compute titleBodyScore for articles ingested before the
   * feature existed. Re-embeds each title (body centroid is read from the stored
   * chunk embeddings via pgvector avg). Idempotent — only touches rows where the
   * score is still null.
   */
  async backfillClickbait(): Promise<{ updated: number; skipped: number }> {
    const rows = await this.prisma.article.findMany({
      where: { titleBodyScore: null },
      select: { id: true, title: true },
    });
    let updated = 0;
    let skipped = 0;
    const BATCH = 32;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const titleVecs = await this.embedding.embedBatch(
        batch.map((r) => r.title),
      );
      for (let j = 0; j < batch.length; j++) {
        const centroidRows = await this.prisma.$queryRaw<
          { centroid: string | null }[]
        >`SELECT avg("embedding")::text AS centroid
            FROM "Chunk" WHERE "articleId" = ${batch[j].id}`;
        const literal = centroidRows[0]?.centroid;
        if (!literal) {
          skipped++; // article has no chunks — nothing to compare against
          continue;
        }
        const bodyVec = parseVectorLiteral(literal);
        const score = Math.min(
          1,
          Math.max(0, cosineSimilarity(titleVecs[j], bodyVec)),
        );
        await this.prisma.article.update({
          where: { id: batch[j].id },
          data: { titleBodyScore: score },
        });
        updated++;
      }
    }
    this.logger.log(`Clickbait backfill: updated=${updated} skipped=${skipped}`);
    return { updated, skipped };
  }
}
