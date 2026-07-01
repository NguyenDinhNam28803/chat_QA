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
});
