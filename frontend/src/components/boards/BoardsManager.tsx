import React, { useState } from 'react';
import {
  Plus,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { BoardItem } from '../../data/mockData';

interface BoardsManagerProps {
  boards: BoardItem[];
  loadError?: string;
  isLoading?: boolean;
  onRetry?: () => void;
  onAddBoard: (board: BoardItem, createRequestId: string) => Promise<void> | void;\n  onUpdateBoard: (boardId: string, patch: { title: string; category: string }) => Promise<void>;
}

export const BoardsManager: React.FC<BoardsManagerProps> = ({
  boards,
  loadError,
  isLoading = false,
  onRetry,
  onAddBoard,
}) => {
  const { t } = useI18n();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [category, setCategory] = useState('Home Decor');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createRequestId, setCreateRequestId] = useState(() => crypto.randomUUID());\n  const [editingBoard, setEditingBoard] = useState<BoardItem | null>(null);\n  const [editName, setEditName] = useState('');\n  const [editCategory, setEditCategory] = useState('Home Decor');\n  const [editSaving, setEditSaving] = useState(false);\n  const [editError, setEditError] = useState('');

  const closeCreateModal = () => {
    if (saving) return;
    setCreateModalOpen(false);
    setCreateError('');
  };

  const openEditBoard = (board: BoardItem) => {
    setEditingBoard(board);
    setEditName(board.name);
    setEditCategory(board.category || 'Home Decor');
    setEditError('');
  };

  const closeEditBoard = () => {
    if (editSaving) return;
    setEditingBoard(null);
    setEditError('');
  };

  const handleUpdateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = editName.trim();
    if (!editingBoard || !title || editSaving) return;
    setEditSaving(true);
    setEditError('');
    try {
      await onUpdateBoard(editingBoard.id, { title, category: editCategory });
      setEditingBoard(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : t.boards.updateErrorFallback);
    } finally {
      setEditSaving(false);
    }
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = boardName.trim();
    if (!title || saving) return;

    const newBoard: BoardItem = {
      id: `draft-${Date.now()}`,
      name: title,
      category,
      pinCount: 0,
      monthlyViews: 0,
      seoScore: 0,
      missingKeywords: [],
      targetWeeklyPins: 0,
      coverImage: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    };

    setSaving(true);
    setCreateError('');
    try {
      await onAddBoard(newBoard, createRequestId);
      setCreateRequestId(crypto.randomUUID());
      setBoardName('');
      setCreateModalOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error
        ? error.message
        : t.boards.saveErrorFallback);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary-theme font-heading">
            {t.boards.title}
          </h1>
          <p className="text-xs md:text-sm text-secondary-theme mt-1">
            {t.boards.subtitle}
          </p>
        </div>

        <button
          onClick={() => { setCreateError(''); setCreateModalOpen(true); }}
          className="accent-btn self-start sm:self-auto px-4 py-2 rounded-xl text-xs md:text-sm font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.boards.createBoardBtn}</span>
        </button>
      </div>

      {/* Boards Grid */}
      {loadError && (
        <div role="alert" className="custom-card p-5 rounded-2xl text-sm text-secondary-theme flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span>{loadError}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="accent-btn px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer">
              {t.boards.retryLabel}
            </button>
          )}
        </div>
      )}
      {isLoading && boards.length === 0 ? (
        <div role="status" aria-live="polite" className="custom-card p-8 rounded-2xl text-center text-sm text-secondary-theme">
          {t.boards.loadingLabel}
        </div>
      ) : boards.length === 0 && !loadError ? (
        <div className="custom-card p-8 rounded-2xl text-center text-sm text-secondary-theme">
          {t.dashboard.emptyBoards}
        </div>
      ) : boards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {boards.map((board) => (
          <div key={board.id} className="custom-card p-5 rounded-2xl space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => openEditBoard(board)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium text-secondary-theme hover:bg-subtle cursor-pointer"
                aria-label={`${t.boards.editBoardBtn}: ${board.name}`}
              >
                <Pencil className="w-3.5 h-3.5" />
                {t.boards.editBoardBtn}
              </button>
            </div>
            <div className="flex items-start gap-4">
              <img
                src={board.coverImage}
                alt={board.name}
                referrerPolicy="no-referrer"
                className="w-16 h-24 object-cover rounded-xl border border-subtle shrink-0 shadow-xs"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-theme">
                  {board.category}
                </span>
                <h3 className="text-base font-bold text-primary-theme line-clamp-1 font-heading">
                  {board.name}
                </h3>
              </div>

            </div>

          </div>
          ))}
        </div>
      )}

      {/* Edit Board Modal */}
      {editingBoard && (
        <div onClick={closeEditBoard} className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="edit-board-title" className="custom-card max-w-md w-full p-6 rounded-2xl space-y-4 shadow-2xl">
            <h2 id="edit-board-title" className="text-lg font-bold text-primary-theme font-heading">{t.boards.editBoardTitle}</h2>
            {editError && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">{editError}</p>}
            <form onSubmit={handleUpdateBoard} className="space-y-4">
              <div>
                <label htmlFor="edit-board-name" className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">{t.boards.boardTitleLabel}</label>
                <input id="edit-board-name" type="text" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={100} disabled={editSaving} required className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div>
                <label htmlFor="edit-board-category" className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">{t.boards.boardCategoryLabel}</label>
                <select id="edit-board-category" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} disabled={editSaving} className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent">
                  <option value="Home Decor">{t.boards.categoryHomeDecor}</option>
                  <option value="Recipes">{t.boards.categoryRecipes}</option>
                  <option value="Wellness">{t.boards.categoryWellness}</option>
                  <option value="Travel">{t.boards.categoryTravel}</option>
                  <option value="Digital Products">{t.boards.categoryDigitalProducts}</option>
                  <option value="Fashion">{t.boards.categoryFashion}</option>
                </select>
              </div>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={closeEditBoard} disabled={editSaving} className="px-4 py-2 rounded-xl text-xs font-medium border border-subtle text-secondary-theme hover:bg-subtle cursor-pointer disabled:opacity-50">{t.common.cancel}</button>
                <button type="submit" disabled={editSaving || !editName.trim()} className="accent-btn px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50">{editSaving ? t.boards.savingLabel : t.boards.updateBoardBtn}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Board Modal */}
      {createModalOpen && (
        <div
          onClick={closeCreateModal}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-board-title"
            className="custom-card max-w-md w-full p-6 rounded-2xl space-y-4 shadow-2xl"
          >
            <h2 id="create-board-title" className="text-lg font-bold text-primary-theme font-heading">
              {t.boards.createBoardBtn}
            </h2>

            {createError && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">{createError}</p>}

            <form onSubmit={handleCreateBoard} className="space-y-4">
              <div>
                <label htmlFor="create-board-name" className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">
                  {t.boards.boardTitleLabel}
                </label>
                <input
                  id="create-board-name"
                  type="text"
                  value={boardName}
                  onChange={(e) => { setBoardName(e.target.value); setCreateRequestId(crypto.randomUUID()); }}
                  placeholder={t.boards.boardTitlePlaceholder}
                  className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                  maxLength={100}
                  disabled={saving}
                  required
                />
              </div>

              <div>
                <label htmlFor="create-board-category" className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">
                  {t.boards.boardCategoryLabel}
                </label>
                <select
                  id="create-board-category"
                  value={category}
                  onChange={(e) => { setCategory(e.target.value); setCreateRequestId(crypto.randomUUID()); }}
                  disabled={saving}
                  className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="Home Decor">{t.boards.categoryHomeDecor}</option>
                  <option value="Recipes">{t.boards.categoryRecipes}</option>
                  <option value="Wellness">{t.boards.categoryWellness}</option>
                  <option value="Travel">{t.boards.categoryTravel}</option>
                  <option value="Digital Products">{t.boards.categoryDigitalProducts}</option>
                  <option value="Fashion">{t.boards.categoryFashion}</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-xs font-medium border border-subtle text-secondary-theme hover:bg-subtle cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving || !boardName.trim()}
                  className="accent-btn px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? t.boards.savingLabel : t.common.create}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
