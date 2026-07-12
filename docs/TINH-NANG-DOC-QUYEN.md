# 🧬 Báo cáo phân tích & Đề xuất tính năng độc quyền — Điểm Tin AI (NewsQA)

> **Câu hỏi đặt hàng:** *"Chỉ web dự án này mới có thể làm được gì?"*
>
> Đây **không** phải danh sách tính năng chatbot chung chung. Mọi đề xuất dưới đây đều xuất phát từ **một tài sản độc quyền** mà dự án đang nắm nhưng **chưa khai thác** — thứ mà Google News, Báo Mới, VnExpress, và cả ChatGPT **không thể có**.
>
> Tài liệu nền: [BAO-CAO-DU-AN.md](BAO-CAO-DU-AN.md) (kiến trúc) · [DE-XUAT-TINH-NANG.md](DE-XUAT-TINH-NANG.md) (đề xuất vòng 1 — phần lớn **đã làm xong**). Báo cáo này là **vòng 2**, đi xa hơn những gì đã triển khai.
>
> **Trạng thái (cập nhật 2026-07-12, V3):** ✅ **F2** (máy dò giật tít) và ✅ **F5** (dự báo tăng nhiệt) **đã triển khai & chạy thật** — xem [CAI-TIEN-V3.md](CAI-TIEN-V3.md). Còn lại: F4, F1, F3, F6–F8.

---

## 1. Phương pháp: định nghĩa "độc quyền"

Một tính năng chỉ được xếp là **độc quyền** nếu nó cần **cả 3** yếu tố mà đối thủ thiếu ít nhất một:

| Yếu tố độc quyền | Aggregator (Báo Mới, Google News) | ChatGPT | **Điểm Tin AI** |
|---|---|---|---|
| **Kho tin đa nguồn theo thời gian** (cùng sự kiện, nhiều báo, lưu lịch sử) | Có link, không có nội dung/lịch sử | ❌ Không | ✅ Có (`Article` + `contentHash` + `publishedAt`) |
| **Embedding ngữ nghĩa mọi đoạn** (so sánh máy được) | ❌ | ❌ | ✅ `Chunk.embedding` vector(1024) |
| **Chụp lại theo thời gian** (crawl lặp mỗi 30′) | ❌ | ❌ | ✅ Cron BullMQ + `contentHash` |

> **Nguyên tắc lọc:** nếu một tính năng chỉ cần *một* bài báo là làm được → không độc quyền (ChatGPT làm được). Chỉ giữ tính năng cần **so sánh nhiều nguồn** và/hoặc **so sánh theo thời gian** — đó là hai trục duy nhất dự án này độc chiếm.

---

## 2. Phát hiện then chốt: **4 tài sản đã có nhưng đang "ngủ"**

Phân tích code cho thấy 4 dữ liệu **đã thu thập/đã tính nhưng đang bị bỏ phí** — mỗi cái mở khóa một nhóm tính năng độc quyền, gần như **miễn phí LLM**:

| Tài sản ngủ | Bằng chứng trong code | Đang dùng cho | Mở khóa được gì |
|---|---|---|---|
| **`contentHash` khi crawl lặp** | `ingestion.service.ts:54` chỉ dùng để **skip trùng** | Chống trùng | **Phát hiện bài bị SỬA/GỠ ngầm** (§4.1) |
| **Tiêu đề chưa được embed riêng** | `chunk.service.ts` chỉ embed **thân bài** | (không) | **Máy dò giật tít** tít↔nội dung (§4.2) |
| **`feedback` 👍/👎** | Ghi ở `chat.service.ts`, **không đọc lại ở đâu** | (không) | Xếp hạng chất lượng nguồn/câu trả lời |
| **`Event.hotness` chỉ là ảnh chụp** | `events.service.ts:104` tính 1 lần, không lưu chuỗi | Xếp hạng nóng | **Dự báo chủ đề đang tăng nhiệt** (§4.5) |

> Đây là "đòn bẩy ẩn": dữ liệu đã nằm sẵn trong DB, chi phí khai thác gần như bằng 0.

---

## 3. Tổng quan đề xuất vòng 2 (8 tính năng độc quyền)

| # | Tính năng | Trục độc quyền | Tái dùng | LLM | Khác biệt | Khả thi |
|---|---|---|---|---|---|---|
| **F1** | **Radar bài bị sửa/gỡ ngầm** (stealth-edit watchdog) | Thời gian | `contentHash` re-crawl | 0 (tùy chọn 1) | 🟢🟢 Rất cao | 🟢 Cao |
| ✅ **F2** | **Máy dò giật tít** (tít ↔ nội dung) — *đã làm (V3)* | Ngữ nghĩa | Embedding + title | 0 | 🟢 Cao | 🟢 Cao |
| **F3** | **Thước đo khung tường thuật** (framing/bias per nguồn) | Đa nguồn | Cụm sự kiện + LLM | Thấp (cache) | 🟢🟢 Rất cao | 🟡 TB |
| **F4** | **Bảng phong độ nguồn** (nhanh–đúng–bị phản bác) | Đa nguồn + Thời gian | P1 "ai đưa đầu" + factcheck | 0 | 🟢 Cao | 🟢 Cao |
| ✅ **F5** | **Dự báo chủ đề tăng nhiệt** (trend forecasting) — *đã làm (V3)* | Thời gian | vận tốc từ `Article.publishedAt` | 0 | 🟢 Cao | 🟢 Cao |
| **F6** | **Kho phát ngôn** (ai đã nói gì — quote DB) | Đa nguồn | NER (P3) + trích dẫn | Thấp | 🟢 Cao | 🟡 TB |
| **F7** | **Bản đồ lan truyền tin** (echo/repost map) | Đa nguồn + Thời gian | Embedding + `publishedAt` | 0 | 🟢 Cao | 🟡 TB |
| **F8** | **Chế độ đọc cân bằng** (phá bong bóng khung tin) | Đa nguồn | Cụm + F3 framing | 0 | 🟡 TB | 🟢 Cao |

*(F1–F8 nối tiếp mã A/B/C/D/E của đề xuất vòng 1, không trùng.)*

---

## 4. Deep-dive — 5 tính năng mạnh nhất

### 🥇 F1. Radar bài bị **sửa/gỡ ngầm** *(stealth-edit & retraction watchdog)*

**Nghiệp vụ:** Báo Việt thường **sửa hoặc gỡ bài lặng lẽ** sau khi đăng (đổi tiêu đề, sửa số liệu, xóa đoạn nhạy cảm) mà không ghi chú "đã cập nhật". Dự án đã crawl lặp mỗi 30′ và tính `contentHash` cho mỗi bài → **chỉ cần so hash cũ với hash mới của CÙNG một URL** là phát hiện được ngay: bài nào bị sửa, sửa lúc nào, và (nếu lưu snapshot) sửa **chỗ nào**.

- **Vì sao CHỈ web này làm được:** Cần hai thứ độc quyền — (1) **chụp lại theo thời gian** (cron + contentHash), (2) **kho nội dung đầy đủ** (không chỉ link). Google News/Báo Mới chỉ giữ link hiện tại; ChatGPT không có ảnh quá khứ. Đây là phiên bản Việt của *NewsDiffs / Politwoops* — **chưa ai làm cho báo chí VN**.
- **Hiện trạng code:** `ingestion.service.ts:54–55` đang **vứt đi** thông tin này — khi URL đã tồn tại thì skip, không so sánh nội dung. Chỉ cần: URL trùng nhưng `contentHash` khác → ghi một bản ghi `ArticleRevision(articleId, oldHash, newHash, changedAt, diff?)`.
- **Tái dùng:** 100% pipeline ingest. Thêm 1 bảng `ArticleRevision`. Diff văn bản bằng thư viện diff thuần (0 LLM); tùy chọn 1 lời LLM tóm tắt "đã đổi gì" (cache).
- **Chi phí:** ~0 LLM. Chỉ thêm dung lượng lưu snapshot nội dung cũ.
- **Giá trị:** Định vị **"giám sát báo chí" (watchdog)** — cực mạnh về truyền thông, dễ gây chú ý, hợp báo chí điều tra & nghiên cứu truyền thông. **Đây là tính năng "chữ ký" của sản phẩm.**
- **Rủi ro:** phân biệt "sửa lỗi chính tả vô hại" vs "sửa nội dung thực chất" → dùng ngưỡng khoảng cách embedding giữa bản cũ/mới để lọc thay đổi *đáng kể*.

### 🥈 F3. Thước đo **khung tường thuật** *(framing / bias meter theo nguồn)*

**Nghiệp vụ:** Với **cùng một sự kiện** (đã gom cụm ở PHA D), các báo dùng **từ ngữ, sắc thái, trọng tâm khác nhau**. Tính năng chấm mỗi nguồn trên cùng sự kiện: sắc thái (tích cực↔tiêu cực), mức "giật gân", **điều báo A nhấn mạnh mà báo B lược bỏ**. Tích lũy qua nhiều sự kiện → **hồ sơ khuynh hướng khung tin của từng tòa soạn**.

- **Vì sao CHỈ web này làm được:** Cần **cùng sự kiện xuyên nhiều báo** — chính xác thứ `Event` clustering tạo ra. Không có kho đa nguồn thì không có mẫu số chung để so khung. ChatGPT không có corpus; aggregator không phân tích.
- **Khác đề xuất cũ thế nào:** `/compare` hiện chỉ tóm tắt khác biệt **theo yêu cầu, một lần**. F3 biến nó thành **chỉ số bền vững theo nguồn theo thời gian** ("VietNamNet giật tít hơn 30% so với trung bình ở mảng công nghệ") — một tài sản dữ liệu, không phải một câu trả lời.
- **Tái dùng:** cụm sự kiện + `generateStructured()` (đã có ở B2) trả JSON `{source, sentiment, sensationalism, emphasizedPoints[]}`. Cache vào `Event.summary` mở rộng.
- **Chi phí:** 1 LLM/sự kiện (cache), không tính lại. Rẻ.
- **Rủi ro:** phải trình bày **trung lập, có dẫn chứng** (trích đúng câu) để không thành "dán nhãn cảm tính" — luôn kèm trích dẫn nguồn.

### 🥉 F2. Máy dò **giật tít** *(tít ↔ nội dung mismatch)*

**Nghiệp vụ:** Chấm mỗi bài một **điểm "khớp tít–bài"** = độ tương đồng cosine giữa **embedding tiêu đề** và **embedding thân bài**. Tít hứa hẹn nhưng nội dung không có → cosine thấp → gắn cờ **"nghi giật tít"**. Xếp hạng nguồn nào giật tít nhiều nhất.

- **Vì sao CHỈ web này làm được:** Cần **embedding cả tít lẫn thân** + so sánh hàng loạt. Aggregator không embed; ChatGPT chấm được 1 bài nhưng không có kho để xếp hạng nguồn.
- **Hiện trạng:** `chunk.service.ts` **chỉ embed thân bài**, tiêu đề bị bỏ. Chỉ cần embed thêm tiêu đề (1 vector/bài) → so với vector đại diện thân bài (đã có, `ord0`).
- **Tái dùng:** Embedding service sẵn có (`:11435`). **0 LLM.**
- **Chi phí:** ~0 (1 embedding tít/bài, chạy nền lúc ingest).
- **Giá trị:** Nối thẳng vào định vị **"chống tin giả / media literacy"** đã có (fact-check, confidence, blindspots). Bổ sung "chất lượng trình bày" bên cạnh "độ tin cậy nội dung".

### F5. **Dự báo chủ đề tăng nhiệt** *(trend forecasting)*

**Nghiệp vụ:** Hiện `Event.hotness` chỉ là **ảnh chụp**. Nếu ghi `hotness` **theo từng mốc crawl** (chuỗi thời gian), ta tính được **đạo hàm**: sự kiện/chủ đề nào đang **tăng tốc** (nhiều báo mới nhảy vào trong 6–12h qua) → *"đang nóng lên"* thay vì *"đã nóng"*. Cảnh báo sớm điểm nóng.

- **Vì sao CHỈ web này làm được:** Cần **lịch sử số nguồn theo thời gian cho từng cụm sự kiện** — chỉ có khi vừa gom cụm vừa crawl lặp. Độ nóng ở đây = **số tòa soạn nhảy vào**, khách quan hơn "lượt view" của aggregator.
- **Tái dùng:** thêm bảng `EventHotnessPoint(eventId, at, hotness, sourceCount)` ghi mỗi lần cluster. Tính slope bằng SQL. **0 LLM.**
- **Chi phí:** ~0. Thuần thống kê.
- **Rủi ro:** corpus/nguồn còn nhỏ → tín hiệu nhiễu; nên đặt ngưỡng tối thiểu số nguồn.

### F4. **Bảng phong độ nguồn** *(nhanh – độc quyền – có bị phản bác không)*

**Nghiệp vụ:** Gộp 3 tín hiệu đã có thành **thẻ điểm mỗi tòa soạn**: (a) **tốc độ** — trung bình đưa tin sớm/muộn bao nhiêu so với báo khác cùng sự kiện (mở rộng P1 "ai đưa đầu"); (b) **độ độc quyền** — tỷ lệ tin `sourceCount=1` (từ blindspots); (c) **độ tin cậy** — bao nhiêu nhận định của nguồn đó về sau bị nguồn khác **mâu thuẫn** (nối vào fact-check verdict `conflicting`).

- **Vì sao CHỈ web này làm được:** Cả 3 chỉ số đều cần **so sánh chéo nguồn theo thời gian**. Không kho đa nguồn = không tính được "sớm hơn ai", "ai phản bác".
- **Tái dùng:** P1 (`DISTINCT ON(event) ORDER BY publishedAt ASC`), blindspots (`sourceCount=1`), factcheck verdict — **tất cả đã có**, chỉ tổng hợp bằng SQL. **0 LLM.**
- **Chi phí:** ~0.
- **Giá trị:** Trang `/sources/[name]` hiện là hồ sơ tĩnh → biến thành **bảng phong độ định lượng** hấp dẫn, chia sẻ được.

> **F6 (kho phát ngôn), F7 (bản đồ lan truyền), F8 (đọc cân bằng)** — xem bảng §3; cùng nguyên lý tái dùng đa nguồn, xếp ở tầm nhìn xa hơn.

---

## 5. Ma trận ưu tiên (Giá trị độc quyền × Khả thi)

```
  Giá trị/Độc quyền
    cao │  F3 (framing meter)      F1 (stealth-edit) ★ chữ ký
        │  F7 (propagation map)    F4 (source scorecard)
        │                          F2 (clickbait) ★ quick win
        │  ──────────────────────────────────────────────
        │  F6 (quote DB)           F5 (trend forecast)
     TB │                          F8 (balanced read)
        └──────────────────────────────────────────────
           khó/nặng        Khả thi (tái dùng stack)      cao
```

- **Góc vàng (làm trước):** **F1, F2, F4, F5** — độc quyền cao **và** gần như 0 LLM, không cần auth.
- **Khác biệt hóa lớn nhất:** **F1 (stealth-edit)** + **F3 (framing)** — hai thứ đẩy định vị từ *"trợ lý đọc tin"* lên *"đài quan sát báo chí"* (media watchdog).

---

## 6. Lộ trình đề xuất

**Đợt 1 — Quick wins gần-0-chi-phí (không auth, không LLM):**
`F2 giật tít` (embed thêm tít) → `F5 dự báo tăng nhiệt` (ghi hotness time-series) → `F4 bảng phong độ nguồn` (tổng hợp SQL). Cả ba chỉ thêm cột/bảng + query, tận dụng dữ liệu đang bỏ phí.

**Đợt 2 — Tính năng "chữ ký":**
`F1 stealth-edit watchdog` (bảng `ArticleRevision` + snapshot nội dung cũ) → `F3 framing meter` (mở rộng cache cụm sự kiện, 1 LLM/cụm).

**Đợt 3 — Tầm nhìn:**
`F7 bản đồ lan truyền` → `F6 kho phát ngôn` → `F8 đọc cân bằng`. Song song: kích hoạt **`feedback` 👍/👎 đang ngủ** để xếp hạng chất lượng.

---

## 7. Kết luận & khuyến nghị

1. **Đòn bẩy lớn nhất là dữ liệu đang ngủ, không phải tính năng mới toanh.** `contentHash` khi re-crawl, tiêu đề chưa embed, `hotness` chưa thành chuỗi thời gian, `feedback` chưa đọc — 4 thứ này mở khóa F1/F2/F5 gần như miễn phí.
2. **Tính năng "chữ ký" nên là F1 (radar bài bị sửa/gỡ ngầm).** Đây là thứ **chỉ dự án này làm được** (cần chụp lại theo thời gian + kho nội dung đầy đủ), chưa có ai làm cho báo VN, và nâng sứ mệnh lên tầm *giám sát báo chí* — rất mạnh về truyền thông và học thuật.
3. **Thắng nhanh nhất là F2 (giật tít):** chỉ cần embed thêm tiêu đề, 0 LLM, ăn thẳng vào định vị chống tin giả đã có.
4. **Nguyên tắc xuyên suốt giữ nguyên:** mọi phân tích phải **kèm dẫn chứng trích dẫn** và **trung lập** — nếu không sẽ biến "đo lường" thành "phán xét cảm tính", đánh mất giá trị khách quan vốn là lợi thế cốt lõi.

> **Một câu để nhớ:** *Lợi thế độc quyền của dự án không nằm ở việc trả lời về tin, mà ở chỗ nó là nơi duy nhất so sánh được nhiều báo với nhau — và so báo hôm nay với chính nó hôm qua.*
