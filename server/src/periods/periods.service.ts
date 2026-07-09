import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { periodRecapPrompt, yearReviewPrompt } from '../llm/features.prompts';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

export interface TopEvent {
  id: string;
  title: string;
  topic: string | null;
  sourceCount: number;
  articleCount: number;
  hotness: number;
  lastSeen: Date | null;
}
export interface TopicCount {
  topic: string | null;
  count: number;
}
interface QuarterInfo {
  year: number;
  quarter: number;
  start: Date;
  end: Date; // exclusive
  label: string;
}

@Injectable()
export class PeriodsService {
  private readonly logger = new Logger(PeriodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /** Which calendar quarter a date falls in. */
  private quarterInfo(d: Date): QuarterInfo {
    const year = d.getFullYear();
    const quarter = Math.floor(d.getMonth() / 3) + 1;
    const startMonth = (quarter - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 1);
    return {
      year,
      quarter,
      start,
      end,
      label: `Quý ${ROMAN[quarter]}/${year}`,
    };
  }

  /** Aggregate live stats for a [start, end) window. */
  private async computeStats(start: Date, end: Date) {
    const [articleCount, hotEvents, topicGroups] = await Promise.all([
      this.prisma.article.count({
        where: { publishedAt: { gte: start, lt: end } },
      }),
      this.prisma.event.findMany({
        where: { sourceCount: { gte: 2 }, lastSeen: { gte: start, lt: end } },
        orderBy: [{ hotness: 'desc' }, { lastSeen: 'desc' }],
        take: 10,
        select: {
          id: true,
          title: true,
          topic: true,
          sourceCount: true,
          articleCount: true,
          hotness: true,
          lastSeen: true,
        },
      }),
      this.prisma.article.groupBy({
        by: ['topic'],
        where: { publishedAt: { gte: start, lt: end } },
        _count: { _all: true },
      }),
    ]);
    const eventCount = await this.prisma.event.count({
      where: { sourceCount: { gte: 2 }, lastSeen: { gte: start, lt: end } },
    });
    const byTopic: TopicCount[] = topicGroups
      .map((g) => ({ topic: g.topic, count: g._count._all }))
      .sort((a, b) => b.count - a.count);
    return {
      articleCount,
      eventCount,
      topEvents: hotEvents as TopEvent[],
      byTopic,
    };
  }

  /** Ensure the current quarter exists and any older active quarter is archived. */
  async getActive() {
    const now = new Date();
    const info = this.quarterInfo(now);

    // Archive any active period that is not the current quarter (snapshot only, no LLM).
    const stale = await this.prisma.period.findMany({
      where: {
        status: 'active',
        NOT: { year: info.year, quarter: info.quarter },
      },
    });
    for (const p of stale) {
      const s = await this.computeStats(p.startDate, p.endDate);
      // Detail views recompute stats live (past-quarter data is frozen), so we
      // only persist the cheap counts here — no need to serialise snapshots.
      await this.prisma.period.update({
        where: { id: p.id },
        data: {
          status: 'archived',
          articleCount: s.articleCount,
          eventCount: s.eventCount,
        },
      });
      this.logger.log(`Archived ${p.label}`);
    }

    let period = await this.prisma.period.findUnique({
      where: { year_quarter: { year: info.year, quarter: info.quarter } },
    });
    if (!period) {
      period = await this.prisma.period.create({
        data: {
          kind: 'quarter',
          label: info.label,
          year: info.year,
          quarter: info.quarter,
          startDate: info.start,
          endDate: info.end,
          status: 'active',
        },
      });
    }
    const live = await this.computeStats(period.startDate, period.endDate);
    return {
      ...period,
      articleCount: live.articleCount,
      eventCount: live.eventCount,
    };
  }

  /** All quarters, newest first (with live counts). */
  async listPeriods() {
    await this.getActive(); // make sure current exists + stale archived
    const periods = await this.prisma.period.findMany({
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
    });
    return Promise.all(
      periods.map(async (p) => {
        const s = await this.computeStats(p.startDate, p.endDate);
        return {
          id: p.id,
          label: p.label,
          year: p.year,
          quarter: p.quarter,
          startDate: p.startDate,
          endDate: p.endDate,
          status: p.status,
          hasSummary: !!p.summary,
          articleCount: s.articleCount,
          eventCount: s.eventCount,
        };
      }),
    );
  }

  /** Quarter detail: top events + topic breakdown + cached AI recap (archived only). */
  async getPeriod(id: string) {
    const period = await this.prisma.period.findUnique({ where: { id } });
    if (!period) return null;
    const stats = await this.computeStats(period.startDate, period.endDate);

    let summary = period.summary;
    if (
      !summary &&
      period.status === 'archived' &&
      stats.topEvents.length > 0
    ) {
      summary = await this.generateRecap(period.label, stats);
      await this.prisma.period.update({ where: { id }, data: { summary } });
    }

    return {
      period: {
        id: period.id,
        label: period.label,
        year: period.year,
        quarter: period.quarter,
        startDate: period.startDate,
        endDate: period.endDate,
        status: period.status,
        summary,
      },
      articleCount: stats.articleCount,
      eventCount: stats.eventCount,
      topEvents: stats.topEvents,
      byTopic: stats.byTopic,
    };
  }

  /** Force rollover now: archive ended quarters and generate their recaps eagerly. */
  async rollover() {
    await this.getActive();
    const pending = await this.prisma.period.findMany({
      where: { status: 'archived', summary: null },
    });
    let generated = 0;
    for (const p of pending) {
      const stats = await this.computeStats(p.startDate, p.endDate);
      if (stats.topEvents.length === 0) continue;
      const summary = await this.generateRecap(p.label, stats);
      await this.prisma.period.update({
        where: { id: p.id },
        data: { summary },
      });
      generated++;
    }
    return { archivedRecapsGenerated: generated };
  }

  /** "Năm ... là một năm như thế nào?" — synthesize the year's quarters (cached). */
  async yearReview(year: number) {
    const cached = await this.prisma.yearReview.findUnique({ where: { year } });
    const quarters = await this.prisma.period.findMany({
      where: { year },
      orderBy: { quarter: 'asc' },
    });
    if (cached) {
      return {
        year,
        content: cached.content,
        quarters: quarters.map(this.qLite),
      };
    }
    // Ensure each quarter has a recap to build on.
    const blocks: string[] = [];
    for (const p of quarters) {
      let summary = p.summary;
      if (!summary) {
        const stats = await this.computeStats(p.startDate, p.endDate);
        if (stats.topEvents.length > 0) {
          summary = await this.generateRecap(p.label, stats);
          await this.prisma.period.update({
            where: { id: p.id },
            data: { summary },
          });
        }
      }
      if (summary) blocks.push(`## ${p.label}\n${summary}`);
    }
    if (blocks.length === 0) {
      return { year, content: '', quarters: quarters.map(this.qLite) };
    }
    const { system, user } = yearReviewPrompt(year, blocks.join('\n\n'));
    const content = (
      await this.llm.generate(system, user, {
        feature: 'year',
        tier: 'reasoning',
      })
    ).trim();
    await this.prisma.yearReview.create({ data: { year, content } });
    return { year, content, quarters: quarters.map(this.qLite) };
  }

  private qLite = (p: {
    id: string;
    label: string;
    quarter: number;
    status: string;
  }) => ({ id: p.id, label: p.label, quarter: p.quarter, status: p.status });

  private async generateRecap(
    label: string,
    stats: { topEvents: TopEvent[]; byTopic: TopicCount[] },
  ): Promise<string> {
    const eventsBlock = stats.topEvents
      .map(
        (e) =>
          `- [${e.sourceCount} báo] ${e.title}${e.topic ? ` (${e.topic})` : ''}`,
      )
      .join('\n');
    const topicBlock = stats.byTopic
      .slice(0, 9)
      .map((t) => `- ${t.topic ?? 'khác'}: ${t.count} bài`)
      .join('\n');
    try {
      const { system, user } = periodRecapPrompt(
        label,
        eventsBlock,
        topicBlock,
      );
      return (
        await this.llm.generate(system, user, {
          feature: 'recap',
          tier: 'reasoning',
        })
      ).trim();
    } catch {
      return '';
    }
  }
}
