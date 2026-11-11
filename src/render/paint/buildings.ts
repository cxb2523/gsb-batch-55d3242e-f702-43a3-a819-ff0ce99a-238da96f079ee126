/**
 * 建筑装饰精灵：42 项。画布宽 (w+h)*32+16，高 96 + (w+h)*8，
 * 锚点在底部中心。房屋用共享的 isoHouse 配方，装饰各自手绘。
 */
import type { BuildingDef } from '../../core/types';
import { circle, dotEye, ellipse, hashColor, leafShape, PAL, rrect, shade, softShadow, star, tri, type Ctx } from './common';

export function buildingCanvasSize(def: BuildingDef): { w: number; h: number; ax: number; ay: number } {
  const w = (def.w + def.h) * 32 + 16;
  const h = 96 + (def.w + def.h) * 8;
  return { w, h, ax: w / 2, ay: h - 10 };
}

interface HouseOpt {
  wall: string;
  roof: string;
  door?: string;
  windows?: number;
  roofStyle?: 'thatch' | 'gable' | 'flat' | 'tower';
  chimney?: boolean;
}

/** 共享房屋配方：正面视角小屋，宽度按占地缩放 */
function house(ctx: Ctx, ax: number, ay: number, span: number, opt: HouseOpt): void {
  const w = span * 0.82;
  const wallH = span * 0.42;
  const roofH = span * 0.4;
  const x = ax - w / 2;
  const y = ay - wallH;
  softShadow(ctx, ax, ay, w * 0.58, w * 0.16);
  // 墙
  rrect(ctx, x, y, w, wallH, 4, opt.wall, shade(opt.wall, -0.3));
  // 门
  const doorW = w * 0.2;
  rrect(ctx, ax - doorW / 2, ay - wallH * 0.62, doorW, wallH * 0.62, 3, opt.door ?? PAL.woodDark, shade(opt.door ?? PAL.woodDark, -0.25));
  circle(ctx, ax + doorW * 0.28, ay - wallH * 0.3, 1.6, '#f2c018');
  // 窗
  const wins = opt.windows ?? 2;
  for (let i = 0; i < wins; i++) {
    const wx = x + (w / (wins + 1)) * (i + 1) - (i === Math.floor(wins / 2) && wins % 2 === 1 ? 0 : 0);
    const offset = wx > ax - doorW && wx < ax + doorW ? w * 0.28 : 0;
    rrect(ctx, wx - 5 + offset, y + wallH * 0.25, 10, 10, 2, '#bfe6f2', shade('#bfe6f2', -0.35));
    ctx.strokeStyle = shade('#bfe6f2', -0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx + offset, y + wallH * 0.25);
    ctx.lineTo(wx + offset, y + wallH * 0.25 + 10);
    ctx.stroke();
  }
  // 屋顶
  const style = opt.roofStyle ?? 'gable';
  if (style === 'thatch') {
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 2);
    ctx.quadraticCurveTo(ax, y - roofH * 1.5, x + w + 6, y + 2);
    ctx.closePath();
    ctx.fillStyle = opt.roof;
    ctx.fill();
    ctx.strokeStyle = shade(opt.roof, -0.3);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 茅草纹
    ctx.strokeStyle = shade(opt.roof, -0.2);
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (w / 4) * i - 4, y - 2);
      ctx.lineTo(x + (w / 4) * i + 2, y - roofH * 0.5 * (1 - Math.abs(i - 2) * 0.3));
      ctx.stroke();
    }
  } else if (style === 'flat') {
    rrect(ctx, x - 4, y - 8, w + 8, 10, 3, opt.roof, shade(opt.roof, -0.3));
  } else if (style === 'tower') {
    tri(ctx, x - 4, y + 1, x + w + 4, y + 1, ax, y - roofH * 1.6, opt.roof, shade(opt.roof, -0.3));
    circle(ctx, ax, y - roofH * 1.6 - 2, 2.6, '#f2c018');
  } else {
    tri(ctx, x - 6, y + 1, x + w + 6, y + 1, ax, y - roofH, opt.roof, shade(opt.roof, -0.3));
  }
  if (opt.chimney) {
    rrect(ctx, x + w * 0.72, y - roofH * 0.7, 8, roofH * 0.5, 1.5, PAL.stone, shade(PAL.stone, -0.3));
    circle(ctx, x + w * 0.76 + 4, y - roofH * 0.8, 3.4, 'rgba(255,255,255,0.5)');
  }
}

/** 简易树木（装饰树） */
function decorTree(ctx: Ctx, ax: number, ay: number, trunkH: number, r: number, leafColor: string, blossom?: string): void {
  softShadow(ctx, ax, ay, r * 1.1, r * 0.35);
  ctx.strokeStyle = PAL.wood;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax, ay - trunkH);
  ctx.stroke();
  circle(ctx, ax - r * 0.7, ay - trunkH - r * 0.3, r * 0.7, shade(leafColor, -0.1));
  circle(ctx, ax + r * 0.7, ay - trunkH - r * 0.3, r * 0.7, shade(leafColor, -0.05));
  circle(ctx, ax, ay - trunkH - r * 0.8, r * 0.85, leafColor);
  if (blossom) {
    circle(ctx, ax - r * 0.5, ay - trunkH - r * 0.7, 2.4, blossom);
    circle(ctx, ax + r * 0.4, ay - trunkH - r * 1.1, 2.4, blossom);
    circle(ctx, ax + r * 0.7, ay - trunkH - r * 0.2, 2.4, blossom);
  }
}

export function paintBuilding(ctx: Ctx, def: BuildingDef): void {
  const { ax, ay } = buildingCanvasSize(def);
  const span = (def.w + def.h) * 26;
  const id = def.id;

  switch (id) {
    // ---------------- 小屋
    case 'bld_hut':
      house(ctx, ax, ay, span, { wall: '#e8d5ae', roof: '#c9a066', roofStyle: 'thatch', windows: 1 });
      break;
    case 'bld_cabin':
      house(ctx, ax, ay, span, { wall: PAL.wood, roof: '#8a5c40', chimney: true });
      // 原木纹
      ctx.strokeStyle = shade(PAL.wood, -0.2);
      ctx.lineWidth = 1.4;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(ax - span * 0.4, ay - (span * 0.42 / 4) * i);
        ctx.lineTo(ax + span * 0.4, ay - (span * 0.42 / 4) * i);
        ctx.stroke();
      }
      break;
    case 'bld_beachhouse':
      house(ctx, ax, ay, span, { wall: '#8fd0e0', roof: '#f0776a', windows: 3, roofStyle: 'gable' });
      // 冲浪板
      ellipse(ctx, ax - span * 0.45, ay - 12, 5, 14, '#f2d049', shade('#f2d049', -0.3));
      break;
    case 'bld_villa':
      house(ctx, ax, ay, span, { wall: '#fef8ec', roof: '#e8956a', windows: 4, chimney: true });
      decorTree(ctx, ax - span * 0.5, ay, 14, 10, PAL.leaf);
      break;
    case 'bld_lighthouse': {
      softShadow(ctx, ax, ay, 24, 8);
      const lw = 26;
      // 条纹塔身
      for (let i = 0; i < 5; i++) {
        const sw = lw - i * 3;
        rrect(ctx, ax - sw / 2, ay - 16 * (i + 1), sw, 16, 2, i % 2 ? '#e85d4a' : '#fef8ec', shade('#e85d4a', -0.3));
      }
      rrect(ctx, ax - 9, ay - 92, 18, 12, 2, '#3d5a80', shade('#3d5a80', -0.3));
      circle(ctx, ax, ay - 86, 5, '#ffe97a', '#e8b93c');
      tri(ctx, ax - 11, ay - 92, ax + 11, ay - 92, ax, ay - 104, '#c9473c', shade('#c9473c', -0.3));
      break;
    }
    case 'bld_castle': {
      softShadow(ctx, ax, ay, span * 0.55, span * 0.14);
      const cw = span * 0.7;
      rrect(ctx, ax - cw / 2, ay - span * 0.45, cw, span * 0.45, 3, '#f5c7c2', shade('#f5c7c2', -0.3));
      // 城齿
      for (let i = 0; i < 5; i++) {
        rrect(ctx, ax - cw / 2 + (cw / 5) * i + 2, ay - span * 0.45 - 7, cw / 5 - 6, 8, 1, '#f5c7c2', shade('#f5c7c2', -0.3));
      }
      // 两座尖塔
      for (const side of [-1, 1]) {
        const tx = ax + side * cw * 0.42;
        rrect(ctx, tx - 8, ay - span * 0.62, 16, span * 0.62, 2, '#fde4e0', shade('#f5c7c2', -0.3));
        tri(ctx, tx - 10, ay - span * 0.62, tx + 10, ay - span * 0.62, tx, ay - span * 0.8, '#7a68b8', shade('#7a68b8', -0.3));
      }
      rrect(ctx, ax - 8, ay - span * 0.24, 16, span * 0.24, 6, PAL.woodDark, shade(PAL.woodDark, -0.25));
      break;
    }
    // ---------------- 装饰
    case 'bld_fence': {
      softShadow(ctx, ax, ay, 20, 5);
      ctx.strokeStyle = PAL.wood;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (const dx of [-14, 0, 14]) {
        ctx.beginPath();
        ctx.moveTo(ax + dx, ay);
        ctx.lineTo(ax + dx, ay - 18);
        ctx.stroke();
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = shade(PAL.wood, -0.12);
      ctx.beginPath();
      ctx.moveTo(ax - 17, ay - 8);
      ctx.lineTo(ax + 17, ay - 8);
      ctx.moveTo(ax - 17, ay - 14);
      ctx.lineTo(ax + 17, ay - 14);
      ctx.stroke();
      break;
    }
    case 'bld_flowerbed': {
      softShadow(ctx, ax, ay + 2, 20, 6);
      ellipse(ctx, ax, ay - 3, 19, 9, '#8a6142', shade('#8a6142', -0.25));
      const colors = ['#e8425c', '#f2c018', '#b465d8', '#f08bb1'];
      colors.forEach((c, i) => {
        const fx = ax - 12 + i * 8;
        const fy = ay - 8 - (i % 2) * 3;
        ctx.strokeStyle = PAL.leafDark;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(fx, ay - 4);
        ctx.lineTo(fx, fy + 3);
        ctx.stroke();
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          circle(ctx, fx + Math.cos(a) * 2.6, fy + Math.sin(a) * 2.6, 1.8, c);
        }
        circle(ctx, fx, fy, 1.6, '#fff4b8');
      });
      break;
    }
    case 'bld_bench': {
      softShadow(ctx, ax, ay, 18, 5);
      rrect(ctx, ax - 16, ay - 12, 32, 5, 2, PAL.wood, shade(PAL.wood, -0.3));
      rrect(ctx, ax - 16, ay - 22, 32, 4, 2, PAL.wood, shade(PAL.wood, -0.3));
      ctx.strokeStyle = shade(PAL.wood, -0.35);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax - 12, ay - 8);
      ctx.lineTo(ax - 12, ay);
      ctx.moveTo(ax + 12, ay - 8);
      ctx.lineTo(ax + 12, ay);
      ctx.stroke();
      break;
    }
    case 'bld_streetlamp': {
      softShadow(ctx, ax, ay, 10, 4);
      ctx.strokeStyle = '#5a6a50';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax, ay - 34);
      ctx.stroke();
      ellipse(ctx, ax, ay - 40, 8, 9, '#f0a03c', shade('#f0a03c', -0.3));
      ctx.strokeStyle = shade('#f0a03c', -0.35);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ax - 6, ay - 40);
      ctx.lineTo(ax + 6, ay - 40);
      ctx.stroke();
      leafShape(ctx, ax, ay - 47, 6, 2.6, 0.2, PAL.leaf);
      circle(ctx, ax, ay - 38, 3.4, '#fff4b8');
      break;
    }
    case 'bld_well': {
      softShadow(ctx, ax, ay, 16, 6);
      ellipse(ctx, ax, ay - 6, 15, 8, PAL.stone, shade(PAL.stone, -0.3));
      ellipse(ctx, ax, ay - 9, 11, 5.5, '#4aa8d8', shade('#4aa8d8', -0.3));
      ctx.strokeStyle = PAL.woodDark;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax - 12, ay - 10);
      ctx.lineTo(ax - 12, ay - 30);
      ctx.moveTo(ax + 12, ay - 10);
      ctx.lineTo(ax + 12, ay - 30);
      ctx.stroke();
      tri(ctx, ax - 16, ay - 28, ax + 16, ay - 28, ax, ay - 40, '#8a5c40', shade('#8a5c40', -0.3));
      circle(ctx, ax, ay - 20, 3, '#c9a066', shade('#c9a066', -0.3));
      break;
    }
    case 'bld_fountain': {
      softShadow(ctx, ax, ay, 26, 8);
      ellipse(ctx, ax, ay - 5, 26, 12, '#c8dce8', shade('#c8dce8', -0.3));
      ellipse(ctx, ax, ay - 7, 21, 9, '#6fc8e8', shade('#6fc8e8', -0.2));
      rrect(ctx, ax - 4, ay - 26, 8, 18, 3, '#c8dce8', shade('#c8dce8', -0.3));
      // 海豚雕像
      ellipse(ctx, ax, ay - 32, 8, 5.5, '#7db8d8', shade('#7db8d8', -0.25));
      tri(ctx, ax + 6, ay - 34, ax + 11, ay - 38, ax + 10, ay - 31, '#7db8d8');
      // 水花
      ctx.strokeStyle = 'rgba(190, 230, 245, 0.9)';
      ctx.lineWidth = 2;
      for (const side of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.moveTo(ax, ay - 36);
        ctx.quadraticCurveTo(ax + side * 12, ay - 44, ax + side * 16, ay - 24);
        ctx.stroke();
      }
      break;
    }
    case 'bld_swing': {
      softShadow(ctx, ax, ay, 20, 5);
      ctx.strokeStyle = PAL.wood;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax - 16, ay);
      ctx.lineTo(ax - 8, ay - 32);
      ctx.moveTo(ax + 16, ay);
      ctx.lineTo(ax + 8, ay - 32);
      ctx.moveTo(ax - 10, ay - 32);
      ctx.lineTo(ax + 10, ay - 32);
      ctx.stroke();
      ctx.strokeStyle = '#c9b48a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax - 5, ay - 31);
      ctx.lineTo(ax - 5, ay - 12);
      ctx.moveTo(ax + 5, ay - 31);
      ctx.lineTo(ax + 5, ay - 12);
      ctx.stroke();
      rrect(ctx, ax - 8, ay - 12, 16, 4, 2, PAL.wood, shade(PAL.wood, -0.3));
      break;
    }
    case 'bld_parasol': {
      softShadow(ctx, ax, ay, 16, 6);
      ctx.strokeStyle = '#e8e2d4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax, ay - 34);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax - 24, ay - 26);
      ctx.quadraticCurveTo(ax, ay - 48, ax + 24, ay - 26);
      ctx.closePath();
      ctx.fillStyle = '#f0776a';
      ctx.fill();
      ctx.strokeStyle = shade('#f0776a', -0.3);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      for (const dx of [-12, 0, 12]) {
        tri(ctx, ax + dx - 5, ay - 27.5, ax + dx + 5, ay - 27.5, ax + dx, ay - 36, '#fef8ec');
      }
      break;
    }
    case 'bld_sandcastle': {
      softShadow(ctx, ax, ay, 18, 6);
      rrect(ctx, ax - 14, ay - 16, 28, 16, 2, PAL.sand, shade(PAL.sand, -0.25));
      for (const side of [-1, 1]) {
        rrect(ctx, ax + side * 12 - 5, ay - 26, 10, 26, 2, shade(PAL.sand, 0.04), shade(PAL.sand, -0.25));
        tri(ctx, ax + side * 12 - 6, ay - 26, ax + side * 12 + 6, ay - 26, ax + side * 12, ay - 34, '#f0776a');
      }
      rrect(ctx, ax - 4, ay - 10, 8, 10, 3, shade(PAL.sand, -0.3));
      break;
    }
    case 'bld_statue': {
      softShadow(ctx, ax, ay, 16, 6);
      rrect(ctx, ax - 13, ay - 8, 26, 8, 2, PAL.stone, shade(PAL.stone, -0.3));
      // 海神像：躯干+三叉戟
      ellipse(ctx, ax - 2, ay - 22, 7, 12, shade(PAL.stone, 0.08), shade(PAL.stone, -0.3));
      circle(ctx, ax - 2, ay - 37, 5.5, shade(PAL.stone, 0.08), shade(PAL.stone, -0.3));
      ctx.strokeStyle = shade(PAL.stone, -0.2);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(ax + 9, ay - 8);
      ctx.lineTo(ax + 9, ay - 44);
      ctx.stroke();
      tri(ctx, ax + 5, ay - 42, ax + 13, ay - 42, ax + 9, ay - 50, shade(PAL.stone, -0.1));
      break;
    }
    case 'bld_archway': {
      softShadow(ctx, ax, ay, 26, 6);
      ctx.strokeStyle = '#8a9a78';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(ax - 20, ay);
      ctx.quadraticCurveTo(ax - 22, ay - 36, ax, ay - 40);
      ctx.quadraticCurveTo(ax + 22, ay - 36, ax + 20, ay);
      ctx.stroke();
      // 藤蔓花
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const px = ax - 20 + t * 40;
        const py = ay - 4 - Math.sin(t * Math.PI) * 34;
        circle(ctx, px, py, 2.4, i % 2 ? '#f08bb1' : '#fef8ec');
        if (i % 2 === 0) leafShape(ctx, px + 2, py + 2, 6, 2.2, 0.8, PAL.leaf);
      }
      break;
    }
    case 'bld_windmill': {
      softShadow(ctx, ax, ay, 18, 6);
      tri(ctx, ax - 12, ay, ax + 12, ay, ax, ay - 38, '#e8d5ae', shade('#e8d5ae', -0.25));
      circle(ctx, ax, ay - 34, 3, PAL.woodDark);
      ctx.save();
      ctx.translate(ax, ay - 34);
      ctx.rotate(0.5);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        rrect(ctx, -2, -20, 5, 18, 2, '#f0776a', shade('#f0776a', -0.3));
      }
      ctx.restore();
      break;
    }
    case 'bld_teleshell': {
      softShadow(ctx, ax, ay, 14, 5);
      // 大海螺
      ctx.beginPath();
      ctx.moveTo(ax - 12, ay);
      ctx.quadraticCurveTo(ax - 16, ay - 22, ax, ay - 26);
      ctx.quadraticCurveTo(ax + 18, ay - 28, ax + 14, ay - 10);
      ctx.quadraticCurveTo(ax + 12, ay, ax - 12, ay);
      ctx.closePath();
      ctx.fillStyle = '#f5c7d5';
      ctx.fill();
      ctx.strokeStyle = shade('#f5c7d5', -0.3);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax + 2, ay - 6);
      ctx.quadraticCurveTo(ax + 8, ay - 14, ax + 4, ay - 18);
      ctx.quadraticCurveTo(ax, ay - 20, ax - 2, ay - 14);
      ctx.strokeStyle = shade('#f5c7d5', -0.2);
      ctx.stroke();
      // 音符
      ctx.fillStyle = '#7a68b8';
      circle(ctx, ax + 16, ay - 34, 2.4, '#7a68b8');
      ctx.strokeStyle = '#7a68b8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ax + 18.4, ay - 34);
      ctx.lineTo(ax + 18.4, ay - 44);
      ctx.stroke();
      break;
    }
    case 'bld_bonfire': {
      softShadow(ctx, ax, ay, 14, 5);
      // 柴堆
      ctx.strokeStyle = PAL.woodDark;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax - 12, ay);
      ctx.lineTo(ax + 12, ay - 6);
      ctx.moveTo(ax + 12, ay);
      ctx.lineTo(ax - 12, ay - 6);
      ctx.stroke();
      // 火焰
      tri(ctx, ax - 8, ay - 4, ax + 8, ay - 4, ax, ay - 28, '#f0a03c');
      tri(ctx, ax - 5, ay - 4, ax + 5, ay - 4, ax, ay - 20, '#e85d4a');
      tri(ctx, ax - 2.6, ay - 4, ax + 2.6, ay - 4, ax, ay - 13, '#ffe97a');
      break;
    }
    case 'bld_totem': {
      softShadow(ctx, ax, ay, 12, 5);
      const colors = ['#e8956a', '#5aa7e0', '#8a9a78'];
      colors.forEach((c, i) => {
        rrect(ctx, ax - 9, ay - 14 * (i + 1), 18, 13, 2, c, shade(c, -0.3));
        dotEye(ctx, ax - 4, ay - 14 * (i + 1) + 6, 1.6);
        dotEye(ctx, ax + 4, ay - 14 * (i + 1) + 6, 1.6);
      });
      for (const side of [-1, 1]) {
        tri(ctx, ax + side * 8, ay - 40, ax + side * 18, ay - 46, ax + side * 8, ay - 34, '#f2c018');
      }
      break;
    }
    case 'bld_icecream': {
      softShadow(ctx, ax, ay, 22, 7);
      rrect(ctx, ax - 20, ay - 24, 40, 24, 4, '#fef8ec', shade('#fef8ec', -0.25));
      rrect(ctx, ax - 20, ay - 24, 40, 7, 3, '#f08bb1', shade('#f08bb1', -0.25));
      circle(ctx, ax - 11, ay + 1, 5, '#5b5048', '#3c332c');
      circle(ctx, ax + 11, ay + 1, 5, '#5b5048', '#3c332c');
      // 甜筒招牌
      tri(ctx, ax + 14, ay - 32, ax + 22, ay - 32, ax + 18, ay - 22, '#e0c27e', shade('#e0c27e', -0.25));
      circle(ctx, ax + 18, ay - 34, 4.5, '#f5c7d5', shade('#f5c7d5', -0.2));
      rrect(ctx, ax - 16, ay - 20, 14, 9, 2, '#bfe6f2', shade('#bfe6f2', -0.3));
      break;
    }
    case 'bld_hotspring': {
      softShadow(ctx, ax, ay + 2, 26, 9);
      ellipse(ctx, ax, ay - 4, 26, 13, PAL.stone, shade(PAL.stone, -0.3));
      ellipse(ctx, ax, ay - 6, 21, 10, '#a8dce8', shade('#a8dce8', -0.2));
      // 蒸汽
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2.4;
      for (const dx of [-10, 0, 10]) {
        ctx.beginPath();
        ctx.moveTo(ax + dx, ay - 12);
        ctx.quadraticCurveTo(ax + dx + 4, ay - 20, ax + dx, ay - 28);
        ctx.stroke();
      }
      circle(ctx, ax - 14, ay - 2, 3.4, shade(PAL.stone, 0.1), shade(PAL.stone, -0.3));
      circle(ctx, ax + 15, ay - 4, 3.4, shade(PAL.stone, 0.1), shade(PAL.stone, -0.3));
      break;
    }
    case 'bld_ferris': {
      softShadow(ctx, ax, ay, 26, 7);
      const cy = ay - 40;
      ctx.strokeStyle = '#8a9ab8';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(ax - 14, ay);
      ctx.lineTo(ax, cy);
      ctx.lineTo(ax + 14, ay);
      ctx.stroke();
      ctx.strokeStyle = '#a8b8d0';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(ax, cy, 24, 0, Math.PI * 2);
      ctx.stroke();
      const carColors = ['#f0776a', '#f2c018', '#5aa7e0', '#8fd05e', '#b465d8', '#f08bb1'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = ax + Math.cos(a) * 24;
        const py = cy + Math.sin(a) * 24;
        ctx.strokeStyle = '#8a9ab8';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(ax, cy);
        ctx.lineTo(px, py);
        ctx.stroke();
        rrect(ctx, px - 5, py - 2, 10, 8, 3, carColors[i], shade(carColors[i], -0.3));
      }
      circle(ctx, ax, cy, 4, '#f2c018', shade('#f2c018', -0.3));
      break;
    }
    // ---------------- 自然
    case 'bld_palm': {
      softShadow(ctx, ax, ay, 14, 5);
      ctx.strokeStyle = PAL.wood;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(ax + 6, ay - 18, ax + 9, ay - 34);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55;
        leafShape(ctx, ax + 9, ay - 34, 19, 5, a + Math.PI, i % 2 ? PAL.leaf : shade(PAL.leaf, -0.12));
      }
      circle(ctx, ax + 6, ay - 31, 3, '#9c7048', shade('#9c7048', -0.3));
      circle(ctx, ax + 12, ay - 30, 3, '#9c7048', shade('#9c7048', -0.3));
      break;
    }
    case 'bld_bush': {
      softShadow(ctx, ax, ay, 15, 5);
      circle(ctx, ax - 8, ay - 7, 8, shade(PAL.leaf, -0.08));
      circle(ctx, ax + 8, ay - 7, 8, shade(PAL.leaf, -0.04));
      circle(ctx, ax, ay - 12, 9.5, PAL.leaf);
      for (const [dx, dy] of [[-8, -6], [0, -14], [8, -6], [0, -4]] as const) {
        circle(ctx, ax + dx, ay + dy, 3.2, '#a8c4f0');
        circle(ctx, ax + dx, ay + dy, 1.4, '#c8dcf8');
      }
      break;
    }
    case 'bld_rock': {
      softShadow(ctx, ax, ay, 13, 5);
      ctx.beginPath();
      ctx.moveTo(ax - 12, ay);
      ctx.quadraticCurveTo(ax - 13, ay - 12, ax - 4, ay - 15);
      ctx.quadraticCurveTo(ax + 8, ay - 18, ax + 12, ay - 6);
      ctx.quadraticCurveTo(ax + 13, ay, ax - 12, ay);
      ctx.closePath();
      ctx.fillStyle = PAL.stone;
      ctx.fill();
      ctx.strokeStyle = shade(PAL.stone, -0.3);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ellipse(ctx, ax - 4, ay - 4, 5, 3, '#7ba86a');
      ellipse(ctx, ax + 6, ay - 10, 3.4, 2.2, '#7ba86a');
      break;
    }
    case 'bld_pond': {
      softShadow(ctx, ax, ay + 2, 26, 9);
      ellipse(ctx, ax, ay - 4, 27, 13, '#7ba86a', shade('#7ba86a', -0.25));
      ellipse(ctx, ax, ay - 5, 23, 10, '#6fc8e8', shade('#4aa8d8', -0.1));
      // 睡莲
      ellipse(ctx, ax - 9, ay - 7, 5, 3, '#4c9138');
      tri(ctx, ax - 9, ay - 7, ax - 5, ay - 8.5, ax - 7, ay - 5.5, '#6fc8e8');
      circle(ctx, ax + 8, ay - 4, 2.6, '#f08bb1');
      circle(ctx, ax + 8, ay - 4, 1.2, '#fff4b8');
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ax - 2, ay - 10);
      ctx.quadraticCurveTo(ax + 3, ay - 12, ax + 8, ay - 10);
      ctx.stroke();
      break;
    }
    case 'bld_cherry':
      decorTree(ctx, ax, ay, 16, 12, '#f5b8c9', '#fde4ec');
      break;
    case 'bld_bamboo': {
      softShadow(ctx, ax, ay, 14, 5);
      for (const [dx, h] of [[-8, 30], [0, 40], [8, 34]] as const) {
        ctx.strokeStyle = '#7ba86a';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ax + dx, ay);
        ctx.lineTo(ax + dx, ay - h);
        ctx.stroke();
        ctx.strokeStyle = shade('#7ba86a', -0.25);
        ctx.lineWidth = 1.4;
        for (let seg = 1; seg < h / 10; seg++) {
          ctx.beginPath();
          ctx.moveTo(ax + dx - 2.4, ay - seg * 10);
          ctx.lineTo(ax + dx + 2.4, ay - seg * 10);
          ctx.stroke();
        }
        leafShape(ctx, ax + dx, ay - h, 10, 2.8, -0.9, PAL.leaf);
        leafShape(ctx, ax + dx, ay - h + 4, 10, 2.8, 0.9, shade(PAL.leaf, -0.1));
      }
      break;
    }
    case 'bld_coral': {
      softShadow(ctx, ax, ay, 14, 5);
      ctx.lineCap = 'round';
      for (const [dx, color, h] of [[-8, '#e88a9a', 18], [0, '#f0a03c', 24], [8, '#b465d8', 16]] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(ax + dx, ay);
        ctx.lineTo(ax + dx, ay - h);
        ctx.moveTo(ax + dx, ay - h * 0.55);
        ctx.lineTo(ax + dx - 5, ay - h * 0.9);
        ctx.moveTo(ax + dx, ay - h * 0.7);
        ctx.lineTo(ax + dx + 5, ay - h);
        ctx.stroke();
      }
      break;
    }
    case 'bld_banyan': {
      decorTree(ctx, ax, ay, 18, 16, shade(PAL.leaf, -0.06));
      // 气根
      ctx.strokeStyle = shade(PAL.wood, -0.15);
      ctx.lineWidth = 2;
      for (const dx of [-9, -3, 5]) {
        ctx.beginPath();
        ctx.moveTo(ax + dx, ay - 22);
        ctx.quadraticCurveTo(ax + dx - 1, ay - 10, ax + dx, ay - 2);
        ctx.stroke();
      }
      break;
    }
    // ---------------- 道路
    case 'bld_path_sand':
    case 'bld_path_stone':
    case 'bld_path_wood':
    case 'bld_path_brick': {
      const colors: Record<string, [string, string]> = {
        bld_path_sand: ['#eeddb2', '#dcc38b'],
        bld_path_stone: ['#c8c4b8', '#a8a498'],
        bld_path_wood: ['#c99b6a', '#a87c50'],
        bld_path_brick: ['#d88a72', '#b86a54'],
      };
      const [c1, c2] = colors[id];
      // 平贴地面的菱形
      ctx.beginPath();
      ctx.moveTo(ax, ay - 30);
      ctx.lineTo(ax + 28, ay - 16);
      ctx.lineTo(ax, ay - 2);
      ctx.lineTo(ax - 28, ay - 16);
      ctx.closePath();
      ctx.fillStyle = c1;
      ctx.fill();
      ctx.strokeStyle = c2;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = c2;
      if (id === 'bld_path_wood') {
        for (let i = -1; i <= 1; i++) {
          ctx.save();
          ctx.translate(ax, ay - 16 + i * 7);
          ctx.transform(1, 0.5, -1, 0.5, 0, 0);
          ctx.fillRect(-9, -1.2, 18, 2.4);
          ctx.restore();
        }
      } else {
        for (const [dx, dy] of [[-9, 0], [4, -5], [6, 5], [-2, 8]] as const) {
          ellipse(ctx, ax + dx, ay - 16 + dy, 3.2, 1.8, c2);
        }
      }
      break;
    }
    // ---------------- 功能
    case 'bld_storage': {
      house(ctx, ax, ay, span * 0.95, { wall: '#c9b48a', roof: '#8a795c', roofStyle: 'flat', windows: 0 });
      // 木箱
      rrect(ctx, ax - span * 0.35, ay - 14, 14, 14, 2, PAL.wood, shade(PAL.wood, -0.3));
      ctx.strokeStyle = shade(PAL.wood, -0.3);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ax - span * 0.35, ay - 7);
      ctx.lineTo(ax - span * 0.35 + 14, ay - 7);
      ctx.stroke();
      break;
    }
    case 'bld_scarecrow': {
      softShadow(ctx, ax, ay, 12, 4);
      ctx.strokeStyle = PAL.woodDark;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax, ay - 30);
      ctx.moveTo(ax - 13, ay - 24);
      ctx.lineTo(ax + 13, ay - 24);
      ctx.stroke();
      rrect(ctx, ax - 8, ay - 26, 16, 12, 3, '#5aa7e0', shade('#5aa7e0', -0.3));
      circle(ctx, ax, ay - 33, 6.5, '#f2d5a0', shade('#f2d5a0', -0.3));
      dotEye(ctx, ax - 2.4, ay - 34, 1.4);
      dotEye(ctx, ax + 2.4, ay - 34, 1.4);
      tri(ctx, ax - 9, ay - 37, ax + 9, ay - 37, ax, ay - 47, '#e0c27e', shade('#e0c27e', -0.3));
      break;
    }
    case 'bld_doghouse': {
      softShadow(ctx, ax, ay, 15, 5);
      rrect(ctx, ax - 14, ay - 18, 28, 18, 3, '#e8956a', shade('#e8956a', -0.3));
      tri(ctx, ax - 17, ay - 17, ax + 17, ay - 17, ax, ay - 30, '#c9473c', shade('#c9473c', -0.3));
      ctx.beginPath();
      ctx.arc(ax, ay - 6, 6, Math.PI, 0);
      ctx.lineTo(ax + 6, ay);
      ctx.lineTo(ax - 6, ay);
      ctx.closePath();
      ctx.fillStyle = '#4a3b32';
      ctx.fill();
      circle(ctx, ax, ay - 24, 2.4, '#f2c018');
      break;
    }
    case 'bld_pier': {
      softShadow(ctx, ax, ay, 22, 6);
      // 木台
      ctx.save();
      ctx.translate(ax, ay - 14);
      ctx.transform(1, 0.5, -1, 0.5, 0, 0);
      rrect(ctx, -14, -14, 28, 28, 2, '#c99b6a', '#a87c50');
      ctx.restore();
      // 栏杆和鱼竿
      ctx.strokeStyle = PAL.woodDark;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(ax + 12, ay - 20);
      ctx.lineTo(ax + 12, ay - 32);
      ctx.stroke();
      ctx.strokeStyle = '#8a5c40';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax - 10, ay - 18);
      ctx.lineTo(ax + 8, ay - 44);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,140,150,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax + 8, ay - 44);
      ctx.lineTo(ax + 8, ay - 26);
      ctx.stroke();
      break;
    }
    case 'bld_market': {
      house(ctx, ax, ay, span * 0.9, { wall: '#fef8ec', roof: '#5aa7e0', windows: 0, roofStyle: 'flat' });
      // 遮阳条纹棚
      const mw = span * 0.9 * 0.82;
      for (let i = 0; i < 5; i++) {
        const sx = ax - mw / 2 + (mw / 5) * i;
        ctx.beginPath();
        ctx.moveTo(sx, ay - span * 0.9 * 0.42);
        ctx.lineTo(sx + mw / 5, ay - span * 0.9 * 0.42);
        ctx.lineTo(sx + mw / 5 - 2, ay - span * 0.9 * 0.42 + 9);
        ctx.lineTo(sx + 2, ay - span * 0.9 * 0.42 + 9);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? '#5aa7e0' : '#fef8ec';
        ctx.fill();
        ctx.strokeStyle = shade('#5aa7e0', -0.25);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // 摊位上的鱼
      ellipse(ctx, ax - 8, ay - 8, 5, 2.4, '#7db8d8', shade('#7db8d8', -0.25));
      ellipse(ctx, ax + 6, ay - 8, 5, 2.4, '#e88a9a', shade('#e88a9a', -0.25));
      break;
    }
    case 'bld_workshop': {
      house(ctx, ax, ay, span * 0.95, { wall: '#c9a980', roof: '#8a6242', windows: 1, chimney: true });
      // 门口锯木架
      ctx.strokeStyle = PAL.woodDark;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(ax + span * 0.3 - 8, ay);
      ctx.lineTo(ax + span * 0.3 - 2, ay - 10);
      ctx.moveTo(ax + span * 0.3 + 4, ay);
      ctx.lineTo(ax + span * 0.3 - 2, ay - 10);
      ctx.stroke();
      rrect(ctx, ax + span * 0.3 - 12, ay - 14, 20, 5, 1, PAL.wood, shade(PAL.wood, -0.3));
      break;
    }
    default: {
      // 兜底：彩色小盒子（不应出现，防御性）
      const c = hashColor(id);
      softShadow(ctx, ax, ay, 16, 5);
      rrect(ctx, ax - 12, ay - 20, 24, 20, 3, c, shade(c, -0.3));
      star(ctx, ax, ay - 26, 5, '#f2c018');
    }
  }
}
