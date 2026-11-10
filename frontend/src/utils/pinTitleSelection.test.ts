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
  rememberPinTitleSelection(selections, 'pin-1', 'First choice');
  rememberPinTitleSelection(selections, 'pin-1', 'Second choice');

  assert.equal(
    restorePinTitleSelectionIfCurrent(selections, 'pin-1', 'First choice', 'Server title'),
    false,
  );
  assert.equal(resolvePinTitleSelection(selections, 'pin-1', 'Server title'), 'Second choice');
});

test('failed latest title request restores the last confirmed server title', () => {
  const selections = new Map<string, string>();
  rememberPinTitleSelection(selections, 'pin-1', 'First optimistic choice');
  rememberPinTitleSelection(selections, 'pin-1', 'Second optimistic choice');

  assert.equal(
    restorePinTitleSelectionIfCurrent(selections, 'pin-1', 'Second optimistic choice', 'Server title'),
    true,
  );
  assert.equal(resolvePinTitleSelection(selections, 'pin-1', 'Server title'), 'Server title');
});

test('failed latest choice restores an earlier choice only after it was confirmed', () => {
  const selections = new Map<string, string>();
  rememberPinTitleSelection(selections, 'pin-1', 'First choice');
  // The first PATCH succeeded, so it is now the confirmed rollback target.
  rememberPinTitleSelection(selections, 'pin-1', 'Second choice');

  assert.equal(
    restorePinTitleSelectionIfCurrent(selections, 'pin-1', 'Second choice', 'First choice'),
    true,
  );
  assert.equal(resolvePinTitleSelection(selections, 'pin-1', 'Server title'), 'First choice');
});
