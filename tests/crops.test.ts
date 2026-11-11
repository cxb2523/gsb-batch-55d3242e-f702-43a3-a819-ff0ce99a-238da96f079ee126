/** 种植系统生命周期测试 */
import { describe, expect, it } from 'vitest';
import { makeGame, NOW } from './helpers';
import { cropDef } from '../src/core/registry';
import { cropView, harvest, plant, till, water } from '../src/core/crops';
import { buySeed } from '../src/core/economy';
import { WATER_COOLDOWN_MS, WATER_SPEEDUP_RATIO } from '../src/core/balance';
import { terrainAt } from '../src/core/island';

function findGrass(state: ReturnType<typeof makeGame>): { x: number; y: number } {
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 18; x++) {
      if (terrainAt(state, x, y) === 'grass' &&
          !state.plots.some((p) => p.x === x && p.y === y)) {
        return { x, y };
      }
    }
  }
  throw new Error('no grass');
}

describe('种植', () => {
  it('完整生命周期：播种→生长→成熟→收获', () => {
    const state = makeGame();
    const plot = state.plots[0];
    const def = cropDef('crop_carrot');
    expect(plant(state, plot.uid, 'crop_carrot', NOW).ok).toBe(true);
    expect(state.inventory[def.seedId]).toBe(3); // 初始 4 颗

    expect(cropView(plot.crop!, NOW + 1000).stage).toBe('seedling');
    expect(cropView(plot.crop!, NOW + def.growMs - 1000).stage).toBe('mature');
    expect(cropView(plot.crop!, NOW + def.growMs).stage).toBe('ready');

    const before = state.player.food;
    const r = harvest(state, plot.uid, NOW + def.growMs);
    expect(r.ok).toBe(true);
    expect(plot.crop).toBeNull();
    expect(state.inventory[def.produceId]).toBeGreaterThanOrEqual(def.yieldMin);
    expect(state.player.food).toBe(before + def.foodYield);
  });

  it('没有种子时播种失败', () => {
    const state = makeGame();
    const r = plant(state, state.plots[0].uid, 'crop_potato', NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('msg.noSeed');
  });

  it('等级不足的作物即使有种子也种不了', () => {
    const state = makeGame();
    state.inventory['seed_pumpkin'] = 1;
    const r = plant(state, state.plots[0].uid, 'crop_pumpkin', NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('msg.locked');
  });

  it('等级不足的作物买不了种子', () => {
    const state = makeGame();
    expect(buySeed(state, 'crop_starfruit', 1).ok).toBe(false);
  });

  it('浇水缩短剩余时间且有冷却', () => {
    const state = makeGame();
    const plot = state.plots[0];
    const def = cropDef('crop_carrot');
    plant(state, plot.uid, 'crop_carrot', NOW);
    const beforeEta = cropView(plot.crop!, NOW + 1000).etaMs;
    expect(water(state, plot.uid, NOW + 1000).ok).toBe(true);
    const afterEta = cropView(plot.crop!, NOW + 1000).etaMs;
    expect(afterEta).toBeLessThan(beforeEta);
    expect(Math.abs(afterEta - beforeEta * (1 - WATER_SPEEDUP_RATIO))).toBeLessThan(50);
    // 冷却中再浇失败
    expect(water(state, plot.uid, NOW + 2000).ok).toBe(false);
    expect(water(state, plot.uid, NOW + 1000 + WATER_COOLDOWN_MS + def.growMs).ok).toBe(false); // 已成熟无需浇水
  });

  it('过期枯萎并可铲除', () => {
    const state = makeGame();
    const plot = state.plots[0];
    const def = cropDef('crop_carrot');
    plant(state, plot.uid, 'crop_carrot', NOW);
    const witherTime = NOW + def.growMs + def.witherMs + 1000;
    expect(cropView(plot.crop!, witherTime).stage).toBe('withered');
    const inv = { ...state.inventory };
    expect(harvest(state, plot.uid, witherTime).ok).toBe(true);
    expect(plot.crop).toBeNull();
    expect(state.inventory[def.produceId] ?? 0).toBe(inv[def.produceId] ?? 0); // 枯萎无产出
  });

  it('果树重复结果且不枯萎', () => {
    const state = makeGame();
    state.player.coins = 100000;
    state.player.level = 10;
    buySeed(state, 'crop_banana', 1);
    const plot = state.plots[0];
    plant(state, plot.uid, 'crop_banana', NOW);
    const def = cropDef('crop_banana');
    const t1 = NOW + def.growMs;
    expect(cropView(plot.crop!, t1).stage).toBe('ready');
    expect(cropView(plot.crop!, t1 + 365 * 24 * 3600_000).stage).toBe('ready'); // 一年后也不枯
    expect(harvest(state, plot.uid, t1).ok).toBe(true);
    expect(plot.crop).not.toBeNull(); // 树还在
    expect(cropView(plot.crop!, t1 + 1000).stage).not.toBe('ready');
    expect(cropView(plot.crop!, t1 + def.regrowMs!).stage).toBe('ready');
  });

  it('开垦消耗金币与能量并新增地块', () => {
    const state = makeGame();
    const { x, y } = findGrass(state);
    const coins = state.player.coins;
    const n = state.plots.length;
    expect(till(state, x, y, NOW).ok).toBe(true);
    expect(state.plots.length).toBe(n + 1);
    expect(state.player.coins).toBeLessThan(coins);
    // 同一格重复开垦失败
    expect(till(state, x, y, NOW).ok).toBe(false);
  });
});
