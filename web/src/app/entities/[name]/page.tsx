'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Nav } from '../../../components/Nav';
import { Skeleton } from '../../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;
const pub = (s: string) => s.split(/\s*[-–|]\s*/)[0].trim();

interface Dossier {
  name: string;
  articleCount: number;
  sources: { source: string; count: number }[];
  articles: {
    id: string;
    title: string;
    source: string;
    topic: string | null;
    publishedAt: string | null;
  }[];
}

export default function EntityDetail() {
  const params = useParams<{ name: string }>();
  const [data, setData] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.name) return;
    void (async () => {
      try {
        const res = await fetch(`${API}/entities/${params.name}`);
        if (res.ok) setData(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [params?.name]);

  const name = params?.name ? decodeURIComponent(params.name) : '';
  const maxSrc = data && data.sources.length ? data.sources[0].count : 1;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/entities" className="font-display text-sm font-bold">← Thực thể</Link>
          <div className="flex-1" />
          <Nav current="/entities" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        {loading && (
          <div>
            <Skeleton className="mb-3 h-10 w-1/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {!loading && (!data || data.articleCount === 0) && (
          <>
            <h1 className="font-display text-[2.4rem] font-extrabold tracking-tight">{name}</h1>
            <p className="mt-3 text-sm text-muted">Chưa có bài nào nhắc đến thực thể này.</p>
          </>
        )}

        {data && data.articleCount > 0 && (
          <>
            <p className="label mb-1">Hồ sơ thực thể</p>
            <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
              {data.name}
            </h1>
            <p className="label mt-2">
              {data.articleCount} bài nhắc đến · {data.sources.length} nguồn
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              {/* Timeline of mentions */}
              <div className="lg:col-span-2">
                <h2 className="label mb-3">Bài nhắc đến gần đây</h2>
                <ol className="relative ml-3 border-l-2 border-white/10">
                  {data.articles.map((a) => (
                    <li key={a.id} className="mb-5 ml-5">
                      <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-accent" />
                      <div className="label">
                        {a.publishedAt ? new Date(a.publishedAt).toLocaleString('vi-VN') : '—'} · {pub(a.source)}
                      </div>
                      <Link href={`/articles/${a.id}`} className="font-display font-semibold leading-snug transition hover:text-accent">
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Source breakdown */}
              <div>
                <h2 className="label mb-3">Nguồn đưa tin</h2>
                <div className="space-y-2">
                  {data.sources.map((s) => (
                    <div key={s.source}>
                      <div className="mb-0.5 flex items-baseline justify-between text-sm">
                        <span className="truncate text-muted">{pub(s.source)}</span>
                        <span className="ml-2 font-mono text-xs tabular-nums text-muted">{s.count}</span>
                      </div>
                      <div className="h-2 bg-white/5">
                        <div className="h-full bg-accent" style={{ width: `${(s.count / maxSrc) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <Link
                  href={`/timeline?q=${encodeURIComponent(data.name)}`}
                  className="label mt-5 inline-block text-muted transition hover:text-accent"
                >
                  Xem dòng thời gian AI →
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
