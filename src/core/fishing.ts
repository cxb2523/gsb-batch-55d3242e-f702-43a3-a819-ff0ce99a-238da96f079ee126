/**
 * 钓鱼系统：甩竿（耗能量）→ 咬钩时机 → 收线小游戏 → 按稀有度出鱼。
 * 概率表由鱼竿等级决定；猫宠物（lucky_fish）提升稀有概率。
 */
import type { ActionResult, FishDef, FishRarity, GameState } from './types';
import { allFish, fishDef } from './registry';
import { ENERGY_COST } from './balance';
import { addItem, gainXp, petHasSkill, spendEnergy } from './player';
import { roll, rollWeighted } from './rng';
import { fail } from './types';

/** 稀有度基础权重（乘以鱼竿修正） */
const RARITY_WEIGHT: Record<FishRarity, number> = {
  common: 100,
  uncommon: 40,
  rare: 12,
  epic: 3,
  legendary: 0.6,
};

/** 鱼竿等级对高稀有度的放大 */
function rodBoost(rodTier: number, rarity: FishRarity): number {
  const idx = ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(rarity);
  return Math.pow(1 + (rodTier - 1) * 0.35, idx);
}

export function catchTable(state: GameState): { fish: FishDef[]; weights: number[] } {
  const luckyBonus = state.pets.some((p) => petHasSkill(state, p.defId, 'lucky_fish')) ? 1.15 : 1;
  const fish = allFish().filter((f) => f.minRodTier <= state.player.rodTier);
  const weights = fish.map((f) => {
    let w = RARITY_WEIGHT[f.rarity] * rodBoost(state.player.rodTier, f.rarity);
    if (f.rarity !== 'common' && f.rarity !== 'uncommon') w *= luckyBonus;
    return w;
  });
  return { fish, weights };
}

/** 甩竿：只扣能量，成功与否由收线小游戏决定 */
export function castLine(state: GameState, now: number): ActionResult {
  if (!spendEnergy(state, ENERGY_COST.fishCast, now)) return fail('msg.noEnergy');
  return { ok: true };
}

export interface CatchResult {
  fish: FishDef | null;   // null = 跑掉了
  isNew: boolean;
  amountXp: number;
}

/**
 * 收线结算。quality ∈ [0,1]：收线小游戏保持在区间内的时间占比。
 * <0.45 鱼跑掉；否则按概率表出鱼，quality 高时再往上顶一档稀有度。
 */
export function resolveCatch(state: GameState, quality: number): ActionResult & { catch?: CatchResult } {
  if (quality < 0.45) {
    return { ok: true, catch: { fish: null, isNew: false, amountXp: 0 } };
  }
  const { fish, weights } = catchTable(state);
  if (fish.length === 0) return fail('msg.noFish');
  let caught = rollWeighted(fish, weights);
  // 高质量收线：30% 概率在同稀有度里换成更贵的鱼
  if (quality > 0.85 && roll() < 0.3) {
    const better = fish.filter((f) => f.rarity === caught.rarity && f.sellPrice > caught.sellPrice);
    if (better.length > 0) caught = better[Math.floor(roll() * better.length)];
  }
  const prev = state.collections.fish[caught.id] || 0;
  state.collections.fish[caught.id] = prev + 1;
  addItem(state, caught.id, 1);
  const levelEvents = gainXp(state, caught.xp);
  return {
    ok: true,
    catch: { fish: caught, isNew: prev === 0, amountXp: caught.xp },
    events: [
      { type: 'fishCatch', target: caught.rarity, amount: 1, data: caught.id },
      ...levelEvents,
    ],
  };
}

/** 图鉴完成度 */
export function fishCollectionProgress(state: GameState): { caught: number; total: number } {
  const total = allFish().length;
  const caught = Object.keys(state.collections.fish).filter((id) => {
    try { return fishDef(id) && (state.collections.fish[id] || 0) > 0; } catch { return false; }
  }).length;
  return { caught, total };
}
