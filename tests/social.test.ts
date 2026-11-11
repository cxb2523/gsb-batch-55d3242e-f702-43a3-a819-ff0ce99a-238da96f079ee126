/** 邻居社交系统测试 */
import { describe, expect, it } from 'vitest';
import { makeGame, NOW } from './helpers';
import { NEIGHBORS } from '../src/data';
import {
  generateNeighborState, helpWater, helpWeed, hireNeighbor, prankNeighbor, simulateNeighbor,
} from '../src/core/social';
import { neighborDef } from '../src/core/registry';
import {
  HELP_PER_NEIGHBOR_PER_DAY, HELP_REPUTATION, PRANK_PER_NEIGHBOR_PER_DAY, PRANK_REPUTATION, HIRE_COST,
} from '../src/core/balance';
import { plant } from '../src/core/crops';

describe('邻居', () => {
  it('新档初始化全部 NPC 邻居', () => {
    const state = makeGame();
    expect(state.neighbors).toHaveLength(NEIGHBORS.length);
    for (const ns of state.neighbors) {
      expect(ns.plots.length).toBeGreaterThanOrEqual(6);
      expect(() => neighborDef(ns.defId)).not.toThrow();
    }
  });

  it('同一人设的邻居岛生成是确定性的（忽略运行时 uid）', () => {
    const persona = NEIGHBORS[0];
    const strip = (plots: { x: number; y: number; crop: unknown }[]): unknown =>
      plots.map((p) => ({ x: p.x, y: p.y, crop: p.crop }));
    const a = generateNeighborState(persona, NOW);
    const b = generateNeighborState(persona, NOW);
    expect(JSON.stringify(strip(a.plots))).toBe(JSON.stringify(strip(b.plots)));
  });

  it('帮工获得声望/金币/好友度，且有每日上限', () => {
    const state = makeGame();
    const ns = state.neighbors[0];
    const rep = state.player.reputation;
    let helped = 0;
    for (let i = 0; i < HELP_PER_NEIGHBOR_PER_DAY + 3; i++) {
      simulateNeighbor(ns, NOW);
      if (ns.weeds.length === 0) {
        ns.weeds.push({ uid: 5000 + i, x: 5, y: 5 });
      }
      const r = helpWeed(state, ns, ns.weeds[0].uid, NOW);
      if (r.ok) helped++;
      else expect(r.reason).toBe('msg.helpLimit');
    }
    expect(helped).toBe(HELP_PER_NEIGHBOR_PER_DAY);
    expect(state.player.reputation).toBe(rep + HELP_REPUTATION * helped);
    expect(ns.friendship).toBeGreaterThan(0);
  });

  it('帮浇水会加速邻居作物', () => {
    const state = makeGame();
    const ns = state.neighbors[1];
    simulateNeighbor(ns, NOW);
    // 找一块未成熟作物；没有就手动种一块
    let plot = ns.plots.find((p) => p.crop && p.crop.plantedAt > NOW - 60_000);
    if (!plot) {
      plot = ns.plots[0];
      plot.crop = { defId: 'crop_corn', plantedAt: NOW, wateredBonusMs: 0, lastWateredAt: 0 };
    }
    const r = helpWater(state, ns, plot.uid, NOW + 1000);
    expect(r.ok).toBe(true);
    expect(plot.crop!.wateredBonusMs).toBeGreaterThan(0);
  });

  it('捣蛋赚声望但掉好友度，有每日上限', () => {
    const state = makeGame();
    const ns = state.neighbors[2];
    ns.friendship = 50;
    const rep = state.player.reputation;
    let pranked = 0;
    for (let i = 0; i < PRANK_PER_NEIGHBOR_PER_DAY + 2; i++) {
      if (prankNeighbor(state, ns, NOW).ok) pranked++;
    }
    expect(pranked).toBe(PRANK_PER_NEIGHBOR_PER_DAY);
    expect(state.player.reputation).toBe(rep + PRANK_REPUTATION * pranked);
    expect(ns.friendship).toBeLessThan(50);
  });

  it('雇佣邻居帮全岛干活', () => {
    const state = makeGame();
    state.player.coins = 10000;
    // 种上作物 + 制造杂草和野兽
    plant(state, state.plots[0].uid, 'crop_carrot', NOW);
    state.weeds.push({ uid: 7001, x: 3, y: 3, spawnedAt: NOW });
    state.beasts.push({ uid: 7002, defId: 'beast_boar', x: 4, y: 4, hp: 2, spawnedAt: NOW });
    const ns = state.neighbors[0];
    const coins = state.player.coins;
    const r = hireNeighbor(state, ns, NOW + 1000);
    expect(r.ok).toBe(true);
    expect(state.player.coins).toBe(coins - HIRE_COST);
    expect(state.weeds).toHaveLength(0);
    expect(state.beasts).toHaveLength(0);
    expect(state.plots[0].crop!.wateredBonusMs).toBeGreaterThan(0);
  });

  it('邻居岛随时间演化：成熟很久的作物会被补种', () => {
    const state = makeGame();
    const ns = state.neighbors[3];
    const later = NOW + 48 * 3600_000;
    simulateNeighbor(ns, later);
    // 演化后没有滞留 48 小时的"很久前就成熟"作物
    for (const p of ns.plots) {
      if (!p.crop) continue;
      expect(p.crop.plantedAt).toBeGreaterThan(NOW - 24 * 3600_000);
    }
    expect(ns.simulatedAt).toBe(later);
  });
});
