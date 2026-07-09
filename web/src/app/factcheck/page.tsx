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
  confidence: number | null;
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

interface WebResult {
  analysis: string;
  webSources: { url: string; title: string }[];
}

export default function FactcheckPage() {
  const [claim, setClaim] = useState('');
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [web, setWeb] = useState<WebResult | null>(null);
  const [webLoading, setWebLoading] = useState(false);

  function run(e: React.FormEvent) {
    e.preventDefault();
    const q = claim.trim();
    if (!q || loading) return;
    setLoading(true);
    setData(null);
    setWeb(null);
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

  function checkWeb() {
    if (!data || webLoading) return;
    setWebLoading(true);
    void (async () => {
      try {
        const res = await fetch(`${API}/factcheck/online?claim=${encodeURIComponent(data.claim)}`);
        if (res.ok) setWeb(await res.json());
      } catch {
        /* ignore */
      } finally {
        setWebLoading(false);
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
              <div className="flex-1">
                <p className="label">Kết luận</p>
                <p
                  className={`font-display text-lg font-bold ${v.accent ? 'text-accent' : 'text-fg'}`}
                >
                  {v.label}
                </p>
              </div>
              {data.confidence !== null && (
                <div className="text-right">
                  <div className="font-display text-2xl font-extrabold tabular-nums leading-none text-fg">
                    {Math.round(data.confidence * 100)}%
                  </div>
                  <div className="label mt-1">độ chắc chắn</div>
                </div>
              )}
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

            {/* B4 — explicit web-augmented check (external, unverified) */}
            <div className="mt-6 border-t border-white/10 pt-5">
              {!web ? (
                <button
                  onClick={checkWeb}
                  disabled={webLoading}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm transition hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {webLoading ? 'Đang tra web…' : '🌐 Kiểm chứng mở rộng ngoài web'}
                </button>
              ) : (
                <div className="rounded-lg border border-accent/40 bg-surface p-5">
                  <p className="label mb-3 text-accent">
                    🌐 Kết quả từ web · nguồn ngoài, chưa kiểm duyệt
                  </p>
                  {web.analysis ? (
                    <Markdown>{web.analysis}</Markdown>
                  ) : (
                    <p className="text-sm text-muted">Không có kết quả.</p>
                  )}
                  {web.webSources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {web.webSources.map((s) => (
                        <a
                          key={s.url}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="max-w-xs truncate border border-white/10 px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
                        >
                          ↗ {s.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!web && (
                <p className="label mt-2 text-muted">
                  Tra cứu web tách khỏi kho tin nội bộ — dùng khi kho chưa đủ dữ liệu.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
