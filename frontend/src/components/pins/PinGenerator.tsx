import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  Calendar,
  Layers,
  Sliders,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ArrowRight,
  Info,
  Shuffle,
  Grid,
  Plus,
  Minus,
  CalendarDays,
  Clock,
  Zap,
} from 'lucide-react';
import { AI_CONTENT_LANGUAGES, useI18n } from '../../i18n/i18nContext';
import { useNotifications } from '../../context/NotificationContext';
import { BoardItem, ScheduledPinItem } from '../../data/mockData';
import { apiRequest } from '../../lib/api';
import { getDefaultTimezone } from '../../utils/timezone';
import {
  GeneratedPinVariation,
  SupportedAspectRatio,
} from '../../services/gemini';
import { PinCanvas, PinCanvasData, ASPECT_RATIO_SPECS } from './PinCanvas';

interface PinGeneratorProps {
  boards: BoardItem[];
  initialTopic?: string;
  initialDate?: string;
  onSchedulePin: (pin: ScheduledPinItem) => void;
  onGoToCalendar: () => void;
}

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ALL_ASPECT_RATIOS: {
  id: SupportedAspectRatio;
  label: string;
  res: string;
  name: string;
  desc: string;
}[] = [
  { id: '2:3', label: '2:3', res: '1000 × 1500 px', name: 'Standard Pin', desc: 'Основной формат поиска' },
  { id: '9:16', label: '9:16', res: '1080 × 1920 px', name: 'Idea / Story', desc: 'Полноэкранный вертикал' },
  { id: '3:4', label: '3:4', res: '1080 × 1440 px', name: 'Editorial', desc: 'Интерьеры и гайды' },
  { id: '4:5', label: '4:5', res: '1080 × 1350 px', name: 'Portrait', desc: 'Социальный портрет' },
  { id: '1:1', label: '1:1', res: '1080 × 1080 px', name: 'Square', desc: 'Квадрат / Карусель' },
];

export const PinGenerator: React.FC<PinGeneratorProps> = ({
  boards,
  initialTopic,
  initialDate,
  onSchedulePin,
  onGoToCalendar,
}) => {
  const { t, aiContentLanguage, setAiContentLanguage, language } = useI18n();
  const { enqueueTask } = useNotifications();

  const [pinCount, setPinCount] = useState<number>(5);
  const [topic, setTopic] = useState(
    initialTopic || 'Minimalist Scandinavian living room styling tips and cozy decor ideas'
  );

  // User requested: "Планирование (Scheduling)" - Опубликовать сразу / В умную очередь / Выбрать дату и время
  const [schedulingMode, setSchedulingMode] = useState<'publish_now' | 'smart_queue' | 'custom_datetime'>(
    initialDate ? 'custom_datetime' : 'smart_queue'
  );
  const [customScheduleDate, setCustomScheduleDate] = useState<string>(() => {
    if (initialDate) return initialDate;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatLocalDate(tomorrow);
  });
  const [customScheduleTime, setCustomScheduleTime] = useState('20:15');

  const [pinterestAccounts, setPinterestAccounts] = useState<Array<{ id: string; username?: string | null }>>([]);
  const [selectedPinterestAccountId, setSelectedPinterestAccountId] = useState('');
  const [pinterestBoards, setPinterestBoards] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedPinterestBoardId, setSelectedPinterestBoardId] = useState('');

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
        if (active) setPinterestAccounts([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedPinterestAccountId) {
      setPinterestBoards([]);
      setSelectedPinterestBoardId('');
      return () => { active = false; };
    }
    apiRequest(`/integrations/pinterest/boards?account_id=${encodeURIComponent(selectedPinterestAccountId)}`)
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data?.boards) ? data.boards : [];
        setPinterestBoards(rows);
        setSelectedPinterestBoardId((current) =>
          current && rows.some((board) => board.id === current) ? current : rows[0]?.id || ''
        );
      })
      .catch(() => {
        if (active) setPinterestBoards([]);
      });
    return () => { active = false; };
  }, [selectedPinterestAccountId]);


  useEffect(() => {
    if (initialDate) {
      setCustomScheduleDate(initialDate);
      setSchedulingMode('custom_datetime');
    }
  }, [initialDate]);

  useEffect(() => {
    if (initialTopic) {
      setTopic(initialTopic);
    }
  }, [initialTopic]);

  // Aspect ratio mode: single uniform format or mix/randomizer
  const [aspectMode, setAspectMode] = useState<'single' | 'randomizer'>('single');
  const [selectedSingleRatio, setSelectedSingleRatio] = useState<SupportedAspectRatio>('2:3');
  const [randomizerRatios, setRandomizerRatios] = useState<Record<SupportedAspectRatio, boolean>>({
    '2:3': true,
    '9:16': true,
    '3:4': true,
    '4:5': false,
    '1:1': false,
  });

  // Intelligent Board Recommendation
  const recommendedBoard = useMemo(() => {
    const lower = topic.toLowerCase();
    if (
      lower.includes('recipe') ||
      lower.includes('food') ||
      lower.includes('matcha') ||
      lower.includes('drink') ||
      lower.includes('куриц') ||
      lower.includes('рецепт') ||
      lower.includes('кофе')
    ) {
      return boards.find((b) => b.category.toLowerCase().includes('recipe')) || boards[1] || boards[0];
    }
    if (
      lower.includes('skin') ||
      lower.includes('beauty') ||
      lower.includes('glow') ||
      lower.includes('serum') ||
      lower.includes('уход') ||
      lower.includes('кожа') ||
      lower.includes('косметик')
    ) {
      return boards.find((b) => b.category.toLowerCase().includes('wellness')) || boards[2] || boards[0];
    }
    if (
      lower.includes('travel') ||
      lower.includes('positano') ||
      lower.includes('italy') ||
      lower.includes('hotel') ||
      lower.includes('путешеств') ||
      lower.includes('тур')
    ) {
      return boards.find((b) => b.category.toLowerCase().includes('travel')) || boards[3] || boards[0];
    }
    return boards[0];
  }, [topic, boards]);

  const [selectedBoardId, setSelectedBoardId] = useState<string>(recommendedBoard?.id || boards[0]?.id || 'b-1');

  useEffect(() => {
    if (recommendedBoard) {
      setSelectedBoardId(recommendedBoard.id);
    }
  }, [recommendedBoard]);

  const [tone, setTone] = useState<string>('inspirational');
  const [destinationUrl, setDestinationUrl] = useState('https://pinposy.com/blog/scandinavian-interior-styling');
  const [canvasStyle, setCanvasStyle] = useState<'minimal' | 'glass' | 'split'>('glass');

  const [isGenerating, setIsGenerating] = useState(false);
  const generationKeyRef = React.useRef<string | null>(null);
  const [generatedPins, setGeneratedPins] = useState<GeneratedPinVariation[]>([]);
  const [activePinIndex, setActivePinIndex] = useState(0);
  const [scheduledSuccess, setScheduledSuccess] = useState(false);

  // Quick preset topic suggestions
  const topicPresets = [
    'Minimalist Scandinavian living room styling tips and cozy decor ideas',
    'Artisanal iced matcha cloud latte recipe with thick vanilla cold foam',
    'AM skincare routine for barrier repair & morning glass skin glow',
    'Amalfi Coast 5-day travel guide: hidden scenic viewpoints & photo spots',
  ];

  const handleRatioToggle = (ratioKey: SupportedAspectRatio) => {
    setRandomizerRatios((prev) => {
      const next = { ...prev, [ratioKey]: !prev[ratioKey] };
      // Ensure at least one ratio is checked
      if (!Object.values(next).some(Boolean)) {
        return prev;
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setScheduledSuccess(false);

    const currentTopic = topic.trim() || 'Aesthetic Minimalist Inspiration';
    try {
      const selectedBoard = boards.find((b) => b.id === selectedBoardId);

      // Determine active aspect ratios
      let targetRatios: SupportedAspectRatio[];
      if (aspectMode === 'single') {
        targetRatios = [selectedSingleRatio];
      } else {
        targetRatios = (Object.keys(randomizerRatios) as SupportedAspectRatio[]).filter(
          (k) => randomizerRatios[k]
        );
        if (targetRatios.length === 0) targetRatios = ['2:3'];
      }

      if (!selectedBoard) {
        throw new Error(t.generator.errorNoBoard);
      }

      const aspectRatio = aspectMode === 'single' ? selectedSingleRatio : 'mixed';
      const requestBody = {
        topic: currentTopic,
        tone,
        content_language: aiContentLanguage || 'en',
        count: pinCount,
        aspect_ratio: aspectRatio,
        mixed_ratios: targetRatios,
      };
      const requestFingerprint = JSON.stringify({ boardId: selectedBoard.id, ...requestBody });
      const storedFingerprint = sessionStorage.getItem('pinposy_generation_fingerprint');
      const storedKey = sessionStorage.getItem('pinposy_generation_key');
      if (storedFingerprint !== requestFingerprint || !storedKey) {
        generationKeyRef.current = globalThis.crypto.randomUUID().replace(/-/g, '_');
        sessionStorage.setItem('pinposy_generation_fingerprint', requestFingerprint);
        sessionStorage.setItem('pinposy_generation_key', generationKeyRef.current);
      } else {
        // Restore the durable request identity after a remount or page reload.
        generationKeyRef.current = storedKey;
      }
      const rows = await apiRequest(`/boards/${encodeURIComponent(selectedBoard.id)}/pins/generate`, {
        method: 'POST',
        headers: { 'Idempotency-Key': generationKeyRef.current || '' },
        body: JSON.stringify(requestBody),
      });

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error(t.generator.errorNoPins);
      }

      const results: GeneratedPinVariation[] = rows.map((row: any) => ({
        id: String(row.id),
        titles: [row.title || currentTopic],
        selectedTitle: row.title || currentTopic,
        description: row.description || '',
        altText: '',
        suggestedBoard: selectedBoard.name,
        keywords: [],
        headlineOverlay: row.title || currentTopic,
        subheadlineOverlay: '',
        ctaText: '',
        imageUrl: row.image_url,
        tone,
        aspectRatio: row.aspect_ratio || selectedSingleRatio,
      }));

      setGeneratedPins(results);
      setActivePinIndex(0);
      generationKeyRef.current = null;
      sessionStorage.removeItem('pinposy_generation_fingerprint');
      sessionStorage.removeItem('pinposy_generation_key');
    } catch (err) {
      console.error('Error generating pins:', err);
      window.alert(err instanceof Error ? err.message : t.generator.errorGeneratePins);
    } finally {
      setIsGenerating(false);
    }
  };

  const currentPin = generatedPins[activePinIndex];

  // Change aspect ratio of currently selected pin
  const handleActivePinRatioChange = (newRatio: SupportedAspectRatio) => {
    if (!currentPin) return;
    const updated = [...generatedPins];
    updated[activePinIndex] = {
      ...currentPin,
      aspectRatio: newRatio,
    };
    setGeneratedPins(updated);
  };

  const handleTitleSelect = (title: string) => {
    if (!currentPin) return;
    const updated = [...generatedPins];
    updated[activePinIndex] = {
      ...currentPin,
      selectedTitle: title,
      headlineOverlay: title.length > 36 ? title.slice(0, 36) + '...' : title,
    };
    setGeneratedPins(updated);
    void apiRequest(`/pins/${encodeURIComponent(currentPin.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }).catch((error) => {
      console.error('[pins] Не удалось сохранить название:', error);
      window.alert(error instanceof Error ? error.message : t.generator.errorSaveTitle);
    });
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!currentPin) return;
    const updated = [...generatedPins];
    updated[activePinIndex] = {
      ...currentPin,
      description: e.target.value,
    };
    setGeneratedPins(updated);
  };

  const handlePushToCalendar = async () => {
    if (!currentPin) return;
    if (!selectedPinterestBoardId) {
      window.alert('Сначала подключите Pinterest и выберите доску назначения. Без неё публикацию нельзя добавить в расписание.');
      return;
    }

    const board = boards.find((b) => b.id === selectedBoardId) || boards[0];
    if (!board) {
      window.alert('Сначала создайте внутреннюю доску PinPosy для этого пина.');
      return;
    }

    const scheduledDate =
      schedulingMode === 'publish_now'
        ? formatLocalDate(new Date())
        : schedulingMode === 'custom_datetime'
        ? customScheduleDate
        : (() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return formatLocalDate(tomorrow);
          })();

    const scheduledTime =
      schedulingMode === 'publish_now'
        ? new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', timeZone: getDefaultTimezone(language) }).format(new Date())
        : schedulingMode === 'custom_datetime'
        ? customScheduleTime
        : '20:15';

    // До подтверждения Pinterest любой элемент остаётся запланированным, не published.
    const status = 'scheduled' as const;

    const newScheduledPin: ScheduledPinItem = {
      id: `pending-${Date.now()}`,
      pinId: currentPin.id,
      title: currentPin.selectedTitle,
      boardId: board.id,
      boardName: board.name,
      pinterestBoardId: selectedPinterestBoardId || undefined,
      pinterestAccountId: selectedPinterestAccountId || undefined,
      imageUrl: currentPin.imageUrl,
      scheduledDate,
      scheduledTime,
      status,
      isOptimalSlot: true,
      destinationUrl,
    };

    try {
      await onSchedulePin(newScheduledPin);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t.generator.errorSaveSchedule);
      return;
    }
    setScheduledSuccess(true);
    setTimeout(() => setScheduledSuccess(false), 4000);

    enqueueTask({
      title: t.generator.scheduledToastTitle,
      message: t.generator.scheduledToastMessageTemplate
        .replace('{title}', currentPin.selectedTitle.slice(0, 32))
        .replace('{date}', scheduledDate)
        .replace('{time}', scheduledTime),
      type: 'generation',
      actionTab: 'calendar',
      durationMs: 2500,
      completionTitle: t.generator.scheduledCompletionTitle,
      completionMessage: t.generator.scheduledCompletionMessageTemplate.replace('{board}', board.name),
    });
  };

  // Canvas data binding
  const activeRatio = currentPin?.aspectRatio || selectedSingleRatio;
  const canvasData: PinCanvasData = {
    imageUrl: currentPin?.imageUrl || '/src/assets/images/pin_home_decor_1790670043705.jpg',
    headline: currentPin?.headlineOverlay || currentPin?.selectedTitle || topic,
    subheadline: currentPin?.subheadlineOverlay || 'Essential tips and aesthetic breakdown',
    brandText: 'pinposy.com',
    style: canvasStyle,
    destinationUrl,
    aspectRatio: activeRatio,
  };

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary-theme font-heading">
          {t.generator.title}
        </h1>
        <p className="text-xs md:text-sm text-secondary-theme mt-1">
          {t.generator.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form & Configuration (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Form Card */}
          <div className="custom-card p-5 rounded-2xl space-y-4">
            {/* Topic Input */}
            <div>
              <label className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">
                {t.generator.topicLabel}
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t.generator.topicPlaceholder}
                rows={2}
                className="w-full px-3.5 py-2.5 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme placeholder:text-muted-theme focus:outline-none focus:ring-2 focus:ring-accent"
              />

              {/* Quick Topic Chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {topicPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTopic(preset)}
                    className="text-[11px] px-2 py-1 rounded-md bg-subtle hover:bg-surface border border-subtle text-secondary-theme hover:text-primary-theme transition-colors truncate max-w-full text-left cursor-pointer"
                  >
                    {preset.slice(0, 48)}...
                  </button>
                ))}
              </div>
            </div>

            {/* Flexible Pin Count Selection */}
            <div className="p-3.5 rounded-xl border border-subtle bg-subtle space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-secondary-theme uppercase tracking-wider block">
                    {t.generator.pinCountLabel}
                  </label>
                  <span className="text-[11px] text-muted-theme">
                    {t.generator.pinCountSubtitle}
                  </span>
                </div>

                {/* Direct Number Stepper */}
                <div className="flex items-center gap-1.5 bg-surface border border-subtle rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setPinCount((prev) => Math.max(1, prev - 1))}
                    disabled={pinCount <= 1}
                    className="p-1 rounded hover:bg-subtle text-secondary-theme disabled:opacity-30 cursor-pointer"
                    title={t.generator.decreasePinsTitle}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={pinCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) {
                        setPinCount(Math.min(10, Math.max(1, val)));
                      }
                    }}
                    className="w-12 text-center text-xs font-mono font-bold text-primary-theme bg-transparent border-0 focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => setPinCount((prev) => Math.min(10, prev + 1))}
                    disabled={pinCount >= 10}
                    className="p-1 rounded hover:bg-subtle text-secondary-theme disabled:opacity-30 cursor-pointer"
                    title={t.generator.increasePinsTitle}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick Presets Row */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {[1, 2, 3, 4, 5, 8, 10].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setPinCount(cnt)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition-all cursor-pointer ${
                      pinCount === cnt
                        ? 'accent-btn font-bold shadow-xs'
                        : 'bg-surface border-subtle text-secondary-theme hover:text-primary-theme hover:bg-surface/80'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>

              <input
                type="range"
                min={1}
                max={10}
                value={pinCount}
                onChange={(e) => setPinCount(Number(e.target.value))}
                className="w-full cursor-pointer pt-1"
                style={{ accentColor: 'var(--accent)' }}
              />
            </div>

            {/* Aspect Ratio & Resolution Section */}
            <div className="p-3.5 rounded-xl border border-subtle bg-subtle space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-xs font-semibold text-primary-theme uppercase tracking-wider flex items-center gap-1.5">
                    <Grid className="w-3.5 h-3.5 text-accent-ghost" />
                    <span>{t.generator.aspectRatioLabel}</span>
                  </span>
                  <p className="text-[11px] text-muted-theme mt-0.5">
                    {t.generator.aspectRatioSubtitle}
                  </p>
                </div>

                {/* Aspect Mode Switch */}
                <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-subtle">
                  <button
                    type="button"
                    onClick={() => setAspectMode('single')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      aspectMode === 'single'
                        ? 'accent-btn font-semibold shadow-xs'
                        : 'text-secondary-theme hover:text-primary-theme'
                    }`}
                  >
                    {t.generator.aspectSingle}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectMode('randomizer')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                      aspectMode === 'randomizer'
                        ? 'accent-btn font-semibold shadow-xs'
                        : 'text-secondary-theme hover:text-primary-theme'
                    }`}
                  >
                    <Shuffle className="w-3 h-3" />
                    <span>{t.generator.aspectRandomizer}</span>
                  </button>
                </div>
              </div>

              {/* Mode A: Single Uniform Aspect Ratio Selector */}
              {aspectMode === 'single' ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {ALL_ASPECT_RATIOS.map((item) => {
                    const isSelected = selectedSingleRatio === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedSingleRatio(item.id)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-accent bg-surface font-bold text-primary-theme shadow-xs ring-1 ring-accent'
                            : 'border-subtle bg-surface/50 text-secondary-theme hover:bg-surface'
                        }`}
                      >
                        <span className="text-xs font-mono font-bold block">{item.label}</span>
                        <span className="text-[10px] text-muted-theme block mt-0.5 font-mono">{item.res}</span>
                        <span className="text-[10px] text-primary-theme font-medium block mt-1 truncate">
                          {item.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Mode B: Multi-format Mix with Checkboxes */
                <div className="space-y-2">
                  <p className="text-[11px] text-secondary-theme">
                    {t.generator.aspectMixPrompt}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {ALL_ASPECT_RATIOS.map((item) => {
                      const isChecked = randomizerRatios[item.id];
                      return (
                        <label
                          key={item.id}
                          className={`p-2.5 rounded-xl border flex flex-col gap-1 cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-surface border-accent text-primary-theme font-medium shadow-xs'
                              : 'bg-surface/40 border-subtle text-muted-theme hover:bg-surface'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold">{item.label}</span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleRatioToggle(item.id)}
                              className="w-3.5 h-3.5 rounded cursor-pointer"
                              style={{ accentColor: 'var(--accent)' }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-theme font-mono leading-tight">{item.res}</span>
                          <span className="text-[10px] text-secondary-theme leading-tight truncate">{item.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Target Board with AI Recommendation Badge */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-secondary-theme uppercase tracking-wider">
                  {t.generator.targetBoardLabel}
                </label>
                {recommendedBoard && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent-pill border border-accent/20">
                    <Sparkles className="w-3 h-3 text-accent-ghost" />
                    <span>{t.generator.recommendedBoardBadge}: {recommendedBoard.name.slice(0, 24)}...</span>
                  </span>
                )}
              </div>

              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.pinCount} pins) {b.id === recommendedBoard?.id ? `★ ${t.generator.recommendedBadge}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Editorial Tone & Outbound URL */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">
                  {t.generator.pinToneLabel}
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="inspirational">{t.generator.tones.inspirational}</option>
                  <option value="commercial">{t.generator.tones.commercial}</option>
                  <option value="educational">{t.generator.tones.educational}</option>
                  <option value="aesthetic">{t.generator.tones.aesthetic}</option>
                  <option value="viral">{t.generator.tones.viral}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">
                  {t.generator.targetUrlLabel}
                </label>
                <input
                  type="url"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  placeholder={t.generator.targetUrlPlaceholder}
                  className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">
                  {t.generator.contentLanguageLabel}
                </label>
                <select
                  value={aiContentLanguage}
                  onChange={(e) => setAiContentLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {AI_CONTENT_LANGUAGES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.native}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* SCREEN 2: ПЛАНИРОВАНИЕ (SCHEDULING) — EXACT USER SPECIFICATION */}
            <div className="p-4 rounded-xl border border-subtle bg-subtle space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-primary-theme uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-accent-ghost" />
                  <span>{t.generator.schedulingSectionTitle}</span>
                </label>
                <span className="text-[11px] font-mono text-muted-theme">{t.generator.autoPostingLabel}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* 1. Опубликовать сразу */}
                <button
                  type="button"
                  onClick={() => setSchedulingMode('publish_now')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    schedulingMode === 'publish_now'
                      ? 'bg-surface border-accent ring-1 ring-accent shadow-xs'
                      : 'bg-surface/60 border-subtle hover:border-strong'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Zap className="w-4 h-4 text-accent-ghost" />
                    <span className={`w-2 h-2 rounded-full ${schedulingMode === 'publish_now' ? 'bg-accent' : 'bg-transparent border border-subtle'}`} />
                  </div>
                  <span className="text-xs font-bold text-primary-theme block">{t.generator.publishNowLabel}</span>
                  <span className="text-[10px] text-muted-theme leading-tight mt-0.5">{t.generator.publishNowDescription}</span>
                </button>

                {/* 2. Добавить в умную очередь */}
                <button
                  type="button"
                  onClick={() => setSchedulingMode('smart_queue')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    schedulingMode === 'smart_queue'
                      ? 'bg-surface border-accent ring-1 ring-accent shadow-xs'
                      : 'bg-surface/60 border-subtle hover:border-strong'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Clock className="w-4 h-4 text-accent-ghost" />
                    <span className={`w-2 h-2 rounded-full ${schedulingMode === 'smart_queue' ? 'bg-accent' : 'bg-transparent border border-subtle'}`} />
                  </div>
                  <span className="text-xs font-bold text-primary-theme block">{t.generator.smartQueueLabel}</span>
                  <span className="text-[10px] text-muted-theme leading-tight mt-0.5">{t.generator.smartQueueDescription}</span>
                </button>

                {/* 3. Выбрать конкретную дату и время */}
                <button
                  type="button"
                  onClick={() => setSchedulingMode('custom_datetime')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    schedulingMode === 'custom_datetime'
                      ? 'bg-surface border-accent ring-1 ring-accent shadow-xs'
                      : 'bg-surface/60 border-subtle hover:border-strong'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Calendar className="w-4 h-4 text-accent-ghost" />
                    <span className={`w-2 h-2 rounded-full ${schedulingMode === 'custom_datetime' ? 'bg-accent' : 'bg-transparent border border-subtle'}`} />
                  </div>
                  <span className="text-xs font-bold text-primary-theme block">{t.generator.customDateTimeLabel}</span>
                  <span className="text-[10px] text-muted-theme leading-tight mt-0.5">{t.generator.customDateTimeDescription}</span>
                </button>
              </div>

              {/* Custom Date/Time pickers */}
              {schedulingMode === 'custom_datetime' && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-subtle animate-in fade-in">
                  <div>
                    <label className="text-[11px] font-bold text-primary-theme block mb-1">
                      {t.generator.publishDateLabel}
                    </label>
                    <input
                      type="date"
                      value={customScheduleDate}
                      onChange={(e) => setCustomScheduleDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-app-input border border-subtle rounded-xl text-primary-theme font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-primary-theme block mb-1">
                      {t.generator.publishTimeLabel}
                    </label>
                    <input
                      type="time"
                      value={customScheduleTime}
                      onChange={(e) => setCustomScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-app-input border border-subtle rounded-xl text-primary-theme font-mono focus:outline-none focus:ring-2 focus:ring-accent text-center"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Generate Action Button */}
            <div className="pt-2">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full accent-btn py-3 px-4 rounded-xl text-xs md:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t.generator.generatingState}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {t.generator.generateBtn} ({pinCount})
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Generated Pins Editor Workspace */}
          {generatedPins.length > 0 && (
            <div className="custom-card p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-subtle pb-3">
                <h3 className="text-base font-bold text-primary-theme font-heading">
                  {t.generator.resultsTitle}
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-subtle text-secondary-theme">
                  {t.generator.pinCounterTemplate.replace('{current}', String(activePinIndex + 1)).replace('{total}', String(generatedPins.length))} · {currentPin?.aspectRatio || selectedSingleRatio} ({ASPECT_RATIO_SPECS[currentPin?.aspectRatio || selectedSingleRatio]?.desc})
                </span>
              </div>

              {/* Batch Tabs (Pin 1 .. N) with Aspect Ratio Badges */}
              {generatedPins.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5">
                  {generatedPins.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActivePinIndex(idx)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                        activePinIndex === idx
                          ? 'accent-btn shadow-xs'
                          : 'bg-subtle text-secondary-theme hover:text-primary-theme'
                      }`}
                    >
                      <span>#{idx + 1}</span>
                      <span className="font-mono text-[10px] opacity-80">({p.aspectRatio})</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Ratio switcher for active pin */}
              {currentPin && (
                <div className="p-3 rounded-xl bg-subtle border border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <span className="text-xs font-semibold text-primary-theme block">
                      {t.generator.formatCurrentPin} #{activePinIndex + 1}:
                    </span>
                    <span className="text-[11px] text-muted-theme">
                      {ASPECT_RATIO_SPECS[currentPin.aspectRatio]?.nameKey} · {ASPECT_RATIO_SPECS[currentPin.aspectRatio]?.desc}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap">
                    {ALL_ASPECT_RATIOS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleActivePinRatioChange(item.id)}
                        className={`px-2 py-1 text-xs font-mono rounded-lg border transition-all cursor-pointer ${
                          currentPin.aspectRatio === item.id
                            ? 'accent-btn font-bold shadow-xs'
                            : 'bg-surface border-subtle text-secondary-theme hover:text-primary-theme'
                        }`}
                        title={`${item.name} (${item.res})`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Title Variations Selector */}
              {currentPin && (
                <div>
                  <label className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">
                    {t.generator.titleOptions}
                  </label>
                  <div className="space-y-1.5">
                    {currentPin.titles.map((titleOption, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleTitleSelect(titleOption)}
                        className={`p-2.5 rounded-xl border text-xs md:text-sm cursor-pointer transition-all flex items-start gap-2.5 ${
                          currentPin.selectedTitle === titleOption
                            ? 'border-accent bg-subtle text-primary-theme font-medium shadow-xs'
                            : 'border-subtle bg-app-input text-secondary-theme hover:bg-subtle'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                            currentPin.selectedTitle === titleOption
                              ? 'border-accent bg-accent text-white'
                              : 'border-strong'
                          }`}
                        >
                          {currentPin.selectedTitle === titleOption && (
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          )}
                        </div>
                        <span className="flex-1">{titleOption}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pin SEO Description */}
              {currentPin && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-secondary-theme uppercase tracking-wider">
                      {t.generator.descriptionLabel}
                    </label>
                    <span className="text-[11px] font-mono text-muted-theme">
                      {currentPin.description.length} / 500
                    </span>
                  </div>
                  <textarea
                    value={currentPin.description}
                    onChange={handleDescriptionChange}
                    onBlur={() => {
                      void apiRequest(`/pins/${encodeURIComponent(currentPin.id)}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ description: currentPin.description }),
                      }).catch((error) => {
                        console.error('[pins] Не удалось сохранить описание:', error);
                        window.alert(error instanceof Error ? error.message : t.generator.errorSaveDescription);
                      });
                    }}
                    rows={4}
                    className="w-full p-3 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent leading-relaxed"
                  />
                </div>
              )}

              {/* Keywords Targeted */}
              {currentPin && (
                <div>
                  <label className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">
                    {t.generator.keywordsIncluded}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {currentPin.keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-1 rounded-md bg-subtle border border-subtle text-secondary-theme"
                      >
                        #{kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-subtle space-y-2">
                <label className="block text-[11px] font-bold text-primary-theme">
                  {t.generator.pinterestBoardForPublishingLabel}
                </label>
                {pinterestAccounts.length > 1 && (
                  <select
                    value={selectedPinterestAccountId}
                    onChange={(e) => {
                      setSelectedPinterestAccountId(e.target.value);
                      setSelectedPinterestBoardId('');
                    }}
                    className="w-full mb-2 px-3 py-2 text-xs bg-app-input border border-subtle rounded-xl text-primary-theme"
                  >
                    <option value="">{t.settings.selectPinterestAccount}</option>
                    {pinterestAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.username ? `@${account.username}` : account.id}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={selectedPinterestBoardId}
                  onChange={(e) => setSelectedPinterestBoardId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-app-input border border-subtle rounded-xl text-primary-theme"
                >
                  <option value="">{t.generator.noBoardOption}</option>
                  {pinterestBoards.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                {!selectedPinterestBoardId && (
                  <p className="text-[10px] text-muted-theme">
                    {t.generator.noBoardWarning}
                  </p>
                )}
              </div>

              {/* Action Buttons: Schedule to Calendar */}
              <div className="pt-3 border-t border-subtle flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handlePushToCalendar}
                  disabled={!selectedPinterestAccountId || !selectedPinterestBoardId || !currentPin}
                  className="w-full sm:flex-1 accent-btn py-2.5 px-4 rounded-xl text-xs md:text-sm font-semibold flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Calendar className="w-4 h-4" />
                  <span>{t.generator.pushToCalendarBtn}</span>
                </button>

                <button
                  onClick={onGoToCalendar}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs md:text-sm font-medium border border-subtle bg-surface hover:bg-subtle text-secondary-theme hover:text-primary-theme flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{t.calendar.title}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {scheduledSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{t.generator.savedToCalendar}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Visual Pin Preview & Canvas Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="custom-card p-5 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-primary-theme font-heading">
                  {t.generator.canvasTitle}
                </h3>
                <p className="text-[11px] text-muted-theme">
                  {t.generator.canvasSubtitle}
                </p>
              </div>

              {/* Visual Style Preset Selector */}
              <div className="flex items-center gap-1 bg-subtle p-1 rounded-lg">
                <button
                  onClick={() => setCanvasStyle('glass')}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    canvasStyle === 'glass' ? 'bg-surface text-primary-theme shadow-xs' : 'text-secondary-theme'
                  }`}
                  title="Frosted glass text card"
                >
                  Glass
                </button>
                <button
                  onClick={() => setCanvasStyle('split')}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    canvasStyle === 'split' ? 'bg-surface text-primary-theme shadow-xs' : 'text-secondary-theme'
                  }`}
                  title="High-contrast banner card"
                >
                  Split
                </button>
                <button
                  onClick={() => setCanvasStyle('minimal')}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    canvasStyle === 'minimal' ? 'bg-surface text-primary-theme shadow-xs' : 'text-secondary-theme'
                  }`}
                  title="Minimal typography overlay"
                >
                  Minimal
                </button>
              </div>
            </div>

            {/* The Dynamic Aspect Ratio Canvas with live ratio switcher */}
            <PinCanvas
              data={canvasData}
              onRatioChange={currentPin ? handleActivePinRatioChange : setSelectedSingleRatio}
            />
          </div>

          {/* Pinterest Aspect Ratios & Formats Guide */}
          <div className="p-4 rounded-xl bg-subtle border border-subtle space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-theme">
              <Info className="w-3.5 h-3.5 text-accent-ghost" />
              <span>{t.generator.formatGuideTitle}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-secondary-theme leading-relaxed">
              <div className="p-2 rounded-lg bg-surface border border-subtle">
                <span className="font-bold text-primary-theme block font-mono">2:3 (1000 × 1500)</span>
                <span>{t.generator.aspectGuideStandard}</span>
              </div>
              <div className="p-2 rounded-lg bg-surface border border-subtle">
                <span className="font-bold text-primary-theme block font-mono">9:16 (1080 × 1920)</span>
                <span>{t.generator.aspectGuideStory}</span>
              </div>
              <div className="p-2 rounded-lg bg-surface border border-subtle">
                <span className="font-bold text-primary-theme block font-mono">3:4 (1080 × 1440)</span>
                <span>{t.generator.aspectGuideEditorial}</span>
              </div>
              <div className="p-2 rounded-lg bg-surface border border-subtle">
                <span className="font-bold text-primary-theme block font-mono">1:1 & 4:5</span>
                <span>{t.generator.aspectGuideSquare}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
