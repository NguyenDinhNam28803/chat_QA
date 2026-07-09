# NewsQA — Chatbot RAG hỏi-đáp tin tức tiếng Việt

> Hỏi bằng tiếng Việt về tin tức, nhận câu trả lời **được tổng hợp từ các bài báo đã nạp** và **luôn kèm trích dẫn nguồn** để kiểm chứng. Câu trả lời stream từng token ra giao diện web.

**Luồng cốt lõi:** RSS ingest → phân loại chủ đề → cắt đoạn + embed (bge-m3) → lưu **pgvector** → **hybrid retrieval** (vector + full-text + RRF + recency boost) → **LLM (OpenRouter)** sinh câu trả lời kèm `[số]` → **SSE** stream ra **Next.js UI**.

> 📊 **Người mới / cần báo cáo tổng thể?** Đọc **[docs/BAO-CAO-DU-AN.md](docs/BAO-CAO-DU-AN.md)** — báo cáo + hướng dẫn onboard đầy đủ (kiến trúc, mô hình dữ liệu, cách dùng **Ollama & OpenRouter**, luồng nghiệp vụ + sơ đồ, bản đồ file). Sơ đồ tương tác: [docs/architecture.html](docs/architecture.html).

---

## 📑 Mục lục

- [Đây là gì? (RAG, không phải train model)](#-đây-là-gì-rag-không-phải-train-model)
- [Tính năng](#-tính-năng)
- [Kiến trúc](#-kiến-trúc)
- [Lĩnh vực dữ liệu & luồng xử lý chi tiết (file + hàm)](#-lĩnh-vực-dữ-liệu--luồng-xử-lý-chi-tiết-file--hàm)
- [Tech stack](#-tech-stack)
- [Bắt đầu nhanh](#-bắt-đầu-nhanh)
- [Triển khai Docker (Production)](#-triển-khai-docker-production)
- [Cấu hình (.env)](#-cấu-hình-env)
- [Bảng cổng dịch vụ](#-bảng-cổng-dịch-vụ)
- [API Endpoints](#-api-endpoints)
- [Cấu trúc dự án](#-cấu-trúc-dự-án)
- [Lệnh thường dùng](#-lệnh-thường-dùng)
- [CI/CD](#-cicd)
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

- 🔎 **Hybrid retrieval** — kết hợp **vector search** (cosine `<=>`) + **full-text search** (`tsvector`) qua **Reciprocal Rank Fusion** + **recency boost** → bắt cả ngữ nghĩa lẫn tên riêng/số liệu, ưu tiên tin mới.
- 📰 **Nạp tin tự động** từ nhiều nguồn RSS (VnExpress, Tuổi Trẻ, Thanh Niên) định kỳ qua BullMQ cron.
- 🏷️ **Phân loại chủ đề tự động** — 9 lĩnh vực (Thể thao, Kinh tế, Công nghệ, Pháp luật, Sức khỏe, Giáo dục, Giải trí, Thế giới, Khác) bằng bộ luật từ khóa (nhanh, offline, xác định).
- 🛡️ **Chống trùng 2 lớp** — theo URL và theo hash nội dung (SHA-256).
- 💬 **Trả lời stream từng token** qua SSE — UI hiện chữ dần như đang gõ.
- 🔗 **Trích dẫn nguồn** — mỗi câu trả lời kèm link bài gốc để kiểm chứng.
- 🧱 **Grounding nghiêm ngặt** — prompt ép "chỉ trả lời từ ngữ cảnh, không có thì nói không tìm thấy" → chống ảo giác.
- ⚡ **2 Ollama tách biệt** — nạp tin nền không làm chậm chat.
- 🔁 **Fallback model** — tự chuyển model dự phòng khi model chính bị rate-limit.
- 📋 **Lịch sử chat** — sidebar liệt kê hội thoại cũ, mở lại + hỏi tiếp.
- 📰 **Thư viện bài viết** — trang `/articles` tìm kiếm full-text + lọc chủ đề + phân trang; trang chi tiết `/articles/[id]`.
- 📝 **Markdown rendering** — câu trả lời AI hiển thị đậm, danh sách, link… đẹp mắt (react-markdown).
- 📋 **Copy & gợi ý** — nút sao chép câu trả lời + chip gợi ý câu hỏi tiếp theo.
- 🏥 **Health check** — endpoint `/health` kiểm tra Postgres + 2 Ollama.
- 🐳 **Docker deployment** — Dockerfile multi-stage cho cả backend + frontend, chạy bằng `docker compose --profile app`.
- 🔄 **CI pipeline** — GitHub Actions: lint, test, build cho cả 2 project.

### 🧠 Lớp "trí tuệ tin tức" (news intelligence)

- 🔥 **Trí tuệ sự kiện** — gom bài **cùng sự kiện xuyên báo** (cosine ≥ 0.72, 0 LLM), độ nóng = số báo; trang chi tiết phân tích **đồng thuận / mâu thuẫn** (LLM, cache). Trang chủ = dashboard điểm nóng.
- 🟢 **Câu chuyện đang phát triển** — cụm còn cập nhật + trải theo thời gian.
- 🗄️ **Lưu trữ theo quý & Nhìn lại** — mỗi quý có recap AI + "Năm vừa rồi là một năm như thế nào?".
- ✅ **Nhãn độ tin cậy** — mỗi câu trả lời kèm mức tin cậy (khoảng cách cosine + số nguồn).
- 🔎 **Kiểm chứng nhận định** *(fact-check)* — verdict ủng hộ/mâu thuẫn/chưa đủ (**JSON Schema** + confidence) + nút **tra web** (opt-in).
- 🧩 **Meta báo chí** — hồ sơ **nguồn** (ai đưa tin đầu, tin độc quyền), hồ sơ **thực thể** tự cập nhật, radar **điểm mù** (tin chỉ 1 nguồn). Thuần SQL/heuristic — không aggregator nào có.
- 💬 **Hỏi nối tiếp đa lượt** — viết lại câu hỏi theo ngữ cảnh hội thoại.
- 🎚️ **Định tuyến model theo tác vụ** + 📊 **đo token/chi phí** (panel trên `/dashboard`).

> Sơ đồ kiến trúc tương tác (bấm node, chạy animation từng luồng): mở [`docs/architecture.html`](docs/architecture.html) bằng trình duyệt.

---

## 🏗️ Kiến trúc

```mermaid
flowchart LR
    subgraph Client["🖥️ Trình duyệt :3001"]
        UI["Next.js UI<br/>useChatStream (EventSource)"]
    end

    subgraph Backend["⚙️ NestJS :3000"]
        CHAT["ChatService<br/>@Sse /chat/stream"]
        RET["RetrievalService<br/>hybrid: vector + FTS + RRF"]
        LLM["LlmService<br/>(LangChain + fallback)"]
        ING["IngestionModule<br/>BullMQ worker + cron"]
        ART["ArticlesModule<br/>search + topics"]
        HP["HealthModule<br/>/health"]
    end

    subgraph Infra["🐳 Docker"]
        PG[("Postgres + pgvector<br/>:55432")]
        REDIS[("Redis<br/>:6380")]
        OLC["Ollama chat<br/>:11434"]
        OLI["Ollama ingest<br/>:11435"]
    end

    EXT["🌐 RSS feeds"]
    OR["☁️ OpenRouter LLM"]

    UI -- "GET /chat/stream?q=&topic=" --> CHAT
    CHAT --> RET
    RET -- "embed câu hỏi" --> OLC
    RET -- "hybrid search (vector + FTS + RRF)" --> PG
    CHAT -- "stream prompt+context" --> OR
    OR -- "tokens" --> CHAT
    CHAT -- "SSE tokens + citations" --> UI
    CHAT -- "lưu hội thoại" --> PG

    ING -- "job qua" --> REDIS
    ING -- "tải RSS" --> EXT
    ING -- "embed chunk" --> OLI
    ING -- "ghi Article+Chunk ::vector" --> PG

    UI -- "GET /articles" --> ART
    ART -- "full-text search" --> PG
```

**Điểm mấu chốt:** chat và ingestion dùng **2 Ollama riêng** (cùng model `bge-m3` → vector 1024) nên nạp tin nền không "bỏ đói" việc embed câu hỏi của chat.

---

## 🔬 Lĩnh vực dữ liệu & luồng xử lý chi tiết (file + hàm)

### Lĩnh vực RAG đang phủ
Nguồn là 3 RSS "tin mới nhất" (VnExpress, Tuổi Trẻ, Thanh Niên) → **tin tức tổng hợp**, không chuyên một ngành. Bài viết được tự động phân loại vào 9 chủ đề:

| Lĩnh vực | Slug | | Lĩnh vực | Slug |
|---|---|---|---|---|
| Thể thao | `the-thao` | | Thế giới | `the-gioi` |
| Công nghệ | `cong-nghe` | | Giáo dục | `giao-duc` |
| Kinh tế | `kinh-te` | | Giải trí | `giai-tri` |
| Pháp luật | `phap-luat` | | Sức khỏe | `suc-khoe` |
| Khác | `khac` | | | |

> Muốn RAG "chuyên" một lĩnh vực (vd chỉ kinh tế) → đổi `DEFAULT_FEEDS` trong [`feeds.config.ts`](server/src/ingestion/feeds.config.ts) sang RSS chuyên mục tương ứng.

### PHA NẠP — dữ liệu tin tức đi qua file/hàm nào

```mermaid
flowchart TD
    A["⏱️ Cron 30' / POST /ingestion/run<br/><i>ingestion.scheduler.ts · onModuleInit()</i><br/><i>ingestion.controller.ts · run()</i>"]
    A --> B["📥 BullMQ queue (Redis)"]
    B --> C["👷 Worker nhận job<br/><i>ingestion.processor.ts · process()</i>"]
    C --> D["📰 Tải + parse RSS → RawFeedItem[]<br/><i>rss.service.ts · fetchFeed()</i>"]
    D --> E["🔁 Lặp từng bài + điều phối<br/><i>ingestion.service.ts · ingestFeed()/ingestArticle()</i>"]
    E --> F{"Trùng URL?<br/><i>prisma.article.findUnique</i>"}
    F -- "có" --> X["⏭️ skip"]
    F -- "không" --> G["🧹 Bóc text sạch từ HTML<br/><i>content-extractor.service.ts · extract()</i>"]
    G --> H{"Trùng contentHash (SHA-256)?"}
    H -- "có" --> X
    H -- "không" --> I["✂️ Cắt đoạn theo câu ~400 token<br/><i>chunk.service.ts · chunk()</i>"]
    I --> J["🧠 Embed → vector[1024]<br/><i>embedding.service.ts · embedBatch()</i><br/>→ Ollama ingest :11435"]
    J --> T["🏷️ Phân loại chủ đề<br/><i>topic.classifier.ts · classifyTopic()</i>"]
    T --> K["💾 Ghi trong $transaction<br/><i>ingestion.service.ts</i><br/>Article (Prisma) + Chunk (raw ::vector)"]
    K --> DB[("🗄️ Postgres + pgvector<br/>Article · Chunk")]
```

### PHA HỎI — câu hỏi đi qua file/hàm nào

```mermaid
flowchart TD
    U["🖥️ Gõ câu hỏi → mở EventSource<br/><i>web: app/page.tsx → lib/useChatStream.ts · send()</i>"]
    U -- "GET /chat/stream?q=&conversationId=&topic=" --> CT["🚪 Endpoint SSE<br/><i>chat.controller.ts · @Sse stream()</i>"]
    CT --> CS["🎯 Điều phối<br/><i>chat.service.ts · stream()</i>"]
    CS --> R["🔎 Hybrid retrieval<br/><i>retrieval.service.ts · search()</i>"]
    R --> EMB["🧠 Embed câu hỏi → vector[1024]<br/><i>embedding.service.ts · embed()</i><br/>→ Ollama chat :11434"]
    EMB --> VS["📐 Vector + FTS + RRF + recency<br/><i>retrieval.service.ts · $queryRaw</i>"]
    VS --> DB[("🗄️ Postgres pgvector<br/>Chunk JOIN Article")]
    DB --> BC["🔢 Đánh số [1..n] + gom citations<br/><i>context.builder.ts · buildContext()</i>"]
    BC --> SAVE1["💾 Lưu Message(user)<br/><i>chat.service.ts</i>"]
    SAVE1 --> LLM["🤖 Stream câu trả lời<br/><i>llm.service.ts · streamAnswer()</i><br/>prompt: <i>qa.prompt.ts · buildQaMessages()</i><br/>→ OpenRouter (+ fallback)"]
    LLM -- "từng token" --> CS
    CS -- "SSE data:{token}" --> U
    LLM --> SAVE2["💾 Lưu Message(assistant)+citations → emit done<br/><i>chat.service.ts</i>"]
    SAVE2 --> DB
```

### Bảng tra: bước → file → hàm

| # | Bước | File | Hàm | Dịch vụ (cổng) |
|---|---|---|---|---|
| **Nạp** | | | | |
| N1 | Lên lịch / trigger | [`ingestion.scheduler.ts`](server/src/ingestion/ingestion.scheduler.ts) · [`ingestion.controller.ts`](server/src/ingestion/ingestion.controller.ts) | `onModuleInit()` · `run()` | Redis/BullMQ :6380 |
| N2 | Worker chạy job | [`ingestion.processor.ts`](server/src/ingestion/ingestion.processor.ts) | `process()` | Redis/BullMQ :6380 |
| N3 | Tải + parse RSS | [`rss.service.ts`](server/src/ingestion/rss.service.ts) | `fetchFeed()` | RSS ngoài (HTTP) |
| N4 | Điều phối + chống trùng | [`ingestion.service.ts`](server/src/ingestion/ingestion.service.ts) | `ingestFeed()` · `ingestArticle()` | Postgres :55432 |
| N5 | Bóc text sạch | [`content-extractor.service.ts`](server/src/ingestion/content-extractor.service.ts) | `extract()` | Trang báo (HTTP) |
| N6 | Cắt đoạn (theo câu) | [`chunk.service.ts`](server/src/ingestion/chunk.service.ts) | `chunk()` | — (thuần CPU) |
| N7 | Embed → vector[1024] | [`embedding.service.ts`](server/src/embedding/embedding.service.ts) | `embedBatch()` | **Ollama ingest :11435** |
| N7b | Phân loại chủ đề | [`topic.classifier.ts`](server/src/ingestion/topic.classifier.ts) | `classifyTopic()` | — (thuần CPU) |
| N8 | Ghi DB (raw `::vector`) | [`ingestion.service.ts`](server/src/ingestion/ingestion.service.ts) | `$transaction` | Postgres :55432 |
| **Hỏi** | | | | |
| H1 | UI gửi + nhận stream | [`page.tsx`](web/src/app/page.tsx) · [`useChatStream.ts`](web/src/lib/useChatStream.ts) | `send()` | Backend SSE :3000 |
| H2 | Endpoint SSE | [`chat.controller.ts`](server/src/chat/chat.controller.ts) | `stream()` (`@Sse`) | — |
| H3 | Điều phối + lưu hội thoại | [`chat.service.ts`](server/src/chat/chat.service.ts) | `stream()` | Postgres :55432 |
| H4 | Embed câu hỏi | [`embedding.service.ts`](server/src/embedding/embedding.service.ts) | `embed()` | **Ollama chat :11434** |
| H5 | Hybrid search (vector + FTS + RRF) | [`retrieval.service.ts`](server/src/retrieval/retrieval.service.ts) | `search()` (`$queryRaw`) | Postgres :55432 |
| H6 | Dựng context + citations | [`context.builder.ts`](server/src/retrieval/context.builder.ts) | `buildContext()` | — (thuần) |
| H7 | Prompt grounding | [`qa.prompt.ts`](server/src/llm/qa.prompt.ts) | `buildQaMessages()` | — (thuần) |
| H8 | Stream LLM + fallback | [`llm.service.ts`](server/src/llm/llm.service.ts) | `streamAnswer()` | **OpenRouter (cloud)** |
| H9 | Lịch sử chat | [`chat.service.ts`](server/src/chat/chat.service.ts) | `listConversations()` · `getMessages()` | Postgres :55432 |
| **Thư viện** | | | | |
| A1 | Danh sách bài + tìm kiếm | [`articles.service.ts`](server/src/articles/articles.service.ts) | `search()` · `listTopics()` | Postgres :55432 |
| A2 | Chi tiết bài viết | [`articles.controller.ts`](server/src/articles/articles.controller.ts) | `detail()` | Postgres :55432 |

### Sơ đồ quan hệ dữ liệu (ERD)

```mermaid
erDiagram
    Article ||--o{ Chunk : "1 bài có nhiều đoạn (cascade)"
    Conversation ||--o{ Message : "1 hội thoại có nhiều tin nhắn (cascade)"

    Article {
        string id PK "cuid"
        string url UK "chống trùng"
        string title
        string source "tên feed"
        string author "nullable"
        datetime publishedAt "nullable, @@index"
        string content "full text"
        string contentHash UK "sha256 chống trùng"
        string topic "nullable, @@index (9 lĩnh vực)"
        datetime createdAt
    }
    Chunk {
        string id PK "cuid2 (raw insert)"
        string articleId FK "→ Article, @@index"
        int ord "thứ tự đoạn"
        string content "nội dung đoạn"
        int tokenCount
        vector embedding "vector(1024), pgvector, HNSW index"
        tsvector contentTsv "full-text, GIN index"
        datetime createdAt
    }
    Conversation {
        string id PK "cuid"
        string title "nullable (80 ký tự đầu câu hỏi)"
        datetime createdAt
    }
    Message {
        string id PK "cuid"
        string conversationId FK "→ Conversation, @@index"
        string role "user | assistant"
        string content
        json citations "nullable (Citation[])"
        datetime createdAt
    }
```

> **Quan hệ:** `Article 1—* Chunk` và `Conversation 1—* Message`, đều `onDelete: Cascade` (xóa cha → xóa con). `Chunk` có ràng buộc duy nhất `(articleId, ord)`. Cột `embedding` là kiểu pgvector — Prisma không ghi trực tiếp được, phải dùng raw SQL `::vector` (xem N8). Cột `contentTsv` dùng cho full-text search (hybrid retrieval).

---

## 🧰 Tech stack

| Lớp | Công nghệ |
|---|---|
| Backend | **NestJS 11** (TypeScript strict) |
| ORM / DB | **Prisma 6** + **Postgres 16** + **pgvector** (HNSW index) |
| Hàng đợi | **BullMQ** + ioredis + **Redis 7** |
| Ingest | rss-parser, @mozilla/readability + jsdom, cheerio, gpt-tokenizer, @paralleldrive/cuid2 |
| Retrieval | **Hybrid** (vector cosine + full-text tsvector + RRF + recency boost) |
| Embedding | **Ollama `bge-m3`** → vector **1024 chiều** (2 instance: chat + ingest) |
| LLM | `@langchain/openai` → **OpenRouter** (`gpt-oss-120b:free` + fallback `gpt-oss-20b:free`) |
| Frontend | **Next.js 16** (App Router) + **Tailwind** + react-markdown |
| CI/CD | **GitHub Actions** (lint + test + build) |
| Deploy | **Docker** multi-stage (backend + frontend) + docker-compose profiles |

---

## 🚀 Bắt đầu nhanh (Development)

**Yêu cầu:** Node.js (v20+), Docker Desktop (~3GB RAM trống cho 2 model), [OpenRouter API key](https://openrouter.ai/keys).

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
npx prisma migrate deploy
npx nest build
node dist/main.js             # backend :3000 (tự nạp tin nếu INGEST_ON_BOOT=true)

# 4. Nạp tin ngay (tùy chọn, terminal khác)
curl -X POST http://localhost:3000/ingestion/run

# 5. Frontend (terminal khác)
cd web
npm install
npx next dev -p 3001

# 6. Mở http://localhost:3001
```

> **Cổng:** backend giữ :3000, Next chạy :3001 (CORS backend đã mở cho origin :3001).

> **Hot Reload:** khi phát triển, chạy `npm run start:dev` (backend) và `npx next dev` (frontend) để code tự cập nhật khi lưu file.

---

## 🐳 Triển khai Docker (Production)

Toàn bộ hệ thống (infra + app) có thể chạy hoàn toàn trong Docker:

```bash
# Lần đầu: build + khởi động tất cả (infra + backend + frontend)
docker compose --profile app up -d --build

# Kéo model embedding (chỉ 1 lần)
docker exec newsqa-ollama        ollama pull bge-m3
docker exec newsqa-ollama-ingest ollama pull bge-m3
```

**Sau khi sửa code**, cần build lại image:
```bash
docker compose --profile app up -d --build
```

> ⚠️ Docker **KHÔNG** tự cập nhật khi bạn sửa code bên ngoài. Phải chạy lại lệnh `--build` ở trên.

**Chỉ khởi động hạ tầng** (Postgres, Redis, Ollama — phù hợp khi dev local):
```bash
docker compose up -d
```

### Các container

| Container | Image | Mô tả |
|---|---|---|
| `newsqa-postgres` | `pgvector/pgvector:pg16` | Postgres + pgvector |
| `newsqa-redis` | `redis:7` | Redis cho BullMQ |
| `newsqa-ollama` | `ollama/ollama:latest` | Ollama chat/retrieval |
| `newsqa-ollama-ingest` | `ollama/ollama:latest` | Ollama ingestion |
| `newsqa-backend` | Build từ `server/Dockerfile` | NestJS backend (profile `app`) |
| `newsqa-frontend` | Build từ `web/Dockerfile` | Next.js frontend (profile `app`) |

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

> Khi chạy trong Docker (profile `app`), các biến mạng được tự động override bởi `docker-compose.yml` (dùng hostname nội bộ: `postgres`, `redis`, `ollama`…).

---

## 🔌 Bảng cổng dịch vụ

| Dịch vụ | Cổng host | Ghi chú |
|---|---|---|
| Backend (NestJS) | **3000** | API + SSE |
| Frontend (Next.js) | **3001** | UI chat + thư viện bài |
| Postgres + pgvector | **55432** | tránh Postgres native 5432/5433 |
| Redis | **6380** | tránh Redis native 3.0.504 ở 6379 |
| Ollama (chat) | **11434** | embed câu hỏi |
| Ollama (ingest) | **11435** | embed khi nạp tin |

---

## 🌐 API Endpoints

### Chat
| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/chat/stream?q=&conversationId=&topic=` | Stream câu trả lời (SSE) |
| `GET` | `/chat/conversations` | Danh sách hội thoại |
| `GET` | `/chat/conversations/:id/messages` | Tin nhắn của hội thoại |

### Articles (Thư viện bài viết)
| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/articles?q=&topic=&page=` | Tìm kiếm + lọc + phân trang |
| `GET` | `/articles/topics` | Danh sách chủ đề + số bài |
| `GET` | `/articles/:id` | Chi tiết bài viết |

### Ingestion
| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/ingestion/run` | Trigger nạp tin thủ công |

### Monitoring
| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/health` | Health check (Postgres + 2 Ollama) |

---

## 📁 Cấu trúc dự án

```
d:\Chatbot_QA\
├─ README.md                 # tài liệu này
├─ docker-compose.yml        # Postgres+pgvector, Redis, Ollama x2, Backend, Frontend
├─ .github/workflows/ci.yml  # CI: lint + test + build
├─ docs/                     # ONBOARDING, BUSINESS-FLOW, CAI-TIEN, plans/
├─ server/                   # Backend NestJS
│  ├─ Dockerfile             # Multi-stage build (node:20-alpine)
│  ├─ .dockerignore
│  ├─ prisma/schema.prisma   # Article(+topic), Chunk(vector 1024), Conversation, Message
│  ├─ prisma/sql/            # Migration SQL (hybrid search, topics, HNSW index)
│  └─ src/
│     ├─ embedding/          # bge-m3 qua Ollama (2 instance); hard-fail nếu sai 1024
│     ├─ ingestion/          # nạp: rss, content-extractor, chunk, ingestion, processor, scheduler
│     │  └─ topic.classifier.ts  # phân loại chủ đề (9 lĩnh vực, luật từ khóa)
│     ├─ retrieval/          # hybrid retrieval: vector + FTS + RRF + recency boost
│     ├─ llm/                # qa.prompt (grounding) + llm.service (stream + fallback)
│     ├─ chat/               # orchestration: retrieve→stream→persist; @Sse controller; lịch sử
│     ├─ articles/           # thư viện bài viết: search, topics, detail
│     ├─ health/             # health check endpoint
│     └─ main.ts             # bootstrap + CORS + lưới uncaughtException
└─ web/                      # Frontend Next.js 16
   ├─ Dockerfile             # Multi-stage build (node:20-alpine)
   ├─ .dockerignore
   └─ src/
      ├─ lib/useChatStream.ts  # hook EventSource (SSE) + lịch sử
      └─ app/
         ├─ page.tsx           # UI chat (sidebar, bong bóng, citations, topic chips, composer)
         └─ articles/          # thư viện bài: danh sách + chi tiết
```

---

## 🛠️ Lệnh thường dùng

```bash
# === Development ===
# Backend (hot reload)
cd server && npm run start:dev

# Frontend (hot reload)
cd web && npx next dev -p 3001

# === Docker ===
# Chỉ infra
docker compose up -d

# Toàn bộ (infra + app)
docker compose --profile app up -d --build

# Dừng tất cả
docker compose --profile app down

# === Test ===
cd server && npx jest

# === Build ===
cd server && npx nest build

# === Nạp tin thủ công ===
curl -X POST http://localhost:3000/ingestion/run

# === Hỏi qua SSE (không cần UI) ===
curl -N "http://localhost:3000/chat/stream?q=Vietnam%20Airlines%20lãi%20bao%20nhiêu"

# === Lọc theo chủ đề ===
curl -N "http://localhost:3000/chat/stream?q=kết%20quả%20bóng%20đá&topic=the-thao"

# === Soi DB ===
docker exec newsqa-postgres psql -U newsqa -d newsqa -c 'SELECT count(*) FROM "Article";'
docker exec newsqa-postgres psql -U newsqa -d newsqa -c 'SELECT topic, count(*) FROM "Article" GROUP BY topic ORDER BY count DESC;'
docker exec newsqa-postgres psql -U newsqa -d newsqa -c 'SELECT DISTINCT vector_dims(embedding) FROM "Chunk";'

# === Health check ===
curl http://localhost:3000/health

# === Kiểm tra model OpenRouter còn sống ===
curl https://openrouter.ai/api/v1/models
```

---

## 🔄 CI/CD

GitHub Actions workflow tại [`.github/workflows/ci.yml`](.github/workflows/ci.yml) chạy trên mỗi push/PR vào `main`:

| Job | Bước |
|---|---|
| **Backend** | `npm ci` → `prisma generate` → ESLint → Jest → `nest build` |
| **Frontend** | `npm ci` → ESLint → TypeScript (`tsc --noEmit`) → `next build` |

> Test không cần infra (Postgres/Redis/Ollama) vì đã mock toàn bộ dependencies.

---

## 🚑 Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| BullMQ `Redis version needs >= 5.0.0` | Redis native giữ 6379 → dùng Docker redis ở **6380** (`REDIS_PORT=6380`) |
| Chat `429 Provider returned error` | Model `:free` bị rate-limit → đổi `LLM_*_MODEL` sang slug còn sống |
| Chat treo/chậm khi đang nạp | Đã sửa bằng **2 Ollama**; hoặc đặt `INGEST_ON_BOOT=false` |
| Backend tự sập exit 1 khi nạp | Lỗi undici khi fetch báo → đã có lưới `uncaughtException` trong `main.ts` |
| Docker `port already in use` | Tắt server local đang chiếm cổng (3000/3001) trước khi chạy Docker |
| `prisma generate` lỗi EPERM | Tắt server NestJS đang chạy rồi chạy lại `npx prisma generate` |

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

**11 phase hoàn tất** — từ Phase 1 (infra) đến Phase 11 (tính năng sản phẩm) + nhiều cải tiến ngoài kế hoạch.

### Tổng kết tính năng đã triển khai

| Phase | Tính năng | Trạng thái |
|---|---|---|
| 1-6 | Infra + Ingest + Embed + Retrieval + LLM + Chat | ✅ |
| 7 | Frontend Next.js + SSE | ✅ |
| 8 | Hybrid search (vector + FTS + RRF) + HNSW index | ✅ |
| 9 | UX (Markdown render + hiện lỗi LLM) | ✅ |
| 10 | Health check + Integration tests + CI + Docker | ✅ |
| 11 | Topic classifier + lọc lĩnh vực + thư viện bài viết | ✅ |
| CT | 2 Ollama, sửa crash undici, UI mới, fallback model, lịch sử chat | ✅ |

RAG loop chạy thật end-to-end: vừa nạp tin nền vừa chat mượt, kèm trích dẫn nguồn, lọc theo chủ đề, duyệt thư viện bài viết.
