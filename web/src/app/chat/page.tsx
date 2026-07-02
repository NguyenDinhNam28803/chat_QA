'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import { useChatStream, type Citation } from '../../lib/useChatStream';
import { Nav } from '../../components/Nav';

// Markdown — flat, Inter body. Links stay fg (accent reserved for the one action).
const md: Components = {
  p: ({ children }) => <p className="mb-2 whitespace-pre-wrap last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-black/30 underline-offset-2 hover:decoration-accent">
      {children}
    </a>
  ),
  h1: ({ children }) => <h3 className="mb-1 mt-2 font-semibold text-fg">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-2 font-semibold text-fg">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 font-semibold text-fg">{children}</h3>,
  code: ({ children }) => <code className="bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
};

const EXAMPLES = [
  'Vietnam Airlines đặt mục tiêu lợi nhuận bao nhiêu năm nay?',
  'Có tin gì mới về kinh tế Việt Nam?',
  'Tóm tắt một tin đáng chú ý hôm nay.',
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="label hover:text-fg"
      title="Sao chép"
    >
      {copied ? '✓ ĐÃ CHÉP' : '⧉ CHÉP'}
    </button>
  );
}

function followUps(citations?: Citation[]): string[] {
  const s = (citations ?? []).slice(0, 2).map((c) => `Tóm tắt bài: ${c.title}`);
  s.push('Còn tin nào liên quan không?');
  return s;
}

export default function Home() {
  const {
    messages,
    conversations,
    conversationId,
    streaming,
    phase,
    topics,
    topic,
    setTopic,
    send,
    stop,
    sendFeedback,
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
    <div className="flex h-dvh bg-bg text-fg">
      {/* ---------- Sidebar ---------- */}
      <aside
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-black/10 bg-bg transition-transform md:relative md:translate-x-0`}
      >
        <div className="flex items-center gap-2.5 border-b border-black/10 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-black text-on-accent">
            Đ
          </div>
          <span className="font-display text-sm font-extrabold tracking-tight">ĐIỂM TIN AI</span>
        </div>

        <div className="p-3">
          <button
            onClick={() => {
              newConversation();
              setSidebarOpen(false);
            }}
            disabled={streaming}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-black/15 px-3 py-2.5 text-sm transition hover:border-accent hover:text-accent disabled:opacity-40"
          >
            + Cuộc trò chuyện mới
          </button>
        </div>

        <p className="label px-4 pb-1 pt-2">Lịch sử</p>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {conversations.length === 0 && (
            <p className="px-1 py-2 text-sm text-muted">Chưa có hội thoại nào.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                void loadConversation(c.id);
                setSidebarOpen(false);
              }}
              className={`block w-full truncate border-l-2 py-1.5 pl-2 pr-1 text-left text-sm transition ${
                c.id === conversationId
                  ? 'border-accent font-medium text-fg'
                  : 'border-transparent text-muted hover:border-black/20 hover:text-fg'
              }`}
              title={c.title ?? 'Hội thoại'}
            >
              {c.title ?? 'Hội thoại không tiêu đề'}
            </button>
          ))}
        </nav>
      </aside>

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-20 bg-black/60 md:hidden" />
      )}

      {/* ---------- Main ---------- */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-black/10 bg-bg/90 px-4 py-3 backdrop-blur">
          <button onClick={() => setSidebarOpen(true)} className="border border-black/15 px-2 py-1 text-xs md:hidden" aria-label="Mở lịch sử">
            ☰
          </button>
          <div className="flex-1">
            <h1 className="font-display text-[15px] font-bold leading-tight tracking-tight">
              Hỏi-đáp tin tức tiếng Việt
            </h1>
            <p className="label mt-0.5">Trả lời dựa trên tin đã nạp · kèm nguồn</p>
          </div>
          <Nav current="/chat" />
        </header>

        {topics.length > 0 && (
          <div className="border-b border-black/10 bg-surface px-4 py-2">
            <div className="mx-auto flex w-full max-w-none flex-wrap items-center gap-1.5">
              <span className="label mr-1">Lĩnh vực</span>
              <button
                onClick={() => setTopic(undefined)}
                className={`rounded-md border px-2 py-0.5 text-xs transition ${
                  !topic ? 'border-fg bg-fg text-bg' : 'border-black/15 text-muted hover:border-black/30 hover:text-fg'
                }`}
              >
                Tất cả
              </button>
              {topics.map((t) => (
                <button
                  key={t.topic}
                  onClick={() => setTopic(topic === t.topic ? undefined : t.topic)}
                  className={`rounded-md border px-2 py-0.5 text-xs transition ${
                    topic === t.topic ? 'border-fg bg-fg text-bg' : 'border-black/15 text-muted hover:border-black/30 hover:text-fg'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <main className="mx-auto flex w-full max-w-none flex-1 flex-col gap-5 overflow-y-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-md bg-accent text-2xl font-black text-on-accent">
                Đ
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-3xl font-extrabold tracking-tight">
                  Hỏi bất cứ điều gì về tin tức
                </h2>
                <p className="mx-auto max-w-md text-sm text-muted">
                  Câu trả lời được tổng hợp từ các bài báo đã nạp và luôn kèm
                  trích dẫn nguồn để bạn kiểm chứng.
                </p>
              </div>
              <div className="flex flex-col items-stretch gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    className="border border-black/12 bg-surface px-3.5 py-2 text-left text-sm text-muted transition hover:border-accent hover:text-fg"
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
              <div key={i} className={`msg-in flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                    isUser ? 'border border-black/20 text-fg' : 'bg-fg text-bg'
                  }`}
                >
                  {isUser ? 'Bạn' : 'Đ'}
                </div>

                <div className={`flex max-w-[82%] flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={
                      isUser
                        ? 'rounded-md bg-fg px-4 py-2.5 leading-relaxed text-bg'
                        : 'rounded-md border border-black/10 bg-surface px-4 py-3 leading-relaxed'
                    }
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    ) : (
                      <div className="leading-relaxed">
                        <ReactMarkdown components={md}>{m.content}</ReactMarkdown>
                        {isEmptyStreaming && (
                          <span className="inline-flex items-center gap-2 text-sm text-muted">
                            <span className="caret text-accent">▍</span>
                            {phase === 'retrieving' ? 'Đang tìm nguồn liên quan…' : 'Đang soạn câu trả lời…'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {!isUser && m.content && !isEmptyStreaming && (
                    <div className="flex items-center gap-2">
                      <CopyButton text={m.content} />
                      {m.id && (
                        <>
                          <button
                            onClick={() => sendFeedback(m.id!, 1)}
                            title="Hữu ích"
                            className={`rounded-md border px-1.5 py-0.5 text-xs transition ${
                              m.feedback === 1 ? 'border-accent text-accent' : 'border-transparent text-muted hover:border-black/20'
                            }`}
                          >
                            👍
                          </button>
                          <button
                            onClick={() => sendFeedback(m.id!, -1)}
                            title="Chưa tốt"
                            className={`rounded-md border px-1.5 py-0.5 text-xs transition ${
                              m.feedback === -1 ? 'border-black/40 text-fg' : 'border-transparent text-muted hover:border-black/20'
                            }`}
                          >
                            👎
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {m.citations && m.citations.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="label">Nguồn trích dẫn</p>
                      <div className="flex flex-wrap gap-1.5">
                        {m.citations.map((c) => (
                          <a
                            key={c.index}
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex max-w-xs items-center gap-1.5 border border-black/10 bg-surface px-2 py-1 text-xs text-muted transition hover:border-accent"
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
              </div>
            );
          })}

          {(() => {
            if (streaming || messages.length === 0) return null;
            const last = messages[messages.length - 1];
            if (last.role !== 'assistant' || !last.content) return null;
            if (last.content.startsWith('⚠️')) return null;

            if (last.content.includes('không tìm thấy')) {
              return (
                <div className="flex flex-wrap items-center gap-2 pl-11">
                  <span className="label">Thử</span>
                  {topic && (
                    <button onClick={() => setTopic(undefined)} className="border border-black/15 px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-fg">
                      Bỏ lọc lĩnh vực
                    </button>
                  )}
                  <Link href="/articles" className="border border-black/15 px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-fg">
                    Duyệt thư viện bài →
                  </Link>
                </div>
              );
            }

            return (
              <div className="flex flex-wrap gap-2 pl-11">
                {followUps(last.citations).map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="max-w-xs truncate border border-black/12 px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-fg"
                    title={s}
                  >
                    {s}
                  </button>
                ))}
              </div>
            );
          })()}
          <div ref={endRef} />
        </main>

        {/* Composer */}
        <div className="border-t border-black/10 bg-bg">
          <form onSubmit={submit} className="mx-auto w-full max-w-none px-4 py-3.5">
            <div className="flex items-end gap-2 border border-black/15 bg-surface p-1.5 focus-within:border-accent">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Nhập câu hỏi về tin tức…"
                className="flex-1 bg-transparent px-3 py-2 text-fg placeholder:text-muted outline-none"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Dừng"
                  title="Dừng tạo câu trả lời"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-black/20 text-fg"
                >
                  <span className="h-3 w-3 bg-fg" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Gửi"
                  className="flex h-10 shrink-0 items-center justify-center rounded-md bg-accent px-5 font-bold text-on-accent transition hover:brightness-95 disabled:opacity-40"
                >
                  GỬI
                </button>
              )}
            </div>
            <p className="label mt-2 text-center">
              Điểm Tin AI chỉ trả lời dựa trên tin đã nạp · có thể thiếu tin mới nhất
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
