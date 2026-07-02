'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { Markdown, Skeleton } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Brief {
  date: string;
  content: string;
  cached: boolean;
}

export default function BriefPage() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API}/brief`);
        if (res.ok) setBrief(await res.json());
        else setError(true);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Trang chủ</Link>
          <div className="flex-1" />
          <Nav current="/brief" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className="label mb-1">Bản tin AI</p>
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
          Bản tin nhanh
        </h1>
        {brief && (
          <p className="label mt-2">Ngày {brief.date}{brief.cached ? '' : ' · vừa tạo'}</p>
        )}

        <div className="mt-6 rounded-lg border border-black/10 bg-surface p-6">
          {loading && (
            <div>
              <p className="label mb-4 animate-pulse">Đang tổng hợp bản tin từ các tin mới nhất…</p>
              <Skeleton className="mb-2 h-4 w-1/3" />
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="mb-4 h-4 w-5/6" />
              <Skeleton className="mb-2 h-4 w-1/3" />
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {error && !brief && (
            <p className="text-sm text-muted">
              Không tạo được bản tin (mô hình có thể đang quá tải). Thử lại sau.
            </p>
          )}
          {brief && (
            <div className="text-[0.98rem]">
              <Markdown>{brief.content}</Markdown>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
