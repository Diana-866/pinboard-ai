/**
 * Resolve the generator's target board without overriding a valid user choice.
 * A calendar handoff wins until the user makes a manual choice; after that,
 * the manual choice remains stable while topics and board counts refresh.
 * Removed boards fall back safely.
 */
export function resolveGeneratorBoardId(
  initialBoardId: string | undefined,
  recommendedBoardId: string | undefined,
  availableBoardIds: string[],
  currentBoardId = '',
  wasManuallySelected = false,
): string {
  if (wasManuallySelected && currentBoardId && availableBoardIds.includes(currentBoardId)) {
    return currentBoardId;
  }
  if (initialBoardId && availableBoardIds.includes(initialBoardId)) {
    return initialBoardId;
  }
  if (recommendedBoardId && availableBoardIds.includes(recommendedBoardId)) {
    return recommendedBoardId;
  }
  return availableBoardIds[0] || '';
}
