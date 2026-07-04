'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/Nav';
import { Markdown } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Citation {
  index: number;
  url: string;
  title: string;
  source: string;
}
interface Result {
  claim: string;
  verdict: 'supported' | 'conflicting' | 'insufficient';
  analysis: string;
  citations: Citation[];
}

const VERDICTS = {
  supported: { icon: '✅', label: 'Được nhiều nguồn xác nhận', accent: false },
  conflicting: { icon: '⚠️', label: 'Các nguồn mâu thuẫn', accent: true },
  insufficient: { icon: '❓', label: 'Chưa đủ dữ liệu để kết luận', accent: false },
} as const;

const EXAMPLES = [
  'Vietnam Airlines sẽ có lãi trong năm nay',
  'Giá vàng trong nước đang giảm mạnh',
];

export default function FactcheckPage() {
  const [claim, setClaim] = useState('');
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  function run(e: React.FormEvent) {
    e.preventDefault();
    const q = claim.trim();
    if (!q || loading) return;
    setLoading(true);
    setData(null);
    void (async () => {
      try {
        const res = await fetch(`${API}/factcheck?claim=${encodeURIComponent(q)}`);
        if (res.ok) setData(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }

  const v = data ? VERDICTS[data.verdict] : null;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3">
          <Link href="/" className="font-display text-sm font-bold">← Trang chủ</Link>
          <div className="flex-1" />
          <Nav current="/factcheck" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className="label mb-1">Kiểm chứng đa nguồn</p>
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
          Nhận định này có đáng tin?
        </h1>
        <p className="mt-2 text-sm text-muted">
          Dán một tin đồn / nhận định — hệ thống truy hồi cả bằng chứng{' '}
          <span className="text-fg">ủng hộ</span> lẫn{' '}
          <span className="text-fg">mâu thuẫn</span> xuyên nguồn, rồi kết luận có
          kèm trích dẫn. Chỉ dựa trên kho tin đã nạp — không đủ dữ liệu sẽ nói thẳng.
        </p>

        <form onSubmit={run} className="mt-5 flex gap-2">
          <input
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="Vd: Vietnam Airlines sẽ có lãi năm nay"
            className="flex-1 border border-white/15 bg-surface px-4 py-2.5 outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent px-5 py-2.5 font-bold text-on-accent transition hover:brightness-110 disabled:opacity-40"
          >
            {loading ? '…' : 'KIỂM CHỨNG'}
          </button>
        </form>

        {!data && !loading && (
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setClaim(ex)}
                className="border border-white/12 px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-fg"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <p className="label mt-8 animate-pulse">
            Đang đối chứng nhận định với các nguồn…
          </p>
        )}

        {data && v && (
          <div className="mt-8">
            {/* Verdict */}
            <div
              className={`flex items-center gap-3 rounded-lg border-2 p-4 ${
                v.accent ? 'border-accent' : 'border-fg'
              }`}
            >
              <span className="text-2xl">{v.icon}</span>
              <div>
                <p className="label">Kết luận</p>
                <p
                  className={`font-display text-lg font-bold ${v.accent ? 'text-accent' : 'text-fg'}`}
                >
                  {v.label}
                </p>
              </div>
            </div>

            {/* Analysis */}
            {data.analysis && (
              <div className="mt-5 rounded-lg border border-white/10 bg-surface p-5 text-[0.98rem]">
                <p className="label mb-3">✦ Phân tích bằng chứng (AI)</p>
                <Markdown>{data.analysis}</Markdown>
              </div>
            )}

            {/* Sources */}
            {data.citations.length > 0 && (
              <div className="mt-5">
                <p className="label mb-2">Nguồn đối chứng · {data.citations.length}</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.citations.map((c) => (
                    <a
                      key={c.index}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-xs items-center gap-1.5 border border-white/10 bg-surface px-2 py-1 text-xs text-muted transition hover:border-accent"
                      title={`${c.title} — ${c.source}`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center bg-fg text-[10px] font-bold text-bg">
                        {c.index}
                      </span>
                      <span className="truncate font-medium text-fg">{c.title}</span>
                      <span className="shrink-0">· {c.source}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
