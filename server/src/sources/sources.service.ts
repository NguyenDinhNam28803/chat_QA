import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TOPIC_LABELS, type Topic } from '../ingestion/topic.classifier';

export interface SourceRow {
  source: string;
  articleCount: number;
  firstCount: number; // times this outlet broke a multi-source story first
  multiCount: number; // multi-source events it took part in
  exclusiveCount: number; // single-source events (scoops / blind spots)
}

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService) {}

  /** (P1) Per-outlet intelligence: volume, speed (first-to-report), exclusives. */
  async listSources(): Promise<(SourceRow & { firstRate: number })[]> {
    const [counts, firsts, multi, excl] = await Promise.all([
      this.prisma.$queryRaw<{ source: string; c: number }[]>`
        SELECT source, count(*)::int AS c FROM "Article" GROUP BY source
      `,
      // Earliest-published article per multi-source event = who broke it first.
      this.prisma.$queryRaw<{ source: string; fc: number }[]>`
        WITH firsts AS (
          SELECT DISTINCT ON (e.id) e.id, a.source
          FROM "Event" e
          JOIN "Article" a ON a."eventId" = e.id
          WHERE e."sourceCount" >= 2 AND a."publishedAt" IS NOT NULL
          ORDER BY e.id, a."publishedAt" ASC
        )
        SELECT source, count(*)::int AS fc FROM firsts GROUP BY source
      `,
      this.prisma.$queryRaw<{ source: string; mc: number }[]>`
        SELECT a.source, count(DISTINCT e.id)::int AS mc
        FROM "Event" e JOIN "Article" a ON a."eventId" = e.id
        WHERE e."sourceCount" >= 2 GROUP BY a.source
      `,
      this.prisma.$queryRaw<{ source: string; ec: number }[]>`
        SELECT a.source, count(DISTINCT e.id)::int AS ec
        FROM "Event" e JOIN "Article" a ON a."eventId" = e.id
        WHERE e."sourceCount" = 1 GROUP BY a.source
      `,
    ]);

    const fMap = new Map(firsts.map((r) => [r.source, r.fc]));
    const mMap = new Map(multi.map((r) => [r.source, r.mc]));
    const eMap = new Map(excl.map((r) => [r.source, r.ec]));

    return counts
      .map((r) => {
        const firstCount = fMap.get(r.source) ?? 0;
        const multiCount = mMap.get(r.source) ?? 0;
        return {
          source: r.source,
          articleCount: r.c,
          firstCount,
          multiCount,
          exclusiveCount: eMap.get(r.source) ?? 0,
          firstRate: multiCount
            ? Math.round((firstCount / multiCount) * 100)
            : 0,
        };
      })
      .sort((a, b) => b.articleCount - a.articleCount);
  }

  /** (P1) One outlet's profile: topic mix, speed, exclusives, recent articles. */
  async getSource(name: string) {
    const [byTopicRaw, agg, recent] = await Promise.all([
      this.prisma.$queryRaw<{ topic: string | null; c: number }[]>`
        SELECT topic, count(*)::int AS c FROM "Article"
        WHERE source = ${name} GROUP BY topic ORDER BY c DESC
      `,
      this.prisma.$queryRaw<
        { articles: number; first: number; multi: number; excl: number }[]
      >`
        SELECT
          (SELECT count(*)::int FROM "Article" WHERE source = ${name}) AS articles,
          (SELECT count(*)::int FROM (
             SELECT DISTINCT ON (e.id) e.id, a.source
             FROM "Event" e JOIN "Article" a ON a."eventId" = e.id
             WHERE e."sourceCount" >= 2 AND a."publishedAt" IS NOT NULL
             ORDER BY e.id, a."publishedAt" ASC
           ) f WHERE f.source = ${name}) AS first,
          (SELECT count(DISTINCT e.id)::int FROM "Event" e
             JOIN "Article" a ON a."eventId" = e.id
             WHERE e."sourceCount" >= 2 AND a.source = ${name}) AS multi,
          (SELECT count(DISTINCT e.id)::int FROM "Event" e
             JOIN "Article" a ON a."eventId" = e.id
             WHERE e."sourceCount" = 1 AND a.source = ${name}) AS excl
      `,
      this.prisma.article.findMany({
        where: { source: name },
        orderBy: { publishedAt: 'desc' },
        take: 12,
        select: { id: true, title: true, topic: true, publishedAt: true },
      }),
    ]);

    const a = agg[0] ?? { articles: 0, first: 0, multi: 0, excl: 0 };
    return {
      source: name,
      articleCount: a.articles,
      firstCount: a.first,
      multiCount: a.multi,
      exclusiveCount: a.excl,
      firstRate: a.multi ? Math.round((a.first / a.multi) * 100) : 0,
      byTopic: byTopicRaw.map((t) => ({
        topic: t.topic,
        label: TOPIC_LABELS[(t.topic ?? 'khac') as Topic] ?? 'Khác',
        count: t.c,
      })),
      recent,
    };
  }
}
