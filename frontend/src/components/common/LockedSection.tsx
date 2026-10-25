import React from 'react';
import { Lock } from 'lucide-react';

interface LockedSectionProps {
  /** true — показать замочек вместо контента (тариф не standard/pro) */
  locked: boolean;
  /** переход на экран тарифов */
  onGoToPricing: () => void;
  children: React.ReactNode;
}

const SkeletonCard: React.FC = () => (
  <div className="custom-card p-5 space-y-3">
    <div className="h-4 w-1/3 rounded-lg bg-subtle" />
    <div className="h-3 w-2/3 rounded-lg bg-subtle" />
    <div className="h-3 w-1/2 rounded-lg bg-subtle" />
  </div>
);

/**
 * Оверлей-замочек для разделов, закрытых тарифом.
 * Пока тариф не standard/pro, все разделы кроме «Аналитика» и «Тарифы»
 * показывают этот оверлей вместо контента (миграция 004_onboarding.sql).
 */
export const LockedSection: React.FC<LockedSectionProps> = ({ locked, onGoToPricing, children }) => {
  if (!locked) return <>{children}</>;

  return (
    <div className="relative min-h-[60vh]">
      {/* Приглушённый скелет вместо реального контента */}
      <div className="pointer-events-none select-none space-y-4 opacity-40 blur-[6px]" aria-hidden="true">
        <div className="h-8 w-64 rounded-xl bg-subtle" />
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>

      {/* Оверлей-замочек */}
      <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-3xl border border-subtle bg-surface p-8 text-center shadow-2xl font-outfit">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: '#F4E1E6' }}
          >
            <Lock className="h-6 w-6" style={{ color: '#B96B7C' }} />
          </div>
          <h3 className="font-heading text-lg font-bold text-primary-theme">Раздел пока под замком</h3>
          <p className="mt-2 text-sm text-secondary-theme">
            Сейчас открыт только раздел «Аналитика». Выберите тариф — и генерация пинов, доски
            и планировщик откроются сразу.
          </p>
          <button
            type="button"
            onClick={onGoToPricing}
            className="wizard-cta mt-5 w-full rounded-2xl py-3 text-sm font-bold"
          >
            Перейти к тарифам
          </button>
        </div>
      </div>
    </div>
  );
};
