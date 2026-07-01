-- Phase 11 — topic tag + article full-text search.
-- Idempotent. `topic` is a plain column (also in schema.prisma); the tsvector is
-- a generated column Prisma can't model, so it lives only here (queried via raw SQL).

-- Topic tag (keyword-classified at ingest).
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "topic" text;
CREATE INDEX IF NOT EXISTS article_topic_idx ON "Article" ("topic");

-- Full-text over title + content for the /articles search page.
ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "contentTsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("content", ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS article_content_tsv_idx
  ON "Article" USING GIN ("contentTsv");
