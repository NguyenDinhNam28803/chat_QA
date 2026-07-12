-- F2 — clickbait detector: title↔body match score.
-- Idempotent. `titleBodyScore` = cosine(title embedding, body-centroid) in [0,1],
-- also modelled in schema.prisma. Null until the backfill runs
-- (POST /ingestion/backfill-clickbait). Lower = title less represents the body.

ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "titleBodyScore" double precision;
CREATE INDEX IF NOT EXISTS article_title_body_score_idx
  ON "Article" ("titleBodyScore");
