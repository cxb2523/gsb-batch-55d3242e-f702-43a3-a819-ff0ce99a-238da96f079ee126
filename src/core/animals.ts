/**
 * 畜牧系统：购买动物 → 喂食（耗食物）→ 等待产出 → 收取。
 */
import type { ActionResult, AnimalInstance, GameState } from './types';
import { animalDef } from './registry';
import { ENERGY_COST } from './balance';
import { addItem, gainXp, nextUid, spendCoins, spendEnergy, spendFood } from './player';
import { findFreeGrass } from './island';
import { roll, rollInt } from './rng';
import { fail } from './types';

export function animalByUid(state: GameState, uid: number): AnimalInstance | undefined {
  return state.animals.find((a) => a.uid === uid);
}

export type AnimalPhase = 'hungry' | 'producing' | 'ready';

export function animalPhase(a: AnimalInstance, now: number): AnimalPhase {
  if (a.fedAt === null) return 'hungry';
  const def = animalDef(a.defId);
  return now >= a.fedAt + def.produceMs ? 'ready' : 'producing';
}

export function animalEta(a: AnimalInstance, now: number): number {
  if (a.fedAt === null) return 0;
  const def = animalDef(a.defId);
  return Math.max(0, a.fedAt + def.produceMs - now);
}

/** 商店购买动物，自动落位到空草地 */
export function buyAnimal(state: GameState, defId: string, now: number): ActionResult {
  const def = animalDef(defId);
  if (state.player.level < def.unlockLevel) return fail('msg.locked');
  if (state.player.coins < def.buyPrice) return fail('msg.noCoins');
  const spot = findFreeGrass(state, roll);
  if (!spot) return fail('msg.noSpace');
  spendCoins(state, def.buyPrice);
  state.animals.push({ uid: nextUid(state), defId, x: spot.x, y: spot.y, fedAt: null });
  return { ok: true, events: [{ type: 'toast', target: 'msg.animalBought' }] };
}

export function feedAnimal(state: GameState, uid: number, now: number): ActionResult {
  const a = animalByUid(state, uid);
  if (!a) return fail('msg.notFound');
  if (animalPhase(a, now) !== 'hungry') return fail('msg.notHungry');
  const def = animalDef(a.defId);
  if (state.player.food < def.feedCost) return fail('msg.noFood');
  if (!spendEnergy(state, ENERGY_COST.feedAnimal, now)) return fail('msg.noEnergy');
  spendFood(state, def.feedCost);
  a.fedAt = now;
  return { ok: true, events: [{ type: 'feedAnimal', target: a.defId, amount: 1 }] };
}

export function collectAnimal(state: GameState, uid: number, now: number): ActionResult {
  const a = animalByUid(state, uid);
  if (!a) return fail('msg.notFound');
  if (animalPhase(a, now) !== 'ready') return fail('msg.notReady');
  const def = animalDef(a.defId);
  if (!spendEnergy(state, ENERGY_COST.collectAnimal, now)) return fail('msg.noEnergy');
  const amount = rollInt(def.produceMin, def.produceMax);
  addItem(state, def.produceId, amount);
  const levelEvents = gainXp(state, def.xp);
  a.fedAt = null;
  return {
    ok: true,
    events: [{ type: 'collectAnimal', target: a.defId, amount }, ...levelEvents],
  };
}

/** 编辑模式移动动物 */
export function moveAnimal(state: GameState, uid: number, x: number, y: number): ActionResult {
  const a = animalByUid(state, uid);
  if (!a) return fail('msg.notFound');
  a.x = x;
  a.y = y;
  return { ok: true };
}

/** 出售动物（半价回收） */
export function sellAnimal(state: GameState, uid: number): ActionResult {
  const idx = state.animals.findIndex((a) => a.uid === uid);
  if (idx < 0) return fail('msg.notFound');
  const def = animalDef(state.animals[idx].defId);
  state.animals.splice(idx, 1);
  state.player.coins += Math.floor(def.buyPrice / 2);
  return { ok: true };
}

export function readyAnimalCount(state: GameState, now: number): number {
  return state.animals.filter((a) => animalPhase(a, now) === 'ready').length;
}
