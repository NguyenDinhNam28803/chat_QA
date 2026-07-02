'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Nav } from '../../../components/Nav';
import { Markdown, Skeleton } from '../../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

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

interface Article {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
}
interface EventData {
  event: {
    id: string;
    title: string;
    topic: string | null;
    summary: string | null;
    sourceCount: number;
    articleCount: number;
  };
  articles: Article[];
}

export default function EventDetail() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    void (async () => {
      try {
        const res = await fetch(`${API}/events/${params.id}`);
        if (res.ok) setData(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [params?.id]);

  const sources = data ? [...new Set(data.articles.map((a) => a.source))] : [];

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Trang chủ</Link>
          <div className="flex-1" />
          <Nav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        {loading && (
          <div>
            <Skeleton className="mb-3 h-5 w-24" />
            <Skeleton className="mb-2 h-10 w-full" />
            <Skeleton className="mb-6 h-10 w-2/3" />
            <p className="label mb-3 animate-pulse">Đang phân tích đồng thuận & khác biệt giữa các nguồn…</p>
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}
        {!loading && !data && <p className="text-sm text-muted">Không tìm thấy sự kiện.</p>}
        {data && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-accent/50 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide text-accent">
                {data.event.sourceCount} báo · {data.event.articleCount} bài
              </span>
              {data.event.topic && (
                <span className="label border border-black/15 px-2 py-0.5 text-fg">
                  {TOPIC_LABELS[data.event.topic] ?? data.event.topic}
                </span>
              )}
            </div>
            <h1 className="font-display text-[2rem] font-extrabold leading-tight tracking-tight">
              {data.event.title}
            </h1>
            <p className="label mt-2">Đưa tin bởi: {sources.join(' · ')}</p>

            {/* AI consensus / conflict */}
            {data.event.summary ? (
              <div className="mt-6 rounded-lg border border-black/10 bg-surface p-5">
                <p className="label mb-3">✦ Phân tích đa nguồn (AI)</p>
                <div className="text-[0.98rem]">
                  <Markdown>{data.event.summary}</Markdown>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted">
                Chưa có phân tích cho sự kiện này.
              </p>
            )}

            {/* Cross-source timeline */}
            <h2 className="label mb-3 mt-10">Dòng thời gian · {data.articles.length} bài</h2>
            <ol className="relative ml-3 border-l-2 border-black/10">
              {data.articles.map((a) => (
                <li key={a.id} className="mb-5 ml-5">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-accent" />
                  <div className="label">
                    {a.publishedAt ? new Date(a.publishedAt).toLocaleString('vi-VN') : '—'} · {a.source}
                  </div>
                  <Link href={`/articles/${a.id}`} className="font-display font-semibold leading-snug hover:text-accent">
                    {a.title}
                  </Link>
                  {' '}
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="label text-muted hover:text-accent">
                    ↗ gốc
                  </a>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </div>
  );
}
