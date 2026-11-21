/**
 * Section 135.
 *
 * The generator used to pick a board from the topic with two hardcoded lists: English and Russian stems
 * for the topic, English stems for the board category. A customer writing in Spanish, Portuguese, German,
 * French or Chinese never matched anything and was quietly given `boards[1]` - an arbitrary board - while
 * a Russian customer's own board called "Рецепты" never matched the English stem "recipe".
 *
 * The rule lives here so it can be tested on all seven supported languages instead of being read.
 */

export type BoardCategoryHint = 'recipe' | 'wellness' | 'travel';

export const BOARD_CATEGORY_HINTS: readonly BoardCategoryHint[] = ['recipe', 'wellness', 'travel'];

/**
 * Stems, not words: a topic is free text, so "рецепты", "рецепт" and "рецептик" must all match, and so
 * must "recetas", "receitas" and "Rezepte". Diacritics are stripped before matching, so `cafe` finds `café`.
 */
const TOPIC_STEMS: Record<BoardCategoryHint, readonly string[]> = {
  recipe: [
    'recipe', 'food', 'matcha', 'drink', 'cook', 'baking', 'dessert',
    'рецепт', 'еда', 'куриц', 'кофе', 'кулинар', 'выпечк',
    'receta', 'comida', 'cocina', 'café', 'bebida', 'postre',
    'receita', 'comida', 'cozinha', 'café', 'bebida', 'sobremesa',
    'rezept', 'essen', 'kochen', 'kaffee', 'backen', 'getränk',
    'recette', 'repas', 'cuisine', 'café', 'boisson', 'dessert',
    '食谱', '美食', '料理', '咖啡', '烹饪', '甜点',
  ],
  wellness: [
    'skin', 'beauty', 'glow', 'serum', 'skincare', 'wellness',
    'уход', 'кожа', 'косметик', 'красот', 'здоров',
    'piel', 'belleza', 'cuidado', 'cosmética', 'bienestar',
    'pele', 'beleza', 'cuidado', 'cosmético', 'bem-estar',
    'haut', 'schönheit', 'pflege', 'kosmetik', 'wohlbefinden',
    'peau', 'beauté', 'soin', 'cosmétique', 'bien-être',
    '护肤', '美容', '皮肤', '健康', '保养',
  ],
  travel: [
    'travel', 'trip', 'hotel', 'positano', 'italy', 'vacation', 'beach',
    'путешеств', 'поездк', 'отел', 'отпуск', 'туризм', 'пляж',
    'viaj', 'hotel', 'vacaciones', 'playa', 'turismo',
    'viag', 'hotel', 'férias', 'praia', 'turismo',
    'reise', 'urlaub', 'hotel', 'strand', 'ferien',
    'voyage', 'vacances', 'hôtel', 'plage', 'tourisme',
    '旅行', '旅游', '酒店', '度假', '海滩',
  ],
};

/** Category names a customer typed themselves: "Recipes", "Рецепты", "Rezepte", "食谱". */
const CATEGORY_STEMS: Record<BoardCategoryHint, readonly string[]> = {
  recipe: ['recipe', 'food', 'cook', 'рецепт', 'еда', 'кулинар', 'receta', 'comida', 'receita', 'rezept', 'essen', 'recette', 'repas', '食谱', '美食'],
  wellness: ['wellness', 'beauty', 'health', 'skin', 'здоров', 'красот', 'уход', 'belleza', 'salud', 'beleza', 'saúde', 'schönheit', 'gesundheit', 'beauté', 'santé', '美容', '健康'],
  // viaj-/viag- покрывают viaje/viajes и viagem/viagens: стем должен быть короче слова.
  travel: ['travel', 'trip', 'путешеств', 'туризм', 'viaj', 'viag', 'turismo', 'reise', 'voyage', '旅行', '旅游'],
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function containsAny(value: string, stems: readonly string[]): boolean {
  const normalized = normalize(value);
  return stems.some((stem) => normalized.includes(normalize(stem)));
}

/** Topic -> category hint, or null when the topic says nothing about a category. */
export function recommendBoardCategory(topic: string): BoardCategoryHint | null {
  if (!topic || !topic.trim()) return null;
  for (const hint of BOARD_CATEGORY_HINTS) {
    if (containsAny(topic, TOPIC_STEMS[hint])) return hint;
  }
  return null;
}

/** Whether a board's own category name belongs to the hint, in any of the seven languages. */
export function boardMatchesCategory(boardCategory: string, hint: BoardCategoryHint): boolean {
  if (!boardCategory) return false;
  return containsAny(boardCategory, CATEGORY_STEMS[hint]);
}

/**
 * The recommended board, or null when nothing recommends one. Null is a real answer: the caller keeps the
 * board it already had instead of jumping to an arbitrary position in the list.
 */
export function pickRecommendedBoard<T extends { id: string; category: string }>(
  boards: readonly T[],
  topic: string
): T | null {
  const hint = recommendBoardCategory(topic);
  if (!hint) return null;
  return boards.find((board) => boardMatchesCategory(board.category, hint)) || null;
}
