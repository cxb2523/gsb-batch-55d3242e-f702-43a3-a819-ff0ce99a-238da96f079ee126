/**
 * 等距投影数学：格坐标 ⇄ 屏幕坐标。
 * 经典 2:1 菱形瓦片，TILE_W×TILE_H = 64×32。
 */

export const TILE_W = 64;
export const TILE_H = 32;

/** 格坐标 → 未平移的世界像素坐标（瓦片菱形中心） */
export function isoX(tx: number, ty: number): number {
  return ((tx - ty) * TILE_W) / 2;
}

export function isoY(tx: number, ty: number): number {
  return ((tx + ty) * TILE_H) / 2;
}

/** 世界像素坐标 → 格坐标（浮点） */
export function tileXf(wx: number, wy: number): number {
  return wx / TILE_W + wy / TILE_H;
}

export function tileYf(wx: number, wy: number): number {
  return wy / TILE_H - wx / TILE_W;
}

/** 画一个瓦片菱形路径（中心在 cx, cy） */
export function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w = TILE_W, h = TILE_H): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
}
