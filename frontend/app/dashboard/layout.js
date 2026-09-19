import Link from 'next/link';

export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="flex w-20 flex-col items-center gap-5 border-r border-border py-6">
        <Link href="/dashboard" className="flex flex-col items-center gap-1 text-xs text-ink/70 transition hover:text-berry">
          📁<span>Проекты</span>
        </Link>
        <Link href="/dashboard/boards" className="flex flex-col items-center gap-1 text-xs text-ink/70 transition hover:text-berry">
          🖼️<span>Доски</span>
        </Link>
        <Link href="/dashboard/plan" className="flex flex-col items-center gap-1 text-xs text-ink/70 transition hover:text-berry">
          📅<span>План</span>
        </Link>
        <Link href="/dashboard/credits" className="flex flex-col items-center gap-1 text-xs text-ink/70 transition hover:text-berry">
          🪙<span>Кредиты</span>
        </Link>
        <Link href="/dashboard/profile" className="flex flex-col items-center gap-1 text-xs text-ink/70 transition hover:text-berry">
          👤<span>Профиль</span>
        </Link>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );

}