import React from 'react';
import { BarChart3, CalendarClock, CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { apiRequest } from '../../lib/api';
import { isEmptySummary, mapPublicationSummary, PublicationSummary } from '../../lib/analyticsSummary';

/**
 * Publication analytics.
 *
 * Only numbers PinPosy actually records are shown: how many pins were published,
 * how many are scheduled or in flight, and how many failed or were cancelled in
 * the reporting window. Pinterest-side metrics (impressions, saves, clicks) do
 * not exist in this product yet, so the screen says so explicitly instead of
 * showing zeros or placeholder charts.
 */

function formatCount(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

function formatTimestamp(value: string | null, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

const localeTag = (language: string): string => {
  switch (language) {
    case 'ru': return 'ru-RU';
    case 'es': return 'es-ES';
    case 'pt': return 'pt-BR';
    case 'de': return 'de-DE';
    case 'fr': return 'fr-FR';
    case 'zh': return 'zh-CN';
    default: return 'en-US';
  }
};

export const AnalyticsView: React.FC = () => {
  const { t, language } = useI18n();
  const [summary, setSummary] = React.useState<PublicationSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiRequest('/analytics/summary')
      .then((payload) => {
        if (cancelled) return;
        setSummary(mapPublicationSummary(payload));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setSummary(null);
        setError(loadError instanceof Error && loadError.message ? loadError.message : t.analytics.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // `t.analytics.loadError` is a stable localized string; re-running on
    // language change keeps the error message in the selected language.
  }, [reloadToken, t.analytics.loadError]);

  const locale = localeTag(language || 'en');
  const fillDays = (template: string, days: number) => template.replace('{days}', formatCount(days, locale));

  const cards = summary
    ? [
        {
          key: 'publishedWindow',
          label: fillDays(t.analytics.publishedWindow, summary.rangeDays),
          value: formatCount(summary.publications.window, locale),
          icon: CheckCircle2,
        },
        {
          key: 'publishedTotal',
          label: t.analytics.publishedTotal,
          value: formatCount(summary.publications.total, locale),
          icon: BarChart3,
        },
        {
          key: 'scheduledUpcoming',
          label: t.analytics.scheduledUpcoming,
          value: formatCount(summary.schedules.scheduledUpcoming, locale),
          icon: CalendarClock,
        },
        {
          key: 'publishingNow',
          label: t.analytics.publishingNow,
          value: formatCount(summary.schedules.publishing, locale),
          icon: Loader2,
        },
        {
          key: 'failedWindow',
          label: fillDays(t.analytics.failedWindow, summary.rangeDays),
          value: formatCount(summary.schedules.failedWindow, locale),
          icon: TriangleAlert,
        },
        {
          key: 'cancelledWindow',
          label: fillDays(t.analytics.cancelledWindow, summary.rangeDays),
          value: formatCount(summary.schedules.cancelledWindow, locale),
          icon: TriangleAlert,
        },
      ]
    : [];

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

      {loading && (
        <section className="custom-card p-6 rounded-2xl border border-subtle bg-subtle/30" role="status" aria-live="polite">
          <p className="text-sm text-secondary-theme">{t.analytics.loading}</p>
        </section>
      )}

      {!loading && error && (
        <section className="custom-card p-6 rounded-2xl border border-subtle bg-subtle/30" role="alert">
          <p className="text-sm text-primary-theme font-medium">{error}</p>
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            className="mt-3 rounded-xl border border-subtle px-4 py-2 text-sm font-medium text-primary-theme hover:bg-page"
          >
            {t.analytics.retry}
          </button>
        </section>
      )}

      {!loading && summary && isEmptySummary(summary) && (
        <section className="custom-card p-6 md:p-8 rounded-2xl border border-subtle bg-subtle/30" role="status">
          <div className="max-w-2xl mx-auto text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-accent-pill text-accent-ghost flex items-center justify-center">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-primary-theme">{t.analytics.emptyTitle}</h2>
            <p className="text-sm text-secondary-theme leading-relaxed">{t.analytics.emptyBody}</p>
          </div>
        </section>
      )}

      {!loading && summary && !isEmptySummary(summary) && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.key} className="custom-card p-4 md:p-5 rounded-2xl border border-subtle bg-page">
                  <div className="flex items-center gap-2 text-secondary-theme">
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{card.label}</span>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-primary-theme">{card.value}</p>
                </div>
              );
            })}
          </section>

          <section className="custom-card p-4 md:p-5 rounded-2xl border border-subtle bg-subtle/30">
            <p className="text-xs text-secondary-theme">
              {t.analytics.lastPublished}:{' '}
              <span className="text-primary-theme font-medium">
                {formatTimestamp(summary.lastPublishedAt, locale, t.analytics.neverPublished)}
              </span>
            </p>
          </section>
        </>
      )}

      {!loading && summary && !summary.pinterestMetrics.available && (
        <section className="custom-card p-4 md:p-5 rounded-2xl border border-subtle bg-subtle/20" role="note">
          <p className="text-xs text-secondary-theme leading-relaxed">
            {t.analytics.pinterestMetricsUnavailable}
          </p>
        </section>
      )}
    </div>
  );
};
