/**
 * 服装表：44 项 —— 肤色/发型/表情/上装/下装/帽子/配饰。
 * paint 字段是纸娃娃 painter 的绘制参数（主色/副色/样式名）。
 */
import type { ClothingDef, ClothingSlot } from '../core/types';

function cl(
  id: string, zh: string, en: string, slot: ClothingSlot,
  price: number, unlockLevel: number, paint: Record<string, string>,
): ClothingDef {
  return { id: `cl_${id}`, name: { zh, en }, slot, price, unlockLevel, paint };
}

export const CLOTHING: ClothingDef[] = [
  // ---- 肤色（初始全送）
  cl('skin_fair', '浅肤色', 'Fair Skin', 'skin', 0, 1, { color: '#ffe0c2' }),
  cl('skin_tan',  '小麦色', 'Tan Skin',  'skin', 0, 1, { color: '#e8b98a' }),
  cl('skin_deep', '古铜色', 'Deep Skin', 'skin', 0, 1, { color: '#b07b4f' }),
  // ---- 发型
  cl('hair_short_brown', '栗色短发', 'Brown Crop',   'hair', 0,   1, { color: '#7a4a2b', style: 'short' }),
  cl('hair_long_black',  '黑长直',   'Black Long',   'hair', 0,   1, { color: '#2c2c34', style: 'long' }),
  cl('hair_pony_gold',   '金色马尾', 'Gold Ponytail','hair', 300, 3, { color: '#e9b64c', style: 'pony' }),
  cl('hair_curly_pink',  '粉色卷发', 'Pink Curls',   'hair', 600, 6, { color: '#f08bb1', style: 'curly' }),
  cl('hair_spiky_blue',  '海盐蓝刺头', 'Blue Spikes', 'hair', 800, 9, { color: '#4d8fd1', style: 'spiky' }),
  cl('hair_bun_teal',    '青玉丸子头', 'Teal Buns',  'hair', 1200, 13, { color: '#3aa79a', style: 'buns' }),
  cl('hair_wave_silver', '银白波浪', 'Silver Waves', 'hair', 2500, 20, { color: '#cfd6e2', style: 'long' }),
  // ---- 表情
  cl('face_smile', '微笑',   'Smile', 'face', 0,   1, { style: 'smile' }),
  cl('face_wink',  '眨眼',   'Wink',  'face', 0,   1, { style: 'wink' }),
  cl('face_happy', '大笑',   'Grin',  'face', 100, 2, { style: 'happy' }),
  cl('face_cool',  '酷脸',   'Cool',  'face', 400, 5, { style: 'cool' }),
  cl('face_shy',   '害羞',   'Shy',   'face', 400, 7, { style: 'shy' }),
  cl('face_cat',   '猫猫嘴', 'Cat Mouth', 'face', 800, 12, { style: 'cat' }),
  // ---- 上装
  cl('top_tee_blue',    '天蓝T恤', 'Sky Tee',        'top', 0,    1, { color: '#5aa7e0', accent: '#ffffff', style: 'tee' }),
  cl('top_tee_coral',   '珊瑚T恤', 'Coral Tee',      'top', 120,  2, { color: '#f0776a', accent: '#ffe9c9', style: 'tee' }),
  cl('top_tang',        '喜庆唐装', 'Tang Jacket',   'top', 1500, 8, { color: '#c8342f', accent: '#e9b64c', style: 'tang' }),
  cl('top_school',      '青春校服', 'School Uniform','top', 900,  6, { color: '#3d5a80', accent: '#ffffff', style: 'school' }),
  cl('top_swim',        '星闪泳装', 'Star Swimsuit', 'top', 700,  5, { color: '#59c1b3', accent: '#fff27a', style: 'swim' }),
  cl('top_suit',        '蓝色西装', 'Blue Suit',     'top', 2600, 14, { color: '#33507c', accent: '#c9d6ea', style: 'suit' }),
  cl('top_hawaii',      '花衬衫',   'Aloha Shirt',   'top', 1100, 10, { color: '#2f9e6f', accent: '#ffd166', style: 'hawaii' }),
  cl('top_hoodie',      '奶fufu卫衣', 'Cream Hoodie','top', 1900, 12, { color: '#f2e3cf', accent: '#caa07a', style: 'hoodie' }),
  cl('top_pirate',      '海盗大衣', 'Pirate Coat',   'top', 4500, 18, { color: '#5a3550', accent: '#e9b64c', style: 'pirate' }),
  cl('top_kimono',      '樱花浴衣', 'Sakura Yukata', 'top', 3800, 16, { color: '#f5b8c9', accent: '#a24a63', style: 'kimono' }),
  cl('top_royal',       '王室礼服', 'Royal Garb',    'top', 9000, 26, { color: '#6a4fa3', accent: '#e9d24c', style: 'royal' }),
  // ---- 下装
  cl('bottom_shorts',   '米色短裤', 'Khaki Shorts',  'bottom', 0,    1, { color: '#d9c49a' }),
  cl('bottom_jeans',    '牛仔裤',   'Jeans',         'bottom', 300,  3, { color: '#4a6a94' }),
  cl('bottom_skirt',    '碎花短裙', 'Floral Skirt',  'bottom', 500,  5, { color: '#f2a2b8' }),
  cl('bottom_overalls', '背带裤',   'Overalls',      'bottom', 800,  7, { color: '#5b7f71' }),
  cl('bottom_formal',   '西装长裤', 'Slacks',        'bottom', 1600, 14, { color: '#2f3d55' }),
  cl('bottom_grass',    '草裙',     'Grass Skirt',   'bottom', 1200, 11, { color: '#7fae4a' }),
  // ---- 帽子
  cl('hat_straw',   '草帽',     'Straw Hat',    'hat', 250,  2, { color: '#e0c27e', style: 'straw' }),
  cl('hat_cap',     '棒球帽',   'Ball Cap',     'hat', 400,  4, { color: '#d1574d', style: 'cap' }),
  cl('hat_flower',  '花环',     'Flower Crown', 'hat', 900,  8, { color: '#f08bb1', style: 'flower' }),
  cl('hat_pirate',  '海盗帽',   'Pirate Hat',   'hat', 2800, 18, { color: '#3a3040', style: 'pirate' }),
  cl('hat_crown',   '小皇冠',   'Tiny Crown',   'hat', 8000, 28, { color: '#e9c94c', style: 'crown' }),
  cl('hat_shark',   '鲨鱼头套', 'Shark Hood',   'hat', 3600, 15, { color: '#7d97ad', style: 'shark' }),
  // ---- 配饰
  cl('acc_scarf',   '红围巾',   'Red Scarf',    'accessory', 350,  3, { color: '#cf4a3f', style: 'scarf' }),
  cl('acc_glasses', '圆框眼镜', 'Round Glasses','accessory', 600,  6, { color: '#4a4a55', style: 'glasses' }),
  cl('acc_shell',   '贝壳项链', 'Shell Necklace','accessory', 900, 9, { color: '#f7e6cf', style: 'necklace' }),
  cl('acc_wings',   '精灵翅膀', 'Fairy Wings',  'accessory', 5200, 22, { color: '#bfe8f5', style: 'wings' }),
  cl('acc_parrot',  '肩上鹦鹉', 'Shoulder Parrot', 'accessory', 4200, 19, { color: '#3fa14b', style: 'parrot' }),
];
