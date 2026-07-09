# 🤖 OpenRouter trong NewsQA — hiện trạng & hướng mở rộng

> Tài liệu kỹ thuật về cách NewsQA dùng **OpenRouter** (tầng sinh văn bản / LLM), và lộ trình khai thác sâu hơn các tính năng đặc thù của OpenRouter.
>
> Giải thích theo hai lớp: **thuật ngữ chuyên ngành** (để tra cứu/trao đổi đúng từ) + **ví von & ví dụ trong NewsQA** (để dễ hình dung).
>
> Bối cảnh kiến trúc: NewsQA dùng **2 nhà cung cấp AI tách biệt** — **Ollama (bge-m3)** lo *embedding*, **OpenRouter** lo *sinh văn bản*. Tài liệu này chỉ bàn về OpenRouter. Xem thêm luồng RAG tổng thể ở [README](../README.md).

---

## Mục lục

- [Phần A — Hiện trạng](#phần-a--hiện-trạng)
  - [A.1. Kiến trúc: một cổng LLM duy nhất](#a1-kiến-trúc-một-cổng-llm-duy-nhất)
  - [A.2. Hai "cửa" vào OpenRouter, 11 tính năng dùng chung](#a2-hai-cửa-vào-openrouter-11-tính-năng-dùng-chung)
  - [A.3. Nhận xét & điểm chưa khai thác](#a3-nhận-xét--điểm-chưa-khai-thác)
- [Phần B — Hướng mở rộng](#phần-b--hướng-mở-rộng)
  - [B1. Định tuyến model theo tác vụ](#b1-định-tuyến-model-theo-tác-vụ-model-tiering--router)
  - [B2. Structured Output (JSON Schema)](#b2-structured-output--buộc-model-trả-json-theo-khuôn)
  - [B3. Đo lường token & chi phí](#b3-đo-lường-token--chi-phí-usage-accounting--finops)
  - [B4. Fact-check "online" (web-augmented)](#b4-fact-check-online--tra-cứu-web-thời-gian-thực)
  - [B5. Fallback đa tầng phía server](#b5-fallback-đa-tầng-phía-server)
  - [B6. Provider preferences](#b6-provider-preferences)
  - [B7. Stream các tính năng generate()](#b7-stream-các-tính-năng-generate)
  - [B8. Multi-model consensus](#b8-multi-model-consensus-cho-fact-check)
  - [B9. Agentic RAG (tool-calling)](#b9-agentic-rag-bằng-tool-calling)
  - [Điều KHÔNG nên làm](#-điều-không-nên-làm)
- [Ưu tiên triển khai](#ưu-tiên-triển-khai)

---

## Phần A — Hiện trạng

### A.1. Kiến trúc: một cổng LLM duy nhất

Toàn bộ dự án đi qua **một** `LlmService` ([`server/src/llm/llm.service.ts`](../server/src/llm/llm.service.ts)), bọc `ChatOpenAI` của LangChain nhưng trỏ `baseURL` về `openrouter.ai/api/v1` — OpenRouter tương thích API OpenAI nên tái dùng được client OpenAI.

```ts
const base = {
  apiKey: OPENROUTER_API_KEY,
  configuration: {
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: { 'HTTP-Referer': APP_PUBLIC_URL, 'X-Title': APP_TITLE }, // attribution OpenRouter
  },
  temperature: 0.2,   // bám ngữ cảnh, ít bịa
  streaming: true,
  maxRetries: 0,      // model :free hay 429 → fail-fast, tự fallback
};
this.models = [ {primary}, {fallback} ];   // 2 model dựng sẵn ở constructor
```

Cấu hình qua `.env` (xem [`server/.env.example`](../server/.env.example)):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `OPENROUTER_API_KEY` | *(bắt buộc)* | Khoá OpenRouter |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Endpoint |
| `LLM_PRIMARY_MODEL` | `openai/gpt-oss-120b:free` | Model chính (qwen/llama trước đây hay 429 → đã đổi) |
| `LLM_FALLBACK_MODEL` | `openai/gpt-oss-20b:free` | Model dự phòng (khi 429) |
| `APP_PUBLIC_URL` / `APP_TITLE` | — | Header attribution |

Cơ chế phòng thủ then chốt (`streamMessages`):
- **Fallback thủ công** thay vì `withFallbacks` của LangChain — vì `withFallbacks` + streaming **hay treo** khi primary trả 429 (stream mở nhưng không báo lỗi sạch).
- **`AbortController` timeout 60s** cho mỗi lần thử.
- **Chỉ đổi model khi `yielded === 0`** — nếu đã stream nửa câu thì không thể an toàn chuyển model (sẽ trùng/lộn xộn), nên ném lỗi luôn.

### A.2. Hai "cửa" vào OpenRouter, 11 tính năng dùng chung

Chỉ có **2 phương thức public** chạm OpenRouter:

| Cửa | Kiểu | Dùng cho |
|---|---|---|
| `streamAnswer()` | stream (SSE) | **Chat Q&A** |
| `generate()` | single-shot (gom stream → string) | **10 tính năng còn lại** ↓ |

`generate()` là "bề mặt" OpenRouter thực sự của dự án:

| Tính năng | File · dòng | Ghi chú |
|---|---|---|
| Tóm tắt bài | `articles.service.ts:219` | cache vào `Article.summary` |
| Gợi ý câu hỏi | `articles.service.ts:237` | parse theo dòng |
| Bản tin sáng | `articles.service.ts:279` | cache/ngày (`DailyBrief`) |
| Timeline narrative | `articles.service.ts:301` | optional (try/catch) |
| Compare nguồn | `articles.service.ts:335` | optional |
| Phân tích sự kiện | `events.service.ts:257` | cache vào `Event.summary` |
| **Fact-check** | `factcheck.service.ts:45` | parse `VERDICT:` bằng **regex** |
| Viết lại câu hỏi nối tiếp | `chat.service.ts:131` | query-rewrite đa lượt |
| Review theo năm | `periods.service.ts:258` | cache `YearReview` |
| Narrative theo kỳ | `periods.service.ts:290` | optional |

### A.3. Nhận xét & điểm chưa khai thác

**Tốt:** một cổng duy nhất; cache thông minh (summary/brief/event/year); fallback + timeout phòng thủ; header attribution đúng chuẩn; `temperature 0.2` hợp bài toán tin tức.

**Chưa khai thác** — dự án đang dùng OpenRouter như **một endpoint OpenAI thường**, bỏ qua gần hết tính năng đặc thù:

1. **Mọi tác vụ dùng CHUNG một cặp model** — dù "viết lại câu hỏi" chỉ cần model tí hon, còn fact-check cần model mạnh.
2. **Fact-check parse `VERDICT:` bằng regex** — mong manh; model quên format → rơi về `insufficient` sai.
3. **Không đo token/chi phí** — mù chi phí, không biết feature nào tốn nhất.
4. Không dùng: structured output, web-search, provider routing, prompt caching, reasoning control.

---

## Phần B — Hướng mở rộng

Mỗi hướng gồm: **Chuyên ngành** (thuật ngữ) → **Ví von** → **Ví dụ trong NewsQA**.

### B1. Định tuyến model theo tác vụ *(model tiering / router)* ✅ ĐÃ TRIỂN KHAI (CT-29)

> **Trạng thái:** `LlmService` có tier `nano|standard|reasoning`; mỗi caller gán tier + feature. Env `LLM_MODEL_{NANO,STANDARD,REASONING}` tuỳ chọn; mặc định việc nhẹ→20b, việc nặng→120b → tán tải 429.


**Chuyên ngành.** Mẫu hình **"model cascade" / "LLM router"**: ánh xạ *độ khó tác vụ → cấp năng lực model* (capability tier). Nền tảng: token cost & latency tỷ lệ thuận với kích thước model, nên đưa việc dễ cho model nhỏ tối ưu **cost/performance ratio**. OpenRouter khiến việc này *trivial* vì mọi model gọi qua **cùng API, chỉ khác chuỗi `slug`**.

**Ví von.** Toà soạn có **thực tập sinh** (nhanh/rẻ, sửa chính tả), **biên tập viên** (tin thường), **cây bút kỳ cựu** (đắt/chậm, bài điều tra). NewsQA hiện đang *bắt cây bút kỳ cựu đi sửa chính tả*.

**Ví dụ.** 11 tính năng không cùng độ khó:

| Tác vụ | Độ khó | Giao cho |
|---|---|---|
| `rewriteFollowup`, đặt tên cụm, gợi ý câu hỏi | Rất dễ | 🐣 nano |
| Tóm tắt, brief, timeline | Vừa | 📝 standard |
| **Fact-check**, compare | Khó (suy luận) | 🧠 reasoning |

```
TRƯỚC:  mọi việc ──► qwen-80b            → chậm cho việc vặt, dễ tắc 429
SAU:    rewrite ───► mistral-small (nano) ~0.1s, gần như miễn phí
        summary ───► qwen-80b   (standard)
        factcheck ─► reasoning-model      chất lượng cao nhất
```

Trong code chỉ cần `generate(system, user, { tier })` + bảng ánh xạ `tier → slug`. Lợi ích kép: **rẻ hơn** + **tán tải nên ít 429 hơn**.

### B2. Structured Output — buộc model trả JSON theo khuôn ✅ ĐÃ TRIỂN KHAI (CT-28)

> **Trạng thái:** đã áp cho fact-check. `LlmService.generateStructured()` gọi thẳng OpenRouter với `response_format: json_schema`; `FactcheckService` dùng schema `{verdict, confidence, analysis}`, có **fallback** về regex cũ nếu model free không tôn trọng schema. Đã xoá phụ thuộc regex + thêm `confidence`. Verified: gpt-oss tôn trọng schema.


**Chuyên ngành.** LLM bình thường sinh văn bản tự do. **Structured output** ép đầu ra tuân **JSON Schema**; kỹ thuật lõi là **constrained decoding** — chỉ sinh token hợp lệ với schema nên *đảm bảo* parse được. OpenRouter dùng `response_format: { type: 'json_schema' }` + `provider: { require_parameters: true }` (chỉ chọn provider hỗ trợ).

**Ví von.** Fact-check hiện giống đưa **tờ giấy trắng** rồi *dặn miệng* "nhớ ghi VERDICT ở dòng đầu" — model hay quên. Structured output là đưa **biểu mẫu có ô tick** `[ ] Đúng [ ] Mâu thuẫn [ ] Chưa đủ` + ô phân tích + ô độ tin cậy — model **buộc** điền đúng ô.

**Ví dụ.** Code hiện tại (`factcheck.service.ts:56`) mong manh:
```ts
const m = raw.match(/VERDICT:\s*(supported|conflicting|insufficient)/i);
const verdict = m?.[1]?.toLowerCase() ?? 'insufficient';  // quên format → SAI thành "insufficient"
```
Sau khi dùng JSON Schema, model bắt buộc trả:
```jsonc
{ "verdict": "conflicting", "confidence": 0.72, "analysis": "Nguồn [1][3] xác nhận…, nhưng [5] ngược lại…" }
```
→ Xoá regex, **không bao giờ parse lỗi**, *miễn phí* thêm `confidence` (chính là "nhãn độ tin cậy"). Áp được cho **phân loại topic** và **quyết định gộp cụm sự kiện**.

### B3. Đo lường token & chi phí *(usage accounting / FinOps)* ✅ ĐÃ TRIỂN KHAI (CT-29)

> **Trạng thái:** bảng `LlmUsage` + `UsageModule` + `GET /usage`; bắt token qua `streamUsage` (stream) và `usage:{include:true}` (fetch). Panel "Chi phí AI · token theo tính năng" trên `/dashboard`.


**Chuyên ngành.** Mỗi lời gọi trả khối **`usage`** (`prompt_tokens`, `completion_tokens`, `cost`); bật bằng `usage: { include: true }`, tra sau qua endpoint `/generation`. Nền của **LLM observability** và **cost attribution** (FinOps cho AI). *Không đo thì không tối ưu được.*

**Ví von.** Hoá đơn điện **không có công-tơ theo phòng**: biết tổng tiền, không biết phòng nào ngốn điện. Gắn công-tơ từng tính năng → thấy ngay thủ phạm.

**Ví dụ.** Dự án hiện **mù chi phí**. Thêm bảng log:
```
feature      | model     | prompt_tok | completion_tok | cost_usd | cached
-------------+-----------+-----------+----------------+----------+-------
factcheck    | reasoning |   3,200   |      480       | 0.0021   | false
daily_brief  | qwen-80b  |   1,800   |      620       | 0.0000   | true(hit)
compare      | reasoning |   4,100   |      510       | 0.0034   | false  ← nghi phạm
```
→ Phát hiện `compare`/`factcheck` không cache = ứng viên số 1 để thêm cache. **Điều kiện bắt buộc** trước khi lên model trả phí hoặc bán B2B.

### B4. Fact-check "online" — tra cứu web thời gian thực ✅ ĐÃ TRIỂN KHAI (CT-29)

> **Trạng thái:** `generateWeb()` (plugin `web`) + `GET /factcheck/online` + nút "🌐 Kiểm chứng mở rộng ngoài web" (opt-in, nhãn nguồn ngoài). **Lưu ý:** model `:free` hiện chưa dùng được web plugin nên degrade an toàn — cần model/credits hỗ trợ web để chạy thật.


**Chuyên ngành.** Thêm hậu tố **`:online`** vào slug (hoặc `web` plugin) → model được cấp công cụ web search, tự truy vấn khi cần. Bản chất là mở rộng tri thức từ *corpus đóng* sang *web mở* — đụng tới **grounding boundary** (ranh giới "AI chỉ nói dựa nguồn nào").

**Ví von.** Kho tin nội bộ = **thư viện riêng đã kiểm duyệt**. `:online` = cho trợ lý **chạy ra Google** khi thư viện thiếu — tiện nhưng **mất kiểm soát nguồn** và tính kiểm chứng-được.

**Ví dụ + cảnh báo.** Khi kho nội bộ trả `insufficient`, thêm **nút riêng "🌐 Kiểm chứng mở rộng ngoài web"**:
```
Kho nội bộ: ❓ Chưa đủ dữ liệu
   └─► [bấm] → model :online → "Theo Reuters (web)… nhận định này SAI"
                               ⚠️ nhãn rõ: NGUỒN NGOÀI, chưa kiểm duyệt
```
**Bắt buộc**: KHÔNG để mặc định — phải là hành động có chủ đích, gắn nhãn nguồn ngoài rõ ràng, tách khỏi luồng chính, nếu không sẽ **phá tính grounded** vốn là bản sắc dự án.

### B5. Fallback đa tầng phía server

**Chuyên ngành.** Hiện fallback là **thủ công phía client** (vòng lặp 2 model). OpenRouter cho truyền mảng **`models: [m1, m2, m3, …]`**; model đầu lỗi/429 thì **OpenRouter tự chuyển** phía server (*server-side fallback*). Chuỗi dài hơn, độ trễ chuyển thấp hơn.

**Ví von.** Thay vì bạn *tự gọi lại tổng đài* mỗi lần bận, tổng đài có sẵn "bàn A bận → tự nối bàn B → bàn C".

**Ví dụ + lưu ý.**
- `generate()` (không stream): dùng `models: [qwen, llama, gemini-flash]` → sống sót tốt hơn với `:free`.
- `streamAnswer()` (stream): **GIỮ NGUYÊN fallback thủ công** — code đã ghi rõ `withFallbacks`+stream hay treo khi 429. Đây là bài học đã trả giá, đừng đảo ngược.

### B6. Provider preferences

**Chuyên ngành.** Một model thường được **nhiều nhà cung cấp hạ tầng** phục vụ (Together, Fireworks, DeepInfra…). `provider: {…}` ra chính sách định tuyến: `sort: 'throughput'|'price'|'latency'`, `data_collection: 'deny'`, `require_parameters: true`.

**Ví von.** Cùng món hàng bán ở nhiều **đại lý**. Quy tắc mua: "ưu tiên nơi **giao nhanh nhất**" hoặc "chỉ mua nơi **không lưu thông tin khách**".

**Ví dụ.**
- `data_collection: 'deny'` → quan trọng cho **media monitoring B2B**: dữ liệu khách không bị provider giữ lại.
- `require_parameters: true` → bắt buộc khi bật **B2 (JSON schema)** để không rơi vào provider bỏ qua schema.

### B7. Stream các tính năng `generate()`

**Chuyên ngành.** Chỉ báo UX then chốt là **TTFT — Time To First Token**, không phải tổng thời gian. Streaming cải thiện **perceived latency** dù tổng thời gian y hệt. `streaming: true` **đã bật**, nhưng `generate()` đang **gom hết → string** rồi mới trả → màn hình trắng 3–5s.

**Ví von.** Hai quán phở cùng nấu 5 phút. Quán A **bê ra khi xong hẳn** (nhìn bàn trống 5 phút). Quán B **bê nước dùng trước, rắc hành dần**. Cảm nhận khác hẳn.

**Ví dụ.** Chat đã stream (quán B). Compare/fact-check/brief đang là quán A. Sửa: đẩy qua SSE như chat (tái dùng `streamMessages` sẵn có) → chữ chạy dần, **gần như không tốn công**.

### B8. Multi-model consensus cho fact-check

**Chuyên ngành.** **Ensembling**: chạy cùng câu hỏi qua nhiều model độc lập (khác họ) rồi đối chiếu. Đồng thuận → tin cậy cao; bất đồng → cảnh báo. Họ hàng *self-consistency*.

**Ví von.** Xin ý kiến **3 bác sĩ độc lập**. Ba cùng "u lành" → yên tâm. Hai "lành", một "cần sinh thiết" → thận trọng. Sự **bất đồng** là thông tin quý.

**Ví dụ.**
```
Claim: "Giá vàng sẽ đạt 100 triệu/lượng tuần tới"
  Qwen → insufficient · Llama → insufficient · Gemini → conflicting
Kết quả: ⚠️ "Các mô hình chưa đồng thuận — độ chắc chắn thấp"
```
Củng cố định vị chống tin giả. Tốn 2–3× lời gọi → chỉ cho tính năng cao cấp/gói trả phí.

### B9. Agentic RAG bằng tool-calling

**Chuyên ngành.** **Tool/function calling**: khai báo công cụ (vd `search_news(query)`); model tự quyết **khi nào gọi**, tham số gì, đọc kết quả, **gọi tiếp** (multi-hop). Bước từ **RAG tĩnh** (truy hồi 1 lần) lên **agentic RAG** (tự lập kế hoạch truy hồi nhiều bước).

**Ví von.** RAG hiện tại: *đưa sẵn 5 tài liệu* rồi bảo "trả lời trong đây". Agentic: đưa AI *quyền vào kho tự tra*, nó tự nghĩ "tra 'lạm phát' trước, rồi tra tiếp 'lãi suất' dựa kết quả đầu".

**Ví dụ.** Câu hỏi phức: *"So sánh phản ứng các báo về vụ X **và** liên hệ vụ Y năm ngoái"* cần **2 lượt truy hồi**. RAG tĩnh 1 lần sẽ hụt; agentic để model tự `search_news("vụ X")` rồi `search_news("vụ Y")`. **Thay đổi kiến trúc lớn** → tầm nhìn xa.

### ⛔ Điều KHÔNG nên làm

**Đừng chuyển embedding sang OpenRouter.** Embedding cần **ổn định chiều vector** (1024, khoá cứng vào cột `vector(1024)` của pgvector) và chạy **khối lượng lớn**. Provider cloud đổi model một ngày là **toàn bộ kho vector vô giá trị** → phải re-embed cả DB. Ví von: embedding là **hệ toạ độ bản đồ** — đổi hệ thì mọi điểm đã đánh dấu đều sai chỗ. Giữ bge-m3/Ollama cục bộ là quyết định đúng.

---

## Ưu tiên triển khai

Xếp theo **giá trị / công sức**:

| Ưu tiên | Việc | Thuật ngữ | Một câu để nhớ |
|---|---|---|---|
| 1 | **B1** định tuyến model theo tác vụ | model tiering / router | Việc vặt cho model rẻ, việc khó cho model mạnh |
| 2 | **B2** structured output (fact-check) | JSON Schema / constrained decoding | Biểu mẫu có ô tick thay vì giấy trắng |
| 3 | **B3** đo token & chi phí | usage accounting / FinOps | Gắn công-tơ điện cho từng tính năng |
| 4 | **B7** stream các `generate()` | TTFT / perceived latency | Bê nước dùng ra trước, rắc hành dần |
| — | B4 web `:online` · B5 server fallback · B6 provider prefs | routing / web-augmented | Bổ sung khi lên sản phẩm/B2B |
| — | B8 consensus · B9 agentic RAG | ensemble · tool-calling | Tầm nhìn xa, tốn kém hơn |

**Nguyên tắc xuyên suốt:** OpenRouter mạnh nhất ở chỗ *đổi model chỉ là đổi slug* — hãy khai thác điều đó (tiering, fallback, consensus) thay vì coi nó như một endpoint OpenAI đơn thuần.
