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

## CT-24 · Lưu trữ tin theo quý + "Nhìn lại" (tổng kết quý/năm) — 2026-07-02

Thêm chu kỳ **theo quý** (giữ toàn bộ dữ liệu, trang chủ chỉ hiện quý hiện tại) + tổng kết AI.
- **Schema (raw SQL vào Postgres Docker + prisma generate):** bảng `Period` (kind, label "Quý III/2026", year, quarter, startDate, endDate exclusive, status active|archived, summary cache, articleCount, eventCount, topEvents/byTopic Json dự phòng, `@@unique([year,quarter])`) + `YearReview` (year @unique, content).
- **`PeriodsService`:** `getActive()` tự tạo quý hiện tại + **archive quý cũ** (snapshot counts, không LLM); `computeStats(start,end)` tính LIVE (bài/sự kiện/topEvents top10/byTopic) — dữ liệu quá khứ đã "đóng băng" nên không cần đọc snapshot; `getPeriod(id)` sinh + cache **recap AI** cho quý đã lưu (`periodRecapPrompt`: Tổng quan / Điểm nóng chính / Xu hướng lĩnh vực); `rollover()` (thủ công) archive + sinh recap ngay; `yearReview(year)` gộp recap các quý → "Năm ... là một năm như thế nào?" (`yearReviewPrompt`, cache `YearReview`).
- **Endpoints:** `GET /periods/active`, `GET /periods`, `GET /periods/:id`, `GET /periods/year/:year`, `POST /periods/rollover`. `GET /events?from=ISO` lọc sự kiện theo mốc đầu quý. Module `PeriodsModule` (import LlmModule) + đăng ký app.module.
- **Trang chủ:** banner **"Tin tức được cập nhật từ ngày DD/MM/YYYY"** + nhãn quý (lấy `startDate` quý active) để kiểm chứng; sự kiện lọc theo `?from` = đầu quý.
- **Trang `/review` (Nhìn lại):** nhóm quý theo năm, thẻ từng quý (khoảng ngày, số bài, sự kiện nóng, trạng thái) → `/review/[id]`; nút **"Năm vừa rồi thế nào?"** tải tổng kết năm inline. `/review/[id]`: recap AI + điểm nóng của quý + phân bố lĩnh vực. `Nav` thêm "Nhìn lại".
- **Lưu ý:** recap quý & tổng kết năm **chỉ sinh cho quý đã archive**; quý đang chạy hiện chú thích "đang diễn ra". Rollover tự động chưa có cron → chạy thủ công `POST /periods/rollover` khi sang quý mới (hoặc thêm scheduler sau). Không backfill quá khứ (RSS chỉ có tin gần đây).
- **Verify:** BE tsc+lint 0 · Docker rebuild BE+FE · `/periods/active` = Quý III/2026 từ 01/07/2026 (905 bài, 62 sự kiện) · `/periods/:id` trả topEvents 10 + byTopic 9 · `/`, `/review`, `/review/[id]` render 200.

## CT-23 · Nhóm A (Sự kiện + Đồng thuận/Mâu thuẫn) + Trang chủ — 2026-07-02

Chuyển từ "feed phẳng" sang **news intelligence event-centric** — điểm khác biệt so với aggregator.
- **Schema:** bảng `Event` (title, topic, summary, articleCount, sourceCount, firstSeen/lastSeen, hotness) + `Article.eventId` (FK SetNull, `@@index`). **Áp bằng raw SQL trực tiếp vào Postgres Docker đang chạy** (CREATE TABLE + ALTER TABLE ADD COLUMN + FK + index) thay vì `prisma migrate` để không phải reset dev DB; sau đó `prisma generate` để client có model `Event`.
- **Gom cụm sự kiện** (`EventsService.cluster`): lấy bài 4 ngày gần nhất + embedding đại diện (chunk ord0), gom bằng **cosine trong JS** (threshold 0.72, greedy), tạo Event + gán eventId, xoá event mồ côi. 600 bài → 457 cụm, **24 sự kiện đa nguồn** (đúng thực tế: áp thấp Biển Đông 3 báo/9 bài…). `hotness = sourceCount*3 + articleCount + recencyBonus` (guard NaN).
- **Đồng thuận/Mâu thuẫn** (`getEvent`): LLM phân tích **Tóm tắt + Điểm đồng thuận + Khác biệt/lưu ý** từ các bài đa nguồn, **cache trong Event.summary**. `eventAnalysisPrompt`.
- **Endpoints:** `GET /events` (đa nguồn, xếp theo hotness), `GET /events/:id`, `POST /events/cluster`. Module `EventsModule` (import LlmModule).
- **Trang chủ (`/`):** bố cục kiểu **trang sự kiện** (theo designdotmd.directory, mục "event"): **hero headliner** (sự kiện nóng nhất, tiêu đề lớn 3.4rem, badge "Đang nóng") → **lưới sự kiện** (lineup, thẻ "N báo") → **dòng tin mới** dạng agenda (giờ · tiêu đề · nguồn). Giữ bộ nhận diện Robotics Lab.
- **Trang chủ — Điểm nóng động (carousel):** hero tự xoay vòng 5 tin nóng (5s/lần, lặp), nút ‹ ›, chấm điều hướng, **dừng khi hover**, hiệu ứng `slide-fade`.
- **Trang chủ — gói "Sinh động":** thanh **breaking** chạy ngang (marquee, dừng khi hover), **dải số liệu đếm tăng** (CountUp rAF), **thanh tiến trình** carousel, **card fade-in so le** (animation-delay), **thời gian tương đối** ("3 giờ trước").
- **Trang chủ — gói "Giàu thông tin":** `listEvents` bổ sung `sources[]` + `times[]` (từ quan hệ `articles`); FE thêm **SourceStack** (avatar chữ tắt nguồn xếp chồng, gộp theo tên báo, +N), **Sparkline** (SVG bar nhịp bài theo thời gian), **chip từ khóa nổi** từ `/insights` → `/timeline?q=`. **Chat chuyển sang `/chat`** (copy + sửa path). Trang `/events/[id]` (phân tích AI + timeline đa nguồn). `Nav` thêm Trang chủ + Chat; back-link "← Chat"→"← Trang chủ".
- **Lưu ý:** clustering chạy thủ công `POST /events/cluster` (chưa cron); nên thêm vào scheduler để "live". listEvents chưa trả field hotness (UI không cần) nhưng đã trả `sources[]` + `times[]`.
- **Verify (cập nhật cuối):** BE build+lint+test 14/14 · web typecheck+lint 0 · Docker rebuild backend+frontend · cluster 600 bài→24 sự kiện đa nguồn · `/events` trả sources+times · event detail phân tích 3 báo OK · **8 trang render 200** (`/`, `/chat`, `/brief`, `/timeline`, `/compare`, `/articles`, `/dashboard`, `/events/[id]`) · homepage: carousel + breaking marquee + count-up + progress bar + card stagger + SourceStack + Sparkline + chip từ khóa đều hoạt động.

## CT-22 · Gỡ bỏ quả địa cầu — 2026-07-01

Theo yêu cầu (không cần thiết): xóa `components/Globe.tsx`, gỡ import ở dashboard, **gỡ dependency `cobe`**. Biểu đồ "Lượng bài nạp" chuyển full-width thế chỗ. (Phần sửa chart ở CT-21 vẫn giữ.) typecheck/lint 0, Docker rebuild, /dashboard 200.

## CT-21 · Sửa chart lượng bài + thêm quả địa cầu (cobe, ĐÃ GỠ ở CT-22) — 2026-07-01

- **Fix chart "Lượng bài nạp":** bug — cột `<div style height:%>` có phần tử cha (flex-col) KHÔNG có chiều cao xác định → % không tính được → bar collapse. Sửa: bọc bar trong `<div className="relative flex-1">` (flex-1 trong cột `h-52` = chiều cao xác định) rồi bar `absolute bottom-0 h-[pct%]`, `Math.max(pct,3)` để cột nhỏ vẫn thấy; thêm nhãn số (luôn hiện) trên + ngày dưới.
- **Quả địa cầu:** `components/Globe.tsx` dùng **cobe** (đã cài 2.0.1). Dynamic-import cobe TRONG useEffect (WebGL client-only, né SSR). Marker: Việt Nam + Washington/London/Bắc Kinh/Tokyo/Paris. `onRender` tự xoay. Panel "Phủ sóng tin tức" cạnh chart (grid 3 cột: globe 1 + chart 2). **Màu:** ban đầu `dark:0` + đất xám nhạt trên thẻ TRẮNG → tàng hình; sửa thành **`dark:1` (cầu tối) + chấm sáng 0.92 + marker cam + mapBrightness 5.2** để nổi trên nền trắng lab.
- **Lưu ý cobe v2:** `COBEOptions` trong .d.ts THIẾU `onRender` (dù README dùng) → cast `opts as unknown as Parameters<typeof createGlobe>[1]`.
- **Verify:** typecheck+lint 0, local next build OK (cobe bundle), Docker rebuild, /dashboard 200.

## CT-20 · Thiết kế lại Dashboard chuyên nghiệp — 2026-07-01

Cấu trúc lại RIÊNG trang `/dashboard` (giữ hệ Robotics Lab) thành bảng điều khiển phân tích:
- **KPI 6 ô:** Tổng bài · Bài hôm nay (+delta vs hôm qua) · Đoạn vector · Lĩnh vực · Hội thoại · Tin nhắn. (Thêm `totalConversations`/`totalMessages` vào `stats()`.)
- **Biểu đồ:** cột "Lượng bài nạp · 14 ngày" (TB/ngày, hover hiện số) · thanh "Phân bố lĩnh vực" (có %, bấm → lọc thư viện) · thanh "Nguồn tin".
- **Panel + nút "Xem chi tiết →":** mỗi panel có header + link tới trang liên quan (Phân bố→Thư viện, Từ khóa→Dòng thời gian, Nguồn→Xem bài, Tin mới→Xem tất cả). Component `Kpi` + `Panel` tái sử dụng trong file.
- **Layout:** max-w-6xl, grid 3 cột (chart span 2), responsive. Accent cam dành cho biểu đồ; link chi tiết subtle (hover mới thành cam).
- **Verify:** BE build+lint+test 14/14; web typecheck+lint 0; Docker rebuild; stats trả usage; /dashboard render 200.

## CT-19 · 3 trụ tính năng AI (Summary/Brief/Timeline/Compare/Insight) — 2026-07-01

Thêm 5 tính năng AI tận dụng RAG + đa nguồn, **cache LLM để né rate-limit free-tier**.
- **Schema:** `Article.summary` (cache) + bảng `DailyBrief(date @unique, content)`. `LlmService.generate(system,user)` (single-shot, tách `streamMessages` dùng chung với streamAnswer) + `features.prompts.ts`.
- **Trụ 1 — Tóm tắt:** `GET /articles/:id/summary` (cache trong Article.summary) + nút "Tóm tắt AI" ở chi tiết bài · `GET /brief` (cache theo ngày, tổng hợp 24 tin mới nhất) + trang `/brief`.
- **Trụ 2 — Dòng thời gian & Đối chiếu:** `GET /timeline?q=` (full-text search → sắp theo `publishedAt` + narrative LLM) + trang `/timeline` (mốc thời gian). `GET /compare?q=` (nhóm bài theo nguồn → LLM so sánh góc nhìn) + trang `/compare`.
- **Trụ 3 — Insight:** `GET /insights` (THUẦN SQL, không LLM): bài/ngày 14 ngày, top nguồn, từ khóa nổi (đếm term trong tiêu đề 3 ngày, lọc stopwords tiếng Việt). Mở rộng `/dashboard`.
- **Endpoints:** summary trong ArticlesController; brief/timeline/compare/insights trong `FeaturesController` (@Controller() root). ArticlesModule import LlmModule.
- **UI:** component `Nav` (6 mục) + `Markdown` dùng chung (components/ui.tsx). Timeline/Compare có narrative graceful (LLM lỗi vẫn hiện data).
- **Verify:** BE build+lint+test 14/14; web typecheck+lint 0; Docker rebuild; test thật 5 endpoint OK (summary 16s, timeline 15 bài+narrative, compare nhóm 2 nguồn+bảng, brief nhóm lĩnh vực cache, insights nhanh).

## CT-18 · Đổi design.md → "Robotics Lab" (light) — 2026-07-01

User đổi `design.md` sang **Robotics Lab** (bench-white, safety-orange). Re-skin toàn bộ.
- **Palette (light):** bg #F2F3F5 (nền), surface #FFFFFF (thẻ), fg #17191C (chữ), muted #636870 (viền/metadata), **accent #FF6A00 (cam an toàn — 1 hành động/màn)**, on-accent #FFFFFF.
- **Font:** Space Grotesk (display/heading, cỡ lớn), Inter (body), IBM Plex Mono (label) — cả 3 subset latin+vietnamese.
- **Bo góc mềm:** radius tokens sm 3px / md 6px / lg 10px (nút rounded-md, thẻ rounded-lg).
- Quy trình: đổi giá trị token + font trong globals.css/layout.tsx, rồi sed đổi lớp dark→light trên 5 file (`border-white/`→`border-black/`, `bg-white/`→`bg-black/`, `divide-white/`→`divide-black/`, `decoration-white/`→`decoration-black/`, `brightness-110`→`95`, `rounded-sm`→`rounded-md`, thêm `rounded-lg` cho card).
- **Verify:** typecheck+lint 0, local next build OK, rebuild Docker; CSS chứa #ff6a00/#f2f3f5/#17191c + Space Grotesk + IBM Plex Mono; trang 200.

## CT-17 · Đổi design.md → "The Verge" (dark, đã thay bằng CT-18) — 2026-07-01

User cập nhật `design.md` sang hệ mới **The Verge** (tech-editorial dark, rave-flyer). Re-skin lại toàn bộ 7 file web:
- **Palette (dark):** bg #0C0C10, surface #14141C, fg #F2FFF4 (mint-trắng), muted #93A1A8, **accent #9EFF00 (xanh chanh acid — 1 hành động/màn)**, on-accent #0C0C10.
- **3 font:** Archivo (display/heading, weight 800-900, cỡ lớn), Inter (body), JetBrains Mono (label). next/font: Archivo+Inter subset latin+vietnamese, JetBrains chỉ latin (font không có subset vietnamese → dấu tiếng Việt fallback).
- Tokens Tailwind v4 `@theme`: `bg-bg/bg-surface/text-fg/text-muted/text-accent/bg-accent/text-on-accent`; viền dark dùng `border-white/10-20`.
- Accent 1 hành động/màn: chat=GỬI, thư viện=TÌM, chi tiết="Đọc bản gốc", dashboard=thanh biểu đồ (+ logo mark là signature accent). Heading dùng Archivo đậm to tạo năng lượng "rave-flyer".
- **Verify:** typecheck+lint 0, **local `next build` OK** (validate font subset), rebuild Docker frontend; CSS bundle chứa #9eff00/#0c0c10/#f2fff4 + Archivo + JetBrains; trang render 200.

## CT-16 · Thiết kế lại theo design.md — "Dispatch Mono" (đã thay bằng CT-17) — 2026-07-01

Thay toàn bộ hệ "Editorial Indigo" bằng **Dispatch Mono** (theo `design.md`): press độc lập, monospace, một accent cam.
- **Palette:** ink #1B1714 (chữ/tiêu đề), muted #716A62 (viền/metadata), **accent #D9541A (cam — CHỈ 1 hành động/màn hình)**, paper #F6F1E7 (nền), surface #FDF9EF (thẻ). Bỏ dark mode (design là light-only) → xoá `ThemeToggle`, `@custom-variant dark`, script no-FOUC.
- **Font:** IBM Plex Mono toàn bộ (next/font, subset latin+vietnamese).
- **Hình khối:** phẳng (KHÔNG gradient/shadow), viền 1px, bo góc sắc (0/2px/4px), nhiều khoảng trắng, label uppercase letter-spacing 0.08em.
- **Accent 1 hành động/màn:** chat = nút GỬI; thư viện = nút TÌM; chi tiết = "Đọc bản gốc"; dashboard = thanh biểu đồ. Còn lại dùng ink/muted (kể cả link trong câu trả lời).
- **File:** viết lại `globals.css`, `layout.tsx`, `components/ui.tsx`, `page.tsx`, `articles/page.tsx`, `articles/[id]/page.tsx`, `dashboard/page.tsx`.
- **Verify:** web typecheck+lint 0; rebuild Docker frontend; bundle CSS chứa #d9541a/#f6f1e7/#1b1714 + IBM Plex Mono; các trang render 200.

## CT-15 · Thêm nguồn tin + cap item/feed — 2026-07-01

- Mở rộng `feeds.config.ts` lên **7 feed** (thêm Thanh Niên Thế giới/Công nghệ + VietNamNet Thời sự/Công nghệ). **Sửa URL VietNamNet**: bản thật bỏ tiền tố `/rss/` (`vietnamnet.vn/thoi-su.rss`); feed "tin mới nhất" của VietNamNet 404 → bỏ.
- **`MAX_ITEMS_PER_FEED = 60`** trong `rss.service.ts` (`.slice(0,60)`): VietNamNet Thời sự trả ~1000 item, nếu nạp hết sẽ chiếm worker cả giờ và chặn feed khác. Lấy 60 tin mới nhất/lần, phần còn lại cuốn chiếu qua chu kỳ 30'.
- Quy trình khi đổi feed: sửa `feeds.config.ts` → `docker compose --profile app up -d --build backend` → `POST /ingestion/run` để nạp ngay (repeatable job chỉ chạy ở mốc 30' kế tiếp).

## CT-14 · Phase 12 — Web UX & Insight (Nhóm A + B) — 2026-07-01

**Phân tích số liệu** (788 bài, tăng ~310/ngày): chủ đề lệch nặng (Thể thao 34.8% ↔ Thế giới 1%), **14.3% câu trả lời "không tìm thấy"**, 100% có citations, chat 2.7 msg/hội thoại.

**Nhóm A:**
- **A1 Dashboard** (`/dashboard`): endpoint `/articles/stats` (totals, byTopic, latest) + trang thẻ số liệu + biểu đồ thanh phân bố lĩnh vực (bấm → lọc) + tin mới nhất.
- **A2 Trạng thái + Dừng:** hook thêm `phase` (retrieving/generating) + `stop()`; UI hiện "🔎 Đang tìm nguồn…/✍️ Đang soạn…" + nút Dừng (đóng EventSource, giữ token đã có).
- **A3 Fallback "không tìm thấy":** phát hiện câu từ chối → chip "Bỏ lọc lĩnh vực" + "Duyệt thư viện bài".
- **A4 Skeleton:** khung xương khi tải danh sách/chi tiết bài (`components/ui.tsx`).

**Nhóm B:**
- **B1 Bài liên quan:** `/articles/:id/related` (cùng chủ đề, mới nhất) + section cuối trang chi tiết.
- **B2 Feedback 👍/👎:** cột `Message.feedback Int?`; chat emit `messageId` ở event done; `POST /chat/messages/:id/feedback`; nút 👍/👎 trên câu trả lời.
- **B3 Dark mode toggle:** `@custom-variant dark` (class-based) + script no-FOUC trong layout + `ThemeToggle` (localStorage).
- **B4 Tìm live + highlight:** debounce 350ms ô tìm; `highlight()` tô vàng từ khóa khớp trong tiêu đề/trích đoạn.

**Verify:** BE build+lint+test 14/14; web lint+typecheck 0; deploy Docker (`--profile app up --build`), endpoints stats/related/feedback + trang dashboard/articles/detail render OK.

## CT-13 · Đổi thương hiệu + nâng hiển thị + deploy Docker — 2026-07-01

- **Thương hiệu:** đổi "NewsQA" → **"Điểm Tin AI"** (logo chữ "Đ") ở layout title, sidebar, avatar AI, footer.
- **Hiển thị nội dung:**
  - Danh sách bài (`/articles`): thêm **trích đoạn** (`snippet` = `left(content,240)` từ API), badge chủ đề dạng pill, tiêu đề lớn hơn, nút "Đọc tiếp →".
  - Chi tiết bài (`/articles/[id]`): **tách đoạn dễ đọc** (content lưu 1 dòng → gom câu thành đoạn ~3 câu), typography lớn (text-[17px] leading-8), **thời gian đọc**, badge chủ đề, nút "Đọc bản gốc".
- **Deploy Docker (thật):** `docker compose --profile app up -d --build` → backend + frontend chạy trong container (image build từ code mới nhất), nối postgres/redis/2 ollama qua service name. Backend lấy `OPENROUTER_API_KEY` + models từ `server/.env` qua `env_file`, biến mạng do `environment` ghi đè. Verified: `/health` ok, brand đúng, snippet có, chat streaming chạy. **Lưu ý sự cố:** Docker Desktop từng tắt giữa chừng → backend crash `ECONNREFUSED 6380` (redis down); khởi động lại Docker Desktop là phục hồi.

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
