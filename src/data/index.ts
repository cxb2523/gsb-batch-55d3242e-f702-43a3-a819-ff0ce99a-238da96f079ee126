/**
 * 内容装配入口：把所有数据表注册进 core/registry，
 * 并从作物/动物/鱼自动生成对应的物品（种子/产出/鱼获）定义。
 * 任何运行入口（游戏 main、测试）都必须先 import 本模块。
 */
import type { ItemDef } from '../core/types';
import { registerContent } from '../core/registry';
import { registerFootprint } from '../core/island';
import { registerPetSkill } from '../core/player';
import { CROPS } from './crops.data';
import { ANIMALS, ANIMAL_GOOD_PRICES } from './animals.data';
import { BEASTS } from './beasts.data';
import { FISH } from './fish.data';
import { BUILDINGS, isWalkableCategory } from './buildings.data';
import { CLOTHING } from './clothing.data';
import { PETS } from './pets.data';
import { NEIGHBORS } from './neighbors.data';
import { ACHIEVEMENTS, DAILY_QUESTS, TUTORIAL_QUESTS } from './quests.data';

export { CROPS, ANIMALS, BEASTS, FISH, BUILDINGS, CLOTHING, PETS, NEIGHBORS };
export { TUTORIAL_QUESTS, DAILY_QUESTS, ACHIEVEMENTS };

/** 手写材料/特殊物品 */
const MATERIALS: ItemDef[] = [
  { id: 'item_bone', name: { zh: '兽骨', en: 'Beast Bone' }, category: 'material', sell: 20 },
  { id: 'item_scale', name: { zh: '鳞片', en: 'Scale' }, category: 'material', sell: 35 },
  { id: 'item_fang', name: { zh: '狼牙', en: 'Wolf Fang' }, category: 'material', sell: 60 },
  { id: 'item_fur', name: { zh: '厚实毛皮', en: 'Thick Fur' }, category: 'material', sell: 120 },
  { id: 'item_coralcore', name: { zh: '珊瑚芯', en: 'Coral Core' }, category: 'material', sell: 500 },
  { id: 'item_dragonscale', name: { zh: '龙鳞', en: 'Dragon Scale' }, category: 'material', sell: 1500 },
  { id: 'item_shell', name: { zh: '花纹贝壳', en: 'Patterned Shell' }, category: 'special', sell: 40 },
  { id: 'item_pearl', name: { zh: '海珠', en: 'Sea Pearl' }, category: 'special', sell: 150 },
  { id: 'item_amber', name: { zh: '岛琥珀', en: 'Isle Amber' }, category: 'special', sell: 220 },
];

function buildItems(): ItemDef[] {
  const items: ItemDef[] = [...MATERIALS];
  for (const c of CROPS) {
    items.push({
      id: c.seedId,
      name: { zh: `${c.name.zh}种子`, en: `${c.name.en} Seed` },
      category: 'seed',
      sell: Math.max(1, Math.floor(c.seedPrice / 2)),
    });
    items.push({
      id: c.produceId,
      name: c.name,
      category: 'produce',
      sell: c.sellPrice,
    });
  }
  for (const a of ANIMALS) {
    const good = ANIMAL_GOOD_PRICES[a.produceId];
    if (!good) throw new Error(`missing good price for ${a.produceId}`);
    items.push({
      id: a.produceId,
      name: { zh: good.zh, en: good.en },
      category: 'animalGood',
      sell: good.sell,
    });
  }
  for (const f of FISH) {
    items.push({ id: f.id, name: f.name, category: 'fish', sell: f.sellPrice });
  }
  return items;
}

let registered = false;

export function registerAllContent(): void {
  if (registered) return;
  registered = true;
  registerContent({
    items: buildItems(),
    crops: CROPS,
    animals: ANIMALS,
    beasts: BEASTS,
    fish: FISH,
    buildings: BUILDINGS,
    clothing: CLOTHING,
    pets: PETS,
    quests: [...TUTORIAL_QUESTS, ...DAILY_QUESTS],
    achievements: ACHIEVEMENTS,
    neighbors: NEIGHBORS,
  });
  for (const b of BUILDINGS) {
    registerFootprint(b.id, b.w, b.h, isWalkableCategory(b.category));
  }
  for (const p of PETS) {
    registerPetSkill(p.id, p.skill);
  }
}

// import 即注册
registerAllContent();
