/** RNG / 数值曲线 / 玩家资源 基础测试 */
import { describe, expect, it } from 'vitest';
import { makeGame, NOW } from './helpers';
import { hashSeed, mulberry32, randInt, weightedPick } from '../src/core/rng';
import {
  ENERGY_REGEN_MS, ISLAND_TIERS, MAX_LEVEL, maxEnergy, tillCost, xpForNextLevel,
} from '../src/core/balance';
import {
  gainCoins, gainXp, itemCount, addItem, removeItem, spendCoins, spendEnergy, updateEnergy,
} from '../src/core/player';

describe('rng', () => {
  it('同种子序列完全一致', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('randInt 落在闭区间', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = randInt(rng, 2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('weightedPick 权重为零的项不可能被抽中', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 300; i++) {
      expect(weightedPick(rng, ['a', 'b'], [0, 1])).toBe('b');
    }
  });

  it('hashSeed 稳定', () => {
    expect(hashSeed('paradise')).toBe(hashSeed('paradise'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
});

describe('balance', () => {
  it('经验曲线单调递增', () => {
    for (let lv = 1; lv < MAX_LEVEL; lv++) {
      expect(xpForNextLevel(lv + 1)).toBeGreaterThan(xpForNextLevel(lv));
    }
  });

  it('能量上限随等级增长', () => {
    expect(maxEnergy(1)).toBe(21);
    expect(maxEnergy(10)).toBe(30);
  });

  it('开垦成本递增', () => {
    expect(tillCost(5)).toBeGreaterThan(tillCost(0));
  });

  it('扩岛档位递增', () => {
    for (let i = 1; i < ISLAND_TIERS.length; i++) {
      expect(ISLAND_TIERS[i].size).toBeGreaterThan(ISLAND_TIERS[i - 1].size);
      expect(ISLAND_TIERS[i].price).toBeGreaterThan(ISLAND_TIERS[i - 1].price);
    }
  });
});

describe('player 资源', () => {
  it('能量按时间恢复且不超上限', () => {
    const state = makeGame();
    state.player.energy = 5;
    state.player.energyUpdatedAt = NOW;
    updateEnergy(state, NOW + ENERGY_REGEN_MS * 3 + 10);
    expect(state.player.energy).toBe(8);
    updateEnergy(state, NOW + ENERGY_REGEN_MS * 1000);
    expect(state.player.energy).toBe(maxEnergy(state.player.level));
  });

  it('spendEnergy 不足时返回 false', () => {
    const state = makeGame();
    state.player.energy = 1;
    state.player.energyUpdatedAt = NOW;
    expect(spendEnergy(state, 2, NOW)).toBe(false);
    expect(spendEnergy(state, 1, NOW)).toBe(true);
    expect(state.player.energy).toBe(0);
  });

  it('gainXp 可连升多级并回满能量', () => {
    const state = makeGame();
    state.player.energy = 0;
    const events = gainXp(state, xpForNextLevel(1) + xpForNextLevel(2) + 5);
    expect(state.player.level).toBe(3);
    expect(state.player.xp).toBe(5);
    expect(state.player.energy).toBe(maxEnergy(3));
    expect(events.filter((e) => e.type === 'levelUp')).toHaveLength(2);
  });

  it('金币收支记入统计', () => {
    const state = makeGame();
    const before = state.player.coins;
    gainCoins(state, 100);
    expect(state.player.coins).toBe(before + 100);
    expect(state.stats.coinsEarned).toBe(100);
    expect(spendCoins(state, 99999)).toBe(false);
    expect(spendCoins(state, 50)).toBe(true);
    expect(state.stats.coinsSpent).toBe(50);
  });

  it('背包增删', () => {
    const state = makeGame();
    addItem(state, 'produce_carrot', 3);
    expect(itemCount(state, 'produce_carrot')).toBe(3);
    expect(removeItem(state, 'produce_carrot', 4)).toBe(false);
    expect(removeItem(state, 'produce_carrot', 3)).toBe(true);
    expect(itemCount(state, 'produce_carrot')).toBe(0);
  });
});
