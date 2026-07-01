import React from 'react';

/** Gray placeholder block while content loads. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200 dark:bg-slate-800 ${className}`}
    />
  );
}

/** Highlight query terms inside a text string (for search results). */
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
      <mark
        key={i}
        className="rounded bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/30"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
