/**
 * 程序化美术公共库：统一调色板 + 基础造型笔刷。
 * 全部美术都是运行时用 Canvas 画出来的原创图形 —— 项目零外部素材。
 *
 * 风格约定：扁平 Q 版、两段明暗、深色描边（OUTLINE），底部软阴影。
 */

export const SS = 2; // 精灵超采样倍率（画 2x，渲染时缩回，保证缩放清晰）

export const PAL = {
  outline: '#4a3b32',
  shadow: 'rgba(58, 48, 38, 0.18)',
  // 地形
  grass: '#8fd05e',
  grassDark: '#76b84a',
  grassEdge: '#5f9c3c',
  sand: '#f2dfae',
  sandDark: '#e3c98d',
  water: '#6fc8e8',
  waterDeep: '#4aa8d8',
  soil: '#a3765057',
  // 通用
  wood: '#b58455',
  woodDark: '#8f6540',
  leaf: '#63b04b',
  leafDark: '#4c9138',
  fruitRed: '#e85d4a',
  cream: '#fff4dd',
  stone: '#b9b4a8',
  stoneDark: '#948f83',
} as const;

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx } {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w * SS;
    canvas.height = h * SS;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(SS, SS);
    return { canvas, ctx };
  }
  const canvas = new OffscreenCanvas(w * SS, h * SS);
  const ctx = canvas.getContext('2d') as unknown as Ctx;
  ctx.scale(SS, SS);
  return { canvas, ctx };
}

/** 颜色加深/变亮：amt ∈ [-1, 1] */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const f = (c: number) => {
    const v = amt >= 0 ? c + (255 - c) * amt : c * (1 + amt);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `#${((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, '0')}`;
}

/** id → 稳定色相（给没有专属配色的内容自动配色） */
export function hashColor(id: string, sat = 62, light = 58): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, ${sat}%, ${light}%)`;
}

export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

export function circle(ctx: Ctx, cx: number, cy: number, r: number, fill: string, stroke?: string): void {
  ellipse(ctx, cx, cy, r, r, fill, stroke);
}

/** 底部软阴影 */
export function softShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry = rx * 0.38): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = PAL.shadow;
  ctx.fill();
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

/** 简单三角形 */
export function tri(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

/** 叶片（贝塞尔纺锤形） */
export function leafShape(ctx: Ctx, cx: number, cy: number, len: number, wid: number, angle: number, fill: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(wid, -len / 2, 0, -len);
  ctx.quadraticCurveTo(-wid, -len / 2, 0, 0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

/** 五角星 */
export function star(ctx: Ctx, cx: number, cy: number, r: number, fill: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** 心形 */
export function heart(ctx: Ctx, cx: number, cy: number, s: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.6);
  ctx.bezierCurveTo(cx - s, cy - s * 0.1, cx - s * 0.5, cy - s, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s, cx + s, cy - s * 0.1, cx, cy + s * 0.6);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** 简易眼睛（黑豆眼 + 高光） */
export function dotEye(ctx: Ctx, cx: number, cy: number, r = 2.2): void {
  circle(ctx, cx, cy, r, '#33281f');
  circle(ctx, cx + r * 0.3, cy - r * 0.35, r * 0.35, '#ffffff');
}
