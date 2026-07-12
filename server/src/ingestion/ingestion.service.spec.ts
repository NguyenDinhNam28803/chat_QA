// cuid2 ships as ESM which ts-jest doesn't transform from node_modules; mock it
// (dedup tests skip before createId() is ever used).
jest.mock('@paralleldrive/cuid2', () => ({ createId: () => 'test-cuid' }));
// content-extractor pulls jsdom (ESM chain) at import time; stub it out — we
// inject our own mock extractor anyway.
jest.mock('./content-extractor.service', () => ({
  ContentExtractorService: class {},
}));

import { IngestionService } from './ingestion.service';
import type { RawFeedItem } from './rss.service';

const item: RawFeedItem = {
  url: 'https://example.com/a',
  title: 'Tiêu đề',
  source: 'Test',
  publishedAt: null,
  summaryHtml: '',
};

function makeDeps() {
  return {
    prisma: { article: { findUnique: jest.fn() } },
    embedding: { embedBatch: jest.fn() },
    chunker: { chunk: jest.fn() },
    extractor: { extract: jest.fn() },
    rss: {},
  };
}

describe('IngestionService.ingestArticle — dedup', () => {
  it('skips (no extract/embed) when the URL already exists', async () => {
    const d = makeDeps();
    d.prisma.article.findUnique.mockResolvedValueOnce({ id: 'existing' });
    const svc = new IngestionService(
      d.prisma as never,
      d.embedding as never,
      d.chunker as never,
      d.extractor as never,
      d.rss as never,
    );

    const result = await svc.ingestArticle(item);

    expect(result).toBe('skipped');
    expect(d.extractor.extract).not.toHaveBeenCalled();
    expect(d.embedding.embedBatch).not.toHaveBeenCalled();
  });

  it('skips (no embed) when contentHash already exists', async () => {
    const d = makeDeps();
    d.prisma.article.findUnique
      .mockResolvedValueOnce(null) // url miss
      .mockResolvedValueOnce({ id: 'dup-by-hash' }); // hash hit
    d.extractor.extract.mockResolvedValue('nội dung đủ dài '.repeat(30));
    const svc = new IngestionService(
      d.prisma as never,
      d.embedding as never,
      d.chunker as never,
      d.extractor as never,
      d.rss as never,
    );

    const result = await svc.ingestArticle(item);

    expect(result).toBe('skipped');
    expect(d.embedding.embedBatch).not.toHaveBeenCalled();
  });

  it('embeds the title first and stores a titleBodyScore on insert (F2)', async () => {
    const d = makeDeps() as ReturnType<typeof makeDeps> & {
      prisma: {
        article: { findUnique: jest.Mock };
        $transaction: jest.Mock;
      };
    };
    d.prisma.article.findUnique
      .mockResolvedValueOnce(null) // url miss
      .mockResolvedValueOnce(null); // hash miss
    d.extractor.extract.mockResolvedValue('nội dung');
    d.chunker.chunk.mockReturnValue([
      { ord: 0, content: 'đoạn một', tokenCount: 3 },
      { ord: 1, content: 'đoạn hai', tokenCount: 3 },
    ]);
    // title vector aligns perfectly with the body centroid -> score ~1
    d.embedding.embedBatch.mockResolvedValue([
      [1, 0], // title
      [1, 0], // chunk 0
      [1, 0], // chunk 1
    ]);
    const create = jest.fn().mockResolvedValue({ id: 'new-id' });
    d.prisma.$transaction = jest.fn(
      async (cb: (tx: unknown) => Promise<void>) =>
        cb({ article: { create }, $executeRaw: jest.fn() }),
    );
    const svc = new IngestionService(
      d.prisma as never,
      d.embedding as never,
      d.chunker as never,
      d.extractor as never,
      d.rss as never,
    );

    const result = await svc.ingestArticle(item);

    expect(result).toBe('inserted');
    // title is the FIRST input to the single embed call
    expect(d.embedding.embedBatch).toHaveBeenCalledWith([
      'Tiêu đề',
      'đoạn một',
      'đoạn hai',
    ]);
    const data = create.mock.calls[0][0].data;
    expect(data.titleBodyScore).toBeCloseTo(1);
  });
});
