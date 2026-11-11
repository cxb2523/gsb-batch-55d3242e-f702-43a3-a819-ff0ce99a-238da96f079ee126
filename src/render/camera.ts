/**
 * 相机：平移 + 缩放，屏幕坐标 ⇄ 格坐标换算。
 */
import { isoX, isoY, tileXf, tileYf } from './iso';

export class Camera {
  /** 屏幕中心对准的世界像素坐标 */
  cx = 0;
  cy = 0;
  zoom = 1;
  viewW = 800;
  viewH = 600;

  centerOnTile(tx: number, ty: number): void {
    this.cx = isoX(tx, ty);
    this.cy = isoY(tx, ty);
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  /** 世界像素 → 屏幕像素 */
  sx(wx: number): number {
    return (wx - this.cx) * this.zoom + this.viewW / 2;
  }

  sy(wy: number): number {
    return (wy - this.cy) * this.zoom + this.viewH / 2;
  }

  /** 屏幕像素 → 世界像素 */
  wx(sx: number): number {
    return (sx - this.viewW / 2) / this.zoom + this.cx;
  }

  wy(sy: number): number {
    return (sy - this.viewH / 2) / this.zoom + this.cy;
  }

  /** 屏幕像素 → 格坐标（取整） */
  tileAt(sx: number, sy: number): { tx: number; ty: number } {
    const wx = this.wx(sx);
    const wy = this.wy(sy);
    return { tx: Math.floor(tileXf(wx, wy)), ty: Math.floor(tileYf(wx, wy)) };
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.cx -= dxScreen / this.zoom;
    this.cy -= dyScreen / this.zoom;
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const beforeX = this.wx(sx);
    const beforeY = this.wy(sy);
    this.zoom = Math.min(2.2, Math.max(0.45, this.zoom * factor));
    // 保持鼠标下的世界点不动
    this.cx += beforeX - this.wx(sx);
    this.cy += beforeY - this.wy(sy);
  }
}
