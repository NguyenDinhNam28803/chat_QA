/**
 * Small, dependency-free vector helpers shared by ingestion and the F2 clickbait
 * backfill. Kept pure (no I/O) so they can be unit-tested in isolation.
 */

/** Parse a pgvector text literal like `[0.1,-0.2,0.3]` into a number array. */
export function parseVectorLiteral(literal: string): number[] {
  const inner = literal.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!inner) return [];
  return inner.split(',').map((x) => Number(x));
}

/** Cosine similarity of two equal-length vectors, in [-1, 1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: length mismatch (${a.length} vs ${b.length})`,
    );
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0; // a zero vector has no direction
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Element-wise mean of vectors (the centroid). All must share one dimension. */
export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error('centroid: no vectors given');
  }
  const dim = vectors[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) {
      throw new Error(
        `centroid: length mismatch (${v.length} vs ${dim})`,
      );
    }
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

/**
 * F2 title↔body match score: cosine between the title embedding and the
 * centroid of the body chunk embeddings. Higher = the headline reflects the
 * article; low = the title promises something the body does not deliver
 * (possible clickbait). Returns a value in [0, 1] (embeddings are non-negative
 * enough in practice, but we clamp defensively for a clean 0–100 display).
 */
export function titleBodyScore(
  titleVec: number[],
  bodyVecs: number[][],
): number {
  const body = centroid(bodyVecs);
  const sim = cosineSimilarity(titleVec, body);
  return Math.min(1, Math.max(0, sim));
}
