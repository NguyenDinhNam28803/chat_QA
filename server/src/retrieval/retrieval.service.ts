import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { buildContext } from './context.builder';
import { RetrievedChunk, RetrievalResult } from './retrieval.types';

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  async search(question: string, k = 5): Promise<RetrievalResult> {
    const vec = await this.embedding.embed(question);
    const literal = `[${vec.join(',')}]`;
    const rows = await this.prisma.$queryRaw<RetrievedChunk[]>(Prisma.sql`
      SELECT c."content",
             a."id"     AS "articleId",
             a."url",
             a."title",
             a."source",
             (c."embedding" <=> ${literal}::vector) AS "distance"
      FROM "Chunk" c
      JOIN "Article" a ON a."id" = c."articleId"
      WHERE c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${literal}::vector
      LIMIT ${k}
    `);
    return buildContext(rows);
  }
}
