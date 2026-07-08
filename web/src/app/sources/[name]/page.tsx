'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Nav } from '../../../components/Nav';
import { Skeleton } from '../../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;
const pub = (s: string) => s.split(/\s*[-–|]\s*/)[0].trim();

interface Detail {
  source: string;
  articleCount: number;
  firstCount: number;
  multiCount: number;
  exclusiveCount: number;
  firstRate: number;
  byTopic: { topic: string | null; label: string; count: number }[];
  recent: { id: string; title: string; topic: string | null; publishedAt: string | null }[];
}

export default function SourceDetail() {
  const params = useParams<{ name: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.name) return;
    void (async () => {
      try {
        const res = await fetch(`${API}/sources/${params.name}`);
        if (res.ok) setData(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [params?.name]);

  const maxTopic = data ? Math.max(...data.byTopic.map((t) => t.count), 1) : 1;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/sources" className="font-display text-sm font-bold">← Nguồn</Link>
          <div className="flex-1" />
          <Nav current="/sources" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        {loading && (
          <div>
            <Skeleton className="mb-3 h-10 w-1/3" />
            <Skeleton className="mb-6 h-20 w-full" />
          </div>
        )}
        {!loading && !data && <p className="text-sm text-muted">Không tìm thấy nguồn.</p>}

        {data && (
          <>
            <p className="label mb-1">Hồ sơ nguồn tin</p>
            <h1 className="font-display text-[2.4rem] font-extrabold leading-none tracking-tight">
              {pub(data.source)}
            </h1>
            <p className="label mt-1">{data.source}</p>

            {/* KPI tiles */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { v: `${data.firstRate}%`, l: 'Sự kiện đưa tin đầu', accent: true },
                { v: data.exclusiveCount, l: 'Tin độc quyền (1 nguồn)' },
                { v: data.multiCount, l: 'Sự kiện đa nguồn tham gia' },
                { v: data.articleCount.toLocaleString('vi-VN'), l: 'Tổng bài' },
              ].map((k) => (
                <div key={k.l} className="rounded-lg border border-white/10 bg-surface px-4 py-3.5">
                  <div className={`font-display text-2xl font-extrabold tabular-nums leading-none ${k.accent ? 'text-accent' : 'text-fg'}`}>
                    {k.v}
                  </div>
                  <div className="label mt-1.5">{k.l}</div>
                </div>
              ))}
            </div>

            {/* Topic mix */}
            {data.byTopic.length > 0 && (
              <>
                <h2 className="label mb-3 mt-10">Độ phủ lĩnh vực</h2>
                <div className="max-w-2xl space-y-2">
                  {data.byTopic.map((t) => (
                    <div key={t.topic ?? 'khac'}>
                      <div className="mb-0.5 flex items-baseline justify-between text-sm">
                        <span className="text-muted">{t.label}</span>
                        <span className="font-mono text-xs tabular-nums text-muted">{t.count}</span>
                      </div>
                      <div className="h-2 bg-white/5">
                        <div className="h-full bg-accent" style={{ width: `${(t.count / maxTopic) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Recent */}
            {data.recent.length > 0 && (
              <>
                <h2 className="label mb-3 mt-10">Bài gần đây</h2>
                <ul className="divide-y divide-white/10 border-y border-white/10">
                  {data.recent.map((a) => (
                    <li key={a.id} className="py-3">
                      <Link href={`/articles/${a.id}`} className="font-medium leading-snug transition hover:text-accent">
                        {a.title}
                      </Link>
                      {a.publishedAt && (
                        <div className="label mt-0.5">{new Date(a.publishedAt).toLocaleString('vi-VN')}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
