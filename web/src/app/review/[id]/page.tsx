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
const tl = (t: string | null) => (t ? (TOPIC_LABELS[t] ?? t) : 'Khác');
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
const fmtEnd = (d: string) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - 1);
  return fmtDate(dt.toISOString());
};

interface TopEvent {
  id: string;
  title: string;
  topic: string | null;
  sourceCount: number;
  articleCount: number;
}
interface PeriodDetail {
  period: {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    status: string;
    summary: string | null;
  };
  articleCount: number;
  eventCount: number;
  topEvents: TopEvent[];
  byTopic: { topic: string | null; count: number }[];
}

export default function PeriodDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<PeriodDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    void (async () => {
      try {
        const res = await fetch(`${API}/periods/${params.id}`);
        if (res.ok) setData(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [params?.id]);

  const maxTopic = data
    ? Math.max(...data.byTopic.map((t) => t.count), 1)
    : 1;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/review" className="font-display text-sm font-bold">← Nhìn lại</Link>
          <div className="flex-1" />
          <Nav current="/review" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        {loading && (
          <div>
            <Skeleton className="mb-3 h-5 w-28" />
            <Skeleton className="mb-6 h-10 w-1/2" />
            <p className="label mb-3 animate-pulse">Đang tổng hợp điểm nóng &amp; tổng kết quý…</p>
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}
        {!loading && !data && <p className="text-sm text-muted">Không tìm thấy quý này.</p>}

        {data && (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-accent/50 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide text-accent">
                {data.period.label}
              </span>
              <span className="label border border-white/15 px-2 py-0.5 text-fg">
                {data.period.status === 'active' ? '● Đang diễn ra' : 'Đã lưu'}
              </span>
            </div>
            <h1 className="font-display text-[2rem] font-extrabold leading-tight tracking-tight">
              Tổng kết {data.period.label}
            </h1>
            <p className="label mt-2">
              {fmtDate(data.period.startDate)} – {fmtEnd(data.period.endDate)} ·{' '}
              {data.articleCount.toLocaleString('vi-VN')} bài · {data.eventCount} sự kiện nóng
            </p>

            {/* AI recap */}
            {data.period.summary ? (
              <div className="mt-6 rounded-lg border-2 border-fg bg-surface p-5">
                <p className="label mb-3 text-accent">✦ Tổng kết quý (AI)</p>
                <div className="text-[0.98rem]">
                  <Markdown>{data.period.summary}</Markdown>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-lg border border-white/10 bg-surface p-5 text-sm text-muted">
                {data.period.status === 'active'
                  ? 'Quý đang diễn ra — bản tổng kết AI sẽ được tạo khi quý kết thúc (hoặc chạy POST /periods/rollover).'
                  : 'Chưa đủ dữ liệu để tổng kết quý này.'}
              </div>
            )}

            {/* Top hot events */}
            {data.topEvents.length > 0 && (
              <>
                <h2 className="label mb-3 mt-10">🔥 Điểm nóng của quý</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.topEvents.map((e) => (
                    <Link
                      key={e.id}
                      href={`/events/${e.id}`}
                      className="group flex flex-col rounded-lg border border-white/10 bg-surface p-4 transition hover:border-accent"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-md border border-accent/50 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold uppercase tracking-wide text-accent">
                          {e.sourceCount} báo
                        </span>
                        {e.topic && (
                          <span className="label border border-white/15 px-1.5 py-0.5 text-fg">
                            {tl(e.topic)}
                          </span>
                        )}
                      </div>
                      <h3 className="flex-1 font-display font-bold leading-snug transition group-hover:text-accent">
                        {e.title}
                      </h3>
                      <p className="label mt-3">{e.articleCount} bài · đối chiếu →</p>
                    </Link>
                  ))}
                </div>
              </>
            )}

            {/* Topic distribution */}
            {data.byTopic.length > 0 && (
              <>
                <h2 className="label mb-3 mt-10">Phân bố lĩnh vực</h2>
                <div className="max-w-2xl space-y-2">
                  {data.byTopic.map((t) => (
                    <div key={t.topic ?? 'khac'}>
                      <div className="mb-0.5 flex items-baseline justify-between text-sm">
                        <span className="text-muted">{tl(t.topic)}</span>
                        <span className="font-mono text-xs tabular-nums text-muted">
                          {t.count}
                        </span>
                      </div>
                      <div className="h-2 bg-white/5">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${(t.count / maxTopic) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
