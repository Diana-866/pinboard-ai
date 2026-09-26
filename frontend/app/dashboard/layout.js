"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/dashboard",
    label: "Проекты",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/boards",
    label: "Доски",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  
  {
    href: "/dashboard/credits",
    label: "Кредиты",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/profile",
    label: "Профиль",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="flex w-60 flex-col border-r border-border bg-surface px-4 py-8">
        <p className="mb-8 px-2 text-lg font-semibold tracking-tight text-ink">PinSprig</p>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active ? "bg-canvas font-medium text-accent" : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 px-12 py-10">{children}</main>
    </div>
  );
}
