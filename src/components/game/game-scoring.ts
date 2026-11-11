const LINE_CLEAR_BASE_POINTS = [0, 10, 20, 60, 120, 200, 300] as const;

export interface MoveScoreInput {
  comboLevel: number;
  lineCount: number;
  placedCellCount: number;
}

export interface MoveScoreResult {
  clearPoints: number;
  placementPoints: number;
  total: number;
}

export interface ComboState {
  comboLevel: number;
  movesWithoutClear: number;
}

export function advanceComboState(
  current: ComboState,
  lineCount: number
): ComboState {
  if (lineCount > 0) {
    return {
      comboLevel: current.comboLevel + 1,
      movesWithoutClear: 0,
    };
  }

  const movesWithoutClear = Math.min(3, current.movesWithoutClear + 1);
  return {
    comboLevel: movesWithoutClear >= 3 ? 0 : current.comboLevel,
    movesWithoutClear,
  };
}

export function getLineClearBasePoints(lineCount: number) {
  if (lineCount <= 0) return 0;
  return LINE_CLEAR_BASE_POINTS[Math.min(lineCount, 6)] ?? 0;
}

export function calculateMoveScore({
  comboLevel,
  lineCount,
  placedCellCount,
}: MoveScoreInput): MoveScoreResult {
  const placementPoints = Math.max(0, placedCellCount);
  const clearPoints =
    getLineClearBasePoints(lineCount) * Math.max(1, comboLevel);

  return {
    clearPoints,
    placementPoints,
    total: placementPoints + clearPoints,
  };
}
