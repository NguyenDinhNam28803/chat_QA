import { RetrievedChunk, RetrievalResult, Citation } from './retrieval.types';

export function buildContext(rows: RetrievedChunk[]): RetrievalResult {
  if (rows.length === 0) return { context: '', citations: [] };
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
  return { context, citations: [...seen.values()] };
}
