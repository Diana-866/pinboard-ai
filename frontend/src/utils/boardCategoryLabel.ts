import type { TranslationSchema } from '../i18n/types';

export type BoardCategoryLabels = Pick<
  TranslationSchema['boards'],
  | 'categoryHomeDecor'
  | 'categoryRecipes'
  | 'categoryWellness'
  | 'categoryTravel'
  | 'categoryDigitalProducts'
  | 'categoryFashion'
>;

const CATEGORY_LABEL_KEYS: Record<string, keyof BoardCategoryLabels> = {
  'home decor': 'categoryHomeDecor',
  'home decor & architecture': 'categoryHomeDecor',
  recipes: 'categoryRecipes',
  'recipes & culinary': 'categoryRecipes',
  wellness: 'categoryWellness',
  'clean beauty & wellness': 'categoryWellness',
  travel: 'categoryTravel',
  'travel & escapes': 'categoryTravel',
  'digital products': 'categoryDigitalProducts',
  'digital products & saas': 'categoryDigitalProducts',
  fashion: 'categoryFashion',
  'fashion & capsule wardrobe': 'categoryFashion',
};

/**
 * Display a persisted board category in the active UI language.
 * Unknown categories are preserved verbatim so existing/custom data is not hidden.
 */
export function resolveBoardCategoryLabel(
  category: string,
  labels: BoardCategoryLabels,
): string {
  const key = CATEGORY_LABEL_KEYS[category.trim().toLowerCase()];
  return key ? labels[key] : category;
}
