import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBoardCategoryLabel } from './boardCategoryLabel';

const labels = {
  categoryHomeDecor: 'Localized home',
  categoryRecipes: 'Localized recipes',
  categoryWellness: 'Localized wellness',
  categoryTravel: 'Localized travel',
  categoryDigitalProducts: 'Localized digital products',
  categoryFashion: 'Localized fashion',
};

test('resolves every persisted board category to the active locale label', () => {
  const cases = [
    ['Home Decor', labels.categoryHomeDecor],
    ['Recipes', labels.categoryRecipes],
    ['Wellness', labels.categoryWellness],
    ['Travel', labels.categoryTravel],
    ['Digital Products', labels.categoryDigitalProducts],
    ['Fashion', labels.categoryFashion],
  ] as const;

  for (const [category, expected] of cases) {
    assert.equal(resolveBoardCategoryLabel(category, labels), expected, category);
  }
});

test('supports historical display-name values and case-insensitive input', () => {
  assert.equal(resolveBoardCategoryLabel(' HOME DECOR & ARCHITECTURE ', labels), labels.categoryHomeDecor);
  assert.equal(resolveBoardCategoryLabel('Recipes & Culinary', labels), labels.categoryRecipes);
  assert.equal(resolveBoardCategoryLabel('Clean Beauty & Wellness', labels), labels.categoryWellness);
  assert.equal(resolveBoardCategoryLabel('Travel & Escapes', labels), labels.categoryTravel);
  assert.equal(resolveBoardCategoryLabel('Digital Products & SaaS', labels), labels.categoryDigitalProducts);
  assert.equal(resolveBoardCategoryLabel('Fashion & Capsule Wardrobe', labels), labels.categoryFashion);
});

test('preserves unknown and custom categories instead of hiding their values', () => {
  assert.equal(resolveBoardCategoryLabel('My custom niche', labels), 'My custom niche');
  assert.equal(resolveBoardCategoryLabel('', labels), '');
});
