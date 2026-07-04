import { buildContext } from './context.builder';

describe('buildContext', () => {
  it('numbers chunks [1..n] and dedupes citations by articleId', () => {
    const { context, citations } = buildContext([
      {
        content: 'A1',
        articleId: 'a',
        url: 'u-a',
        title: 'TA',
        source: 'S',
        distance: 0.1,
      },
      {
        content: 'A2',
        articleId: 'a',
        url: 'u-a',
        title: 'TA',
        source: 'S',
        distance: 0.2,
      },
      {
        content: 'B1',
        articleId: 'b',
        url: 'u-b',
        title: 'TB',
        source: 'S',
        distance: 0.3,
      },
    ]);
    expect(context).toContain('[1] A1');
    expect(context).toContain('[2] A2');
    expect(context).toContain('[3] B1');
    expect(citations).toHaveLength(2); // a, b
    expect(citations[0]).toMatchObject({ index: 1, articleId: 'a' });
  });

  it('scores confidence from distance and source count', () => {
    const { confidence } = buildContext([
      {
        content: 'A1',
        articleId: 'a',
        url: 'u-a',
        title: 'TA',
        source: 'S',
        distance: 0.4,
      },
      {
        content: 'B1',
        articleId: 'b',
        url: 'u-b',
        title: 'TB',
        source: 'S',
        distance: 0.5,
      },
    ]);
    // 2 distinct sources + strong match (0.4) → high confidence.
    expect(confidence).toMatchObject({ level: 'high', sources: 2 });
    expect(confidence.minDistance).toBeCloseTo(0.4);
  });

  it('returns empty (low-confidence) for no rows', () => {
    expect(buildContext([])).toEqual({
      context: '',
      citations: [],
      confidence: { level: 'low', sources: 0, minDistance: 1 },
    });
  });
});
