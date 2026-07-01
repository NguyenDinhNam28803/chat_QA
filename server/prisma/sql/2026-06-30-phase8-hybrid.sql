-- Phase 8 — Hybrid search + scale indexes
-- Applied out-of-band (Prisma can't model tsvector/vector generated columns).
-- Idempotent: safe to re-run.

-- 1) Full-text tsvector on Chunk.content (Vietnamese-friendly 'simple' config:
--    tokenizes without stemming, good for keyword/name/number matching).
ALTER TABLE "Chunk"
  ADD COLUMN IF NOT EXISTS "contentTsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED;

-- 2) GIN index for fast full-text ranking.
CREATE INDEX IF NOT EXISTS chunk_content_tsv_idx
  ON "Chunk" USING GIN ("contentTsv");

-- 3) HNSW index for fast approximate vector search at scale (cosine).
CREATE INDEX IF NOT EXISTS chunk_embedding_hnsw_idx
  ON "Chunk" USING hnsw ("embedding" vector_cosine_ops);
