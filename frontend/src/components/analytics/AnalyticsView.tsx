import React from 'react';
import { BarChart3 } from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';

interface AnalyticsViewProps {
  onGenerateSimilar?: (topic: string) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = () => {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary-theme font-heading">
          {t.analytics.title}
        </h1>
        <p className="text-xs md:text-sm text-secondary-theme mt-1">
          {t.analytics.subtitle}
        </p>
      </div>

      <section
        className="custom-card p-6 md:p-8 rounded-2xl border border-subtle bg-subtle/30"
        role="status"
        aria-live="polite"
      >
        <div className="max-w-2xl mx-auto text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-accent-pill text-accent-ghost flex items-center justify-center">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-primary-theme">
            {t.analytics.dataUnavailableTitle}
          </h2>
          <p className="text-sm text-secondary-theme leading-relaxed">
            {t.analytics.dataUnavailableDescription}
          </p>
        </div>
      </section>
    </div>
  );
};
