'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../components/Nav';
import { Skeleton } from '../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

const TOPIC_LABELS: Record<string, string> = {
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

interface EventItem {
  id: string;
  title: string;
  topic: string | null;
  articleCount: number;
  sourceCount: number;
  lastSeen: string | null;
  sources: string[];
  times: string[];
}
interface ArticleRow {
  id: string;
  title: string;
  source: string;
  topic: string | null;
  publishedAt: string | null;
  snippet: string;
}

// Relative time: "vừa xong", "12 phút trước", "3 giờ trước", "2 ngày trước"
const rel = (d: string | null) => {
  if (!d) return '';
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'vừa xong';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day} ngày trước`;
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};
const label = (t: string | null) => (t ? (TOPIC_LABELS[t] ?? t) : '');
const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';

interface PeriodActive {
  label: string;
  startDate: string;
  articleCount: number;
  eventCount: number;
}

// Count-up animation for the stat band
function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value <= 0) return;
    const dur = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n.toLocaleString('vi-VN')}</>;
}

// Publication name only, dropping the section, e.g. "VietNamNet - Thời sự" → "VietNamNet"
const pubName = (s: string) => s.split(/\s*[-–|]\s*/)[0].trim();
// De-duplicate sources down to distinct publications, keeping order.
const pubs = (sources: string[]) => Array.from(new Set(sources.map(pubName)));
// Short initials, e.g. "Tuổi Trẻ" → "TT", "VnExpress" → "VN"
const initials = (s: string) => {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
};

// Stacked source badges (who is covering the event)
function SourceStack({ sources }: { sources: string[] }) {
  const names = pubs(sources);
  if (!names.length) return null;
  const show = names.slice(0, 4);
  const extra = names.length - show.length;
  return (
    <div className="flex -space-x-1.5" title={names.join(' · ')}>
      {show.map((s) => (
        <span
          key={s}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-bg font-mono text-[0.58rem] font-bold text-fg"
        >
          {initials(s)}
        </span>
      ))}
      {extra > 0 && (
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-fg font-mono text-[0.58rem] font-bold text-bg">
          +{extra}
        </span>
      )}
    </div>
  );
}

// Article-rhythm sparkline: bars = article volume across the event's lifespan
function Sparkline({ times, className = '' }: { times: string[]; className?: string }) {
  const ts = times
    .map((t) => new Date(t).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (ts.length === 0) return null;
  const bins = 14;
  const min = ts[0];
  const span = Math.max(1, ts[ts.length - 1] - min);
  const counts = new Array<number>(bins).fill(0);
  for (const t of ts) {
    counts[Math.min(bins - 1, Math.floor(((t - min) / span) * bins))]++;
  }
  const maxC = Math.max(...counts, 1);
  const bw = 4;
  return (
    <svg
      viewBox={`0 0 ${bins * bw} 20`}
      preserveAspectRatio="none"
      className={`text-accent ${className}`}
      aria-hidden
    >
      {counts.map((c, i) => {
        const h = c ? Math.max((c / maxC) * 20, 2) : 0;
        return (
          <rect
            key={i}
            x={i * bw}
            y={20 - h}
            width={bw - 1.2}
            height={h}
            className="fill-current"
            opacity={c ? 0.4 + 0.6 * (c / maxC) : 0}
          />
        );
      })}
    </svg>
  );
}

export default function Home() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [latest, setLatest] = useState<ArticleRow[] | null>(null);
  const [stats, setStats] = useState<{ totalArticles: number; topics: number; sources: number } | null>(null);
  const [trending, setTrending] = useState<{ term: string; c: number }[]>([]);
  const [period, setPeriod] = useState<PeriodActive | null>(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        // Active quarter first — the homepage only shows this quarter's news.
        const pRes = await fetch(`${API}/periods/active`);
        const p: PeriodActive | null = pRes.ok ? await pRes.json() : null;
        setPeriod(p);
        const fromQ =
          p?.startDate ? `?from=${encodeURIComponent(p.startDate)}` : '';
        const [e, a, s, i] = await Promise.all([
          fetch(`${API}/events${fromQ}`),
          fetch(`${API}/articles`),
          fetch(`${API}/articles/stats`),
          fetch(`${API}/insights`),
        ]);
        if (e.ok) setEvents(await e.json());
        if (a.ok) {
          const r = (await a.json()) as { items: ArticleRow[] };
          setLatest(r.items.slice(0, 12));
        }
        if (s.ok && i.ok) {
          const st = (await s.json()) as { totalArticles: number; byTopic: unknown[] };
          const ins = (await i.json()) as {
            sources: unknown[];
            trending: { term: string; c: number }[];
          };
          setStats({
            totalArticles: st.totalArticles,
            topics: st.byTopic.length,
            sources: ins.sources.length,
          });
          setTrending(ins.trending?.slice(0, 12) ?? []);
        }
      } catch {
        setEvents([]);
        setLatest([]);
      }
    })();
  }, []);

  const hot = events ? events.slice(0, 5) : [];
  const rest = events ? events.slice(5, 11) : [];

  // Auto-rotate the hot-events carousel (loops), pause on hover.
  useEffect(() => {
    if (hot.length <= 1 || paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % hot.length), 5000);
    return () => clearInterval(t);
  }, [hot.length, paused]);

  const cur = hot.length ? hot[idx % hot.length] : null;
  const prev = () => setIdx((i) => (i - 1 + hot.length) % hot.length);
  const next = () => setIdx((i) => (i + 1) % hot.length);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-black text-on-accent">
              Đ
            </div>
            <span className="font-display text-sm font-extrabold tracking-tight">ĐIỂM TIN AI</span>
          </div>
          <div className="flex-1" />
          <Nav current="/" />
        </div>
      </header>

      {/* ===== Breaking-news ticker ===== */}
      {latest && latest.length > 0 && (
        <div className="border-b border-white/10 bg-surface">
          <div className="mx-auto flex w-full max-w-none items-center gap-4 px-4">
            <span className="label flex shrink-0 items-center gap-1.5 py-2.5 text-accent">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              Mới nhất
            </span>
            <div className="marquee-wrap min-w-0 flex-1 overflow-hidden">
              <div className="marquee flex w-max gap-10 whitespace-nowrap py-2.5">
                {[...latest, ...latest].map((a, i) => (
                  <Link
                    key={`${a.id}-${i}`}
                    href={`/articles/${a.id}`}
                    className="text-sm text-muted transition hover:text-accent"
                  >
                    <span className="mr-2 text-accent">•</span>
                    {a.title}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-none px-4 py-8">
        {/* ===== Period banner — "updated from" date for verification ===== */}
        {period && (
          <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-white/10 bg-surface px-4 py-3">
            <span className="label border border-accent/50 px-2 py-0.5 text-accent">
              {period.label}
            </span>
            <span className="text-sm text-muted">
              Tin tức được cập nhật từ ngày{' '}
              <b className="font-semibold text-fg">{fmtDate(period.startDate)}</b>
            </span>
            <Link
              href="/review"
              className="label ml-auto text-muted transition hover:text-accent"
            >
              Nhìn lại các quý →
            </Link>
          </div>
        )}

        {/* ===== Stat band (count-up) ===== */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-4">
            {[
              { v: stats.totalArticles, l: 'Bài đã nạp' },
              { v: events ? events.length : 0, l: 'Sự kiện nóng' },
              { v: stats.topics, l: 'Lĩnh vực' },
              { v: stats.sources, l: 'Nguồn tin' },
            ].map((k) => (
              <div key={k.l} className="bg-surface px-4 py-3">
                <div className="font-display text-2xl font-black tabular-nums leading-none">
                  <CountUp value={k.v} />
                </div>
                <div className="label mt-1.5">{k.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* ===== Trending keyword chips ===== */}
        {trending.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-1.5">
            <span className="label mr-1 text-accent">🔥 Từ khóa nổi</span>
            {trending.map((t) => (
              <Link
                key={t.term}
                href={`/timeline?q=${encodeURIComponent(t.term)}`}
                title={`${t.c} lần · xem dòng thời gian`}
                className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
              >
                {t.term}
              </Link>
            ))}
          </div>
        )}

        <p className="label mb-3">🔴 Điểm nóng · sự kiện nhiều báo cùng đưa</p>

        {/* ===== HERO — hot-events carousel (auto-rotate, loops) ===== */}
        {!events ? (
          <Skeleton className="h-56 w-full" />
        ) : !cur ? (
          <div className="rounded-lg border border-white/10 bg-surface p-6 text-sm text-muted">
            Chưa có sự kiện đa nguồn. (Chạy gom cụm: POST /events/cluster)
          </div>
        ) : (
          <div
            className="relative rounded-lg border-2 border-fg bg-surface"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <Link
              href={`/events/${cur.id}`}
              className="group block px-6 py-8 md:px-14 md:py-12"
            >
              <div key={cur.id} className="slide-fade">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 font-mono text-[0.7rem] font-bold uppercase tracking-wide text-on-accent">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-on-accent" />
                    Đang nóng
                  </span>
                  <span className="label border border-white/20 px-2 py-0.5 text-fg">
                    {cur.sourceCount} báo · {cur.articleCount} bài
                  </span>
                  {cur.topic && (
                    <span className="label border border-white/15 px-2 py-0.5 text-fg">
                      {label(cur.topic)}
                    </span>
                  )}
                  <span className="label ml-auto">{rel(cur.lastSeen)}</span>
                </div>
                <h1 className="max-w-4xl font-display text-[2.2rem] font-extrabold leading-[1.05] tracking-tight transition group-hover:text-accent md:text-[3.2rem]">
                  {cur.title}
                </h1>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <SourceStack sources={cur.sources} />
                  <span className="label text-muted">
                    {pubs(cur.sources).slice(0, 3).join(' · ')}
                    {pubs(cur.sources).length > 3 ? ` +${pubs(cur.sources).length - 3}` : ''}
                  </span>
                  {cur.times.length > 1 && (
                    <Sparkline times={cur.times} className="ml-auto h-6 w-24 opacity-80" />
                  )}
                </div>
                <p className="mt-4 font-mono text-sm text-muted">
                  Xem phân tích đồng thuận &amp; đối chiếu giữa các nguồn →
                </p>
              </div>
            </Link>

            {/* Controls */}
            {hot.length > 1 && (
              <>
                {/* Progress toward next slide */}
                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/5">
                  <div
                    key={idx}
                    className="progress-bar h-full bg-accent"
                    style={{ animationPlayState: paused ? 'paused' : 'running' }}
                  />
                </div>
                <button
                  type="button"
                  aria-label="Tin nóng trước"
                  onClick={prev}
                  className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface/90 text-lg text-muted transition hover:border-accent hover:text-accent"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Tin nóng kế"
                  onClick={next}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface/90 text-lg text-muted transition hover:border-accent hover:text-accent"
                >
                  ›
                </button>
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {hot.map((h, i) => (
                    <button
                      key={h.id}
                      type="button"
                      aria-label={`Tin nóng ${i + 1}`}
                      onClick={() => setIdx(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === idx % hot.length
                          ? 'w-6 bg-accent'
                          : 'w-1.5 bg-white/20 hover:bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== Lineup — event grid ===== */}
        {rest.length > 0 && (
          <>
            <h2 className="mb-3 mt-10 font-display text-xl font-bold tracking-tight">
              Các sự kiện khác
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((e, i) => (
                <Link
                  key={e.id}
                  href={`/events/${e.id}`}
                  style={{ animationDelay: `${i * 70}ms` }}
                  className="slide-fade group flex flex-col rounded-lg border border-white/10 bg-surface p-4 transition hover:border-accent"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-accent/50 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold uppercase tracking-wide text-accent">
                      {e.sourceCount} báo
                    </span>
                    {e.topic && (
                      <span className="label border border-white/15 px-1.5 py-0.5 text-fg">
                        {label(e.topic)}
                      </span>
                    )}
                    <span className="label ml-auto">{rel(e.lastSeen)}</span>
                  </div>
                  <h3 className="flex-1 font-display font-bold leading-snug transition group-hover:text-accent">
                    {e.title}
                  </h3>
                  <div className="mt-3 flex items-center gap-2">
                    <SourceStack sources={e.sources} />
                    {e.times.length > 1 && (
                      <Sparkline times={e.times} className="ml-auto h-5 w-16 opacity-70" />
                    )}
                  </div>
                  <p className="label mt-2">{e.articleCount} bài · đối chiếu →</p>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* ===== Agenda — latest news ticker ===== */}
        <div className="mb-3 mt-12 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-tight">Dòng tin mới</h2>
          <Link href="/articles" className="label text-muted transition hover:text-accent">
            Xem thư viện →
          </Link>
        </div>
        {!latest ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : (
          <ul className="divide-y divide-white/10 border-y border-white/10">
            {latest.map((a, i) => (
              <li key={a.id} className="slide-fade" style={{ animationDelay: `${i * 45}ms` }}>
                <Link
                  href={`/articles/${a.id}`}
                  className="group flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <span className="label w-28 shrink-0 tabular-nums">{rel(a.publishedAt)}</span>
                  <span className="flex-1 font-medium leading-snug transition group-hover:text-accent">
                    {a.title}
                  </span>
                  <span className="label shrink-0">
                    {a.topic ? label(a.topic) + ' · ' : ''}{a.source}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
