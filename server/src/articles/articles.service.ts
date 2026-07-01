import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TOPIC_LABELS, type Topic } from '../ingestion/topic.classifier';

const PAGE_SIZE = 20;

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Topics with article counts, for filter chips. */
  async listTopics(): Promise<
    { topic: string; label: string; count: number }[]
  > {
    const rows = await this.prisma.$queryRaw<
      { topic: string | null; count: number }[]
    >`
      SELECT "topic", count(*)::int AS count
      FROM "Article"
      WHERE "topic" IS NOT NULL
      GROUP BY "topic"
      ORDER BY count DESC
    `;
    return rows.map((r) => ({
      topic: r.topic ?? 'khac',
      label: TOPIC_LABELS[(r.topic ?? 'khac') as Topic] ?? 'Khác',
      count: Number(r.count),
    }));
  }

  /** Paginated list + optional full-text search + optional topic filter. */
  async search(
    q?: string,
    topic?: string,
    page = 1,
  ): Promise<{
    items: {
      id: string;
      title: string;
      source: string;
      topic: string | null;
      publishedAt: Date | null;
      url: string;
      snippet: string;
    }[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const conds: Prisma.Sql[] = [];
    if (topic) conds.push(Prisma.sql`"topic" = ${topic}`);
    if (q?.trim()) {
      conds.push(Prisma.sql`"contentTsv" @@ plainto_tsquery('simple', ${q})`);
    }
    const where = conds.length
      ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
      : Prisma.empty;
    const offset = (Math.max(1, page) - 1) * PAGE_SIZE;

    const items = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        source: string;
        topic: string | null;
        publishedAt: Date | null;
        url: string;
        snippet: string;
      }[]
    >(Prisma.sql`
      SELECT "id", "title", "source", "topic", "publishedAt", "url",
             left("content", 240) AS "snippet"
      FROM "Article"
      ${where}
      ORDER BY "publishedAt" DESC NULLS LAST
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `);

    const totalRows = await this.prisma.$queryRaw<
      { count: number }[]
    >(Prisma.sql`
      SELECT count(*)::int AS count FROM "Article" ${where}
    `);

    return {
      items,
      total: Number(totalRows[0]?.count ?? 0),
      page: Math.max(1, page),
      pageSize: PAGE_SIZE,
    };
  }

  /** Full article by id. */
  getById(id: string) {
    return this.prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        title: true,
        source: true,
        topic: true,
        publishedAt: true,
        content: true,
      },
    });
  }

  /** Dashboard stats: totals, per-topic counts, latest articles. */
  async stats(): Promise<{
    totalArticles: number;
    totalChunks: number;
    byTopic: { topic: string; label: string; count: number }[];
    latest: {
      id: string;
      title: string;
      topic: string | null;
      publishedAt: Date | null;
    }[];
  }> {
    const [{ a }] = await this.prisma.$queryRaw<{ a: number }[]>`
      SELECT count(*)::int AS a FROM "Article"
    `;
    const [{ c }] = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT count(*)::int AS c FROM "Chunk"
    `;
    const byTopic = await this.listTopics();
    const latest = await this.prisma.article.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 6,
      select: { id: true, title: true, topic: true, publishedAt: true },
    });
    return {
      totalArticles: Number(a),
      totalChunks: Number(c),
      byTopic,
      latest,
    };
  }

  /** Related articles: same topic, most recent, excluding the given one. */
  async related(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      select: { topic: true },
    });
    if (!article) return [];
    return this.prisma.article.findMany({
      where: { topic: article.topic, id: { not: id } },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, source: true, publishedAt: true },
    });
  }
}
