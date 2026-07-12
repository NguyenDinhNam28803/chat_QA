import { risingMetrics } from './rising.util';

describe('risingMetrics', () => {
  const H = 3_600_000;
  const ref = 100 * H; // arbitrary reference time
  const w = 12 * H; // 12-hour window

  it('counts recent vs prior windows', () => {
    const times = [
      ref - 1 * H, // recent
      ref - 5 * H, // recent
      ref - 13 * H, // prior
      ref - 30 * H, // outside both windows
    ];
    expect(risingMetrics(times, ref, w)).toEqual({
      recent: 2,
      prior: 1,
      velocity: 1,
    });
  });

  it('is negative velocity when a story is cooling down', () => {
    const times = [ref - 13 * H, ref - 14 * H, ref - 20 * H]; // all prior
    const m = risingMetrics(times, ref, w);
    expect(m.recent).toBe(0);
    expect(m.velocity).toBeLessThan(0);
  });

  it('ignores timestamps after the reference time', () => {
    const times = [ref + 5 * H, ref - 1 * H];
    expect(risingMetrics(times, ref, w).recent).toBe(1);
  });

  it('boundary: exactly at window edge counts as prior, not recent', () => {
    // age === windowMs falls into the prior bucket (recent is [0, window))
    expect(risingMetrics([ref - w], ref, w)).toEqual({
      recent: 0,
      prior: 1,
      velocity: -1,
    });
  });
});
