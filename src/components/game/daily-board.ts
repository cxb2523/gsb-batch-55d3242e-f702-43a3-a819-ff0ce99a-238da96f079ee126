import type { GameBlockColor } from '@/components/game/game-engine';
import { createSeed, createSeededRandom } from '@/components/game/game-random';

const BOARD_SIZE = 8;
const MIN_DAILY_BLOCKS = 8;
const DAILY_BLOCK_VARIANTS = 5;
const MAX_BLOCKS_PER_LINE = 3;

const BLOCK_COLORS: readonly GameBlockColor[] = [
  'red',
  'yellow',
  'purple',
  'green',
  'blue',
  'cyan',
  'orange',
];

export type DailyBoard = Array<Array<GameBlockColor | null>>;

function shuffle<T>(values: readonly T[], random: () => number) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function createDailyBoard(dateKey: string): DailyBoard {
  const random = createSeededRandom(createSeed(`super-blocks:${dateKey}`));
  const board: DailyBoard = Array.from({ length: BOARD_SIZE }, () =>
    Array<GameBlockColor | null>(BOARD_SIZE).fill(null)
  );
  const positions = shuffle(
    Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => index),
    random
  );
  const colors = shuffle(BLOCK_COLORS, random);
  const paletteSize = 3 + Math.floor(random() * 3);
  const blockCount =
    MIN_DAILY_BLOCKS + Math.floor(random() * DAILY_BLOCK_VARIANTS);
  const rowCounts = Array<number>(BOARD_SIZE).fill(0);
  const columnCounts = Array<number>(BOARD_SIZE).fill(0);
  let placed = 0;

  for (const position of positions) {
    if (placed === blockCount) break;
    const row = Math.floor(position / BOARD_SIZE);
    const column = position % BOARD_SIZE;
    if (
      rowCounts[row] >= MAX_BLOCKS_PER_LINE ||
      columnCounts[column] >= MAX_BLOCKS_PER_LINE
    ) {
      continue;
    }

    board[row][column] = colors[placed % paletteSize];
    rowCounts[row] += 1;
    columnCounts[column] += 1;
    placed += 1;
  }

  return board;
}
