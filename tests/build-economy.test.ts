/** 建设/经济/换装/宠物/岛屿 测试 */
import { describe, expect, it } from 'vitest';
import { makeGame, NOW, seedRng } from './helpers';
import { buildTerrain, isFishable, islandSize, terrainAt } from '../src/core/island';
import {
  beautyScore, canPlace, expandIsland, movePlacement, placeBuilding, rotatePlacement, storePlacement,
} from '../src/core/build';
import { buildingDef, clothingDef } from '../src/core/registry';
import { buyBuilding, buyClothing, sellItem, upgradeRod, wearClothing } from '../src/core/economy';
import { addItem } from '../src/core/player';
import { adoptPet, feedPet, petHungry, playPet } from '../src/core/pets';
import { PET_HUNGRY_AFTER_MS } from '../src/core/balance';

function grassSpot(state: ReturnType<typeof makeGame>, w = 1, h = 1): { x: number; y: number } {
  const size = islandSize(state.islandTier);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++) {
        for (let dx = 0; dx < w && ok; dx++) {
          if (terrainAt(state, x + dx, y + dy) !== 'grass') ok = false;
          if (state.plots.some((p) => p.x === x + dx && p.y === y + dy)) ok = false;
        }
      }
      if (ok && canPlace(state, 'bld_hut', x, y)) return { x, y };
    }
  }
  throw new Error('no spot');
}

describe('岛屿地形', () => {
  it('地形由种子决定且缓存一致', () => {
    const a = buildTerrain(42, 1);
    const b = buildTerrain(42, 1);
    expect(a).toBe(b); // 缓存同一引用
    const c = buildTerrain(43, 1);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('岛中心是草地，角落是水，存在可钓鱼的岸边', () => {
    const state = makeGame();
    const size = islandSize(1);
    const c = Math.floor(size / 2);
    expect(terrainAt(state, c, c)).toBe('grass');
    expect(terrainAt(state, 0, 0)).toBe('water');
    let fishable = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFishable(state, x, y)) fishable++;
      }
    }
    expect(fishable).toBeGreaterThan(10);
  });
});

describe('建设', () => {
  it('购买→摆放→美观度→移动→旋转→收纳', () => {
    const state = makeGame();
    state.player.coins = 100000;
    const spot = grassSpot(state);
    expect(buyBuilding(state, 'bld_hut').ok).toBe(true);
    expect(placeBuilding(state, 'bld_hut', spot.x, spot.y).ok).toBe(true);
    expect(beautyScore(state)).toBe(buildingDef('bld_hut').beauty);

    const pl = state.placements[0];
    // 占位冲突
    expect(canPlace(state, 'bld_hut', spot.x, spot.y)).toBe(false);
    expect(rotatePlacement(state, pl.uid).ok).toBe(true);
    expect(pl.rot).toBe(1);

    const spot2 = grassSpot(state);
    expect(movePlacement(state, pl.uid, spot2.x, spot2.y).ok).toBe(true);

    const coins = state.player.coins;
    expect(storePlacement(state, pl.uid).ok).toBe(true);
    expect(state.placements).toHaveLength(0);
    expect(state.player.coins).toBe(coins + Math.floor(buildingDef('bld_hut').price / 2));
  });

  it('水面/被占格不可摆放', () => {
    const state = makeGame();
    expect(canPlace(state, 'bld_hut', 0, 0)).toBe(false); // 水
    const plot = state.plots[0];
    expect(canPlace(state, 'bld_fence', plot.x, plot.y)).toBe(false); // 农田占位
  });

  it('扩岛需要等级和金币', () => {
    const state = makeGame();
    expect(expandIsland(state, NOW).ok).toBe(false); // 等级不够
    state.player.level = 10;
    state.player.coins = 100;
    expect(expandIsland(state, NOW).ok).toBe(false); // 钱不够
    state.player.coins = 5000;
    expect(expandIsland(state, NOW).ok).toBe(true);
    expect(state.islandTier).toBe(2);
    expect(islandSize(2)).toBeGreaterThan(islandSize(1));
  });
});

describe('经济与换装', () => {
  it('出售物品得金币和声望', () => {
    const state = makeGame();
    addItem(state, 'produce_carrot', 10);
    const coins = state.player.coins;
    const r = sellItem(state, 'produce_carrot', 10);
    expect(r.ok).toBe(true);
    expect(state.player.coins).toBeGreaterThan(coins);
    expect(state.inventory['produce_carrot']).toBeUndefined();
  });

  it('买服装→穿戴', () => {
    const state = makeGame();
    state.player.coins = 100000;
    state.player.level = 10;
    expect(buyClothing(state, 'cl_top_hawaii').ok).toBe(true);
    expect(buyClothing(state, 'cl_top_hawaii').ok).toBe(false); // 重复购买
    expect(wearClothing(state, 'cl_top_hawaii').ok).toBe(true);
    expect(state.player.avatar.top).toBe('cl_top_hawaii');
    expect(clothingDef('cl_top_hawaii').slot).toBe('top');
  });

  it('未拥有不能穿', () => {
    const state = makeGame();
    expect(wearClothing(state, 'cl_top_royal').ok).toBe(false);
  });

  it('鱼竿逐级升级到顶', () => {
    const state = makeGame();
    state.player.coins = 100000;
    expect(upgradeRod(state).ok).toBe(true);
    expect(state.player.rodTier).toBe(2);
    expect(upgradeRod(state).ok).toBe(true);
    expect(state.player.rodTier).toBe(3);
    expect(upgradeRod(state).ok).toBe(false);
  });
});

describe('宠物', () => {
  it('领养→喂食→玩耍养成', () => {
    const state = makeGame();
    seedRng(21);
    state.player.coins = 100000;
    state.player.level = 10;
    expect(adoptPet(state, 'pet_puppy', '旺财', NOW).ok).toBe(true);
    expect(adoptPet(state, 'pet_puppy', '旺财2', NOW).ok).toBe(false); // 同种唯一
    const pet = state.pets[0];
    expect(pet.name).toBe('旺财');
    expect(petHungry(pet, NOW)).toBe(false);
    expect(petHungry(pet, NOW + PET_HUNGRY_AFTER_MS + 1)).toBe(true);
    expect(feedPet(state, pet.uid, NOW + PET_HUNGRY_AFTER_MS + 1).ok).toBe(true);
    expect(playPet(state, pet.uid, NOW + PET_HUNGRY_AFTER_MS + 2).ok).toBe(true);
    expect(playPet(state, pet.uid, NOW + PET_HUNGRY_AFTER_MS + 3).ok).toBe(false); // 冷却
    expect(pet.xp).toBeGreaterThan(0);
  });
});
