'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { Skeleton } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Stats {
  totalArticles: number;
  totalChunks: number;
  totalConversations: number;
  totalMessages: number;
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

  const topicTotal = stats ? stats.byTopic.reduce((s, t) => s + t.count, 0) : 0;
  const maxTopic = stats ? Math.max(...stats.byTopic.map((t) => t.count), 1) : 1;
  const maxDay = ins ? Math.max(...ins.perDay.map((d) => d.c), 1) : 1;
  const maxSource = ins ? Math.max(...ins.sources.map((s) => s.c), 1) : 1;
  const today = ins && ins.perDay.length ? ins.perDay[ins.perDay.length - 1].c : 0;
  const yesterday = ins && ins.perDay.length > 1 ? ins.perDay[ins.perDay.length - 2].c : 0;
  const avgDay = ins && ins.perDay.length
    ? Math.round(ins.perDay.reduce((s, d) => s + d.c, 0) / ins.perDay.length)
    : 0;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Trang chủ</Link>
          <div className="flex-1" />
          <Nav current="/dashboard" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="label mb-1">Bảng điều khiển</p>
            <h1 className="font-display text-[2.4rem] font-extrabold leading-none tracking-tight">
              Tổng quan hệ thống
            </h1>
          </div>
          <p className="label hidden sm:block">
            Cập nhật {new Date().toLocaleString('vi-VN')}
          </p>
        </div>

        {!stats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-72 lg:col-span-2" />
              <Skeleton className="h-72" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Tổng bài" value={stats.totalArticles} />
              <Kpi
                label="Bài hôm nay"
                value={today}
                sub={yesterday ? `${today - yesterday >= 0 ? '+' : ''}${today - yesterday} vs hôm qua` : undefined}
              />
              <Kpi label="Đoạn vector" value={stats.totalChunks} />
              <Kpi label="Lĩnh vực" value={stats.byTopic.length} />
              <Kpi label="Hội thoại" value={stats.totalConversations} />
              <Kpi label="Tin nhắn" value={stats.totalMessages} />
            </div>

            {/* Ingest chart — full width */}
            <Panel
              title="Lượng bài nạp · 14 ngày"
              right={<span className="label">TB {avgDay}/ngày</span>}
            >
                {ins && ins.perDay.length > 0 ? (
                  <div className="flex h-52 items-stretch gap-2">
                    {ins.perDay.map((d) => (
                      <div key={d.d} className="group flex flex-1 flex-col">
                        <div className="text-center font-mono text-[0.65rem] text-muted">
                          {d.c}
                        </div>
                        <div className="relative flex-1">
                          <div
                            className="absolute bottom-0 left-0 w-full bg-accent transition-all group-hover:brightness-95"
                            style={{ height: `${Math.max((d.c / maxDay) * 100, 3)}%` }}
                            title={`${d.d}: ${d.c} bài`}
                          />
                        </div>
                        <div className="label mt-1.5 text-center text-[0.6rem]">{d.d}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Chưa có dữ liệu.</p>
                )}
            </Panel>

            {/* Topic + trending + sources */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Phân bố lĩnh vực" href="/articles" action="Thư viện">
                <div className="space-y-2">
                  {stats.byTopic.map((t) => (
                    <Link
                      key={t.topic}
                      href={`/articles?topic=${t.topic}`}
                      className="group block"
                    >
                      <div className="mb-0.5 flex items-baseline justify-between text-sm">
                        <span className="text-muted group-hover:text-fg">{t.label}</span>
                        <span className="font-mono text-xs tabular-nums text-muted">
                          {topicTotal ? Math.round((t.count / topicTotal) * 100) : 0}% · {t.count}
                        </span>
                      </div>
                      <div className="h-2 bg-black/5">
                        <div className="h-full bg-accent transition-all" style={{ width: `${(t.count / maxTopic) * 100}%` }} />
                      </div>
                    </Link>
                  ))}
                </div>
              </Panel>

              <Panel title="Từ khóa nổi · 3 ngày" href="/timeline" action="Dòng thời gian">
                <div className="flex flex-wrap gap-1.5">
                  {!ins || ins.trending.length === 0 ? (
                    <p className="text-sm text-muted">Chưa đủ dữ liệu.</p>
                  ) : (
                    ins.trending.map((t) => (
                      <Link
                        key={t.term}
                        href={`/timeline?q=${encodeURIComponent(t.term)}`}
                        className="rounded-md border border-black/15 px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-fg"
                        title={`${t.c} lần`}
                      >
                        {t.term}
                      </Link>
                    ))
                  )}
                </div>
              </Panel>

              <Panel title="Nguồn tin" href="/articles" action="Xem bài">
                <div className="space-y-2">
                  {ins?.sources.map((s) => (
                    <div key={s.source}>
                      <div className="mb-0.5 flex items-baseline justify-between text-sm">
                        <span className="truncate text-muted">{s.source}</span>
                        <span className="ml-2 font-mono text-xs tabular-nums text-muted">{s.c}</span>
                      </div>
                      <div className="h-2 bg-black/5">
                        <div className="h-full bg-accent" style={{ width: `${(s.c / maxSource) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* Latest — full width */}
            <Panel title="Tin mới nhất" href="/articles" action="Xem tất cả">
              <ul className="grid gap-x-8 sm:grid-cols-2">
                {stats.latest.map((a) => (
                  <li key={a.id} className="border-b border-black/10 py-2">
                    <Link href={`/articles/${a.id}`} className="text-sm font-medium leading-snug hover:text-accent">
                      {a.title}
                    </Link>
                    {a.publishedAt && (
                      <div className="label mt-0.5">{new Date(a.publishedAt).toLocaleString('vi-VN')}</div>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-surface p-4">
      <div className="font-display text-2xl font-black leading-none tabular-nums">
        {value.toLocaleString('vi-VN')}
      </div>
      <div className="label mt-1.5">{label}</div>
      {sub && <div className="mt-1 font-mono text-[0.65rem] text-muted">{sub}</div>}
    </div>
  );
}

function Panel({
  title,
  href,
  action,
  right,
  className = '',
  children,
}: {
  title: string;
  href?: string;
  action?: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-lg border border-black/10 bg-surface p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="label">{title}</h2>
        {right}
        {href && (
          <Link href={href} className="label text-muted transition hover:text-accent">
            {action ?? 'Xem chi tiết'} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
