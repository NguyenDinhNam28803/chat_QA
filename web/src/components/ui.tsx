import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';

/** Flat placeholder block while content loads. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 ${className}`} />;
}

/** Highlight query terms — accent, no fill (for search results). */
export function highlight(text: string, q: string): React.ReactNode {
  const words = q
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (words.length === 0) return text;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const lower = new Set(words.map((w) => w.toLowerCase()));
  return text.split(re).map((part, i) =>
    lower.has(part.toLowerCase()) ? (
      <mark key={i} className="bg-transparent font-semibold text-accent">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

const mdComponents: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-2 hover:decoration-accent">
      {children}
    </a>
  ),
  h1: ({ children }) => <h3 className="mb-1 mt-3 font-display text-lg font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-3 font-display text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-2 font-semibold">{children}</h4>,
  code: ({ children }) => <code className="bg-white/5 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
};

/** Shared markdown renderer (AI answers, brief, compare, timeline narrative). */
export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown components={mdComponents}>{children}</ReactMarkdown>;
}

/**
 * F2 title↔body match badge. Score is cosine(title, body) in [0,1], shown 0–100.
 * `flag` (percentile-based, from the API) marks the low-scoring tail as possible
 * clickbait. Renders nothing until the article has been scored.
 */
export function ClickbaitBadge({
  score,
  flag,
  compact = false,
}: {
  score: number | null | undefined;
  flag: boolean;
  compact?: boolean;
}) {
  if (score === null || score === undefined) return null;
  const pct = Math.round(score * 100);
  const cls = flag
    ? 'border-amber-400/50 text-amber-400'
    : 'border-white/15 text-muted';
  return (
    <span
      className={`label inline-flex items-center gap-1 border px-1.5 py-0.5 ${cls}`}
      title="Độ khớp giữa tiêu đề và nội dung (0–100). Thấp = tiêu đề ít phản ánh nội dung bài."
    >
      {flag ? '⚠️ ' : ''}
      {compact ? pct : `Khớp tít–bài ${pct}`}
      {flag && !compact ? ' · nghi giật tít' : ''}
    </span>
  );
}
