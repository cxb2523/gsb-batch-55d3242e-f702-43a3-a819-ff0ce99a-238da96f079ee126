/**
 * 杂草：随时间在岛上生长，清理得少量金币/经验（也是邻居帮工的对象）。
 */
import type { ActionResult, GameState } from './types';
import { ENERGY_COST, MAX_WEEDS, WEED_COIN, WEED_INTERVAL_MS, WEED_XP } from './balance';
import { gainCoins, gainXp, nextUid, spendEnergy } from './player';
import { findFreeGrass } from './island';
import { roll } from './rng';
import { fail } from './types';

function scheduleNext(state: GameState, base: number): void {
  const [lo, hi] = WEED_INTERVAL_MS;
  state.nextWeedAt = base + lo + roll() * (hi - lo);
}

/** 推进杂草生长；返回新增数量 */
export function tickWeeds(state: GameState, now: number): number {
  let grown = 0;
  if (state.nextWeedAt === 0) scheduleNext(state, now);
  let guard = 0;
  while (now >= state.nextWeedAt && guard < 12) {
    guard++;
    if (state.weeds.length < MAX_WEEDS) {
      const spot = findFreeGrass(state, roll);
      if (spot) {
        state.weeds.push({ uid: nextUid(state), x: spot.x, y: spot.y, spawnedAt: state.nextWeedAt });
        grown++;
      }
    }
    scheduleNext(state, state.nextWeedAt);
  }
  return grown;
}

export function clearWeed(state: GameState, uid: number, now: number): ActionResult {
  const idx = state.weeds.findIndex((w) => w.uid === uid);
  if (idx < 0) return fail('msg.notFound');
  if (!spendEnergy(state, ENERGY_COST.clearWeed, now)) return fail('msg.noEnergy');
  state.weeds.splice(idx, 1);
  const coinEvents = gainCoins(state, WEED_COIN);
  const levelEvents = gainXp(state, WEED_XP);
  return { ok: true, events: [{ type: 'clearWeed', amount: 1 }, ...coinEvents, ...levelEvents] };
}
