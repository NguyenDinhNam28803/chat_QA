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

  it('returns empty for no rows', () => {
    expect(buildContext([])).toEqual({ context: '', citations: [] });
  });
});
