import { Injectable, Logger } from '@nestjs/common';
import { RetrievalService } from '../retrieval/retrieval.service';
import { LlmService } from '../llm/llm.service';
import {
  factCheckPrompt,
  factCheckStructuredPrompt,
  factCheckSchema,
  factCheckWebPrompt,
} from '../llm/features.prompts';
import { Citation } from '../retrieval/retrieval.types';

export type Verdict = 'supported' | 'conflicting' | 'insufficient';
const VERDICTS: Verdict[] = ['supported', 'conflicting', 'insufficient'];

interface StructuredFactCheck {
  verdict: Verdict;
  confidence: number;
  analysis: string;
}

export interface FactCheckResult {
  claim: string;
  verdict: Verdict;
  confidence: number | null; // 0..1 (only from structured output)
  analysis: string;
  citations: Citation[];
}

@Injectable()
export class FactcheckService {
  private readonly logger = new Logger(FactcheckService.name);

  constructor(
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmService,
  ) {}

  async check(claim: string): Promise<FactCheckResult> {
    const q = claim.trim();
    if (!q) {
      return {
        claim,
        verdict: 'insufficient',
        confidence: null,
        analysis: '',
        citations: [],
      };
    }

    // Pull a wider net (k=12) so both supporting AND contradicting evidence surface.
    const { context, citations } = await this.retrieval.search(q, 12);
    if (citations.length === 0) {
      return {
        claim: q,
        verdict: 'insufficient',
        confidence: null,
        analysis:
          'Không tìm thấy nguồn nào trong kho tin liên quan đến nhận định này, nên chưa thể kiểm chứng.',
        citations: [],
      };
    }

    // (B2) Preferred path: structured output — schema guarantees a parseable
    // verdict and hands us `confidence` for free.
    try {
      const { system, user } = factCheckStructuredPrompt(q, context);
      const r = await this.llm.generateStructured<StructuredFactCheck>(
        system,
        user,
        factCheckSchema,
        { feature: 'factcheck', tier: 'reasoning' },
      );
      if (VERDICTS.includes(r.verdict) && typeof r.analysis === 'string') {
        const confidence =
          typeof r.confidence === 'number'
            ? Math.max(0, Math.min(1, r.confidence))
            : null;
        return {
          claim: q,
          verdict: r.verdict,
          confidence,
          analysis: r.analysis.trim(),
          citations,
        };
      }
      this.logger.warn('structured factcheck shape invalid → text fallback');
    } catch (err) {
      this.logger.warn(
        `structured factcheck failed → text fallback: ${String(err)}`,
      );
    }

    // Fallback: free-tier model may not honour json_schema — parse the old way.
    let verdict: Verdict = 'insufficient';
    let analysis = '';
    try {
      const { system, user } = factCheckPrompt(q, context);
      const raw = (
        await this.llm.generate(system, user, {
          feature: 'factcheck',
          tier: 'reasoning',
        })
      ).trim();
      const parsed = this.parse(raw);
      verdict = parsed.verdict;
      analysis = parsed.analysis;
    } catch {
      analysis = 'Không thể phân tích lúc này (mô hình bận). Vui lòng thử lại.';
    }
    return { claim: q, verdict, confidence: null, analysis, citations };
  }

  /**
   * (B4) Web-augmented check — EXPLICIT opt-in, external unverified sources.
   * Bypasses the internal corpus and lets the model search the web. Kept
   * separate from the grounded flow on purpose (see OPENROUTER.md B4).
   */
  async checkOnline(claim: string): Promise<{
    claim: string;
    analysis: string;
    webSources: { url: string; title: string }[];
  }> {
    const q = claim.trim();
    if (!q) return { claim, analysis: '', webSources: [] };
    try {
      const { system, user } = factCheckWebPrompt(q);
      const { text, webSources } = await this.llm.generateWeb(system, user, {
        feature: 'factcheck-web',
        tier: 'reasoning',
      });
      return { claim: q, analysis: text.trim(), webSources };
    } catch (err) {
      this.logger.warn(`web factcheck failed: ${String(err)}`);
      return {
        claim: q,
        analysis:
          'Không thực hiện được kiểm chứng web lúc này (mô hình chưa hỗ trợ web hoặc đang bận).',
        webSources: [],
      };
    }
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
