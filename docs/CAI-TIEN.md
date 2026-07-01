# NewsQA — Nhật ký cải tiến (Changelog)

> Ghi lại các thay đổi/cải tiến SAU khi hoàn tất 7 phase gốc. Mỗi mục: **vấn đề → cách giải quyết → file thay đổi → bằng chứng**.
>
> Tài liệu liên quan: [ONBOARDING.md](ONBOARDING.md) · [BUSINESS-FLOW.md](BUSINESS-FLOW.md) · [kế hoạch gốc](plans/2026-06-27-newsqa-master-plan.md).

---

## CT-1 · Tách 2 Ollama (chat vs ingestion) — 2026-06-30

**Vấn đề:** ingestion và chat dùng CHUNG một Ollama. Ollama xử lý request tuần tự, nên khi ingestion đang embed hàng loạt chunk, câu hỏi của chat phải xếp hàng phía sau → embed câu hỏi nhảy từ ~0.6s lên **16-28s** → `/chat/stream` timeout.

**Giải pháp (Hướng A):** chạy **2 container Ollama**, mỗi cái 1 việc — cùng model `bge-m3` → vector 1024.

```
Chat / Retrieval ──► ollama        (11434)   ← độ trễ thấp, ưu tiên
Ingestion ─────────► ollama-ingest (11435)   ← nền, không cản chat
```

**File thay đổi:**
- `docker-compose.yml`: thêm service `ollama-ingest` (port 11435) + volume `newsqa-ollama-ingest`.
- `server/.env`: thêm `EMBEDDING_INGEST_BASE_URL=http://localhost:11435`.
- `server/src/embedding/embedding.service.ts`: constructor nhận `@Optional() baseUrlOverride?: string`.
- `server/src/embedding/embedding.module.ts`: export thêm token `EMBEDDING_INGEST` (factory tạo instance trỏ 11435). Instance mặc định vẫn là chat (11434).
- `server/src/ingestion/ingestion.service.ts`: `@Inject(EMBEDDING_INGEST)`. Retrieval giữ instance mặc định.

**Cạm bẫy gặp phải:** thêm tham số `baseUrlOverride?: string` khiến NestJS tưởng đó là dependency và cố inject provider kiểu `String` → **crash exit 1 lúc boot**. Khắc phục: đánh dấu `@Optional()` để Nest bỏ qua param.

**Bằng chứng:** ingestion chạy nền (articles 195→196) trong khi embed chat trên 11434 vẫn **~1.1s**; chat `DONE:true`. Đã bật `INGEST_ON_BOOT=true` thường trực.

**Đánh đổi:** tốn thêm ~1.2GB RAM cho model thứ 2 (Ollama tự unload sau ~5 phút idle).

---

## CT-2 · Sửa crash backend do undici (uncaught exception) — 2026-06-30

**Vấn đề:** backend tự sập (exit 1) khi ingestion `fetch()` một số trang báo. Lỗi `AssertionError: assert(!this.paused)` từ **undici** (HTTP client của `fetch`) khi server tin tức đóng TLS socket không chuẩn. Lỗi ném **bất đồng bộ từ handler sự kiện socket**, nằm ngoài `try/catch` quanh `await fetch` → uncaught exception → giết cả server.

**Giải pháp (2 lớp):**
1. `server/src/main.ts`: thêm lưới `process.on('uncaughtException')` + `process.on('unhandledRejection')` — log lỗi nhưng **giữ process sống**. Một fetch lỗi từ web ngoài không thể giết server chat.
2. `server/src/ingestion/content-extractor.service.ts`: bọc `fetch` bằng `AbortController` timeout 15s (+ `finally` clear timer).

**Bằng chứng:** ingestion chạy trọn 3 feed, articles 95→173, không crash (trước đây sập ở feed tuoitre).

---

## CT-3 · Công tắc `INGEST_ON_BOOT` — 2026-06-30

**Vấn đề:** trước khi có CT-1, mỗi lần restart backend, scheduler tự nạp (drain + re-add 3 feed) → chiếm Ollama → chat chậm; không có cách tắt nhanh để demo.

**Giải pháp:** thêm công tắc env trong `server/src/ingestion/ingestion.scheduler.ts`:
- `INGEST_ON_BOOT=false` → bỏ qua tự nạp khi boot (Ollama rảnh cho chat).
- `true` / bỏ trống → hành vi cũ (nạp định kỳ).

Sau CT-1, công tắc này không còn cần thiết để chat mượt, nhưng vẫn hữu ích để tắt nạp khi cần tiết kiệm tài nguyên.

---

## CT-4 · Phase 7 — Frontend Next.js + xử lý trùng cổng — 2026-06-28

**Vấn đề:** kế hoạch gốc đặt cả Next dev lẫn `NEXT_PUBLIC_API_URL` ở cổng 3000 — trùng cổng backend.

**Giải pháp:** backend giữ **:3000**, Next chạy **:3001** (`next dev -p 3001`), `NEXT_PUBLIC_API_URL=http://localhost:3000`, CORS backend mở cho origin `http://localhost:3001`.

**File:** `web/.env.local`, `web/src/lib/useChatStream.ts` (hook EventSource SSE), `web/src/app/page.tsx`, `server/src/main.ts` (CORS).

---

## CT-5 · Giao diện chat hiện đại + bảng màu "Editorial Indigo" — 2026-06-30

**Vấn đề:** UI mặc định generic (blue-600 + zinc), thiếu chuyên nghiệp.

**Giải pháp:** thiết kế lại với bảng màu **Slate (neutral) + Indigo 600 (accent) + Violet 500 (gradient)** — hợp tông tin tức/editorial, đáng tin.

**Cải tiến cụ thể:**
- Header **glass** (backdrop-blur) + brand mark gradient + badge "Trực tuyến".
- Tin nhắn có **avatar**, hiệu ứng xuất hiện, bong bóng AI dạng thẻ ring+shadow, user gradient indigo.
- Citations dạng **chip** bấm được (số trong ô vuông, tiêu đề + nguồn).
- **Composer** bo tròn, focus glow, nút gửi icon máy bay giấy + spinner.
- Trạng thái rỗng có **chip câu hỏi mẫu**; caret nhấp nháy khi stream; auto-scroll; scrollbar mảnh.

**File:** `web/src/app/page.tsx`, `web/src/app/globals.css`, `web/src/app/layout.tsx` (metadata).

---

## CT-6 · Cập nhật model LLM (roster OpenRouter đổi) — 2026-06-28→30

**Vấn đề:** model `:free` của OpenRouter thay đổi/biến mất liên tục:
- `deepseek/deepseek-chat-v3:free` (kế hoạch gốc) → **đã bị gỡ**.
- `qwen3-next-80b`, `llama-3.3-70b` → **429 rate-limit** thường xuyên.

**Giải pháp:**
- Model hiện dùng: primary `openai/gpt-oss-120b:free`, fallback `openai/gpt-oss-20b:free`.
- `server/src/llm/llm.service.ts`: **thay `withFallbacks` bằng fallback THỦ CÔNG**. Lý do: `withFallbacks` + streaming **chập chờn treo** khi primary 429 (stream mở nhưng không lỗi sạch). Bản thủ công: thử từng model theo thứ tự, mỗi lần bọc `AbortController` timeout 30s, chỉ chuyển model khi **chưa phát token nào** (không thể restart giữa chừng). `maxRetries:0` để fail nhanh.
- Quy trình kiểm tra slug còn sống: `curl https://openrouter.ai/api/v1/models`, hoặc thử `POST /chat/completions` từng model.

**Bằng chứng:** trước khi sửa chat treo 41s ngẫu nhiên; sau khi sửa, smoke test 2 lần đều `DONE:true` (5-15s).

**Lưu ý:** độ trễ chat còn lại chủ yếu do free-tier OpenRouter (primary hay 429 → rớt fallback). Muốn nhanh/ổn định hơn → key trả phí (xem giải thích model trong chat trước đó).

---

## CT-8 · Lịch sử chat (sidebar) — 2026-06-30

**Vấn đề:** backend đã lưu Conversation + Message nhưng UI chỉ giữ chat trong RAM phiên hiện tại — reload là mất, không xem lại được hội thoại cũ.

**Giải pháp:** sidebar liệt kê hội thoại + mở lại toàn bộ tin nhắn (kèm nguồn) + hỏi tiếp trong hội thoại đó. AI vẫn trả lời độc lập từng câu (không đổi LLM).

**File thay đổi:**
- `server/src/chat/chat.service.ts`: thêm `listConversations()` + `getMessages(id)` (Prisma query thuần).
- `server/src/chat/chat.controller.ts`: `GET /chat/conversations` + `GET /chat/conversations/:id/messages`.
- `web/src/lib/useChatStream.ts`: thêm state `conversationId` + `conversations`, hàm `loadConversation`, `newConversation`, `refreshList`; gửi kèm `conversationId` → append đúng hội thoại; bắt `conversationId` từ event `done` của hội thoại mới rồi refresh sidebar.
- `web/src/app/page.tsx`: layout 2 cột — sidebar (danh sách + nút "Cuộc trò chuyện mới", thu gọn trên mobile) + khung chat.

**Bằng chứng:** `/chat/conversations` trả 31 hội thoại; mở lại hiện đủ user+assistant+nguồn; hỏi tiếp với conversationId → message 2→4, không tạo hội thoại mới; CORS cho :3001 OK.

---

## CT-12 · Phase 11 — Tính năng sản phẩm — 2026-06-30

**A. Thẻ chủ đề + lọc lĩnh vực:** cột `Article.topic` (backfill 611 bài; Thể thao 216, Sức khỏe 120, Công nghệ 103…). `topic.classifier.ts` (luật từ khóa, 9 nhóm, có test). Gán khi ingest. `retrieval.search(q, k, topic?)` lọc theo topic; truyền qua `/chat/stream?...&topic=`. UI có hàng chip lọc lĩnh vực trên khung chat.

**B. Copy + gợi ý câu hỏi (thuần FE):** nút "⧉ Chép" mỗi câu trả lời; sau khi trả lời hiện 2-3 chip gợi ý suy ra từ citations ("Tóm tắt bài: …") — bấm gửi như câu hỏi mới, không tốn LLM.

**C. Thư viện bài + tìm kiếm:** `ArticlesModule` (`GET /articles?q=&topic=&page=`, `/articles/topics`, `/articles/:id`) dùng full-text `Article.contentTsv` (GIN). Trang `/articles` (tìm + chip topic + phân trang) + trang chi tiết `/articles/[id]` (toàn văn + link gốc). Link điều hướng từ chat.

**Verify:** Jest 14/14, lint sạch 2 project, typecheck web 0, endpoints + lọc topic hoạt động (the-thao→chỉ thể thao, kinh-te→chỉ kinh tế), cả 2 trang render 200. SQL ở `server/prisma/sql/2026-06-30-phase11-topics.sql`.

## CT-9 · Phase 8 — Chất lượng retrieval — 2026-06-30

- **Hybrid search**: kết hợp vector (`<=>`) + full-text (`tsvector` config `simple`) bằng **Reciprocal Rank Fusion** (k=60, pool 20 mỗi bên). Bắt được tên riêng/số liệu mà vector hay trượt.
- **Recency boost**: cộng điểm nhỏ (hệ số 0.005, phân rã 7 ngày) → tin mới thắng khi độ liên quan tương đương, nhưng KHÔNG lấn át relevance.
- **Index**: `contentTsv` (GIN) + **HNSW** (vector_cosine_ops) — SQL ở `server/prisma/sql/2026-06-30-phase8-hybrid.sql`.
- **Chunking theo câu** (`chunk.service.ts`): gom trọn câu tới ~400 token, câu quá dài fallback cắt theo từ. Không cắt giữa câu → embed chuẩn hơn.

## CT-10 · Phase 9 — UX & độ tin cậy — 2026-06-30

- **Markdown rendering** (`react-markdown` + renderer Tailwind trong `page.tsx`): `**đậm**`, danh sách, link… hiển thị đẹp thay vì ký tự thô.
- **Hiện lỗi LLM** (`useChatStream.ts`): khi stream fail và chưa có token nào → hiện "⚠️ Không nhận được phản hồi…" thay vì bong bóng rỗng.

## CT-11 · Phase 10 — Bền vững & vận hành — 2026-06-30

- **`/health`**: kiểm tra Postgres + 2 Ollama, trả `status ok/degraded` + uptime.
- **Integration tests**: `chat.service.spec.ts` (orchestration: token→done→lưu 2 message) + `ingestion.service.spec.ts` (dedup url/hash). Mock cuid2 & content-extractor để né ESM. **Jest 9/9 pass**.
- **CI** (`.github/workflows/ci.yml`): backend lint/test/build + web lint/typecheck/build (không cần infra vì test đã mock).
- **Dockerize**: `server/Dockerfile` + `web/Dockerfile` (multi-stage) + `.dockerignore`; services `backend`/`frontend` trong compose dưới **profile `app`** (mặc định `up` vẫn chỉ infra; `--profile app up --build` chạy cả app). Cả 2 image đã build thành công.

## CT-7 · Mở rộng nguồn tin (3 feed) — 2026-06-28

**Thay đổi:** `server/src/ingestion/feeds.config.ts` từ 1 feed → **3 feed**: VnExpress, Tuổi Trẻ, Thanh Niên (đều "tin mới nhất").

---

## Bảng tra nhanh cấu hình mới

| Biến/cổng | Giá trị | Ý nghĩa |
|---|---|---|
| `ollama` | host **11434** | Ollama cho chat/retrieval |
| `ollama-ingest` | host **11435** | Ollama cho ingestion |
| `EMBEDDING_BASE_URL` | `http://localhost:11434` | embed của chat |
| `EMBEDDING_INGEST_BASE_URL` | `http://localhost:11435` | embed của ingestion |
| `INGEST_ON_BOOT` | `true` | tự nạp khi boot (đặt `false` để tắt) |
| `REDIS_PORT` | **6380** | tránh Redis native 3.0.504 giữ 6379 |
| backend | **:3000** | NestJS |
| frontend | **:3001** | Next.js (`next dev -p 3001`) |
| `LLM_PRIMARY_MODEL` | `openai/gpt-oss-120b:free` | model chính |
| `LLM_FALLBACK_MODEL` | `openai/gpt-oss-20b:free` | model dự phòng |
