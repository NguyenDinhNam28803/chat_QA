import { classifyTopic, TOPICS } from './topic.classifier';

describe('classifyTopic', () => {
  it('tags sports', () => {
    expect(classifyTopic('HLV Nhật Bản tri ân khán giả ở World Cup', '')).toBe(
      'the-thao',
    );
  });

  it('tags economy', () => {
    expect(
      classifyTopic(
        'Vietnam Airlines đặt mục tiêu có lãi',
        'lợi nhuận 510 tỷ đồng',
      ),
    ).toBe('kinh-te');
  });

  it('tags health', () => {
    expect(classifyTopic('Phát hiện ung thư sau 4 tháng lưỡi loét', '')).toBe(
      'suc-khoe',
    );
  });

  it('falls back to "khac" when nothing matches', () => {
    expect(
      classifyTopic('Một tiêu đề trung tính', 'nội dung không rõ ràng'),
    ).toBe('khac');
  });

  it('always returns a known topic', () => {
    const t = classifyTopic('bất kỳ', 'văn bản');
    expect(TOPICS).toContain(t);
  });
});
