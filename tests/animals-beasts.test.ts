/** 畜牧 + 野兽系统测试 */
import { describe, expect, it } from 'vitest';
import { makeGame, NOW, seedRng } from './helpers';
import { animalDef } from '../src/core/registry';
import { animalPhase, buyAnimal, collectAnimal, feedAnimal, sellAnimal } from '../src/core/animals';
import { fightBeast, tickBeastMischief, tickBeasts } from '../src/core/beasts';
import { MAX_BEASTS } from '../src/core/balance';

describe('畜牧', () => {
  it('购买→饥饿→喂食→产出→收取 循环', () => {
    const state = makeGame();
    state.player.level = 5;
    state.player.coins = 10000;
    expect(buyAnimal(state, 'animal_chicken', NOW).ok).toBe(true);
    const hen = state.animals[0];
    expect(animalPhase(hen, NOW)).toBe('hungry');

    const def = animalDef('animal_chicken');
    const foodBefore = state.player.food;
    expect(feedAnimal(state, hen.uid, NOW).ok).toBe(true);
    expect(state.player.food).toBe(foodBefore - def.feedCost);
    expect(animalPhase(hen, NOW + 1000)).toBe('producing');
    expect(collectAnimal(state, hen.uid, NOW + 1000).ok).toBe(false); // 未好
    expect(animalPhase(hen, NOW + def.produceMs)).toBe('ready');

    const r = collectAnimal(state, hen.uid, NOW + def.produceMs);
    expect(r.ok).toBe(true);
    expect(state.inventory[def.produceId]).toBeGreaterThanOrEqual(def.produceMin);
    expect(animalPhase(hen, NOW + def.produceMs)).toBe('hungry'); // 回到饥饿
  });

  it('食物不足喂不了', () => {
    const state = makeGame();
    state.player.level = 5;
    state.player.coins = 10000;
    buyAnimal(state, 'animal_chicken', NOW);
    state.player.food = 0;
    expect(feedAnimal(state, state.animals[0].uid, NOW).ok).toBe(false);
  });

  it('出售动物半价回收', () => {
    const state = makeGame();
    state.player.level = 5;
    state.player.coins = 10000;
    buyAnimal(state, 'animal_chicken', NOW);
    const coins = state.player.coins;
    expect(sellAnimal(state, state.animals[0].uid).ok).toBe(true);
    expect(state.animals).toHaveLength(0);
    expect(state.player.coins).toBe(coins + Math.floor(animalDef('animal_chicken').buyPrice / 2));
  });
});

describe('野兽', () => {
  it('时间推进后野兽出现且不超上限', () => {
    const state = makeGame();
    seedRng(1);
    tickBeasts(state, NOW);
    expect(state.beasts).toHaveLength(0); // 首次只排程
    // 快进 10 小时，多次 tick
    let t = NOW;
    for (let i = 0; i < 40; i++) {
      t += 30 * 60_000;
      tickBeasts(state, t);
    }
    expect(state.beasts.length).toBeGreaterThan(0);
    expect(state.beasts.length).toBeLessThanOrEqual(MAX_BEASTS);
  });

  it('战斗：暴击两次击退野猪并获得奖励', () => {
    const state = makeGame();
    seedRng(2);
    state.beasts.push({ uid: 901, defId: 'beast_boar', x: 5, y: 5, hp: 2, spawnedAt: NOW });
    const coins = state.player.coins;
    const r1 = fightBeast(state, 901, 1.0, NOW); // 暴击 2 伤害 → 直接击退
    expect(r1.ok).toBe(true);
    expect(r1.round?.defeated).toBe(true);
    expect(state.beasts).toHaveLength(0);
    expect(state.player.coins).toBeGreaterThan(coins);
    expect(state.collections.beasts['beast_boar']).toBe(1);
  });

  it('低精度攻击落空', () => {
    const state = makeGame();
    seedRng(3);
    state.beasts.push({ uid: 902, defId: 'beast_boar', x: 5, y: 5, hp: 2, spawnedAt: NOW });
    const r = fightBeast(state, 902, 0.1, NOW);
    expect(r.round?.hit).toBe(false);
    expect(state.beasts).toHaveLength(1); // 还在
  });

  it('野兽滞留过久自行离开并可能踩坏作物', () => {
    const state = makeGame();
    seedRng(4);
    state.beasts.push({ uid: 903, defId: 'beast_boar', x: 5, y: 5, hp: 2, spawnedAt: NOW });
    tickBeastMischief(state, NOW + 5 * 3600_000);
    expect(state.beasts).toHaveLength(0);
  });
});
