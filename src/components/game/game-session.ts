import { type GameMode, isGameMode } from '@/components/game/game-storage';
import type { GameBlockColor, GamePiece } from '@/components/game/game-engine';

export interface ActiveGameSession {
  board: Array<Array<GameBlockColor | null>>;
  challengeComplete: boolean;
  combo: number;
  dailyDate: string | null;
  elapsedSeconds: number;
  gameOver: boolean;
  generation: number;
  mode: GameMode;
  movesWithoutClear: number;
  pieces: Array<GamePiece | null>;
  score: number;
  seed: number;
  version: 4;
}

export const ACTIVE_GAME_SESSION_KEY = 'block-blast-active-game';

const BLOCK_COLORS = new Set<GameBlockColor>([
  'blue',
  'cyan',
  'green',
  'orange',
  'purple',
  'red',
  'yellow',
]);

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isBlockColor(value: unknown): value is GameBlockColor {
  return typeof value === 'string' && BLOCK_COLORS.has(value as GameBlockColor);
}

function isBoard(value: unknown): value is ActiveGameSession['board'] {
  return (
    Array.isArray(value) &&
    value.length === 8 &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 8 &&
        row.every((cell) => cell === null || isBlockColor(cell))
    )
  );
}

function isPiece(value: unknown): value is GamePiece | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const piece = value as Partial<GamePiece>;
  return (
    typeof piece.id === 'string' &&
    typeof piece.key === 'string' &&
    isBlockColor(piece.color) &&
    Array.isArray(piece.cells) &&
    piece.cells.length > 0 &&
    piece.cells.every(
      (cell) =>
        Array.isArray(cell) &&
        cell.length === 2 &&
        cell.every((coordinate) => isNonNegativeInteger(coordinate))
    )
  );
}

function isActiveGameSession(
  value: unknown,
  currentDailyDate: string
): value is ActiveGameSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<ActiveGameSession>;
  return (
    session.version === 4 &&
    isGameMode(session.mode) &&
    (session.mode === 'daily'
      ? session.dailyDate === currentDailyDate
      : session.dailyDate === null) &&
    isBoard(session.board) &&
    Array.isArray(session.pieces) &&
    session.pieces.length === 3 &&
    session.pieces.every(isPiece) &&
    isNonNegativeInteger(session.score) &&
    isNonNegativeInteger(session.combo) &&
    isNonNegativeInteger(session.movesWithoutClear) &&
    isNonNegativeInteger(session.elapsedSeconds) &&
    isNonNegativeInteger(session.generation) &&
    isNonNegativeInteger(session.seed) &&
    typeof session.gameOver === 'boolean' &&
    typeof session.challengeComplete === 'boolean'
  );
}

export function readActiveGameSession(
  currentDailyDate: string
): ActiveGameSession | null {
  try {
    const stored = window.sessionStorage.getItem(ACTIVE_GAME_SESSION_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (isActiveGameSession(parsed, currentDailyDate)) {
      return parsed;
    }
    window.sessionStorage.removeItem(ACTIVE_GAME_SESSION_KEY);
  } catch {
    // Invalid or unavailable session storage should not block the game.
  }
  return null;
}

export function writeActiveGameSession(session: ActiveGameSession) {
  try {
    window.sessionStorage.setItem(
      ACTIVE_GAME_SESSION_KEY,
      JSON.stringify(session)
    );
  } catch {
    // The in-memory game remains playable when storage is unavailable.
  }
}

export function clearActiveGameSession() {
  try {
    window.sessionStorage.removeItem(ACTIVE_GAME_SESSION_KEY);
  } catch {
    // The in-memory game can still return to the menu.
  }
}
