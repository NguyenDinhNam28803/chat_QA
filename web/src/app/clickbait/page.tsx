'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Skeleton, ClickbaitBadge } from '../../components/ui';
import { Nav } from '../../components/Nav';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Row {
  id: string;
  title: string;
  source: string;
  topic: string | null;
  publishedAt: string | null;
  url: string;
  titleBodyScore: number | null;
  clickbaitFlag: boolean;
}
interface Ranking {
  items: Row[];
  threshold: number | null;
  percentile: number;
  total: number;
  page: number;
  pageSize: number;
}

export default function ClickbaitPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Ranking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for a data fetch
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`${API}/articles/clickbait?page=${page}`);
        if (res.ok) setData(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [page]);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;
  const pctLabel = data ? Math.round(data.percentile * 100) : 15;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3.5">
          <Link href="/" className="label border border-transparent px-2 py-1 hover:border-white/20 hover:text-fg">
            ← Trang chủ
          </Link>
          <h1 className="flex-1 font-display text-[15px] font-bold tracking-tight">
            Radar giật tít · {data?.total ?? 0}
          </h1>
          <Nav current="/clickbait" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-6">
        {/* How it works — transparency (neutral, evidence-based) */}
        <div className="mb-6 rounded-lg border border-white/10 bg-surface p-4 text-sm leading-relaxed text-muted">
          <p className="label mb-1 text-fg">Cách đo</p>
          Điểm <span className="text-fg">khớp tít–bài</span> (0–100) là độ tương đồng ngữ nghĩa giữa{' '}
          <span className="text-fg">tiêu đề</span> và <span className="text-fg">toàn bộ nội dung</span> bài, đo bằng
          embedding. Điểm thấp nghĩa là tiêu đề ít phản ánh nội dung — dấu hiệu có thể giật tít. Bài bị{' '}
          <span className="text-amber-400">gắn cờ ⚠️</span> là nhóm{' '}
          <span className="text-fg">{pctLabel}%</span> điểm thấp nhất trong kho hiện tại
          {data?.threshold != null && (
            <> (ngưỡng {Math.round(data.threshold * 100)}/100)</>
          )}
          . Đây là chỉ báo tương đối để tham khảo, không phải kết luận.
        </div>

        {loading && !data && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-surface p-4">
                <Skeleton className="mb-2 h-3 w-40" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ))}
          </div>
        )}
        {!loading && data?.items.length === 0 && (
          <p className="text-sm text-muted">
            Chưa có bài nào được chấm điểm. Chạy backfill: <code className="bg-white/5 px-1">POST /ingestion/backfill-clickbait</code>.
          </p>
        )}

        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {data?.items.map((a, i) => (
            <li key={a.id} className="group flex items-start gap-3 rounded-lg border border-white/10 bg-surface p-4 transition hover:border-accent">
              <span className="mt-0.5 font-display text-sm font-bold text-muted tabular-nums">
                {(page - 1) * (data?.pageSize ?? 20) + i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{a.source}</span>
                  {a.publishedAt && (
                    <span className="text-xs text-muted">· {new Date(a.publishedAt).toLocaleDateString('vi-VN')}</span>
                  )}
                  <ClickbaitBadge score={a.titleBodyScore} flag={a.clickbaitFlag} />
                </div>
                <Link href={`/articles/${a.id}`} className="block font-display text-lg font-bold leading-snug transition group-hover:text-accent">
                  {a.title}
                </Link>
              </div>
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
