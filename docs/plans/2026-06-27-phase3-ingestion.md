# Phase 3 — Ingestion Pipeline (RSS + BullMQ) Implementation Plan

**Goal:** Fetch RSS news on a schedule → clean → chunk → embed (bge-m3) → upsert into Postgres/pgvector, with dedup, so the DB fills with `Article` + `Chunk` rows that have real 1024-dim vectors.

**Architecture:** A NestJS `IngestionModule` registers a BullMQ queue backed by the existing Redis container. A repeatable (cron) job enqueues one "fetch feed" job per RSS feed. A worker parses the feed, and for each new article extracts full text, chunks it, calls `EmbeddingService.embedBatch`, and upserts `Article` + `Chunk`. Vectors are written with raw SQL (`::vector`) because Prisma can't write `Unsupported("vector")` columns.

**Tech Stack:** NestJS 11, `@nestjs/bullmq` + `bullmq` + `ioredis`, `rss-parser`, `@mozilla/readability` + `jsdom`, `cheerio`, `gpt-tokenizer`, `@paralleldrive/cuid2`, Prisma 6 `$executeRaw`.

## Global Constraints (carry into every task)
- **Windows `&`-path bug:** run binaries via `node <relative-path>` from `server/`, never `npm run`/`npx`. (Goes away after the folder rename to `d:\Chatbot_QA`.)
- **No git repo** — no commit steps; each task ends at a verification checkpoint.
- **Embedding dim LOCKED at 1024.** `EmbeddingService` already hard-fails on mismatch.
- **Prisma cannot write the `vector` column** — vector writes use `$executeRaw` with a `'[...]'::vector` literal.
- **Services in Docker:** Postgres `55432`, Redis `6379`, Ollama `11434`. Stack must be `up` for integration checkpoints.
- **Dedup keys:** `Article.url @unique` + `Article.contentHash @unique`.
- **Start with ONE feed** (VnExpress "Tin mới nhất"). The feed list is data, not code.
- **DECIDED:** Chunk ids for raw inserts come from `@paralleldrive/cuid2` `createId()`.

---

## File Structure
```
server/src/
  config/redis.config.ts          # ioredis connection options from env
  ingestion/
    feeds.config.ts               # RSS feed list (data) + FeedSource type
    rss.service.ts                # fetch + parse a feed -> RawFeedItem[]
    content-extractor.service.ts  # url -> clean plain-text article body
    chunk.service.ts              # text -> TextChunk[] (pure, unit-tested)
    chunk.service.spec.ts         # TDD unit tests
    ingestion.service.ts          # dedup + orchestrate + vector upsert (raw SQL)
    ingestion.processor.ts        # BullMQ Worker: 'fetch-feed'
    ingestion.scheduler.ts        # OnModuleInit -> repeatable 'fetch-feed' jobs
    ingestion.controller.ts       # POST /ingestion/run (manual trigger)
    ingestion.constants.ts        # queue + job name constants
    ingestion.module.ts           # wires the above, registers the queue
```
`server/src/app.module.ts` — modify to import `IngestionModule`.

---

## Task 1: Deps + Redis config + queue registration

**Files:** modify `package.json` (install); create `config/redis.config.ts`, `ingestion/ingestion.constants.ts`, `ingestion/ingestion.module.ts` (skeleton); modify `app.module.ts`.

**Interfaces produced:**
- `redisConnection(config: ConfigService): { host: string; port: number }`
- `INGESTION_QUEUE='ingestion'`, `JOB_FETCH_FEED='fetch-feed'`

- [ ] **1.1 Install** (from `server/`):
```
npm install @nestjs/bullmq bullmq ioredis rss-parser @mozilla/readability jsdom cheerio gpt-tokenizer @paralleldrive/cuid2
```
(`npm install` works on the `&` path; only script/.bin shims break.)

- [ ] **1.2** `config/redis.config.ts`:
```ts
import { ConfigService } from '@nestjs/config';
export function redisConnection(config: ConfigService) {
  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: Number(config.get<string>('REDIS_PORT', '6379')),
  };
}
```

- [ ] **1.3** `ingestion/ingestion.constants.ts`:
```ts
export const INGESTION_QUEUE = 'ingestion';
export const JOB_FETCH_FEED = 'fetch-feed';
```

- [ ] **1.4** `ingestion/ingestion.module.ts` (skeleton, queue registered):
```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { INGESTION_QUEUE } from './ingestion.constants';
import { redisConnection } from '../config/redis.config';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ connection: redisConnection(config) }),
    }),
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
  ],
})
export class IngestionModule {}
```

- [ ] **1.5** Import `IngestionModule` in `app.module.ts`.

- [ ] **1.6 Checkpoint:** `node node_modules/@nestjs/cli/bin/nest.js build` → exit 0; `node dist/main.js` boots with no Redis error (Redis up).

---

## Task 2: ChunkService (TDD — pure logic)

**Files:** create `ingestion/chunk.service.ts`, `ingestion/chunk.service.spec.ts`.

**Interfaces produced:**
- `interface TextChunk { ord: number; content: string; tokenCount: number }`
- `ChunkService.chunk(text: string): TextChunk[]` — ~400 tokens/chunk, ~50 overlap.

- [ ] **2.1 Failing tests** (`chunk.service.spec.ts`):
```ts
import { ChunkService } from './chunk.service';
describe('ChunkService', () => {
  const svc = new ChunkService();
  it('one chunk for short text', () => {
    const out = svc.chunk('Một câu ngắn về tin tức.');
    expect(out).toHaveLength(1);
    expect(out[0].ord).toBe(0);
    expect(out[0].tokenCount).toBeGreaterThan(0);
  });
  it('splits long text with increasing ord, <=400 tokens', () => {
    const text = Array.from({ length: 2000 }, (_, i) => `từ${i}`).join(' ');
    const out = svc.chunk(text);
    expect(out.length).toBeGreaterThan(1);
    out.forEach((c, i) => expect(c.ord).toBe(i));
    expect(out.every((c) => c.tokenCount <= 400)).toBe(true);
  });
  it('empty array for blank text', () => expect(svc.chunk('   ')).toEqual([]));
});
```

- [ ] **2.2 Run → FAIL:** `node node_modules/jest/bin/jest.js src/ingestion/chunk.service`.

- [ ] **2.3 Implement `chunk.service.ts`:**
```ts
import { Injectable } from '@nestjs/common';
import { encode } from 'gpt-tokenizer';

export interface TextChunk { ord: number; content: string; tokenCount: number }
const MAX_TOKENS = 400;
const OVERLAP_TOKENS = 50;

@Injectable()
export class ChunkService {
  chunk(text: string): TextChunk[] {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const words = clean.split(' ');
    const chunks: TextChunk[] = [];
    let ord = 0, start = 0;
    while (start < words.length) {
      let end = start, tokenCount = 0;
      while (end < words.length) {
        const next = encode(words[end] + ' ').length;
        if (tokenCount + next > MAX_TOKENS) break;
        tokenCount += next; end++;
      }
      if (end === start) end = start + 1;
      const content = words.slice(start, end).join(' ');
      chunks.push({ ord: ord++, content, tokenCount: encode(content).length });
      if (end >= words.length) break;
      const overlapWords = Math.min(end - start, Math.ceil(OVERLAP_TOKENS / 2));
      start = end - overlapWords;
    }
    return chunks;
  }
}
```

- [ ] **2.4 Run → PASS.**

---

## Task 3: RssService

**Files:** create `ingestion/feeds.config.ts`, `ingestion/rss.service.ts`.

**Interfaces produced:**
- `interface FeedSource { id: string; name: string; url: string }`, `DEFAULT_FEEDS: FeedSource[]`
- `interface RawFeedItem { url: string; title: string; source: string; publishedAt: Date | null; summaryHtml: string }`
- `RssService.fetchFeed(feed: FeedSource): Promise<RawFeedItem[]>`

- [ ] **3.1** `feeds.config.ts`:
```ts
export interface FeedSource { id: string; name: string; url: string }
export const DEFAULT_FEEDS: FeedSource[] = [
  { id: 'vnexpress-moinhat', name: 'VnExpress - Tin mới nhất', url: 'https://vnexpress.net/rss/tin-moi-nhat.rss' },
];
```

- [ ] **3.2** `rss.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import { FeedSource } from './feeds.config';

export interface RawFeedItem {
  url: string; title: string; source: string;
  publishedAt: Date | null; summaryHtml: string;
}

@Injectable()
export class RssService {
  private readonly logger = new Logger(RssService.name);
  private readonly parser = new Parser();
  async fetchFeed(feed: FeedSource): Promise<RawFeedItem[]> {
    const parsed = await this.parser.parseURL(feed.url);
    const items = (parsed.items ?? [])
      .filter((i) => i.link && i.title)
      .map((i) => ({
        url: i.link!.trim(),
        title: i.title!.trim(),
        source: feed.name,
        publishedAt: i.isoDate ? new Date(i.isoDate) : null,
        summaryHtml: i['content:encoded'] ?? i.content ?? i.contentSnippet ?? '',
      }));
    this.logger.log(`Feed ${feed.id}: ${items.length} items`);
    return items;
  }
}
```

- [ ] **3.3 Checkpoint:** temporary harness resolves `RssService`, prints `fetchFeed(DEFAULT_FEEDS[0])` length + first url/title. Confirm >0. Delete harness.

---

## Task 4: ContentExtractorService

**Files:** create `ingestion/content-extractor.service.ts`.

**Interfaces produced:** `ContentExtractorService.extract(url: string, fallbackHtml: string): Promise<string>`.

- [ ] **4.1** Implement:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';

@Injectable()
export class ContentExtractorService {
  private readonly logger = new Logger(ContentExtractorService.name);
  async extract(url: string, fallbackHtml: string): Promise<string> {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'NewsQABot/0.1' } });
      if (res.ok) {
        const html = await res.text();
        const dom = new JSDOM(html, { url });
        const article = new Readability(dom.window.document).parse();
        const text = (article?.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text.length > 200) return text;
      }
    } catch (err) {
      this.logger.warn(`extract failed for ${url}: ${String(err)}`);
    }
    return cheerio.load(fallbackHtml).text().replace(/\s+/g, ' ').trim();
  }
}
```

- [ ] **4.2 Checkpoint:** harness extracts the first item from Task 3, prints text length (>200 expected). Delete harness.

---

## Task 5: IngestionService (dedup + orchestrate + vector upsert)

**Files:** create `ingestion/ingestion.service.ts`.

**Interfaces consumed:** `EmbeddingService.embedBatch`, `PrismaService`, `ChunkService.chunk`, `ContentExtractorService.extract`, `RssService.fetchFeed`.

**Interfaces produced:**
- `IngestionService.ingestFeed(feed: FeedSource): Promise<{ processed: number; skipped: number }>`
- `IngestionService.ingestArticle(item: RawFeedItem): Promise<'inserted' | 'skipped'>`

- [ ] **5.1** Implement (vectors via raw SQL inside a transaction; ids via cuid2):
```ts
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { ChunkService } from './chunk.service';
import { ContentExtractorService } from './content-extractor.service';
import { RssService, RawFeedItem } from './rss.service';
import { FeedSource } from './feeds.config';

const toVectorLiteral = (v: number[]) => `[${v.join(',')}]`;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
    private readonly chunker: ChunkService,
    private readonly extractor: ContentExtractorService,
    private readonly rss: RssService,
  ) {}

  async ingestFeed(feed: FeedSource) {
    const items = await this.rss.fetchFeed(feed);
    let processed = 0, skipped = 0;
    for (const item of items) {
      const r = await this.ingestArticle(item).catch((e) => {
        this.logger.warn(`article failed ${item.url}: ${String(e)}`);
        return 'skipped' as const;
      });
      r === 'inserted' ? processed++ : skipped++;
    }
    this.logger.log(`Feed ${feed.id}: processed=${processed} skipped=${skipped}`);
    return { processed, skipped };
  }

  async ingestArticle(item: RawFeedItem): Promise<'inserted' | 'skipped'> {
    if (await this.prisma.article.findUnique({ where: { url: item.url } })) return 'skipped';
    const content = await this.extractor.extract(item.url, item.summaryHtml);
    if (!content) return 'skipped';
    const contentHash = createHash('sha256').update(content).digest('hex');
    if (await this.prisma.article.findUnique({ where: { contentHash } })) return 'skipped';
    const chunks = this.chunker.chunk(content);
    if (chunks.length === 0) return 'skipped';
    const vectors = await this.embedding.embedBatch(chunks.map((c) => c.content));

    await this.prisma.$transaction(async (tx) => {
      const article = await tx.article.create({
        data: {
          url: item.url, title: item.title, source: item.source,
          publishedAt: item.publishedAt ?? undefined, content, contentHash,
        },
      });
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        await tx.$executeRaw`
          INSERT INTO "Chunk" ("id","articleId","ord","content","tokenCount","embedding","createdAt")
          VALUES (${createId()}, ${article.id}, ${c.ord}, ${c.content}, ${c.tokenCount},
                  ${toVectorLiteral(vectors[i])}::vector, now())`;
      }
    });
    return 'inserted';
  }
}
```

- [ ] **5.2 Checkpoint:** harness calls `ingestArticle` on one real item → `'inserted'`; SQL check:
```
docker exec newsqa-postgres psql -U newsqa -d newsqa -c \
 'SELECT (SELECT count(*) FROM "Article") a, (SELECT count(*) FROM "Chunk") c;'
docker exec newsqa-postgres psql -U newsqa -d newsqa -c \
 'SELECT vector_dims(embedding) FROM "Chunk" LIMIT 1;'
```
Expected article=1, chunks>0, dims=1024. Delete harness.

---

## Task 6: BullMQ processor + scheduler + manual trigger

**Files:** create `ingestion.processor.ts`, `ingestion.scheduler.ts`, `ingestion.controller.ts`; modify `ingestion.module.ts`.

- [ ] **6.1** `ingestion.processor.ts`:
```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { INGESTION_QUEUE, JOB_FETCH_FEED } from './ingestion.constants';
import { IngestionService } from './ingestion.service';
import { FeedSource } from './feeds.config';

@Processor(INGESTION_QUEUE)
export class IngestionProcessor extends WorkerHost {
  constructor(private readonly ingestion: IngestionService) { super(); }
  async process(job: Job<FeedSource>): Promise<void> {
    if (job.name === JOB_FETCH_FEED) await this.ingestion.ingestFeed(job.data);
  }
}
```

- [ ] **6.2** `ingestion.scheduler.ts`:
```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { INGESTION_QUEUE, JOB_FETCH_FEED } from './ingestion.constants';
import { DEFAULT_FEEDS } from './feeds.config';

@Injectable()
export class IngestionScheduler implements OnModuleInit {
  constructor(@InjectQueue(INGESTION_QUEUE) private readonly queue: Queue) {}
  async onModuleInit(): Promise<void> {
    for (const feed of DEFAULT_FEEDS) {
      await this.queue.add(JOB_FETCH_FEED, feed, {
        repeat: { every: 30 * 60 * 1000 },
        jobId: `feed:${feed.id}`, removeOnComplete: true, removeOnFail: 50,
      });
    }
  }
}
```

- [ ] **6.3** `ingestion.controller.ts`:
```ts
import { Controller, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { INGESTION_QUEUE, JOB_FETCH_FEED } from './ingestion.constants';
import { DEFAULT_FEEDS } from './feeds.config';

@Controller('ingestion')
export class IngestionController {
  constructor(@InjectQueue(INGESTION_QUEUE) private readonly queue: Queue) {}
  @Post('run')
  async run(): Promise<{ enqueued: number }> {
    for (const feed of DEFAULT_FEEDS) await this.queue.add(JOB_FETCH_FEED, feed);
    return { enqueued: DEFAULT_FEEDS.length };
  }
}
```

- [ ] **6.4** `ingestion.module.ts` — add `imports: [EmbeddingModule]` (PrismaModule is global); `providers: [RssService, ContentExtractorService, ChunkService, IngestionService, IngestionProcessor, IngestionScheduler]`; `controllers: [IngestionController]`. Keep the BullModule registration from Task 1.

---

## Task 7: End-to-end verification on one feed

- [ ] **7.1** `docker compose ps` → postgres/redis/ollama healthy.
- [ ] **7.2** `node node_modules/@nestjs/cli/bin/nest.js build` then `node dist/main.js`.
- [ ] **7.3** `curl -X POST http://localhost:3000/ingestion/run` → `{ "enqueued": 1 }`; watch logs for `processed=N`.
- [ ] **7.4** Verify DB: articles>0, chunks>0, `vector_dims=1024` (same SQL as 5.2).
- [ ] **7.5** Re-trigger → second run reports mostly `skipped` (dedup works).

**Phase 3 DONE when:** one feed ingests real articles with 1024-dim vectors, dedup prevents duplicates, repeatable job registered in Redis.

---
---

# 🇻🇳 BẢN TIẾNG VIỆT — Phase 3: Pipeline nạp dữ liệu (RSS + BullMQ)

> Bản dịch của tài liệu phía trên. Các khối code giữ nguyên (xem code ở Task tương ứng phần tiếng Anh).

**Mục tiêu:** Nạp tin RSS định kỳ → làm sạch → chunk → embed (bge-m3) → upsert vào Postgres/pgvector kèm chống trùng, để DB đầy `Article` + `Chunk` có vector 1024 chiều thật.

**Kiến trúc:** `IngestionModule` (NestJS) đăng ký 1 queue BullMQ dùng Redis có sẵn. Job lặp (cron) đẩy 1 job "fetch feed" cho mỗi feed. Worker parse feed, với mỗi bài MỚI thì bóc full text, chunk, gọi `EmbeddingService.embedBatch`, rồi upsert `Article` + `Chunk`. Vector ghi bằng raw SQL (`::vector`) vì Prisma không ghi được cột `Unsupported("vector")`.

**Công nghệ:** NestJS 11, `@nestjs/bullmq`+`bullmq`+`ioredis`, `rss-parser`, `@mozilla/readability`+`jsdom`, `cheerio`, `gpt-tokenizer`, `@paralleldrive/cuid2`, Prisma 6 `$executeRaw`.

## Ràng buộc toàn cục
- **Lỗi `&` đường dẫn (Windows):** chạy binary bằng `node <đường-dẫn-tương-đối>` từ `server/`, không `npm run`/`npx`. (Hết sau khi rename.)
- **Không git repo** — dùng mốc verify thay commit.
- **Số chiều embedding KHOÁ ở 1024** — `EmbeddingService` fail nếu sai.
- **Prisma không ghi được cột `vector`** — ghi bằng `$executeRaw` với `'[...]'::vector`.
- **Dịch vụ Docker:** Postgres `55432`, Redis `6379`, Ollama `11434`. Stack phải `up` cho các mốc tích hợp.
- **Khoá chống trùng:** `Article.url @unique` + `Article.contentHash @unique`.
- **Bắt đầu 1 feed** (VnExpress "Tin mới nhất"). Danh sách feed là dữ liệu, không phải code.
- **ĐÃ CHỐT:** id của Chunk khi insert raw lấy từ `@paralleldrive/cuid2` `createId()`.

## Cấu trúc file
Như sơ đồ phần tiếng Anh: thư mục `server/src/config/redis.config.ts` và `server/src/ingestion/` (feeds.config, rss.service, content-extractor.service, chunk.service(+spec), ingestion.service, ingestion.processor, ingestion.scheduler, ingestion.controller, ingestion.constants, ingestion.module). Sửa `app.module.ts` để import `IngestionModule`.

## Task 1: Deps + cấu hình Redis + đăng ký queue
- [ ] **1.1 Cài** (từ `server/`): `npm install @nestjs/bullmq bullmq ioredis rss-parser @mozilla/readability jsdom cheerio gpt-tokenizer @paralleldrive/cuid2` (`npm install` chạy được dù có `&`; chỉ shim script/.bin mới hỏng).
- [ ] **1.2** `config/redis.config.ts` — hàm `redisConnection(config)` đọc host/port từ env (code Task 1.2).
- [ ] **1.3** `ingestion.constants.ts` — `INGESTION_QUEUE`, `JOB_FETCH_FEED` (code Task 1.3).
- [ ] **1.4** `ingestion.module.ts` skeleton — `BullModule.forRootAsync` (connection từ env) + `registerQueue` (code Task 1.4).
- [ ] **1.5** Import `IngestionModule` vào `app.module.ts`.
- [ ] **1.6 Mốc verify:** build (`node node_modules/@nestjs/cli/bin/nest.js build`) → exit 0; `node dist/main.js` khởi động không lỗi Redis (Redis đang up).

## Task 2: ChunkService (TDD — logic thuần)
- [ ] **2.1 Viết test fail** (`chunk.service.spec.ts`, code Task 2.1): 1 chunk cho text ngắn; text dài tách nhiều chunk `ord` tăng dần và ≤400 token; text trống → mảng rỗng.
- [ ] **2.2 Chạy → FAIL:** `node node_modules/jest/bin/jest.js src/ingestion/chunk.service`.
- [ ] **2.3 Cài đặt `chunk.service.ts`** (code Task 2.3): gom từ thành cửa sổ tới hạn token (`encode` của gpt-tokenizer), overlap ~50 token, đảm bảo luôn tiến (từ khổng lồ vẫn cắt).
- [ ] **2.4 Chạy → PASS.**

## Task 3: RssService
- [ ] **3.1** `feeds.config.ts` — `FeedSource` + `DEFAULT_FEEDS` (1 feed VnExpress) (code Task 3.1).
- [ ] **3.2** `rss.service.ts` — `fetchFeed` dùng `rss-parser`, map sang `RawFeedItem` {url, title, source, publishedAt, summaryHtml} (code Task 3.2).
- [ ] **3.3 Mốc verify:** harness tạm gọi `fetchFeed(DEFAULT_FEEDS[0])`, in số item + url/title đầu tiên. Xác nhận >0. Xoá harness.

## Task 4: ContentExtractorService
- [ ] **4.1** Cài đặt `extract(url, fallbackHtml)` (code Task 4.1): fetch HTML → Readability bóc text; nếu <200 ký tự thì fallback strip `summaryHtml` bằng cheerio.
- [ ] **4.2 Mốc verify:** harness bóc item đầu tiên của Task 3, in độ dài text (>200 với bài thật). Xoá harness.

## Task 5: IngestionService (chống trùng + orchestrate + upsert vector)
- [ ] **5.1** Cài đặt (code Task 5.1):
  - `ingestArticle`: bỏ qua nếu `url` đã tồn tại → bóc content → tính `contentHash` (sha256) → bỏ qua nếu hash đã tồn tại → chunk → `embedBatch` → trong `$transaction`: `article.create` (Prisma) rồi mỗi chunk `$executeRaw INSERT ... ${createId()} ... ${literal}::vector`.
  - `ingestFeed`: lặp các item, đếm `processed`/`skipped`, bắt lỗi từng bài.
  - **Điểm khó nhất:** ghi vector bằng raw SQL với literal `'[...]'::vector`; id chunk từ `createId()`.
- [ ] **5.2 Mốc verify:** harness gọi `ingestArticle` 1 bài thật → `'inserted'`; kiểm tra SQL (psql): article=1, chunks>0, `vector_dims=1024`. Xoá harness.

## Task 6: BullMQ processor + scheduler + trigger thủ công
- [ ] **6.1** `ingestion.processor.ts` — `@Processor` xử lý `JOB_FETCH_FEED` → `ingestFeed` (code Task 6.1).
- [ ] **6.2** `ingestion.scheduler.ts` — `OnModuleInit` thêm job lặp mỗi 30 phút cho từng feed (code Task 6.2).
- [ ] **6.3** `ingestion.controller.ts` — `POST /ingestion/run` đẩy job ngay để test (code Task 6.3).
- [ ] **6.4** `ingestion.module.ts` — thêm `imports: [EmbeddingModule]`, providers (Rss, ContentExtractor, Chunk, Ingestion, Processor, Scheduler), `controllers: [IngestionController]`, giữ `BullModule` từ Task 1.

## Task 7: Verify đầu-cuối trên 1 feed
- [ ] **7.1** `docker compose ps` → postgres/redis/ollama healthy.
- [ ] **7.2** Build rồi `node dist/main.js`.
- [ ] **7.3** `curl -X POST http://localhost:3000/ingestion/run` → `{ "enqueued": 1 }`; theo dõi log `processed=N`.
- [ ] **7.4** Kiểm tra DB: articles>0, chunks>0, `vector_dims=1024`.
- [ ] **7.5** Trigger lần 2 → đa số `skipped` (chống trùng hoạt động).

**Phase 3 XONG khi:** 1 feed nạp được bài thật với vector 1024 chiều, chống trùng ngăn lặp, và job lặp đã đăng ký trong Redis.
