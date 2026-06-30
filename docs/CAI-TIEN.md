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
- `server/src/llm/llm.service.ts`: thêm `maxRetries:1` để khi model bị 429 thì rớt sang fallback nhanh thay vì treo trên backoff.
- Quy trình kiểm tra slug còn sống: `curl https://openrouter.ai/api/v1/models`, hoặc thử `POST /chat/completions` từng model.

**Lưu ý:** độ trễ chat 6-18s còn lại chủ yếu do free-tier OpenRouter, không phải lỗi hệ thống. Muốn nhanh/ổn định hơn → key trả phí.

---

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
