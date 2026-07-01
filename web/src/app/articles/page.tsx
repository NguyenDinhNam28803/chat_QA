'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL;

interface ArticleRow {
  id: string;
  title: string;
  source: string;
  topic: string | null;
  publishedAt: string | null;
  url: string;
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
  const [query, setQuery] = useState(''); // debounced/submitted value
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
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/60">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3.5">
          <Link
            href="/"
            className="rounded-lg px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ← Chat
          </Link>
          <h1 className="text-[15px] font-semibold tracking-tight">
            Thư viện bài · {data?.total ?? 0} bài
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        {/* Search */}
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
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[15px] outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-900"
          />
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Tìm
          </button>
        </form>

        {/* Topic chips */}
        <div className="mb-5 flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              setPage(1);
              setTopic(undefined);
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              !topic
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
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
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                topic === t.topic
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* List */}
        {loading && <p className="text-sm text-slate-400">Đang tải…</p>}
        {!loading && data?.items.length === 0 && (
          <p className="text-sm text-slate-400">Không có bài nào khớp.</p>
        )}
        <ul className="space-y-2">
          {data?.items.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40"
            >
              <Link
                href={`/articles/${a.id}`}
                className="font-medium text-slate-800 hover:text-indigo-700 dark:text-slate-100 dark:hover:text-indigo-300"
              >
                {a.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  {labelOf(a.topic)}
                </span>
                <span>{a.source}</span>
                {a.publishedAt && (
                  <span>· {new Date(a.publishedAt).toLocaleString('vi-VN')}</span>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3 text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 dark:border-slate-700"
            >
              ← Trước
            </button>
            <span className="text-slate-500">
              Trang {page}/{totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 dark:border-slate-700"
            >
              Sau →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
