'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { Skeleton } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Entity {
  name: string;
  count: number;
}

export default function EntitiesPage() {
  const [rows, setRows] = useState<Entity[] | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API}/entities`);
        setRows(res.ok ? await res.json() : []);
      } catch {
        setRows([]);
      }
    })();
  }, []);

  const max = rows && rows.length ? rows[0].count : 1;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Trang chủ</Link>
          <div className="flex-1" />
          <Nav current="/entities" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        <p className="label mb-1 text-accent">◇ Hồ sơ thực thể</p>
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
          Nhân vật &amp; tổ chức nổi bật
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Tự động rút từ tiêu đề tin gần đây. Bấm một tên để xem{' '}
          <span className="text-fg">hồ sơ tự cập nhật</span>: mọi bài nhắc đến, các báo đưa và dòng thời gian.
        </p>

        {!rows ? (
          <div className="mt-8 flex flex-wrap gap-2">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-9 w-28" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-8 text-sm text-muted">Chưa rút được thực thể.</p>
        ) : (
          <div className="mt-8 flex flex-wrap gap-2">
            {rows.map((e) => (
              <Link
                key={e.name}
                href={`/entities/${encodeURIComponent(e.name)}`}
                className="group inline-flex items-center gap-2 rounded-full border border-white/12 bg-surface py-1.5 pl-3.5 pr-2 text-sm text-fg transition hover:border-accent"
                style={{ fontSize: `${0.85 + 0.5 * (e.count / max)}rem` }}
              >
                <span className="transition group-hover:text-accent">{e.name}</span>
                <span className="label rounded-full bg-white/5 px-1.5 py-0.5 tabular-nums">
                  {e.count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
