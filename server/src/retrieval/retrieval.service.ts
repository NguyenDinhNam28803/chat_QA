import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { buildContext } from './context.builder';
import { RetrievedChunk, RetrievalResult } from './retrieval.types';

// How many candidates each retriever contributes before fusion.
const POOL = 20;
// Reciprocal Rank Fusion constant (standard default).
const RRF_K = 60;

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  /**
   * Hybrid retrieval:
   *  - vector search (semantic, pgvector `<=>`)
   *  - full-text search (lexical, tsvector — catches exact names/numbers)
   *  - fused with Reciprocal Rank Fusion, then a small recency boost so fresher
   *    news outranks equally-relevant older news.
   */
  async search(
    question: string,
    k = 5,
    topic?: string,
  ): Promise<RetrievalResult> {
    const vec = await this.embedding.embed(question);
    const literal = `[${vec.join(',')}]`;
    // Optional domain filter (Phase 11): restrict candidates to one topic.
    const topicFilter = topic
      ? Prisma.sql`AND a."topic" = ${topic}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RetrievedChunk[]>(Prisma.sql`
      WITH vec AS (
        SELECT c."id",
               ROW_NUMBER() OVER (ORDER BY c."embedding" <=> ${literal}::vector) AS rank
        FROM "Chunk" c
        JOIN "Article" a ON a."id" = c."articleId"
        WHERE c."embedding" IS NOT NULL ${topicFilter}
        ORDER BY c."embedding" <=> ${literal}::vector
        LIMIT ${POOL}
      ),
      fts AS (
        SELECT c."id",
               ROW_NUMBER() OVER (ORDER BY ts_rank(c."contentTsv", q.query) DESC) AS rank
        FROM "Chunk" c
        JOIN "Article" a ON a."id" = c."articleId",
             plainto_tsquery('simple', ${question}) AS q(query)
        WHERE c."contentTsv" @@ q.query ${topicFilter}
        ORDER BY ts_rank(c."contentTsv", q.query) DESC
        LIMIT ${POOL}
      ),
      fused AS (
        SELECT COALESCE(v."id", f."id") AS id,
               COALESCE(1.0 / (${RRF_K} + v.rank), 0)
             + COALESCE(1.0 / (${RRF_K} + f.rank), 0) AS rrf
        FROM vec v
        FULL OUTER JOIN fts f ON v."id" = f."id"
      )
      SELECT c."content",
             a."id"     AS "articleId",
             a."url",
             a."title",
             a."source",
             (c."embedding" <=> ${literal}::vector) AS "distance"
      FROM fused
      JOIN "Chunk" c   ON c."id" = fused.id
      JOIN "Article" a ON a."id" = c."articleId"
      ORDER BY
        -- Relevance (RRF) dominates; recency is a small tie-breaker nudge so a
        -- fresher article wins only among similarly-relevant ones.
        fused.rrf
        + CASE
            WHEN a."publishedAt" IS NOT NULL
            THEN 0.005 * exp(-EXTRACT(EPOCH FROM (now() - a."publishedAt")) / (7 * 86400.0))
            ELSE 0
          END DESC
      LIMIT ${k}
    `);
    return buildContext(rows);
  }
}
