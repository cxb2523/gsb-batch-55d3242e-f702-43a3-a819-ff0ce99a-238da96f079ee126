/**
 * 商店经济：买种子/建筑/服装/工具，卖出产物。
 * 出售会累积声望（海岛贸易声誉）。
 */
import type { ActionResult, GameState } from './types';
import { buildingDef, clothingDef, cropDef, itemDef } from './registry';
import { sellReputation } from './balance';
import { addItem, gainCoins, gainReputation, itemCount, removeItem, spendCoins } from './player';
import { fail } from './types';

/** 买种子（按作物 def） */
export function buySeed(state: GameState, cropId: string, count: number): ActionResult {
  const def = cropDef(cropId);
  if (state.player.level < def.unlockLevel) return fail('msg.locked');
  const cost = def.seedPrice * count;
  if (!spendCoins(state, cost)) return fail('msg.noCoins');
  addItem(state, def.seedId, count);
  return { ok: true };
}

/** 买建筑并进入待摆放（直接进背包式处理：economy 只扣钱，摆放由 build 层完成） */
export function buyBuilding(state: GameState, defId: string): ActionResult {
  const def = buildingDef(defId);
  if (state.player.level < def.unlockLevel) return fail('msg.locked');
  if (!spendCoins(state, def.price)) return fail('msg.noCoins');
  return { ok: true };
}

/** 退还建筑购买费（摆放取消时） */
export function refundBuilding(state: GameState, defId: string): void {
  state.player.coins += buildingDef(defId).price;
}

/** 买服装 */
export function buyClothing(state: GameState, defId: string): ActionResult {
  const def = clothingDef(defId);
  if (state.player.level < def.unlockLevel) return fail('msg.locked');
  if (state.player.wardrobe.includes(defId)) return fail('msg.owned');
  if (!spendCoins(state, def.price)) return fail('msg.noCoins');
  state.player.wardrobe.push(defId);
  return { ok: true, events: [{ type: 'buyClothing', target: defId, amount: 1 }] };
}

/** 穿戴 */
export function wearClothing(state: GameState, defId: string): ActionResult {
  const def = clothingDef(defId);
  if (!state.player.wardrobe.includes(defId)) return fail('msg.notOwned');
  const avatar = state.player.avatar as unknown as Record<string, string | null>;
  avatar[def.slot] = defId;
  return { ok: true, events: [{ type: 'wear', target: defId, amount: 1 }] };
}

/** 脱下（仅 hat/accessory 可为空） */
export function takeOffClothing(state: GameState, slot: 'hat' | 'accessory'): ActionResult {
  state.player.avatar[slot] = null;
  return { ok: true };
}

/** 升级鱼竿 */
export const ROD_PRICES = [0, 800, 5_000];
export function upgradeRod(state: GameState): ActionResult {
  const tier = state.player.rodTier;
  if (tier >= 3) return fail('msg.maxRod');
  const price = ROD_PRICES[tier];
  if (!spendCoins(state, price)) return fail('msg.noCoins');
  state.player.rodTier = tier + 1;
  return { ok: true, events: [{ type: 'toast', target: 'msg.rodUpgraded' }] };
}

/** 出售物品 */
export function sellItem(state: GameState, itemId: string, count: number): ActionResult {
  const def = itemDef(itemId);
  if (def.sell <= 0) return fail('msg.cannotSell');
  if (itemCount(state, itemId) < count) return fail('msg.notEnough');
  removeItem(state, itemId, count);
  const total = def.sell * count;
  const coinEvents = gainCoins(state, total);
  gainReputation(state, sellReputation(total));
  state.stats.itemsSold += count;
  return {
    ok: true,
    events: [{ type: 'sell', target: itemId, amount: count }, ...coinEvents],
  };
}
