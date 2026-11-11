/** 测试共享助手：注册内容表 + 固定时间/随机种子的新档工厂 */
import '../src/data';
import { createNewGame } from '../src/core/state';
import { mulberry32, setGameplayRng } from '../src/core/rng';
import type { GameState } from '../src/core/types';

/** 固定基准时间：2026-07-18 12:00 本地时区 */
export const NOW = new Date(2026, 6, 18, 12, 0, 0).getTime();

export function makeGame(seed = 12345, now = NOW): GameState {
  setGameplayRng(mulberry32(999));
  return createNewGame('测试岛主', seed, now);
}

export function seedRng(seed: number): void {
  setGameplayRng(mulberry32(seed));
}
