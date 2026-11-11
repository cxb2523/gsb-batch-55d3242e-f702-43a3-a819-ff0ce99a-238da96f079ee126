/**
 * 物品图标（32×32）与鱼类侧视图（48×32）：
 * 背包/商店/图鉴用。全部按 id 程序化绘制。
 */
import type { FishDef, ItemDef } from '../../core/types';
import { REG } from '../../core/registry';
import { circle, ellipse, hashColor, leafShape, PAL, rrect, shade, star, tri, type Ctx } from './common';

const C = 16; // 图标中心

/** 作物果实颜色（与 plants.ts 一致的映射，图标独立保存避免互相依赖阶段） */
const FRUIT_COLOR: Record<string, string> = {
  produce_carrot: '#f08030', produce_potato: '#c9a06a', produce_strawberry: '#e8425c',
  produce_corn: '#f2d049', produce_tomato: '#e85d4a', produce_cabbage: '#9fd66c',
  produce_pineapple: '#f0b23c', produce_eggplant: '#7a4a9c', produce_pumpkin: '#ec8b32',
  produce_chili: '#d8382e', produce_melon: '#4c9c48', produce_rice: '#e8dca0',
  produce_taro: '#b08bc0', produce_orchid: '#b465d8', produce_sugarcane: '#a8cc60',
  produce_cacao: '#a05c34', produce_ginseng: '#e0c48c', produce_starfruit: '#f2e04c',
  produce_banana: '#f2d049', produce_coconut: '#9c7048', produce_apple: '#e0473c',
  produce_lemon: '#f2dc3c', produce_mango: '#f2a03c', produce_lychee: '#e0506c',
  produce_peach: '#f2a0b4', produce_goldfruit: '#f2c018',
};

const RARITY_COLOR: Record<string, string> = {
  common: '#9db4c0',
  uncommon: '#6cbf6c',
  rare: '#5a9ae0',
  epic: '#a86ad8',
  legendary: '#f0a03c',
};

export function paintFishSide(ctx: Ctx, def: FishDef): void {
  // 48×32 画布，鱼头朝右
  const cx = 24;
  const cy = 16;
  const base = RARITY_COLOR[def.rarity] || '#9db4c0';
  const body = shade(hashColor(def.id, 55, 60), 0);
  const main = def.rarity === 'common' ? body : base;
  const isLong = def.id.includes('eel') || def.id.includes('sword');
  const rx = isLong ? 17 : 13;
  const ry = def.id.includes('sunfish') || def.id.includes('puffer') ? 10 : 7;
  // 尾
  tri(ctx, cx - rx + 2, cy, cx - rx - 6, cy - 6, cx - rx - 6, cy + 6, shade(main, -0.15), shade(main, -0.35));
  // 身
  ellipse(ctx, cx, cy, rx, ry, main, shade(main, -0.35));
  // 肚
  ellipse(ctx, cx + 2, cy + ry * 0.35, rx * 0.6, ry * 0.45, shade(main, 0.3));
  // 背鳍
  tri(ctx, cx - 4, cy - ry + 1, cx + 5, cy - ry + 1, cx + 1, cy - ry - 5, shade(main, -0.2));
  // 眼
  circle(ctx, cx + rx * 0.55, cy - 1.5, 2, '#ffffff');
  circle(ctx, cx + rx * 0.55 + 0.5, cy - 1.5, 1.1, '#33281f');
  // 特征点缀
  if (def.id === 'fish_lionfish') {
    for (let i = -2; i <= 2; i++) {
      tri(ctx, cx + i * 3 - 1.4, cy - ry, cx + i * 3 + 1.4, cy - ry, cx + i * 3, cy - ry - 7, shade(main, -0.1));
    }
  }
  if (def.id === 'fish_kraken') {
    // 触手
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = shade(main, -0.1);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - rx + 4 + i * 3, cy + ry - 2);
      ctx.quadraticCurveTo(cx - rx + i * 3, cy + ry + 6, cx - rx + 5 + i * 3, cy + ry + 5);
      ctx.stroke();
    }
  }
  if (def.rarity === 'legendary') {
    star(ctx, cx + 2, cy - ry - 4, 3.4, '#ffe97a');
  }
  if (def.id === 'fish_goldkoi') {
    circle(ctx, cx - 3, cy - 2, 2.4, '#e8425c');
    circle(ctx, cx + 5, cy + 1, 1.8, '#33281f');
  }
}

/** 32×32 物品图标 */
export function paintItemIcon(ctx: Ctx, itemId: string): void {
  const def: ItemDef | undefined = REG.items.get(itemId);
  const category = def?.category ?? 'special';

  if (category === 'seed') {
    // 种子袋
    const cropColor = FRUIT_COLOR[itemId.replace('seed_', 'produce_')] || hashColor(itemId);
    rrect(ctx, 6, 7, 20, 20, 3, '#f0e2c4', shade('#f0e2c4', -0.3));
    tri(ctx, 6, 10, 26, 10, 16, 4, '#e0c898', shade('#e0c898', -0.25));
    circle(ctx, C, 19, 5.5, cropColor, shade(cropColor, -0.3));
    leafShape(ctx, C + 3, 14, 5, 2, 0.7, PAL.leaf);
    return;
  }
  if (category === 'produce') {
    const color = FRUIT_COLOR[itemId] || hashColor(itemId);
    switch (itemId) {
      case 'produce_carrot':
        tri(ctx, 10, 10, 22, 10, 16, 28, color, shade(color, -0.25));
        leafShape(ctx, 14, 10, 7, 2.6, -0.5, PAL.leaf);
        leafShape(ctx, 18, 10, 7, 2.6, 0.5, PAL.leaf);
        break;
      case 'produce_corn':
        ellipse(ctx, C, 17, 6, 11, color, shade(color, -0.3));
        ctx.strokeStyle = shade(color, -0.25);
        ctx.lineWidth = 1;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(C + i * 3, 8);
          ctx.lineTo(C + i * 3, 26);
          ctx.stroke();
        }
        leafShape(ctx, C - 5, 24, 12, 3.4, -0.5, PAL.leaf);
        leafShape(ctx, C + 5, 24, 12, 3.4, 0.5, shade(PAL.leaf, -0.12));
        break;
      case 'produce_banana':
        ctx.strokeStyle = color;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(C, 12, 9, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        ctx.strokeStyle = shade(color, -0.35);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(C, 12, 9, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        break;
      case 'produce_strawberry':
        tri(ctx, 9, 14, 23, 14, 16, 27, color, shade(color, -0.25));
        circle(ctx, 12.5, 16.5, 0.8, '#fff4b8');
        circle(ctx, 19, 17.5, 0.8, '#fff4b8');
        circle(ctx, 16, 21, 0.8, '#fff4b8');
        leafShape(ctx, 13, 12, 6, 2.2, -0.9, PAL.leaf);
        leafShape(ctx, 19, 12, 6, 2.2, 0.9, PAL.leaf);
        break;
      default:
        // 通用圆果
        circle(ctx, C, 18, 9, color, shade(color, -0.3));
        ellipse(ctx, C - 3, 14.5, 2.6, 1.8, 'rgba(255,255,255,0.35)');
        ctx.strokeStyle = shade(color, -0.4);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(C, 9.5);
        ctx.quadraticCurveTo(C + 2, 7, C + 4, 6.5);
        ctx.stroke();
        leafShape(ctx, C + 3, 8.5, 5.5, 2, 1.0, PAL.leaf);
    }
    return;
  }
  if (category === 'animalGood') {
    switch (itemId) {
      case 'good_chicken':
      case 'good_duck':
        ellipse(ctx, C, 17, 7.5, 9.5, itemId === 'good_duck' ? '#e8f2e0' : '#f7ecd4', shade('#e0d0a8', -0.1));
        ellipse(ctx, C - 2.4, 13.5, 2.2, 3, 'rgba(255,255,255,0.6)');
        break;
      case 'good_goat':
      case 'good_cow':
        // 奶瓶
        rrect(ctx, 10, 10, 12, 17, 3, '#eef6fa', shade('#c8dce8', -0.1));
        rrect(ctx, 12.5, 6, 7, 5, 1.5, '#c8dce8', shade('#c8dce8', -0.25));
        rrect(ctx, 11, 16, 10, 9, 2, '#ffffff');
        break;
      case 'good_rabbit':
      case 'good_sheep':
      case 'good_alpaca': {
        // 毛线团
        const c = itemId === 'good_rabbit' ? '#efe6f5' : itemId === 'good_alpaca' ? '#f2e6d0' : '#f6f3ea';
        circle(ctx, C, 17, 9.5, c, shade(c, -0.25));
        ctx.strokeStyle = shade(c, -0.2);
        ctx.lineWidth = 1.2;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(C, 17, 9.5, (0.2 + i * 0.28) * Math.PI, (0.8 + i * 0.28) * Math.PI);
          ctx.stroke();
        }
        break;
      }
      case 'good_pig':
        // 松露
        circle(ctx, C, 18, 8.5, '#6a5240', shade('#6a5240', -0.3));
        circle(ctx, C - 3, 15, 1.4, '#8a705a');
        circle(ctx, C + 3.4, 19, 1.4, '#8a705a');
        circle(ctx, C - 1, 21, 1.4, '#8a705a');
        break;
      default: {
        // 羽毛
        const fc = itemId === 'good_peacock' ? '#2d9e6c' : '#b5743c';
        leafShape(ctx, C, 27, 20, 6, 0.25, fc);
        ctx.strokeStyle = shade(fc, -0.3);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(C, 27);
        ctx.lineTo(C + 4.5, 9);
        ctx.stroke();
        if (itemId === 'good_peacock') circle(ctx, C + 4, 11, 2.6, '#f2c018');
      }
    }
    return;
  }
  if (category === 'fish') {
    const fish = REG.fish.get(itemId);
    if (fish) {
      ctx.save();
      ctx.translate(-8, 0);
      paintFishSide(ctx, fish);
      ctx.restore();
    }
    return;
  }
  if (category === 'material') {
    switch (itemId) {
      case 'item_bone':
        ctx.strokeStyle = '#f2ead6';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(10, 22);
        ctx.lineTo(22, 10);
        ctx.stroke();
        for (const [x, y] of [[9, 21], [11, 23], [21, 9], [23, 11]] as const) {
          circle(ctx, x, y, 3, '#f2ead6', shade('#f2ead6', -0.25));
        }
        break;
      case 'item_scale':
      case 'item_dragonscale': {
        const c = itemId === 'item_dragonscale' ? '#7a68b8' : '#6c9c48';
        ctx.beginPath();
        ctx.moveTo(16, 6);
        ctx.quadraticCurveTo(26, 12, 16, 27);
        ctx.quadraticCurveTo(6, 12, 16, 6);
        ctx.closePath();
        ctx.fillStyle = c;
        ctx.fill();
        ctx.strokeStyle = shade(c, -0.3);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ellipse(ctx, 13.5, 13, 2, 3.4, 'rgba(255,255,255,0.3)');
        break;
      }
      case 'item_fang':
        tri(ctx, 11, 8, 21, 8, 16, 27, '#f6f0e0', shade('#f6f0e0', -0.25));
        rrect(ctx, 10, 5, 12, 4.5, 2, '#c9b48a', shade('#c9b48a', -0.25));
        break;
      case 'item_fur':
        rrect(ctx, 7, 10, 18, 15, 4, '#8a6248', shade('#8a6248', -0.3));
        ctx.strokeStyle = '#a8876c';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(9 + i * 4.5, 12);
          ctx.quadraticCurveTo(10 + i * 4.5, 17, 9 + i * 4.5, 23);
          ctx.stroke();
        }
        break;
      default: // coralcore
        circle(ctx, C, 17, 8, '#e88a9a', shade('#e88a9a', -0.3));
        star(ctx, C, 17, 4.5, '#fde4e0');
    }
    return;
  }
  // special / 兜底
  switch (itemId) {
    case 'item_shell':
      ctx.beginPath();
      ctx.moveTo(8, 22);
      ctx.quadraticCurveTo(16, 2, 24, 22);
      ctx.quadraticCurveTo(16, 28, 8, 22);
      ctx.closePath();
      ctx.fillStyle = '#f5c7d5';
      ctx.fill();
      ctx.strokeStyle = shade('#f5c7d5', -0.3);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      for (const dx of [-4, 0, 4]) {
        ctx.beginPath();
        ctx.moveTo(16 + dx, 22 - Math.abs(dx) * 0.4);
        ctx.lineTo(16 + dx * 0.5, 10);
        ctx.strokeStyle = shade('#f5c7d5', -0.2);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      break;
    case 'item_pearl':
      circle(ctx, C, 17, 8, '#f2eef8', shade('#c8c0d8', -0.05));
      ellipse(ctx, 13, 13.5, 2.6, 1.8, '#ffffff');
      circle(ctx, C, 17, 8.5 + 2, 'rgba(200,190,230,0.0)');
      break;
    case 'item_amber':
      ctx.beginPath();
      ctx.moveTo(16, 5);
      ctx.lineTo(25, 13);
      ctx.lineTo(22, 26);
      ctx.lineTo(10, 26);
      ctx.lineTo(7, 13);
      ctx.closePath();
      ctx.fillStyle = '#f0a03c';
      ctx.fill();
      ctx.strokeStyle = shade('#f0a03c', -0.3);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      circle(ctx, 15, 17, 2, 'rgba(120,70,20,0.5)');
      break;
    default:
      circle(ctx, C, C, 9, hashColor(itemId), shade(hashColor(itemId), -0.3));
      star(ctx, C, C, 4, '#fff4b8');
  }
}
