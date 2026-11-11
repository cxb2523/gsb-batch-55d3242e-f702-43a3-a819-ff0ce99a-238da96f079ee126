/**
 * 种植系统：开垦 → 播种 → 浇水加速 → 收获/枯萎。
 * 树木不枯萎，按 regrowMs 周期重复结果。
 */
import type { ActionResult, CropStage, FarmPlot, GameState, PlantedCrop } from './types';
import { cropDef } from './registry';
import { ENERGY_COST, WATER_COOLDOWN_MS, WATER_SPEEDUP_RATIO, beautyXpBonus, tillCost } from './balance';
import { addItem, gainFood, gainXp, nextUid, removeItem, spendCoins, spendEnergy } from './player';
import { isOccupied, terrainAt } from './island';
import { beautyScore } from './build';
import { rollInt } from './rng';
import { fail } from './types';

/** 首次成熟时间点 */
function readyAt(crop: PlantedCrop): number {
  const def = cropDef(crop.defId);
  if (def.isTree && crop.lastHarvestAt) {
    return crop.lastHarvestAt + (def.regrowMs ?? def.growMs) - crop.wateredBonusMs;
  }
  return crop.plantedAt + def.growMs - crop.wateredBonusMs;
}

export interface CropView {
  stage: CropStage;
  /** 0-1 生长进度（ready/withered 恒为 1） */
  progress: number;
  /** 距成熟/枯萎的剩余毫秒 */
  etaMs: number;
  wet: boolean;
}

export function cropView(crop: PlantedCrop, now: number): CropView {
  const def = cropDef(crop.defId);
  const ra = readyAt(crop);
  const wet = now - crop.lastWateredAt < WATER_COOLDOWN_MS;
  if (now >= ra) {
    if (!def.isTree && now >= ra + def.witherMs) {
      return { stage: 'withered', progress: 1, etaMs: 0, wet };
    }
    return {
      stage: 'ready',
      progress: 1,
      etaMs: def.isTree ? 0 : ra + def.witherMs - now,
      wet,
    };
  }
  const total = def.isTree && crop.lastHarvestAt ? (def.regrowMs ?? def.growMs) : def.growMs;
  const progress = Math.max(0, Math.min(1, 1 - (ra - now) / total));
  const stage: CropStage = progress < 0.34 ? 'seedling' : progress < 0.8 ? 'growing' : 'mature';
  return { stage, progress, etaMs: ra - now, wet };
}

export function plotByUid(state: GameState, uid: number): FarmPlot | undefined {
  return state.plots.find((p) => p.uid === uid);
}

/** 开垦：草地格 → 农田 */
export function till(state: GameState, x: number, y: number, now: number): ActionResult {
  if (terrainAt(state, x, y) !== 'grass') return fail('msg.needGrass');
  if (isOccupied(state, x, y)) return fail('msg.occupied');
  if (state.weeds.some((w) => w.x === x && w.y === y)) return fail('msg.weedHere');
  const cost = tillCost(state.plots.length);
  if (state.player.coins < cost) return fail('msg.noCoins');
  if (!spendEnergy(state, ENERGY_COST.till, now)) return fail('msg.noEnergy');
  spendCoins(state, cost);
  state.plots.push({ uid: nextUid(state), x, y, crop: null });
  return { ok: true, events: [{ type: 'tillPlot', amount: 1 }] };
}

/** 播种（需背包中有种子） */
export function plant(state: GameState, plotUid: number, cropId: string, now: number): ActionResult {
  const plot = plotByUid(state, plotUid);
  if (!plot) return fail('msg.noPlot');
  if (plot.crop) return fail('msg.plotBusy');
  const def = cropDef(cropId);
  if (state.player.level < def.unlockLevel) return fail('msg.locked');
  if ((state.inventory[def.seedId] || 0) < 1) return fail('msg.noSeed');
  if (!spendEnergy(state, ENERGY_COST.plant, now)) return fail('msg.noEnergy');
  removeItem(state, def.seedId, 1);
  plot.crop = { defId: cropId, plantedAt: now, wateredBonusMs: 0, lastWateredAt: 0 };
  return { ok: true, events: [{ type: 'plant', target: cropId, amount: 1 }] };
}

/** 浇水：减少剩余生长时间的 25%，冷却 5 分钟 */
export function water(state: GameState, plotUid: number, now: number): ActionResult {
  const plot = plotByUid(state, plotUid);
  if (!plot || !plot.crop) return fail('msg.noCrop');
  const view = cropView(plot.crop, now);
  if (view.stage === 'ready' || view.stage === 'withered') return fail('msg.noNeedWater');
  if (now - plot.crop.lastWateredAt < WATER_COOLDOWN_MS) return fail('msg.waterCd');
  if (!spendEnergy(state, ENERGY_COST.water, now)) return fail('msg.noEnergy');
  const remaining = view.etaMs;
  plot.crop.wateredBonusMs += Math.round(remaining * WATER_SPEEDUP_RATIO);
  plot.crop.lastWateredAt = now;
  return { ok: true, events: [{ type: 'water', target: plot.crop.defId, amount: 1 }] };
}

/** 收获（成熟）或铲除（枯萎） */
export function harvest(state: GameState, plotUid: number, now: number): ActionResult {
  const plot = plotByUid(state, plotUid);
  if (!plot || !plot.crop) return fail('msg.noCrop');
  const crop = plot.crop;
  const def = cropDef(crop.defId);
  const view = cropView(crop, now);

  if (view.stage === 'withered') {
    if (!spendEnergy(state, ENERGY_COST.harvest, now)) return fail('msg.noEnergy');
    plot.crop = null;
    return { ok: true, events: [{ type: 'toast', target: 'msg.cleared' }] };
  }
  if (view.stage !== 'ready') return fail('msg.notReady');
  if (!spendEnergy(state, ENERGY_COST.harvest, now)) return fail('msg.noEnergy');

  const amount = rollInt(def.yieldMin, def.yieldMax);
  addItem(state, def.produceId, amount);
  gainFood(state, def.foodYield);
  const xp = Math.round(def.xp * (1 + beautyXpBonus(beautyScore(state))));
  const levelEvents = gainXp(state, xp);

  if (def.isTree) {
    crop.lastHarvestAt = now;
    crop.wateredBonusMs = 0;
  } else {
    plot.crop = null;
  }
  return {
    ok: true,
    events: [{ type: 'harvest', target: def.id, amount }, ...levelEvents],
  };
}

/** 铲除作物（任何阶段，不退种子） */
export function removeCrop(state: GameState, plotUid: number, now: number): ActionResult {
  const plot = plotByUid(state, plotUid);
  if (!plot || !plot.crop) return fail('msg.noCrop');
  if (!spendEnergy(state, ENERGY_COST.till, now)) return fail('msg.noEnergy');
  plot.crop = null;
  return { ok: true };
}

/** 移除空农田（恢复草地） */
export function removePlot(state: GameState, plotUid: number): ActionResult {
  const idx = state.plots.findIndex((p) => p.uid === plotUid);
  if (idx < 0) return fail('msg.noPlot');
  if (state.plots[idx].crop) return fail('msg.plotBusy');
  state.plots.splice(idx, 1);
  return { ok: true };
}

/** 有作物成熟待收的地块数（离线汇总用） */
export function readyPlotCount(state: GameState, now: number): number {
  let n = 0;
  for (const p of state.plots) {
    if (p.crop && cropView(p.crop, now).stage === 'ready') n++;
  }
  return n;
}
