export type GameMode = 'classic' | 'daily';

export const GAME_MODES = ['classic', 'daily'] as const;

export function isGameMode(value: unknown): value is GameMode {
  return GAME_MODES.some((mode) => mode === value);
}

export interface ScoreRecord {
  id: string;
  mode: GameMode;
  score: number;
}

export const BEST_SCORE_KEY = 'block-blast-best-score';
export const SCORE_HISTORY_KEY = 'block-blast-score-history';
export const SCORE_VERSION_KEY = 'block-blast-score-version';
export const SCORE_VERSION = '3';

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ensureScoreStorageVersion() {
  if (window.localStorage.getItem(SCORE_VERSION_KEY) === SCORE_VERSION) return;
  window.localStorage.removeItem(BEST_SCORE_KEY);
  window.localStorage.removeItem(SCORE_HISTORY_KEY);
  window.localStorage.setItem(SCORE_VERSION_KEY, SCORE_VERSION);
}

export function readBestScore() {
  const score = Number(window.localStorage.getItem(BEST_SCORE_KEY));
  return Number.isFinite(score) && score >= 0 ? score : 0;
}

export function readScoreHistory(): ScoreRecord[] {
  const stored = window.localStorage.getItem(SCORE_HISTORY_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as ScoreRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem(SCORE_HISTORY_KEY);
    return [];
  }
}

export function resetScoreStorage() {
  window.localStorage.setItem(BEST_SCORE_KEY, '0');
  window.localStorage.setItem(SCORE_HISTORY_KEY, '[]');
}
