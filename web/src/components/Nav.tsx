'use client';
import Link from 'next/link';

const LINKS = [
  { href: '/', label: 'Chat' },
  { href: '/brief', label: 'Bản tin' },
  { href: '/timeline', label: 'Dòng thời gian' },
  { href: '/compare', label: 'Đối chiếu' },
  { href: '/articles', label: 'Thư viện' },
  { href: '/dashboard', label: 'Bảng tin' },
];

export function Nav({ current }: { current?: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-1">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`label border px-2 py-1 transition ${
            l.href === current
              ? 'border-fg text-fg'
              : 'border-transparent hover:border-black/20 hover:text-fg'
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
