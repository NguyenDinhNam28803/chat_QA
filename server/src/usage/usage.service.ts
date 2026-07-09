import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** (B3) Fire-and-forget: never let usage logging affect the LLM path. */
  record(row: {
    feature: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }): void {
    void this.prisma.llmUsage.create({ data: row }).catch((err) => {
      this.logger.warn(`usage log failed: ${String(err)}`);
    });
  }

  /** (B3) Aggregate token & cost per feature and per model (last 30 days). */
  async summary(): Promise<{
    totalCalls: number;
    totalInput: number;
    totalOutput: number;
    totalCost: number;
    byFeature: {
      feature: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
    }[];
    byModel: { model: string; calls: number; cost: number }[];
  }> {
    const byFeature = await this.prisma.$queryRaw<
      {
        feature: string;
        calls: number;
        inputTokens: number;
        outputTokens: number;
        cost: number;
      }[]
    >`
      SELECT feature,
             count(*)::int AS calls,
             coalesce(sum("inputTokens"),0)::int AS "inputTokens",
             coalesce(sum("outputTokens"),0)::int AS "outputTokens",
             coalesce(sum("cost"),0)::float8 AS cost
      FROM "LlmUsage"
      WHERE "createdAt" > now() - interval '30 days'
      GROUP BY feature
      ORDER BY (coalesce(sum("inputTokens"),0)+coalesce(sum("outputTokens"),0)) DESC
    `;
    const byModel = await this.prisma.$queryRaw<
      { model: string; calls: number; cost: number }[]
    >`
      SELECT model, count(*)::int AS calls, coalesce(sum("cost"),0)::float8 AS cost
      FROM "LlmUsage"
      WHERE "createdAt" > now() - interval '30 days'
      GROUP BY model ORDER BY calls DESC
    `;
    const totalCalls = byFeature.reduce((s, f) => s + f.calls, 0);
    const totalInput = byFeature.reduce((s, f) => s + f.inputTokens, 0);
    const totalOutput = byFeature.reduce((s, f) => s + f.outputTokens, 0);
    const totalCost = byModel.reduce((s, m) => s + m.cost, 0);
    return {
      totalCalls,
      totalInput,
      totalOutput,
      totalCost,
      byFeature,
      byModel,
    };
  }
}
