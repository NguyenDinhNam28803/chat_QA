'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Skeleton } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Stats {
  totalArticles: number;
  totalChunks: number;
  byTopic: { topic: string; label: string; count: number }[];
  latest: { id: string; title: string; topic: string | null; publishedAt: string | null }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API}/articles/stats`);
        if (res.ok) setStats(await res.json());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const maxTopic = stats
    ? Math.max(...stats.byTopic.map((t) => t.count), 1)
    : 1;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/60">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3.5">
          <Link
            href="/"
            className="rounded-lg px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ← Chat
          </Link>
          <h1 className="flex-1 text-[15px] font-semibold tracking-tight">
            Bảng tin · Thống kê
          </h1>
          <Link
            href="/articles"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            📰 Thư viện
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        {!stats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Big numbers */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard label="Bài viết" value={stats.totalArticles} />
              <StatCard label="Đoạn (vector)" value={stats.totalChunks} />
              <StatCard label="Lĩnh vực" value={stats.byTopic.length} />
            </div>

            {/* Topic distribution */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Phân bố theo lĩnh vực
              </h2>
              <div className="space-y-2.5">
                {stats.byTopic.map((t) => (
                  <Link
                    key={t.topic}
                    href={`/articles?topic=${t.topic}`}
                    className="group flex items-center gap-3"
                  >
                    <span className="w-20 shrink-0 text-sm text-slate-600 group-hover:text-indigo-700 dark:text-slate-300">
                      {t.label}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                        style={{ width: `${(t.count / maxTopic) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm tabular-nums text-slate-500">
                      {t.count}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* Latest articles */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Tin mới nhất
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {stats.latest.map((a) => (
                  <li key={a.id} className="py-2.5">
                    <Link
                      href={`/articles/${a.id}`}
                      className="font-medium text-slate-700 hover:text-indigo-700 dark:text-slate-200 dark:hover:text-indigo-300"
                    >
                      {a.title}
                    </Link>
                    {a.publishedAt && (
                      <span className="ml-2 text-xs text-slate-400">
                        {new Date(a.publishedAt).toLocaleString('vi-VN')}
                      </span>
                    )}
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-3xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
        {value.toLocaleString('vi-VN')}
      </div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}
