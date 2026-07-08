'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { Skeleton } from '../../components/ui';

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
const tl = (t: string | null) => (t ? (TOPIC_LABELS[t] ?? t) : '');
const pub = (s: string) => s.split(/\s*[-–|]\s*/)[0].trim();
const rel = (d: string | null) => {
  if (!d) return '';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
};

interface Row {
  id: string;
  title: string;
  topic: string | null;
  articleCount: number;
  lastSeen: string | null;
  source: string;
}

export default function BlindspotsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API}/events/blindspots`);
        setRows(res.ok ? await res.json() : []);
      } catch {
        setRows([]);
      }
    })();
  }, []);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Trang chủ</Link>
          <div className="flex-1" />
          <Nav current="/blindspots" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        <p className="label mb-1 text-accent">◐ Radar điểm mù</p>
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
          Tin chỉ một nguồn đưa
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Những sự việc mới <span className="text-fg">chỉ một báo</span> đăng — có thể là{' '}
          <span className="text-fg">tin độc quyền (scoop)</span> hoặc{' '}
          <span className="text-fg">chưa được kiểm chứng chéo</span>. Đối lập với “điểm nóng” (nhiều báo cùng đưa).
        </p>

        {!rows ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-8 text-sm text-muted">Chưa có tin đơn nguồn nào.</p>
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                className="group flex flex-col rounded-lg border border-white/10 bg-surface p-4 transition hover:border-accent"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="label inline-flex items-center gap-1 border border-accent/50 px-1.5 py-0.5 text-accent">
                    1 nguồn
                  </span>
                  {e.topic && (
                    <span className="label border border-white/15 px-1.5 py-0.5 text-fg">
                      {tl(e.topic)}
                    </span>
                  )}
                  <span className="label ml-auto">{rel(e.lastSeen)}</span>
                </div>
                <h3 className="flex-1 font-display font-bold leading-snug transition group-hover:text-accent">
                  {e.title}
                </h3>
                <p className="label mt-3">{pub(e.source)} · {e.articleCount} bài →</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
