import React from 'react';
import { useI18n } from '../../i18n/i18nContext';
import { resolveLegalLanguage } from '../../utils/legalLanguage';
import { renderMarkdown } from '../../pages/LegalPage';
import policyRu from '../../legal/privacy-policy.ru.md?raw';
import policyEn from '../../legal/privacy-policy.en.md?raw';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  const { language, t } = useI18n();
  const isRussian = resolveLegalLanguage(language) === 'ru';
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-subtle bg-surface p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary-theme">{t.terms.privacyPolicyTitle}</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-secondary-theme hover:text-primary-theme"
            aria-label={t.terms.closeLabel}
          >
            ✕
          </button>
        </div>
        {renderMarkdown(isRussian ? policyRu : policyEn)}
      </div>
    </div>
  );
};
