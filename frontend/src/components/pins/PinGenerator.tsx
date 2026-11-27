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
  ChevronLeft,
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
import type { BoardItem, ScheduledPinItem } from '../../data/types';
import { apiRequest } from '../../lib/api';
import { GENERATION_REQUEST_TIMEOUT_MS } from '../../lib/apiResilience';
import { pickRecommendedBoard } from '../../lib/boardRecommendation';
import { getExplicitGenerationTopic } from '../../utils/generationTopic';
import { addCalendarDaysInTimezone, formatInstantInTimezone, getDefaultTimezone, resolveScheduleSlotTime } from '../../utils/timezone';
import { createGenerationIdempotencyKey, isDefinitiveGenerationFailure } from '../../utils/generationRetry';
import { clearPendingPinDescriptionIfMatches, readPendingPinDescription, writePendingPinDescription } from '../../utils/pendingPinDescription';
import { enqueuePinSave } from '../../utils/pendingPinSaveQueue';
import { isCurrentPinDescriptionSave } from '../../utils/pinDescriptionSaveGuard';
import { shouldFlushPendingPinDescription } from '../../utils/pendingPinDescriptionSwitch';
import { clearPendingGenerationRequest, createGenerationFingerprint, listPendingGenerationRequests, readPendingGenerationRequest, writePendingGenerationRequest } from '../../utils/pendingGenerationRequest';
import { requireSavedPinsArray } from '../../utils/savedPinsResponse';
import { requireGeneratedPinsArray } from '../../utils/generatedPinsResponse';
import { isExpiredGenerationRecoveryError } from '../../utils/generationRecovery';
import { getGenerationInProgressWait, runGenerationWithRecovery } from '../../utils/generationPolling';
import { isCurrentBillingOwner } from '../../utils/billingOwner';
import { rollbackPinAspectRatioIfUnchanged } from '../../utils/pinAspectRatio';
import { resolvePinterestDestination } from '../../utils/pinterestDestination';
import {
  rememberPinTitleSelection,
  resolvePinTitleSelection,
  restorePinTitleSelectionIfCurrent,
} from '../../utils/pinTitleSelection';
import {
  GeneratedPinVariation,
  SupportedAspectRatio,
} from '../../types/pinGeneration';
import { PinCanvas, PinCanvasData, ASPECT_RATIO_SPECS } from './PinCanvas';
import { useAuth } from '../../context/AuthContext';
import { readAuthToken } from '../../lib/authStorage';

interface PinGeneratorProps {
  boards: BoardItem[];
  initialTopic?: string;
  initialDate?: string;
  initialTime?: string;
  initialBoardId?: string;
  onSchedulePin: (pin: ScheduledPinItem) => void;
  onPinsChanged?: () => void;
  onAddToReview?: (pin: { id: string; pinId: string; title: string; description: string; boardName: string; boardId: string; imageUrl: string; aspectRatio: string; reason: string; trendMetric: string; scheduledTime: string; scheduledDate: string; destinationUrl: string; accountHandle?: string; accountId?: string }) => Promise<void>;
  onGoToCalendar: () => void;
}

const ALL_ASPECT_RATIOS: {
  id: SupportedAspectRatio;
  label: string;
  res: string;
  name: string;
}[] = [
  { id: '2:3', label: '2:3', res: '1000 × 1500 px', name: 'Standard Pin' },
  { id: '9:16', label: '9:16', res: '1080 × 1920 px', name: 'Idea / Story' },
  { id: '3:4', label: '3:4', res: '1080 × 1440 px', name: 'Editorial' },
  { id: '4:5', label: '4:5', res: '1080 × 1350 px', name: 'Portrait' },
  { id: '1:1', label: '1:1', res: '1080 × 1080 px', name: 'Square' },
];

const SUPPORTED_ASPECT_RATIOS: typeof ALL_ASPECT_RATIOS = ALL_ASPECT_RATIOS.filter((item) => item.id === '9:16');

export const PinGenerator: React.FC<PinGeneratorProps> = ({
  boards,
  initialTopic,
  initialDate,
  initialTime,
  initialBoardId,
  onSchedulePin,
  onPinsChanged,
  onAddToReview,
  onGoToCalendar,
}) => {
  const { t, aiContentLanguage, setAiContentLanguage, language } = useI18n();
  const { user } = useAuth();
  const userId = user?.id || '';
  const { enqueueTask } = useNotifications();

  const [pinCount, setPinCount] = useState<number>(5);
  const [topic, setTopic] = useState(
    initialTopic || ''
  );

  // User requested: "Планирование (Scheduling)" - Опубликовать сразу / В умную очередь / Выбрать дату и время
  const [schedulingMode, setSchedulingMode] = useState<'publish_now' | 'smart_queue' | 'custom_datetime'>(
    initialDate ? 'custom_datetime' : 'smart_queue'
  );
  const [customScheduleDate, setCustomScheduleDate] = useState<string>(() => {
    if (initialDate) return initialDate;
    return addCalendarDaysInTimezone(new Date(), getDefaultTimezone(), 1);
  });
  const [customScheduleTime, setCustomScheduleTime] = useState(initialTime || '20:15');

  const [pinterestAccounts, setPinterestAccounts] = useState<Array<{ id: string; username?: string | null }>>([]);
  const [selectedPinterestAccountId, setSelectedPinterestAccountId] = useState('');
  const [pinterestBoards, setPinterestBoards] = useState<Array<{ id: string; name: string }>>([]);
  // Account the loaded board list belongs to: guards against scheduling to a
  // board fetched for the previously selected account.
  const [pinterestBoardsAccountId, setPinterestBoardsAccountId] = useState<string>('');
  const [selectedPinterestBoardId, setSelectedPinterestBoardId] = useState('');

  useEffect(() => {
    let active = true;
    setModelCatalogError('');
    apiRequest('/generation/models')
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data?.models)
          ? data.models.filter((model: any) => model && typeof model.id === 'string'
            && model.id.trim() && Number.isFinite(Number(model.creditsPerImage))
            && Number(model.creditsPerImage) > 0)
          : [];
        setImageModels(rows);
        setSelectedImageModel((current) => rows.some((model: any) => model.id === current)
          ? current
          : rows[0]?.id || '');
        if (!rows.length) setModelCatalogError('Провайдер не вернул доступные модели изображений.');
      })
      .catch((error) => {
        if (!active) return;
        setImageModels([]);
        setSelectedImageModel('');
        setModelCatalogError(error instanceof Error ? error.message : 'Не удалось загрузить модели изображений.');
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    let active = true;
    // A mounted generator can survive an auth-context user switch. Clear every
    // account-scoped value before loading the new owner's Pinterest connections.
    setPinterestAccounts([]);
    setSelectedPinterestAccountId('');
    setPinterestBoards([]);
    setPinterestBoardsAccountId('');
    setSelectedPinterestBoardId('');
    if (!userId) return () => { active = false; };

    apiRequest('/integrations/pinterest/status')
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data?.accounts)
          ? data.accounts.filter((account: any) => account && typeof account.id === 'string' && account.id.trim())
          : [];
        setPinterestAccounts(rows);
        if (rows.length === 1) setSelectedPinterestAccountId(rows[0].id);
      })
      .catch(() => {
        if (active) {
          setPinterestAccounts([]);
          setSelectedPinterestAccountId('');
        }
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    let active = true;
    setPinterestBoards([]);
    setPinterestBoardsAccountId('');
    setSelectedPinterestBoardId('');
    if (!userId || !selectedPinterestAccountId) {
      return () => { active = false; };
    }
    apiRequest(`/integrations/pinterest/boards?account_id=${encodeURIComponent(selectedPinterestAccountId)}`)
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data?.boards)
          ? data.boards.filter((board: any) =>
              board && typeof board.id === 'string' && board.id.trim() &&
              typeof board.name === 'string' && board.name.trim())
          : [];
        setPinterestBoards(rows);
        setPinterestBoardsAccountId(selectedPinterestAccountId);
        setSelectedPinterestBoardId(rows[0]?.id || '');
      })
      .catch(() => {
        if (active) {
          setPinterestBoards([]);
          setPinterestBoardsAccountId('');
          setSelectedPinterestBoardId('');
        }
      });
    return () => { active = false; };
  }, [userId, selectedPinterestAccountId]);


  useEffect(() => {
    if (initialDate) {
      setCustomScheduleDate(initialDate);
      setSchedulingMode('custom_datetime');
    }
    if (initialTime) {
      setCustomScheduleTime(initialTime);
      setSchedulingMode('custom_datetime');
    }
  }, [initialDate, initialTime]);

  useEffect(() => {
    // Clear a previous board's topic when navigation returns without a new topic.
    setTopic(initialTopic || '');
  }, [initialTopic]);

  // Aspect ratio mode: single uniform format or mix/randomizer
  const [aspectMode, setAspectMode] = useState<'single' | 'randomizer'>('single');
  const [selectedSingleRatio, setSelectedSingleRatio] = useState<SupportedAspectRatio>('9:16');
  const [randomizerRatios, setRandomizerRatios] = useState<Record<SupportedAspectRatio, boolean>>({
    '2:3': false,
    '9:16': true,
    '3:4': false,
    '4:5': false,
    '1:1': false,
  });

  // Intelligent Board Recommendation (правило вынесено в src/lib/boardRecommendation.ts, §135)
  const recommendedBoard = useMemo(() => pickRecommendedBoard(boards, topic), [topic, boards]);

  const [selectedBoardId, setSelectedBoardId] = useState<string>(initialBoardId || recommendedBoard?.id || boards[0]?.id || '');

  useEffect(() => {
    // A generation request is bound to the board captured when it starts.
    // Do not let topic recommendations move the editor to another board while
    // its response is in flight, or generated pins could appear under the wrong board.
    if (generationInFlightRef.current) return;
    // An explicit board selected in the calendar takes precedence over topic-based recommendations.
    if (!initialBoardId && recommendedBoard) {
      setSelectedBoardId(recommendedBoard.id);
    }
  }, [recommendedBoard, initialBoardId]);

  useEffect(() => {
    if (generationInFlightRef.current) return;
    if (initialBoardId && boards.some((board) => board.id === initialBoardId)) {
      setSelectedBoardId(initialBoardId);
    }
  }, [initialBoardId, boards]);

  const [tone, setTone] = useState<string>('inspirational');
  const [imageModels, setImageModels] = useState<Array<{ id: string; providerPrice: number; creditsPerImage: number }>>([]);
  const [selectedImageModel, setSelectedImageModel] = useState('');
  const [modelCatalogError, setModelCatalogError] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [canvasStyle, setCanvasStyle] = useState<'minimal' | 'glass' | 'split'>('glass');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSavedPins, setIsLoadingSavedPins] = useState(false);
  const [savedPinsLoadError, setSavedPinsLoadError] = useState('');
  const [savedPinsReloadAttempt, setSavedPinsReloadAttempt] = useState(0);
  const [savingAspectRatioPinId, setSavingAspectRatioPinId] = useState<string | null>(null);
  // Keep rollback targets separate from optimistic canvas selections.
  const pinAspectRatioConfirmedRef = React.useRef<Map<string, SupportedAspectRatio>>(new Map());
  const [isSchedulingPin, setIsSchedulingPin] = useState(false);
  const schedulingPinLockRef = React.useRef(false);
  const [descriptionSaveState, setDescriptionSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [descriptionSavePinId, setDescriptionSavePinId] = useState<string | null>(null);
  const descriptionSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDescriptionSaveRef = React.useRef<{ boardId: string; pinId: string; description: string; revision: number } | null>(null);
  const descriptionSaveRevisionRef = React.useRef(0);
  // Async saves may finish after the user switches boards. Keep the latest
  // board identity synchronously available to completion handlers.
  const descriptionSaveBoardIdRef = React.useRef(selectedBoardId);
  descriptionSaveBoardIdRef.current = selectedBoardId;
  const generationKeyRef = React.useRef<string | null>(null);
  // State updates render asynchronously; this ref blocks same-tick double submissions.
  const generationInFlightRef = React.useRef(false);
  // Serialize edits per pin and let scheduling wait for the final persisted version.
  const pendingPinSavesRef = React.useRef<Map<string, Promise<unknown>>>(new Map());
  // Keep the user's latest title choice available to scheduling even before React
  // has rendered the PATCH response and replaced the currentPin closure.
  const pinTitleSelectionRef = React.useRef<Map<string, string>>(new Map());
  // Track only server-confirmed titles separately from optimistic user selections.
  const pinTitleConfirmedRef = React.useRef<Map<string, string>>(new Map());
  const [generatedPins, setGeneratedPins] = useState<GeneratedPinVariation[]>([]);
  const [activePinIndex, setActivePinIndex] = useState(0);
  const [scheduledSuccess, setScheduledSuccess] = useState(false);
  const [isAddingToReview, setIsAddingToReview] = useState(false);
  const [reviewQueueSuccess, setReviewQueueSuccess] = useState(false);
  const [reviewBatchProgress, setReviewBatchProgress] = useState<{ completed: number; total: number; failed: number } | null>(null);
  const [recoverableGenerations, setRecoverableGenerations] = useState<Array<{
    key: string;
    status: 'processing' | 'completed' | 'failed' | 'unknown' | 'not_found' | 'expired';
    boardId: string;
    pinCount: number;
  }>>([]);
  const [isCheckingRecoveries, setIsCheckingRecoveries] = useState(false);
  const [recoveryCheckAttempt, setRecoveryCheckAttempt] = useState(0);
  const generationRecoveryOwnerIdRef = React.useRef(userId);

  // Recovery metadata is account-scoped. Clear the previous account's rows
  // before paint and invalidate any outstanding lookup when identity changes.
  React.useLayoutEffect(() => {
    generationRecoveryOwnerIdRef.current = userId;
    setRecoverableGenerations([]);
    setIsCheckingRecoveries(false);
  }, [userId]);

  // Look up saved generation identities after login/reload. This is read-only:
  // it never starts generation, clears a key, or changes the user's credit balance.
  useEffect(() => {
    let active = true;
    const ownerId = userId;
    // Blocked browser storage must read as "no session" here, exactly like the
    // shared helper used by the API client and the route guard.
    const token = readAuthToken() || '';
    if (!ownerId || !token) {
      setRecoverableGenerations([]);
      setIsCheckingRecoveries(false);
      return () => { active = false; };
    }

    const identities = listPendingGenerationRequests().slice(-10).reverse();
    if (!identities.length) {
      setRecoverableGenerations([]);
      return () => { active = false; };
    }

    setIsCheckingRecoveries(true);
    const check = async () => {
      const found: Array<{
        key: string;
        status: 'processing' | 'completed' | 'failed' | 'unknown' | 'not_found' | 'expired';
        boardId: string;
        pinCount: number;
      }> = [];
      // Keep requests sequential to avoid a burst against a sleeping/free backend.
      for (const identity of identities) {
        if (!active) return;
        try {
          const result = await apiRequest(`/generation/requests/${encodeURIComponent(identity.idempotencyKey)}`);
          const status = ['processing', 'completed', 'failed', 'unknown'].includes(result?.status)
            ? result.status as 'processing' | 'completed' | 'failed' | 'unknown'
            : 'unknown';
          found.push({
            key: identity.fingerprint,
            status,
            boardId: typeof result?.board_id === 'string' ? result.board_id : '',
            pinCount: status === 'completed' && Array.isArray(result?.pins) ? result.pins.length : 0,
          });
        } catch (error: any) {
          // A 404 can mean an old local key whose server record has expired.
          // Preserve it: a transient/auth/network error must never erase recovery data.
          if (error?.status === 404) {
            found.push({ key: identity.fingerprint, status: 'not_found', boardId: '', pinCount: 0 });
            continue;
          }
          if (isExpiredGenerationRecoveryError(error)) {
            found.push({ key: identity.fingerprint, status: 'expired', boardId: '', pinCount: 0 });
            continue;
          }
          if (error?.status === 401) return;
          // A temporary network/5xx failure is not evidence that the request
          // disappeared. Keep it visible as uncertain so users can retry the
          // read-only status check instead of seeing the recovery entry vanish.
          found.push({ key: identity.fingerprint, status: 'unknown', boardId: '', pinCount: 0 });
          // Keep checking other independent requests after a single failure.
        }
      }
      if (active && isCurrentBillingOwner(generationRecoveryOwnerIdRef.current, ownerId)) {
        setRecoverableGenerations(found);
      }
    };

    void check().finally(() => {
      if (active && isCurrentBillingOwner(generationRecoveryOwnerIdRef.current, ownerId)) {
        setIsCheckingRecoveries(false);
      }
    });
    return () => { active = false; };
  }, [recoveryCheckAttempt, userId]);

  // A count refresh replaces the boards array but must not reset the active pin editor.
  const selectedBoardName = boards.find((board) => board.id === selectedBoardId)?.name || '';

  // Restore persisted pins when the selected board changes or the generator remounts.
  useEffect(() => {
    let active = true;
    if (!selectedBoardName) {
      setGeneratedPins([]);
      setActivePinIndex(0);
      setIsLoadingSavedPins(false);
      setSavedPinsLoadError('');
      return () => { active = false; };
    }

    setGeneratedPins([]);
    setActivePinIndex(0);
    setDescriptionSavePinId(null);
    setDescriptionSaveState('idle');
    setIsLoadingSavedPins(true);
    setSavedPinsLoadError('');

    apiRequest(`/boards/${encodeURIComponent(selectedBoardId)}/pins`)
      .then((rows) => {
        if (!active) return;
        // A malformed/empty HTTP payload is not the same as a board with zero
        // pins. Never turn an unexpected API response into a silent empty state.
        const restored = requireSavedPinsArray(rows).map((row: any) => {
          const title = String(row.title || t.generator.untitledPin);
          const ratio = ALL_ASPECT_RATIOS.some((item) => item.id === row.aspect_ratio)
            ? row.aspect_ratio as SupportedAspectRatio
            : '2:3';
          return {
            id: String(row.id),
            titles: [title],
            selectedTitle: title,
            description: readPendingPinDescription(selectedBoardId, String(row.id))?.description ?? String(row.description || ''),
            altText: '',
            suggestedBoard: selectedBoardName,
            keywords: [],
            headlineOverlay: title,
            subheadlineOverlay: '',
            ctaText: '',
            imageUrl: String(row.image_url || ''),
            tone,
            aspectRatio: ratio,
          };
        });
        restored.forEach((pin) => pinAspectRatioConfirmedRef.current.set(pin.id, pin.aspectRatio));
        setGeneratedPins(restored);
        setActivePinIndex(0);
        const firstPinWithDraft = restored.find((pin) => readPendingPinDescription(selectedBoardId, pin.id));
        if (firstPinWithDraft) {
          // A local draft is newer than the last confirmed server save.
          // Its status is scoped to that pin, not to whichever card is viewed later.
          setDescriptionSavePinId(firstPinWithDraft.id);
          setDescriptionSaveState('error');
        } else {
          setDescriptionSavePinId(null);
          setDescriptionSaveState('idle');
        }
      })
      .catch((error) => {
        console.error('[pins] Не удалось восстановить сохранённые пины:', error);
        if (active) {
          setGeneratedPins([]);
          setSavedPinsLoadError(t.generator.savedPinsLoadError);
        }
      })
      .finally(() => {
        if (active) setIsLoadingSavedPins(false);
      });

    return () => {
      active = false;
      // A debounced description belongs to the previous board selection. Flush it
      // before switching boards or leaving the generator so the last keystrokes
      // are not silently discarded by clearing the timer.
      if (descriptionSaveTimerRef.current) {
        clearTimeout(descriptionSaveTimerRef.current);
        descriptionSaveTimerRef.current = null;
      }
      const pendingDescription = pendingDescriptionSaveRef.current;
      pendingDescriptionSaveRef.current = null;
      if (pendingDescription) {
        const request = enqueuePinSave(
          pendingPinSavesRef.current,
          pendingDescription.pinId,
          () => apiRequest(`/pins/${encodeURIComponent(pendingDescription.pinId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ description: pendingDescription.description }),
          }).then((result) => {
            clearPendingPinDescriptionIfMatches(
              pendingDescription.boardId,
              pendingDescription.pinId,
              pendingDescription.description,
            );
            return result;
          }),
        );
        void request.catch((error) => {
          console.error('[pins] Не удалось завершить отложенное сохранение описания:', error);
        });
      }
    };
  }, [selectedBoardId, selectedBoardName, savedPinsReloadAttempt]);

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
    const currentTopic = getExplicitGenerationTopic(topic);
    if (!currentTopic) {
      window.alert(t.generator.topicRequired);
      return;
    }
    if (generationInFlightRef.current) return;
    generationInFlightRef.current = true;
    setIsGenerating(true);
    setScheduledSuccess(false);

    let requestFingerprint = '';
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
        model: selectedImageModel,
        aspect_ratio: aspectRatio,
        mixed_ratios: targetRatios,
      };
      requestFingerprint = createGenerationFingerprint(JSON.stringify({ boardId: selectedBoard.id, ...requestBody }));
      const storedRequest = readPendingGenerationRequest(requestFingerprint);
      if (storedRequest?.fingerprint !== requestFingerprint || !storedRequest.idempotencyKey) {
        generationKeyRef.current = createGenerationIdempotencyKey();
        writePendingGenerationRequest(requestFingerprint, generationKeyRef.current);
      } else {
        // Restore the durable request identity after a remount or page reload.
        generationKeyRef.current = storedRequest.idempotencyKey;
      }
      // The backend generates up to ten images sequentially (up to ~90 s each), so this
      // request can legitimately run for several minutes. The default request deadline
      // would abort it while the server kept working and charging credits.
      // A reload during generation, a double submit, or a second tab replaying the stored
      // request all produce 409 "generation_in_progress". The same idempotency key must be
      // replayed — rotating it would start and charge a second generation — so wait the
      // time the server asks for and try again.
      const generationKey = generationKeyRef.current || '';
      const rows = await runGenerationWithRecovery(
        () =>
          apiRequest(`/boards/${encodeURIComponent(selectedBoard.id)}/pins/generate`, {
            method: 'POST',
            headers: { 'Idempotency-Key': generationKey },
            body: JSON.stringify(requestBody),
            timeoutMs: GENERATION_REQUEST_TIMEOUT_MS,
          }),
        {
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          now: () => Date.now(),
          getWaitSeconds: getGenerationInProgressWait,
        }
      );

      // Do not discard the recovery identity until every returned pin has the
      // durable fields required by the canvas. A malformed success payload is
      // recoverable from the server with the same key; it is not a completed UI result.
      const validatedRows = requireGeneratedPinsArray(rows);

      const results: GeneratedPinVariation[] = validatedRows.map((row: any) => ({
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

      results.forEach((pin) => pinAspectRatioConfirmedRef.current.set(pin.id, pin.aspectRatio));
      setGeneratedPins(results);
      setActivePinIndex(0);
      // Refresh board-card counts only after the server has confirmed all generated pins.
      onPinsChanged?.();
      generationKeyRef.current = null;
      clearPendingGenerationRequest(requestFingerprint);
    } catch (err) {
      // The server only emits generation_request_failed after a definitive failure.
      // Rotate the key then; unknown/in-progress outcomes must keep their original key.
      if (isDefinitiveGenerationFailure(err)) {
        generationKeyRef.current = createGenerationIdempotencyKey();
        if (requestFingerprint) writePendingGenerationRequest(requestFingerprint, generationKeyRef.current);
      }
      console.error('Error generating pins:', err);
      window.alert(err instanceof Error ? err.message : t.generator.errorGeneratePins);
    } finally {
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  };

  const currentPin = generatedPins[activePinIndex];
  const currentDescriptionSaveState = currentPin
    ? descriptionSavePinId === currentPin.id
      ? descriptionSaveState
      : readPendingPinDescription(selectedBoardId, currentPin.id) ? 'error' : 'idle'
    : 'idle';

  const persistPinPatch = (pinId: string, patch: Record<string, string>) => {
    return enqueuePinSave(
      pendingPinSavesRef.current,
      pinId,
      () => apiRequest(`/pins/${encodeURIComponent(pinId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    );
  };

  // Persist the selected pin's format so it survives a reload and is used by later API operations.
  const handleActivePinRatioChange = async (newRatio: SupportedAspectRatio) => {
    if (schedulingPinLockRef.current || !currentPin || currentPin.aspectRatio === newRatio) return;
    const pinId = currentPin.id;
    const confirmedRatio = pinAspectRatioConfirmedRef.current.get(pinId) ?? currentPin.aspectRatio;
    // Queue rapid choices instead of disabling the control while a PATCH is in flight.
    // The queue preserves request order; rollback always targets the last server-confirmed value.
    setGeneratedPins((previous) => previous.map((pin) =>
      pin.id === pinId ? { ...pin, aspectRatio: newRatio } : pin
    ));
    setSavingAspectRatioPinId(pinId);
    try {
      await persistPinPatch(pinId, { aspect_ratio: newRatio });
      pinAspectRatioConfirmedRef.current.set(pinId, newRatio);
    } catch (error) {
      setGeneratedPins((previous) =>
        rollbackPinAspectRatioIfUnchanged(previous, pinId, newRatio, confirmedRatio)
      );
      console.error('[pins] Не удалось сохранить формат:', error);
      window.alert(error instanceof Error ? error.message : t.generator.errorSaveFormat);
    } finally {
      // An earlier request must not clear the saving state while a newer queued
      // ratio PATCH for the same pin is still pending.
      if (!pendingPinSavesRef.current.has(pinId)) {
        setSavingAspectRatioPinId((activeId) => activeId === pinId ? null : activeId);
      }
    }
  };

  const handleTitleSelect = async (title: string) => {
    if (schedulingPinLockRef.current || !currentPin) return;
    const pinId = currentPin.id;
    // Keep the optimistic choice for scheduling, but never use it as the rollback
    // target: only a successful PATCH may advance the confirmed server value.
    rememberPinTitleSelection(pinTitleSelectionRef.current, pinId, title);
    setGeneratedPins((previous) => previous.map((pin) => pin.id === pinId ? {
      ...pin,
      selectedTitle: title,
      headlineOverlay: title.length > 36 ? title.slice(0, 36) + '...' : title,
    } : pin));
    try {
      await persistPinPatch(pinId, { title });
      pinTitleConfirmedRef.current.set(pinId, title);
    } catch (error) {
      // A prior queued choice may have succeeded while this request was waiting.
      // Roll back to that confirmed value (or the original server value), never
      // to another unconfirmed optimistic choice.
      const confirmedTitle = pinTitleConfirmedRef.current.get(pinId) ?? currentPin.selectedTitle;
      const restored = restorePinTitleSelectionIfCurrent(pinTitleSelectionRef.current, pinId, title, confirmedTitle);
      if (restored) {
        setGeneratedPins((previous) => previous.map((pin) => pin.id === pinId && pin.selectedTitle === title ? {
          ...pin,
          selectedTitle: confirmedTitle,
          headlineOverlay: confirmedTitle.length > 36 ? confirmedTitle.slice(0, 36) + '...' : confirmedTitle,
        } : pin));
      }
      console.error('[pins] Не удалось сохранить название:', error);
      window.alert(error instanceof Error ? error.message : t.generator.errorSaveTitle);
    }
  };

  const savePinDescription = async (boardId: string, pinId: string, description: string, revision: number) => {
    const isCurrentSave = () => isCurrentPinDescriptionSave({
      revision,
      currentRevision: descriptionSaveRevisionRef.current,
      boardId,
      currentBoardId: descriptionSaveBoardIdRef.current,
    });
    if (isCurrentSave()) {
      setDescriptionSavePinId(pinId);
      setDescriptionSaveState('saving');
    }
    try {
      await persistPinPatch(pinId, { description });
      // A slower, older PATCH may finish after the user has typed a newer draft.
      // Remove only the exact value this request saved; preserve any newer text.
      clearPendingPinDescriptionIfMatches(boardId, pinId, description);
      if (isCurrentSave()) setDescriptionSaveState('saved');
      return true;
    } catch (error) {
      console.error('[pins] Не удалось сохранить описание:', error);
      if (isCurrentSave()) setDescriptionSaveState('error');
      return false;
    }
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (schedulingPinLockRef.current || !currentPin) return;
    const description = e.target.value;
    const pinId = currentPin.id;
    const previousPending = pendingDescriptionSaveRef.current;
    if (descriptionSaveTimerRef.current) {
      clearTimeout(descriptionSaveTimerRef.current);
      descriptionSaveTimerRef.current = null;
    }
    // The debounce timer is shared by the editor. Switching to another pin
    // must enqueue the previous pin's last keystrokes before replacing its slot.
    if (previousPending && shouldFlushPendingPinDescription(previousPending, selectedBoardId, pinId)) {
      pendingDescriptionSaveRef.current = null;
      void savePinDescription(
        previousPending.boardId,
        previousPending.pinId,
        previousPending.description,
        previousPending.revision,
      );
    }
    const updated = [...generatedPins];
    updated[activePinIndex] = { ...currentPin, description };
    setGeneratedPins(updated);
    setDescriptionSavePinId(pinId);
    setDescriptionSaveState('idle');
    const revision = ++descriptionSaveRevisionRef.current;
    descriptionSaveTimerRef.current = setTimeout(() => {
      descriptionSaveTimerRef.current = null;
      if (pendingDescriptionSaveRef.current?.revision === revision) {
        pendingDescriptionSaveRef.current = null;
      }
      void savePinDescription(selectedBoardId, pinId, description, revision);
    }, 800);
    writePendingPinDescription(selectedBoardId, pinId, description);
    pendingDescriptionSaveRef.current = { boardId: selectedBoardId, pinId, description, revision };
  };

  const handlePushToCalendar = async () => {
    if (!currentPin || schedulingPinLockRef.current) return;
    schedulingPinLockRef.current = true;
    setIsSchedulingPin(true);
    try {
      // A debounced description may not have entered the per-pin request queue yet.
      // Flush it before scheduling so the calendar action cannot overtake the latest edit.
      const pendingDescription = pendingDescriptionSaveRef.current?.pinId === currentPin.id
        ? pendingDescriptionSaveRef.current
        : null;
      const recoveredDescription = readPendingPinDescription(selectedBoardId, currentPin.id);
      const descriptionToFlush = pendingDescription || (recoveredDescription ? {
        boardId: selectedBoardId,
        pinId: currentPin.id,
        description: recoveredDescription.description,
        revision: descriptionSaveRevisionRef.current,
      } : null);
      if (descriptionToFlush) {
        if (descriptionSaveTimerRef.current) {
          clearTimeout(descriptionSaveTimerRef.current);
          descriptionSaveTimerRef.current = null;
        }
        if (pendingDescriptionSaveRef.current?.pinId === currentPin.id) {
          pendingDescriptionSaveRef.current = null;
        }
        const revision = ++descriptionSaveRevisionRef.current;
        const saved = await savePinDescription(
          descriptionToFlush.boardId,
          descriptionToFlush.pinId,
          descriptionToFlush.description,
          revision,
        );
        if (!saved) {
          window.alert(t.generator.errorSaveDescriptionBeforeSchedule);
          return;
        }
      }
  
      // Read the queue after flushing the debounce: the flush itself may have enqueued
      // the final PATCH, and title/format updates may also still be in flight.
      const pendingSave = pendingPinSavesRef.current.get(currentPin.id);
      if (pendingSave) {
        try {
          await pendingSave;
        } catch (error) {
          console.error('[pins] Не удалось завершить сохранение перед планированием:', error);
          window.alert(error instanceof Error ? error.message : t.generator.errorSaveSchedule);
          return;
        }
      }
      const pinterestDestination = resolvePinterestDestination(
        pinterestAccounts,
        pinterestBoards,
        selectedPinterestAccountId,
        selectedPinterestBoardId,
        pinterestBoardsAccountId,
      );
      if (!pinterestDestination) {
        window.alert(t.generator.errorDestinationBoardChanged);
        return;
      }
  
      const board = boards.find((b) => b.id === selectedBoardId) || boards[0];
      if (!board) {
        window.alert(t.generator.errorCreateInternalBoard);
        return;
      }
  
      // Derive both date and time from the same instant in the user's selected
      // timezone. Using the UI locale here can emit 12-hour strings (e.g. 5:30 PM),
      // which the scheduling API correctly rejects because it expects HH:mm.
      const nowInUserTimezone = formatInstantInTimezone(new Date(), getDefaultTimezone(language));
      const scheduledDate =
        schedulingMode === 'publish_now'
          ? nowInUserTimezone.date
          : schedulingMode === 'custom_datetime'
          ? customScheduleDate
          : addCalendarDaysInTimezone(new Date(), getDefaultTimezone(language), 1);
  
      const scheduledTime =
        schedulingMode === 'publish_now'
          ? nowInUserTimezone.time
          : schedulingMode === 'custom_datetime'
          ? customScheduleTime
          : '20:15';

      // Image generation and editing can take long enough for a previously valid
      // calendar slot to expire. Re-check immediately before persisting the schedule.
      if (schedulingMode === 'custom_datetime') {
        try {
          const safeTime = resolveScheduleSlotTime(
            scheduledDate,
            getDefaultTimezone(language),
            scheduledTime,
          );
          if (safeTime !== scheduledTime) {
            setCustomScheduleTime(safeTime);
            window.alert(t.generator.errorSelectedTimeAdjustedTemplate.replace('{time}', safeTime));
            return;
          }
        } catch {
          window.alert(t.generator.errorDateTimeUnavailable);
          return;
        }
      }
  
      // До подтверждения Pinterest любой элемент остаётся запланированным, не published.
      const status = 'scheduled' as const;
  
      const scheduledTitle = resolvePinTitleSelection(pinTitleSelectionRef.current, currentPin.id, currentPin.selectedTitle);
      const newScheduledPin: ScheduledPinItem = {
        id: `pending-${Date.now()}`,
        pinId: currentPin.id,
        title: scheduledTitle,
        boardId: board.id,
        boardName: board.name,
        pinterestBoardId: pinterestDestination.boardId,
        pinterestAccountId: pinterestDestination.accountId,
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
          .replace('{title}', scheduledTitle.slice(0, 32))
          .replace('{date}', scheduledDate)
          .replace('{time}', scheduledTime),
        type: 'generation',
        actionTab: 'calendar',
        durationMs: 2500,
        completionTitle: t.generator.scheduledCompletionTitle,
        completionMessage: t.generator.scheduledCompletionMessageTemplate.replace('{board}', board.name),
      });
    } finally {
      schedulingPinLockRef.current = false;
      setIsSchedulingPin(false);
    }
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

      {isCheckingRecoveries && (
        <div className="custom-card p-3 rounded-xl text-xs text-secondary-theme flex items-center gap-2" role="status">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          {t.generator.recoveryChecking}
        </div>
      )}
      {recoverableGenerations.length > 0 && (
        <section className="custom-card p-4 rounded-xl space-y-3" aria-label={t.generator.recoveryTitle}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw className="w-4 h-4 text-accent-ghost shrink-0" />
              <h2 className="text-sm font-bold text-primary-theme">
                {t.generator.recoveryTitle}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setRecoveryCheckAttempt((attempt) => attempt + 1)}
              disabled={isCheckingRecoveries}
              className="shrink-0 px-3 py-2 rounded-lg border border-subtle text-xs font-semibold text-secondary-theme hover:text-primary-theme disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCheckingRecoveries ? t.generator.recoveryCheckingButton : t.generator.recoveryCheckAgain}
            </button>
          </div>
          <p className="text-xs text-secondary-theme">
            {t.generator.recoveryDescription}
          </p>
          <div className="space-y-2">
            {recoverableGenerations.map((item) => {
              const board = boards.find((candidate) => candidate.id === item.boardId);
              const label = item.status === 'completed'
                ? t.generator.recoveryCompletedTemplate.replace('{count}', String(item.pinCount))
                : item.status === 'processing'
                  ? t.generator.recoveryProcessing
                  : item.status === 'failed'
                    ? t.generator.recoveryFailed
                    : item.status === 'not_found'
                    ? t.generator.recoveryNotFound
                    : item.status === 'expired'
                      ? t.generator.recoveryExpired
                      : t.generator.recoveryUnknown;
              return (
                <div key={item.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-subtle border border-subtle">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-primary-theme">{label}</p>
                    {board && <p className="text-[11px] text-muted-theme">{board.name}</p>}
                  </div>
                  {item.status === 'completed' && item.pinCount > 0 && board && (
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => {
                        // The completed pins are already persisted. Switch to their board;
                        // the existing board loader restores them without another AI call.
                        setSelectedBoardId(item.boardId);
                        setSavedPinsReloadAttempt((attempt) => attempt + 1);
                      }}
                      className="px-3 py-2 rounded-lg accent-btn text-xs font-semibold"
                    >
                      {t.generator.recoveryOpenSavedPins}
                    </button>
                  )}
                  {item.status === 'completed' && !board && (
                    <span className="text-[11px] text-muted-theme">
                      {t.generator.recoveryBoardUnavailable}
                    </span>
                  )}
                  {item.status === 'expired' && (
                    <button
                      type="button"
                      onClick={() => {
                        clearPendingGenerationRequest(item.key);
                        setRecoverableGenerations((current) => current.filter((entry) => entry.key !== item.key));
                      }}
                      className="px-3 py-2 rounded-lg border border-subtle text-xs font-semibold text-secondary-theme hover:bg-subtle"
                    >
                      {t.generator.recoveryDismiss}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

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
                  {SUPPORTED_ASPECT_RATIOS.map((item) => {
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
                disabled={isGenerating}
                className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60 disabled:cursor-not-allowed"
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
                disabled={isGenerating || isLoadingSavedPins || !selectedImageModel || imageModels.length === 0}
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

          {isLoadingSavedPins && (
            <div className="custom-card p-4 rounded-xl text-sm text-secondary-theme flex items-center gap-2" role="status">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{t.generator.savedPinsLoading}</span>
            </div>
          )}
          {savedPinsLoadError && (
            <div className="custom-card p-4 rounded-xl text-sm text-red-600 space-y-3" role="alert">
              <p>{savedPinsLoadError}</p>
              <button
                type="button"
                onClick={() => setSavedPinsReloadAttempt((attempt) => attempt + 1)}
                disabled={isLoadingSavedPins}
                className="px-4 py-2 rounded-lg border border-current font-semibold disabled:opacity-50"
              >
                {t.generator.savedPinsRetry}
              </button>
            </div>
          )}

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
                      disabled={isSchedulingPin}
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
                    {SUPPORTED_ASPECT_RATIOS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { void handleActivePinRatioChange(item.id); }}
                        disabled={isSchedulingPin}
                        className={`px-2 py-1 text-xs font-mono rounded-lg border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
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
                      <button
                        key={idx}
                        type="button"
                        aria-pressed={currentPin.selectedTitle === titleOption}
                        onClick={() => { void handleTitleSelect(titleOption); }}
                        disabled={isSchedulingPin}
                        className={`w-full text-left p-2.5 rounded-xl border text-xs md:text-sm cursor-pointer transition-all flex items-start gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Pin SEO Description */}
              {currentPin && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="pin-description" className="text-xs font-semibold text-secondary-theme uppercase tracking-wider">
                      {t.generator.descriptionLabel}
                    </label>
                    <span className="text-[11px] text-muted-theme" aria-live="polite">
                      {currentDescriptionSaveState === 'saving' ? t.generator.descriptionSaving :
                        currentDescriptionSaveState === 'saved' ? t.generator.descriptionSaved :
                        currentDescriptionSaveState === 'error' ? t.generator.descriptionSaveError : ''}
                      {' '}{currentPin.description.length} / 500
                    </span>
                    {currentDescriptionSaveState === 'error' && (
                      <button
                        type="button"
                        className="text-[11px] text-accent underline underline-offset-2"
                        onClick={() => {
                          const revision = ++descriptionSaveRevisionRef.current;
                          writePendingPinDescription(selectedBoardId, currentPin.id, currentPin.description);
                          void savePinDescription(selectedBoardId, currentPin.id, currentPin.description, revision);
                        }}
                      >
                        {t.generator.retryDescriptionSave}
                      </button>
                    )}
                  </div>
                  <textarea
                    id="pin-description"
                    value={currentPin.description}
                    onChange={handleDescriptionChange}
                    disabled={isSchedulingPin}
                    maxLength={500}
                    onBlur={(event) => {
                      if (descriptionSaveTimerRef.current) {
                        clearTimeout(descriptionSaveTimerRef.current);
                        descriptionSaveTimerRef.current = null;
                      }
                      pendingDescriptionSaveRef.current = null;
                      const revision = ++descriptionSaveRevisionRef.current;
                      writePendingPinDescription(selectedBoardId, currentPin.id, event.currentTarget.value);
                       void savePinDescription(selectedBoardId, currentPin.id, event.currentTarget.value, revision);
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

              {/* Add the persisted generated pin to the durable manual-review queue. */}
              {onAddToReview && currentPin && (
                <button
                  type="button"
                  onClick={async () => {
                    const board = boards.find((item) => item.id === selectedBoardId);
                    if (!board || !currentPin || !onAddToReview || isAddingToReview) return;
                    setIsAddingToReview(true);
                    setReviewQueueSuccess(false);
                    try {
                      if (descriptionSaveTimerRef.current) {
                        clearTimeout(descriptionSaveTimerRef.current);
                        descriptionSaveTimerRef.current = null;
                      }
                      const queuedDescription = pendingDescriptionSaveRef.current;
                      const recoveredDescription = readPendingPinDescription(board.id, currentPin.id);
                      const descriptionToFlush = queuedDescription?.pinId === currentPin.id && queuedDescription.boardId === board.id
                        ? queuedDescription
                        : recoveredDescription
                          ? {
                              boardId: board.id,
                              pinId: currentPin.id,
                              description: recoveredDescription.description,
                              revision: descriptionSaveRevisionRef.current,
                            }
                          : null;
                      if (descriptionToFlush) {
                        if (descriptionSaveTimerRef.current) {
                          clearTimeout(descriptionSaveTimerRef.current);
                          descriptionSaveTimerRef.current = null;
                        }
                        if (queuedDescription?.pinId === currentPin.id && queuedDescription.boardId === board.id) {
                          pendingDescriptionSaveRef.current = null;
                        }
                        const revision = ++descriptionSaveRevisionRef.current;
                        const saved = await savePinDescription(
                          board.id,
                          currentPin.id,
                          descriptionToFlush.description,
                          revision,
                        );
                        if (!saved) {
                          throw new Error(t.generator.errorSaveReviewDescription);
                        }
                      }
                      const pendingSave = pendingPinSavesRef.current.get(currentPin.id);
                      if (pendingSave) await pendingSave;
                      const title = resolvePinTitleSelection(pinTitleSelectionRef.current, currentPin.id, currentPin.selectedTitle);
                      await onAddToReview({
                        id: `review-${currentPin.id}`,
                        pinId: currentPin.id,
                        title,
                        description: currentPin.description,
                        boardName: board.name,
                        boardId: board.id,
                        imageUrl: currentPin.imageUrl,
                        aspectRatio: currentPin.aspectRatio,
                        reason: t.generator.reviewQueueReason,
                        trendMetric: '',
                        scheduledDate: customScheduleDate,
                        scheduledTime: customScheduleTime,
                        destinationUrl,
                        accountHandle: pinterestAccounts.find((account) => account.id === selectedPinterestAccountId)?.username ?? undefined,
                        accountId: selectedPinterestAccountId || undefined,
                      });
                      setReviewQueueSuccess(true);
                    } catch (error) {
                      window.alert(error instanceof Error ? error.message : t.generator.errorAddToReview);
                    } finally {
                      setIsAddingToReview(false);
                    }
                  }}
                  disabled={!currentPin.id || !currentPin.imageUrl || !boards.some((item) => item.id === selectedBoardId) || isAddingToReview}
                  className="w-full py-2.5 px-4 rounded-xl text-xs md:text-sm font-semibold border border-accent text-accent hover:bg-accent/10 disabled:opacity-50"
                >
                  {isAddingToReview ? t.generator.addToReviewSaving : reviewQueueSuccess ? t.generator.addToReviewSuccess : t.generator.addToReviewBtn}
                </button>
              )}

              {/* Action Buttons: Schedule to Calendar */}
              <div className="pt-3 border-t border-subtle flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handlePushToCalendar}
                  disabled={!selectedPinterestAccountId || !selectedPinterestBoardId || !currentPin || isSchedulingPin}
                  className="w-full sm:flex-1 accent-btn py-2.5 px-4 rounded-xl text-xs md:text-sm font-semibold flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Calendar className="w-4 h-4" />
                  <span>{isSchedulingPin ? t.generator.schedulingSaving : t.generator.pushToCalendarBtn}</span>
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
