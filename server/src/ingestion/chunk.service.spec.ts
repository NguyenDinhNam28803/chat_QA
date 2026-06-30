import { ChunkService } from './chunk.service';

describe('ChunkService', () => {
  const svc = new ChunkService();

  it('one chunk for short text', () => {
    const out = svc.chunk('Một câu ngắn về tin tức.');
    expect(out).toHaveLength(1);
    expect(out[0].ord).toBe(0);
    expect(out[0].tokenCount).toBeGreaterThan(0);
  });

  it('splits long text with increasing ord, <=400 tokens', () => {
    const text = Array.from({ length: 2000 }, (_, i) => `từ${i}`).join(' ');
    const out = svc.chunk(text);
    expect(out.length).toBeGreaterThan(1);
    out.forEach((c, i) => expect(c.ord).toBe(i));
    expect(out.every((c) => c.tokenCount <= 400)).toBe(true);
  });

  it('empty array for blank text', () => expect(svc.chunk('   ')).toEqual([]));
});
