import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Check,
  X,
  ArrowLeft,
  ArrowRight,
  Layers,
  Clock,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { ScheduledPinItem } from '../../data/mockData';

export interface PendingReviewPin {
  id: string;
  title: string;
  description: string;
  boardName: string;
  boardId: string;
  imageUrl: string;
  aspectRatio: string;
  reason: string;
  trendMetric: string;
  scheduledTime: string;
  destinationUrl: string;
  suggestedNewBoard?: string;
}

interface SwipeReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprovePin: (pin: ScheduledPinItem) => void;
}

const INITIAL_REVIEW_PINS: PendingReviewPin[] = [
  {
    id: 'rev-1',
    title: 'Сочные куриные грудки в духовке: 3 секрета шефа',
    description: 'Идеальный рецепт мягкой куриной грудки с травами и чесночным маслом. Сохраняйте пин, чтобы приготовить идеальный быстрый ужин! #рецепты #курица #ужин #кулинария',
    boardName: 'Рецепты и кулинарные ритуалы',
    boardId: 'b-2',
    imageUrl: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
    aspectRatio: '2:3',
    reason: 'Поисковый интерес к "рецепты курочки в духовке" вырос на 38% за 7 дней. Конкуренты фиксируют +42,000 сохранений на схожих пинах.',
    trendMetric: '+38% рост поисковых сохранений',
    scheduledTime: '20:30',
    destinationUrl: 'https://pinsprig.com/recipes/baked-chicken-secrets',
  },
  {
    id: 'rev-2',
    title: 'Скандинавская гостиная: 7 правил теплого минимализма',
    description: 'Как создать уютное и просторное пространство без визуального шума. Практические советы по выбору текстиля и мягкого освещения. #интерьер #гостиная #дизайн #сканди',
    boardName: 'Скандинавский интерьер и уютный дом',
    boardId: 'b-1',
    imageUrl: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    aspectRatio: '3:4',
    reason: 'Твоя доска по скандинавскому интерьеру имеет 94% SEO-балл. Свежий пин позволит удержать 1-ю страницу в поиске Pinterest.',
    trendMetric: 'Удержание топ-1 в категории',
    scheduledTime: '21:15',
    destinationUrl: 'https://pinsprig.com/blog/warm-minimalist-living',
  },
  {
    id: 'rev-3',
    title: 'Утренний уход: восстановление барьера и стеклянная кожа',
    description: 'Пошаговый утренний протокол нанесения сывороток и крема для сияния без жирного блеска. Сохраняйте чек-лист! #уходзакожей #красота #бьюти #косметика',
    boardName: 'Чистая красота и роскошный уход',
    boardId: 'b-3',
    imageUrl: '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
    aspectRatio: '9:16',
    reason: 'Запрос "уход за барьером кожи" вошел в топ-3 трендов недели. Формат 9:16 Idea Pin привлекает в 2.4 раза больше сохранений.',
    trendMetric: '+51% кликабельность формата 9:16',
    scheduledTime: '19:45',
    destinationUrl: 'https://pinsprig.com/beauty/barrier-repair-morning',
  },
  {
    id: 'rev-4',
    title: 'Амальфитанское побережье: 5 скрытых видовых точек Позитано',
    description: 'Маршрут по уединенным террасам и видам на море без толп туристов. Полная карта в статье по ссылке! #путешествия #италия #позитано #отпуск',
    boardName: 'Европейские побеги и эстетика путешествий',
    boardId: 'b-4',
    imageUrl: '/src/assets/images/pin_travel_amalfi_1790670078173.jpg',
    aspectRatio: '2:3',
    reason: 'Сезонный пик запросов на летние путешествия по Италии. Рекомендуем выложить пин в вечерний прайм-тайм.',
    trendMetric: 'Сезонный всплеск спроса',
    scheduledTime: '20:15',
    destinationUrl: 'https://pinsprig.com/travel/amalfi-secret-viewpoints',
  },
  {
    id: 'rev-5',
    title: 'Осенние тыквенные супы: 3 кремовых рецепта за 20 минут',
    description: 'Нежный суп-пюре с имбирем и кокосовыми сливками. Идеальный рецепт для холодных осенних вечеров. #супы #осень #рецепты #еда',
    boardName: 'Рецепты и кулинарные ритуалы',
    boardId: 'b-2',
    imageUrl: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
    aspectRatio: '2:3',
    reason: 'Новый тренд "осенние крем-супы" (+44% запросов). Рекомендуем создать отдельную доску "Уютные осенние супы".',
    trendMetric: 'Новая ниша: +44% прирост',
    scheduledTime: '21:00',
    destinationUrl: 'https://pinsprig.com/recipes/pumpkin-cream-soup',
    suggestedNewBoard: 'Уютные осенние супы',
  },
];

export const SwipeReviewModal: React.FC<SwipeReviewModalProps> = ({
  isOpen,
  onClose,
  onApprovePin,
}) => {
  const { t, formatDate } = useI18n();

  const [pins, setPins] = useState<PendingReviewPin[]>(INITIAL_REVIEW_PINS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [animatingDirection, setAnimatingDirection] = useState<'left' | 'right' | null>(null);

  // Keyboard navigation support
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        handleApprove();
      } else if (e.key === 'ArrowLeft') {
        handleReject();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, pins]);

  if (!isOpen) return null;

  const currentPin = pins[currentIndex];
  const isFinished = currentIndex >= pins.length;

  const handleApprove = () => {
    if (!currentPin) return;

    setAnimatingDirection('right');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const approvedScheduledPin: ScheduledPinItem = {
      id: `sched-rev-${Date.now()}-${currentPin.id}`,
      title: currentPin.title,
      boardId: currentPin.boardId,
      boardName: currentPin.boardName,
      imageUrl: currentPin.imageUrl,
      scheduledDate: tomorrow.toISOString().split('T')[0],
      scheduledTime: currentPin.scheduledTime,
      status: 'scheduled',
      isOptimalSlot: true,
      destinationUrl: currentPin.destinationUrl,
    };

    onApprovePin(approvedScheduledPin);
    setApprovedCount((prev) => prev + 1);

    setTimeout(() => {
      setAnimatingDirection(null);
      setCurrentIndex((prev) => prev + 1);
    }, 200);
  };

  const handleReject = () => {
    if (!currentPin) return;

    setAnimatingDirection('left');
    setRejectedCount((prev) => prev + 1);

    setTimeout(() => {
      setAnimatingDirection(null);
      setCurrentIndex((prev) => prev + 1);
    }, 200);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="custom-card max-w-xl w-full p-5 md:p-6 rounded-3xl shadow-2xl relative space-y-4 max-h-[95vh] overflow-y-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-subtle pb-3">
          <div>
            <h2 className="text-lg font-bold text-primary-theme font-heading flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent-ghost" />
              <span>{t.review.title}</span>
            </h2>
            <p className="text-xs text-muted-theme mt-0.5">
              {t.review.subtitle}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-secondary-theme hover:bg-subtle cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Counter & Progress */}
        {!isFinished && (
          <div className="flex items-center justify-between text-xs text-secondary-theme">
            <span className="font-semibold font-mono">
              Пин {currentIndex + 1} из {pins.length}
            </span>
            <div className="flex items-center gap-3 font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> {approvedCount} одобрено
              </span>
              <span className="text-rose-500 flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> {rejectedCount} отклонено
              </span>
            </div>
          </div>
        )}

        {/* Swipe Card Content */}
        {!isFinished && currentPin ? (
          <div
            className={`space-y-4 transition-transform duration-200 ${
              animatingDirection === 'right'
                ? 'translate-x-12 opacity-0 rotate-3'
                : animatingDirection === 'left'
                ? '-translate-x-12 opacity-0 -rotate-3'
                : 'translate-x-0 opacity-100'
            }`}
          >
            {/* Visual Pin Card Mockup */}
            <div className="p-3.5 rounded-2xl border border-subtle bg-subtle flex gap-4 items-start">
              <img
                src={currentPin.imageUrl}
                alt={currentPin.title}
                referrerPolicy="no-referrer"
                className="w-24 md:w-32 aspect-[2/3] object-cover rounded-xl border border-subtle shrink-0 shadow-md"
              />

              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent-pill">
                    Формат: {currentPin.aspectRatio}
                  </span>
                  <span className="text-[10px] font-mono text-muted-theme">
                    {currentPin.scheduledTime}
                  </span>
                </div>

                <h3 className="text-sm md:text-base font-bold text-primary-theme leading-snug font-heading">
                  {currentPin.title}
                </h3>

                <p className="text-xs text-secondary-theme line-clamp-3 leading-relaxed">
                  {currentPin.description}
                </p>

                <div className="pt-1 flex items-center gap-1.5 text-xs text-muted-theme">
                  <Layers className="w-3.5 h-3.5 text-accent-ghost" />
                  <span className="truncate">{currentPin.boardName}</span>
                </div>
              </div>
            </div>

            {/* AI Explanation of Why this Pin was Generated */}
            <div className="p-3.5 rounded-xl border border-accent/25 bg-accent-light space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary-theme flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent-ghost" />
                  <span>{t.review.reasonTitle}</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface text-emerald-600 dark:text-emerald-400 border border-subtle">
                  {currentPin.trendMetric}
                </span>
              </div>
              <p className="text-xs text-secondary-theme leading-relaxed">
                {currentPin.reason}
              </p>

              {currentPin.suggestedNewBoard && (
                <div className="mt-2 pt-2 border-t border-accent/20 flex items-center justify-between text-xs">
                  <span className="text-primary-theme font-semibold">
                    ИИ рекомендует создать доску: «{currentPin.suggestedNewBoard}»
                  </span>
                </div>
              )}
            </div>

            {/* Swipe Buttons (Large click targets & arrows) */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={handleReject}
                className="py-3 px-4 rounded-xl border border-subtle bg-surface hover:bg-rose-500/10 hover:text-rose-600 text-secondary-theme text-xs md:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <ThumbsDown className="w-4 h-4 text-rose-500" />
                <span>{t.review.rejectBtn}</span>
              </button>

              <button
                type="button"
                onClick={handleApprove}
                className="accent-btn py-3 px-4 rounded-xl text-xs md:text-sm font-semibold flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-95"
              >
                <ThumbsUp className="w-4 h-4" />
                <span>{t.review.approveBtn}</span>
              </button>
            </div>

            {/* Keyboard shortcut hint */}
            <p className="text-[11px] text-center text-muted-theme pt-1">
              {t.review.keyboardTip}
            </p>
          </div>
        ) : (
          /* Finished State */
          <div className="py-8 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-full accent-btn flex items-center justify-center mx-auto shadow-md">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-primary-theme font-heading">
                {t.review.allReviewed}
              </h3>
              <p className="text-xs md:text-sm text-secondary-theme mt-1 max-w-sm mx-auto">
                {t.review.allReviewedDesc}
              </p>
            </div>

            <div className="p-3 max-w-xs mx-auto rounded-xl bg-subtle border border-subtle text-xs font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold block">
                {approvedCount} пинов запланировано
              </span>
              <span className="text-muted-theme block mt-0.5">
                {rejectedCount} отклонено
              </span>
            </div>

            <button
              onClick={onClose}
              className="accent-btn px-6 py-2.5 rounded-xl text-xs md:text-sm font-semibold cursor-pointer shadow-xs"
            >
              {t.review.finishBtn}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
