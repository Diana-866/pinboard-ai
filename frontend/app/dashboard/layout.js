import Link from 'next/link';

export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-20 flex-col items-center gap-4 border-r bg-gray-50 py-6">
        <Link href="/dashboard" className="flex flex-col items-center gap-1 text-xs text-gray-600">
          📁<span>Проекты</span>
        </Link>
        <Link href="/dashboard/boards" className="flex flex-col items-center gap-1 text-xs text-gray-600">
          🖼️<span>Доски</span>
        </Link>
        <Link href="/dashboard/plan" className="flex flex-col items-center gap-1 text-xs text-gray-600">
          📅<span>План</span>
        </Link>
        <Link href="/dashboard/credits" className="flex flex-col items-center gap-1 text-xs text-gray-600">
          🪙<span>Кредиты</span>
        </Link>
        <Link href="/dashboard/profile" className="flex flex-col items-center gap-1 text-xs text-gray-600">
          👤<span>Профиль</span>
        </Link>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}