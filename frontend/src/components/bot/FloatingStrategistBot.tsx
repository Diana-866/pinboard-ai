import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  X,
  Minimize2,
  Sparkles,
  Bot,
  Send,
  RotateCcw,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  HelpCircle,
  BarChart2,
  CheckCircle2,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';

interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
  action?: {
    label: string;
    tab: string;
  };
}

interface FloatingStrategistBotProps {
  onNavigateTab: (tab: string) => void;
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

export const FloatingStrategistBot: React.FC<FloatingStrategistBotProps> = ({
  onNavigateTab,
  isOpen: controlledIsOpen,
  onToggleOpen,
}) => {
  const { t } = useI18n();
  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (onToggleOpen) {
      if (open !== isOpen) onToggleOpen();
    } else {
      setInternalIsOpen(open);
    }
  };

  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const initialMessages: Message[] = [
    {
      id: 'msg-welcome',
      sender: 'bot',
      text: t.bot.welcomeMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ];

  const [messages, setMessages] = useState<Message[]>(initialMessages);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setHasUnread(false);
    }
  }, [isOpen, messages, isTyping]);

  const quickQuestions = [
    { q: t.bot.quickQuestion1, actionTab: 'analytics' },
    { q: t.bot.quickQuestion2, actionTab: 'calendar' },
    { q: t.bot.quickQuestion3, actionTab: 'generator' },
    { q: t.bot.quickQuestion4, actionTab: 'boards' },
    { q: t.bot.quickQuestion5, actionTab: 'keywords' },
  ];

  const handleSelectQuickQuestion = (question: string, actionTab?: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      { id: `usr-${Date.now()}`, sender: 'user', text: question, timestamp },
      {
        id: `bot-${Date.now()}-notice`,
        sender: 'bot',
        text: t.bot.demoReply,
        timestamp,
        action: actionTab
          ? {
              label: t.bot.openSection,
              tab: actionTab,
            }
          : undefined,
      },
    ]);
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputMessage.trim();
    if (!query) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const lower = query.toLowerCase();
    let targetTab: string | undefined;

    if (lower.includes('доск') || lower.includes('board') || lower.includes('seo')) {
      targetTab = 'boards';
    } else if (lower.includes('время') || lower.includes('час') || lower.includes('когда') || lower.includes('time') || lower.includes('schedule')) {
      targetTab = 'calendar';
    } else if (lower.includes('генерац') || lower.includes('пин') || lower.includes('созда') || lower.includes('generate')) {
      targetTab = 'generator';
    } else if (lower.includes('конкурент') || lower.includes('competitor')) {
      targetTab = 'competitors';
    }

    setMessages((prev) => [
      ...prev,
      { id: `usr-${Date.now()}`, sender: 'user', text: query, timestamp },
    ]);
    setInputMessage('');
    setIsTyping(true);

    window.setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: t.bot.demoReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          action: targetTab
            ? { label: t.bot.openSection, tab: targetTab }
            : undefined,
        },
      ]);
    }, 250);
  };

  const handleResetChat = () => {
    setMessages(initialMessages);
  };

  const [isDocked, setIsDocked] = useState<boolean>(false);

  return (
    <>
      {/* Floating Launcher Button (Bottom Right - Distinct AI Copilot Orb with Edge Docking) */}
      <div className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 z-40 select-none">
        {!isOpen && !isDocked && (
          <div className="relative group flex items-center">
            {/* Quick minimize-to-edge tab for tablets/mobile */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsDocked(true);
              }}
              className="hidden group-hover:flex sm:flex mr-1 p-1 rounded-full bg-surface border border-subtle text-muted-theme hover:text-primary-theme transition-all shadow-xs cursor-pointer opacity-70 hover:opacity-100"
              title="Припарковать бота к краю экрана"
            >
              <ArrowRight className="w-3 h-3" />
            </button>

            {/* Main AI Copilot Launcher Button - Solid theme accent color (no gradient) */}
            <button
              onClick={() => setIsOpen(true)}
              className="relative w-11 h-11 sm:w-13 sm:h-13 rounded-2xl accent-btn shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer border border-subtle group-hover:opacity-95"
              aria-label={t.bot.floatingButton}
              title={t.bot.floatingButton}
            >
              <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-inherit drop-shadow-xs" />

              {/* Amber indicator: this is a demo, not a live AI connection. */}
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-amber-500 rounded-full border-2 border-surface shadow-xs" />

              {/* Unread Indicator Badge */}
              {hasUnread && (
                <span className="absolute -bottom-1 -left-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-surface text-primary-theme font-mono shadow-xs border border-subtle">
                  AI
                </span>
              )}
            </button>

            {/* Desktop Tooltip on Hover */}
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-1.5 rounded-xl bg-surface border border-subtle shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap hidden sm:flex items-center gap-1.5">
              <span className="text-xs font-bold text-primary-theme font-heading">
                {t.bot.title}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            </div>
          </div>
        )}

        {/* Minimalist Docked Edge Tab - Solid theme color (no gradient) */}
        {!isOpen && isDocked && (
          <button
            type="button"
            onClick={() => setIsDocked(false)}
            className="flex items-center gap-1.5 py-2 px-3 rounded-l-2xl accent-btn text-xs font-semibold shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer border-l-2 border-t border-b border-subtle"
            title="Развернуть ИИ-стратега"
          >
            <Bot className="w-3.5 h-3.5 text-inherit" />
            <span className="hidden sm:inline">ИИ-Стратег</span>
          </button>
        )}
      </div>

      {/* Floating Chat Window */}
      {isOpen && (
        <div className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 w-[calc(100vw-1.5rem)] sm:w-[420px] h-[580px] max-h-[82vh] z-50 flex flex-col custom-card shadow-2xl rounded-3xl overflow-hidden border border-strong animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3.5 sm:p-4 border-b border-subtle bg-surface flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-9 h-9 rounded-xl accent-btn flex items-center justify-center shrink-0 shadow-xs">
                <Bot className="w-4 h-4 text-inherit" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-surface" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-primary-theme font-heading truncate leading-tight">
                  {t.bot.title}
                </h3>
                <p className="text-[11px] text-muted-theme truncate leading-tight">
                  {t.bot.subtitle}
                </p>
                <span className="inline-flex mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  {t.bot.statusBadge}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleResetChat}
                className="p-1.5 rounded-lg text-muted-theme hover:text-primary-theme hover:bg-subtle transition-colors cursor-pointer"
                title={t.bot.clearChat}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-muted-theme hover:text-primary-theme hover:bg-subtle transition-colors cursor-pointer"
                title={t.common.close}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Peak Load Notice Ribbon */}
          <div className="px-3.5 py-2 bg-subtle border-b border-subtle flex items-start gap-2 text-[11px] text-secondary-theme leading-tight shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-accent-ghost shrink-0 mt-0.5" />
            <span className="line-clamp-2">
              {t.bot.disclaimerPeak}
            </span>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs bg-page/50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`p-3.5 rounded-2xl max-w-[88%] leading-relaxed ${
                    msg.sender === 'user'
                      ? 'accent-btn text-white rounded-br-xs shadow-xs'
                      : 'bg-surface border border-subtle text-primary-theme rounded-bl-xs shadow-xs'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* Context Action Button inside Bot Message */}
                  {msg.action && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab(msg.action!.tab);
                        setIsOpen(false);
                      }}
                      className="mt-2.5 w-full py-1.5 px-3 rounded-lg text-xs font-semibold border border-subtle bg-subtle hover:bg-surface text-primary-theme flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>{msg.action.label}</span>
                      <ArrowRight className="w-3 h-3 text-accent-ghost" />
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-muted-theme font-mono mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex items-center gap-1.5 p-3 rounded-2xl bg-surface border border-subtle w-24 text-secondary-theme">
                <span className="w-2 h-2 rounded-full bg-accent animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-accent animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-accent animate-bounce [animation-delay:0.4s]" />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Pre-configured Quick Questions Chips */}
          <div className="px-3.5 py-2.5 border-t border-subtle bg-surface shrink-0 space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-theme flex items-center gap-1">
              <HelpCircle className="w-3 h-3 text-accent-ghost" />
              <span>{t.bot.suggestedTitle}</span>
            </span>

            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {quickQuestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectQuickQuestion(item.q, item.actionTab)}
                  className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg border border-subtle bg-subtle hover:border-strong text-primary-theme transition-all cursor-pointer whitespace-nowrap active:scale-95"
                >
                  {item.q}
                </button>
              ))}
            </div>
          </div>

          {/* Text Input Footer */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 border-t border-subtle bg-surface flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={t.bot.placeholder}
              className="flex-1 px-3 py-2 text-xs bg-app-input border border-subtle rounded-xl text-primary-theme placeholder:text-muted-theme focus:outline-none focus:border-accent"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="p-2 rounded-xl accent-btn disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shadow-xs"
              title={t.bot.send}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
