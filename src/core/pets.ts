/**
 * 宠物系统：领养 → 喂食/玩耍养成 → 被动技能。
 * 技能：小狗驱兽 / 猫咪幸运钓鱼 / 兔子鼓舞(能量恢复+10%) / 每日寻宝。
 */
import type { ActionResult, GameState, PetInstance } from './types';
import { petDef } from './registry';
import {
  ENERGY_COST, PET_FEED_FOOD, PET_HUNGRY_AFTER_MS, PET_PLAY_COOLDOWN_MS,
  PET_XP_FEED, PET_XP_PLAY, petLevel,
} from './balance';
import { addItem, gainXp, nextUid, petHasSkill, spendCoins, spendEnergy, spendFood } from './player';
import { findFreeGrass } from './island';
import { roll, rollPick } from './rng';
import { fail } from './types';

export function petByUid(state: GameState, uid: number): PetInstance | undefined {
  return state.pets.find((p) => p.uid === uid);
}

export function adoptPet(state: GameState, defId: string, name: string, now: number): ActionResult {
  const def = petDef(defId);
  if (state.player.level < def.unlockLevel) return fail('msg.locked');
  if (state.pets.some((p) => p.defId === defId)) return fail('msg.owned');
  if (!spendCoins(state, def.price)) return fail('msg.noCoins');
  const spot = findFreeGrass(state, roll) ?? { x: 0, y: 0 };
  state.pets.push({
    uid: nextUid(state), defId, name: name || def.name.zh, adoptedAt: now,
    fedAt: now, playedAt: 0, xp: 0, skillUsedAt: 0, x: spot.x, y: spot.y,
  });
  return { ok: true, events: [{ type: 'adoptPet', target: defId, amount: 1 }] };
}

export function petHungry(pet: PetInstance, now: number): boolean {
  return now - pet.fedAt >= PET_HUNGRY_AFTER_MS;
}

export function petMood(pet: PetInstance, now: number): 'happy' | 'ok' | 'hungry' {
  if (petHungry(pet, now)) return 'hungry';
  return now - pet.playedAt < PET_PLAY_COOLDOWN_MS * 4 ? 'happy' : 'ok';
}

export function feedPet(state: GameState, uid: number, now: number): ActionResult {
  const pet = petByUid(state, uid);
  if (!pet) return fail('msg.notFound');
  if (!petHungry(pet, now)) return fail('msg.notHungry');
  if (!spendFood(state, PET_FEED_FOOD)) return fail('msg.noFood');
  pet.fedAt = now;
  pet.xp += PET_XP_FEED;
  return { ok: true, events: [{ type: 'feedPet', target: pet.defId, amount: 1 }] };
}

export function playPet(state: GameState, uid: number, now: number): ActionResult {
  const pet = petByUid(state, uid);
  if (!pet) return fail('msg.notFound');
  if (now - pet.playedAt < PET_PLAY_COOLDOWN_MS) return fail('msg.playCd');
  if (!spendEnergy(state, ENERGY_COST.playPet, now)) return fail('msg.noEnergy');
  pet.playedAt = now;
  pet.xp += PET_XP_PLAY;
  const levelEvents = gainXp(state, 2);
  return { ok: true, events: [{ type: 'playPet', target: pet.defId, amount: 1 }, ...levelEvents] };
}

export function petLevelOf(pet: PetInstance): number {
  return petLevel(pet.xp);
}

/** 每日寻宝技能（find_gift）：tick 时触发，掉一份小礼物 */
const GIFT_POOL = ['item_shell', 'item_pearl', 'item_bone', 'item_amber'];
export function tickPetGifts(state: GameState, now: number): string | null {
  for (const pet of state.pets) {
    if (!petHasSkill(state, pet.defId, 'find_gift')) continue;
    if (now - pet.skillUsedAt < 20 * 3600_000) continue;
    pet.skillUsedAt = now;
    const gift = rollPick(GIFT_POOL);
    addItem(state, gift, 1);
    return gift;
  }
  return null;
}
