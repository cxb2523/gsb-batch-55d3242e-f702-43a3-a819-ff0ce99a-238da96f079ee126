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

/**
 * Outcome of inspecting the persisted active-game session:
 *
 * - `restored`: a structurally valid session for today, safe to resume.
 * - `daily-expired`: a structurally valid daily session for a previous day;
 *   it must be discarded and a fresh daily board generated for today.
 * - `invalid`: the stored payload fails structural validation (corrupt
 *   board, wrong piece count, wrong field types, ...); discarded silently.
 * - `none`: nothing usable was stored.
 */
export type ActiveGameSessionStatus =
  | 'restored'
  | 'daily-expired'
  | 'invalid'
  | 'none';

export interface ActiveGameSessionResult {
  session: ActiveGameSession | null;
  status: ActiveGameSessionStatus;
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

/**
 * Validates every field except the daily-date match. A session that passes
 * this check is a well-formed game; the date is a separate, user-visible
 * concern so an expired daily board can be distinguished from a corrupt one.
 */
function isStructurallyValidActiveGameSession(
  value: unknown
): value is ActiveGameSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<ActiveGameSession>;
  return (
    session.version === 4 &&
    isGameMode(session.mode) &&
    (session.mode === 'daily'
      ? typeof session.dailyDate === 'string'
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

function readStoredSession(): unknown | null {
  try {
    const stored = window.sessionStorage.getItem(ACTIVE_GAME_SESSION_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as unknown;
  } catch {
    // Invalid or unavailable session storage should not block the game.
    return null;
  }
}

export function resolveActiveGameSession(
  currentDailyDate: string
): ActiveGameSessionResult {
  const parsed = readStoredSession();
  if (parsed === null) {
    return { session: null, status: 'none' };
  }

  if (!isStructurallyValidActiveGameSession(parsed)) {
    clearActiveGameSession();
    return { session: null, status: 'invalid' };
  }

  if (
    parsed.mode === 'daily' &&
    parsed.dailyDate !== null &&
    parsed.dailyDate !== currentDailyDate
  ) {
    clearActiveGameSession();
    return { session: null, status: 'daily-expired' };
  }

  return { session: parsed, status: 'restored' };
}

export function readActiveGameSession(
  currentDailyDate: string
): ActiveGameSession | null {
  return resolveActiveGameSession(currentDailyDate).session;
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
