/**
 * Resolve the board selected by the generator.
 * A stale calendar handoff must not leave the editor pointing at a board that
 * is no longer available to the current user.
 */
export function resolveGeneratorBoardId(
  initialBoardId: string | undefined,
  recommendedBoardId: string | undefined,
  availableBoardIds: string[],
): string {
  if (initialBoardId && availableBoardIds.includes(initialBoardId)) {
    return initialBoardId;
  }
  if (recommendedBoardId && availableBoardIds.includes(recommendedBoardId)) {
    return recommendedBoardId;
  }
  return availableBoardIds[0] || '';
}
