import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_CATEGORY_HINTS,
  boardMatchesCategory,
  pickRecommendedBoard,
  recommendBoardCategory,
} from './boardRecommendation';

/**
 * Section 135. The rule lived inside the generator with English and Russian stems only, so a customer
 * writing in Spanish, Portuguese, German, French or Chinese never matched and silently got `boards[1]`.
 * These tests speak all seven languages, because a rule that only works in two of them is the defect.
 */

type Board = { id: string; category: string };

const board = (id: string, category: string): Board => ({ id, category });

/** One realistic topic and one realistic board name per language, per category. */
const SAMPLES: Record<string, { recipe: [string, string]; wellness: [string, string]; travel: [string, string] }> = {
  en: {
    recipe: ['Easy matcha latte recipe', 'Recipes'],
    wellness: ['Glow serum skincare routine', 'Beauty'],
    travel: ['Positano travel guide', 'Travel'],
  },
  ru: {
    recipe: ['Простой рецепт матча-латте', 'Рецепты'],
    wellness: ['Уход за кожей и сыворотка', 'Красота'],
    travel: ['Путешествие в Позитано', 'Путешествия'],
  },
  es: {
    recipe: ['Receta fácil de matcha latte', 'Recetas'],
    wellness: ['Rutina de cuidado de la piel', 'Belleza'],
    travel: ['Guía de viaje a Positano', 'Viajes'],
  },
  pt: {
    recipe: ['Receita fácil de matcha latte', 'Receitas'],
    wellness: ['Rotina de cuidado com a pele', 'Beleza'],
    travel: ['Guia de viagem para Positano', 'Viagens'],
  },
  de: {
    recipe: ['Einfaches Matcha-Latte-Rezept', 'Rezepte'],
    wellness: ['Hautpflege-Routine mit Serum', 'Schönheit'],
    travel: ['Reiseführer für Positano', 'Reisen'],
  },
  fr: {
    recipe: ['Recette facile de matcha latte', 'Recettes'],
    wellness: ['Routine de soin pour la peau', 'Beauté'],
    travel: ['Guide de voyage à Positano', 'Voyages'],
  },
  zh: {
    recipe: ['简单的抹茶拿铁食谱', '食谱'],
    wellness: ['护肤精华保养流程', '美容'],
    travel: ['波西塔诺旅行指南', '旅行'],
  },
};

test('every supported language recommends the right category from its own words', () => {
  const failures: string[] = [];
  for (const [language, samples] of Object.entries(SAMPLES)) {
    for (const hint of BOARD_CATEGORY_HINTS) {
      const [topic] = samples[hint];
      const actual = recommendBoardCategory(topic);
      if (actual !== hint) failures.push(`${language}/${hint}: got ${String(actual)} from "${topic}"`);
    }
  }
  assert.deepEqual(failures, [], `topics not recognised:\n${failures.join('\n')}`);
});

test('every supported language matches its own board name to the category', () => {
  const failures: string[] = [];
  for (const [language, samples] of Object.entries(SAMPLES)) {
    for (const hint of BOARD_CATEGORY_HINTS) {
      const [, category] = samples[hint];
      if (!boardMatchesCategory(category, hint)) failures.push(`${language}/${hint}: board "${category}"`);
    }
  }
  assert.deepEqual(failures, [], `board names not matched:\n${failures.join('\n')}`);
});

test('the end result is that language\'s own board, not a positional one', () => {
  for (const [language, samples] of Object.entries(SAMPLES)) {
    const boards: Board[] = [
      board('home', 'Home Decor'),
      board('recipe', samples.recipe[1]),
      board('wellness', samples.wellness[1]),
      board('travel', samples.travel[1]),
    ];
    for (const hint of BOARD_CATEGORY_HINTS) {
      const picked = pickRecommendedBoard(boards, samples[hint][0]);
      assert.equal(picked?.id, hint, `${language}/${hint} picked ${String(picked?.id)}`);
    }
  }
});

test('a topic that says nothing returns nothing instead of an arbitrary board', () => {
  const boards: Board[] = [board('a', 'Recipes'), board('b', 'Travel')];
  assert.equal(recommendBoardCategory('quarterly budget spreadsheet'), null);
  assert.equal(pickRecommendedBoard(boards, 'quarterly budget spreadsheet'), null);
  assert.equal(pickRecommendedBoard(boards, ''), null);
  assert.equal(pickRecommendedBoard(boards, '   '), null);
});

test('a recognised topic with no matching board returns nothing, not boards[1]', () => {
  // Прежнее правило отдавало boards[1] — произвольную доску. Отсутствие ответа честнее.
  const boards: Board[] = [board('a', 'Home Decor'), board('b', 'Quotes')];
  assert.equal(pickRecommendedBoard(boards, 'Easy matcha latte recipe'), null);
});

test('accents are optional and case is irrelevant', () => {
  assert.equal(recommendBoardCategory('CAFÉ con leche'), 'recipe');
  assert.equal(recommendBoardCategory('cafe con leche'), 'recipe');
  assert.equal(recommendBoardCategory('REZEPT'), 'recipe');
  assert.equal(boardMatchesCategory('Schönheit', 'wellness'), true);
  assert.equal(boardMatchesCategory('schonheit', 'wellness'), true);
});
