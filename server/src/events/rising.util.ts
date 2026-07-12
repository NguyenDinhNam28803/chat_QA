/**
 * F5 "rising / heating up" metrics — pure, so it can be unit-tested apart from
 * the DB. We measure the *acceleration* of coverage: how much activity landed in
 * the most recent window vs the window before it. Positive velocity = more
 * newspapers/articles are piling onto the story now than just before → it is
 * heating up (a forward-looking signal, unlike "developing" which only asks if a
 * story is still being updated).
 *
 * We work off a reference time (the freshest activity in the batch) rather than
 * wall-clock now(), so the signal stays meaningful when the corpus is a little
 * stale between ingestion runs.
 */
export interface RisingMetrics {
  recent: number; // items in [ref - window, ref]
  prior: number; // items in [ref - 2*window, ref - window)
  velocity: number; // recent - prior (>0 = accelerating)
}

/** Count items in the recent vs prior window and return the velocity. */
export function risingMetrics(
  timestamps: number[],
  ref: number,
  windowMs: number,
): RisingMetrics {
  let recent = 0;
  let prior = 0;
  for (const t of timestamps) {
    const age = ref - t;
    if (age < 0) continue; // in the future relative to ref — ignore
    if (age < windowMs) recent++;
    else if (age < 2 * windowMs) prior++;
  }
  return { recent, prior, velocity: recent - prior };
}
