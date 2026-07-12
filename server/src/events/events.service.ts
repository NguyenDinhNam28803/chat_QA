import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { eventAnalysisPrompt } from '../llm/features.prompts';
import { risingMetrics } from './rising.util';

// Cosine similarity threshold for grouping two articles into the same event.
const SIM_THRESHOLD = 0.72;
// Only cluster recent articles (a story is a burst across a few days).
const WINDOW_DAYS = 4;
const MAX_ARTICLES = 600;

interface Rep {
  id: string;
  title: string;
  source: string;
  topic: string | null;
  publishedAt: Date | null;
  vec: number[];
  norm: number;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /** Batch: group recent cross-source articles into events (offline, no LLM). */
  async cluster(): Promise<{ events: number; articles: number }> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        source: string;
        topic: string | null;
        publishedAt: Date | null;
        emb: string;
      }[]
    >`
      SELECT a."id", a."title", a."source", a."topic", a."publishedAt",
             c."embedding"::text AS emb
      FROM "Article" a
      JOIN "Chunk" c ON c."articleId" = a."id" AND c."ord" = 0
      WHERE a."publishedAt" > now() - (${WINDOW_DAYS} || ' days')::interval
      ORDER BY a."publishedAt" DESC
      LIMIT ${MAX_ARTICLES}
    `;

    const arts: Rep[] = rows.map((r) => {
      const vec = JSON.parse(r.emb) as number[];
      let s = 0;
      for (const x of vec) s += x * x;
      return { ...r, vec, norm: Math.sqrt(s) || 1 };
    });

    const n = arts.length;
    const assigned = new Array<boolean>(n).fill(false);
    const clusters: number[][] = [];
    for (let i = 0; i < n; i++) {
      if (assigned[i]) continue;
      const cluster = [i];
      assigned[i] = true;
      for (let j = i + 1; j < n; j++) {
        if (assigned[j]) continue;
        if (this.cosine(arts[i], arts[j]) >= SIM_THRESHOLD) {
          cluster.push(j);
          assigned[j] = true;
        }
      }
      clusters.push(cluster);
    }

    const articleIds = arts.map((a) => a.id);
    await this.prisma.$transaction(async (tx) => {
      // Detach these articles from any previous events.
      await tx.article.updateMany({
        where: { id: { in: articleIds } },
        data: { eventId: null },
      });
      for (const cl of clusters) {
        const members = cl.map((idx) => arts[idx]);
        const sources = new Set(members.map((m) => m.source));
        const times = members
          .map((m) => m.publishedAt)
          .filter((d): d is Date => !!d)
          .map((d) => new Date(d).getTime());
        const first = times.length ? new Date(Math.min(...times)) : null;
        const last = times.length ? new Date(Math.max(...times)) : null;
        const byRecent = [...members].sort(
          (a, b) =>
            (b.publishedAt ? new Date(b.publishedAt).getTime() : 0) -
            (a.publishedAt ? new Date(a.publishedAt).getTime() : 0),
        );
        const recencyH =
          last && Number.isFinite(last.getTime())
            ? (Date.now() - last.getTime()) / 3_600_000
            : 999;
        const recencyBonus = Number.isFinite(recencyH)
          ? Math.max(0, 48 - recencyH) / 12
          : 0;
        let hotness = sources.size * 3 + members.length + recencyBonus;
        if (!Number.isFinite(hotness)) {
          hotness = sources.size * 3 + members.length;
        }
        const ev = await tx.event.create({
          data: {
            title: byRecent[0].title,
            topic: this.mode(members.map((m) => m.topic)),
            articleCount: members.length,
            sourceCount: sources.size,
            firstSeen: first,
            lastSeen: last,
            hotness,
          },
        });
        await tx.article.updateMany({
          where: { id: { in: members.map((m) => m.id) } },
          data: { eventId: ev.id },
        });
      }
      // Remove events that no longer have any articles.
      await tx.$executeRaw`
        DELETE FROM "Event" e
        WHERE NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."eventId" = e."id")
      `;
    });

    this.logger.log(`Clustered ${n} articles into ${clusters.length} events`);
    return { events: clusters.length, articles: n };
  }

  /** Hot multi-source events for the homepage (optionally within a period). */
  async listEvents(limit = 24, from?: Date) {
    const events = await this.prisma.event.findMany({
      where: {
        sourceCount: { gte: 2 },
        ...(from ? { lastSeen: { gte: from } } : {}),
      },
      orderBy: [{ hotness: 'desc' }, { lastSeen: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        topic: true,
        articleCount: true,
        sourceCount: true,
        firstSeen: true,
        lastSeen: true,
        articles: {
          select: { source: true, publishedAt: true },
          orderBy: { publishedAt: 'asc' },
        },
      },
    });
    // Reference = the freshest activity in this batch. Using it (instead of
    // wall-clock now()) keeps "developing" meaningful even when the corpus is a
    // day or two stale between ingestion runs.
    const ref = events.reduce(
      (mx, e) => Math.max(mx, e.lastSeen ? e.lastSeen.getTime() : 0),
      0,
    );
    return events.map(({ articles, ...e }) => ({
      ...e,
      // Distinct source names (for stacked source badges).
      sources: Array.from(new Set(articles.map((a) => a.source))),
      // Publish timestamps (for the article-rhythm sparkline).
      times: articles
        .map((a) => a.publishedAt)
        .filter((d): d is Date => !!d)
        .map((d) => d.toISOString()),
      // (B2) Story still unfolding: fresh coverage + spread over time.
      developing: this.isDeveloping(
        e.firstSeen,
        e.lastSeen,
        e.articleCount,
        ref,
      ),
    }));
  }

  /** (B2) A story is "developing" if it got fresh coverage (within 24h of the
   * newest activity) AND has run across several articles over time — not a
   * one-shot report. */
  private isDeveloping(
    firstSeen: Date | null,
    lastSeen: Date | null,
    articleCount: number,
    ref: number,
  ): boolean {
    if (!firstSeen || !lastSeen || ref === 0) return false;
    const recentH = (ref - lastSeen.getTime()) / 3_600_000;
    const spanH = (lastSeen.getTime() - firstSeen.getTime()) / 3_600_000;
    return recentH <= 24 && spanH >= 6 && articleCount >= 3;
  }

  /** (P2) Blind spots / scoops: stories only ONE source has reported. */
  async listBlindspots(limit = 30) {
    const events = await this.prisma.event.findMany({
      where: { sourceCount: 1 },
      orderBy: { lastSeen: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        topic: true,
        articleCount: true,
        lastSeen: true,
        articles: { select: { source: true }, take: 1 },
      },
    });
    return events.map(({ articles, ...e }) => ({
      ...e,
      source: articles[0]?.source ?? '',
    }));
  }

  /** (B2) Developing stories only, most recently active first. */
  async listDeveloping(limit = 8) {
    const all = await this.listEvents(60);
    return all
      .filter((e) => e.developing)
      .sort(
        (a, b) =>
          (b.lastSeen ? b.lastSeen.getTime() : 0) -
          (a.lastSeen ? a.lastSeen.getTime() : 0),
      )
      .slice(0, limit);
  }

  /**
   * (F5) Events heating up: coverage accelerating in the most recent window vs
   * the window before it. Velocity is computed live from article publish times
   * (no stored time-series — events are rebuilt each cluster run, so ids aren't
   * stable). Returns only accelerating, multi-source stories, hottest first.
   */
  async listRising(limit = 8, windowHours = 12) {
    const windowMs = Math.max(1, windowHours) * 3_600_000;
    const events = await this.prisma.event.findMany({
      where: { sourceCount: { gte: 2 } },
      orderBy: { lastSeen: 'desc' },
      take: 120,
      select: {
        id: true,
        title: true,
        topic: true,
        articleCount: true,
        sourceCount: true,
        firstSeen: true,
        lastSeen: true,
        articles: {
          select: { source: true, publishedAt: true },
          orderBy: { publishedAt: 'asc' },
        },
      },
    });
    // Reference = freshest activity across the batch (robust to a stale corpus).
    const ref = events.reduce(
      (mx, e) => Math.max(mx, e.lastSeen ? e.lastSeen.getTime() : 0),
      0,
    );
    if (ref === 0) return [];

    const scored = events
      .map(({ articles, ...e }) => {
        const withTime = articles.filter((a) => a.publishedAt);
        const times = withTime.map((a) =>
          new Date(a.publishedAt as Date).getTime(),
        );
        const m = risingMetrics(times, ref, windowMs);
        // Distinct sources contributing in the recent window (breadth of pickup).
        const recentSources = new Set(
          withTime
            .filter((a) => {
              const age = ref - new Date(a.publishedAt as Date).getTime();
              return age >= 0 && age < windowMs;
            })
            .map((a) => a.source),
        ).size;
        return {
          ...e,
          sources: Array.from(new Set(articles.map((a) => a.source))),
          times: times.map((t) => new Date(t).toISOString()),
          recentArticles: m.recent,
          priorArticles: m.prior,
          recentSources,
          velocity: m.velocity,
          windowHours,
        };
      })
      // Accelerating (more now than before) with a real recent burst.
      .filter((e) => e.velocity > 0 && e.recentArticles >= 2)
      .sort(
        (a, b) => b.velocity - a.velocity || b.recentSources - a.recentSources,
      );

    return scored.slice(0, limit);
  }

  /** Event detail: articles across sources + cached consensus/conflict analysis. */
  async getEvent(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) return null;
    const articles = await this.prisma.article.findMany({
      where: { eventId: id },
      orderBy: { publishedAt: 'asc' },
      select: {
        id: true,
        title: true,
        source: true,
        url: true,
        publishedAt: true,
        content: true,
      },
    });

    let summary = event.summary;
    if (!summary && event.sourceCount >= 2 && articles.length > 0) {
      const block = articles
        .map((a) => `- [${a.source}] ${a.title}: ${a.content.slice(0, 220)}`)
        .join('\n');
      try {
        const { system, user } = eventAnalysisPrompt(event.title, block);
        summary = (
          await this.llm.generate(system, user, {
            feature: 'event',
            tier: 'reasoning',
          })
        ).trim();
        await this.prisma.event.update({ where: { id }, data: { summary } });
      } catch {
        /* analysis optional */
      }
    }

    return {
      event: { ...event, summary },
      articles: articles.map((a) => ({
        id: a.id,
        title: a.title,
        source: a.source,
        url: a.url,
        publishedAt: a.publishedAt,
      })),
    };
  }

  private cosine(a: Rep, b: Rep): number {
    let dot = 0;
    const va = a.vec;
    const vb = b.vec;
    for (let k = 0; k < va.length; k++) dot += va[k] * vb[k];
    return dot / (a.norm * b.norm);
  }

  private mode(vals: (string | null)[]): string | null {
    const freq = new Map<string, number>();
    for (const v of vals) if (v) freq.set(v, (freq.get(v) ?? 0) + 1);
    let best: string | null = null;
    let bestC = 0;
    for (const [k, c] of freq) if (c > bestC) [best, bestC] = [k, c];
    return best;
  }
}
