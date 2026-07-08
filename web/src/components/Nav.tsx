'use client';
import Link from 'next/link';

const LINKS = [
  { href: '/', label: 'Trang chủ' },
  { href: '/chat', label: 'Chat' },
  { href: '/factcheck', label: 'Kiểm chứng' },
  { href: '/blindspots', label: 'Điểm mù' },
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
    <nav className="flex flex-wrap items-center gap-1">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`label border px-2 py-1 transition ${
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
