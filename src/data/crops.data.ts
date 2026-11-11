/**
 * 作物表：18 种田地作物 + 8 种果树。
 * 早期作物生长快（分钟级）便于上手，后期作物周期长收益高。
 * 数值原则：金币收益 ≈ 种子价 ×(1.8~2.6)，生长越久单位收益越高。
 */
import type { CropDef } from '../core/types';

const M = 60_000;
const H = 3600_000;

function crop(
  id: string, zh: string, en: string, unlockLevel: number,
  seedPrice: number, sellPrice: number, xp: number, foodYield: number,
  growMs: number, witherMs: number, yieldMin: number, yieldMax: number,
): CropDef {
  return {
    id: `crop_${id}`,
    name: { zh, en },
    seedId: `seed_${id}`,
    produceId: `produce_${id}`,
    unlockLevel, seedPrice, sellPrice, xp, foodYield,
    growMs, witherMs, yieldMin, yieldMax,
    isTree: false,
    sprite: `crop_${id}`,
  };
}

function tree(
  id: string, zh: string, en: string, unlockLevel: number,
  seedPrice: number, sellPrice: number, xp: number, foodYield: number,
  growMs: number, regrowMs: number, yieldMin: number, yieldMax: number,
): CropDef {
  return {
    id: `crop_${id}`,
    name: { zh, en },
    seedId: `seed_${id}`,
    produceId: `produce_${id}`,
    unlockLevel, seedPrice, sellPrice, xp, foodYield,
    growMs, witherMs: 0, yieldMin, yieldMax,
    isTree: true, regrowMs,
    sprite: `crop_${id}`,
  };
}

export const CROPS: CropDef[] = [
  // ---- 田地作物（id, 中文, 英文, 解锁级, 种价, 卖价, 经验, 食物, 生长, 枯萎, 产量min-max）
  crop('carrot',     '胡萝卜',   'Carrot',      1,  10,  8, 2, 2,  90 * 1000, 30 * M, 2, 3),
  crop('potato',     '土豆',     'Potato',      1,  14, 10, 3, 3,   3 * M,    40 * M, 2, 3),
  crop('strawberry', '草莓',     'Strawberry',  2,  22, 16, 4, 2,   5 * M,    45 * M, 2, 4),
  crop('corn',       '玉米',     'Corn',        3,  30, 20, 5, 4,   8 * M,    60 * M, 2, 4),
  crop('tomato',     '番茄',     'Tomato',      4,  40, 26, 6, 3,  12 * M,    60 * M, 3, 4),
  crop('cabbage',    '卷心菜',   'Cabbage',     5,  55, 34, 8, 5,  18 * M,    75 * M, 2, 3),
  crop('pineapple',  '菠萝',     'Pineapple',   6,  80, 55, 10, 4, 30 * M,    90 * M, 2, 3),
  crop('eggplant',   '茄子',     'Eggplant',    8, 100, 62, 12, 4, 45 * M,     2 * H, 3, 4),
  crop('pumpkin',    '南瓜',     'Pumpkin',    10, 140, 90, 15, 6,  1 * H,     3 * H, 2, 3),
  crop('chili',      '海岛椒',   'Isle Chili', 12, 180, 115, 18, 3, 1.5 * H,   3 * H, 3, 5),
  crop('melon',      '西瓜',     'Watermelon', 14, 240, 150, 22, 7,  2 * H,    4 * H, 2, 3),
  crop('rice',       '水稻',     'Rice',       16, 300, 175, 26, 10, 3 * H,    5 * H, 3, 5),
  crop('taro',       '香芋',     'Taro',       18, 380, 230, 32, 8,  4 * H,    6 * H, 3, 4),
  crop('orchid',     '幽兰花',   'Orchid',     21, 500, 330, 40, 0,  6 * H,    8 * H, 2, 3),
  crop('sugarcane',  '甘蔗',     'Sugarcane',  24, 650, 420, 50, 9,  8 * H,   10 * H, 3, 4),
  crop('cacao',      '可可豆',   'Cacao',      28, 850, 560, 62, 6, 12 * H,   12 * H, 3, 4),
  crop('ginseng',    '岛参',     'Isle Ginseng', 32, 1200, 800, 80, 5, 16 * H, 12 * H, 3, 4),
  crop('starfruit',  '星光果',   'Starfruit',  38, 1800, 1250, 110, 8, 24 * H, 16 * H, 3, 5),
  // ---- 果树（不枯萎，重复结果）
  tree('banana',   '香蕉树',   'Banana Tree',   3,  120,  30,  8, 4, 25 * M, 20 * M, 2, 3),
  tree('coconut',  '椰子树',   'Coconut Palm',  5,  200,  45, 10, 5, 40 * M, 30 * M, 2, 3),
  tree('apple',    '苹果树',   'Apple Tree',    8,  350,  70, 14, 6,  1 * H, 50 * M, 2, 4),
  tree('lemon',    '柠檬树',   'Lemon Tree',   12,  550, 100, 18, 5,  2 * H, 1.2 * H, 3, 4),
  tree('mango',    '芒果树',   'Mango Tree',   17,  900, 160, 26, 7,  4 * H,  2 * H, 3, 4),
  tree('lychee',   '荔枝树',   'Lychee Tree',  22, 1400, 240, 36, 8,  6 * H,  3 * H, 3, 5),
  tree('peach',    '蟠桃树',   'Peach Tree',   30, 2400, 400, 55, 10, 10 * H, 5 * H, 3, 4),
  tree('goldfruit','黄金果树', 'Gold Fruit Tree', 40, 5000, 900, 90, 6, 18 * H, 8 * H, 2, 3),
];
