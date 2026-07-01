export const TOPICS = [
  'the-thao',
  'suc-khoe',
  'giai-tri',
  'giao-duc',
  'cong-nghe',
  'kinh-te',
  'phap-luat',
  'the-gioi',
  'khac',
] as const;

export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  'the-thao': 'Thể thao',
  'suc-khoe': 'Sức khỏe',
  'giai-tri': 'Giải trí',
  'giao-duc': 'Giáo dục',
  'cong-nghe': 'Công nghệ',
  'kinh-te': 'Kinh tế',
  'phap-luat': 'Pháp luật',
  'the-gioi': 'Thế giới',
  khac: 'Khác',
};

// Ordered by priority — first matching rule wins. Distinctive topics first so
// generic finance/world terms don't swallow more specific ones.
const RULES: [Exclude<Topic, 'khac'>, RegExp][] = [
  [
    'the-thao',
    /bóng đá|thể thao|world cup|hlv |cầu thủ|vô địch|ghi bàn|luân lưu|sea games|ngoại hạng|v-league|olympic|tuyển \S/,
  ],
  [
    'suc-khoe',
    /sức khỏe|ung thư|bác sĩ|bệnh viện|dịch bệnh|vaccine|virus|triệu chứng|điều trị|\bbệnh\b|sốt xuất huyết/,
  ],
  [
    'giai-tri',
    /phim|ca sĩ|nghệ sĩ|hoa hậu|diễn viên|\bmv\b|showbiz|điện ảnh|âm nhạc|ca khúc|\bidol\b|sân khấu/,
  ],
  [
    'giao-duc',
    /học sinh|sinh viên|tuyển sinh|điểm chuẩn|đại học|giáo dục|kỳ thi|thí sinh|giáo viên/,
  ],
  [
    'cong-nghe',
    /công nghệ|iphone|\bai\b|điện thoại|apple|google|samsung|phần mềm|ứng dụng|laptop|\bchip\b|ô tô|ôtô|xe máy|xe điện/,
  ],
  [
    'kinh-te',
    /kinh tế|chứng khoán|lợi nhuận|ngân hàng|xuất khẩu|bất động sản|cổ phiếu|tỷ đồng|doanh nghiệp|đầu tư|lạm phát|\bgdp\b|\busd\b|giá vàng/,
  ],
  [
    'phap-luat',
    /công an|cảnh sát|khởi tố|bắt giữ|tai nạn|cháy|lừa đảo|ma túy|xét xử|tòa án|phạt tù|vi phạm|truy tố/,
  ],
  [
    'the-gioi',
    /tổng thống|\bnga\b|ukraine|israel|trung quốc|\bmỹ\b|quốc tế|chiến sự|liên hợp quốc|\bnato\b|iran/,
  ],
];

/** Keyword-based topic tag for a news article. Cheap, deterministic, offline. */
export function classifyTopic(title: string, content: string): Topic {
  const text = `${title} ${content}`.toLowerCase();
  for (const [topic, re] of RULES) {
    if (re.test(text)) return topic;
  }
  return 'khac';
}
