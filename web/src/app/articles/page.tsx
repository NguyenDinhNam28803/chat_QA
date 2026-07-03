'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Skeleton, highlight } from '../../components/ui';
import { Nav } from '../../components/Nav';

const API = process.env.NEXT_PUBLIC_API_URL;

interface ArticleRow {
  id: string;
  title: string;
  source: string;
  topic: string | null;
  publishedAt: string | null;
  url: string;
  snippet: string;
}
interface TopicInfo {
  topic: string;
  label: string;
  count: number;
}
interface SearchResult {
  items: ArticleRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function ArticlesPage() {
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [topic, setTopic] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API}/articles/topics`);
        if (res.ok) setTopics(await res.json());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setPage(1);
      setQuery(q.trim());
    }, 350);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for a data fetch
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (topic) params.set('topic', topic);
    params.set('page', String(page));
    void (async () => {
      try {
        const res = await fetch(`${API}/articles?${params.toString()}`);
        if (res.ok) setData(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [query, topic, page]);

  const labelOf = (t: string | null) =>
    topics.find((x) => x.topic === t)?.label ?? 'Khác';
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3.5">
          <Link href="/" className="label border border-transparent px-2 py-1 hover:border-white/20 hover:text-fg">
            ← Trang chủ
          </Link>
          <h1 className="flex-1 font-display text-[15px] font-bold tracking-tight">
            Thư viện · {data?.total ?? 0}
          </h1>
          <Nav current="/articles" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-6">
        {/* Search — the single accent action on this screen */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
          className="mb-4 flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm trong tiêu đề + nội dung…"
            className="flex-1 border border-white/15 bg-surface px-4 py-2.5 outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-md bg-accent px-5 py-2.5 font-bold text-on-accent transition hover:brightness-95">
            TÌM
          </button>
        </form>

        {/* Topic chips */}
        <div className="mb-6 flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              setPage(1);
              setTopic(undefined);
            }}
            className={`rounded-md border px-2.5 py-1 text-xs transition ${
              !topic ? 'border-fg bg-fg text-bg' : 'border-white/15 text-muted hover:border-white/30 hover:text-fg'
            }`}
          >
            Tất cả
          </button>
          {topics.map((t) => (
            <button
              key={t.topic}
              onClick={() => {
                setPage(1);
                setTopic(topic === t.topic ? undefined : t.topic);
              }}
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                topic === t.topic ? 'border-fg bg-fg text-bg' : 'border-white/15 text-muted hover:border-white/30 hover:text-fg'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* List */}
        {loading && !data && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border border-white/10 rounded-lg bg-surface p-4">
                <Skeleton className="mb-2 h-3 w-32" />
                <Skeleton className="mb-2 h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        )}
        {!loading && data?.items.length === 0 && (
          <p className="text-sm text-muted">Không có bài nào khớp.</p>
        )}
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {data?.items.map((a) => (
            <li key={a.id} className="group border border-white/10 rounded-lg bg-surface p-4 transition hover:border-accent">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="label border border-white/15 px-1.5 py-0.5 text-fg">{labelOf(a.topic)}</span>
                <span className="text-xs text-muted">{a.source}</span>
                {a.publishedAt && (
                  <span className="text-xs text-muted">· {new Date(a.publishedAt).toLocaleDateString('vi-VN')}</span>
                )}
              </div>
              <Link href={`/articles/${a.id}`} className="block font-display text-lg font-bold leading-snug transition group-hover:text-accent">
                {highlight(a.title, query)}
              </Link>
              {a.snippet && (
                <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
                  {highlight(a.snippet, query)}…
                </p>
              )}
              <Link href={`/articles/${a.id}`} className="label mt-2 inline-block hover:text-accent">
                Đọc tiếp →
              </Link>
            </li>
          ))}
        </ul>

        {data && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3 text-sm">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border border-white/15 px-3 py-1.5 disabled:opacity-30">
              ← Trước
            </button>
            <span className="text-muted">Trang {page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="border border-white/15 px-3 py-1.5 disabled:opacity-30">
              Sau →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
