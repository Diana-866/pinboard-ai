import React, { useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  LogOut,
  Mail,
  Receipt,
  Send,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { PinPosyLogo } from '../common/PinPosyLogo';
import { useAuth } from '../../context/AuthContext';
import { AdminMail } from './AdminMail';
import { AdminEmailOutbox } from './AdminEmailOutbox';
import { AdminSubscriptions } from './AdminSubscriptions';
import { AdminBillingExceptions } from './AdminBillingExceptions';
import { AdminFinancialOperations } from './AdminFinancialOperations';
import { AdminPinterestSchedules } from './AdminPinterestSchedules';
import { AdminPaymentCreationRequests } from './AdminPaymentCreationRequests';

interface AdminPanelProps {
  onBackToApp: () => void;
}

type AdminTab =
  | 'subscriptions'
  | 'payment_creation_requests'
  | 'billing_exceptions'
  | 'financial_operations'
  | 'pinterest'
  | 'mail'
  | 'email_outbox';

const TABS: Array<{ id: AdminTab; label: string; icon: LucideIcon }> = [
  { id: 'subscriptions', label: 'Подписки', icon: Receipt },
  { id: 'payment_creation_requests', label: 'Платёжные заявки', icon: CreditCard },
  { id: 'billing_exceptions', label: 'Ошибки биллинга', icon: AlertTriangle },
  { id: 'financial_operations', label: 'Финансовые операции', icon: Wallet },
  { id: 'pinterest', label: 'Pinterest', icon: CalendarClock },
  { id: 'mail', label: 'Почта поддержки', icon: Mail },
  { id: 'email_outbox', label: 'Исходящие письма', icon: Send },
];

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToApp }) => {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('subscriptions');

  return (
    <div className="min-h-screen bg-page text-primary-theme flex flex-col font-sans transition-colors">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-subtle bg-surface px-4 shadow-xs md:px-8">
        <div className="flex items-center gap-3">
          <PinPosyLogo size={26} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading text-base font-bold tracking-tight text-primary-theme sm:text-lg">
                PinPosy Admin
              </span>
              <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-3 w-3" />
                Администратор
              </span>
            </div>
            <p className="hidden truncate text-[11px] text-muted-theme sm:block">
              Подписки, биллинг, финансовые операции, Pinterest и почта
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToApp}
            className="cursor-pointer rounded-xl border border-subtle bg-subtle px-3.5 py-1.5 text-xs font-semibold text-secondary-theme transition-colors hover:bg-surface hover:text-primary-theme"
          >
            ← На сайт PinPosy
          </button>
          <button
            type="button"
            onClick={logout}
            title="Завершить сеанс администратора"
            className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/20 dark:text-rose-400"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Выйти</span>
          </button>
        </div>
      </header>

      <nav
        aria-label="Разделы администрирования"
        className="border-b border-subtle bg-surface/50 px-4 backdrop-blur-xs md:px-8"
      >
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto py-2.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all sm:text-sm ${
                activeTab === id
                  ? 'accent-btn shadow-xs'
                  : 'text-secondary-theme hover:bg-subtle hover:text-primary-theme'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">
        <section
          role="status"
          aria-live="polite"
          className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 text-sm text-secondary-theme"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            Разделы со списком всех пользователей, налоговыми чеками и статистикой расходов ИИ
            пока не подключены к подтверждённым источникам данных и поэтому скрыты. Здесь не
            показываются демонстрационные пользователи или фиктивные платежи.
          </p>
        </section>

        <div role="tabpanel">
          {activeTab === 'subscriptions' && <AdminSubscriptions />}
          {activeTab === 'payment_creation_requests' && <AdminPaymentCreationRequests />}
          {activeTab === 'billing_exceptions' && <AdminBillingExceptions />}
          {activeTab === 'financial_operations' && <AdminFinancialOperations />}
          {activeTab === 'pinterest' && <AdminPinterestSchedules />}
          {activeTab === 'mail' && <AdminMail />}
          {activeTab === 'email_outbox' && <AdminEmailOutbox />}
        </div>
      </main>
    </div>
  );
};
