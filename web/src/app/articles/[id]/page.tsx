'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Article {
  id: string;
  url: string;
  title: string;
  source: string;
  topic: string | null;
  publishedAt: string | null;
  content: string;
}

export default function ArticleDetail() {
  const params = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    void (async () => {
      try {
        const res = await fetch(`${API}/articles/${params.id}`);
        if (res.ok) setArticle(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [params?.id]);

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/60">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3.5">
          <Link
            href="/articles"
            className="rounded-lg px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ← Thư viện
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        {loading && <p className="text-sm text-slate-400">Đang tải…</p>}
        {!loading && !article && (
          <p className="text-sm text-slate-400">Không tìm thấy bài.</p>
        )}
        {article && (
          <article>
            <h1 className="text-2xl font-semibold leading-snug tracking-tight">
              {article.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{article.source}</span>
              {article.publishedAt && (
                <span>
                  · {new Date(article.publishedAt).toLocaleString('vi-VN')}
                </span>
              )}
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline dark:text-indigo-400"
              >
                · Nguồn gốc ↗
              </a>
            </div>
            <div className="mt-5 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
              {article.content}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
