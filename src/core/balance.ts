/**
 * 数值平衡：经验曲线、能量、扩岛、声望等全部集中在这里，
 * 方便整体调参，也是测试的重点对象。
 */

export const MAX_LEVEL = 60;

/** 升到 (level+1) 级需要的本级经验 */
export function xpForNextLevel(level: number): number {
  return Math.round(60 * Math.pow(level, 1.55) + 40);
}

/** 能量上限 */
export function maxEnergy(level: number): number {
  return 20 + Math.min(level, MAX_LEVEL);
}

/** 能量恢复：每 ENERGY_REGEN_MS 恢复 1 点 */
export const ENERGY_REGEN_MS = 90_000;

/** 各动作能量消耗 */
export const ENERGY_COST = {
  till: 1,
  plant: 1,
  water: 1,
  harvest: 1,
  feedAnimal: 1,
  collectAnimal: 1,
  clearWeed: 1,
  fight: 1,        // 每次攻击
  fishCast: 2,
  playPet: 1,
  helpNeighbor: 1, // 在邻居岛帮工每个动作
  prank: 2,
} as const;

/** 浇水：每次减少剩余生长时间的比例，以及冷却 */
export const WATER_SPEEDUP_RATIO = 0.25;
export const WATER_COOLDOWN_MS = 5 * 60_000;

/** 开垦一块地的金币成本（随已有地块数递增） */
export function tillCost(existingPlots: number): number {
  return 20 + existingPlots * 12;
}

/** 扩岛：tier 1-5，对应边长与价格/等级要求 */
export interface IslandTierDef {
  tier: number;
  size: number;
  price: number;
  minLevel: number;
}

export const ISLAND_TIERS: IslandTierDef[] = [
  { tier: 1, size: 18, price: 0, minLevel: 1 },
  { tier: 2, size: 22, price: 2_000, minLevel: 6 },
  { tier: 3, size: 26, price: 8_000, minLevel: 12 },
  { tier: 4, size: 30, price: 25_000, minLevel: 20 },
  { tier: 5, size: 34, price: 80_000, minLevel: 30 },
];

/** 野兽入侵间隔（毫秒）：等级越高越频繁，但有下限 */
export function beastIntervalMs(level: number): [number, number] {
  const base = Math.max(6, 20 - level * 0.4);
  return [base * 60_000 * 0.7, base * 60_000 * 1.3];
}

/** 杂草生长间隔 */
export const WEED_INTERVAL_MS: [number, number] = [8 * 60_000, 18 * 60_000];
export const WEED_XP = 1;
export const WEED_COIN = 3;
export const MAX_WEEDS = 8;
export const MAX_BEASTS = 3;

/** 邻居互动 */
export const HELP_PER_NEIGHBOR_PER_DAY = 5;
export const PRANK_PER_NEIGHBOR_PER_DAY = 2;
export const HELP_REPUTATION = 2;
export const HELP_COIN = 8;
export const HELP_XP = 2;
export const PRANK_REPUTATION = 3;
export const PRANK_FRIENDSHIP_LOSS = 2;
export const HELP_FRIENDSHIP_GAIN = 3;
export const HIRE_COST = 150;
export const HIRE_FRIENDSHIP_GAIN = 5;

/** 好友度等级：每级所需 */
export function friendshipLevel(points: number): number {
  return Math.floor(Math.sqrt(points / 10));
}

/** 宠物 */
export const PET_FEED_FOOD = 5;
export const PET_HUNGRY_AFTER_MS = 6 * 3600_000;
export const PET_XP_FEED = 4;
export const PET_XP_PLAY = 6;
export const PET_PLAY_COOLDOWN_MS = 30 * 60_000;

export function petLevel(xp: number): number {
  return Math.min(10, Math.floor(Math.sqrt(xp / 15)) + 1);
}

/** 宠物技能 CD */
export const PET_SKILL_CD_MS: Record<string, number> = {
  scare_beast: 2 * 3600_000,
  find_gift: 20 * 3600_000,
  cheer: 0,             // 被动：能量恢复加速 10%
  lucky_fish: 0,        // 被动：稀有鱼概率 +15%
};

/** 动物饥饿提示：产出收取后即饥饿；喂食后 produceMs 产出 */

/** 美观度 → 收获经验加成（每 100 美观 +2%，上限 +20%） */
export function beautyXpBonus(beauty: number): number {
  return Math.min(0.2, Math.floor(beauty / 100) * 0.02);
}

/** 出售物品的声望奖励：每卖 50 金币值 +1 声望 */
export function sellReputation(totalCoins: number): number {
  return Math.floor(totalCoins / 50);
}

/** 每日任务数量 */
export const DAILY_QUEST_COUNT = 3;

/** 初始资源 */
export const STARTING = {
  coins: 500,
  food: 30,
  reputation: 0,
} as const;
