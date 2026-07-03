'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { Markdown } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Item {
  id: string;
  title: string;
  source: string;
  publishedAt: string | null;
}
interface TimelineResult {
  query: string;
  narrative: string;
  items: Item[];
}

export default function TimelinePage() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<TimelineResult | null>(null);
  const [loading, setLoading] = useState(false);

  function run(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query || loading) return;
    setLoading(true);
    setData(null);
    void (async () => {
      try {
        const res = await fetch(`${API}/timeline?q=${encodeURIComponent(query)}`);
        if (res.ok) setData(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Trang chủ</Link>
          <div className="flex-1" />
          <Nav current="/timeline" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        <p className="label mb-1">Dòng thời gian AI</p>
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
          Diễn biến sự việc
        </h1>
        <p className="mt-2 text-sm text-muted">
          Nhập một chủ đề, sự kiện hoặc nhân vật để xem các bài liên quan theo thời gian.
        </p>

        <form onSubmit={run} className="mt-5 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Vd: Vietnam Airlines, World Cup, giá vàng…"
            className="flex-1 border border-white/15 bg-surface px-4 py-2.5 outline-none focus:border-accent"
          />
          <button type="submit" disabled={loading} className="rounded-md bg-accent px-5 py-2.5 font-bold text-on-accent transition hover:brightness-95 disabled:opacity-40">
            {loading ? '…' : 'XEM'}
          </button>
        </form>

        {loading && <p className="label mt-6 animate-pulse">Đang dựng dòng thời gian…</p>}

        {data && (
          <div className="mt-8">
            {data.narrative && (
              <div className="mb-6 rounded-lg border border-white/10 bg-surface p-5 text-[0.98rem]">
                <p className="label mb-2">Tóm tắt diễn biến</p>
                <Markdown>{data.narrative}</Markdown>
              </div>
            )}
            {data.items.length === 0 ? (
              <p className="text-sm text-muted">Không tìm thấy bài liên quan.</p>
            ) : (
              <ol className="relative ml-3 border-l-2 border-white/10">
                {data.items.map((it) => (
                  <li key={it.id} className="mb-5 ml-5">
                    <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-accent" />
                    <div className="label">
                      {it.publishedAt ? new Date(it.publishedAt).toLocaleString('vi-VN') : '—'} · {it.source}
                    </div>
                    <Link href={`/articles/${it.id}`} className="font-display font-semibold leading-snug hover:text-accent">
                      {it.title}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
