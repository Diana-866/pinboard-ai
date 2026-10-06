import React, { useState } from 'react';
import {
  ShieldCheck,
  X,
  Download,
  Copy,
  Check,
  Search,
  ExternalLink,
  FileText,
  Globe,
} from 'lucide-react';
import { PRIVACY_POLICY_TEXT } from '../../data/privacyPolicy';
import { useI18n } from '../../i18n/i18nContext';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { language } = useI18n();
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(PRIVACY_POLICY_TEXT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([PRIVACY_POLICY_TEXT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'PinSprig_Privacy_Policy.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-surface border border-strong rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-subtle bg-surface flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-accent-light text-accent flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-primary-theme font-heading truncate leading-tight">
                Privacy Policy & Data Protection
              </h2>
              <p className="text-xs text-muted-theme flex items-center gap-1.5 mt-0.5">
                <Globe className="w-3.5 h-3.5 text-accent-ghost" />
                <span>GDPR & Pinterest Compliant (English Master)</span>
                <span className="text-muted-theme/60">·</span>
                <span className="font-mono text-[11px] text-accent-ghost">/src/data/privacyPolicy.txt</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="p-2 rounded-xl border border-subtle hover:bg-subtle text-secondary-theme hover:text-primary-theme transition-colors cursor-pointer text-xs flex items-center gap-1.5"
              title="Copy text"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="p-2 rounded-xl border border-subtle hover:bg-subtle text-secondary-theme hover:text-primary-theme transition-colors cursor-pointer text-xs flex items-center gap-1.5"
              title="Download .txt"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">.txt</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-muted-theme hover:text-primary-theme hover:bg-subtle transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notice Banner */}
        <div className="px-4 py-2.5 bg-subtle border-b border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-secondary-theme shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent-ghost shrink-0" />
            <span>
              Политику конфиденциальности можно изменить в текстовом файле: <code className="font-mono font-bold text-primary-theme bg-surface px-1.5 py-0.5 rounded border border-subtle">src/data/privacyPolicy.txt</code>
            </span>
          </div>
          <span className="text-[11px] text-muted-theme font-mono shrink-0">
            Текущий язык пользователя: <b className="uppercase">{language}</b>
          </span>
        </div>

        {/* Content Body with Markdown-styled document */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 text-xs sm:text-sm text-secondary-theme leading-relaxed bg-page/40 font-sans space-y-4">
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-sans">
            {PRIVACY_POLICY_TEXT}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-subtle bg-surface flex items-center justify-between shrink-0 text-xs">
          <span className="text-muted-theme">
            Версия: 2026.1 · Последнее обновление: 4 октября 2026 г.
          </span>
          <button
            onClick={onClose}
            className="accent-btn px-5 py-2 rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
          >
            Понятно / Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
