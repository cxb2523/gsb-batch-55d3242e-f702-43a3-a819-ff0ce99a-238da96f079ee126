/**
 * 建筑装饰表：42 项 —— 小屋、装饰、自然造景、道路、功能建筑。
 * beauty 驱动岛屿美观度（收获经验加成），price/unlockLevel 控制进度。
 */
import type { BuildingDef, BuildCategory } from '../core/types';

function bld(
  id: string, zh: string, en: string, category: BuildCategory,
  price: number, unlockLevel: number, w: number, h: number,
  beauty: number, xp: number,
): BuildingDef {
  return {
    id: `bld_${id}`,
    name: { zh, en },
    category, price, unlockLevel, w, h, beauty, xp,
    sprite: `bld_${id}`,
  };
}

export const BUILDINGS: BuildingDef[] = [
  // ---- 小屋 house
  bld('hut',        '茅草小屋',   'Thatch Hut',      'house', 300,   1, 2, 2, 30, 10),
  bld('cabin',      '原木小屋',   'Log Cabin',       'house', 1200,  5, 2, 2, 55, 20),
  bld('beachhouse', '海景小筑',   'Beach House',     'house', 4000, 10, 3, 2, 95, 40),
  bld('villa',      '棕榈别墅',   'Palm Villa',      'house', 12000, 18, 3, 3, 160, 80),
  bld('lighthouse', '小灯塔',     'Lighthouse',      'house', 20000, 24, 2, 2, 220, 120),
  bld('castle',     '珊瑚城堡',   'Coral Castle',    'house', 60000, 34, 4, 3, 400, 250),
  // ---- 装饰 decor
  bld('fence',      '木栅栏',     'Wood Fence',      'decor', 40,   1, 1, 1, 4, 1),
  bld('flowerbed',  '花坛',       'Flower Bed',      'decor', 90,   2, 1, 1, 12, 3),
  bld('bench',      '长椅',       'Bench',           'decor', 150,  3, 1, 1, 14, 4),
  bld('streetlamp', '南瓜路灯',   'Gourd Lamp',      'decor', 220,  4, 1, 1, 18, 5),
  bld('well',       '许愿井',     'Wishing Well',    'decor', 500,  6, 1, 1, 35, 10),
  bld('fountain',   '海豚喷泉',   'Dolphin Fountain','decor', 1500, 9, 2, 2, 70, 25),
  bld('swing',      '椰绳秋千',   'Palm Swing',      'decor', 800,  7, 1, 1, 40, 12),
  bld('parasol',    '沙滩伞',     'Beach Parasol',   'decor', 350,  4, 1, 1, 22, 6),
  bld('sandcastle', '沙堡',       'Sand Castle',     'decor', 600,  8, 1, 1, 30, 10),
  bld('statue',     '海神石像',   'Sea God Statue',  'decor', 5000, 15, 1, 2, 110, 45),
  bld('archway',    '花藤拱门',   'Vine Archway',    'decor', 2500, 12, 2, 1, 80, 30),
  bld('windmill',   '小风车',     'Windmill',        'decor', 3500, 14, 2, 2, 90, 35),
  bld('teleshell',  '传声海螺',   'Echo Conch',      'decor', 8000, 20, 1, 1, 130, 55),
  bld('bonfire',    '篝火堆',     'Bonfire',         'decor', 1000, 10, 1, 1, 48, 15),
  bld('totem',      '图腾柱',     'Tiki Totem',      'decor', 4200, 16, 1, 1, 100, 40),
  bld('icecream',   '雪糕车',     'Ice Cream Cart',  'decor', 6500, 19, 2, 1, 120, 50),
  bld('hotspring',  '露天温泉',   'Hot Spring',      'decor', 15000, 26, 2, 2, 210, 100),
  bld('ferris',     '迷你摩天轮', 'Mini Ferris Wheel', 'decor', 40000, 32, 3, 3, 350, 200),
  // ---- 自然 nature
  bld('palm',       '观赏椰树',   'Palm Tree',       'nature', 120, 1, 1, 1, 10, 2),
  bld('bush',       '绣球灌木',   'Hydrangea Bush',  'nature', 60,  1, 1, 1, 6, 1),
  bld('rock',       '苔石',       'Mossy Rock',      'nature', 30,  1, 1, 1, 3, 1),
  bld('pond',       '睡莲池',     'Lily Pond',       'nature', 900, 6, 2, 2, 46, 14),
  bld('cherry',     '樱花树',     'Cherry Blossom',  'nature', 2200, 11, 1, 1, 75, 28),
  bld('bamboo',     '竹丛',       'Bamboo Grove',    'nature', 480, 5, 1, 1, 26, 8),
  bld('coral',      '珊瑚摆件',   'Coral Piece',     'nature', 1600, 13, 1, 1, 60, 20),
  bld('banyan',     '古榕树',     'Old Banyan',      'nature', 7000, 22, 2, 2, 140, 60),
  // ---- 道路 path（可通行）
  bld('path_sand',  '贝壳小径',   'Shell Path',      'path', 15, 1, 1, 1, 2, 1),
  bld('path_stone', '石板路',     'Stone Path',      'path', 25, 3, 1, 1, 3, 1),
  bld('path_wood',  '栈道',       'Boardwalk',       'path', 35, 5, 1, 1, 4, 1),
  bld('path_brick', '红砖路',     'Brick Path',      'path', 45, 8, 1, 1, 5, 1),
  // ---- 功能 functional
  bld('storage',    '储物仓',     'Storehouse',      'functional', 2000, 7, 2, 2, 25, 20),
  bld('scarecrow',  '稻草人',     'Scarecrow',       'functional', 700, 6, 1, 1, 15, 8),
  bld('doghouse',   '宠物小窝',   'Pet House',       'functional', 1200, 8, 1, 1, 30, 12),
  bld('pier',       '钓鱼木台',   'Fishing Pier',    'functional', 1800, 9, 2, 1, 40, 16),
  bld('market',     '海产市集',   'Fish Market',     'functional', 9000, 21, 3, 2, 150, 70),
  bld('workshop',   '木工坊',     'Workshop',        'functional', 5500, 17, 2, 2, 85, 38),
];

/** 可通行的类别（供 island.registerFootprint 使用） */
export function isWalkableCategory(category: BuildCategory): boolean {
  return category === 'path';
}
