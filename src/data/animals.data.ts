/**
 * 动物表：10 种。喂食消耗食物，等待产出周期后收取。
 * 数值原则：产出金币值 ≈ 饲料食物值 ×(8~14)，周期越长回报率越高。
 */
import type { AnimalDef } from '../core/types';

const M = 60_000;
const H = 3600_000;

function animal(
  id: string, zh: string, en: string, unlockLevel: number, buyPrice: number,
  produceMs: number, feedCost: number, xp: number, produceMin: number, produceMax: number,
): AnimalDef {
  return {
    id: `animal_${id}`,
    name: { zh, en },
    unlockLevel, buyPrice,
    produceId: `good_${id}`,
    produceMs, feedCost, xp, produceMin, produceMax,
    sprite: `animal_${id}`,
  };
}

export const ANIMALS: AnimalDef[] = [
  //      id         中文       英文        级  价格    周期      饲料 经验 产量
  animal('chicken', '小母鸡',   'Hen',       2,   150,  6 * M,    2,  4, 1, 2),
  animal('duck',    '白鸭',     'Duck',      4,   300, 15 * M,    3,  6, 1, 2),
  animal('rabbit',  '长毛兔',   'Wool Rabbit', 6,  550, 30 * M,   4,  9, 1, 2),
  animal('goat',    '奶山羊',   'Dairy Goat', 9, 1000,  1 * H,    6, 13, 1, 2),
  animal('pig',     '花斑猪',   'Spotted Pig', 12, 1800, 2 * H,   9, 18, 1, 3),
  animal('sheep',   '绵羊',     'Sheep',     15, 3000,  3 * H,   12, 24, 1, 3),
  animal('cow',     '奶牛',     'Cow',       19, 5000,  5 * H,   16, 32, 2, 3),
  animal('turkey',  '火鸡',     'Turkey',    24, 8500,  8 * H,   22, 45, 2, 3),
  animal('alpaca',  '羊驼',     'Alpaca',    30, 15000, 12 * H,  30, 65, 2, 4),
  animal('peacock', '蓝孔雀',   'Peacock',   38, 30000, 18 * H,  40, 95, 2, 3),
];

/** 动物产出物的卖价（data/index.ts 生成 ItemDef 用） */
export const ANIMAL_GOOD_PRICES: Record<string, { zh: string; en: string; sell: number }> = {
  good_chicken: { zh: '鸡蛋',   en: 'Egg',          sell: 12 },
  good_duck:    { zh: '鸭蛋',   en: 'Duck Egg',     sell: 22 },
  good_rabbit:  { zh: '兔毛',   en: 'Angora Wool',  sell: 38 },
  good_goat:    { zh: '羊奶',   en: 'Goat Milk',    sell: 65 },
  good_pig:     { zh: '松露',   en: 'Truffle',      sell: 95 },
  good_sheep:   { zh: '羊毛',   en: 'Fleece',       sell: 130 },
  good_cow:     { zh: '牛奶',   en: 'Milk',         sell: 175 },
  good_turkey:  { zh: '火鸡羽', en: 'Turkey Plume', sell: 240 },
  good_alpaca:  { zh: '驼绒',   en: 'Alpaca Fiber', sell: 330 },
  good_peacock: { zh: '孔雀翎', en: 'Peacock Feather', sell: 520 },
};
