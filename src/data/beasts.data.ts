/**
 * 野兽表：8 种入侵者，从野猪到传说岛龙。
 * rare 野兽出现率低但奖励丰厚，掉落材料可出售或用于成就。
 */
import type { BeastDef } from '../core/types';

function beast(
  id: string, zh: string, en: string, minLevel: number, hp: number, atk: number,
  coinMin: number, coinMax: number, xp: number, rare: boolean,
  dropId?: string, dropChance?: number,
): BeastDef {
  return {
    id: `beast_${id}`,
    name: { zh, en },
    minLevel, hp, atk, coinMin, coinMax, xp, rare, dropId, dropChance,
    sprite: `beast_${id}`,
  };
}

export const BEASTS: BeastDef[] = [
  //     id        中文       英文            级 HP atk  金币        XP  稀有  掉落
  beast('boar',    '灌木野猪', 'Bush Boar',     1, 2, 1,  15,  30,   6, false, 'item_bone', 0.25),
  beast('monkey',  '捣蛋猴',   'Mischief Monkey', 3, 2, 2, 25, 45,   8, false),
  beast('snake',   '花斑蟒',   'Dappled Python', 6, 3, 2,  40,  70,  12, false, 'item_scale', 0.3),
  beast('wolf',    '海风狼',   'Seawind Wolf', 10, 4, 3,  65, 110,  18, false, 'item_fang', 0.3),
  beast('croc',    '滩涂鳄',   'Mudflat Croc', 15, 5, 3, 100, 170,  26, false, 'item_scale', 0.45),
  beast('bear',    '岛熊',     'Isle Bear',    21, 6, 4, 160, 260,  38, false, 'item_fur', 0.4),
  beast('golem',   '珊瑚巨像', 'Coral Golem',  28, 8, 3, 300, 500,  60, true,  'item_coralcore', 0.8),
  beast('dragon',  '雾中岛龙', 'Mist Isle Dragon', 36, 10, 5, 800, 1400, 120, true, 'item_dragonscale', 1),
];
