import {
  RetrievedChunk,
  RetrievalResult,
  Citation,
  Confidence,
} from './retrieval.types';

/**
 * How trustworthy is the retrieved evidence?
 *  - relevance = smallest cosine distance (closer = better match)
 *  - sources   = number of distinct articles backing the answer
 * Thresholds tuned for bge-m3 (a strong match sits around ~0.5–0.6 distance).
 */
function scoreConfidence(minDistance: number, sources: number): Confidence {
  let level: Confidence['level'];
  if (sources >= 2 && minDistance < 0.58) level = 'high';
  else if (sources >= 1 && minDistance < 0.68) level = 'medium';
  else level = 'low';
  return { level, sources, minDistance };
}

export function buildContext(rows: RetrievedChunk[]): RetrievalResult {
  if (rows.length === 0) {
    return {
      context: '',
      citations: [],
      confidence: { level: 'low', sources: 0, minDistance: 1 },
    };
  }
  const context = rows.map((r, i) => `[${i + 1}] ${r.content}`).join('\n\n');
  const seen = new Map<string, Citation>();
  rows.forEach((r, i) => {
    if (!seen.has(r.articleId)) {
      seen.set(r.articleId, {
        index: i + 1,
        articleId: r.articleId,
        url: r.url,
        title: r.title,
        source: r.source,
      });
    }
  });
  const citations = [...seen.values()];
  const minDistance = Math.min(...rows.map((r) => r.distance));
  return {
    context,
    citations,
    confidence: scoreConfidence(minDistance, citations.length),
  };
}
