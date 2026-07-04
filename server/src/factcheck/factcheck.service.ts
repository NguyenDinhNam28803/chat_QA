import { Injectable } from '@nestjs/common';
import { RetrievalService } from '../retrieval/retrieval.service';
import { LlmService } from '../llm/llm.service';
import { factCheckPrompt } from '../llm/features.prompts';
import { Citation } from '../retrieval/retrieval.types';

export type Verdict = 'supported' | 'conflicting' | 'insufficient';

export interface FactCheckResult {
  claim: string;
  verdict: Verdict;
  analysis: string;
  citations: Citation[];
}

@Injectable()
export class FactcheckService {
  constructor(
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmService,
  ) {}

  async check(claim: string): Promise<FactCheckResult> {
    const q = claim.trim();
    if (!q) {
      return { claim, verdict: 'insufficient', analysis: '', citations: [] };
    }

    // Pull a wider net (k=12) so both supporting AND contradicting evidence surface.
    const { context, citations } = await this.retrieval.search(q, 12);
    if (citations.length === 0) {
      return {
        claim: q,
        verdict: 'insufficient',
        analysis:
          'Không tìm thấy nguồn nào trong kho tin liên quan đến nhận định này, nên chưa thể kiểm chứng.',
        citations: [],
      };
    }

    let verdict: Verdict = 'insufficient';
    let analysis = '';
    try {
      const { system, user } = factCheckPrompt(q, context);
      const raw = (await this.llm.generate(system, user)).trim();
      const parsed = this.parse(raw);
      verdict = parsed.verdict;
      analysis = parsed.analysis;
    } catch {
      analysis = 'Không thể phân tích lúc này (mô hình bận). Vui lòng thử lại.';
    }
    return { claim: q, verdict, analysis, citations };
  }

  /** Split the leading "VERDICT: xxx" line from the markdown analysis. */
  private parse(raw: string): { verdict: Verdict; analysis: string } {
    const m = raw.match(/VERDICT:\s*(supported|conflicting|insufficient)/i);
    const verdict = (m?.[1]?.toLowerCase() as Verdict) ?? 'insufficient';
    const analysis = raw
      .replace(/^\s*VERDICT:\s*(supported|conflicting|insufficient)\s*/i, '')
      .trim();
    return { verdict, analysis };
  }
}
