'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { Markdown } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Item {
  id: string;
  title: string;
  snippet: string;
  publishedAt: string | null;
}
interface Group {
  source: string;
  items: Item[];
}
interface CompareResult {
  query: string;
  analysis: string;
  groups: Group[];
}

export default function ComparePage() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);

  function run(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query || loading) return;
    setLoading(true);
    setData(null);
    void (async () => {
      try {
        const res = await fetch(`${API}/compare?q=${encodeURIComponent(query)}`);
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
      <header className="sticky top-0 z-10 border-b border-black/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Trang chủ</Link>
          <div className="flex-1" />
          <Nav current="/compare" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        <p className="label mb-1">Đối chiếu AI</p>
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
          Các báo đưa tin thế nào?
        </h1>
        <p className="mt-2 text-sm text-muted">
          So sánh cách các nguồn khác nhau đưa tin về cùng một sự việc.
        </p>

        <form onSubmit={run} className="mt-5 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Vd: World Cup, tăng trưởng kinh tế, giá xăng…"
            className="flex-1 border border-black/15 bg-surface px-4 py-2.5 outline-none focus:border-accent"
          />
          <button type="submit" disabled={loading} className="rounded-md bg-accent px-5 py-2.5 font-bold text-on-accent transition hover:brightness-95 disabled:opacity-40">
            {loading ? '…' : 'ĐỐI CHIẾU'}
          </button>
        </form>

        {loading && <p className="label mt-6 animate-pulse">Đang phân tích các nguồn…</p>}

        {data && (
          <div className="mt-8 space-y-6">
            {data.analysis && (
              <div className="rounded-lg border border-black/10 bg-surface p-5 text-[0.98rem]">
                <p className="label mb-2">Phân tích</p>
                <Markdown>{data.analysis}</Markdown>
              </div>
            )}
            {data.groups.length < 2 ? (
              <p className="text-sm text-muted">
                Chỉ tìm thấy tin từ một nguồn — không đủ để đối chiếu. Thử từ khóa khác.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.groups.map((g) => (
                  <div key={g.source} className="rounded-lg border border-black/10 bg-surface p-4">
                    <p className="label mb-2 text-fg">{g.source}</p>
                    <ul className="space-y-3">
                      {g.items.map((it) => (
                        <li key={it.id}>
                          <Link href={`/articles/${it.id}`} className="font-medium leading-snug hover:text-accent">
                            {it.title}
                          </Link>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{it.snippet}…</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
