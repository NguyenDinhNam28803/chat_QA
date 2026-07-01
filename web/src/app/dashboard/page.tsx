'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { Skeleton } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Stats {
  totalArticles: number;
  totalChunks: number;
  byTopic: { topic: string; label: string; count: number }[];
  latest: { id: string; title: string; topic: string | null; publishedAt: string | null }[];
}
interface Insights {
  perDay: { d: string; c: number }[];
  sources: { source: string; c: number }[];
  trending: { term: string; c: number }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [ins, setIns] = useState<Insights | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [s, i] = await Promise.all([
          fetch(`${API}/articles/stats`),
          fetch(`${API}/insights`),
        ]);
        if (s.ok) setStats(await s.json());
        if (i.ok) setIns(await i.json());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const maxTopic = stats ? Math.max(...stats.byTopic.map((t) => t.count), 1) : 1;
  const maxDay = ins ? Math.max(...ins.perDay.map((d) => d.c), 1) : 1;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Chat</Link>
          <div className="flex-1" />
          <Nav current="/dashboard" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <p className="label mb-1">Bảng tin</p>
        <h1 className="mb-6 font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
          Thống kê & Insight
        </h1>

        {!stats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard label="Bài viết" value={stats.totalArticles} />
              <StatCard label="Đoạn (vector)" value={stats.totalChunks} />
              <StatCard label="Lĩnh vực" value={stats.byTopic.length} />
            </div>

            {/* Insight: ingest volume (accent bars) */}
            {ins && ins.perDay.length > 0 && (
              <section className="rounded-lg border border-black/10 bg-surface p-6">
                <h2 className="label mb-4">Bài nạp · 14 ngày</h2>
                <div className="flex h-32 items-end gap-1">
                  {ins.perDay.map((d) => (
                    <div key={d.d} className="flex flex-1 flex-col items-center gap-1" title={`${d.d}: ${d.c}`}>
                      <div className="w-full bg-accent" style={{ height: `${(d.c / maxDay) * 100}%` }} />
                      <span className="label text-[0.6rem]">{d.d}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Insight: trending keywords + top sources */}
            {ins && (
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-lg border border-black/10 bg-surface p-6">
                  <h2 className="label mb-3">Từ khóa nổi · 3 ngày</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {ins.trending.length === 0 && <p className="text-sm text-muted">Chưa đủ dữ liệu.</p>}
                    {ins.trending.map((t) => (
                      <Link
                        key={t.term}
                        href={`/timeline?q=${encodeURIComponent(t.term)}`}
                        className="rounded-md border border-black/15 px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-fg"
                        title={`${t.c} lần`}
                      >
                        {t.term}
                      </Link>
                    ))}
                  </div>
                </section>
                <section className="rounded-lg border border-black/10 bg-surface p-6">
                  <h2 className="label mb-3">Top nguồn</h2>
                  <ul className="space-y-1.5">
                    {ins.sources.map((s) => (
                      <li key={s.source} className="flex items-center justify-between text-sm">
                        <span className="text-muted">{s.source}</span>
                        <span className="font-mono tabular-nums">{s.c}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}

            {/* Topic distribution */}
            <section className="rounded-lg border border-black/10 bg-surface p-6">
              <h2 className="label mb-4">Phân bố theo lĩnh vực</h2>
              <div className="space-y-2.5">
                {stats.byTopic.map((t) => (
                  <Link key={t.topic} href={`/articles?topic=${t.topic}`} className="group flex items-center gap-3">
                    <span className="w-20 shrink-0 text-sm text-muted group-hover:text-fg">{t.label}</span>
                    <div className="h-5 flex-1 bg-black/5">
                      <div className="h-full bg-accent transition-all" style={{ width: `${(t.count / maxTopic) * 100}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-muted">{t.count}</span>
                  </Link>
                ))}
              </div>
            </section>

            {/* Latest */}
            <section className="rounded-lg border border-black/10 bg-surface p-6">
              <h2 className="label mb-3">Tin mới nhất</h2>
              <ul className="divide-y divide-black/10">
                {stats.latest.map((a) => (
                  <li key={a.id} className="py-2.5">
                    <Link href={`/articles/${a.id}`} className="font-medium hover:text-accent">{a.title}</Link>
                    {a.publishedAt && <span className="label ml-2">{new Date(a.publishedAt).toLocaleString('vi-VN')}</span>}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-black/10 bg-surface p-5">
      <div className="font-display text-[2.4rem] font-black leading-none tracking-tight">
        {value.toLocaleString('vi-VN')}
      </div>
      <div className="label mt-2">{label}</div>
    </div>
  );
}
