# NewsQA — Chatbot RAG hỏi-đáp tin tức tiếng Việt

> Hỏi bằng tiếng Việt về tin tức, nhận câu trả lời **được tổng hợp từ các bài báo đã nạp** và **luôn kèm trích dẫn nguồn** để kiểm chứng. Câu trả lời stream từng token ra giao diện web.

**Luồng cốt lõi:** RSS ingest → cắt đoạn + embed (bge-m3) → lưu **pgvector** → truy hồi theo ngữ nghĩa → **LLM (OpenRouter)** sinh câu trả lời kèm `[số]` → **SSE** stream ra **Next.js UI**.

---

## 📑 Mục lục

- [Đây là gì? (RAG, không phải train model)](#-đây-là-gì-rag-không-phải-train-model)
- [Tính năng](#-tính-năng)
- [Kiến trúc](#-kiến-trúc)
- [Tech stack](#-tech-stack)
- [Bắt đầu nhanh](#-bắt-đầu-nhanh)
- [Cấu hình (.env)](#-cấu-hình-env)
- [Bảng cổng dịch vụ](#-bảng-cổng-dịch-vụ)
- [Cấu trúc dự án](#-cấu-trúc-dự-án)
- [Lệnh thường dùng](#-lệnh-thường-dùng)
- [Xử lý sự cố](#-xử-lý-sự-cố)
- [Tài liệu](#-tài-liệu)
- [Trạng thái](#-trạng-thái)

---

## 🎯 Đây là gì? (RAG, không phải train model)

NewsQA dùng kiến trúc **RAG (Retrieval-Augmented Generation)**:

- **LLM KHÔNG được train lại** trên tin tức. Nó là model đa năng có sẵn (qua OpenRouter), **không biết gì** về bài báo cụ thể của bạn.
- "Kiến thức" tin tức nằm trong **database vector (pgvector)** — không nằm trong não AI.
- Mỗi câu hỏi: hệ thống **tìm vài đoạn tin liên quan nhất** rồi "nhét" vào prompt cho LLM. LLM **chỉ trả lời dựa trên đoạn đó** + bắt buộc ghi nguồn.

> Ví von: LLM như một sinh viên giỏi văn nhưng **chưa đọc báo**. Mỗi câu hỏi, hệ thống đưa cho cậu ấy đúng vài đoạn báo liên quan và bảo "chỉ trả lời dựa trên mấy đoạn này". → Tin luôn cập nhật mà không phải train lại; AI khó bịa; mọi câu trả lời truy được về nguồn thật.

---

## ✨ Tính năng

- 🔎 **Truy hồi theo ngữ nghĩa** bằng pgvector (cosine `<=>`) — tìm theo *ý nghĩa*, không phải khớp từ khóa.
- 📰 **Nạp tin tự động** từ nhiều nguồn RSS (VnExpress, Tuổi Trẻ, Thanh Niên) định kỳ qua BullMQ cron.
- 🛡️ **Chống trùng 2 lớp** — theo URL và theo hash nội dung (SHA-256).
- 💬 **Trả lời stream từng token** qua SSE — UI hiện chữ dần như đang gõ.
- 🔗 **Trích dẫn nguồn** — mỗi câu trả lời kèm link bài gốc để kiểm chứng.
- 🧱 **Grounding nghiêm ngặt** — prompt ép "chỉ trả lời từ ngữ cảnh, không có thì nói không tìm thấy" → chống ảo giác.
- ⚡ **2 Ollama tách biệt** — nạp tin nền không làm chậm chat.
- 🔁 **Fallback model** — tự chuyển model dự phòng khi model chính bị rate-limit.

---

## 🏗️ Kiến trúc

```mermaid
flowchart LR
    subgraph Client["🖥️ Trình duyệt :3001"]
        UI["Next.js UI<br/>useChatStream (EventSource)"]
    end

    subgraph Backend["⚙️ NestJS :3000"]
        CHAT["ChatService<br/>@Sse /chat/stream"]
        RET["RetrievalService"]
        LLM["LlmService<br/>(LangChain)"]
        ING["IngestionModule<br/>BullMQ worker + cron"]
    end

    subgraph Infra["🐳 Docker"]
        PG[("Postgres + pgvector<br/>:55432")]
        REDIS[("Redis<br/>:6380")]
        OLC["Ollama chat<br/>:11434"]
        OLI["Ollama ingest<br/>:11435"]
    end

    EXT["🌐 RSS feeds"]
    OR["☁️ OpenRouter LLM"]

    UI -- "GET /chat/stream?q=" --> CHAT
    CHAT --> RET
    RET -- "embed câu hỏi" --> OLC
    RET -- "vector search <=>" --> PG
    CHAT -- "stream prompt+context" --> OR
    OR -- "tokens" --> CHAT
    CHAT -- "SSE tokens + citations" --> UI
    CHAT -- "lưu hội thoại" --> PG

    ING -- "job qua" --> REDIS
    ING -- "tải RSS" --> EXT
    ING -- "embed chunk" --> OLI
    ING -- "ghi Article+Chunk ::vector" --> PG
```

**Điểm mấu chốt:** chat và ingestion dùng **2 Ollama riêng** (cùng model `bge-m3` → vector 1024) nên nạp tin nền không "bỏ đói" việc embed câu hỏi của chat.

---

## 🧰 Tech stack

| Lớp | Công nghệ |
|---|---|
| Backend | **NestJS 11** (TypeScript strict) |
| ORM / DB | **Prisma 6** (không nâng v7) + **Postgres 16** + **pgvector** |
| Hàng đợi | **BullMQ** + ioredis + **Redis 7** |
| Ingest | rss-parser, @mozilla/readability + jsdom, cheerio, gpt-tokenizer, @paralleldrive/cuid2 |
| Embedding | **Ollama `bge-m3`** → vector **1024 chiều** (2 instance: chat + ingest) |
| LLM | `@langchain/openai` → **OpenRouter** (`gpt-oss-120b:free` + fallback `gpt-oss-20b:free`) |
| Frontend | **Next.js 16** (App Router) + **Tailwind** |

---

## 🚀 Bắt đầu nhanh

**Yêu cầu:** Node.js (v24), Docker Desktop (~3GB RAM trống cho 2 model), [OpenRouter API key](https://openrouter.ai/keys).

```bash
# 1. Hạ tầng (từ thư mục gốc)
docker compose up -d
#   -> Postgres :55432 · Redis :6380 · Ollama chat :11434 · Ollama ingest :11435

# 2. Kéo model embedding vào CẢ HAI Ollama (1 lần)
docker exec newsqa-ollama        ollama pull bge-m3
docker exec newsqa-ollama-ingest ollama pull bge-m3

# 3. Backend
cd server
npm install
cp .env.example .env          # rồi điền OPENROUTER_API_KEY
node node_modules/prisma/build/index.js migrate deploy
node node_modules/@nestjs/cli/bin/nest.js build
node dist/main.js             # backend :3000 (tự nạp tin nếu INGEST_ON_BOOT=true)

# 4. Nạp tin ngay (tùy chọn, terminal khác)
curl -X POST http://localhost:3000/ingestion/run

# 5. Frontend (terminal khác)
cd web
npm install
node node_modules/next/dist/bin/next dev -p 3001

# 6. Mở http://localhost:3001
```

> **Cổng:** backend giữ :3000, Next chạy :3001 (CORS backend đã mở cho origin :3001).

---

## ⚙️ Cấu hình (.env)

File `server/.env` (mẫu ở `server/.env.example`):

| Biến | Giá trị mặc định | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | `postgresql://newsqa:newsqa@localhost:55432/newsqa` | Postgres |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6380` | Redis (6380 tránh Redis native giữ 6379) |
| `INGEST_ON_BOOT` | `true` | Tự nạp tin khi boot (`false` để tắt) |
| `OPENROUTER_API_KEY` | *(bắt buộc điền)* | Key LLM cho chat |
| `LLM_PRIMARY_MODEL` | `openai/gpt-oss-120b:free` | Model chính |
| `LLM_FALLBACK_MODEL` | `openai/gpt-oss-20b:free` | Model dự phòng (khi 429) |
| `EMBEDDING_BASE_URL` | `http://localhost:11434` | Ollama cho chat/retrieval |
| `EMBEDDING_INGEST_BASE_URL` | `http://localhost:11435` | Ollama cho ingestion |
| `EMBEDDING_MODEL` / `EMBEDDING_DIM` | `bge-m3` / `1024` | KHOÁ theo schema |

File `web/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:3000`.

---

## 🔌 Bảng cổng dịch vụ

| Dịch vụ | Cổng host | Ghi chú |
|---|---|---|
| Backend (NestJS) | **3000** | API + SSE |
| Frontend (Next.js) | **3001** | `next dev -p 3001` |
| Postgres + pgvector | **55432** | tránh Postgres native 5432/5433 |
| Redis | **6380** | tránh Redis native 3.0.504 ở 6379 |
| Ollama (chat) | **11434** | embed câu hỏi |
| Ollama (ingest) | **11435** | embed khi nạp tin |

---

## 📁 Cấu trúc dự án

```
d:\Chatbot_QA\
├─ README.md                 # tài liệu này
├─ docker-compose.yml        # Postgres+pgvector, Redis, Ollama x2
├─ docs/                     # ONBOARDING, BUSINESS-FLOW, CAI-TIEN, plans/
├─ server/                   # Backend NestJS
│  ├─ prisma/schema.prisma   # Article, Chunk(vector 1024), Conversation, Message
│  └─ src/
│     ├─ embedding/          # bge-m3 qua Ollama (2 instance); hard-fail nếu sai 1024
│     ├─ ingestion/          # nạp: rss, content-extractor, chunk, ingestion, processor, scheduler
│     ├─ retrieval/          # truy hồi: context.builder + retrieval.service ($queryRaw <=>)
│     ├─ llm/                # qa.prompt (grounding) + llm.service (stream + fallback)
│     ├─ chat/               # orchestration: retrieve→stream→persist; @Sse controller
│     └─ main.ts             # bootstrap + CORS + lưới uncaughtException
└─ web/                      # Frontend Next.js 16
   └─ src/
      ├─ lib/useChatStream.ts  # hook EventSource (SSE)
      └─ app/page.tsx          # UI chat (bong bóng, citations, composer)
```

---

## 🛠️ Lệnh thường dùng

```bash
# Test (từ server/)
node node_modules/jest/bin/jest.js

# Build backend
node node_modules/@nestjs/cli/bin/nest.js build

# Nạp tin thủ công
curl -X POST http://localhost:3000/ingestion/run

# Hỏi qua SSE (không cần UI)
curl -N "http://localhost:3000/chat/stream?q=Vietnam%20Airlines%20lãi%20bao%20nhiêu"

# Soi DB
docker exec newsqa-postgres psql -U newsqa -d newsqa -c 'SELECT count(*) FROM "Article";'
docker exec newsqa-postgres psql -U newsqa -d newsqa -c 'SELECT DISTINCT vector_dims(embedding) FROM "Chunk";'

# Kiểm tra model OpenRouter còn sống
curl https://openrouter.ai/api/v1/models
```

---

## 🚑 Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| BullMQ `Redis version needs >= 5.0.0` | Redis native giữ 6379 → dùng Docker redis ở **6380** (`REDIS_PORT=6380`) |
| Chat `429 Provider returned error` | Model `:free` bị rate-limit → đổi `LLM_*_MODEL` sang slug còn sống |
| Chat treo/chậm khi đang nạp | Đã sửa bằng **2 Ollama**; hoặc đặt `INGEST_ON_BOOT=false` |
| Backend tự sập exit 1 khi nạp | Lỗi undici khi fetch báo → đã có lưới `uncaughtException` trong `main.ts` |

> Chi tiết đầy đủ: [docs/ONBOARDING.md §9](docs/ONBOARDING.md) · [docs/CAI-TIEN.md](docs/CAI-TIEN.md).

---

## 📚 Tài liệu

| File | Nội dung |
|---|---|
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Chạy & hiểu dự án trong ~15 phút |
| [docs/BUSINESS-FLOW.md](docs/BUSINESS-FLOW.md) | Luồng nghiệp vụ chi tiết + code + sơ đồ Mermaid + payload thật |
| [docs/CAI-TIEN.md](docs/CAI-TIEN.md) | Nhật ký cải tiến (vấn đề → giải pháp → bằng chứng) |
| [docs/plans/](docs/plans/) | Kế hoạch triển khai gốc (Phase 1→7) |

---

## 📊 Trạng thái

**7/7 phase hoàn tất** + nhiều cải tiến (2 Ollama, sửa crash undici, UI mới, fallback model). RAG loop chạy thật end-to-end: vừa nạp tin nền vừa chat mượt, kèm trích dẫn nguồn.

**Tầng "Advanced" (chưa làm, tùy chọn):** hybrid search (full-text `tsvector` + vector), rerank, lọc theo `publishedAt`, index **HNSW** khi dữ liệu lớn.

> ⚠️ Dự án hiện **không dùng git repo** — các mốc kiểm thử thay cho commit.
