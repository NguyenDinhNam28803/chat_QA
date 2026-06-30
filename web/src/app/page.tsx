'use client';
import { useEffect, useRef, useState } from 'react';
import { useChatStream } from '../lib/useChatStream';

const EXAMPLES = [
  'Vietnam Airlines đặt mục tiêu lợi nhuận bao nhiêu năm nay?',
  'Có tin gì mới về kinh tế Việt Nam?',
  'Tóm tắt một tin đáng chú ý hôm nay.',
];

export default function Home() {
  const {
    messages,
    conversations,
    conversationId,
    streaming,
    send,
    loadConversation,
    newConversation,
  } = useChatStream();
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
    setInput('');
  }

  return (
    <div className="flex h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* ---------- Sidebar ---------- */}
      <aside
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform md:relative md:translate-x-0 dark:border-slate-800 dark:bg-slate-900`}
      >
        <div className="flex items-center gap-2.5 px-4 py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-md shadow-indigo-500/30">
            N
          </div>
          <span className="font-semibold tracking-tight">NewsQA</span>
        </div>

        <div className="px-3">
          <button
            onClick={() => {
              newConversation();
              setSidebarOpen(false);
            }}
            disabled={streaming}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Cuộc trò chuyện mới
          </button>
        </div>

        <p className="px-4 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Lịch sử
        </p>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {conversations.length === 0 && (
            <p className="px-2 py-2 text-sm text-slate-400">Chưa có hội thoại nào.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                void loadConversation(c.id);
                setSidebarOpen(false);
              }}
              className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition ${
                c.id === conversationId
                  ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
              title={c.title ?? 'Hội thoại'}
            >
              {c.title ?? 'Hội thoại không tiêu đề'}
            </button>
          ))}
        </nav>
      </aside>

      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
        />
      )}

      {/* ---------- Main ---------- */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(99,102,241,0.12),transparent)]"
        />

        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200/70 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/60">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800"
            aria-label="Mở lịch sử"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-[15px] font-semibold leading-tight tracking-tight">
              Hỏi-đáp tin tức tiếng Việt
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Trả lời dựa trên tin đã nạp, kèm trích dẫn nguồn
            </p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20 sm:inline-flex dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Trực tuyến
          </span>
        </header>

        {/* Messages */}
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-bold text-white shadow-xl shadow-indigo-500/30">
                N
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-semibold tracking-tight">
                  Hỏi bất cứ điều gì về tin tức
                </h2>
                <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                  Câu trả lời được tổng hợp từ các bài báo đã nạp và luôn kèm
                  trích dẫn nguồn để bạn kiểm chứng.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-600 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isUser = m.role === 'user';
            const isEmptyStreaming =
              !isUser && m.content === '' && streaming && i === messages.length - 1;
            return (
              <div
                key={i}
                className={`msg-in flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
                    isUser
                      ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25'
                  }`}
                >
                  {isUser ? 'Bạn' : 'N'}
                </div>

                <div className={`flex max-w-[82%] flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={
                      isUser
                        ? 'rounded-2xl rounded-tr-md bg-gradient-to-br from-indigo-600 to-indigo-500 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm'
                        : 'rounded-2xl rounded-tl-md bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800'
                    }
                  >
                    <p className="whitespace-pre-wrap">
                      {m.content}
                      {isEmptyStreaming && <span className="caret text-indigo-400">▍</span>}
                    </p>
                  </div>

                  {m.citations && m.citations.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        Nguồn trích dẫn
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {m.citations.map((c) => (
                          <a
                            key={c.index}
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex max-w-xs items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"
                            title={`${c.title} — ${c.source}`}
                          >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                              {c.index}
                            </span>
                            <span className="truncate font-medium text-slate-700 group-hover:text-indigo-700 dark:text-slate-200 dark:group-hover:text-indigo-300">
                              {c.title}
                            </span>
                            <span className="shrink-0 text-slate-400">· {c.source}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </main>

        {/* Composer */}
        <div className="border-t border-slate-200/70 bg-white/70 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/60">
          <form onSubmit={submit} className="mx-auto w-full max-w-3xl px-4 py-3.5">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm transition focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Nhập câu hỏi về tin tức…"
                className="flex-1 bg-transparent px-3 py-2 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                aria-label="Gửi"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-sm transition hover:from-indigo-500 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {streaming ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2 11 13" />
                    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-2 px-1 text-center text-[11px] text-slate-400">
              NewsQA chỉ trả lời dựa trên tin đã nạp · có thể thiếu tin mới nhất
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
