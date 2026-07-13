'use client';
import Link from 'next/link';

const LINKS = [
  { href: '/', label: 'Trang chủ' },
  { href: '/chat', label: 'Chat' },
  { href: '/factcheck', label: 'Kiểm chứng' },
  { href: '/blindspots', label: 'Điểm mù' },
  { href: '/clickbait', label: 'Radar giật tít' },
  { href: '/sources', label: 'Nguồn' },
  { href: '/entities', label: 'Thực thể' },
  { href: '/brief', label: 'Bản tin' },
  { href: '/timeline', label: 'Dòng thời gian' },
  { href: '/compare', label: 'Đối chiếu' },
  { href: '/articles', label: 'Thư viện' },
  { href: '/review', label: 'Nhìn lại' },
  { href: '/dashboard', label: 'Bảng tin' },
];

export function Nav({ current }: { current?: string }) {
  return (
    // Single row that scrolls horizontally when the column is narrow (e.g. the
    // chat page beside its sidebar, or mobile) instead of wrapping — wrapping
    // grows the header vertically. min-w-0 lets it shrink inside a flex header;
    // scrollbar is hidden for a clean bar.
    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`label shrink-0 whitespace-nowrap border px-2 py-1 transition ${
            l.href === current
              ? 'border-fg text-fg'
              : 'border-transparent hover:border-white/20 hover:text-fg'
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
