import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rememberPinTitleSelection,
  resolvePinTitleSelection,
  restorePinTitleSelectionIfCurrent,
} from './pinTitleSelection';

test('schedule resolves the most recently selected title before PATCH completion', () => {
  const selections = new Map<string, string>();
  rememberPinTitleSelection(selections, 'pin-1', 'New title');
  assert.equal(resolvePinTitleSelection(selections, 'pin-1', 'Old title'), 'New title');
});

test('a failed older title request cannot roll back a newer selection', () => {
  const selections = new Map<string, string>();
  const firstPrevious = rememberPinTitleSelection(selections, 'pin-1', 'First choice');
  rememberPinTitleSelection(selections, 'pin-1', 'Second choice');

  assert.equal(
    restorePinTitleSelectionIfCurrent(selections, 'pin-1', 'First choice', firstPrevious),
    false,
  );
  assert.equal(resolvePinTitleSelection(selections, 'pin-1', 'Server title'), 'Second choice');
});

test('failed latest title request restores the previous selection', () => {
  const selections = new Map<string, string>();
  rememberPinTitleSelection(selections, 'pin-1', 'First choice');
  const previous = rememberPinTitleSelection(selections, 'pin-1', 'Second choice');

  assert.equal(
    restorePinTitleSelectionIfCurrent(selections, 'pin-1', 'Second choice', previous),
    true,
  );
  assert.equal(resolvePinTitleSelection(selections, 'pin-1', 'Server title'), 'First choice');
});
