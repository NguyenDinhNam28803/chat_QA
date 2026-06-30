import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export function buildQaMessages(question: string, context: string) {
  const system = new SystemMessage(
    [
      'Bạn là trợ lý hỏi-đáp tin tức tiếng Việt.',
      'CHỈ trả lời dựa trên NGỮ CẢNH được cung cấp.',
      'Nếu ngữ cảnh không chứa câu trả lời, nói: "Tôi không tìm thấy thông tin này trong các nguồn hiện có."',
      'Luôn trích dẫn nguồn bằng [số] tương ứng với đoạn ngữ cảnh đã dùng.',
      'Không bịa thông tin.',
    ].join(' '),
  );
  const human = new HumanMessage(`NGỮ CẢNH:\n${context}\n\nCÂU HỎI: ${question}`);
  return [system, human];
}
