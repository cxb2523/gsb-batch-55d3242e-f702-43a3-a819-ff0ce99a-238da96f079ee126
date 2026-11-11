/**
 * 建设装饰：摆放/移动/旋转/收纳建筑，美观度评分，扩岛。
 */
import type { ActionResult, GameState, Placement } from './types';
import { buildingDef } from './registry';
import { ISLAND_TIERS } from './balance';
import { gainXp, nextUid, spendCoins } from './player';
import { buildingFootprint, islandSize, isOccupied, terrainAt } from './island';
import { fail } from './types';

/** 检查 def 在 (x,y) 是否可放置（忽略 ignoreUid 自身） */
export function canPlace(state: GameState, defId: string, x: number, y: number, ignoreUid?: number): boolean {
  const def = buildingDef(defId);
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      const t = terrainAt(state, tx, ty);
      if (def.category === 'path') {
        if (t !== 'grass' && t !== 'sand') return false;
      } else if (t !== 'grass') {
        return false;
      }
      if (isOccupied(state, tx, ty, { ignoreUid })) return false;
      if (state.weeds.some((w) => w.x === tx && w.y === ty)) return false;
      if (state.beasts.some((b) => b.x === tx && b.y === ty)) return false;
    }
  }
  return true;
}

/** 从背包/商店摆放一个新建筑（购买在 economy 完成，这里只放置已拥有的） */
export function placeBuilding(state: GameState, defId: string, x: number, y: number): ActionResult {
  const def = buildingDef(defId);
  if (!canPlace(state, defId, x, y)) return fail('msg.cannotPlace');
  state.placements.push({ uid: nextUid(state), defId, x, y, rot: 0 });
  const levelEvents = gainXp(state, def.xp);
  return {
    ok: true,
    events: [{ type: 'place', target: defId, amount: 1 }, ...levelEvents],
  };
}

export function movePlacement(state: GameState, uid: number, x: number, y: number): ActionResult {
  const pl = state.placements.find((p) => p.uid === uid);
  if (!pl) return fail('msg.notFound');
  if (!canPlace(state, pl.defId, x, y, uid)) return fail('msg.cannotPlace');
  pl.x = x;
  pl.y = y;
  return { ok: true };
}

export function rotatePlacement(state: GameState, uid: number): ActionResult {
  const pl = state.placements.find((p) => p.uid === uid);
  if (!pl) return fail('msg.notFound');
  pl.rot = pl.rot === 0 ? 1 : 0;
  return { ok: true };
}

/** 收纳（拆回，半价返还金币） */
export function storePlacement(state: GameState, uid: number): ActionResult {
  const idx = state.placements.findIndex((p) => p.uid === uid);
  if (idx < 0) return fail('msg.notFound');
  const def = buildingDef(state.placements[idx].defId);
  state.placements.splice(idx, 1);
  state.player.coins += Math.floor(def.price / 2);
  return { ok: true };
}

/** 岛屿美观度：所有摆放物 beauty 之和 */
export function beautyScore(state: GameState): number {
  let total = 0;
  for (const pl of state.placements) {
    total += buildingDef(pl.defId).beauty;
  }
  return total;
}

/** 扩岛 */
export function expandIsland(state: GameState, now: number): ActionResult {
  const next = ISLAND_TIERS.find((t) => t.tier === state.islandTier + 1);
  if (!next) return fail('msg.maxIsland');
  if (state.player.level < next.minLevel) return fail('msg.locked');
  if (!spendCoins(state, next.price)) return fail('msg.noCoins');
  state.islandTier = next.tier;
  const levelEvents = gainXp(state, 100 * next.tier);
  void now;
  return { ok: true, events: [{ type: 'expand', amount: 1, data: next.tier }, ...levelEvents] };
}

/** 占格是否可通行（路径类可走） */
export function isWalkableFootprint(pl: Placement): boolean {
  return buildingFootprint(pl.defId).walkable;
}

export function islandGridSize(state: GameState): number {
  return islandSize(state.islandTier);
}
