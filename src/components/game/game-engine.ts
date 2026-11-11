import { createDailyBoard } from '@/components/game/daily-board';
import {
  createRandomSeed,
  createSeed,
  createSeededRandom,
} from '@/components/game/game-random';
import {
  advanceComboState,
  calculateMoveScore,
} from '@/components/game/game-scoring';
import type { GameMode } from '@/components/game/game-storage';

export const BOARD_SIZE = 8;

export type GameBlockColor =
  | 'blue'
  | 'cyan'
  | 'green'
  | 'orange'
  | 'purple'
  | 'red'
  | 'yellow';

export type GameBoardCell = GameBlockColor | null;
export type GameBoard = GameBoardCell[][];
export type GameShapeCell = readonly [row: number, column: number];

interface GameShapeDefinition {
  key: string;
  cells: readonly GameShapeCell[];
}

export interface GamePiece extends GameShapeDefinition {
  color: GameBlockColor;
  id: string;
}

export interface GameRound {
  board: GameBoard;
  combo: number;
  generation: number;
  movesWithoutClear: number;
  pieces: Array<GamePiece | null>;
  score: number;
  seed: number;
}

export interface GamePlacement {
  column: number;
  pieceIndex: number;
  row: number;
}

export interface GamePlacementPreview {
  column: number;
  isValid: boolean;
  row: number;
}

export interface GameLineClear {
  anchorColumn: number;
  anchorRow: number;
  cells: Record<string, GameBlockColor>;
  lineCount: number;
}

export interface GameMoveResolution {
  clear: GameLineClear | null;
  earned: number;
  gameOver: boolean;
  round: GameRound;
}

const SHAPES: readonly GameShapeDefinition[] = [
  { key: 'single', cells: [[0, 0]] },
  {
    key: 'square',
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  },
  {
    key: 'line-2-h',
    cells: [
      [0, 0],
      [0, 1],
    ],
  },
  {
    key: 'line-3-h',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
  },
  {
    key: 'line-4-h',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
  {
    key: 'line-5-h',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
  },
  {
    key: 'line-2-v',
    cells: [
      [0, 0],
      [1, 0],
    ],
  },
  {
    key: 'line-3-v',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
  },
  {
    key: 'line-4-v',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
  },
  {
    key: 'corner-3',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
  {
    key: 'corner-5',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
  },
  {
    key: 'tee',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ],
  },
  {
    key: 'zigzag',
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  },
  {
    key: 'three-square',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
  },
] as const;

const COLORS: readonly GameBlockColor[] = [
  'red',
  'yellow',
  'purple',
  'green',
  'blue',
  'cyan',
  'orange',
] as const;

const INITIAL_PIECES: readonly GamePiece[] = [
  {
    ...SHAPES[3],
    color: 'cyan',
    id: 'initial-line-a',
  },
  {
    ...SHAPES[3],
    color: 'yellow',
    id: 'initial-line-b',
  },
  {
    ...SHAPES[2],
    color: 'purple',
    id: 'initial-line-c',
  },
] as const;

function createEmptyBoard(): GameBoard {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array<GameBoardCell>(BOARD_SIZE).fill(null)
  );
}

function createPiecesForGeneration(
  seed: number,
  generation: number
): Array<GamePiece | null> {
  const random = createSeededRandom((seed + generation * 0x9e37_79b1) >>> 0);
  return Array.from({ length: 3 }, (_, index) => {
    const shape = SHAPES[Math.floor(random() * SHAPES.length)];
    const color = COLORS[Math.floor(random() * COLORS.length)];
    return {
      ...shape,
      color,
      id: `${generation}-${index}-${shape.key}`,
    };
  });
}

function derivePieceSeed(
  mode: GameMode,
  dailyDate: string,
  seed?: number
): number {
  if (typeof seed === 'number') return seed >>> 0;
  // The daily challenge must play identically for everyone on a given day,
  // while classic games draw a fresh random sequence each time.
  return mode === 'daily'
    ? createSeed(`super-blocks:pieces:${dailyDate}`)
    : createRandomSeed();
}

export function createGameRound(
  mode: GameMode,
  dailyDate: string,
  seed?: number
): GameRound {
  return {
    board: mode === 'daily' ? createDailyBoard(dailyDate) : createEmptyBoard(),
    combo: 0,
    generation: 1,
    movesWithoutClear: 0,
    pieces: INITIAL_PIECES.map((piece) => ({ ...piece })),
    score: 0,
    seed: derivePieceSeed(mode, dailyDate, seed),
  };
}

export function canPlaceGamePiece(
  board: GameBoard,
  piece: GamePiece,
  row: number,
  column: number
) {
  return piece.cells.every(([cellRow, cellColumn]) => {
    const targetRow = row + cellRow;
    const targetColumn = column + cellColumn;
    return (
      targetRow >= 0 &&
      targetRow < BOARD_SIZE &&
      targetColumn >= 0 &&
      targetColumn < BOARD_SIZE &&
      board[targetRow][targetColumn] === null
    );
  });
}

function pieceHasPlacement(board: GameBoard, piece: GamePiece) {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      if (canPlaceGamePiece(board, piece, row, column)) return true;
    }
  }
  return false;
}

export function getGamePieceBounds(piece: GamePiece) {
  return piece.cells.reduce(
    (bounds, [row, column]) => ({
      columns: Math.max(bounds.columns, column + 1),
      rows: Math.max(bounds.rows, row + 1),
    }),
    { columns: 1, rows: 1 }
  );
}

export function isGamePiecePreviewCell(
  preview: GamePlacementPreview | null,
  piece: GamePiece | null,
  row: number,
  column: number
) {
  if (!preview || !piece) return false;
  return piece.cells.some(
    ([cellRow, cellColumn]) =>
      preview.row + cellRow === row && preview.column + cellColumn === column
  );
}

function findLineClear(placedBoard: GameBoard): GameLineClear | null {
  const completedRows = placedBoard
    .map((boardRow, rowIndex) => (boardRow.every(Boolean) ? rowIndex : -1))
    .filter((rowIndex) => rowIndex >= 0);
  const completedColumns = Array.from(
    { length: BOARD_SIZE },
    (_, columnIndex) => columnIndex
  ).filter((columnIndex) =>
    placedBoard.every((boardRow) => Boolean(boardRow[columnIndex]))
  );

  if (completedRows.length === 0 && completedColumns.length === 0) return null;

  const clearedCellKeys = new Set<string>();
  for (const rowIndex of completedRows) {
    for (let columnIndex = 0; columnIndex < BOARD_SIZE; columnIndex += 1) {
      clearedCellKeys.add(`${rowIndex}-${columnIndex}`);
    }
  }
  for (const columnIndex of completedColumns) {
    for (let rowIndex = 0; rowIndex < BOARD_SIZE; rowIndex += 1) {
      clearedCellKeys.add(`${rowIndex}-${columnIndex}`);
    }
  }

  const cells: Record<string, GameBlockColor> = {};
  let totalRow = 0;
  let totalColumn = 0;
  for (const key of clearedCellKeys) {
    const [row, column] = key.split('-').map(Number);
    const color = placedBoard[row]?.[column];
    if (!color) continue;
    cells[key] = color;
    totalRow += row;
    totalColumn += column;
  }

  const cellCount = Math.max(1, Object.keys(cells).length);
  return {
    anchorColumn: totalColumn / cellCount,
    anchorRow: totalRow / cellCount,
    cells,
    lineCount: completedRows.length + completedColumns.length,
  };
}

function removeClearedCells(
  board: GameBoard,
  clear: GameLineClear | null
): GameBoard {
  if (!clear) return board;
  return board.map((boardRow, rowIndex) =>
    boardRow.map((cell, columnIndex) =>
      clear.cells[`${rowIndex}-${columnIndex}`] ? null : cell
    )
  );
}

export function placeGamePiece(
  round: GameRound,
  placement: GamePlacement
): GameMoveResolution | null {
  const piece = round.pieces[placement.pieceIndex];
  if (
    !piece ||
    !canPlaceGamePiece(round.board, piece, placement.row, placement.column)
  ) {
    return null;
  }

  const placedBoard = round.board.map((boardRow) => [...boardRow]);
  for (const [cellRow, cellColumn] of piece.cells) {
    placedBoard[placement.row + cellRow][placement.column + cellColumn] =
      piece.color;
  }

  const clear = findLineClear(placedBoard);
  const lineCount = clear?.lineCount ?? 0;
  const comboState = advanceComboState(
    {
      comboLevel: round.combo,
      movesWithoutClear: round.movesWithoutClear,
    },
    lineCount
  );
  const { total: earned } = calculateMoveScore({
    comboLevel: comboState.comboLevel,
    lineCount,
    placedCellCount: piece.cells.length,
  });
  const board = removeClearedCells(placedBoard, clear);
  let generation = round.generation;
  let pieces = round.pieces.map((item, index) =>
    index === placement.pieceIndex ? null : item
  );

  if (pieces.every((item) => item === null)) {
    generation += 1;
    pieces = createPiecesForGeneration(round.seed, generation);
  }

  const nextRound: GameRound = {
    board,
    combo: comboState.comboLevel,
    generation,
    movesWithoutClear: comboState.movesWithoutClear,
    pieces,
    score: round.score + earned,
    seed: round.seed,
  };
  const gameOver = !pieces.some(
    (nextPiece) => nextPiece && pieceHasPlacement(board, nextPiece)
  );

  return { clear, earned, gameOver, round: nextRound };
}
