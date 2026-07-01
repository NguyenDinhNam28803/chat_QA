'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { Skeleton } from '../../../components/ui';

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

interface RelatedRow {
  id: string;
  title: string;
  source: string;
  publishedAt: string | null;
}

const TOPIC_LABELS: Record<string, string> = {
  'the-thao': 'Thể thao',
  'suc-khoe': 'Sức khỏe',
  'giai-tri': 'Giải trí',
  'giao-duc': 'Giáo dục',
  'cong-nghe': 'Công nghệ',
  'kinh-te': 'Kinh tế',
  'phap-luat': 'Pháp luật',
  'the-gioi': 'Thế giới',
  khac: 'Khác',
};

// Stored content is collapsed to a single line; regroup sentences into readable
// paragraphs (~3 sentences each) for display.
function toParagraphs(content: string): string[] {
  const sentences = content.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paras.push(sentences.slice(i, i + 3).join(' '));
  }
  return paras.length ? paras : [content];
}

function readingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default function ArticleDetail() {
  const params = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<RelatedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for a data fetch
    setLoading(true);
    void (async () => {
      try {
        const [a, r] = await Promise.all([
          fetch(`${API}/articles/${params.id}`),
          fetch(`${API}/articles/${params.id}/related`),
        ]);
        if (a.ok) setArticle(await a.json());
        if (r.ok) setRelated(await r.json());
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
            className="flex-1 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ← Thư viện
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        {loading && (
          <div>
            <Skeleton className="mb-3 h-5 w-20" />
            <Skeleton className="mb-2 h-9 w-full" />
            <Skeleton className="mb-6 h-9 w-2/3" />
            <Skeleton className="mb-3 h-4 w-full" />
            <Skeleton className="mb-3 h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}
        {!loading && !article && (
          <p className="text-sm text-slate-400">Không tìm thấy bài.</p>
        )}
        {article && (
          <article>
            {article.topic && (
              <span className="mb-3 inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                {TOPIC_LABELS[article.topic] ?? article.topic}
              </span>
            )}
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              {article.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 pb-4 text-sm text-slate-400 dark:border-slate-800">
              <span className="font-medium text-slate-500 dark:text-slate-300">
                {article.source}
              </span>
              {article.publishedAt && (
                <span>· {new Date(article.publishedAt).toLocaleString('vi-VN')}</span>
              )}
              <span>· {readingMinutes(article.content)} phút đọc</span>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline dark:text-indigo-400"
              >
                · Nguồn gốc ↗
              </a>
            </div>
            <div className="mt-6 space-y-4 text-[17px] leading-8 text-slate-700 dark:text-slate-200">
              {toParagraphs(article.content).map((p, i) => (
                <p key={i} className="first-letter:ml-0.5">
                  {p}
                </p>
              ))}
            </div>
            <div className="mt-8 border-t border-slate-200 pt-4 dark:border-slate-800">
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Đọc bản gốc tại {article.source} ↗
              </a>
            </div>
          </article>
        )}

        {!loading && related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Bài liên quan
            </h2>
            <ul className="space-y-2">
              {related.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 transition hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40"
                >
                  <Link
                    href={`/articles/${r.id}`}
                    className="font-medium text-slate-700 hover:text-indigo-700 dark:text-slate-200 dark:hover:text-indigo-300"
                  >
                    {r.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {r.source}
                    {r.publishedAt &&
                      ` · ${new Date(r.publishedAt).toLocaleDateString('vi-VN')}`}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
