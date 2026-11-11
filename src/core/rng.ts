/**
 * 确定性随机数：mulberry32。
 * 世界生成（地形/邻居岛）用带种子的实例保证可复现；
 * 玩法掷骰（钓鱼/掉落）用全局实例，测试时可注入种子。
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min, max] 闭区间整数 */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 按权重抽取；weights 与 items 对齐 */
export function weightedPick<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** 打乱（Fisher–Yates，返回新数组） */
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 字符串哈希成 32 位种子（邻居岛种子派生用） */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 全局玩法 RNG（可注入用于测试） */
let gameplayRng: Rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);

export function setGameplayRng(rng: Rng): void {
  gameplayRng = rng;
}

export function roll(): number {
  return gameplayRng();
}

export function rollInt(min: number, max: number): number {
  return randInt(gameplayRng, min, max);
}

export function rollChance(p: number): boolean {
  return chance(gameplayRng, p);
}

export function rollPick<T>(arr: readonly T[]): T {
  return pick(gameplayRng, arr);
}

export function rollWeighted<T>(items: readonly T[], weights: readonly number[]): T {
  return weightedPick(gameplayRng, items, weights);
}
