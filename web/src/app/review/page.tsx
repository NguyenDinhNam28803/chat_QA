'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { Markdown, Skeleton } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

interface PeriodRow {
  id: string;
  label: string;
  year: number;
  quarter: number;
  startDate: string;
  endDate: string;
  status: string;
  hasSummary: boolean;
  articleCount: number;
  eventCount: number;
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
// endDate is exclusive (first day of next quarter) → show the inclusive last day.
const fmtEnd = (d: string) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - 1);
  return fmtDate(dt.toISOString());
};

export default function ReviewPage() {
  const [periods, setPeriods] = useState<PeriodRow[] | null>(null);
  const [yearReview, setYearReview] = useState<Record<number, string>>({});
  const [loadingYear, setLoadingYear] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API}/periods`);
        if (res.ok) setPeriods(await res.json());
        else setPeriods([]);
      } catch {
        setPeriods([]);
      }
    })();
  }, []);

  async function loadYear(year: number) {
    if (yearReview[year] !== undefined || loadingYear) return;
    setLoadingYear(year);
    try {
      const res = await fetch(`${API}/periods/year/${year}`);
      if (res.ok) {
        const r = (await res.json()) as { content: string };
        setYearReview((m) => ({ ...m, [year]: r.content ?? '' }));
      }
    } catch {
      setYearReview((m) => ({ ...m, [year]: '' }));
    } finally {
      setLoadingYear(null);
    }
  }

  const years = periods
    ? [...new Set(periods.map((p) => p.year))].sort((a, b) => b - a)
    : [];

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Trang chủ</Link>
          <div className="flex-1" />
          <Nav current="/review" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        <p className="label mb-1">Nhìn lại</p>
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
          Tin tức theo quý
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Mỗi quý được lưu trữ riêng: điểm nóng chính, phân bố lĩnh vực và một bản
          tổng kết do AI viết. Cuối năm có thể xem lại “Năm vừa rồi là một năm như
          thế nào?”.
        </p>

        {!periods ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : periods.length === 0 ? (
          <p className="mt-8 text-sm text-muted">Chưa có dữ liệu quý nào.</p>
        ) : (
          years.map((year) => (
            <section key={year} className="mt-10">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold tracking-tight">{year}</h2>
                <button
                  type="button"
                  onClick={() => void loadYear(year)}
                  disabled={loadingYear === year}
                  className="label border border-white/20 px-3 py-1 text-fg transition hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {loadingYear === year
                    ? 'Đang tổng hợp…'
                    : yearReview[year] !== undefined
                      ? 'Tổng kết năm ↓'
                      : 'Năm vừa rồi thế nào? →'}
                </button>
              </div>

              {yearReview[year] !== undefined && (
                <div className="mb-4 rounded-lg border-2 border-fg bg-surface p-5">
                  <p className="label mb-3 text-accent">✦ Tổng kết năm {year} (AI)</p>
                  {yearReview[year] ? (
                    <Markdown>{yearReview[year]}</Markdown>
                  ) : (
                    <p className="text-sm text-muted">
                      Chưa đủ dữ liệu quý đã lưu để tổng kết năm.
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {periods
                  .filter((p) => p.year === year)
                  .map((p) => (
                    <Link
                      key={p.id}
                      href={`/review/${p.id}`}
                      className="group flex flex-col rounded-lg border border-white/10 bg-surface p-4 transition hover:border-accent"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="label border border-accent/50 px-2 py-0.5 text-accent">
                          {p.label}
                        </span>
                        <span
                          className={`label ml-auto px-2 py-0.5 ${
                            p.status === 'active'
                              ? 'text-accent'
                              : 'text-muted'
                          }`}
                        >
                          {p.status === 'active' ? '● Đang diễn ra' : 'Đã lưu'}
                        </span>
                      </div>
                      <div className="label text-muted">
                        {fmtDate(p.startDate)} – {fmtEnd(p.endDate)}
                      </div>
                      <div className="mt-3 font-display text-lg font-bold tabular-nums transition group-hover:text-accent">
                        {p.articleCount.toLocaleString('vi-VN')} bài
                      </div>
                      <div className="label mt-0.5">
                        {p.eventCount} sự kiện nóng · xem tổng kết →
                      </div>
                    </Link>
                  ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
