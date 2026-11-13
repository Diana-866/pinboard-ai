/**
 * Resolve the generator's target board without overriding a valid user choice.
 * A calendar handoff wins initially; a manual choice then remains stable while
 * topic recommendations and board counts refresh. Removed boards fall back safely.
 */
export function resolveGeneratorBoardId(
  initialBoardId: string | undefined,
  recommendedBoardId: string | undefined,
  availableBoardIds: string[],
  currentBoardId = '',
  wasManuallySelected = false,
): string {
  if (initialBoardId && availableBoardIds.includes(initialBoardId)) {
    return initialBoardId;
  }
  if (wasManuallySelected && currentBoardId && availableBoardIds.includes(currentBoardId)) {
    return currentBoardId;
  }
  if (recommendedBoardId && availableBoardIds.includes(recommendedBoardId)) {
    return recommendedBoardId;
  }
  return availableBoardIds[0] || '';
}
