/**
 * 离线进度结算：加载存档时对比上次保存时间，
 * 推进世界并生成"离开期间发生了什么"的摘要。
 */
import type { GameState } from './types';
import { tickWorld } from './state';
import { readyPlotCount } from './crops';
import { readyAnimalCount } from './animals';
import { maxEnergy } from './balance';

export interface OfflineSummary {
  awayMs: number;
  cropsReady: number;
  animalsReady: number;
  beastsArrived: number;
  weedsGrown: number;
  cropsTrampled: number;
  energyRestored: number;
  petGift: string | null;
}

const MIN_AWAY_MS = 3 * 60_000;

/**
 * 结算离线期间的世界变化。返回 null 表示离开时间太短不弹摘要。
 */
export function settleOffline(state: GameState, now: number): OfflineSummary | null {
  const awayMs = now - state.savedAt;
  const energyBefore = state.player.energy;
  const readyBefore = readyPlotCount(state, state.savedAt);
  const animalsBefore = readyAnimalCount(state, state.savedAt);

  const tick = tickWorld(state, now);

  if (awayMs < MIN_AWAY_MS) return null;
  return {
    awayMs,
    cropsReady: Math.max(0, readyPlotCount(state, now) - readyBefore),
    animalsReady: Math.max(0, readyAnimalCount(state, now) - animalsBefore),
    beastsArrived: tick.beastsArrived,
    weedsGrown: tick.weedsGrown,
    cropsTrampled: tick.cropsTrampled,
    energyRestored: Math.min(maxEnergy(state.player.level), state.player.energy) - energyBefore,
    petGift: tick.petGift,
  };
}
