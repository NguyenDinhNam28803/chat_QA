# NewsQA — Nhật ký cải tiến V2 (Giai đoạn 2)

> Tiếp nối [CAI-TIEN.md](CAI-TIEN.md). Giai đoạn 2 triển khai các đề xuất trong [DE-XUAT-TINH-NANG.md](DE-XUAT-TINH-NANG.md) **không cần auth** — khai thác 2 "đòn bẩy ẩn" (`distance`, corpus đa nguồn) để nâng **niềm tin** và **chất lượng lõi**.
>
> Thứ tự thực hiện: **A3 → A1 → E3 → E1 → B2**. Mỗi mục: **vấn đề → giải pháp → file → bằng chứng**.

---

## V2-A3 · Nhãn độ tin cậy câu trả lời *(answer confidence)* — 2026-07-04

**Vấn đề:** `retrieval.service` đã tính `distance` (cosine) cho mỗi chunk nhưng **vứt đi**; người dùng không biết câu trả lời dựa trên nền vững hay yếu.

**Giải pháp:** tính `confidence` từ (a) khoảng cách cosine nhỏ nhất, (b) số nguồn độc lập — rồi hiện chỉ báo trên câu trả lời.
- `retrieval/context.builder.ts`: `scoreConfidence(minDistance, sources)` → `{ level: high|medium|low, sources, minDistance }`. Ngưỡng bge-m3: high nếu `sources≥2 && minDistance<0.58`; low nếu `minDistance≥0.68` hoặc `sources≤1`.
- `retrieval.types.ts`: thêm interface `Confidence` + trường `confidence` vào `RetrievalResult`.
- `chat/chat.service.ts`: đẩy `confidence` vào sự kiện SSE `done`.
- FE `lib/useChatStream.ts` + `app/chat/page.tsx`: `ConfidenceBadge` — "✓ Độ tin cậy cao · N nguồn" (muted) hoặc "⚠ Độ tin cậy thấp — nên kiểm chứng" (viền accent).

**Bằng chứng:** SSE done trả `"confidence":{"level":"high","sources":3,"minDistance":0.41}`; câu hỏi lệch chủ đề (không có nguồn) → low. Unit test `context.builder.spec` bổ sung ca confidence.

---

## V2-A1 · Kiểm chứng tin đồn / claim *(fact-check RAG)* — 2026-07-04

**Vấn đề:** hệ thống mới "trả lời", chưa "đối chứng" — không có công cụ kiểm tra một nhận định đúng/sai theo nhiều nguồn.

**Giải pháp:** module mới, tái dùng ~100% pipeline RAG nhưng đổi nhiệm vụ LLM sang **phân loại lập trường (stance)**.
- `factcheck/factcheck.service.ts`: `check(claim)` → `retrieval.search(claim, k=12)` (lấy rộng để có cả phía phản bác) → LLM `factCheckPrompt` phán một trong `supported | conflicting | insufficient` (dòng `VERDICT:` đầu, tự parse) + phân tích **Ủng hộ / Phản bác / Kết luận** kèm trích dẫn. Không có nguồn → `insufficient` trung thực.
- `factcheck/factcheck.controller.ts`: `GET /factcheck?claim=`. Module import `RetrievalModule` + `LlmModule`.
- FE `app/factcheck/page.tsx` + Nav "Kiểm chứng": ô nhập → thẻ verdict (✅/⚠️/❓) + phân tích markdown + nguồn đối chứng.

**Bằng chứng:** `/factcheck?claim=...` trả `verdict` + 5 nguồn + phân tích ~630 ký tự; `/factcheck` render 200.

---

## V2-E3 · Gợi ý câu hỏi theo bài — 2026-07-04

**Vấn đề:** gợi ý câu hỏi trước đây (CT-12) chỉ suy từ citations trong chat; trang bài chưa mời người đọc hỏi tiếp.

**Giải pháp:** LLM đề xuất 3 câu hỏi bám nội dung bài, **cache**; trang bài hiện chip → mở chat điền sẵn.
- Schema: thêm `Article.questions Json?` (raw SQL `ALTER TABLE` + prisma generate).
- `articles.service.ts` `suggestQuestions(id)`: cache trong `Article.questions`; `suggestQuestionsPrompt` → tách 3 dòng. Endpoint `GET /articles/:id/questions`.
- FE `app/articles/[id]/page.tsx`: nút "✦ Gợi ý câu hỏi" (lazy, kiểm soát chi phí LLM) → chip `Link href="/chat?q=..."`.
- FE `app/chat/page.tsx`: đọc `?q=` lúc mount → tự gửi 1 lần + dọn URL (`history.replaceState`).

**Bằng chứng:** `/articles/:id/questions` trả 3 câu hỏi grounded (vd bão số 1: giờ đổ bộ, gió/sóng ở các đảo, lượng mưa) và cache lại.

---

## V2-E1 · Hỏi nối tiếp đa lượt *(query rewriting)* — 2026-07-04

**Vấn đề:** mỗi câu hỏi trong chat được truy hồi độc lập; câu nối tiếp kiểu "còn ông ấy thì sao?" mất ngữ cảnh → tìm sai nguồn.

**Giải pháp:** trước khi truy hồi, nếu là câu nối tiếp trong hội thoại → **viết lại thành truy vấn độc lập** bằng LLM.
- `chat/chat.service.ts` `rewriteFollowup(question, conversationId)`: lấy 4 message gần nhất → `rewriteFollowupPrompt` → truy vấn độc lập dùng cho `retrieval.search` (câu hỏi gốc vẫn dùng để sinh câu trả lời + hiển thị). **Best-effort**: lỗi/timeout/kết quả bất thường → fallback câu gốc, chat không bao giờ vỡ.
- Chỉ chạy khi có `conversationId` + có lịch sử (không tốn thêm LLM ở câu đầu).

**Bằng chứng:** tsc + 15/15 test pass; câu đầu (không conversationId) bỏ qua rewrite; follow-up hoàn tất bình thường.

---

## V2-B2 · Câu chuyện đang phát triển *(developing story tracker)* — 2026-07-04

**Vấn đề:** sự kiện chỉ có "độ nóng" tĩnh; không phân biệt chuyện **đang diễn tiến** với tin một-lần.

**Giải pháp:** gắn cờ `developing` cho cụm sự kiện còn được đưa tin gần đây và trải dài theo thời gian.
- `events.service.ts` `isDeveloping(firstSeen, lastSeen, articleCount, ref)`: developing nếu `lastSeen` trong 24h **so với mốc tin mới nhất `ref`** (bền vững khi corpus cũ vài ngày giữa các lần nạp) + span ≥ 6h + ≥ 3 bài. Thêm `developing` vào `listEvents`; `listDeveloping()` + `GET /events/developing`.
- FE `app/page.tsx`: dải **"● Đang phát triển"** (thẻ cuộn ngang, chấm accent nhấp nháy) + badge trên hero khi `cur.developing`.

**Bằng chứng:** `/events/developing` trả 8 sự kiện đa nguồn thật (Tân Đại sứ Mỹ, Bí thư TP.HCM…); homepage render 200.

---

## Tổng kết Giai đoạn 2

| Mã | Tính năng | Endpoint / UI mới | Chi phí LLM |
|---|---|---|---|
| A3 | Nhãn độ tin cậy | (trong SSE done) + badge chat | 0 (dùng `distance` sẵn có) |
| A1 | Fact-check RAG | `GET /factcheck` · `/factcheck` | 1/lần (không cache) |
| E3 | Gợi ý câu hỏi | `GET /articles/:id/questions` | 1/bài, **cache** |
| E1 | Hỏi nối tiếp | (nội bộ chat) | 1/câu nối tiếp (nhỏ) |
| B2 | Đang phát triển | `GET /events/developing` + dải trang chủ | 0 (thuần heuristic) |

**Còn lại (Giai đoạn 3 — cần auth):** C1 semantic alerts, C2 digest cá nhân hóa, D1 media monitoring (B2B). A2 (phát hiện đăng lại) và rerank (E2) có thể xen kẽ, không cần auth.

**Kiểm chứng tổng:** BE tsc 0 · **jest 15/15** · lint 0 · `next build` OK (13 route, thêm `/factcheck`) · Docker rebuild BE+FE · các endpoint mới trả đúng · trang render 200.
