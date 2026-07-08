'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { Skeleton } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;
const pub = (s: string) => s.split(/\s*[-–|]\s*/)[0].trim();

interface Row {
  source: string;
  articleCount: number;
  firstCount: number;
  multiCount: number;
  exclusiveCount: number;
  firstRate: number;
}

export default function SourcesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API}/sources`);
        setRows(res.ok ? await res.json() : []);
      } catch {
        setRows([]);
      }
    })();
  }, []);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Trang chủ</Link>
          <div className="flex-1" />
          <Nav current="/sources" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        <p className="label mb-1 text-accent">⌗ Hồ sơ nguồn tin</p>
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
          Báo nào, mạnh gì?
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Phân tích dọc theo thời gian: <span className="text-fg">tốc độ</span> (bao nhiêu % sự
          kiện đa nguồn báo này <span className="text-fg">đưa tin đầu tiên</span>),{' '}
          <span className="text-fg">độ phủ</span> và số <span className="text-fg">tin độc quyền</span>.
        </p>

        {!rows ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((s) => (
              <Link
                key={s.source}
                href={`/sources/${encodeURIComponent(s.source)}`}
                className="group flex flex-col rounded-lg border border-white/10 bg-surface p-5 transition hover:border-accent"
              >
                <h2 className="font-display text-lg font-bold tracking-tight transition group-hover:text-accent">
                  {pub(s.source)}
                </h2>
                <p className="label mt-0.5 truncate">{s.source}</p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div>
                    <div className="font-display text-xl font-extrabold tabular-nums leading-none text-accent">
                      {s.firstRate}%
                    </div>
                    <div className="label mt-1">đưa đầu</div>
                  </div>
                  <div>
                    <div className="font-display text-xl font-extrabold tabular-nums leading-none">
                      {s.exclusiveCount}
                    </div>
                    <div className="label mt-1">độc quyền</div>
                  </div>
                  <div>
                    <div className="font-display text-xl font-extrabold tabular-nums leading-none">
                      {s.articleCount.toLocaleString('vi-VN')}
                    </div>
                    <div className="label mt-1">bài</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
