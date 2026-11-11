/**
 * 宠物表：8 只，4 种被动技能。
 */
import type { PetDef } from '../core/types';

function pet(
  id: string, zh: string, en: string, price: number, unlockLevel: number,
  skill: PetDef['skill'], skillZh: string, skillEn: string,
): PetDef {
  return {
    id: `pet_${id}`,
    name: { zh, en },
    price, unlockLevel, skill,
    skillDesc: { zh: skillZh, en: skillEn },
    sprite: `pet_${id}`,
  };
}

export const PETS: PetDef[] = [
  pet('puppy',   '椰壳小狗', 'Coco Puppy',   800,   4, 'scare_beast',
    '每 2 小时自动吓跑一只野兽', 'Scares away a beast every 2 hours'),
  pet('kitten',  '海盐猫咪', 'Salt Kitten',  800,   5, 'lucky_fish',
    '稀有鱼上钩概率 +15%', 'Rare fish bite chance +15%'),
  pet('bunny',   '甜心兔',   'Sweet Bunny',  1500,  7, 'cheer',
    '能量恢复速度 +10%', 'Energy regen +10%'),
  pet('piglet',  '寻宝小猪', 'Truffle Piglet', 2200, 9, 'find_gift',
    '每天从沙滩带回一件小礼物', 'Brings back a beach gift daily'),
  pet('parrot',  '彩虹鹦鹉', 'Rainbow Parrot', 3800, 13, 'find_gift',
    '每天从远方叼回一件小礼物', 'Fetches a faraway gift daily'),
  pet('turtle',  '慢慢龟',   'Slowpoke Turtle', 3000, 11, 'cheer',
    '能量恢复速度 +10%', 'Energy regen +10%'),
  pet('fox',     '雪白狐狸', 'Snow Fox',     6500, 17, 'scare_beast',
    '每 2 小时自动吓跑一只野兽', 'Scares away a beast every 2 hours'),
  pet('dolphin', '湾湾海豚', 'Cove Dolphin', 9000, 21, 'lucky_fish',
    '稀有鱼上钩概率 +15%', 'Rare fish bite chance +15%'),
];
