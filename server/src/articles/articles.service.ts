import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import {
  summarizeArticlePrompt,
  dailyBriefPrompt,
  compareSourcesPrompt,
  timelineNarrativePrompt,
  suggestQuestionsPrompt,
} from '../llm/features.prompts';
import { TOPIC_LABELS, type Topic } from '../ingestion/topic.classifier';

const PAGE_SIZE = 20;

// Vietnamese function words to drop from trending-keyword counts.
const STOPWORDS = new Set(
  'và của có được cho các một những người trong khi ra vào lên xuống với là không này đó khi đã sẽ về từ đến theo trên dưới sau trước cùng như để bị bởi tại nếu thì mà hay hoặc còn nên vẫn cũng rất quá nhất tin bài mới nhất'.split(
    ' ',
  ),
);

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  // F2: articles whose title↔body score sits at/below this percentile of the
  // corpus are flagged as possible clickbait. Relative (self-calibrating), not
  // an absolute accusation. Configurable via env.
  private readonly clickbaitPercentile = Math.min(
    1,
    Math.max(0, Number(process.env.CLICKBAIT_PERCENTILE ?? '0.15')),
  );

  /**
   * The titleBodyScore value at the configured low percentile. Articles at or
   * below it are flagged. Returns null when the corpus has no scored articles.
   */
  async clickbaitThreshold(): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ t: number | null }[]>(
      Prisma.sql`
        SELECT percentile_cont(${this.clickbaitPercentile})
                 WITHIN GROUP (ORDER BY "titleBodyScore") AS t
        FROM "Article" WHERE "titleBodyScore" IS NOT NULL`,
    );
    return rows[0]?.t ?? null;
  }

  /** True when a score is at/below the flag threshold (threshold null -> false). */
  private isClickbait(score: number | null, threshold: number | null): boolean {
    return score !== null && threshold !== null && score <= threshold;
  }

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
      titleBodyScore: number | null;
      clickbaitFlag: boolean;
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

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        source: string;
        topic: string | null;
        publishedAt: Date | null;
        url: string;
        snippet: string;
        titleBodyScore: number | null;
      }[]
    >(Prisma.sql`
      SELECT "id", "title", "source", "topic", "publishedAt", "url",
             left("content", 240) AS "snippet", "titleBodyScore"
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

    const threshold = await this.clickbaitThreshold();
    const items = rows.map((r) => ({
      ...r,
      clickbaitFlag: this.isClickbait(r.titleBodyScore, threshold),
    }));

    return {
      items,
      total: Number(totalRows[0]?.count ?? 0),
      page: Math.max(1, page),
      pageSize: PAGE_SIZE,
    };
  }

  /** Full article by id, with the F2 title↔body score + clickbait flag. */
  async getById(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        title: true,
        source: true,
        topic: true,
        publishedAt: true,
        content: true,
        titleBodyScore: true,
      },
    });
    if (!article) return null;
    const threshold = await this.clickbaitThreshold();
    return {
      ...article,
      clickbaitFlag: this.isClickbait(article.titleBodyScore, threshold),
    };
  }

  /**
   * F2 ranking: articles most likely to be clickbait (lowest title↔body score
   * first), skipping ones not yet scored. Returns the current flag threshold and
   * percentile so the UI can explain the cut-off transparently.
   */
  async clickbaitRanking(page = 1): Promise<{
    items: {
      id: string;
      title: string;
      source: string;
      topic: string | null;
      publishedAt: Date | null;
      url: string;
      titleBodyScore: number | null;
      clickbaitFlag: boolean;
    }[];
    threshold: number | null;
    percentile: number;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const p = Math.max(1, page);
    const [rows, total, threshold] = await Promise.all([
      this.prisma.article.findMany({
        where: { titleBodyScore: { not: null } },
        orderBy: { titleBodyScore: 'asc' },
        take: PAGE_SIZE,
        skip: (p - 1) * PAGE_SIZE,
        select: {
          id: true,
          title: true,
          source: true,
          topic: true,
          publishedAt: true,
          url: true,
          titleBodyScore: true,
        },
      }),
      this.prisma.article.count({ where: { titleBodyScore: { not: null } } }),
      this.clickbaitThreshold(),
    ]);
    return {
      items: rows.map((r) => ({
        ...r,
        clickbaitFlag: this.isClickbait(r.titleBodyScore, threshold),
      })),
      threshold,
      percentile: this.clickbaitPercentile,
      total,
      page: p,
      pageSize: PAGE_SIZE,
    };
  }

  /** Dashboard stats: totals, per-topic counts, latest articles. */
  async stats(): Promise<{
    totalArticles: number;
    totalChunks: number;
    totalConversations: number;
    totalMessages: number;
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
    const [{ v }] = await this.prisma.$queryRaw<{ v: number }[]>`
      SELECT count(*)::int AS v FROM "Conversation"
    `;
    const [{ m }] = await this.prisma.$queryRaw<{ m: number }[]>`
      SELECT count(*)::int AS m FROM "Message"
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
      totalConversations: Number(v),
      totalMessages: Number(m),
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

  // ---- AI feature pillars ----

  /** Full-text article search (for timeline / compare). */
  private searchArticles(q: string, limit: number) {
    return this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        source: string;
        topic: string | null;
        publishedAt: Date | null;
        snippet: string;
      }[]
    >(Prisma.sql`
      SELECT "id", "title", "source", "topic", "publishedAt",
             left("content", 400) AS "snippet"
      FROM "Article"
      WHERE "contentTsv" @@ plainto_tsquery('simple', ${q})
      ORDER BY ts_rank("contentTsv", plainto_tsquery('simple', ${q})) DESC
      LIMIT ${limit}
    `);
  }

  /** Pillar 1a — per-article AI summary (cached in Article.summary). */
  async getSummary(
    id: string,
  ): Promise<{ summary: string; cached: boolean } | null> {
    const a = await this.prisma.article.findUnique({
      where: { id },
      select: { title: true, content: true, summary: true },
    });
    if (!a) return null;
    if (a.summary) return { summary: a.summary, cached: true };
    const { system, user } = summarizeArticlePrompt(a.title, a.content);
    const summary = (
      await this.llm.generate(system, user, {
        feature: 'summary',
        tier: 'standard',
      })
    ).trim();
    await this.prisma.article.update({ where: { id }, data: { summary } });
    return { summary, cached: false };
  }

  /** E3 — AI-suggested follow-up questions for an article (cached). */
  async suggestQuestions(id: string): Promise<{ questions: string[] }> {
    const a = await this.prisma.article.findUnique({
      where: { id },
      select: { title: true, content: true, questions: true },
    });
    if (!a) return { questions: [] };
    if (Array.isArray(a.questions)) {
      return { questions: a.questions as string[] };
    }
    let questions: string[] = [];
    try {
      const { system, user } = suggestQuestionsPrompt(a.title, a.content);
      const raw = await this.llm.generate(system, user, {
        feature: 'suggest',
        tier: 'nano',
      });
      questions = raw
        .split('\n')
        .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, '').trim())
        .filter((l) => l.length > 0)
        .slice(0, 3);
    } catch {
      return { questions: [] };
    }
    if (questions.length > 0) {
      await this.prisma.article.update({
        where: { id },
        data: { questions },
      });
    }
    return { questions };
  }

  /** Pillar 1b — daily brief (cached per calendar day). */
  async dailyBrief(): Promise<{
    date: string;
    content: string;
    cached: boolean;
  }> {
    const date = new Date().toISOString().slice(0, 10);
    const existing = await this.prisma.dailyBrief.findUnique({
      where: { date },
    });
    if (existing) return { date, content: existing.content, cached: true };

    const arts = await this.prisma.article.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 24,
      select: { title: true, source: true, topic: true },
    });
    const block = arts
      .map(
        (a) =>
          `- [${TOPIC_LABELS[(a.topic ?? 'khac') as Topic]}] ${a.title} (${a.source})`,
      )
      .join('\n');
    const { system, user } = dailyBriefPrompt(block);
    const content = (
      await this.llm.generate(system, user, {
        feature: 'brief',
        tier: 'standard',
      })
    ).trim();
    await this.prisma.dailyBrief.create({ data: { date, content } });
    return { date, content, cached: false };
  }

  /** Pillar 2a — chronological timeline of a topic/event + short narrative. */
  async timeline(q: string) {
    const arts = await this.searchArticles(q, 15);
    const items = [...arts].sort(
      (a, b) =>
        (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0),
    );
    let narrative = '';
    if (items.length > 0) {
      const block = items
        .map(
          (a) =>
            `- ${a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('vi-VN') : '?'}: ${a.title} (${a.source})`,
        )
        .join('\n');
      try {
        const { system, user } = timelineNarrativePrompt(q, block);
        narrative = (
          await this.llm.generate(system, user, {
            feature: 'timeline',
            tier: 'standard',
          })
        ).trim();
      } catch {
        /* narrative is optional */
      }
    }
    return { query: q, narrative, items };
  }

  /** Pillar 2b — compare how different outlets cover an event. */
  async compare(q: string) {
    const arts = await this.searchArticles(q, 12);
    const bySource = new Map<string, typeof arts>();
    for (const a of arts) {
      const arr = bySource.get(a.source) ?? [];
      if (arr.length < 2) {
        arr.push(a);
        bySource.set(a.source, arr);
      }
    }
    const groups = [...bySource.entries()].map(([source, items]) => ({
      source,
      items,
    }));
    let analysis = '';
    if (groups.length >= 2) {
      const block = groups
        .map(
          (g) =>
            `### ${g.source}\n` +
            g.items.map((a) => `- ${a.title}: ${a.snippet}`).join('\n'),
        )
        .join('\n\n');
      try {
        const { system, user } = compareSourcesPrompt(q, block);
        analysis = (
          await this.llm.generate(system, user, {
            feature: 'compare',
            tier: 'reasoning',
          })
        ).trim();
      } catch {
        /* analysis is optional */
      }
    }
    return { query: q, analysis, groups };
  }

  /** Pillar 3 — insight aggregations (no LLM): volume, sources, trending terms. */
  async insights(): Promise<{
    perDay: { d: string; c: number }[];
    sources: { source: string; c: number }[];
    trending: { term: string; c: number }[];
  }> {
    const perDay = await this.prisma.$queryRaw<{ d: string; c: number }[]>`
      SELECT to_char("createdAt"::date, 'MM-DD') AS d, count(*)::int AS c
      FROM "Article"
      WHERE "createdAt" > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1
    `;
    const sources = await this.prisma.$queryRaw<
      { source: string; c: number }[]
    >`
      SELECT source, count(*)::int AS c FROM "Article"
      GROUP BY source ORDER BY c DESC LIMIT 8
    `;
    const recent = await this.prisma.article.findMany({
      where: { publishedAt: { gt: new Date(Date.now() - 3 * 86400_000) } },
      orderBy: { publishedAt: 'desc' },
      take: 600,
      select: { title: true },
    });
    const freq = new Map<string, number>();
    for (const { title } of recent) {
      for (const raw of title.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
        const w = raw.trim();
        if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
        freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
    const trending = [...freq.entries()]
      .filter(([, c]) => c >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([term, c]) => ({ term, c }));
    return { perDay, sources, trending };
  }
}
