# NewsQA — Tài liệu Onboarding

> Chatbot RAG hỏi-đáp tin tức tiếng Việt: RSS ingest → pgvector retrieval → LLM (OpenRouter) trả lời kèm trích dẫn → stream ra UI Next.js.
>
> Tài liệu này giúp người mới chạy được dự án trong ~15 phút và hiểu kiến trúc để bắt đầu đóng góp.

---

## 1. Bức tranh tổng thể (đọc trước)

Đây là hệ thống **RAG (Retrieval-Augmented Generation)**, KHÔNG phải train model.

- LLM (Qwen/GPT-OSS qua OpenRouter) là model đa năng có sẵn, **không biết gì về tin tức của ta**.
- "Kiến thức" tin tức nằm trong **Postgres + pgvector** (vector embeddings của các đoạn tin).
- Mỗi câu hỏi: hệ thống embed câu hỏi → tìm 5 đoạn tin gần nghĩa nhất → nhét vào prompt → LLM trả lời CHỈ dựa trên đoạn đó + ghi `[số]` trích dẫn.

Chi tiết luồng nghiệp vụ: xem [§7 Luồng nghiệp vụ](#7-luồng-nghiệp-vụ-end-to-end).

---

## 2. Tech stack

| Lớp | Công nghệ |
|---|---|
| Backend | NestJS 11 (TypeScript strict) |
| ORM / DB | Prisma 6 (KHÔNG nâng lên 7) + Postgres 16 + pgvector |
| Hàng đợi | BullMQ + ioredis + Redis 7 |
| Ingest | rss-parser, @mozilla/readability + jsdom, cheerio, gpt-tokenizer, @paralleldrive/cuid2 |
| Embedding | Ollama `bge-m3` → vector **1024 chiều** (KHOÁ trong schema) |
| LLM | `@langchain/openai` → OpenRouter (model `:free`) |
| Frontend | Next.js 16 (App Router) + Tailwind |

---

## 3. Yêu cầu môi trường

- **Node.js** (đã test trên v24), npm
- **Docker Desktop** (chạy Postgres, Redis, Ollama)
- **OpenRouter API key** — lấy free tại https://openrouter.ai/keys (chỉ cần cho chat, không cần cho ingest)

---

## 4. Cài đặt & chạy (lần đầu)

```bash
# 1. Khởi động hạ tầng (từ thư mục gốc d:\Chatbot_QA)
docker compose up -d
#    -> Postgres (host 55432), Redis (host 6380), Ollama (11434)

# 2. Kéo model embedding (chỉ 1 lần)
docker exec newsqa-ollama ollama pull bge-m3

# 3. Backend
cd server
npm install
# Tạo server/.env từ .env.example và điền OPENROUTER_API_KEY
node node_modules/prisma/build/index.js migrate deploy   # áp migration (nếu DB trống)
node node_modules/@nestjs/cli/bin/nest.js build
node dist/main.js                                         # chạy backend :3000

# 4. Nạp dữ liệu lần đầu (terminal khác)
curl -X POST http://localhost:3000/ingestion/run
#    Hoặc đợi cron 30' tự chạy. Theo dõi log "processed=N".

# 5. Frontend (terminal khác)
cd web
npm install
node node_modules/next/dist/bin/next dev -p 3001         # chạy UI :3001

# 6. Mở http://localhost:3001
```

> **Cổng:** backend dùng :3000, nên Next chạy :3001. Backend CORS đã mở cho origin `http://localhost:3001`.

---

## 5. Cấu trúc dự án

```
d:\Chatbot_QA\
├─ docker-compose.yml        # Postgres+pgvector, Redis, Ollama
├─ docs/                     # kế hoạch + tài liệu này
├─ server/                   # Backend NestJS
│  ├─ .env                   # config (DATABASE_URL, REDIS_PORT, OPENROUTER_*, EMBEDDING_*)
│  ├─ prisma/schema.prisma   # Article, Chunk(vector 1024), Conversation, Message
│  └─ src/
│     ├─ prisma/             # PrismaModule/Service (global)
│     ├─ embedding/          # bge-m3 qua Ollama; hard-fail nếu sai 1024 chiều
│     ├─ ingestion/          # PHA NẠP: rss, content-extractor, chunk, ingestion,
│     │                      #          processor(BullMQ), scheduler(cron), controller
│     ├─ retrieval/          # PHA TRUY HỒI: context.builder + retrieval.service ($queryRaw <=>)
│     ├─ llm/                # qa.prompt (grounding) + llm.service (stream + fallback)
│     ├─ chat/               # orchestration: retrieve→stream→persist; @Sse controller
│     ├─ config/redis.config.ts
│     └─ main.ts             # bootstrap + CORS
└─ web/                      # Frontend Next.js 16
   ├─ .env.local             # NEXT_PUBLIC_API_URL=http://localhost:3000
   └─ src/
      ├─ lib/useChatStream.ts  # hook EventSource (SSE)
      └─ app/page.tsx          # UI chat (input, bong bóng, citations)
```

---

## 6. Các quy ước & ràng buộc BẮT BUỘC nhớ

1. **Không có git repo** — dùng mốc verify thay commit. Đừng giả định lịch sử git.
2. **Embedding KHOÁ 1024 chiều.** Đổi model embedding = đổi `vector(N)` trong schema + re-embed toàn bộ DB. `EmbeddingService` tự fail nếu sai chiều.
3. **Prisma KHÔNG ghi được cột `vector`.** Ghi vector bằng `$executeRaw` với literal `'[...]'::vector`; đọc bằng `$queryRaw` toán tử `<=>`. Id chunk khi insert raw lấy từ `createId()` (cuid2).
4. **Prisma giữ ở v6** (v7 bỏ `url = env()` trong schema). Đừng để drift lên 7.
5. **Cùng model embedding cho cả nạp và hỏi** (bge-m3) — khác model thì so sánh vector vô nghĩa.

---

## 7. Luồng nghiệp vụ end-to-end

> 📖 Phiên bản **chi tiết kèm code xử lý từng bước**: [BUSINESS-FLOW.md](BUSINESS-FLOW.md).

### PHA A — Nạp dữ liệu (nền, cron 30')
RSS (`rss.service`) → chống trùng URL → bóc text (`content-extractor`: Readability→cheerio) → chống trùng SHA-256 → cắt đoạn ~400 token/overlap 50 (`chunk.service`) → embed bge-m3 (`embedding.service`) → lưu `Article`+`Chunk` raw `::vector` (`ingestion.service`).

### PHA B — Hỏi-đáp (real-time)
1. UI mở `EventSource` → `GET /chat/stream?q=...`
2. `ChatService` embed câu hỏi (Ollama bge-m3)
3. `RetrievalService` → `$queryRaw ... ORDER BY embedding <=> $vec LIMIT 5`
4. `buildContext` đánh số `[1..n]` + gom citations
5. Lưu Message(user) → gọi OpenRouter với prompt grounding nghiêm
6. LLM stream từng token ngược qua SSE → UI hiện dần
7. Lưu Message(assistant)+citations → emit event `done`
8. UI render link nguồn

---

## 8. Lệnh thường dùng

> Lưu ý: chạy binary bằng `node <đường-dẫn>` (không `npm run`/`npx`) là thói quen từ thời path có ký tự `&`; nay đã rename nên npm cũng chạy được, nhưng nhiều mốc verify trong docs vẫn viết kiểu `node ...`.

```bash
# Test (từ server/)
node node_modules/jest/bin/jest.js                 # toàn bộ
node node_modules/jest/bin/jest.js src/retrieval   # 1 nhóm

# Build backend
node node_modules/@nestjs/cli/bin/nest.js build

# Nạp thủ công ngay
curl -X POST http://localhost:3000/ingestion/run

# Hỏi qua SSE (test backend không cần UI)
curl -N "http://localhost:3000/chat/stream?q=Vietnam%20Airlines%20lãi%20bao%20nhiêu"

# Soi DB
docker exec newsqa-postgres psql -U newsqa -d newsqa -c 'SELECT count(*) FROM "Article";'
docker exec newsqa-postgres psql -U newsqa -d newsqa -c 'SELECT DISTINCT vector_dims(embedding) FROM "Chunk";'
```

---

## 9. Cạm bẫy đã gặp & cách xử lý (QUAN TRỌNG)

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| BullMQ: `Redis version needs >= 5.0.0 Current: 3.0.504` | Một Redis native 3.0.504 (Windows service) chiếm cổng 6379, che container Docker | Docker redis map ra **host 6380**; `REDIS_PORT=6380` trong `.env`. KHÔNG đụng service native. |
| Chat trả `429 Provider returned error` | Model `:free` của OpenRouter bị **rate-limit upstream** (xoay vòng theo provider) | Probe slug còn sống: `POST /chat/completions` thử model. Đổi `LLM_PRIMARY_MODEL`/`FALLBACK` trong `.env`. Đã set `maxRetries:1` để rớt sang fallback nhanh. |
| Slug model biến mất (vd `deepseek-chat-v3:free`) | OpenRouter gỡ model free | Liệt kê model sống: `curl https://openrouter.ai/api/v1/models`. Cập nhật slug trong `.env`. |
| `/chat/stream` treo 50s rồi timeout | `RetrievalService` embed câu hỏi qua Ollama, nhưng **ingestion worker đang chiếm Ollama** | Chờ ingestion lắng (article count ổn định) rồi mới hỏi. Ollama xử lý tuần tự. |
| Build TS lỗi `Could not find declaration for 'jsdom'` | Thiếu types | `npm install -D @types/jsdom` |
| Prisma lỗi gán `citations` (Citation[]) vào cột Json | Json field cần `InputJsonValue` | Cast `citations as unknown as Prisma.InputJsonValue` |

---

## 10. ⚠️ Lưu ý khi sửa frontend (Next.js 16)

`web/AGENTS.md` cảnh báo Next 16 có breaking changes. **Đọc `web/node_modules/next/dist/docs/` trước khi viết code Next.** Đã xác nhận `"use client"` và biến `NEXT_PUBLIC_` vẫn dùng như cũ.

---

## 11. Trạng thái hiện tại & việc tiếp theo

- **7/7 phase DONE**, RAG loop chạy thật end-to-end. Đạt mốc "Core".
- **Tầng "Advanced" (tùy chọn):** hybrid search (kết hợp full-text `tsvector` + vector), rerank, lọc theo `publishedAt`, tạo index **HNSW** khi data lớn, kiểm thử fallback model.
- Kế hoạch gốc: [docs/plans/2026-06-27-newsqa-master-plan.md](plans/2026-06-27-newsqa-master-plan.md), [Phase 3 chi tiết](plans/2026-06-27-phase3-ingestion.md).
