'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Skeleton, Markdown, ClickbaitBadge } from '../../../components/ui';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Article {
  id: string;
  url: string;
  title: string;
  source: string;
  topic: string | null;
  publishedAt: string | null;
  content: string;
  titleBodyScore: number | null;
  clickbaitFlag: boolean;
}

interface RelatedRow {
  id: string;
  title: string;
  source: string;
  publishedAt: string | null;
}

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

function toParagraphs(content: string): string[] {
  const sentences = content.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paras.push(sentences.slice(i, i + 3).join(' '));
  }
  return paras.length ? paras : [content];
}

function readingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default function ArticleDetail() {
  const params = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<RelatedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [loadingQ, setLoadingQ] = useState(false);

  function loadQuestions() {
    if (!params?.id || loadingQ || questions) return;
    setLoadingQ(true);
    void (async () => {
      try {
        const res = await fetch(`${API}/articles/${params.id}/questions`);
        if (res.ok) {
          const d = (await res.json()) as { questions: string[] };
          setQuestions(d.questions);
        }
      } catch {
        /* ignore */
      } finally {
        setLoadingQ(false);
      }
    })();
  }

  function makeSummary() {
    if (!params?.id || summarizing) return;
    setSummarizing(true);
    void (async () => {
      try {
        const res = await fetch(`${API}/articles/${params.id}/summary`);
        if (res.ok) {
          const d = (await res.json()) as { summary: string };
          setSummary(d.summary);
        }
      } catch {
        /* ignore */
      } finally {
        setSummarizing(false);
      }
    })();
  }

  useEffect(() => {
    if (!params?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for a data fetch
    setLoading(true);
    void (async () => {
      try {
        const [a, r] = await Promise.all([
          fetch(`${API}/articles/${params.id}`),
          fetch(`${API}/articles/${params.id}/related`),
        ]);
        if (a.ok) setArticle(await a.json());
        if (r.ok) setRelated(await r.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [params?.id]);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3.5">
          <Link href="/articles" className="label border border-transparent px-2 py-1 hover:border-white/20 hover:text-fg">
            ← Thư viện
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 py-8">
        {loading && (
          <div>
            <Skeleton className="mb-3 h-5 w-20" />
            <Skeleton className="mb-2 h-10 w-full" />
            <Skeleton className="mb-6 h-10 w-2/3" />
            <Skeleton className="mb-3 h-4 w-full" />
            <Skeleton className="mb-3 h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}
        {!loading && !article && <p className="text-sm text-muted">Không tìm thấy bài.</p>}
        {article && (
          <article>
            {article.topic && (
              <span className="label mb-3 inline-block border border-white/15 px-2 py-0.5 text-fg">
                {TOPIC_LABELS[article.topic] ?? article.topic}
              </span>
            )}
            <h1 className="font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight">
              {article.title}
            </h1>
            <div className="label mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/10 pb-4">
              <span className="text-fg">{article.source}</span>
              {article.publishedAt && <span>· {new Date(article.publishedAt).toLocaleString('vi-VN')}</span>}
              <span>· {readingMinutes(article.content)} phút đọc</span>
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-2 hover:decoration-accent">
                · Nguồn gốc ↗
              </a>
              <ClickbaitBadge score={article.titleBodyScore} flag={article.clickbaitFlag} />
            </div>
            {/* AI summary */}
            <div className="mt-5">
              {!summary && (
                <button
                  onClick={makeSummary}
                  disabled={summarizing}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm transition hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {summarizing ? 'Đang tóm tắt…' : '✦ Tóm tắt bằng AI'}
                </button>
              )}
              {summary && (
                <div className="rounded-lg border border-white/10 bg-surface p-4">
                  <p className="label mb-2">Tóm tắt AI</p>
                  <div className="text-[0.95rem]">
                    <Markdown>{summary}</Markdown>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 space-y-4 text-[1.05rem] leading-[1.8] text-fg">
              {toParagraphs(article.content).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            {/* (E3) AI-suggested follow-up questions → open chat pre-filled */}
            <div className="mt-8 border-t border-white/10 pt-5">
              {!questions ? (
                <button
                  onClick={loadQuestions}
                  disabled={loadingQ}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm transition hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {loadingQ ? 'Đang gợi ý…' : '✦ Gợi ý câu hỏi để hỏi AI'}
                </button>
              ) : questions.length === 0 ? (
                <p className="text-sm text-muted">Chưa gợi ý được câu hỏi cho bài này.</p>
              ) : (
                <>
                  <p className="label mb-2">Hỏi AI về bài này</p>
                  <div className="flex flex-col items-start gap-2">
                    {questions.map((q) => (
                      <Link
                        key={q}
                        href={`/chat?q=${encodeURIComponent(q)}`}
                        className="border border-white/12 bg-surface px-3.5 py-2 text-left text-sm text-muted transition hover:border-accent hover:text-fg"
                      >
                        {q}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* The single accent action on this screen */}
            <div className="mt-8 border-t border-white/10 pt-5">
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2.5 font-bold text-on-accent transition hover:brightness-95"
              >
                Đọc bản gốc tại {article.source} ↗
              </a>
            </div>
          </article>
        )}

        {!loading && related.length > 0 && (
          <section className="mt-12">
            <h2 className="label mb-3">Bài liên quan</h2>
            <ul className="divide-y divide-white/10 border-y border-white/10">
              {related.map((r) => (
                <li key={r.id} className="py-3">
                  <Link href={`/articles/${r.id}`} className="font-medium transition hover:text-accent">
                    {r.title}
                  </Link>
                  <div className="label mt-0.5">
                    {r.source}
                    {r.publishedAt && ` · ${new Date(r.publishedAt).toLocaleDateString('vi-VN')}`}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
