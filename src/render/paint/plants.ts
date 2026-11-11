/**
 * 作物精灵：按生长阶段绘制。画布 64×72，锚点在底部中心 (32, 64)。
 * 每种作物有 fruitStyle（根茎/浆果/高秆/藤果/地瓜果/花/叶球），
 * ready 阶段按风格画出有辨识度的果实；树木有独立的树冠+果实阶段。
 */
import { hashColor, leafShape, PAL, circle, ellipse, shade, tri, type Ctx } from './common';
import type { CropDef, CropStage } from '../../core/types';

const AX = 32; // 锚点
const AY = 64;

type FruitStyle = 'root' | 'berry' | 'stalk' | 'vine' | 'gourd' | 'flower' | 'head';

const STYLE: Record<string, FruitStyle> = {
  crop_carrot: 'root', crop_potato: 'root', crop_taro: 'root', crop_ginseng: 'root',
  crop_strawberry: 'berry', crop_chili: 'berry',
  crop_corn: 'stalk', crop_rice: 'stalk', crop_sugarcane: 'stalk',
  crop_tomato: 'vine', crop_eggplant: 'vine',
  crop_pumpkin: 'gourd', crop_melon: 'gourd', crop_pineapple: 'gourd',
  crop_orchid: 'flower', crop_starfruit: 'flower',
  crop_cabbage: 'head', crop_cacao: 'vine',
};

const FRUIT_COLOR: Record<string, string> = {
  crop_carrot: '#f08030', crop_potato: '#c9a06a', crop_strawberry: '#e8425c',
  crop_corn: '#f2d049', crop_tomato: '#e85d4a', crop_cabbage: '#9fd66c',
  crop_pineapple: '#f0b23c', crop_eggplant: '#7a4a9c', crop_pumpkin: '#ec8b32',
  crop_chili: '#d8382e', crop_melon: '#4c9c48', crop_rice: '#e8dca0',
  crop_taro: '#b08bc0', crop_orchid: '#b465d8', crop_sugarcane: '#a8cc60',
  crop_cacao: '#a05c34', crop_ginseng: '#e0c48c', crop_starfruit: '#f2e04c',
  crop_banana: '#f2d049', crop_coconut: '#9c7048', crop_apple: '#e0473c',
  crop_lemon: '#f2dc3c', crop_mango: '#f2a03c', crop_lychee: '#e0506c',
  crop_peach: '#f2a0b4', crop_goldfruit: '#f2c018',
};

function fruitColor(def: CropDef): string {
  return FRUIT_COLOR[def.id] || hashColor(def.id);
}

/** 通用幼苗 */
function sprout(ctx: Ctx): void {
  ctx.strokeStyle = PAL.leafDark;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(AX, AY - 2);
  ctx.quadraticCurveTo(AX + 1, AY - 8, AX, AY - 12);
  ctx.stroke();
  leafShape(ctx, AX, AY - 10, 9, 3.4, -0.7, PAL.leaf);
  leafShape(ctx, AX, AY - 10, 9, 3.4, 0.7, shade(PAL.leaf, -0.12));
}

/** 中期叶丛，size 0.7~1 */
function bush(ctx: Ctx, size: number, color: string = PAL.leaf): void {
  const r = 11 * size;
  circle(ctx, AX - r * 0.7, AY - r * 0.8, r * 0.72, shade(color, -0.14));
  circle(ctx, AX + r * 0.7, AY - r * 0.8, r * 0.72, shade(color, -0.08));
  circle(ctx, AX, AY - r * 1.15, r * 0.85, color);
  leafShape(ctx, AX, AY - 4, 10 * size, 3.6, -1.1, shade(color, -0.2));
  leafShape(ctx, AX, AY - 4, 10 * size, 3.6, 1.1, shade(color, -0.2));
}

function paintFieldReady(ctx: Ctx, def: CropDef): void {
  const fc = fruitColor(def);
  const style = STYLE[def.id] || 'berry';
  switch (style) {
    case 'root': {
      // 露出土面的根 + 大缨子
      bush(ctx, 0.9, PAL.leaf);
      tri(ctx, AX - 5, AY - 4, AX + 5, AY - 4, AX, AY + 4, fc, shade(fc, -0.25));
      break;
    }
    case 'berry': {
      bush(ctx, 0.95);
      circle(ctx, AX - 8, AY - 10, 3.6, fc, shade(fc, -0.3));
      circle(ctx, AX + 7, AY - 13, 3.6, fc, shade(fc, -0.3));
      circle(ctx, AX - 1, AY - 19, 3.6, fc, shade(fc, -0.3));
      break;
    }
    case 'stalk': {
      // 高秆作物
      ctx.strokeStyle = shade(PAL.leaf, -0.25);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(AX, AY);
      ctx.lineTo(AX, AY - 34);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        leafShape(ctx, AX, AY - 8 - i * 9, 14, 3.6, -1.25 - i * 0.06, PAL.leaf);
        leafShape(ctx, AX, AY - 11 - i * 9, 14, 3.6, 1.25 + i * 0.06, shade(PAL.leaf, -0.12));
      }
      ellipse(ctx, AX + 1, AY - 36, 4.6, 8.5, fc, shade(fc, -0.28));
      break;
    }
    case 'vine': {
      // 支架藤 + 挂果
      ctx.strokeStyle = PAL.woodDark;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(AX - 8, AY);
      ctx.lineTo(AX - 4, AY - 30);
      ctx.moveTo(AX + 8, AY);
      ctx.lineTo(AX + 4, AY - 30);
      ctx.stroke();
      bush(ctx, 1, PAL.leaf);
      circle(ctx, AX + 2, AY - 24, 4.6, PAL.leaf);
      ellipse(ctx, AX - 7, AY - 15, 4.4, 5.2, fc, shade(fc, -0.3));
      ellipse(ctx, AX + 7, AY - 19, 4.4, 5.2, fc, shade(fc, -0.3));
      break;
    }
    case 'gourd': {
      // 地面大果
      bush(ctx, 0.75, shade(PAL.leaf, -0.05));
      ellipse(ctx, AX + 6, AY - 5, 9.5, 7.5, fc, shade(fc, -0.28));
      ellipse(ctx, AX + 2.5, AY - 5, 3, 7, 'rgba(255,255,255,0.18)');
      ctx.strokeStyle = shade(fc, -0.35);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(AX + 6, AY - 12.5);
      ctx.quadraticCurveTo(AX + 9, AY - 15.5, AX + 12, AY - 14);
      ctx.stroke();
      break;
    }
    case 'flower': {
      ctx.strokeStyle = shade(PAL.leaf, -0.2);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(AX, AY);
      ctx.quadraticCurveTo(AX + 2, AY - 16, AX, AY - 26);
      ctx.stroke();
      leafShape(ctx, AX, AY - 6, 11, 3.4, -1.1, PAL.leaf);
      leafShape(ctx, AX, AY - 9, 11, 3.4, 1.1, PAL.leaf);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ellipse(ctx, AX + Math.cos(a) * 5.5, AY - 26 + Math.sin(a) * 5.5, 3.6, 3.6, fc);
      }
      circle(ctx, AX, AY - 26, 3.2, '#f2e04c', shade('#f2e04c', -0.3));
      break;
    }
    case 'head': {
      // 大叶球
      circle(ctx, AX, AY - 9, 10.5, fc, shade(fc, -0.25));
      leafShape(ctx, AX - 9, AY - 4, 13, 5, -0.9, shade(fc, -0.15));
      leafShape(ctx, AX + 9, AY - 4, 13, 5, 0.9, shade(fc, -0.15));
      ctx.strokeStyle = shade(fc, -0.3);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(AX - 4, AY - 14);
      ctx.quadraticCurveTo(AX, AY - 10, AX - 2, AY - 4);
      ctx.stroke();
      break;
    }
  }
}

/** 树冠 */
function crown(ctx: Ctx, cy: number, r: number, color: string): void {
  circle(ctx, AX - r * 0.75, cy + r * 0.3, r * 0.72, shade(color, -0.12));
  circle(ctx, AX + r * 0.75, cy + r * 0.3, r * 0.72, shade(color, -0.06));
  circle(ctx, AX, cy - r * 0.25, r * 0.9, color);
  circle(ctx, AX - r * 0.3, cy - r * 0.35, r * 0.32, shade(color, 0.15));
}

function paintTree(ctx: Ctx, def: CropDef, stage: CropStage): void {
  const fc = fruitColor(def);
  const isPalm = def.id === 'crop_coconut' || def.id === 'crop_banana';
  if (stage === 'seedling') {
    sprout(ctx);
    return;
  }
  if (stage === 'growing') {
    ctx.strokeStyle = PAL.woodDark;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(AX, AY);
    ctx.lineTo(AX, AY - 14);
    ctx.stroke();
    crown(ctx, AY - 22, 8, PAL.leaf);
    return;
  }
  // mature / ready：完整树
  ctx.strokeStyle = def.id === 'crop_peach' ? '#8a5a48' : PAL.wood;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(AX, AY);
  if (isPalm) {
    ctx.quadraticCurveTo(AX + 5, AY - 16, AX + 8, AY - 30);
  } else {
    ctx.lineTo(AX, AY - 24);
  }
  ctx.stroke();
  if (isPalm) {
    // 棕榈叶
    const top = { x: AX + 8, y: AY - 30 };
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.5;
      leafShape(ctx, top.x, top.y, 17, 4.6, a + Math.PI, i % 2 ? PAL.leaf : shade(PAL.leaf, -0.12));
    }
    if (stage === 'ready') {
      circle(ctx, top.x - 4, top.y + 3, 3.6, fc, shade(fc, -0.3));
      circle(ctx, top.x + 3, top.y + 4.5, 3.6, fc, shade(fc, -0.3));
    }
  } else {
    crown(ctx, AY - 34, 12, def.id === 'crop_peach' ? '#a8d888' : PAL.leaf);
    if (stage === 'ready') {
      circle(ctx, AX - 8, AY - 32, 3.4, fc, shade(fc, -0.3));
      circle(ctx, AX + 8, AY - 36, 3.4, fc, shade(fc, -0.3));
      circle(ctx, AX + 1, AY - 27, 3.4, fc, shade(fc, -0.3));
    }
  }
}

/** 枯萎状态 */
function withered(ctx: Ctx): void {
  ctx.strokeStyle = '#9a7d58';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(AX, AY);
  ctx.quadraticCurveTo(AX + 2, AY - 10, AX + 6, AY - 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(AX, AY - 6);
  ctx.quadraticCurveTo(AX - 4, AY - 10, AX - 7, AY - 11);
  ctx.stroke();
  leafShape(ctx, AX + 6, AY - 13, 7, 2.6, 0.9, '#b09a6e');
  leafShape(ctx, AX - 7, AY - 10, 6, 2.4, -1.6, '#b09a6e');
}

export function paintCrop(ctx: Ctx, def: CropDef, stage: CropStage): void {
  if (def.isTree) {
    paintTree(ctx, def, stage);
    return;
  }
  switch (stage) {
    case 'seedling':
      sprout(ctx);
      break;
    case 'growing':
      bush(ctx, 0.72);
      break;
    case 'mature':
      bush(ctx, 0.95);
      break;
    case 'ready':
      paintFieldReady(ctx, def);
      break;
    case 'withered':
      withered(ctx);
      break;
  }
}
