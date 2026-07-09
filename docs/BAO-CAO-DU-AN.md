# 📊 BÁO CÁO DỰ ÁN & HƯỚNG DẪN PHÁT TRIỂN — Điểm Tin AI

> **Mục đích tài liệu:** một bản báo cáo tổng thể *đủ để trình bày* **và** *đủ để onboard*. Đọc xong tài liệu này, một thành viên mới có thể **nắm toàn bộ kiến trúc, dữ liệu, cách dùng AI (Ollama + OpenRouter) và tiếp tục phát triển** mà không cần mở từng file.
>
> **Tài liệu liên quan (đào sâu):** [BUSINESS-FLOW.md](BUSINESS-FLOW.md) (luồng + code từng bước) · [OPENROUTER.md](OPENROUTER.md) (tầng LLM) · [CAI-TIEN.md](CAI-TIEN.md) + [CAI-TIEN-V2.md](CAI-TIEN-V2.md) (nhật ký cải tiến) · [architecture.html](architecture.html) (sơ đồ tương tác — mở bằng trình duyệt).

---

## Mục lục

1. [Tóm tắt điều hành](#1-tóm-tắt-điều-hành)
2. [Định vị sản phẩm](#2-định-vị-sản-phẩm)
3. [Ngăn xếp công nghệ & cổng](#3-ngăn-xếp-công-nghệ--cổng)
4. [Kiến trúc tổng thể](#4-kiến-trúc-tổng-thể)
5. [Mô hình dữ liệu](#5-mô-hình-dữ-liệu)
6. [🧠 Ollama — tầng Embedding (cốt lõi AI #1)](#6--ollama--tầng-embedding-cốt-lõi-ai-1)
7. [🌐 OpenRouter — tầng Sinh văn bản/LLM (cốt lõi AI #2)](#7--openrouter--tầng-sinh-văn-bảnllm-cốt-lõi-ai-2)
8. [Luồng nghiệp vụ end-to-end (6 pha)](#8-luồng-nghiệp-vụ-end-to-end-6-pha)
9. [Danh mục API](#9-danh-mục-api)
10. [Danh mục trang giao diện](#10-danh-mục-trang-giao-diện)
11. [Cách chạy & cấu hình](#11-cách-chạy--cấu-hình)
12. [Bài học & cạm bẫy đã trả giá](#12-bài-học--cạm-bẫy-đã-trả-giá)
13. [Hướng phát triển tiếp](#13-hướng-phát-triển-tiếp)
14. [Bản đồ file → chức năng (lối tắt onboard)](#14-bản-đồ-file--chức-năng-lối-tắt-onboard)

---

## 1. Tóm tắt điều hành

**Điểm Tin AI** là một hệ thống **RAG (Retrieval-Augmented Generation)** trên tin tức tiếng Việt: tự động nạp tin từ nhiều báo, biến thành **vector ngữ nghĩa**, và trả lời câu hỏi **kèm trích dẫn nguồn** — chống bịa (grounded). Trên nền RAG đó, dự án xây thêm nhiều lớp **"trí tuệ tin tức"** mà các trang tổng hợp tin (Báo Mới, Google News) và cả ChatGPT **không có**:

- **Trí tuệ sự kiện** — gom bài cùng sự kiện xuyên báo, phân tích **đồng thuận / mâu thuẫn**.
- **Lưu trữ theo quý** — tổng kết điểm nóng theo quý/năm.
- **Kiểm chứng nhận định** — fact-check có verdict + độ chắc chắn.
- **Meta báo chí** — hồ sơ nguồn (ai đưa tin đầu), thực thể, radar điểm mù.

**Hai tầng AI cốt lõi tách biệt:**
| Tầng | Nhà cung cấp | Nhiệm vụ |
|---|---|---|
| **Embedding** | **Ollama** (`bge-m3`, cục bộ) | biến văn bản → vector 1024 chiều |
| **Sinh văn bản** | **OpenRouter** (`gpt-oss`) | trả lời, tóm tắt, phân tích, kiểm chứng |

> **Nguyên tắc vàng của kiến trúc:** *embedding chạy cục bộ (ổn định, khối lượng lớn); LLM chạy qua cloud (mạnh, đa dạng, đổi model chỉ là đổi slug).*

---

## 2. Định vị sản phẩm

Tài sản cốt lõi **không phải tin tức** (ai cũng có) mà là **hạ tầng "lớp trí tuệ trên tin"**: kho tin **đa nguồn theo thời gian** + embedding + LLM. Từ đó làm được thứ đối thủ không làm:

```
Aggregator (Báo Mới…)   : gom link theo chuyên mục người đặt.
ChatGPT                 : mạnh nhưng KHÔNG có kho tin đa nguồn realtime của bạn.
Điểm Tin AI             : phân tích META về chính báo chí — ai nhanh, ai đưa riêng,
                          sự kiện nào nhiều báo đồng thuận/mâu thuẫn, diễn biến theo quý.
```

---

## 3. Ngăn xếp công nghệ & cổng

| Thành phần | Công nghệ | Cổng (host) | Vai trò |
|---|---|---|---|
| Frontend | **Next.js 16** (App Router) + Tailwind v4 | **3001** | UI, SSE client |
| Backend | **NestJS 11** + Prisma 6 | **3000** | API, orchestration |
| CSDL | **Postgres 16 + pgvector** | **55432** → 5432 | nguồn sự thật duy nhất |
| Hàng đợi | **Redis 7 + BullMQ** | **6380** → 6379 | cron nạp tin nền |
| Embedding (chat) | **Ollama** `bge-m3` | **11434** | embed câu hỏi |
| Embedding (nạp) | **Ollama** `bge-m3` | **11435** → 11434 | embed lúc ingest |
| LLM | **OpenRouter** (OpenAI-compatible) | (cloud) | sinh văn bản |

**7 nguồn RSS:** VnExpress (Tin mới nhất), Tuổi Trẻ (Mới nhất), Thanh Niên (Mới nhất / Thế giới / Công nghệ), VietNamNet (Thời sự / Công nghệ).

---

## 4. Kiến trúc tổng thể

```mermaid
flowchart LR
    subgraph Client["🖥️ Trình duyệt :3001"]
        UI["Next.js App Router<br/>useChatStream (EventSource/SSE)"]
    end
    subgraph Backend["⚙️ NestJS :3000"]
        ING["Ingestion (BullMQ)"]
        RET["Retrieval (hybrid)"]
        LLM["LlmService"]
        SVC["Events · Periods · Factcheck<br/>Sources · Entities · Articles · Usage"]
    end
    subgraph Infra["🗄️ Hạ tầng"]
        PG[("Postgres + pgvector")]
        REDIS[("Redis / BullMQ")]
        OLLI["🧠 Ollama nạp :11435"]
        OLLC["🧠 Ollama chat :11434"]
        OR["🌐 OpenRouter"]
    end

    UI <-->|"REST + SSE"| Backend
    ING -->|"embed batch"| OLLI
    ING --> PG
    ING <--> REDIS
    RET -->|"embed câu hỏi"| OLLC
    RET -->|"vector <=> + tsvector"| PG
    LLM -->|"stream/JSON/web"| OR
    SVC --> PG
    SVC --> LLM
```

> Sơ đồ **tương tác, chi tiết từng class** (bấm node, chạy animation từng luồng): mở [`docs/architecture.html`](architecture.html).

---

## 5. Mô hình dữ liệu

Toàn bộ nằm trong **một Postgres** (`server/prisma/schema.prisma`). Vector & full-text nằm **ngoài** Prisma nên truy vấn qua `$queryRaw`.

```mermaid
erDiagram
    Article ||--o{ Chunk : "cắt đoạn"
    Event   ||--o{ Article : "gom cụm (eventId)"
    Conversation ||--o{ Message : "hội thoại"

    Article {
        string id PK
        string url UK
        string title
        string source
        datetime publishedAt
        string content
        string contentHash UK
        string topic
        string summary "cache tóm tắt AI"
        json   questions "gợi ý câu hỏi (E3)"
        string eventId FK
    }
    Chunk {
        string id PK
        string articleId FK
        int    ord
        string content
        int    tokenCount
        vector embedding "vector(1024) — pgvector"
    }
    Event {
        string id PK
        string title
        string topic
        string summary "đồng thuận/mâu thuẫn (cache)"
        int    articleCount
        int    sourceCount
        datetime firstSeen
        datetime lastSeen
        float  hotness
    }
    Period {
        string id PK
        string label "Quý III/2026"
        int    year
        int    quarter
        datetime startDate
        datetime endDate
        string status "active|archived"
        string summary "recap AI (cache)"
    }
    YearReview { int year UK  string content }
    DailyBrief { string date UK  string content }
    Conversation { string id PK  string title }
    Message {
        string id PK
        string conversationId FK
        string role "user|assistant"
        string content
        json   citations
        int    feedback "👍1 / 👎-1"
    }
    LlmUsage {
        string id PK
        string feature
        string model
        int    inputTokens
        int    outputTokens
        float  cost
    }
```

**Chỉ mục quan trọng:** `HNSW (vector_cosine_ops)` cho `Chunk.embedding`, `GIN` cho `Chunk.contentTsv` (full-text). Bảng `Event/Period/YearReview/LlmUsage` được áp bằng **raw SQL** vào DB đang chạy (không `prisma migrate`) để khỏi reset dev DB — nhớ chạy `prisma generate` sau đó.

---

## 6. 🧠 Ollama — tầng Embedding (cốt lõi AI #1)

### 6.1. Vai trò
Ollama chỉ làm **một việc**: chạy model **`bge-m3`** để biến văn bản → **vector 1024 chiều**. Vector này là "toạ độ ngữ nghĩa" — 2 đoạn gần nghĩa thì vector gần nhau (đo bằng cosine).

### 6.2. Vì sao KHÔNG dùng cloud cho embedding
> Embedding phải **ổn định số chiều** (khoá cứng `vector(1024)` trong pgvector) và chạy **khối lượng lớn** (mọi chunk của mọi bài). Nếu provider cloud đổi model một ngày → **toàn bộ kho vector vô giá trị**, phải re-embed cả DB. Ví von: embedding là *hệ toạ độ bản đồ* — đổi hệ thì mọi điểm đã đánh dấu đều sai chỗ. ⇒ Giữ `bge-m3`/Ollama **cục bộ**.

### 6.3. Vì sao **2 instance** Ollama (11434 + 11435)
Ollama xử lý request **tuần tự**. Nếu dùng chung 1 instance: khi ingestion đang embed hàng loạt chunk, câu hỏi của chat phải **xếp hàng** → độ trễ embed câu hỏi nhảy từ ~0.6s lên **16–28s** → `/chat/stream` timeout.

```
Chat / Retrieval ──► ollama        :11434   ← luôn rảnh, ưu tiên, ~1s
Ingestion ─────────► ollama-ingest :11435   ← nền, không cản chat
```

Kỹ thuật: **một class `EmbeddingService`, hai instance** qua DI:

```ts
// embedding.module.ts — token EMBEDDING_INGEST tạo instance trỏ :11435
{
  provide: EMBEDDING_INGEST,
  useFactory: (config) => new EmbeddingService(config, config.get('EMBEDDING_INGEST_BASE_URL')),
  inject: [ConfigService],
}
// ingestion.service.ts dùng @Inject(EMBEDDING_INGEST); retrieval dùng instance mặc định (:11434)
```
> **Cạm bẫy đã gặp:** thêm tham số `baseUrlOverride?: string` khiến NestJS tưởng là dependency → crash boot. Phải đánh dấu `@Optional()`.

### 6.4. Code lõi — gọi Ollama & **fail cứng nếu sai chiều**

```ts
// embedding.service.ts
async embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${this.baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: this.model, input: texts }), // bge-m3
  });
  const data = await res.json();
  for (const vector of data.embeddings) {
    if (vector.length !== this.dim) {            // this.dim = 1024
      throw new Error(`Embedding dimension mismatch: got ${vector.length}, expects ${this.dim}`);
    }
  }
  return data.embeddings;
}
```
Vector ghi vào Postgres bằng raw SQL vì Prisma không có kiểu vector:
```ts
await tx.$executeRaw`
  INSERT INTO "Chunk" (...,"embedding",...)
  VALUES (..., ${toVectorLiteral(vectors[i])}::vector, ...)`; // '[0.12,-0.34,...]'::vector
```

### 6.5. Nguyên tắc bất di bất dịch
- **Cùng model `bge-m3`** cho cả lúc nạp và lúc hỏi — nếu khác model, vector không so sánh được, cả DB phải embed lại.
- **1024 chiều** khoá cứng vào schema. Đổi model = đổi `vector(N)` + re-embed toàn bộ.

---

## 7. 🌐 OpenRouter — tầng Sinh văn bản/LLM (cốt lõi AI #2)

### 7.1. Vì sao OpenRouter
OpenRouter là **cổng gộp** tương thích API OpenAI: hàng trăm model qua **cùng một API, chỉ khác chuỗi `slug`**. Sức mạnh lớn nhất: **đổi model chỉ là đổi slug** ⇒ dễ định tuyến / fallback / consensus. Model đang dùng: `openai/gpt-oss-120b:free` (chính) + `openai/gpt-oss-20b:free` (dự phòng).

### 7.2. Một cổng duy nhất: `LlmService`
Mọi lời gọi LLM đi qua `server/src/llm/llm.service.ts` (bọc `ChatOpenAI` LangChain, `baseURL` trỏ OpenRouter). **4 phương thức public:**

| Phương thức | Kiểu | Dùng cho |
|---|---|---|
| `streamAnswer()` | stream (SSE) | Chat Q&A |
| `generate()` | single-shot | tóm tắt · brief · timeline · compare · rewrite · recap · event |
| `generateStructured()` | JSON theo schema | **fact-check (B2)** |
| `generateWeb()` | plugin web | **fact-check online (B4)** |

### 7.3. Phòng thủ then chốt — **fallback thủ công** (bài học đã trả giá)

```ts
// streamMessages: thử từng model trong chuỗi tier, timeout 60s, CHỈ đổi model khi chưa phát token nào
for (const slug of this.tierChains[tier]) {
  const { signal, clear } = this.timeout();          // AbortController 60s
  let yielded = 0;
  try {
    const stream = await model.stream(messages, { signal });
    for await (const chunk of stream) { if (chunk.content) { yielded++; yield chunk.content; } }
    return;
  } catch (err) {
    if (yielded > 0) throw err;   // đã stream nửa câu → KHÔNG restart (sẽ lộn xộn)
  } finally { clear(); }
}
```
> **Vì sao không dùng `withFallbacks` của LangChain?** Nó **treo** khi model chính trả 429 (stream mở nhưng không lỗi sạch). Đây là lỗi đã trả giá — **đừng đảo ngược**.

### 7.4. Khai thác đặc thù OpenRouter (đã triển khai)

**B1 · Định tuyến model theo tác vụ (tiering).** 3 tier `nano | standard | reasoning`, mỗi tier là một **chuỗi slug** (tier → primary → fallback). Việc nhẹ giao model rẻ → **rẻ hơn + tán tải 429**:
```
rewrite / suggest         → nano      (20b)
summary / brief / timeline → standard  (20b)
chat / factcheck / recap   → reasoning (120b)
```
Mỗi caller: `generate(system, user, { feature: 'summary', tier: 'standard' })`. Env tuỳ chọn `LLM_MODEL_{NANO,STANDARD,REASONING}`.

**B2 · Structured Output (JSON Schema)** cho fact-check — bỏ regex mong manh, *miễn phí* thêm `confidence`:
```ts
// gọi thẳng OpenRouter: response_format buộc model trả đúng khuôn
body: {
  model: slug,
  response_format: { type: 'json_schema',
    json_schema: { name: 'factcheck', strict: true, schema: {
      type: 'object',
      properties: { verdict: {enum:['supported','conflicting','insufficient']},
                    confidence: {type:'number'}, analysis: {type:'string'} },
      required: ['verdict','confidence','analysis'] } } },
  usage: { include: true },   // (B3) trả token & cost
}
```
Nếu model free không tôn trọng schema → **fallback** về `generate()` + regex cũ.

**B3 · Đo token & chi phí (FinOps).** Mỗi lời gọi LLM thật ghi một dòng `LlmUsage` (feature, model, in/out tokens, cost) qua `UsageService` — **fire-and-forget**. Bắt token từ `streamUsage` (stream) và `usage:{include:true}` (fetch). `GET /usage` → panel **"Chi phí AI · token"** trên `/dashboard`. *Không đo thì không tối ưu được.*

**B4 · Fact-check web (`plugins:[{id:'web'}]`).** Nút **opt-in** riêng, nhãn "nguồn ngoài, chưa kiểm duyệt", tách khỏi luồng grounded. *Lưu ý: model `:free` hiện chưa dùng được web plugin → degrade an toàn kèm thông báo.*

### 7.5. Chống rate-limit: **cache mọi thứ LLM sinh ra**
Free-tier hay 429. Vì vậy cache: `Article.summary`, `Article.questions`, `DailyBrief`, `Event.summary`, `Period.summary`, `YearReview`. Lần sau phục vụ từ cache, **0 LLM**.

### 7.6. Sơ đồ tầng LLM
```mermaid
flowchart TD
    Caller["Caller<br/>{feature, tier}"] --> LS["LlmService"]
    LS --> Tier{"chọn tier<br/>nano/standard/reasoning"}
    Tier --> Chain["chuỗi slug<br/>tier → primary → fallback"]
    Chain --> OR["🌐 OpenRouter /chat/completions"]
    OR -->|"stream / json_schema / web"| Resp["kết quả"]
    Resp --> Usage["UsageService.record()<br/>→ LlmUsage (B3)"]
    OR -.->|"429 / timeout 60s"| Chain
```

---

## 8. Luồng nghiệp vụ end-to-end (6 pha)

> Chi tiết code từng bước ở [BUSINESS-FLOW.md](BUSINESS-FLOW.md). Dưới đây là bản tóm tắt + sơ đồ.

### PHA A — Nạp dữ liệu (nền, cron 30′)
`scheduler → BullMQ → processor → RSS → Readability → chống trùng (URL + contentHash) → chunk ~400 token → embed (:11435) → ghi Article + Chunk trong 1 transaction`.

### PHA B — Hỏi-đáp RAG (real-time)
```mermaid
sequenceDiagram
    autonumber
    participant UI as Trình duyệt
    participant CHAT as ChatService
    participant RET as RetrievalService
    participant PG as Postgres
    participant OR as OpenRouter
    UI->>CHAT: GET /chat/stream?q= (SSE)
    Note over CHAT: nếu hỏi nối tiếp → E1 viết lại câu hỏi
    CHAT->>RET: search(q)
    RET->>PG: vector <=> ∥ tsvector → RRF (k=60)
    PG-->>RET: 5 chunk + distance
    Note over RET: A3 chấm độ tin cậy (minDistance + số nguồn)
    CHAT->>OR: stream(prompt grounding + context)
    loop từng token
      OR-->>UI: data:{token}
    end
    CHAT->>PG: lưu Message + citations
    UI-->>UI: render + link nguồn + badge độ tin cậy
```
**Truy hồi hybrid** (bắt cả ngữ nghĩa lẫn tên riêng/số liệu):
```sql
WITH vec AS ( ... ORDER BY c."embedding" <=> $vec LIMIT 20 ),
     fts AS ( ... WHERE c."contentTsv" @@ plainto_tsquery('simple',$q) LIMIT 20 ),
     fused AS ( SELECT id, 1.0/(60+v.rank) + 1.0/(60+f.rank) AS rrf FROM vec FULL JOIN fts ... )
SELECT ... ORDER BY fused.rrf + <recency boost 0.005·decay 7 ngày> DESC LIMIT 5
```

### PHA C — 5 trụ tính năng AI
Tóm tắt · Bản tin ngày · Dòng thời gian · Đối chiếu nguồn · Insight — dùng `generate()` + **cache**; Insight **thuần SQL, 0 LLM**.

### PHA D — Trí tuệ sự kiện
```ts
// gom cụm: vector đại diện = chunk ord0; greedy theo cosine
for (let i=0;i<n;i++){ if(assigned[i])continue; const cl=[i];
  for(let j=i+1;j<n;j++) if(!assigned[j] && cosine(a[i],a[j])>=0.72){ cl.push(j); assigned[j]=true; } }
// hotness = số báo×3 + số bài + độ mới ; getEvent() → LLM đồng thuận/mâu thuẫn (cache)
```
Endpoint: `/events` (điểm nóng) · `/events/developing` (đang phát triển) · `/events/blindspots` (điểm mù) · `/events/:id`.

### PHA E — Lưu trữ theo quý
`getActive()` tự tạo quý + archive quý cũ; `computeStats()` LIVE theo khoảng ngày; recap quý & tổng kết năm (LLM + cache).

### PHA F — Meta báo chí · Kiểm chứng · Tối ưu LLM
- **P1 hồ sơ nguồn** (SQL: `DISTINCT ON(event) ORDER BY publishedAt ASC` → ai đưa tin đầu), **P2 điểm mù** (`sourceCount=1`), **P3 thực thể** (NER heuristic).
- **A1 fact-check** (B2 structured + B4 web) · **A3 confidence**.
- **B1 tiering** + **B3 usage**.

---

## 9. Danh mục API

| Nhóm | Endpoint | Ghi chú |
|---|---|---|
| Chat | `GET /chat/stream?q=&conversationId=&topic=` (SSE) · `GET /chat/conversations` · `.../messages` · `POST /chat/messages/:id/feedback` | RAG + lịch sử |
| Bài | `GET /articles?q=&topic=&page=` · `/articles/:id` · `/:id/summary` · `/:id/questions` · `/:id/related` · `/articles/stats` · `/articles/topics` | thư viện + trụ AI |
| Trụ AI | `GET /brief` · `/timeline?q=` · `/compare?q=` · `/insights` | |
| Sự kiện | `GET /events?from=` · `/events/developing` · `/events/blindspots` · `/events/:id` · `POST /events/cluster` | |
| Quý | `GET /periods/active` · `/periods` · `/periods/:id` · `/periods/year/:y` · `POST /periods/rollover` | |
| Kiểm chứng | `GET /factcheck?claim=` · `/factcheck/online?claim=` | B2 · B4 |
| Meta | `GET /sources` · `/sources/:name` · `/entities` · `/entities/:name` | P1 · P3 |
| Vận hành | `GET /usage` · `/health` · `POST /ingestion/run` | B3 · giám sát |

---

## 10. Danh mục trang giao diện

`web/src/app/*` — thanh `Nav` (`components/Nav.tsx`):

| Trang | Route | Nội dung |
|---|---|---|
| Trang chủ | `/` | dashboard master–detail: KPI · spotlight điểm nóng + bảng xếp hạng · đang phát triển · dòng tin |
| Chat | `/chat` | hỏi-đáp SSE + độ tin cậy + lịch sử |
| Kiểm chứng | `/factcheck` | verdict + confidence + nút web |
| Điểm mù | `/blindspots` | tin chỉ 1 nguồn |
| Nguồn | `/sources`, `/sources/[name]` | hồ sơ báo |
| Thực thể | `/entities`, `/entities/[name]` | hồ sơ nhân vật/tổ chức |
| Bản tin / Dòng thời gian / Đối chiếu | `/brief` `/timeline` `/compare` | trụ AI |
| Thư viện | `/articles`, `/articles/[id]` | tìm + chi tiết + tóm tắt AI + gợi ý câu hỏi |
| Sự kiện | `/events/[id]` | đồng thuận/mâu thuẫn + timeline đa nguồn |
| Nhìn lại | `/review`, `/review/[id]` | recap quý + tổng kết năm |
| Bảng tin | `/dashboard` | thống kê + panel Chi phí AI (B3) |

---

## 11. Cách chạy & cấu hình

### 11.1. Docker (khuyến nghị — chạy tất cả)
```bash
# hạ tầng + backend + frontend
docker compose --profile app up -d --build
# chỉ hạ tầng (để chạy backend/frontend ở host)
docker compose up -d
```
Mở **http://localhost:3001**. Nạp tin ngay: `POST http://localhost:3000/ingestion/run`. Gom cụm sự kiện: `POST http://localhost:3000/events/cluster`.

### 11.2. Dev ở host
```bash
cd server && npm i && npx prisma generate && node dist/main.js     # :3000 (hoặc npm run start:dev)
cd web    && npm i && npx next dev -p 3001                          # :3001
```

### 11.3. Biến môi trường cốt lõi (`server/.env`)
```ini
DATABASE_URL=postgresql://newsqa:newsqa@localhost:55432/newsqa?schema=public
REDIS_HOST=localhost
REDIS_PORT=6380
EMBEDDING_BASE_URL=http://localhost:11434          # Ollama chat
EMBEDDING_INGEST_BASE_URL=http://localhost:11435   # Ollama nạp
OPENROUTER_API_KEY=sk-or-...
LLM_PRIMARY_MODEL=openai/gpt-oss-120b:free
LLM_FALLBACK_MODEL=openai/gpt-oss-20b:free
# (B1) tuỳ chọn: LLM_MODEL_{NANO,STANDARD,REASONING}
INGEST_ON_BOOT=true
```
> **Kéo model Ollama lần đầu:** `docker exec newsqa-ollama ollama pull bge-m3` (và `newsqa-ollama-ingest`).

---

## 12. Bài học & cạm bẫy đã trả giá

| Vấn đề | Nguyên nhân | Cách chữa |
|---|---|---|
| Chat timeout khi đang nạp tin | 1 Ollama xử lý tuần tự | **Tách 2 Ollama** (11434/11435) |
| Chat treo ngẫu nhiên | `withFallbacks`+stream treo khi 429 | **Fallback thủ công** + timeout 60s |
| Backend tự sập | undici ném lỗi bất đồng bộ khi fetch báo | lưới `uncaughtException` + AbortController 15s |
| fact-check trả sai `insufficient` | parse `VERDICT:` bằng regex mong manh | **B2 JSON Schema** (+ fallback) |
| Model `:free` biến mất/429 | roster OpenRouter đổi liên tục | cache mọi thứ + verify slug định kỳ |
| `prisma generate` EPERM (Windows) | host giữ DLL query engine | kill node process `dist/main` trước khi generate |
| Vector "hỏng" nếu đổi model embedding | 1024 chiều khoá cứng | **giữ bge-m3 cục bộ**, không đổi |

---

## 13. Hướng phát triển tiếp

**Đã xong:** RAG · 5 trụ AI · trí tuệ sự kiện · lưu trữ quý · confidence · fact-check (structured+web) · meta báo chí (P1/P2/P3) · OpenRouter B1/B2/B3/B4.

**Còn lại (xem [OPENROUTER.md](OPENROUTER.md) + [DE-XUAT-TINH-NANG.md](DE-XUAT-TINH-NANG.md)):**
- **Cận (không cần auth):** B7 stream các `generate()` (giảm TTFT) · B5 server-side fallback · A2 phát hiện "báo nào đăng lại của ai" · cron tự `POST /events/cluster` + `/periods/rollover`.
- **Cần hệ thống định danh (auth) — mở khóa nhóm giá trị cao:** C1 theo dõi chủ đề + cảnh báo · C2 digest cá nhân hoá · **D1 media monitoring (B2B)** — con đường thương mại hoá.
- **Tầm nhìn xa:** B8 multi-model consensus · B9 agentic RAG (tool-calling) · P3 nâng NER bằng LLM.

**Việc vận hành cần lưu ý:** gom cụm sự kiện & rollover quý hiện **chạy thủ công** (chưa có cron) → thêm vào scheduler để hệ thống "sống" tự động.

---

## 14. Bản đồ file → chức năng (lối tắt onboard)

> Muốn sửa X, mở file Y. Không cần đọc cả repo.

| Cần làm gì | Mở file |
|---|---|
| Đổi/thêm nguồn RSS | `server/src/ingestion/feeds.config.ts` |
| Sửa cách cắt đoạn | `server/src/ingestion/chunk.service.ts` |
| Sửa gọi Ollama / số chiều | `server/src/embedding/embedding.service.ts` |
| Sửa truy hồi (hybrid/RRF/recency) | `server/src/retrieval/retrieval.service.ts` |
| Sửa độ tin cậy (A3) | `server/src/retrieval/context.builder.ts` |
| **Mọi thứ về LLM** (tier/fallback/JSON/web/usage) | `server/src/llm/llm.service.ts` |
| Prompt (grounding, fact-check, recap…) | `server/src/llm/{qa.prompt,features.prompts}.ts` |
| Điều phối chat + rewrite (E1) | `server/src/chat/chat.service.ts` |
| Gom cụm / điểm nóng / điểm mù | `server/src/events/events.service.ts` |
| Lưu trữ quý / recap / năm | `server/src/periods/periods.service.ts` |
| Fact-check (B2 + B4) | `server/src/factcheck/factcheck.service.ts` |
| Hồ sơ nguồn / thực thể (meta) | `server/src/{sources,entities}/*.service.ts` |
| Đo token/chi phí (B3) | `server/src/usage/usage.service.ts` |
| 5 trụ AI + thư viện | `server/src/articles/articles.service.ts` |
| Schema DB | `server/prisma/schema.prisma` |
| Trang chủ / các trang | `web/src/app/**/page.tsx` |
| Hook chat SSE phía client | `web/src/lib/useChatStream.ts` |
| Thanh điều hướng | `web/src/components/Nav.tsx` |
| Bộ token thiết kế (màu/font) | `web/src/app/globals.css` + `design.md` |

---

> **Một câu để nhớ:** *Ollama là bản đồ toạ độ (cục bộ, ổn định); OpenRouter là cây bút (cloud, mạnh, đổi model chỉ đổi slug). Postgres+pgvector là nguồn sự thật duy nhất. Mọi thứ LLM sinh ra đều được cache để sống với free-tier.*
