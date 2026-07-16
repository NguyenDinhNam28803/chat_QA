# AI trong NewsQA: OpenRouter vs Ollama

> Tài liệu kỹ thuật mô tả chi tiết cách dự án dùng **hai nhà cung cấp AI tách biệt**: **OpenRouter** (cloud LLM) và **Ollama** (local embedding). Chúng KHÔNG thể thay thế nhau.

---

## Mục lục

- [Triết lý kiến trúc](#triết-lý-kiến-trúc)
- [Ollama (Embedding) — chi tiết code](#ollama-embedding--chi-tiết-code)
- [OpenRouter (LLM/Text Gen) — chi tiết code](#openrouter-llmtext-gen--chi-tiết-code)
- [Bảng so sánh: OpenRouter vs Ollama](#bảng-so-sánh-openrouter-vs-ollama)
- [Feature map: feature nào gọi AI gì?](#feature-map-feature-nào-gọi-ai-gì)
- [Luồng Chat Q&A step-by-step](#luồng-chat-qa-step-by-step)

---

## Triết lý kiến trúc

```
┌─────────────────────────────────────────────────────┐
│                  NewsQA AI Layer                      │
│                                                       │
│   ┌──────────────────────┐  ┌──────────────────────┐ │
│   │  Ollama (local)      │  │  OpenRouter (cloud)  │ │
│   │  bge-m3              │  │  gpt-oss-120/20b    │ │
│   │  Port 11434 / 11435  │  │  openrouter.ai      │ │
│   ├──────────────────────┤  ├──────────────────────┤ │
│   │  ✅ Embedding ONLY   │  │  ✅ Text Gen ONLY    │ │
│   │  ✅ batch lớn        │  │  ✅ stream + prompt  │ │
│   │  ✅ 0 $ cloud cost   │  │  ✅ đa model fallback│ │
│   │  ❌ KHÔNG sinh text  │  │  ❌ KHÔNG embed      │ │
│   └──────────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Nguyên tắc vàng:** Ollama là "bản đồ toạ độ" (cục bộ, ổn định), OpenRouter là "cây bút" (cloud, mạnh, đổi model chỉ đổi slug). Embedding KHÔNG BAO GIỜ đi qua OpenRouter.

---

## Ollama (Embedding) — chi tiết code

### File: `server/src/embedding/embedding.service.ts`

**Mô tả**: Service duy nhất giao tiếp với Ollama. Gọi REST API của Ollama tại endpoint `/api/embed`.

```ts
// embedding.service.ts:53-57 — GỌI OLLAMA TRỰC TIẾP
const res = await fetch(`${this.baseUrl}/api/embed`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: this.model, input: texts }),
});
// Không có Authorization header, không có API key

// embedding.service.ts:75-83 — VALIDATE CHIỀU fail cứng
for (const vector of embeddings) {
  if (vector.length !== this.dim) { // this.dim = 1024
    throw new Error(`Embedding dimension mismatch...`);
  }
}
```

**Điểm gọi từ code, file chính xác:**

| File:line | Code gọi | Mục đích |
|---|---|---|
| `retrieval/retrieval.service.ts:32` | `this.embedding.embed(question)` | Embed câu hỏi chat |
| `ingestion/ingestion.service.ts:68` | `this.embedding.embedBatch(texts)` | Embed batch khi nạp tin |

### Hai instance Ollama — tại sao?

File: `server/src/embedding/embedding.module.ts`

```ts
providers: [
  EmbeddingService,                              // Mặc định → port 11434
  {
    provide: EMBEDDING_INGEST,                   // Token EMBEDDING_INGEST
    useFactory: (config) => new EmbeddingService(config, 
      config.get('EMBEDDING_INGEST_BASE_URL')), // → port 11435
  },
]
```

| Instance | Port | service inject | Dùng cho |
|---|---|---|---|
| Mặc định | `:11434` | RetrievalService | Embed câu hỏi chat, 1 request/time |
| INGEST | `:11435` | IngestionService | Embed batch khi nạp, hàng nghìn chunks |

**Lý do**: Ollama xử lý request tuần tự. Nếu ingestion đang embed 50 chunks trên 1 instance, câu hỏi chat phải chờ → timeout 28s.

---

## OpenRouter (LLM/Text Gen) — chi tiết code

### File: `server/src/llm/llm.service.ts`

Dùng LangChain ChatOpenAI wrapper trỏ baseURL về OpenRouter + raw fetch trực tiếp.

### Cách 1: Qua LangChain ChatOpenAI (stream + generate)

```ts
// llm.service.ts:61-74 — KHỞI TẠO ChatOpenAI instance

// Mỗi unique slug (vd "openai/gpt-oss-120b:free") tạo 1 instance ChatOpenAI
for (const slug of new Set(Object.values(this.tierChains).flat())) {
  this.modelBySlug.set(slug, new ChatOpenAI({
    apiKey: 'sk-or-504a31d8...',
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'NewsQA Bot'
      },
    },
    temperature: 0.2,
    streaming: true,
    streamUsage: true, // bắt token count
    maxRetries: 0,     // fallback tự code
    model: slug,       // tên model là slug OpenRouter
  }));
}
```

Phương thức public sử dụng:

| Phương thức | File:line | Dùng cho |
|---|---|---|
| `streamAnswer()` | `llm.service.ts:78-88` | Chat Q&A (flagship) |
| `generate()` | `llm.service.ts:91-104` | summary / brief / timeline / compare / rewrite / event / recap / year / suggest |
| `streamMessages()` (private) | `llm.service.ts:275-323` | Core, xử lý fallback manual |

#### Cơ chế fallback manual (tại `streamMessages`)

```ts
for (const slug of chain) { // chain = [120b, 120b, 20b] cho reasoning tier
  const stream = await model.stream(messages, { signal }); // timeout 60s
  let yielded = 0;
  for await (const chunk of stream) {
    if (chunk.content) { 
      yielded++; 
      yield chunk.content; // stream token về client
    }
  }
  return; // success, không fallback
  // NẾU catch(err) và yielded===0 → thử model tiếp
  // NẾU yielded>0 → throw err, không fallback giữa chừng
}
```

**Không dùng `withFallbacks` của LangChain** vì khi 429 nó treo stream mở nhưng không lỗi.

### Cách 2: Raw fetch gọi thẳng OpenRouter API

File: `llm.service.ts:199-232` — `callOpenRouter()`

```ts
private async callOpenRouter(body, signal) {
  const res = await fetch(`${this.baseURL}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer sk-or-504a31d8...`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'NewsQA Bot',
    },
    body: JSON.stringify(body),
  });
}
```

Dùng cho:

| Phương thức public | File:line | Đặc biệt |
|---|---|---|
| `generateStructured()` | `llm.service.ts:110-154` | body có `response_format: { type: 'json_schema', ... }` |
| `generateWeb()` | `llm.service.ts:160-195` | body có `plugins: [{ id: 'web', max_results: 3 }]` |

#### Structured Output (JSON Schema) cho fact-check

```ts
// llm.service.ts:125-136
body = {
  model: slug,
  temperature: 0.2,
  stream: false, // không stream
  response_format: {
    type: 'json_schema',
    json_schema: { name: 'factcheck', strict: true, schema }
  },
  usage: { include: true }, // lấy token count
  messages: [{role:'system',content:systemText}, {role:'user',content:userText}]
}
```
Schema yêu cầu:

```json
{ "verdict": "supported|conflicting|insufficient",
  "confidence": 0.72,
  "analysis": "markdown..." }
```

#### Web plugin cho fact-check online

```ts
// llm.service.ts:168-178
body = {
  model: slug,
  plugins: [{ id: 'web', max_results: 3 }], // ← OpenRouter search web
  usage: { include: true },
  messages: [...]
}
```
Kết quả parse `message.annotations[].url_citation` → trả về `{text, webSources}`.

### Model Tier (B1)

File: `llm.service.ts:55-59`

```ts
this.tierChains = {
  nano:        dedup([nano, fallback, primary]),      // rewrite + suggest
  standard:    dedup([standard, fallback, primary]),   // summary + brief
  reasoning:   dedup([reasoning, primary, fallback]),  // chat + factcheck
};
```

### FinOps Usage Tracking (B3)

File: `server/src/usage/usage.service.ts`

Mỗi lần gọi OpenRouter thành công → fire-and-forget ghi LlmUsage record.

Stream chat lấy token từ `chunk.usage_metadata` của LangChain (dòng 297-301).
Raw fetch lấy token từ response field `usage` (dòng 139).
Cost hiện hardcode cost=0, trong tương lai sẽ parse từ header `x-llamafusion-cost`.

---

## Bảng so sánh: OpenRouter vs Ollama

| Tiêu chí | Ollama | OpenRouter |
|---|---|---|
| **Vai trò** | Embedding vector | Sinh văn bản (LLM) |
| **Model** | bge-m3 (1024-dim) | gpt-oss-120b:free / 20b:free |
| **Cách gọi** | REST `/api/embed` trực tiếp | LangChain ChatOpenAI hoặc raw fetch |
| **Port/URL** | `localhost:11434` / `11435` | `https://openrouter.ai/api/v1` |
| **Auth** | None | API Key (Bearer token) |
| **Data type** | `number[][]` vector | stream text hoặc JSON |
| **Tính ổn định** | Cao (local, không network) | Phụ thuộc OpenRouter free-tier |
| **Scale** | 1 request/time (tuần tự) | Cloud xử lý parallel |
| **Cost** | 0$ (local compute) | 0$ (free-tier model) |
| **Fail behavior** | throw Error (dim mismatch) | manual fallback chain + timeout 60s |

---

## Feature map: feature nào gọi AI gì?

| Feature | AI Provider | Tier | File:line | Cache? |
|---|---|---|---|---|
| Chat RAG | OpenRouter (streamAnswer) | reasoning | `chat/chat.service.ts:79` | No |
| Follow-up rewrite | OpenRouter (generate) | nano | `chat/chat.service.ts:132` | No |
| Article summary | OpenRouter (generate) | standard | `articles/articles.service.ts:318` | Yes |
| Daily Brief | OpenRouter (generate) | standard | `articles/articles.service.ts:387` | Yes |
| Timeline narrative | OpenRouter (generate) | standard | `articles/articles.service.ts:412` | No (optional) |
| Cross-source compare | OpenRouter (generate) | reasoning | `articles/articles.service.ts:451` | No (optional) |
| Event analysis | OpenRouter (generate) | reasoning | `events/events.service.ts:328` | Yes |
| Period recap | OpenRouter (generate) | reasoning | `periods/periods.service.ts:296` | Yes |
| Year Review | OpenRouter (generate) | reasoning | `periods/periods.service.ts:259` | Yes |
| Fact-check structured | OpenRouter (generateStructured) | reasoning | `factcheck/factcheck.service.ts:67` | No |
| Fact-check online | OpenRouter (generateWeb) | reasoning | `factcheck/factcheck.service.ts:127` | No |
| Embed câu hỏi chat | Ollama (embed) | 11434 | `retrieval/retrieval.service.ts:32` | N/A |
| Embed batch ingestion | Ollama (embedBatch) | 11435 | `ingestion/ingestion.service.ts:68` | N/A |
| Event clustering (cosine) | **NO AI** (pure JS) | N/A | `events/events.service.ts:63-75` | N/A |
| Clickbait score (cosine) | **NO AI** (pure math) | N/A | `embedding/vector.util.ts` | N/A |
| Analytics / Insights | **NO AI** (pure SQL) | N/A | `articles/articles.service.ts:465-502` | N/A |

---

## Luồng Chat Q&A step-by-step

Đây là quy trình khi người dùng hỏi một câu hỏi bất kỳ.

### Step 1: User gửi câu hỏi

```
Browser:
  new EventSource('/chat/stream?q=Gia+vang+hom+nay')
```

File: `chat/chat.controller.ts:10-16` (@Sse endpoint)

### Step 2: ChatService.stream() — xử lý

File: `chat/chat.service.ts:49-103`

- Nếu có `conversationId` → **Step 2a**: rewrite follow-up

### Step 2a (optional): Rewrite follow-up → OpenRouter nano tier

File: `chat/chat.service.ts:111-143`

Lịch sử (4 messages cuối) + prompt → `this.llm.generate(system, user, { tier: nano })`.

### Step 3: Hybrid Search

**3a. Embed câu hỏi: OLLAMA 11434**

File: `retrieval/retrieval.service.ts:32`

```ts
const vec = await this.embedding.embed(question);
// POST http://localhost:11434/api/embed { model: bge-m3, input: ["Gia vang hom nay"] }
// → vector 1024 dim
```

**3b. Query PostgreSQL hybrid**

File: `retrieval/retrieval.service.ts:39-85`

SQL CTE thực hiện:

```
vec:    SELECT top 20 ORDER BY embedding <=> $vec
fts:    SELECT top 20 ORDER BY ts_rank(contentTsv, plainto_tsquery)
fused:  RRF(k=60) của vec + fts + recency boost (exp decay 7 ngày)
final:  top 5 chunks
```

**3c. Build context**

File: `retrieval/context.builder.ts:22-49`

5 chunks → ```
[1] nội dung chunk 1
[2] nội dung chunk 2
[5] nội dung chunk 5
```
Build citations + confidence:
- `high`: sources≥2 && distance<0.58
- `medium`: sources≥1 && distance<0.68
- `low`: else

### Step 4: Gửi prompt + context đến OPENROUTER

File: `llm/llm.service.ts:78-88` streamAnswer → streamMessages tier=reasoning

```ts
Messages sent to OpenRouter:
  System: "Bạn là trợ lý hỏi-đáp tin tức tiếng Việt.
           CHỈ trả lời dựa trên NGỮ CẢNH được cung cấp.
           Nếu ngữ cảnh không chứa câu trả lời, nói: 'Tôi không tìm thấy...'
           Luôn trích dẫn nguồn bằng [số] tương ứng với đoạn ngữ cảnh.
           Không bịa thông tin."
  Human:  "NGỮ CẢNH:
           [1] Giá vàng SJC hôm nay giao dịch ở mức 85,5 triệu/lượng...
           [2] ...
           
           CÂU HỎI: Gia vang hom nay
```

Gửi qua LangChain ChatOpenAI:

```ts
model: ChatOpenAI {
  apiKey: sk-or-50431a31d8...
  configuration: { baseURL: https://openrouter.ai/api/v1 }
  temperature: 0.2
  streaming: true
}
model.stream(messages, { signal }) → gọi OpenRouter API /v1/chat/completions

→ OpenRouter forward tới GPT-OSS-120B
→ stream trả về token tokens
```

### Step 5: Stream response về UI

File: `chat/chat.service.ts:79-82`

```ts
for await (const token of this.llm.streamAnswer(question, context)) {
  sub.next({ data: { token } });
}
// Cuối cùng:
sub.next({ data: { done: true, citations, confidence, conversationId, messageId }});
```

File: `web/src/lib/useChatStream.ts` — EventSource nhận và render markdown.

### Step 6: Persist

File: `chat/chat.service.ts:74-76` lưu user message + `chat/chat.service.ts:84-91` lưu assistant message + citations.

---

## Diagram: AI call flow

```
┌──────────┐    GET /chat/stream     ┌──────────────┐
│ Browser  │ ◄──── SSE stream ────── │ ChatService   │
│ Next.js  │                        │ .stream()     │
└──────────┘                        └──────┬───────┘
                                           │
                              rewrite? ────┤
                                           │ searchQuery
                                           ▼
                                   ┌───────────────┐
                                   │ Retrieval      │
                                   │ .search(q)     │
                                   └───┬───┬───┬───┘
                                       │   │   │
                         embed query   │   │   │ hybrid SQL
                                       ▼   │   ▼
                               ┌─────────┐ │ ┌────────┐
                               │ OLLAMA  │ │ │POSTGRES│
                               │ 11434   │ │ │pgvector│
                               └─────────┘ │ └───┬────┘
                                           │     │ top 5 chunks
                                           ▼     ▼
                                   ┌───────────────┐
                                   │ build context  │
                                   │ [1]..[5]       │
                                   │ + citations    │
                                   └───────────────┘
                                           │
                               system + human messages
                                           ▼
                                ┌──────────────────┐
                                │ OPENROUTER via    │
                                │ ChatOpenAI.stream │
                                │ (reasoning tier)  │
                                └────────┬─────────┘
                                         │ stream tokens
                                         ▼
                                ChatService → SSE → Browser
```

---

## Tóm tắt nhanh

1. **Ollama** được gọi từ `RetrievalService.search()` và `IngestionService.ingestArticle()` — chỉ dùng cho embedding, KHÔNG gì khác
2. **OpenRouter** được gọi từ mọi feature AI (chat, summary, brief, fcheck, recap...) qua `LlmService` wrapper duy nhất
3. 2 instance Ollama (chat + ingest) tránh starvation
4. OpenRouter free-tier hay 429 → cache mọi thứ LLM sinh ra
5. tiering: rewrite nano, summary standard, chat/fcheck reasoning
