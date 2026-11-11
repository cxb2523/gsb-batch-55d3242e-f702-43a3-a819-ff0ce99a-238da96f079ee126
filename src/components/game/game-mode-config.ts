import type { GameMode } from '@/components/game/game-storage';

export const GAME_MODE_TARGETS: Record<GameMode, number | null> = {
  classic: null,
  daily: 1000,
};
