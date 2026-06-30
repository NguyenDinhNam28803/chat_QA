# NewsQA — Master Implementation Plan (Phase 1 → 7)

**Goal:** A closed-loop RAG chatbot over Vietnamese news: RSS ingest → pgvector retrieval → LLM (OpenRouter) answer with citations, streamed to a Next.js UI.

**Architecture:** NestJS backend (`server/`) with isolated modules (embedding, ingestion, retrieval, llm, chat) + Next.js frontend (`web/`). Postgres+pgvector, Redis+BullMQ, Ollama(bge-m3) all in Docker.

**Tech stack:** NestJS 11, Prisma 6, pgvector, BullMQ+ioredis, rss-parser, Readability+jsdom, gpt-tokenizer, `@langchain/openai`, Next.js 16.

## Global Constraints (apply to every task)
- **Windows `&`-path bug:** run binaries via `node <relative-path>` from `server/`, not `npm run`/`npx`. (Gone after rename to `d:\Chatbot_QA`.)
- **No git repo** — verification checkpoints instead of commits.
- **Embedding dim LOCKED at 1024**; `EmbeddingService` hard-fails on mismatch.
- **Vector column:** write via `$executeRaw` `'[...]'::vector`, read via `$queryRaw` `<=>`. Prisma never touches it directly.
- **Services in Docker:** Postgres `55432`, Redis `6379`, Ollama `11434`.

---

## Phase 0 — Infra & scaffold ✅ DONE
- Deleted nest `.git`; `docker-compose.yml` (pgvector pg16, redis7, ollama); `.env` in `server/`; `@nestjs/config` global; TS strict; Next.js in `web/`.

## Phase 1 — DB & Prisma + pgvector ✅ DONE
- `schema.prisma`: `Article`, `Chunk(embedding vector(1024))`, `Conversation`, `Message`. Migration with `CREATE EXTENSION vector` applied. `PrismaModule`/`PrismaService`. HNSW index deferred until data exists.

## Phase 2 — Embedding service ✅ DONE
- `EmbeddingModule`/`EmbeddingService` → Ollama `/api/embed` (bge-m3). `embed()`/`embedBatch()` verified 1024-dim; hard-fail on mismatch.

## Phase 3 — Ingestion (RSS + BullMQ) — detailed in `2026-06-27-phase3-ingestion.md`
Condensed task list:
1. Deps + `redis.config.ts` + queue registration.
2. `ChunkService` (TDD, ~400 tok/chunk, overlap ~50).
3. `feeds.config.ts` + `RssService.fetchFeed`.
4. `ContentExtractorService` (Readability → cheerio fallback).
5. `IngestionService` (dedup url+contentHash, embedBatch, raw `::vector` upsert in txn).
6. BullMQ `Processor` + `Scheduler` (cron) + `POST /ingestion/run`.
7. E2E verify on 1 feed (articles>0, dims=1024, dedup works).
**Decided:** chunk id for raw insert → add `@paralleldrive/cuid2` (`createId()`).

---

## Phase 4 — Retrieval service

**Files:**
- Create: `server/src/retrieval/retrieval.types.ts`
- Create: `server/src/retrieval/context.builder.ts` (pure, unit-tested)
- Create: `server/src/retrieval/context.builder.spec.ts`
- Create: `server/src/retrieval/retrieval.service.ts`
- Create: `server/src/retrieval/retrieval.module.ts`
- Modify: `server/src/app.module.ts`

**Interfaces produced:**
- `interface RetrievedChunk { content: string; articleId: string; url: string; title: string; source: string; distance: number }`
- `interface Citation { index: number; articleId: string; url: string; title: string; source: string }`
- `interface RetrievalResult { context: string; citations: Citation[] }`
- `buildContext(rows: RetrievedChunk[]): RetrievalResult`
- `RetrievalService.search(question: string, k?: number): Promise<RetrievalResult>`

- [ ] **4.1 Types** (`retrieval.types.ts`): the three interfaces above.

- [ ] **4.2 Failing test** (`context.builder.spec.ts`):
```ts
import { buildContext } from './context.builder';

describe('buildContext', () => {
  it('numbers chunks [1..n] and dedupes citations by articleId', () => {
    const { context, citations } = buildContext([
      { content: 'A1', articleId: 'a', url: 'u-a', title: 'TA', source: 'S', distance: 0.1 },
      { content: 'A2', articleId: 'a', url: 'u-a', title: 'TA', source: 'S', distance: 0.2 },
      { content: 'B1', articleId: 'b', url: 'u-b', title: 'TB', source: 'S', distance: 0.3 },
    ]);
    expect(context).toContain('[1] A1');
    expect(context).toContain('[2] A2');
    expect(context).toContain('[3] B1');
    expect(citations).toHaveLength(2);               // a, b
    expect(citations[0]).toMatchObject({ index: 1, articleId: 'a' });
  });

  it('returns empty for no rows', () => {
    expect(buildContext([])).toEqual({ context: '', citations: [] });
  });
});
```

- [ ] **4.3 Run → FAIL** (`node node_modules/jest/bin/jest.js src/retrieval/context.builder`).

- [ ] **4.4 Implement `context.builder.ts`:**
```ts
import { RetrievedChunk, RetrievalResult, Citation } from './retrieval.types';

export function buildContext(rows: RetrievedChunk[]): RetrievalResult {
  if (rows.length === 0) return { context: '', citations: [] };
  const context = rows.map((r, i) => `[${i + 1}] ${r.content}`).join('\n\n');
  const seen = new Map<string, Citation>();
  rows.forEach((r, i) => {
    if (!seen.has(r.articleId)) {
      seen.set(r.articleId, {
        index: i + 1, articleId: r.articleId, url: r.url, title: r.title, source: r.source,
      });
    }
  });
  return { context, citations: [...seen.values()] };
}
```

- [ ] **4.5 Run → PASS.**

- [ ] **4.6 Implement `retrieval.service.ts`** (vector search via `$queryRaw`):
```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { buildContext } from './context.builder';
import { RetrievedChunk, RetrievalResult } from './retrieval.types';

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  async search(question: string, k = 5): Promise<RetrievalResult> {
    const vec = await this.embedding.embed(question);
    const literal = `[${vec.join(',')}]`;
    const rows = await this.prisma.$queryRaw<RetrievedChunk[]>(Prisma.sql`
      SELECT c."content",
             a."id"     AS "articleId",
             a."url",
             a."title",
             a."source",
             (c."embedding" <=> ${literal}::vector) AS "distance"
      FROM "Chunk" c
      JOIN "Article" a ON a."id" = c."articleId"
      WHERE c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${literal}::vector
      LIMIT ${k}
    `);
    return buildContext(rows);
  }
}
```

- [ ] **4.7 Module** (`retrieval.module.ts`): imports `EmbeddingModule`; providers/exports `RetrievalService`. Import in `app.module.ts`.

- [ ] **4.8 Checkpoint** (needs Phase 3 data): harness calls `search('câu hỏi về <chủ đề đã ingest>')` → prints citations + first 200 chars of context; confirm on-topic and `distance` ascending. Delete harness.

> **Advanced (deferred, not in this plan):** hybrid `tsvector` full-text + vector; `publishedAt` recency filter; HNSW index once data is large.

---

## Phase 5 — LLM module (LangChain + OpenRouter)

**Prereq:** your **OpenRouter API key** in `server/.env`.

**Files:**
- Modify: `server/.env` + `.env.example` (uncomment OpenRouter vars)
- Create: `server/src/llm/qa.prompt.ts`
- Create: `server/src/llm/llm.service.ts`
- Create: `server/src/llm/llm.module.ts`
- Modify: `server/src/app.module.ts`

**Interfaces produced:**
- `buildQaMessages(question: string, context: string): (SystemMessage | HumanMessage)[]`
- `LlmService.streamAnswer(question: string, context: string): AsyncIterable<string>`

- [ ] **5.1 Install:** `npm install @langchain/openai @langchain/core` (from `server/`).

- [ ] **5.2 Env:** set `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`, `OPENROUTER_API_KEY=sk-or-...`, `LLM_PRIMARY_MODEL=deepseek/deepseek-chat-v3:free`, `LLM_FALLBACK_MODEL=meta-llama/llama-3.3-70b-instruct:free`, `APP_PUBLIC_URL`, `APP_TITLE`. **Verify the `:free` slugs are still live on OpenRouter** (roster changes).

- [ ] **5.3 Prompt** (`qa.prompt.ts`) — strict grounding:
```ts
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export function buildQaMessages(question: string, context: string) {
  const system = new SystemMessage(
    [
      'Bạn là trợ lý hỏi-đáp tin tức tiếng Việt.',
      'CHỈ trả lời dựa trên NGỮ CẢNH được cung cấp.',
      'Nếu ngữ cảnh không chứa câu trả lời, nói: "Tôi không tìm thấy thông tin này trong các nguồn hiện có."',
      'Luôn trích dẫn nguồn bằng [số] tương ứng với đoạn ngữ cảnh đã dùng.',
      'Không bịa thông tin.',
    ].join(' '),
  );
  const human = new HumanMessage(`NGỮ CẢNH:\n${context}\n\nCÂU HỎI: ${question}`);
  return [system, human];
}
```

- [ ] **5.4 Service** (`llm.service.ts`) — streaming + fallback:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { buildQaMessages } from './qa.prompt';

@Injectable()
export class LlmService {
  private readonly model: ChatOpenAI;

  constructor(config: ConfigService) {
    const base = {
      apiKey: config.getOrThrow<string>('OPENROUTER_API_KEY'),
      configuration: {
        baseURL: config.get<string>('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        defaultHeaders: {
          'HTTP-Referer': config.get<string>('APP_PUBLIC_URL', ''),
          'X-Title': config.get<string>('APP_TITLE', 'NewsQA'),
        },
      },
      temperature: 0.2,
      streaming: true,
    };
    const primary = new ChatOpenAI({ ...base, model: config.getOrThrow('LLM_PRIMARY_MODEL') });
    const fallback = new ChatOpenAI({ ...base, model: config.getOrThrow('LLM_FALLBACK_MODEL') });
    this.model = primary.withFallbacks([fallback]) as unknown as ChatOpenAI;
  }

  async *streamAnswer(question: string, context: string): AsyncIterable<string> {
    const stream = await this.model.stream(buildQaMessages(question, context));
    for await (const chunk of stream) {
      const text = typeof chunk.content === 'string' ? chunk.content : '';
      if (text) yield text;
    }
  }
}
```

- [ ] **5.5 Module** (`llm.module.ts`): provider/export `LlmService`. Import in `app.module.ts`.

- [ ] **5.6 Checkpoint:** harness streams `streamAnswer('Tóm tắt giúp tôi.', '[1] Một tin tức giả lập...')` and prints tokens as they arrive. Confirm tokens stream + a `[1]` citation appears. Log any 429/402. Delete harness.

---

## Phase 6 — Chat orchestration + SSE

**Files:**
- Create: `server/src/chat/chat.service.ts`
- Create: `server/src/chat/chat.controller.ts`
- Create: `server/src/chat/chat.module.ts`
- Modify: `server/src/app.module.ts`, `server/src/main.ts` (enable CORS for the web app)

**Interfaces produced:**
- `ChatService.stream(question, conversationId?): Observable<MessageEvent>` emitting `{ data: { token } }` events, a final `{ data: { done: true, citations, conversationId } }`, then complete.

- [ ] **6.1 Service** (`chat.service.ts`) — retrieve → stream → persist:
```ts
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmService,
  ) {}

  stream(question: string, conversationId?: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((sub) => {
      (async () => {
        const { context, citations } = await this.retrieval.search(question);
        const convo = conversationId
          ? { id: conversationId }
          : await this.prisma.conversation.create({ data: { title: question.slice(0, 80) } });

        await this.prisma.message.create({
          data: { conversationId: convo.id, role: 'user', content: question },
        });

        let answer = '';
        for await (const token of this.llm.streamAnswer(question, context)) {
          answer += token;
          sub.next({ data: { token } } as MessageEvent);
        }

        await this.prisma.message.create({
          data: { conversationId: convo.id, role: 'assistant', content: answer, citations },
        });
        sub.next({ data: { done: true, citations, conversationId: convo.id } } as MessageEvent);
        sub.complete();
      })().catch((err) => sub.error(err));
    });
  }
}
```

- [ ] **6.2 Controller** (`chat.controller.ts`):
```ts
import { Controller, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Sse('stream')
  stream(
    @Query('q') q: string,
    @Query('conversationId') conversationId?: string,
  ): Observable<MessageEvent> {
    return this.chat.stream(q, conversationId);
  }
}
```

- [ ] **6.3 Module** (`chat.module.ts`): imports `RetrievalModule`, `LlmModule`; provider `ChatService`; controller `ChatController`. Import in `app.module.ts`.

- [ ] **6.4 CORS** in `main.ts`: `app.enableCors({ origin: 'http://localhost:3000' });`

- [ ] **6.5 Checkpoint:** `curl -N 'http://localhost:3000/chat/stream?q=...'` → SSE `data:` token events stream, then a `done` event. Verify `Conversation` + 2 `Message` rows in DB.

---

## Phase 7 — Frontend Next.js streaming

**Files (in `web/`):**
- Create: `web/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:3000`)
- Create: `web/src/lib/useChatStream.ts`
- Modify: `web/src/app/page.tsx` (chat UI)

**Interfaces produced:**
- `useChatStream()` → `{ messages, send, streaming }`, consuming the SSE endpoint via `EventSource`.

- [ ] **7.1 Hook** (`useChatStream.ts`):
```ts
'use client';
import { useState } from 'react';

interface Citation { index: number; url: string; title: string; source: string }
interface ChatMessage { role: 'user' | 'assistant'; content: string; citations?: Citation[] }

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);

  function send(q: string) {
    setMessages((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setStreaming(true);
    const url = `${process.env.NEXT_PUBLIC_API_URL}/chat/stream?q=${encodeURIComponent(q)}`;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.token) {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            content: copy[copy.length - 1].content + data.token,
          };
          return copy;
        });
      } else if (data.done) {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], citations: data.citations };
          return copy;
        });
        setStreaming(false);
        es.close();
      }
    };
    es.onerror = () => { setStreaming(false); es.close(); };
  }
  return { messages, send, streaming };
}
```

- [ ] **7.2 UI** (`page.tsx`): input + send button calling `send`; render `messages` (assistant content live); render `citations` as links `[n] title (source)` → `url`. (Tailwind already set up.)

- [ ] **7.3 Checkpoint:** `node node_modules/next/dist/bin/next dev` in `web/` + backend running → ask a question in the browser → answer streams token-by-token, citations show and link to source articles.

---

## Milestones
- **MVP** = Phases 3→5 working on 1 feed (closed RAG loop, no stream yet) — the key psychological milestone.
- **Core** = Phases 6–7 + multiple feeds (full SSE streaming, citations, scheduled multi-source ingest).
- **Advanced** = hybrid search, rerank, recency filter, HNSW index, model fallback testing.

## Cross-phase risks (from KE_HOACH §6)
- Wrong vector dim → guarded by `EmbeddingService` (done).
- Model loses `:free` tag → slugs in env, `withFallbacks`, check periodically.
- Free rate limit → embedding stays off OpenRouter (done); add retry/backoff on ingest.
- Hallucination → strict grounding prompt + low temp + forced citations (Phase 5).
- Duplicate news across feeds → `contentHash` + `url unique` (Phase 3).

---
---

# 🇻🇳 BẢN TIẾNG VIỆT — Kế hoạch triển khai NewsQA (Phase 1 → 7)

> Bản dịch của tài liệu phía trên. Các khối code giữ nguyên (code không dịch). Đọc bản này là đủ, không cần cuộn lên.

**Mục tiêu:** Chatbot RAG khép kín hỏi-đáp tin tức tiếng Việt: nạp RSS → truy hồi bằng pgvector → LLM (OpenRouter) sinh câu trả lời kèm trích dẫn, stream ra UI Next.js.

**Kiến trúc:** Backend NestJS (`server/`) gồm các module độc lập (embedding, ingestion, retrieval, llm, chat) + frontend Next.js (`web/`). Postgres+pgvector, Redis+BullMQ, Ollama(bge-m3) chạy trong Docker.

**Công nghệ:** NestJS 11, Prisma 6, pgvector, BullMQ+ioredis, rss-parser, Readability+jsdom, gpt-tokenizer, `@langchain/openai`, Next.js 16.

## Ràng buộc toàn cục (áp dụng cho MỌI task)
- **Lỗi `&` trong đường dẫn trên Windows:** chạy binary bằng `node <đường-dẫn-tương-đối>` từ `server/`, KHÔNG dùng `npm run`/`npx`. (Hết lỗi sau khi rename thành `d:\Chatbot_QA`.)
- **Không có git repo** — dùng mốc verify thay cho commit.
- **Số chiều embedding KHOÁ ở 1024**; `EmbeddingService` tự fail nếu sai chiều.
- **Cột vector:** ghi bằng `$executeRaw` với literal `'[...]'::vector`, đọc bằng `$queryRaw` toán tử `<=>`. Prisma không bao giờ chạm trực tiếp.
- **Dịch vụ trong Docker:** Postgres `55432`, Redis `6379`, Ollama `11434`.

## Phase 0 — Hạ tầng & scaffold ✅ ĐÃ XONG
- Xoá `.git` của nest; `docker-compose.yml` (pgvector pg16, redis7, ollama); `.env` trong `server/`; `@nestjs/config` global; bật TS strict; scaffold Next.js trong `web/`.

## Phase 1 — DB & Prisma + pgvector ✅ ĐÃ XONG
- `schema.prisma`: `Article`, `Chunk(embedding vector(1024))`, `Conversation`, `Message`. Migration có `CREATE EXTENSION vector`. `PrismaModule`/`PrismaService`. Index HNSW hoãn tới khi có dữ liệu.

## Phase 2 — Embedding service ✅ ĐÃ XONG
- `EmbeddingModule`/`EmbeddingService` → Ollama `/api/embed` (bge-m3). `embed()`/`embedBatch()` đã verify 1024 chiều; fail cứng nếu sai chiều.

## Phase 3 — Ingestion (RSS + BullMQ) — chi tiết ở `2026-06-27-phase3-ingestion.md`
Danh sách task rút gọn:
1. Cài deps + `redis.config.ts` + đăng ký queue.
2. `ChunkService` (TDD, ~400 token/chunk, overlap ~50).
3. `feeds.config.ts` + `RssService.fetchFeed`.
4. `ContentExtractorService` (Readability → cheerio fallback).
5. `IngestionService` (dedup url+contentHash, embedBatch, upsert raw `::vector`).
6. BullMQ `Processor` + `Scheduler` (cron) + `POST /ingestion/run`.
7. Verify E2E 1 feed (articles>0, dims=1024, dedup chạy đúng).
**Đã chốt:** id của Chunk khi insert raw → thêm `@paralleldrive/cuid2` (`createId()`).

---

## Phase 4 — Retrieval service (Truy hồi)

**File:** tạo `retrieval/retrieval.types.ts`, `retrieval/context.builder.ts` (thuần, có unit test), `retrieval/context.builder.spec.ts`, `retrieval/retrieval.service.ts`, `retrieval/retrieval.module.ts`; sửa `app.module.ts`.

**Interface tạo ra:**
- `interface RetrievedChunk { content; articleId; url; title; source; distance }`
- `interface Citation { index; articleId; url; title; source }`
- `interface RetrievalResult { context: string; citations: Citation[] }`
- `buildContext(rows): RetrievalResult`
- `RetrievalService.search(question, k?=5): Promise<RetrievalResult>`

- [ ] **4.1 Types** (`retrieval.types.ts`): 3 interface trên.
- [ ] **4.2 Viết test fail** (`context.builder.spec.ts`): xem code Task 4.2 ở bản tiếng Anh — kiểm tra đánh số `[1..n]` và gom citations theo `articleId`, và trả về rỗng khi không có dòng nào.
- [ ] **4.3 Chạy → FAIL:** `node node_modules/jest/bin/jest.js src/retrieval/context.builder`.
- [ ] **4.4 Cài đặt `context.builder.ts`** (code như bản tiếng Anh Task 4.4): ghép context đánh số, gom citation duy nhất theo articleId.
- [ ] **4.5 Chạy → PASS.**
- [ ] **4.6 Cài đặt `retrieval.service.ts`** (code Task 4.6): embed câu hỏi → `$queryRaw` với `ORDER BY embedding <=> $vec::vector LIMIT k`, JOIN `Article` lấy metadata → `buildContext`.
- [ ] **4.7 Module** (`retrieval.module.ts`): import `EmbeddingModule`; provider/export `RetrievalService`; import vào `app.module.ts`.
- [ ] **4.8 Mốc verify** (cần dữ liệu Phase 3): harness gọi `search('câu hỏi về <chủ đề đã nạp>')` → in citations + 200 ký tự đầu của context; xác nhận đúng chủ đề và `distance` tăng dần. Xoá harness.

> **Nâng cao (hoãn):** hybrid `tsvector` + vector; lọc theo `publishedAt`; tạo index HNSW khi dữ liệu lớn.

---

## Phase 5 — LLM module (LangChain + OpenRouter)

**Tiền đề:** cần **OpenRouter API key** trong `server/.env`.

**File:** sửa `.env`/`.env.example` (bật biến OpenRouter); tạo `llm/qa.prompt.ts`, `llm/llm.service.ts`, `llm/llm.module.ts`; sửa `app.module.ts`.

**Interface tạo ra:**
- `buildQaMessages(question, context): (SystemMessage | HumanMessage)[]`
- `LlmService.streamAnswer(question, context): AsyncIterable<string>`

- [ ] **5.1 Cài:** `npm install @langchain/openai @langchain/core` (từ `server/`).
- [ ] **5.2 Env:** đặt `OPENROUTER_BASE_URL`, `OPENROUTER_API_KEY=sk-or-...`, `LLM_PRIMARY_MODEL`, `LLM_FALLBACK_MODEL`, `APP_PUBLIC_URL`, `APP_TITLE`. **Kiểm tra slug `:free` còn sống trên OpenRouter** (roster hay đổi).
- [ ] **5.3 Prompt** (`qa.prompt.ts`, code Task 5.3): system prompt grounding nghiêm ngặt — CHỈ trả lời từ ngữ cảnh, không có thì nói "không tìm thấy", bắt buộc trích dẫn `[số]`, không bịa.
- [ ] **5.4 Service** (`llm.service.ts`, code Task 5.4): `ChatOpenAI` trỏ baseURL OpenRouter + header, `temperature 0.2`, `streaming true`, `withFallbacks([fallback])`; `streamAnswer` dùng `.stream()` và yield từng token text.
- [ ] **5.5 Module** (`llm.module.ts`): provider/export `LlmService`; import vào `app.module.ts`.
- [ ] **5.6 Mốc verify:** harness stream `streamAnswer('Tóm tắt giúp tôi.', '[1] Một tin tức giả lập...')` và in token khi tới. Xác nhận token chảy + xuất hiện `[1]`. Log 429/402 nếu có. Xoá harness.

---

## Phase 6 — Chat orchestration + SSE

**File:** tạo `chat/chat.service.ts`, `chat/chat.controller.ts`, `chat/chat.module.ts`; sửa `app.module.ts`, `main.ts` (bật CORS cho web).

**Interface tạo ra:**
- `ChatService.stream(question, conversationId?): Observable<MessageEvent>` phát sự kiện `{ data: { token } }`, sự kiện cuối `{ data: { done: true, citations, conversationId } }`, rồi complete.

- [ ] **6.1 Service** (`chat.service.ts`, code Task 6.1): retrieval.search → tạo/ lấy `Conversation` → lưu message user → stream LLM (gom `answer`, phát từng token) → lưu message assistant kèm citations → phát `done`.
- [ ] **6.2 Controller** (`chat.controller.ts`, code Task 6.2): `@Sse('stream')` nhận `q`, `conversationId?` qua query → trả Observable.
- [ ] **6.3 Module** (`chat.module.ts`): import `RetrievalModule`, `LlmModule`; provider `ChatService`; controller `ChatController`; import vào `app.module.ts`.
- [ ] **6.4 CORS** trong `main.ts`: `app.enableCors({ origin: 'http://localhost:3000' });`
- [ ] **6.5 Mốc verify:** `curl -N 'http://localhost:3000/chat/stream?q=...'` → token chảy theo SSE, rồi sự kiện `done`. Kiểm tra DB có 1 `Conversation` + 2 `Message`.

---

## Phase 7 — Frontend Next.js streaming

**File (trong `web/`):** tạo `.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:3000`), `src/lib/useChatStream.ts`; sửa `src/app/page.tsx` (UI chat).

**Interface tạo ra:** `useChatStream()` → `{ messages, send, streaming }`, tiêu thụ SSE qua `EventSource`.

- [ ] **7.1 Hook** (`useChatStream.ts`, code Task 7.1): mở `EventSource` tới `/chat/stream?q=...`; mỗi `token` append vào message assistant cuối; khi `done` gắn citations và đóng stream.
- [ ] **7.2 UI** (`page.tsx`): ô nhập + nút gửi gọi `send`; render `messages` (assistant chảy dần); render citations dạng link `[n] tiêu đề (nguồn)` → `url`. (Tailwind đã có.)
- [ ] **7.3 Mốc verify:** chạy `node node_modules/next/dist/bin/next dev` trong `web/` + backend chạy → hỏi trên trình duyệt → câu trả lời chảy từng token, citations hiện và link tới bài gốc.

---

## Các mốc (Milestones)
- **MVP** = Phase 3→5 chạy được trên 1 feed (RAG khép kín, chưa stream) — mốc tâm lý quan trọng nhất.
- **Core** = Phase 6–7 + nhiều feed (SSE đầy đủ, citations, nạp định kỳ đa nguồn).
- **Advanced** = hybrid search, rerank, lọc thời gian, index HNSW, kiểm thử fallback model.

## Rủi ro xuyên suốt (từ KE_HOACH §6)
- Sai số chiều vector → đã chặn bởi `EmbeddingService` (xong).
- Model mất tag `:free` → để slug trong env, `withFallbacks`, kiểm tra định kỳ.
- Rate limit free → embedding không đi qua OpenRouter (xong); thêm retry/backoff khi nạp.
- Hallucination → prompt grounding nghiêm + temp thấp + bắt buộc citation (Phase 5).
- Tin trùng giữa các feed → `contentHash` + `url unique` (Phase 3).
