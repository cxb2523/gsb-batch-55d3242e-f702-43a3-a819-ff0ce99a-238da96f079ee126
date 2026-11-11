/**
 * 鱼类图鉴：24 种，5 档稀有度。
 * minRodTier 限制：高级鱼需要更好的鱼竿才可能钓到。
 */
import type { FishDef, FishRarity } from '../core/types';

function fish(
  id: string, zh: string, en: string, rarity: FishRarity,
  sellPrice: number, xp: number, minRodTier: number,
  descZh?: string, descEn?: string,
): FishDef {
  return {
    id: `fish_${id}`,
    name: { zh, en },
    rarity, sellPrice, xp, minRodTier,
    sprite: `fish_${id}`,
    desc: descZh ? { zh: descZh, en: descEn || '' } : undefined,
  };
}

export const FISH: FishDef[] = [
  // common ×8
  fish('sardine',   '小沙丁',   'Sardine',      'common', 6,  2, 1),
  fish('anchovy',   '银凤尾',   'Anchovy',      'common', 8,  2, 1),
  fish('mackerel',  '花青鲭',   'Mackerel',     'common', 10, 3, 1),
  fish('crucian',   '白鲫',     'Crucian Carp', 'common', 12, 3, 1),
  fish('goby',      '滩虎鱼',   'Goby',         'common', 9,  2, 1),
  fish('smelt',     '冰湖胡瓜鱼', 'Smelt',      'common', 11, 3, 1),
  fish('shrimp',    '玻璃虾',   'Glass Shrimp', 'common', 7,  2, 1),
  fish('clam',      '月牙蛤',   'Moon Clam',    'common', 8,  2, 1),
  // uncommon ×6
  fish('seabream',  '红鲷',     'Sea Bream',    'uncommon', 25, 5, 1),
  fish('flounder',  '沙比目',   'Flounder',     'uncommon', 30, 6, 1),
  fish('squid',     '荧光鱿',   'Glow Squid',   'uncommon', 35, 6, 1),
  fish('pufferfish','气球鲀',   'Pufferfish',   'uncommon', 40, 7, 2),
  fish('lobster',   '青壳龙虾', 'Blue Lobster', 'uncommon', 48, 8, 2),
  fish('eel',       '海岛鳗',   'Isle Eel',     'uncommon', 42, 7, 2),
  // rare ×5
  fish('grouper',   '石斑王',   'King Grouper', 'rare', 90, 12, 2),
  fish('swordfish', '银剑鱼',   'Swordfish',    'rare', 120, 15, 2),
  fish('turtle',    '玳瑁龟',   'Hawksbill',    'rare', 150, 18, 2, '它背上的花纹像一张藏宝图。', 'Its shell looks like a treasure map.'),
  fish('rayfish',   '紫斑鳐',   'Violet Ray',   'rare', 135, 16, 3),
  fish('lionfish',  '狮子鱼',   'Lionfish',     'rare', 160, 18, 3),
  // epic ×3
  fish('marlin',    '碧海枪鱼', 'Azure Marlin', 'epic', 400, 32, 3),
  fish('sunfish',   '翻车太阳鱼', 'Ocean Sunfish', 'epic', 500, 38, 3, '慢吞吞地晒太阳，钓上来要花大力气。', 'It sunbathes lazily; reeling it in is a workout.'),
  fish('ghostfish', '幽灵灯鱼', 'Ghost Lantern', 'epic', 650, 45, 3),
  // legendary ×2
  fish('kraken',    '小海怪',   'Kraken Jr.',   'legendary', 2000, 90, 3, '传说中的深海之主……的幼体。', 'The legendary lord of the deep... as a baby.'),
  fish('goldkoi',   '鎏金锦鲤', 'Gilded Koi',   'legendary', 2600, 110, 3, '见到它的人会交好运，钓到它的人已经在走运了。', 'Seeing one brings luck. Catching one means you already have it.'),
];
