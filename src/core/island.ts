/**
 * 岛屿地形生成与占格查询。
 * 地形由 (seed, tier) 完全决定 —— 存档只存 tier，地形随时可重建。
 */
import { mulberry32 } from './rng';
import { ISLAND_TIERS } from './balance';
import type { GameState, Terrain } from './types';

export function islandSize(tier: number): number {
  return ISLAND_TIERS[Math.min(tier, ISLAND_TIERS.length) - 1].size;
}

const terrainCache = new Map<string, Terrain[][]>();

/**
 * 生成 size×size 地形：中心草地、外圈沙滩、四周海水。
 * 用角度扰动半径造出自然的海岸线；扩岛时海岸线外推但内部形状稳定。
 */
export function buildTerrain(seed: number, tier: number): Terrain[][] {
  const key = `${seed}:${tier}`;
  const cached = terrainCache.get(key);
  if (cached) return cached;

  const size = islandSize(tier);
  const c = (size - 1) / 2;
  // 固定 64 个角度采样的扰动值（与 tier 无关 → 扩岛后海岸风格一致）
  const rng = mulberry32(seed);
  const wobble: number[] = [];
  for (let i = 0; i < 64; i++) wobble.push(0.82 + rng() * 0.36);

  const grassR = size * 0.30;
  const sandR = size * 0.40;
  const grid: Terrain[][] = [];
  for (let y = 0; y < size; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx) + Math.PI; // 0..2π
      const wi = Math.floor((ang / (Math.PI * 2)) * 64) % 64;
      const w = wobble[wi];
      if (dist < grassR * w) row.push('grass');
      else if (dist < sandR * ((w + 1) / 2)) row.push('sand');
      else row.push('water');
    }
    grid.push(row);
  }
  terrainCache.set(key, grid);
  return grid;
}

export function terrainAt(state: GameState, x: number, y: number): Terrain {
  const grid = buildTerrain(state.seed, state.islandTier);
  if (y < 0 || y >= grid.length || x < 0 || x >= grid.length) return 'water';
  return grid[y][x];
}

export function isLand(state: GameState, x: number, y: number): boolean {
  const t = terrainAt(state, x, y);
  return t === 'grass' || t === 'sand';
}

/** 水边（可钓鱼）：水格且四邻有陆地 */
export function isFishable(state: GameState, x: number, y: number): boolean {
  if (terrainAt(state, x, y) !== 'water') return false;
  return (
    isLand(state, x - 1, y) || isLand(state, x + 1, y) ||
    isLand(state, x, y - 1) || isLand(state, x, y + 1)
  );
}

export interface OccupancyOptions {
  ignoreUid?: number;
}

/** 某格是否被地块/建筑/动物/宠物占用 */
export function isOccupied(state: GameState, x: number, y: number, opt: OccupancyOptions = {}): boolean {
  for (const p of state.plots) {
    if (p.uid !== opt.ignoreUid && p.x === x && p.y === y) return true;
  }
  for (const pl of state.placements) {
    if (pl.uid === opt.ignoreUid) continue;
    const def = buildingFootprint(pl.defId);
    if (x >= pl.x && x < pl.x + def.w && y >= pl.y && y < pl.y + def.h) return true;
  }
  for (const a of state.animals) {
    if (a.uid !== opt.ignoreUid && a.x === x && a.y === y) return true;
  }
  return false;
}

// 由 data/buildings.data.ts 注册占地信息，避免 core→data 循环
const footprints = new Map<string, { w: number; h: number; walkable: boolean }>();
export function registerFootprint(defId: string, w: number, h: number, walkable: boolean): void {
  footprints.set(defId, { w, h, walkable });
}
export function buildingFootprint(defId: string): { w: number; h: number; walkable: boolean } {
  return footprints.get(defId) || { w: 1, h: 1, walkable: false };
}

/** 找一个空闲草地格（动物落位/野兽出生用） */
export function findFreeGrass(
  state: GameState,
  rnd: () => number,
  tries = 60,
): { x: number; y: number } | null {
  const size = islandSize(state.islandTier);
  for (let i = 0; i < tries; i++) {
    const x = Math.floor(rnd() * size);
    const y = Math.floor(rnd() * size);
    if (terrainAt(state, x, y) === 'grass' && !isOccupied(state, x, y) &&
        !state.weeds.some((w) => w.x === x && w.y === y) &&
        !state.beasts.some((b) => b.x === x && b.y === y)) {
      return { x, y };
    }
  }
  return null;
}
