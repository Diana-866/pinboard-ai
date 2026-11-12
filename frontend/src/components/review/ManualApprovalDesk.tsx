import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Check,
  X,
  ArrowLeft,
  ArrowRight,
  Layers,
  Clock,
  Calendar,
  AlertCircle,
  Edit3,
  RefreshCw,
  Sliders,
  CheckCircle2,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Eye,
  Info,
  CornerDownRight,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { BoardItem, ScheduledPinItem } from '../../data/mockData';
import { apiRequest } from '../../lib/api';
import { applyCurrentReviewEdits } from '../../utils/reviewApproval';
import { createGenerationIdempotencyKey } from '../../utils/generationRetry';

export interface PendingReviewPin {
  id: string;
  /** ID of a real pin already persisted by the backend. Demo queue entries do not have one. */
  pinId?: string;
  /** Current persisted pin state, refreshed by GET /review-queue. */
  pinStatus?: string;
  title: string;
  description: string;
  boardName: string;
  boardId: string;
  imageUrl: string;
  aspectRatio: string;
  reason: string;
  trendMetric: string;
  scheduledTime: string;
  scheduledDate: string;
  destinationUrl: string;
  accountHandle?: string;
  accountId?: string;
}

export interface ManualApprovalDeskProps {
  boards: BoardItem[];
  pendingPins?: PendingReviewPin[];
  queueLoading?: boolean;
  queueLoadError?: boolean;
  onRetryQueueLoad?: () => void;
  onUpdatePendingPins?: (updater: (prev: PendingReviewPin[]) => PendingReviewPin[]) => void | Promise<void>;
  onApprovePin: (pin: ScheduledPinItem) => void;
  onGoToCalendar?: () => void;
  onGoToDashboard?: () => void;
}

export const INITIAL_QUEUE_PINS: PendingReviewPin[] = [
  {
    id: 'rev-1',
    title: '7 правил теплого минимализма в скандинавской гостиной',
    description: 'Как создать уютное и просторное пространство без визуального шума. Практические советы по выбору текстиля, деревянных текстур и мягкого рассеянного света. #сканди #гостиная #минимализм #интерьер',
    boardName: 'Scandinavian Living & Cozy Interiors',
    boardId: 'b-1',
    imageUrl: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    aspectRatio: '2:3',
    reason: 'Запрос "теплый сканди минимализм" вырос на 42% в категории Home Decor. Ваша доска удерживает топ-1 по охватам.',
    trendMetric: '+42% рост поискового спроса',
    scheduledDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    scheduledTime: '20:15',
    destinationUrl: 'https://pinposy.com/blog/warm-minimalist-living',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-2',
    title: 'Матча латте на овсяном молоке: 3 секрета идеальной пенки',
    description: 'Пошаговый рецепт густой сливочной пенки дома за 3 минуты. Правильная температура воды и взбивание бамбуковым венчиком. #матча #латте #рецепты #напитки',
    boardName: 'Artisanal Drinks & Matcha Rituals',
    boardId: 'b-2',
    imageUrl: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
    aspectRatio: '2:3',
    reason: 'Аудитория активно ищет "как взбить матча без комков" в утренние часы. Конкуренты фиксируют CTR 7.8% на этом формате.',
    trendMetric: '+38% сохранений в категории напитков',
    scheduledDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    scheduledTime: '21:30',
    destinationUrl: 'https://pinposy.com/recipes/iced-matcha-cloud',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-3',
    title: 'Утренний протокол: восстановление барьера кожи и стеклянное сияние',
    description: 'Чек-лист нанесения сыворотки с церамидами и увлажняющего крема. Никакого шелушения и жирного блеска под макияжем. #уходзакожей #бьюти #косметика #стекляннаякожа',
    boardName: 'Clean Skincare & Luxury Shelfies',
    boardId: 'b-3',
    imageUrl: '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
    aspectRatio: '9:16',
    reason: 'Тема барьера кожи входит в топ-3 мировых трендов красоты Pinterest. Формат 9:16 получает в 2.4 раза больше показов.',
    trendMetric: '+51% охват в Smart Feed',
    scheduledDate: new Date(Date.now() + 172800000).toISOString().split('T')[0],
    scheduledTime: '19:45',
    destinationUrl: 'https://pinposy.com/skincare/am-barrier-repair',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-4',
    title: 'Амальфитанское побережье: 5 скрытых видовых террас в Позитано',
    description: 'Локации для фото на закате без очередей и толп туристов. Сохраняйте в закладки для идеального путешествия по Италии! #амальфи #италия #путешествия #позитано',
    boardName: 'European Escapes & Amalfi Dreamscapes',
    boardId: 'b-4',
    imageUrl: '/src/assets/images/pin_travel_amalfi_1790670078173.jpg',
    aspectRatio: '2:3',
    reason: 'Сезонный пик планирования отпусков в Южной Европе. Лучшее время для публикации — вечерний прайм-тайм.',
    trendMetric: 'Высокий сезонный интерес',
    scheduledDate: new Date(Date.now() + 172800000).toISOString().split('T')[0],
    scheduledTime: '20:30',
    destinationUrl: 'https://pinposy.com/travel/amalfi-secret-viewpoints',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-5',
    title: 'Организация гардеробной в стиле Japandi: порядок навсегда',
    description: 'Система хранения вещей из натурального ротанга и светлого дуба. Как избавиться от хаоса за 1 выходной день. #гардероб #хранение #порядок #интерьер',
    boardName: 'Scandinavian Living & Cozy Interiors',
    boardId: 'b-1',
    imageUrl: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    aspectRatio: '2:3',
    reason: 'Пользователи активно ищут японский минимализм в организации пространства.',
    trendMetric: '+29% виральность тем порядка',
    scheduledDate: new Date(Date.now() + 259200000).toISOString().split('T')[0],
    scheduledTime: '21:00',
    destinationUrl: 'https://pinposy.com/blog/japandi-closet-storage',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-6',
    title: 'Айс-матча с кокосовыми сливками: рецепт трендового напитка',
    description: 'Освежающий слоистый айс-латте с нежной кокосовой пеной и органической церемониальной матча. #айсматча #напитки #рецепты #эстетика',
    boardName: 'Artisanal Drinks & Matcha Rituals',
    boardId: 'b-2',
    imageUrl: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
    aspectRatio: '9:16',
    reason: 'Формат слоистых напитков набирает на 64% больше сохранений в Pinterest видео и каруселях.',
    trendMetric: '+64% сохранения в категории напитков',
    scheduledDate: new Date(Date.now() + 259200000).toISOString().split('T')[0],
    scheduledTime: '15:30',
    destinationUrl: 'https://pinposy.com/recipes/coconut-cloud-matcha',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-7',
    title: 'Керамика ручной работы в интерьере: эстетика несовершенства Wabi-Sabi',
    description: 'Как фактурные вазы и посуда ручной лепки преображают минималистичные полки и журнальные столики. #керамика #вабисаби #декор #уют',
    boardName: 'Scandinavian Living & Cozy Interiors',
    boardId: 'b-1',
    imageUrl: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    aspectRatio: '2:3',
    reason: 'Запрос "wabi sabi pottery aesthetic" вырос на 47% за последние 30 дней.',
    trendMetric: '+47% рост спроса в декоре',
    scheduledDate: new Date(Date.now() + 345600000).toISOString().split('T')[0],
    scheduledTime: '18:15',
    destinationUrl: 'https://pinposy.com/decor/wabi-sabi-ceramics',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-8',
    title: 'Вечерний уход за кожей: пептиды, ретинол и восстанавливающий крем',
    description: 'Пошаговый ритуал ночного обновления без раздражения. Сочетание активных ингредиентов для упругости кожи. #ночнойуход #ретинол #пептиды #красота',
    boardName: 'Clean Skincare & Luxury Shelfies',
    boardId: 'b-3',
    imageUrl: '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
    aspectRatio: '2:3',
    reason: 'Аудитория ищет безопасные схемы ввода ретинола в осенне-зимний период.',
    trendMetric: '+36% вовлеченность аудитории',
    scheduledDate: new Date(Date.now() + 345600000).toISOString().split('T')[0],
    scheduledTime: '21:45',
    destinationUrl: 'https://pinposy.com/skincare/pm-retinol-routine',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-9',
    title: 'Капри и Анакапри: однодневный маршрут на винтажном кабриолете',
    description: 'Голубой грот, сады Августа и тайные смотровые площадки с видом на скалы Фаральони. #капри #италия #путешествия #европа',
    boardName: 'European Escapes & Amalfi Dreamscapes',
    boardId: 'b-4',
    imageUrl: '/src/assets/images/pin_travel_amalfi_1790670078173.jpg',
    aspectRatio: '2:3',
    reason: 'Маршруты по островам Италии показывают высокий CTR в сегменте travel.',
    trendMetric: '+55% кликабельность пинов',
    scheduledDate: new Date(Date.now() + 432000000).toISOString().split('T')[0],
    scheduledTime: '14:20',
    destinationUrl: 'https://pinposy.com/travel/capri-day-guide',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-10',
    title: 'Световые сценарии для спальни: теплый свет 2700К и бра',
    description: 'Гид по расстановке торшеров, скрытой подсветки кровати и акцентных светильников для глубокого релакса. #освещение #спальня #скандиинтерьер #уют',
    boardName: 'Scandinavian Living & Cozy Interiors',
    boardId: 'b-1',
    imageUrl: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    aspectRatio: '2:3',
    reason: 'Сезонное повышение интереса к уюту и освещению спальни в осенний период.',
    trendMetric: '+40% сезонный тренд',
    scheduledDate: new Date(Date.now() + 432000000).toISOString().split('T')[0],
    scheduledTime: '20:45',
    destinationUrl: 'https://pinposy.com/decor/bedroom-lighting-guide',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-11',
    title: 'Холодный чай матча с юдзу и мятой: японский домашний лимонад',
    description: 'Бодрящий безалкогольный коктейль с цитрусовым соком юдзу, свежей мятой и газированной водой. #юдзу #матча #лимонад #рецепты',
    boardName: 'Artisanal Drinks & Matcha Rituals',
    boardId: 'b-2',
    imageUrl: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
    aspectRatio: '2:3',
    reason: 'Тренд на безалкогольные авторские напитки растет на 44% год к году.',
    trendMetric: '+44% годовой рост',
    scheduledDate: new Date(Date.now() + 518400000).toISOString().split('T')[0],
    scheduledTime: '13:00',
    destinationUrl: 'https://pinposy.com/recipes/yuzu-matcha-spritz',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-12',
    title: 'Массаж Гуаша для четкого овала лица: техника 5 минут утром',
    description: 'Схема движений по массажным линиям с использованием натурального розового кварца и масла сквалана. #гуаша #массажлица #лимфодренаж #бьюти',
    boardName: 'Clean Skincare & Luxury Shelfies',
    boardId: 'b-3',
    imageUrl: '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
    aspectRatio: '9:16',
    reason: 'Видео-инструкции по массажу лица удерживают среднее время просмотра более 8 секунд.',
    trendMetric: '+58% сохранения в закладки',
    scheduledDate: new Date(Date.now() + 518400000).toISOString().split('T')[0],
    scheduledTime: '09:15',
    destinationUrl: 'https://pinposy.com/skincare/guasha-morning-guide',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-13',
    title: 'Текстиль из натурального льна: постельное белье и шторы',
    description: 'Почему вареный лен идеален для спальни: терморегуляция, тактильный комфорт и естественная легкая помятость. #лен #текстиль #постельноебелье #сканди',
    boardName: 'Scandinavian Living & Cozy Interiors',
    boardId: 'b-1',
    imageUrl: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    aspectRatio: '2:3',
    reason: 'Высокая конверсия по целевым поисковым запросам в нише качественного текстиля.',
    trendMetric: '+31% коммерческий интерес',
    scheduledDate: new Date(Date.now() + 604800000).toISOString().split('T')[0],
    scheduledTime: '19:30',
    destinationUrl: 'https://pinposy.com/decor/washed-linen-bedroom',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-14',
    title: 'Равелло: сады виллы Руфоло над облаками Средиземноморья',
    description: 'Самое романтичное место Амальфитаны: террасы с пиниями и панорама Салернского залива. #равелло #амальфи #вилларуфоло #италия',
    boardName: 'European Escapes & Amalfi Dreamscapes',
    boardId: 'b-4',
    imageUrl: '/src/assets/images/pin_travel_amalfi_1790670078173.jpg',
    aspectRatio: '2:3',
    reason: 'Локация лидирует в подборках «лучшие виды Италии для свадеб и путешествий».',
    trendMetric: '+49% вирусный охват',
    scheduledDate: new Date(Date.now() + 604800000).toISOString().split('T')[0],
    scheduledTime: '17:45',
    destinationUrl: 'https://pinposy.com/travel/ravello-villa-rufolo',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'rev-15',
    title: 'Ароматы для дома: диффузоры с кедром, инжиром и амброй',
    description: 'Как подобрать селективный аромат для прихожей, гостиной и ванной комнаты. Создаем уютную атмосферу с первой секунды. #ароматыдлядома #диффузор #уют #интерьер',
    boardName: 'Scandinavian Living & Cozy Interiors',
    boardId: 'b-1',
    imageUrl: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    aspectRatio: '2:3',
    reason: 'Темы ароматерапии и диффузоров показывают высокий Save Rate в сезон уюта.',
    trendMetric: '+37% рост сохранений',
    scheduledDate: new Date(Date.now() + 691200000).toISOString().split('T')[0],
    scheduledTime: '21:15',
    destinationUrl: 'https://pinposy.com/decor/home-fragrance-rituals',
    accountHandle: '@botanica_nordic',
  },
];

export const ManualApprovalDesk: React.FC<ManualApprovalDeskProps> = ({
  boards,
  pendingPins,
  queueLoading = false,
  queueLoadError = false,
  onRetryQueueLoad,
  onUpdatePendingPins,
  onApprovePin,
  onGoToCalendar,
  onGoToDashboard,
}) => {
  const { t, formatDate } = useI18n();

  const [internalQueue, setInternalQueue] = useState<PendingReviewPin[]>([]);
  const queue = pendingPins ?? internalQueue;

  const updateQueue = (fn: (prev: PendingReviewPin[]) => PendingReviewPin[]) => {
    if (onUpdatePendingPins) return Promise.resolve(onUpdatePendingPins(fn));
    setInternalQueue(fn);
    return Promise.resolve();
  };

  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const totalInitial = Math.max(1, queue.length + approvedCount + rejectedCount);

  // Active pin in focus
  const currentPin = queue[0];

  // Inline editable fields for the current pin
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editBoardId, setEditBoardId] = useState('');
  const [pinterestAccounts, setPinterestAccounts] = useState<Array<{ id: string; username?: string | null }>>([]);
  const [selectedPinterestAccountId, setSelectedPinterestAccountId] = useState('');
  const [pinterestBoards, setPinterestBoards] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedPinterestBoardId, setSelectedPinterestBoardId] = useState('');
  const [pinterestBoardsLoaded, setPinterestBoardsLoaded] = useState(false);
  const [pinterestBoardsError, setPinterestBoardsError] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  // AI re-generate state
  const [showRegenBox, setShowRegenBox] = useState(false);
  const [regenComment, setRegenComment] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenStatusMessage, setRegenStatusMessage] = useState('');
  const regenerationAttemptRef = useRef<{ pinId: string; instruction: string; key: string } | null>(null);

  // Swipe animation states
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDecisionInFlight, setIsDecisionInFlight] = useState(false);
  const [bulkApprovalProgress, setBulkApprovalProgress] = useState<{ completed: number; total: number } | null>(null);
  const decisionInFlightRef = useRef(false);
  const dragStartX = useRef(0);

  useEffect(() => {
    let active = true;
    apiRequest('/integrations/pinterest/status')
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data?.accounts) ? data.accounts : [];
        setPinterestAccounts(rows);
        if (rows.length === 1) setSelectedPinterestAccountId(rows[0].id);
      })
      .catch(() => {
        if (active) setPinterestBoardsError(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setPinterestBoardsError(false);
    if (!selectedPinterestAccountId) {
      setPinterestBoards([]);
      setSelectedPinterestBoardId('');
      setPinterestBoardsLoaded(true);
      return () => { active = false; };
    }
    setPinterestBoardsLoaded(false);
    apiRequest(`/integrations/pinterest/boards?account_id=${encodeURIComponent(selectedPinterestAccountId)}`)
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data?.boards) ? data.boards : [];
        setPinterestBoards(rows);
        if (!rows.some((board: { id: string }) => board.id === selectedPinterestBoardId)) {
          setSelectedPinterestBoardId(rows[0]?.id || '');
        }
        setPinterestBoardsLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setPinterestBoardsError(true);
        setPinterestBoardsLoaded(true);
      });
    return () => { active = false; };
  }, [selectedPinterestAccountId]);

  // Sync state whenever the active top card changes
  useEffect(() => {
    if (currentPin) {
      setEditTitle(currentPin.title);
      setEditDesc(currentPin.description);
      setEditBoardId(currentPin.boardId);
      setEditDate(currentPin.scheduledDate);
      setEditTime(currentPin.scheduledTime);
      setShowRegenBox(false);
      setRegenComment('');
      setRegenStatusMessage('');
      regenerationAttemptRef.current = null;
      setSwipeDirection(null);
      setDragOffset(0);
    }
  }, [currentPin?.id]);

  // Desktop Keyboard Hotkeys: Left Arrow = Reject, Right Arrow = Approve
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger hotkeys if user is editing in an input or textarea
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleReject();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleApprove();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPin, editTitle, editDesc, editBoardId, editDate, editTime, selectedPinterestBoardId, selectedPinterestAccountId]);

  const handleApprove = () => {
    if (!currentPin || decisionInFlightRef.current) return;
    if (!currentPin.pinId) {
      window.alert('Эта карточка — демонстрационный пример, а не сохранённый пин. Сначала создайте и сохраните пин в генераторе — только после этого его можно добавить в расписание.');
      return;
    }
    if (!selectedPinterestAccountId || !selectedPinterestBoardId) {
      window.alert('Сначала подключите Pinterest и выберите настоящую доску Pinterest для публикации.');
      return;
    }

    decisionInFlightRef.current = true;
    setIsDecisionInFlight(true);
    setSwipeDirection('right');
    setTimeout(async () => {
      let scheduleWasPersisted = false;
      try {
        const selectedBoard = boards.find((b) => b.id === editBoardId) || boards[0];
        const scheduledItem: ScheduledPinItem = {
          id: `pin-${Date.now()}`,
          pinId: currentPin.pinId!,
          title: editTitle,
          description: editDesc,
          boardId: editBoardId,
          boardName: selectedBoard?.name || currentPin.boardName,
          imageUrl: currentPin.imageUrl,
          scheduledDate: editDate,
          scheduledTime: editTime,
          status: 'scheduled',
          isOptimalSlot: true,
          destinationUrl: currentPin.destinationUrl,
          accountHandle: currentPin.accountHandle,
          pinterestBoardId: selectedPinterestBoardId,
          pinterestAccountId: selectedPinterestAccountId,
        };

        await onApprovePin(scheduledItem);
        scheduleWasPersisted = true;
        await updateQueue((prev) => prev.filter((pin) => pin.id !== currentPin.id));
        setApprovedCount((c) => c + 1);
      } catch (error) {
        if (scheduleWasPersisted) {
          window.alert('Пин уже сохранён в календаре, но не удалось убрать его из очереди проверки. Не одобряйте его повторно: обновите страницу и проверьте календарь.');
        } else {
          window.alert(error instanceof Error ? error.message : 'Не удалось добавить пин в расписание. Карточка осталась в очереди.');
        }
      } finally {
        setSwipeDirection(null);
        setDragOffset(0);
        decisionInFlightRef.current = false;
        setIsDecisionInFlight(false);
      }
    }, 220);
  };

  const handleReject = () => {
    if (!currentPin || decisionInFlightRef.current) return;

    decisionInFlightRef.current = true;
    setIsDecisionInFlight(true);
    setSwipeDirection('left');
    setTimeout(async () => {
      let pinWasRejected = false;
      try {
        // Persist the decision on the saved pin before removing its review item.
        // Demo cards have no server pin ID and remain local-only.
        if (currentPin.pinId) {
          await apiRequest(`/pins/${encodeURIComponent(currentPin.pinId)}/status`, {
            method: 'POST',
            body: JSON.stringify({ status: 'rejected' }),
          });
          pinWasRejected = true;
        }
        await updateQueue((prev) => prev.filter((pin) => pin.id !== currentPin.id));
        setRejectedCount((c) => c + 1);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось сохранить отклонение.';
        window.alert(pinWasRejected
          ? `Пин отклонён, но не удалось убрать карточку из очереди проверки. Обновите страницу и повторите удаление карточки. ${message}`
          : `${message} Карточка осталась в очереди.`);
      } finally {
        setSwipeDirection(null);
        setDragOffset(0);
        decisionInFlightRef.current = false;
        setIsDecisionInFlight(false);
      }
    }, 220);
  };

  const handleApproveAll = async () => {
    // Share the same synchronous lock as single-card approve/reject. React state
    // alone leaves a rapid double-click window and can create duplicate schedules.
    if (decisionInFlightRef.current || !queue.length) return;
    if (queue.some((pin) => !pin.pinId)) {
      window.alert('В очереди есть демонстрационные карточки без сохранённых пинов. Создайте и сохраните реальные пины в генераторе, прежде чем добавлять их в расписание.');
      return;
    }
    if (!selectedPinterestAccountId || !selectedPinterestBoardId) {
      window.alert('Сначала подключите Pinterest и выберите настоящую доску Pinterest для публикации.');
      return;
    }

    decisionInFlightRef.current = true;
    setIsDecisionInFlight(true);
    try {
      const queueSnapshot = [...queue];
      const scheduledItems = queueSnapshot.map((p, idx) => {
        // Bulk approval must not discard edits in the currently open review card.
        const approved = applyCurrentReviewEdits(p, idx, {
          title: editTitle,
          description: editDesc,
          boardId: editBoardId,
          scheduledDate: editDate,
          scheduledTime: editTime,
        });
        const selectedBoard = boards.find((b) => b.id === approved.boardId) || boards[0];
        return {
          id: `pin-${Date.now()}-${idx}`,
          pinId: approved.pinId,
          title: approved.title,
          description: approved.description,
          boardId: approved.boardId,
          boardName: selectedBoard?.name || approved.boardName,
          imageUrl: approved.imageUrl,
          scheduledDate: approved.scheduledDate,
          scheduledTime: approved.scheduledTime,
          status: 'scheduled' as const,
          isOptimalSlot: true,
          destinationUrl: approved.destinationUrl,
          accountHandle: approved.accountHandle,
          pinterestBoardId: selectedPinterestBoardId,
          pinterestAccountId: selectedPinterestAccountId,
        };
      });
      // Schedule one pin at a time. Each approval performs several persisted
      // API transitions and a Pinterest board verification; firing the whole
      // queue concurrently can trigger rate limits and make bulk approval flaky.
      const successfulIds = new Set<string>();
      setBulkApprovalProgress({ completed: 0, total: scheduledItems.length });
      for (let index = 0; index < scheduledItems.length; index += 1) {
        try {
          await onApprovePin(scheduledItems[index]);
          successfulIds.add(queueSnapshot[index].id);
        } catch {
          // Keep this card in the review queue and continue with the rest.
          // A partial failure must not discard successful approvals or stop
          // independent cards from being processed.
        } finally {
          setBulkApprovalProgress({ completed: index + 1, total: scheduledItems.length });
        }
      }
      if (successfulIds.size > 0) {
        try {
          await updateQueue((prev) => prev.filter((pin) => !successfulIds.has(pin.id)));
          setApprovedCount((count) => count + successfulIds.size);
        } catch {
          window.alert(`В календаре уже сохранено ${successfulIds.size} пинов, но очередь проверки не обновилась. Не одобряйте эти карточки повторно: обновите страницу и проверьте календарь.`);
          return;
        }
      }
      if (successfulIds.size !== scheduledItems.length) {
        window.alert(`В расписание добавлено: ${successfulIds.size} из ${scheduledItems.length}. Неудачные карточки остались в очереди.`);
      }
    } finally {
      setBulkApprovalProgress(null);
      decisionInFlightRef.current = false;
      setIsDecisionInFlight(false);
    }
  };

  const handleResetQueue = async () => {
    try {
      await updateQueue(() => []);
      setApprovedCount(0);
      setRejectedCount(0);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось очистить очередь. Попробуйте ещё раз.');
    }
  };

  // Touch / Mouse Drag Swiping
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    dragStartX.current = clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const diff = clientX - dragStartX.current;
    setDragOffset(diff);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragOffset > 90) {
      handleApprove();
    } else if (dragOffset < -90) {
      handleReject();
    } else {
      setDragOffset(0);
    }
  };

  const handleRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const instruction = regenComment.trim();
    if (!instruction || !currentPin || isRegenerating) return;
    if (!currentPin.pinId) {
      window.alert('Нельзя заменить изображение: исходный пин ещё не сохранён на сервере.');
      return;
    }

    const existingAttempt = regenerationAttemptRef.current;
    let attempt: { pinId: string; instruction: string; key: string };
    try {
      attempt = existingAttempt && existingAttempt.pinId === currentPin.pinId && existingAttempt.instruction === instruction
        ? existingAttempt
        : { pinId: currentPin.pinId, instruction, key: createGenerationIdempotencyKey() };
    } catch (error) {
      setRegenStatusMessage(error instanceof Error ? error.message : 'Не удалось создать безопасный ключ запроса.');
      return;
    }
    regenerationAttemptRef.current = attempt;
    setIsRegenerating(true);
    setRegenStatusMessage('Отправляем запрос на перегенерацию…');

    try {
      const savedPin = await apiRequest(`/pins/${encodeURIComponent(currentPin.pinId)}/regenerate`, {
        method: 'POST',
        headers: { 'Idempotency-Key': attempt.key },
        body: JSON.stringify({ instruction }),
      });
      if (savedPin?.status === 'processing' || savedPin?.code === 'regeneration_pending') {
        setRegenStatusMessage('Генерация ещё выполняется. Нажмите кнопку ещё раз через несколько секунд — запрос продолжится с тем же ключом без повторного списания.');
        return;
      }
      if (typeof savedPin?.image_url !== 'string' || !savedPin.image_url.trim()) {
        throw new Error('Сервер не подтвердил сохранение нового изображения. Повторите проверку с тем же запросом.');
      }

      const updatedPin = { ...currentPin, imageUrl: savedPin.image_url, aspectRatio: '2:3' };
      await updateQueue((prev) => prev.map((pin) => pin.id === currentPin.id ? updatedPin : pin));
      regenerationAttemptRef.current = null;
      setRegenStatusMessage('Новое изображение сохранено и привязано к исходной карточке.');
      setShowRegenBox(false);
      setRegenComment('');
    } catch (error: any) {
      const code = error?.data?.code;
      if (code === 'regeneration_in_progress' || code === 'regeneration_pending') {
        setRegenStatusMessage('Генерация ещё выполняется. Нажмите кнопку повторно через несколько секунд; используется тот же запрос.');
      } else {
        setRegenStatusMessage(error instanceof Error ? error.message : 'Не удалось перегенерировать изображение. Повторите попытку.');
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  // Never present a failed or still-running server restore as a genuinely empty queue.
  if (queueLoading && !currentPin) {
    return (
      <div className="custom-card p-8 md:p-12 text-center space-y-4 max-w-xl mx-auto my-8 border border-subtle" role="status" aria-live="polite">
        <RefreshCw className="w-8 h-8 mx-auto text-accent-ghost animate-spin" />
        <h2 className="text-xl font-bold text-primary-theme font-heading">{t.review.queueLoading}</h2>
      </div>
    );
  }

  if (queueLoadError && !currentPin) {
    return (
      <div className="custom-card p-8 md:p-12 text-center space-y-4 max-w-xl mx-auto my-8 border border-subtle" role="alert">
        <AlertCircle className="w-8 h-8 mx-auto text-amber-500" />
        <h2 className="text-xl font-bold text-primary-theme font-heading">{t.review.queueLoadErrorTitle}</h2>
        <p className="text-sm text-secondary-theme max-w-md mx-auto">{t.review.queueLoadErrorDescription}</p>
        <button type="button" onClick={onRetryQueueLoad} className="accent-btn px-6 py-2.5 text-sm cursor-pointer inline-flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4" />
          {t.review.retryQueueLoad}
        </button>
      </div>
    );
  }

  // Completed State Screen
  if (!currentPin) {
    return (
      <div className="custom-card p-8 md:p-12 text-center space-y-6 max-w-xl mx-auto my-8 border border-subtle">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-primary-theme font-heading">
            {t.review.allReviewed}
          </h2>
          <p className="text-sm text-secondary-theme max-w-md mx-auto leading-relaxed">
            {t.review.allReviewedDesc} {t.review.approvedCount}: <b>{approvedCount}</b>, {t.review.rejectedCount}: <b>{rejectedCount}</b>.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          {onGoToCalendar && (
            <button
              onClick={onGoToCalendar}
              className="accent-btn px-6 py-2.5 text-sm cursor-pointer shadow-sm w-full sm:w-auto flex items-center justify-center gap-1.5"
            >
              <Calendar className="w-4 h-4" />
              <span>Вернуться в календарь</span>
            </button>
          )}

          {onGoToDashboard && (
            <button
              onClick={onGoToDashboard}
              className="secondary-btn px-5 py-2.5 text-sm cursor-pointer w-full sm:w-auto"
            >
              В дашборд
            </button>
          )}

          <button
            onClick={handleResetQueue}
            className="px-4 py-2.5 text-xs text-secondary-theme hover:text-primary-theme hover:bg-subtle rounded-xl border border-subtle cursor-pointer transition-colors flex items-center justify-center gap-1.5"
            title="Восстановить исходные 15 пинов для повторной проверки"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Сбросить очередь (15 пинов)</span>
          </button>
        </div>
      </div>
    );
  }

  // Active Card Rotation & Translation calculations
  const rotationDeg = dragOffset * 0.08;
  const opacityStampApprove = Math.min(1, Math.max(0, dragOffset / 70));
  const opacityStampReject = Math.min(1, Math.max(0, -dragOffset / 70));

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-10">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            {onGoToCalendar && (
              <button
                onClick={onGoToCalendar}
                className="p-1.5 rounded-lg border border-subtle bg-subtle hover:bg-surface text-secondary-theme hover:text-primary-theme cursor-pointer transition-colors mr-1"
                title="Вернуться в календарь публикаций"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-2xl md:text-3xl font-bold text-primary-theme font-heading tracking-tight">
              {t.review.title}
            </h1>
            <span className="px-3 py-0.5 rounded-full text-xs font-bold font-mono accent-btn text-white">
              {queue.length} в очереди
            </span>
          </div>
          <p className="text-xs text-muted-theme mt-1">
            Очередь для Botanica Nordic (@botanica_nordic): подтвердите сгенерированные AI пины или отклоните неподходящие.
          </p>
        </div>

        {/* Batch action & Progress */}
        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto text-xs">
          {queue.length > 0 && (
            <button
              onClick={handleApproveAll}
              disabled={isDecisionInFlight}
              className="px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 transition-colors"
              title="Утвердить все пины из очереди в расписание публикаций"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{bulkApprovalProgress
                ? `Добавляем ${bulkApprovalProgress.completed} из ${bulkApprovalProgress.total}…`
                : isDecisionInFlight ? 'Сохраняем…' : `Одобрить все (${queue.length})`}</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-subtle bg-subtle font-mono">
            <span className="text-secondary-theme">Прогресс:</span>
            <span className="font-bold text-primary-theme">
              {totalInitial - queue.length + 1} / {totalInitial}
            </span>
          </div>
        </div>
      </div>

      {/* Keyboard Hotkeys Hint Banner (Desktop only) */}
      <div className="hidden md:flex items-center justify-between p-2.5 rounded-xl border border-subtle bg-subtle text-xs text-secondary-theme">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-accent-ghost shrink-0" />
          <span>{t.review.keyboardTip}</span>
        </div>
        <div className="flex items-center gap-2 font-mono font-bold text-[11px]">
          <span className="px-2 py-0.5 rounded border border-subtle bg-surface text-primary-theme">
            {t.review.rejectBtn}
          </span>
          <span className="px-2 py-0.5 rounded border border-subtle bg-surface text-primary-theme">
            {t.review.approveBtn}
          </span>
        </div>
      </div>

      {/* MAIN FOCUS DESK: Center interactive card + Right metadata panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Visual Pin Focus Card (Tinder / Swipeable) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div
            onMouseDown={handleTouchStart}
            onMouseMove={handleTouchMove}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              transform: swipeDirection === 'right'
                ? 'translateX(450px) rotate(25deg)'
                : swipeDirection === 'left'
                ? 'translateX(-450px) rotate(-25deg)'
                : `translateX(${dragOffset}px) rotate(${rotationDeg}deg)`,
              transition: isDragging ? 'none' : 'transform 0.22s ease-out',
            }}
            className="w-full max-w-[340px] aspect-[2/3] relative rounded-2xl overflow-hidden border border-subtle select-none cursor-grab active:cursor-grabbing shadow-sm bg-surface"
          >
            <img
              src={currentPin.imageUrl}
              alt={editTitle}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover pointer-events-none"
            />

            {/* Своя картинка пина: заменяет временную сгенерированную на постоянную загрузку */}
            <label
              className="absolute bottom-3 right-3 z-10 rounded-xl bg-black/60 text-white text-[10px] font-bold px-3 py-2 cursor-pointer hover:bg-black/80 transition-colors"
              title="Загрузить свою картинку — она сохранится навсегда"
            >
              ⬆ Своё фото
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    if (!currentPin.pinId) {
                      throw new Error('Сначала сохраните пин в генераторе — только сохранённому пину можно заменить изображение.');
                    }
                    const fd = new FormData();
                    fd.append('image', file);
                    const API = (import.meta as any).env?.VITE_API_URL || 'https://pinboard-ai-backend.onrender.com';
                    const response = await fetch(API + '/pins/' + encodeURIComponent(currentPin.pinId) + '/image', {
                      method: 'POST',
                      headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
                      body: fd,
                    });
                    if (!response.ok) {
                      throw new Error('Не удалось сохранить изображение на сервере. Попробуйте ещё раз.');
                    }
                    const savedPin = await response.json();
                    if (typeof savedPin.image_url !== 'string' || !savedPin.image_url) {
                      throw new Error('Сервер не вернул постоянную ссылку на изображение.');
                    }

                    await updateQueue((prev) =>
                      prev.map((p) => (p.id === currentPin.id ? { ...p, imageUrl: savedPin.image_url } : p))
                    );
                  } catch (error) {
                    window.alert(error instanceof Error ? error.message : 'Не удалось обновить изображение.');
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
            </label>

            {/* Stamp Overlay: APPROVED (Green) */}
            <div
              style={{ opacity: opacityStampApprove }}
              className="absolute top-8 left-6 pointer-events-none border-4 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-extrabold text-2xl uppercase tracking-widest px-4 py-1.5 rounded-xl rotate-[-15deg] bg-white/90 backdrop-blur-xs"
            >
              {t.review.approvedCount.toUpperCase()}
            </div>

            {/* Stamp Overlay: REJECTED (Red) */}
            <div
              style={{ opacity: opacityStampReject }}
              className="absolute top-8 right-6 pointer-events-none border-4 border-rose-500 text-rose-600 font-extrabold text-2xl uppercase tracking-widest px-4 py-1.5 rounded-xl rotate-[15deg] bg-white/90 backdrop-blur-xs"
            >
              {t.review.rejectedCount.toUpperCase()}
            </div>

            {/* Bottom Gradient overlay with title */}
            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-xs inline-block">
                {currentPin.boardName}
              </span>
              <p className="text-sm font-bold line-clamp-2 leading-snug">
                {editTitle}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Editable Details & AI Strategy Insights */}
        <div className="lg:col-span-7 space-y-4">
          <div className="custom-card p-5 border border-subtle space-y-4">
            {/* Algorithmic Reason Box */}
            <div className="p-3 rounded-xl bg-subtle border border-subtle flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-accent-ghost shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-primary-theme block">
                  {t.review.reasonTitle}
                </span>
                <p className="text-secondary-theme leading-relaxed">
                  {currentPin.reason}
                </p>
                <span className="inline-block font-mono font-semibold text-[11px] text-accent-ghost mt-1">
                  ⚡ {currentPin.trendMetric}
                </span>
              </div>
            </div>

            {/* Field: Title (Editable) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-primary-theme flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-muted-theme" />
                  <span>Заголовок пина (кликните для редактирования):</span>
                </label>
                <span className="text-[11px] font-mono text-muted-theme">
                  {editTitle.length} / 100
                </span>
              </div>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-semibold text-primary-theme bg-app-input border border-subtle rounded-xl focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* Field: Description (Editable) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-primary-theme flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-muted-theme" />
                  <span>Описание и теги (SEO):</span>
                </label>
                <span className="text-[11px] font-mono text-muted-theme">
                  {editDesc.length} / 500
                </span>
              </div>
              <textarea
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full px-3.5 py-2 text-xs leading-relaxed text-primary-theme bg-app-input border border-subtle rounded-xl focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* Fields: Target Board & Scheduling Slot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
              <div>
                <label className="font-bold text-primary-theme block mb-1">
                  Внутренняя доска PinPosy:
                </label>
                <select
                  value={editBoardId}
                  onChange={(e) => setEditBoardId(e.target.value)}
                  className="w-full px-3 py-2 bg-app-input border border-subtle rounded-xl text-primary-theme font-medium focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-primary-theme block mb-1">
                  Дата и время публикации:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-2.5 py-2 bg-app-input border border-subtle rounded-xl text-primary-theme font-mono text-xs focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-24 px-2 py-2 bg-app-input border border-subtle rounded-xl text-primary-theme font-mono text-xs focus:outline-none focus:ring-2 focus:ring-accent text-center"
                  />
                </div>
              </div>
              <div className="sm:col-span-2 space-y-2">
                {pinterestAccounts.length > 1 && (
                  <>
                    <label className="font-bold text-primary-theme block mb-1">
                      {t.settings.selectPinterestAccount}:
                    </label>
                    <select
                      value={selectedPinterestAccountId}
                      onChange={(e) => {
                        setSelectedPinterestAccountId(e.target.value);
                        setSelectedPinterestBoardId('');
                      }}
                      className="w-full px-3 py-2 bg-app-input border border-subtle rounded-xl text-primary-theme font-medium"
                    >
                      <option value="">{t.settings.selectPinterestAccount}</option>
                      {pinterestAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.username ? `@${account.username}` : account.id}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <label className="font-bold text-primary-theme block mb-1">
                  Доска назначения в Pinterest:
                </label>
                <select
                  value={selectedPinterestBoardId}
                  onChange={(e) => setSelectedPinterestBoardId(e.target.value)}
                  disabled={!pinterestBoardsLoaded || pinterestBoards.length === 0}
                  className="w-full px-3 py-2 bg-app-input border border-subtle rounded-xl text-primary-theme font-medium focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                >
                  <option value="">{!pinterestBoardsLoaded ? 'Загружаем доски Pinterest…' : pinterestBoards.length ? 'Выберите доску Pinterest' : 'Нет доступных досок Pinterest'}</option>
                  {pinterestBoards.map((board) => (
                    <option key={board.id} value={board.id}>{board.name}</option>
                  ))}
                </select>
                {pinterestBoardsError && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">Не удалось загрузить доски. Проверьте подключение Pinterest и обновите страницу.</p>
                )}
                {pinterestBoardsLoaded && !pinterestBoardsError && pinterestBoards.length === 0 && (
                  <p className="mt-1 text-[11px] text-secondary-theme">Подключите Pinterest в настройках, чтобы добавлять публикации в расписание.</p>
                )}
              </div>
            </div>

            {/* Action: AI Image Re-Generation */}
            <div className="pt-2 border-t border-subtle">
              {!showRegenBox ? (
                <button
                  type="button"
                  onClick={() => setShowRegenBox(true)}
                  className="secondary-btn px-3.5 py-2 text-xs flex items-center gap-1.5 cursor-pointer text-primary-theme"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-accent-ghost" />
                  <span>Заменить изображение через AI</span>
                </button>
              ) : (
                <form onSubmit={handleRegenerate} className="p-3 rounded-xl bg-subtle border border-subtle space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-primary-theme">
                      Что изменить в новом варианте:
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowRegenBox(false)}
                      className="text-[11px] text-muted-theme hover:text-primary-theme cursor-pointer"
                    >
                      ✕ Отмена
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={300}
                    placeholder="Например: затемни фон, сохрани композицию, добавь акцент на заголовок..."
                    value={regenComment}
                    onChange={(e) => {
                      setRegenComment(e.target.value);
                      setRegenStatusMessage('');
                    }}
                    disabled={isRegenerating}
                    className="w-full px-3 py-1.5 text-xs bg-app-input border border-subtle rounded-lg text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                  />
                  {regenStatusMessage && (
                    <p role="status" aria-live="polite" className="text-[11px] text-secondary-theme">
                      {regenStatusMessage}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={isRegenerating || !regenComment.trim() || !currentPin.pinId}
                    className="accent-btn px-4 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                    <span>{isRegenerating ? 'Перегенерируем…' : 'Сгенерировать и заменить изображение'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* DECISION BUTTONS (Reject vs Approve) */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            {/* Left Big Button: Reject / Skip */}
            <button
              onClick={handleReject}
              disabled={isDecisionInFlight}
              className="py-4 px-6 rounded-full border border-subtle hover:border-rose-400 bg-surface hover:bg-rose-50 dark:hover:bg-rose-950/20 text-primary-theme font-bold text-sm md:text-base flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 group shadow-xs"
            >
              <div className="w-7 h-7 rounded-full bg-subtle group-hover:bg-rose-500 group-hover:text-white flex items-center justify-center transition-colors">
                <X className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span>Отклонить</span>
              <span className="hidden md:inline text-[11px] font-mono text-muted-theme group-hover:text-rose-600 font-normal">
                [ ⬅️ ]
              </span>
            </button>

            {/* Right Big Button: Approve & Schedule */}
            <button
              onClick={handleApprove}
              disabled={isDecisionInFlight}
              className="accent-btn py-4 px-6 rounded-full text-white font-bold text-sm md:text-base flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 group shadow-xs"
            >
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
              <span>{isDecisionInFlight ? 'Сохраняем решение…' : currentPin?.pinStatus === 'approved' ? 'Повторить планирование' : 'Одобрить и запланировать'}</span>
              <span className="hidden md:inline text-[11px] font-mono text-white/80 font-normal">
                [ ➡️ ]
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
