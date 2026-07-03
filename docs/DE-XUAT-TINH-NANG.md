# 📈 Đề xuất nghiệp vụ & tính năng mới — NewsQA

> Báo cáo góc nhìn **Business Analyst / Product Strategy**. Đề xuất các nghiệp vụ mới có thể bổ sung, đánh giá theo tiêu chí **khác biệt – thực tế – ứng dụng – khả thi – chi phí**, dựa trên hạ tầng RAG hiện có (pgvector + bge-m3 + OpenRouter).
>
> Tài liệu bổ trợ: [phân tích nghiệp vụ hiện trạng](#phụ-lục-phân-tích-nghiệp-vụ-hiện-trạng) ở cuối file.

---

## 1. Nguyên tắc đề xuất

Tài sản cốt lõi của NewsQA **không phải tin tức**, mà là hạ tầng **"lớp trí tuệ trên tin tức"** — 4 tài sản kỹ thuật đã có sẵn và chưa khai thác hết:

| Tài sản đã có | Đang dùng cho | Còn khai thác được gì |
|---|---|---|
| **Vector DB (pgvector + bge-m3)** — mọi chunk đã có embedding | Tìm kiếm ngữ nghĩa | Gom cụm sự kiện, phát hiện trùng lặp, cảnh báo ngữ nghĩa |
| **RAG grounded + OpenRouter** | Q&A, compare, brief | Kiểm chứng tin, judge, tóm tắt theo dõi |
| **Tín hiệu feedback 👍/👎** | (mới thu, chưa dùng) | Cải thiện chất lượng, xếp hạng |
| **BullMQ cron + đa nguồn RSS** | Nạp tin định kỳ | Giám sát, cảnh báo, digest tự động |

- **Nguyên tắc 1:** ưu tiên tính năng **tái dùng hạ tầng sẵn có** (chi phí thấp, khác biệt cao); tránh tính năng cần stack hoàn toàn mới (TTS, video…).
- **Nguyên tắc 2:** mọi đề xuất phải **khác chính thống** — nếu VnExpress/Tuổi Trẻ làm được thì không đề xuất.

---

## 2. Khung tiêu chí chấm điểm

Mỗi đề xuất chấm trên 5 trục (thang **Cao / TB / Thấp**):

- **Khác biệt** — so với báo chính thống VN
- **Thực tế** — có nhu cầu thật, đau thật
- **Ứng dụng** — độ rộng đối tượng & use case
- **Khả thi** — dựa trên stack hiện tại (tái dùng được bao nhiêu)
- **Chi phí vận hành** — số lần gọi LLM (thấp = tốt)

---

## 3. Danh mục đề xuất & bảng điểm

Nhóm theo **4 trục chiến lược**.

| # | Nghiệp vụ đề xuất | Trục | Khác biệt | Thực tế | Ứng dụng | Khả thi | Chi phí |
|---|---|---|---|---|---|---|---|
| **A1** | **Kiểm chứng tin đồn / claim** (fact-check RAG) | Niềm tin | 🟢 Cao | 🟢 Cao | 🟢 Cao | 🟢 Cao | 🟡 TB |
| **A2** | **Phát hiện trùng lặp / "báo nào đăng lại của ai"** | Niềm tin | 🟢 Cao | 🟡 TB | 🟡 TB | 🟢 Cao | 🟢 Thấp |
| **A3** | **Nhãn độ tin cậy câu trả lời** (confidence + cảnh báo ít nguồn) | Niềm tin | 🟢 Cao | 🟢 Cao | 🟢 Cao | 🟢 Cao | 🟢 Thấp |
| **B1** | **Gom cụm sự kiện tự động** (semantic event clustering) | Tổng hợp | 🟢 Cao | 🟢 Cao | 🟢 Cao | 🟡 TB | 🟢 Thấp |
| **B2** | **Câu chuyện đang phát triển** (developing story tracker) | Tổng hợp | 🟢 Cao | 🟢 Cao | 🟡 TB | 🟡 TB | 🟡 TB |
| **C1** | **Theo dõi chủ đề ngữ nghĩa + cảnh báo** (semantic alerts) | Cá nhân hóa | 🟢 Cao | 🟢 Cao | 🟢 Cao | 🟡 TB\* | 🟢 Thấp |
| **C2** | **Digest cá nhân hóa** (brief theo mối quan tâm) | Cá nhân hóa | 🟡 TB | 🟢 Cao | 🟢 Cao | 🟡 TB\* | 🟢 Thấp |
| **D1** | **Giám sát thương hiệu/nhân vật (media monitoring)** — B2B | Thương mại | 🟢 Cao | 🟢 Cao | 🟢 Cao | 🟡 TB\* | 🟡 TB |
| **E1** | **Hỏi nối tiếp đa lượt** (query rewriting theo hội thoại) | Chất lượng lõi | 🔵 (nội bộ) | 🟢 Cao | 🟢 Cao | 🟢 Cao | 🟢 Thấp |
| **E2** | **Hybrid search + rerank** (nâng chất lượng mọi tính năng) | Chất lượng lõi | 🔵 (nội bộ) | 🟢 Cao | 🟢 Cao | 🟢 Cao | 🟢 Thấp |
| **E3** | **Gợi ý câu hỏi** theo bài/chủ đề | Tương tác | 🔵 Thấp | 🟡 TB | 🟢 Cao | 🟢 Cao | 🟢 Thấp |

> `*` = phụ thuộc **hệ thống định danh người dùng (auth)** — hiện dự án **chưa có**. Đây là "khóa chốt" (blocker) cho nhóm C và D.

---

## 4. Deep-dive — 4 đề xuất mạnh nhất

### 🥇 A1. Kiểm chứng tin đồn / claim *(fact-check RAG)*

**Nghiệp vụ:** Người dùng dán một *nhận định/tin đồn* → hệ thống truy hồi các đoạn **ủng hộ** và **mâu thuẫn** xuyên nguồn, rồi LLM phán: **✅ Được nhiều nguồn xác nhận / ⚠️ Các nguồn mâu thuẫn / ❓ Chưa đủ dữ liệu để kết luận**, kèm trích dẫn cả hai phía.

- **Vì sao mới & giá trị:** Bài toán *media literacy* nhức nhối ở VN (tin giả mạng xã hội). Báo chính thống **không** cung cấp công cụ tự kiểm chứng; họ chỉ đăng bài. NewsQA biến corpus đa nguồn thành **máy đối chứng**.
- **Khả thi (Cao):** Tái dùng gần như 100% pipeline RAG. Khác biệt kỹ thuật: prompt yêu cầu LLM **phân loại lập trường (stance)** thay vì trả lời tự do; truy hồi lấy `k` lớn hơn để có cả phía phản bác.
- **Rủi ro:** Corpus chỉ có tin chính thống → không kiểm chứng được tin ngoài phạm vi (phải trả "chưa đủ dữ liệu" trung thực — thực ra là điểm mạnh, không bịa).
- **Lý do đưa vào:** Chuyển định vị từ "trợ lý đọc tin" → **"công cụ chống tin giả"** — nâng tầm sứ mệnh, dễ truyền thông, dễ xin tài trợ giáo dục.

### 🥈 B1. Gom cụm sự kiện tự động *(semantic event clustering)*

**Nghiệp vụ:** Thay vì lọc theo chuyên mục cứng, hệ thống **tự động gom các bài nói về CÙNG MỘT SỰ VIỆC** (dù khác báo, khác tiêu đề) thành một "cụm sự kiện" bằng độ tương đồng vector — rồi đặt tên cụm + đếm số nguồn đưa tin.

- **Vì sao mới:** Báo chính thống nhóm theo **chuyên mục do người đặt**. NewsQA nhóm theo **sự kiện có thật, tự phát hiện, xuyên tòa soạn** → trả lời "hôm nay *sự việc gì* đang nóng và *bao nhiêu báo* đưa" — một dạng **radar tin nóng khách quan** (độ nóng = số nguồn, không phải lượt view).
- **Khả thi (TB):** Embedding đã có sẵn. Cần bước gom cụm trên vector (chạy nền BullMQ): làm đơn giản bằng **ngưỡng cosine** trên pgvector (mỗi bài mới tìm cụm gần nhất, vượt ngưỡng thì gộp) — không cần thư viện ML nặng.
- **Chi phí (Thấp):** Gom cụm thuần vector, **không tốn LLM**; chỉ dùng LLM 1 lần để đặt tên cụm (cache được).
- **Lý do đưa vào:** Là **nền cho Timeline & Compare** (đang dựa vào full-text match yếu). Có cụm sự kiện thì compare/timeline chính xác hơn hẳn. Một mũi tên trúng ba đích.

### 🥉 A3. Nhãn độ tin cậy câu trả lời *(answer confidence)*

**Nghiệp vụ:** Mỗi câu trả lời RAG kèm **chỉ báo độ vững**: dựa trên (a) *khoảng cách cosine* của chunk truy hồi (gần = tin cậy hơn), (b) *số nguồn độc lập* ủng hộ. Hiển thị "Trả lời dựa trên 3 nguồn, độ liên quan cao" hoặc cảnh báo "⚠️ Chỉ 1 nguồn, độ liên quan thấp — cân nhắc".

- **Vì sao mới:** Không sản phẩm tin tức VN nào **tự công khai mức độ chắc chắn** của thông tin. Đây là minh bạch hóa — hợp định vị chống tin giả.
- **Khả thi (Cao) & Chi phí (Thấp):** `distance` **đã có sẵn** trong `retrieval.service` (`c.embedding <=> vec AS distance`) nhưng đang **bị vứt đi** — chỉ cần đưa lên UI + một ngưỡng. Gần như không tốn công.
- **Lý do đưa vào:** Rẻ nhất, nhanh nhất, tăng niềm tin ngay. "Quick win" điển hình.

### 💼 D1. Giám sát thương hiệu/nhân vật *(media monitoring — hướng B2B)*

**Nghiệp vụ:** Doanh nghiệp/cá nhân đăng ký "từ khóa quan tâm" (thương hiệu, lãnh đạo, đối thủ) → hệ thống theo dõi mọi bài mới đề cập xuyên nguồn, phân tích **sắc thái (tích cực/tiêu cực)**, gửi **cảnh báo** khi có tin, tổng hợp báo cáo tuần.

- **Vì sao mới & giá trị thương mại:** Thị trường **có tiền thật** ở VN (YouNet Media, Kompa…). NewsQA có sẵn ~80% hạ tầng (đa nguồn, embedding, LLM phân tích sắc thái). Là **con đường thương mại hóa** rõ ràng nhất.
- **Khả thi (TB):** Cần **auth + multi-tenant** (mỗi khách một danh mục theo dõi) và **mở rộng nguồn** (media monitoring cần độ phủ rộng hơn 4 RSS). Đây là đề xuất "tham vọng nhất, xa nhất".
- **Lý do đưa vào:** Định hướng dài hạn — biến dự án học thuật thành sản phẩm có mô hình doanh thu. Đặt ở tầm nhìn, không làm ngay.

---

## 5. Ma trận ưu tiên (Giá trị × Khả thi)

```
   Giá trị/Khác biệt
      cao │  B1 (cụm sự kiện)      A1 (fact-check)
          │  D1 (monitoring)*      A3 (confidence) ★quick win
          │                        C1 (semantic alert)*
          │  ─────────────────────────────────────────
          │  B2 (developing)       E2 (hybrid+rerank)
      TB  │  C2 (digest)*          E1 (hỏi nối tiếp)
          │                        E3 (gợi ý câu hỏi)
          └───────────────────────────────────────────
             thấp/khó        Khả thi (tái dùng stack)      cao
                        (* = cần auth trước)
```

- **Góc vàng (làm trước):** A3, A1, B1, E2 — giá trị cao **và** khả thi cao, không cần auth.
- **Cần mở khóa auth:** C1, C2, D1 — giá trị cao nhưng bị chặn bởi hạ tầng định danh.
- **Nền tảng chất lượng (xen kẽ):** E1, E2 — không "sexy" nhưng nâng chất mọi tính năng khác.

---

## 6. Lộ trình đề xuất (phasing)

**Giai đoạn 1 — Quick wins & củng cố niềm tin (không cần auth):**
`A3 confidence` (rẻ nhất) → `E2 hybrid search + rerank` (nâng chất nền) → `A1 fact-check`.

**Giai đoạn 2 — Khác biệt hóa tổng hợp:**
`B1 gom cụm sự kiện` (làm nền) → nâng cấp Timeline/Compare dựa trên cụm → `B2 developing story` → `A2 phát hiện trùng lặp`.

**Giai đoạn 3 — Cá nhân hóa & thương mại (mở khóa auth trước):**
Xây `auth/multi-user` → `C1 semantic alerts` → `C2 digest` → `D1 media monitoring` (B2B).

**Xuyên suốt:** khai thác **tín hiệu feedback 👍/👎 đang bị bỏ không** để đánh giá và tinh chỉnh chất lượng (E-series).

---

## 7. Kết luận & khuyến nghị

- **Thắng nhanh nhất:** `A3 – nhãn độ tin cậy` — dữ liệu `distance` đã nằm sẵn trong code, chỉ chưa dùng.
- **Khác biệt hóa lớn nhất:** `A1 – fact-check` + `B1 – gom cụm sự kiện` — cả hai tái dùng RAG/vector, đẩy định vị lên tầm **"công cụ chống tin giả & radar sự kiện khách quan"**, thứ không báo chính thống nào cung cấp.
- **Chốt chặn cần gỡ:** muốn chạm nhóm giá trị cao nhất (cá nhân hóa, B2B) thì **hệ thống auth/định danh** là điều kiện tiên quyết — xếp vào roadmap sớm dù bản thân nó không phải "tính năng".
- **Đòn bẩy ẩn:** `feedback` và `distance` — hai dữ liệu **đã thu/đã tính nhưng đang bỏ phí**; khai thác chúng cho ROI cao nhất.

---

## Phụ lục: Phân tích nghiệp vụ hiện trạng

Bảng phân loại các nghiệp vụ **đang có** (căn cứ đưa ra đề xuất phía trên).

| # | Nghiệp vụ | Phân loại | Có ở báo chính thống? |
|---|---|---|---|
| 1 | Hỏi-đáp RAG có trích dẫn nguồn (chat streaming) | 🟢 **Mới hẳn** | ❌ Không |
| 2 | So sánh cách các báo đưa tin (compare) | 🟢 **Mới hẳn** | ❌ Không |
| 3 | Dòng thời gian sự kiện tự động + narrative (timeline) | 🟢 **Mới hẳn** | ⚠️ Có bản thủ công |
| 4 | Bản tin sáng AI tổng hợp đa nguồn (daily brief) | 🟡 Cải biến | ⚠️ Có bản biên tập tay |
| 5 | Tóm tắt AI từng bài (article summary) | 🟡 Cải biến | ⚠️ Đang phổ biến dần |
| 6 | Danh sách / trang chi tiết bài + snippet | 🔵 Sao chép | ✅ Có |
| 7 | Lọc theo chuyên mục / topic | 🔵 Sao chép | ✅ Có |
| 8 | Bài liên quan (related) | 🔵 Sao chép | ✅ Có ("tin liên quan") |
| 9 | Tìm kiếm toàn văn (full-text) | 🔵 Sao chép | ✅ Có |
| 10 | Dashboard thống kê nội bộ + insights | 🔵 Sao chép | ✅ Có (admin) |
| 11 | Đánh giá 👍/👎 câu trả lời + Dark mode | 🔵 Sao chép | ✅ (từ sản phẩm chatbot) |

**Tổng kết:** lõi nghiệp vụ mới thực sự (RAG Q&A + Compare + Timeline) đặt trên giàn giáo sao chép hợp lý (duyệt tin, filter, dashboard). Sáng tạo nổi bật nhất — *So sánh cách các báo đưa tin* — vừa đúng nhu cầu thật vừa chưa có đối thủ ở thị trường tin tức tiếng Việt. Rào cản không nằm ở ý tưởng mà ở **độ chín kỹ thuật** (migration thiếu, full-text tiếng Việt yếu, thiếu cache/độ ổn định model `:free`).

### Rủi ro khả thi xuyên suốt (ảnh hưởng trực tiếp tới nghiệp vụ)

| Rủi ro | Nghiệp vụ bị ảnh hưởng | Mức độ |
|---|---|---|
| `contentTsv` không có migration — cột full-text tạo thủ công, không trong repo | Compare, Timeline, Search | 🔴 Nghiêm trọng: dựng từ repo là lỗi runtime |
| Full-text dùng config `'simple'` — không xử lý ngữ nghĩa tiếng Việt | Compare, Timeline, Search | 🟡 Chất lượng match thấp |
| Model `:free` hay 429 + Compare/Timeline **không cache** | Compare, Timeline | 🟡 Thiếu ổn định, chậm, tốn quota |
| Corpus nhỏ + ít nguồn | Compare (cần ≥2 nguồn), Insights, Trending | 🟡 Nhiều truy vấn trả rỗng |
| `publishedAt` null từ RSS | Timeline (sắp sai thứ tự) | 🟢 Nhẹ |
