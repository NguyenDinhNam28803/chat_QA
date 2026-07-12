# NewsQA — Nhật ký cải tiến V3 (Giai đoạn 3)

> Tiếp nối [CAI-TIEN.md](CAI-TIEN.md) + [CAI-TIEN-V2.md](CAI-TIEN-V2.md). Giai đoạn 3 triển khai **lớp tính năng độc quyền** trong [TINH-NANG-DOC-QUYEN.md](TINH-NANG-DOC-QUYEN.md) — khai thác các **tài sản đang "ngủ"** (tiêu đề chưa embed, `hotness` chưa thành chuỗi thời gian). Cả hai **không cần auth, gần 0 LLM**.
>
> Thứ tự thực hiện: **F2 → F5**. Mỗi mục: **vấn đề → giải pháp → file → bằng chứng**.

---

## V3-F2 · Máy dò giật tít *(title↔body match score)* — 2026-07-12

**Vấn đề:** pipeline nạp tin **chỉ embed thân bài**, bỏ qua tiêu đề — một tài sản ngủ. Không có cách đo bài nào "giật tít" (tiêu đề hứa hẹn nhưng nội dung không tương xứng). Đây là mảnh còn thiếu trong định vị *chống tin giả / media literacy* (bên cạnh fact-check, confidence, blindspots).

**Giải pháp:** chấm mỗi bài một điểm **khớp tít–bài** = `cosine(embedding tiêu đề, centroid embedding thân bài)` ∈ [0,1]. Gắn cờ "nghi giật tít" theo **phân vị** (tương đối, tự hiệu chỉnh theo corpus) thay vì ngưỡng tuyệt đối — tránh cáo buộc cứng nhắc với tòa soạn.
- `embedding/vector.util.ts` (mới, thuần): `cosineSimilarity`, `centroid`, `titleBodyScore(titleVec, bodyVecs)` (clamp [0,1]), `parseVectorLiteral`.
- `ingestion/ingestion.service.ts`: embed **tiêu đề chung một lô** với các chunk (`embedBatch([title, ...chunks])` — không thêm round-trip), tính `titleBodyScore`, lưu vào `Article`. Thêm `backfillClickbait()` (idempotent, batch 32; centroid thân bài đọc từ pgvector `avg(embedding)`).
- Schema: cột `Article.titleBodyScore Float?` + index ([prisma/sql/2026-07-12-f2-clickbait.sql](../server/prisma/sql/2026-07-12-f2-clickbait.sql), áp raw SQL vào DB đang chạy).
- `articles.service.ts`: ngưỡng phân vị `clickbaitThreshold()` (`percentile_cont`, env `CLICKBAIT_PERCENTILE` mặc định 0.15); gắn `clickbaitFlag` vào `search` + `getById`; `clickbaitRanking(page)`.
- Endpoint: `POST /ingestion/backfill-clickbait` · `GET /articles/clickbait`.
- FE: `ClickbaitBadge` dùng chung (`components/ui.tsx`); badge trên `app/articles/[id]` + `app/articles`; **trang mới `app/clickbait`** (xếp hạng + giải thích cách đo, minh bạch) + link Nav "Radar giật tít".

**Bằng chứng:** backfill **4331 bài** (updated=4331 skipped=0), toàn corpus (4418) đã chấm; phân bố min 0.232 · avg 0.706 · max 0.862 (phân biệt tốt). `GET /articles/clickbait` trả ngưỡng 0.646 (phân vị 15%), top nghi giật tít hợp lý ("Sân vận động World Cup nào lập kỷ lục Guinness" 0.23, "Điểm tin 6h…", "Top 500 thí sinh…"). Unit test `vector.util.spec` (14 ca) + `ingestion.service.spec` nhánh insert. tsc 0, lint 0, các trang render 200.

**Hạn chế đã biết:** bài **tổng hợp/điểm tin** (bản chất tít chung chung) bị chấm thấp giống giật tít thật → có thể lọc bằng heuristic tiêu đề ("Điểm tin", "Tin tức sáng") ở đợt sau.

---

## V3-F5 · Dự báo chủ đề đang tăng nhiệt *(rising story tracker)* — 2026-07-12

**Vấn đề:** `Event.hotness` chỉ là **ảnh chụp tức thời** — biết "đã nóng" chứ không biết "đang nóng lên". Không có tín hiệu **hướng tới tương lai** (sự kiện nào nhiều báo đang dồn vào *ngay lúc này*).

**Giải pháp:** đo **vận tốc đưa tin** = so số bài/số báo **cửa sổ gần nhất** với **cửa sổ ngay trước đó**; velocity > 0 = đang tăng tốc.
- **Quyết định thiết kế (khác bản phác thảo báo cáo):** `cluster()` xóa/tạo lại toàn bộ Event mỗi lần → `Event.id` **không ổn định** giữa các lần chạy. Vì vậy **không** lưu time-series theo `eventId` (sẽ hỏng); thay vào đó tính velocity **trực tiếp từ `Article.publishedAt`** trong mỗi event. → **0 bảng mới, 0 cron, 0 LLM**, robust hơn.
- `events/rising.util.ts` (mới, thuần): `risingMetrics(timestamps, ref, windowMs)` → `{ recent, prior, velocity }`. `ref` = mốc tin mới nhất trong lô (bền vững khi corpus cũ vài ngày, cùng nguyên tắc `isDeveloping`).
- `events.service.ts` `listRising(limit=8, windowHours=12)`: lấy event đa nguồn (`sourceCount≥2`), tính velocity + số **báo mới vào** trong cửa sổ gần; lọc `velocity>0 && recentArticles≥2`; xếp theo velocity, rồi số báo mới.
- Endpoint: `GET /events/rising?window=` (mặc định 12h).
- FE `app/page.tsx`: dải **"▲ Đang tăng nhiệt"** (viền amber, badge `▲ +N bài/12h`, "N báo mới vào") đặt trên dải "Đang phát triển".

**Bằng chứng:** sau `POST /events/cluster` (600 bài → 465 event), `GET /events/rising` trả **8 sự kiện** velocity dương, hợp lý: "Vụ lật ca nô ở Phú Quốc" (9 bài/3 báo gần đây vs 5 trước), bán kết World Cup 2026, "Bellingham…" (4 bài/2 báo vs 1). Unit test `rising.util.spec` (4 ca, gồm biên cửa sổ). tsc 0, lint 0, homepage render 200.

**Khác gì "Đang phát triển" (B2)?** B2 hỏi *"chuyện còn được cập nhật không?"* (hồi tưởng). F5 hỏi *"chuyện có đang tăng tốc không?"* (dự báo) — hai tín hiệu bổ sung nhau.

---

## Tổng kết Giai đoạn 3

| Mã | Tính năng | Tài sản ngủ khai thác | Endpoint / UI mới | Chi phí LLM |
|---|---|---|---|---|
| F2 | Máy dò giật tít | tiêu đề chưa embed | `GET /articles/clickbait` · `POST /ingestion/backfill-clickbait` · trang `/clickbait` + badge | 0 (chỉ +1 embedding tít/bài) |
| F5 | Đang tăng nhiệt | `hotness` chưa thành chuỗi thời gian | `GET /events/rising` + dải trang chủ | 0 (thuần thống kê) |

**Còn lại (đề xuất vòng 2, xem [TINH-NANG-DOC-QUYEN.md](TINH-NANG-DOC-QUYEN.md)):** F4 (bảng phong độ nguồn — tổng hợp SQL) · F1 (radar bài bị sửa/gỡ ngầm — tính năng "chữ ký") · F3 (thước đo khung tường thuật) · F6/F7/F8 (tầm nhìn).

**Kiểm chứng tổng:** BE tsc 0 · **jest 34/34** · lint 0 · Docker rebuild BE+FE 2 lần · backfill 4331 bài · các endpoint mới trả đúng trên dữ liệu thật · trang render 200.
