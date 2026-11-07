import React, { useState } from 'react';
import {
  Layers,
  Sparkles,
  Plus,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { BoardItem } from '../../data/mockData';

interface BoardsManagerProps {
  boards: BoardItem[];
  onAddBoard: (board: BoardItem) => void;
}

export const BoardsManager: React.FC<BoardsManagerProps> = ({
  boards,
  onAddBoard,
}) => {
  const { t } = useI18n();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [category, setCategory] = useState('Home Decor');

  const handleCreateBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardName.trim()) return;

    const newBoard: BoardItem = {
      id: `b-${Date.now()}`,
      name: boardName.trim(),
      category,
      pinCount: 0,
      monthlyViews: 0,
      seoScore: 92,
      missingKeywords: ['aesthetic inspiration', 'trending guide', 'ideas 2026'],
      targetWeeklyPins: 7,
      coverImage: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    };

    onAddBoard(newBoard);
    setBoardName('');
    setCreateModalOpen(false);
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
          onClick={() => setCreateModalOpen(true)}
          className="accent-btn self-start sm:self-auto px-4 py-2 rounded-xl text-xs md:text-sm font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.boards.createBoardBtn}</span>
        </button>
      </div>

      {/* Boards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {boards.map((board) => (
          <div key={board.id} className="custom-card p-5 rounded-2xl space-y-4">
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
                <p className="text-xs text-secondary-theme pt-1">
                  {t.boards.metricsUnavailable || 'Статистика Pinterest пока недоступна'}
                </p>
              </div>

            </div>

            <div className="pt-3 border-t border-subtle text-xs text-muted-theme">
              {t.boards.metricsUnavailable || 'Показываем только сохранённые данные доски. Метрики и SEO-оценки пока не подключены.'}
            </div>
          </div>
        ))}
      </div>

      {/* Create Board Modal */}
      {createModalOpen && (
        <div
          onClick={() => setCreateModalOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="custom-card max-w-md w-full p-6 rounded-2xl space-y-4 shadow-2xl"
          >
            <h2 className="text-lg font-bold text-primary-theme font-heading">
              {t.boards.createBoardBtn}
            </h2>

            <form onSubmit={handleCreateBoard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">
                  Board Title
                </label>
                <input
                  type="text"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  placeholder="e.g. Earthy Ceramic Pottery & Clay Decor"
                  className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-secondary-theme uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="Home Decor">Home Decor & Architecture</option>
                  <option value="Recipes">Recipes & Culinary</option>
                  <option value="Wellness">Clean Beauty & Wellness</option>
                  <option value="Travel">Travel & Escapes</option>
                  <option value="Digital Products">Digital Products & SaaS</option>
                  <option value="Fashion">Fashion & Capsule Wardrobe</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium border border-subtle text-secondary-theme hover:bg-subtle cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="accent-btn px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
                >
                  {t.common.create}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
