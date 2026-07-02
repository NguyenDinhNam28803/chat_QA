/**
 * Prompts for the AI feature pillars. Each returns { system, user } for
 * LlmService.generate(). All are grounded — only use the provided context.
 */

export function summarizeArticlePrompt(
  title: string,
  content: string,
): { system: string; user: string } {
  return {
    system: [
      'Bạn là biên tập viên tóm tắt tin tức tiếng Việt.',
      'Tóm tắt bài báo thành 3-5 gạch đầu dòng ngắn gọn, trung thực, CHỈ dựa trên nội dung được cung cấp.',
      'Không thêm thông tin ngoài bài. Trả về markdown danh sách gạch đầu dòng.',
    ].join(' '),
    user: `TIÊU ĐỀ: ${title}\n\nNỘI DUNG:\n${content.slice(0, 6000)}`,
  };
}

export function dailyBriefPrompt(articlesBlock: string): {
  system: string;
  user: string;
} {
  return {
    system: [
      'Bạn là biên tập viên bản tin sáng tiếng Việt.',
      'Từ danh sách tin dưới đây, viết một BẢN TIN NHANH súc tích: nhóm theo lĩnh vực,',
      'mỗi lĩnh vực 2-4 gạch đầu dòng nêu tin nổi bật. CHỈ dùng thông tin đã cho, không bịa.',
      'Định dạng markdown: mỗi lĩnh vực là một tiêu đề **in đậm** rồi danh sách gạch đầu dòng.',
    ].join(' '),
    user: `CÁC TIN HÔM NAY:\n${articlesBlock}`,
  };
}

export function compareSourcesPrompt(
  topic: string,
  articlesBlock: string,
): { system: string; user: string } {
  return {
    system: [
      'Bạn là chuyên gia phân tích truyền thông tiếng Việt.',
      'So sánh cách CÁC BÁO KHÁC NHAU đưa tin về cùng chủ đề, CHỈ dựa trên các đoạn được cung cấp.',
      'Nêu: (1) điểm chung, (2) khác biệt về góc nhìn/nhấn mạnh/chi tiết giữa các nguồn.',
      'Trung lập, không thiên vị, không bịa. Trả về markdown ngắn gọn có mục.',
    ].join(' '),
    user: `CHỦ ĐỀ: ${topic}\n\nCÁC BÀI THEO NGUỒN:\n${articlesBlock}`,
  };
}

export function timelineNarrativePrompt(
  query: string,
  articlesBlock: string,
): { system: string; user: string } {
  return {
    system: [
      'Bạn là biên tập viên tin tức tiếng Việt.',
      'Từ danh sách bài xếp theo thời gian dưới đây, viết một đoạn NGẮN (2-4 câu) tóm tắt',
      'diễn biến của sự việc theo dòng thời gian. CHỈ dùng thông tin đã cho, không bịa.',
    ].join(' '),
    user: `CHỦ ĐỀ: ${query}\n\nDÒNG SỰ KIỆN (cũ → mới):\n${articlesBlock}`,
  };
}

export function eventAnalysisPrompt(
  title: string,
  articlesBlock: string,
): { system: string; user: string } {
  return {
    system: [
      'Bạn là biên tập viên phân tích tin tức tiếng Việt.',
      'Dưới đây là các bài từ NHIỀU BÁO về cùng một sự kiện. CHỈ dựa trên nội dung được cung cấp, viết markdown gồm 3 mục:',
      '**Tóm tắt** (2-3 câu về sự kiện).',
      '**Điểm đồng thuận** (những điều các báo cùng nêu).',
      '**Khác biệt & lưu ý** (điểm các báo nêu khác nhau, hoặc chi tiết chỉ 1 báo đề cập).',
      'Trung lập, không thiên vị, không bịa thông tin ngoài các bài.',
    ].join(' '),
    user: `SỰ KIỆN: ${title}\n\nCÁC BÀI THEO NGUỒN:\n${articlesBlock}`,
  };
}
