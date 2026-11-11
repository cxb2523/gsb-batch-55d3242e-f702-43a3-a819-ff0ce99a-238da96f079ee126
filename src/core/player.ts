/**
 * 玩家资源与等级：能量惰性恢复、经验升级、金币/食物/声望收支。
 */
import type { GameState, GameEvent } from './types';
import { ENERGY_REGEN_MS, MAX_LEVEL, maxEnergy, xpForNextLevel } from './balance';

/** 惰性结算能量恢复（宠物 cheer 技能 +10% 速度） */
export function updateEnergy(state: GameState, now: number): void {
  const p = state.player;
  const cap = maxEnergy(p.level);
  if (p.energy >= cap) {
    p.energyUpdatedAt = now;
    return;
  }
  let regenMs = ENERGY_REGEN_MS;
  if (state.pets.some((pet) => petHasSkill(state, pet.defId, 'cheer'))) {
    regenMs = Math.round(regenMs / 1.1);
  }
  const elapsed = now - p.energyUpdatedAt;
  if (elapsed <= 0) return;
  const gained = Math.floor(elapsed / regenMs);
  if (gained > 0) {
    p.energy = Math.min(cap, p.energy + gained);
    p.energyUpdatedAt += gained * regenMs;
    if (p.energy >= cap) p.energyUpdatedAt = now;
  }
}

// 避免 core → data 循环：由 data/pets.data.ts 注册技能表
const petSkillTable = new Map<string, string>();
export function registerPetSkill(defId: string, skill: string): void {
  petSkillTable.set(defId, skill);
}
export function petHasSkill(_state: GameState, defId: string, skill: string): boolean {
  return petSkillTable.get(defId) === skill;
}

/** 距下一点能量恢复的剩余毫秒（UI 倒计时用） */
export function energyEta(state: GameState, now: number): number {
  const p = state.player;
  if (p.energy >= maxEnergy(p.level)) return 0;
  let regenMs = ENERGY_REGEN_MS;
  if (state.pets.some((pet) => petHasSkill(state, pet.defId, 'cheer'))) {
    regenMs = Math.round(regenMs / 1.1);
  }
  return Math.max(0, regenMs - (now - p.energyUpdatedAt));
}

export function hasEnergy(state: GameState, cost: number, now: number): boolean {
  updateEnergy(state, now);
  return state.player.energy >= cost;
}

export function spendEnergy(state: GameState, cost: number, now: number): boolean {
  updateEnergy(state, now);
  if (state.player.energy < cost) return false;
  state.player.energy -= cost;
  if (state.player.energy + cost >= maxEnergy(state.player.level) && cost > 0) {
    // 从满值开始消耗时重置恢复计时
    state.player.energyUpdatedAt = now;
  }
  return true;
}

export function gainEnergy(state: GameState, amount: number): void {
  const cap = maxEnergy(state.player.level);
  state.player.energy = Math.min(cap, state.player.energy + amount);
}

/** 获得经验；返回升级事件（可能连升） */
export function gainXp(state: GameState, amount: number): GameEvent[] {
  const p = state.player;
  const events: GameEvent[] = [];
  p.xp += Math.max(0, Math.round(amount));
  while (p.level < MAX_LEVEL && p.xp >= xpForNextLevel(p.level)) {
    p.xp -= xpForNextLevel(p.level);
    p.level += 1;
    p.energy = maxEnergy(p.level); // 升级回满能量
    events.push({ type: 'levelUp', amount: p.level });
    events.push({ type: 'reachLevel', amount: p.level });
  }
  return events;
}

export function gainCoins(state: GameState, amount: number): GameEvent[] {
  state.player.coins += amount;
  state.stats.coinsEarned += amount;
  return [{ type: 'earnCoins', amount }];
}

export function spendCoins(state: GameState, amount: number): boolean {
  if (state.player.coins < amount) return false;
  state.player.coins -= amount;
  state.stats.coinsSpent += amount;
  return true;
}

export function gainFood(state: GameState, amount: number): void {
  state.player.food += amount;
}

export function spendFood(state: GameState, amount: number): boolean {
  if (state.player.food < amount) return false;
  state.player.food -= amount;
  return true;
}

export function gainReputation(state: GameState, amount: number): void {
  state.player.reputation += amount;
}

export function addItem(state: GameState, itemId: string, count: number): void {
  state.inventory[itemId] = (state.inventory[itemId] || 0) + count;
}

export function removeItem(state: GameState, itemId: string, count: number): boolean {
  const have = state.inventory[itemId] || 0;
  if (have < count) return false;
  if (have === count) delete state.inventory[itemId];
  else state.inventory[itemId] = have - count;
  return true;
}

export function itemCount(state: GameState, itemId: string): number {
  return state.inventory[itemId] || 0;
}

export function nextUid(state: GameState): number {
  state.uidCounter += 1;
  return state.uidCounter;
}
