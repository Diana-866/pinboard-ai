import React, { useEffect, useState } from 'react';
import { Mail, RefreshCw, Send, ChevronLeft } from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface MailItem {
  uid: number;
  from: string;
  subject: string;
  date: string | null;
  seen: boolean;
}

/** Вкладка «Почта» в админке: входящие support@pinposy.com + ответ прямо из панели.
 *  Работает при заданных MAIL_* переменных на бэкенде (см. docs/email-setup.md). */
export const AdminMail: React.FC = () => {
  const [messages, setMessages] = useState<MailItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<MailItem | null>(null);
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest('/admin/mail?limit=30');
      setMessages(data.messages || []);
    } catch (e: any) {
      setError(e.message || 'Не удалось загрузить почту');
    } finally {
      setLoading(false);
    }
  }

  async function openMessage(m: MailItem) {
    setSelected(m);
    setBody('');
    setReply('');
    setSentOk('');
    try {
      const data = await apiRequest(`/admin/mail/${m.uid}`);
      setBody(data.body || '(пусто)');
    } catch (e: any) {
      setBody(`Не удалось прочитать письмо: ${e.message}`);
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    setSentOk('');
    try {
      const addr = selected.from.match(/<([^>]+)>/)?.[1] || selected.from;
      await apiRequest('/admin/mail/reply', {
        method: 'POST',
        body: JSON.stringify({ to: addr, subject: selected.subject, text: reply }),
      });
      setSentOk('Ответ отправлен ✓');
      setReply('');
    } catch (e: any) {
      setSentOk(`Ошибка: ${e.message}`);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-primary-theme font-heading">Почта поддержки</h2>
          <p className="text-xs text-secondary-theme mt-0.5">
            Входящие на support@pinposy.com и ответы пользователям
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-subtle text-xs font-semibold text-secondary-theme hover:text-primary-theme disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
          {error}
          <p className="mt-1 text-[11px] opacity-80">
            Нужно задать MAIL_IMAP_HOST / MAIL_USER / MAIL_PASS / MAIL_SMTP_HOST на Render — инструкция в
            docs/email-setup.md.
          </p>
        </div>
      )}

      {!selected ? (
        <div className="rounded-2xl border border-subtle bg-surface divide-y divide-subtle overflow-hidden">
          {messages.length === 0 && !loading && !error && (
            <p className="p-6 text-xs text-secondary-theme text-center">Писел пока нет</p>
          )}
          {messages.map((m) => (
            <button
              key={m.uid}
              onClick={() => openMessage(m)}
              className="w-full text-left px-4 py-3 hover:bg-subtle/50 transition-colors flex items-start gap-3"
            >
              <Mail className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-primary-theme truncate">
                  {m.seen ? '' : '● '}
                  {m.subject}
                </span>
                <span className="block text-[11px] text-secondary-theme truncate">{m.from}</span>
              </span>
              <span className="text-[10px] text-muted-theme shrink-0">
                {m.date ? new Date(m.date).toLocaleDateString() : ''}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5 space-y-3">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-secondary-theme hover:text-primary-theme"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Ко всем письмам
          </button>
          <h3 className="text-sm font-bold text-primary-theme">{selected.subject}</h3>
          <p className="text-[11px] text-secondary-theme">{selected.from}</p>
          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-subtle bg-page p-3.5 text-[11px] leading-relaxed text-secondary-theme font-sans">
            {body}
          </pre>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Текст ответа пользователю…"
            rows={5}
            className="w-full rounded-xl border border-subtle bg-page px-3.5 py-3 text-xs text-primary-theme outline-none focus:border-accent"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-xs font-bold disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? 'Отправляем…' : 'Ответить'}
            </button>
            {sentOk && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{sentOk}</span>}
          </div>
        </div>
      )}
    </div>
  );
};
