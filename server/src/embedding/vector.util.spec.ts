import {
  cosineSimilarity,
  centroid,
  titleBodyScore,
  parseVectorLiteral,
} from './vector.util';

describe('vector.util', () => {
  describe('parseVectorLiteral', () => {
    it('parses a pgvector literal', () => {
      expect(parseVectorLiteral('[0.1,-0.2,0.3]')).toEqual([0.1, -0.2, 0.3]);
    });
    it('handles surrounding whitespace', () => {
      expect(parseVectorLiteral('  [1,2]  ')).toEqual([1, 2]);
    });
    it('returns [] for an empty vector', () => {
      expect(parseVectorLiteral('[]')).toEqual([]);
    });
  });

  describe('cosineSimilarity', () => {
    it('is 1 for identical direction', () => {
      expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    });
    it('is 0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });
    it('is 0 when either vector is all zeros (no direction)', () => {
      expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    });
    it('throws on length mismatch', () => {
      expect(() => cosineSimilarity([1, 2], [1])).toThrow(/length mismatch/);
    });
  });

  describe('centroid', () => {
    it('averages element-wise', () => {
      expect(centroid([[0, 0], [2, 4]])).toEqual([1, 2]);
    });
    it('returns the vector itself for a single input', () => {
      expect(centroid([[3, 7]])).toEqual([3, 7]);
    });
    it('throws on empty input', () => {
      expect(() => centroid([])).toThrow(/no vectors/);
    });
    it('throws on ragged vectors', () => {
      expect(() => centroid([[1, 2], [1]])).toThrow(/length mismatch/);
    });
  });

  describe('titleBodyScore', () => {
    it('is high when title aligns with body centroid', () => {
      const score = titleBodyScore([1, 0], [[1, 0], [1, 0.1]]);
      expect(score).toBeGreaterThan(0.9);
    });
    it('is low when title points away from the body', () => {
      const score = titleBodyScore([0, 1], [[1, 0], [1, 0]]);
      expect(score).toBeLessThan(0.1);
    });
    it('clamps into [0, 1]', () => {
      const score = titleBodyScore([-1, 0], [[1, 0]]); // cosine -1 -> clamp 0
      expect(score).toBe(0);
    });
  });
});
