/**
 * 场景渲染器：地形 → 地块 → 按深度排序的实体 → 徽章 → 日夜色调。
 * 支持渲染玩家自己的岛、NPC 邻居岛、好友快照岛（三者都归一成 RenderScene）。
 */
import type {
  AnimalInstance, AvatarConfig, BeastInstance, FarmPlot, GameState, Placement, Terrain,
} from '../core/types';
import { buildTerrain } from '../core/island';
import { buildingDef } from '../core/registry';
import { cropView } from '../core/crops';
import { animalPhase } from '../core/animals';
import { WATER_COOLDOWN_MS } from '../core/balance';
import { Camera } from './camera';
import { isoX, isoY, TILE_H, TILE_W } from './iso';
import { charKey, drawSprite } from './sprites';

export interface SceneActor {
  avatar: AvatarConfig;
  x: number;   // 格坐标（浮点）
  y: number;
  walking: boolean;
  name?: string;
}

/** 渲染层看到的统一场景描述 */
export interface RenderScene {
  seed: number;
  islandTier: number;
  plots: FarmPlot[];
  placements: Placement[];
  animals: AnimalInstance[];
  beasts: BeastInstance[];
  weeds: { uid: number; x: number; y: number }[];
  pets: { defId: string; x: number; y: number }[];
  actors: SceneActor[];
  /** 悬停格与可否操作提示 */
  hover: { tx: number; ty: number; ok: boolean } | null;
  /** 编辑/摆放模式下的虚影 */
  ghost: { defId: string; tx: number; ty: number; ok: boolean } | null;
}

export function sceneFromState(state: GameState): RenderScene {
  return {
    seed: state.seed,
    islandTier: state.islandTier,
    plots: state.plots,
    placements: state.placements,
    animals: state.animals,
    beasts: state.beasts,
    weeds: state.weeds,
    pets: state.pets.map((p) => ({ defId: p.defId, x: p.x, y: p.y })),
    actors: [],
    hover: null,
    ghost: null,
  };
}

interface DrawItem {
  depth: number;
  draw: () => void;
}

/** 一天中的光照：返回夜色覆盖透明度 0(白天)~0.45(深夜) */
export function nightAlpha(now: number): number {
  const d = new Date(now);
  const override = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__PI_HOUR__
    : undefined;
  const hour = typeof override === 'number' ? override : d.getHours() + d.getMinutes() / 60;
  if (hour >= 7 && hour <= 17) return 0;
  if (hour > 17 && hour < 20) return ((hour - 17) / 3) * 0.42;
  if (hour >= 20 || hour < 5) return 0.42;
  return (1 - (hour - 5) / 2) * 0.42; // 5-7 点渐亮
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.camera.resize(w, h);
  }

  /** 主绘制入口 */
  render(scene: RenderScene, now: number): void {
    const { ctx, camera } = this;
    const zoom = camera.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 海洋底色
    ctx.fillStyle = '#4aa8d8';
    ctx.fillRect(0, 0, camera.viewW, camera.viewH);

    const terrain = buildTerrain(scene.seed, scene.islandTier);
    const size = terrain.length;

    // 可视格范围粗裁剪
    const pad = 3;
    const corners = [
      camera.tileAt(0, 0), camera.tileAt(camera.viewW, 0),
      camera.tileAt(0, camera.viewH), camera.tileAt(camera.viewW, camera.viewH),
    ];
    const minTx = Math.max(0, Math.min(...corners.map((c) => c.tx)) - pad);
    const maxTx = Math.min(size - 1, Math.max(...corners.map((c) => c.tx)) + pad);
    const minTy = Math.max(0, Math.min(...corners.map((c) => c.ty)) - pad);
    const maxTy = Math.min(size - 1, Math.max(...corners.map((c) => c.ty)) + pad);

    // ---- 地形
    const waterPhase = Math.floor(now / 700) % 3;
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const t: Terrain = terrain[ty][tx];
        const sx = camera.sx(isoX(tx, ty));
        const sy = camera.sy(isoY(tx, ty));
        const variant = (tx * 7 + ty * 13) % 4;
        if (t === 'water') {
          // 岸边浅水 / 远处深水
          const nearLand =
            (tx > 0 && terrain[ty][tx - 1] !== 'water') || (tx < size - 1 && terrain[ty][tx + 1] !== 'water') ||
            (ty > 0 && terrain[ty - 1][tx] !== 'water') || (ty < size - 1 && terrain[ty + 1][tx] !== 'water');
          drawSprite(ctx, `tile:water:${(variant + waterPhase) % 4}:${nearLand ? 'shallow' : 'deep'}`, sx, sy, zoom);
        } else {
          drawSprite(ctx, `tile:${t}:${variant}`, sx, sy, zoom);
        }
      }
    }

    // ---- 地块（贴地，先于实体）
    for (const plot of scene.plots) {
      const sx = camera.sx(isoX(plot.x, plot.y));
      const sy = camera.sy(isoY(plot.x, plot.y));
      const wet = !!plot.crop && now - plot.crop.lastWateredAt < WATER_COOLDOWN_MS;
      drawSprite(ctx, `tile:plot:${wet ? 'wet' : 'dry'}`, sx, sy, zoom);
    }
    // 道路也贴地
    for (const pl of scene.placements) {
      const def = buildingDef(pl.defId);
      if (def.category !== 'path') continue;
      const sx = camera.sx(isoX(pl.x, pl.y));
      const sy = camera.sy(isoY(pl.x, pl.y));
      drawSprite(ctx, `bld:${pl.defId}`, sx, sy + (TILE_H / 2) * zoom, zoom);
    }

    // ---- 悬停高亮
    if (scene.hover) {
      const sx = camera.sx(isoX(scene.hover.tx, scene.hover.ty));
      const sy = camera.sy(isoY(scene.hover.tx, scene.hover.ty));
      drawSprite(ctx, `hl:${scene.hover.ok ? 'ok' : 'bad'}`, sx, sy, zoom);
    }

    // ---- 实体深度排序
    const items: DrawItem[] = [];
    const bob = Math.sin(now / 350) * 1.6;

    for (const plot of scene.plots) {
      if (!plot.crop) continue;
      const crop = plot.crop;
      const view = cropView(crop, now);
      const sx = camera.sx(isoX(plot.x, plot.y));
      const sy = camera.sy(isoY(plot.x, plot.y) + TILE_H / 2);
      items.push({
        depth: plot.x + plot.y,
        draw: () => {
          drawSprite(ctx, `crop:${crop.defId}:${view.stage}`, sx, sy, zoom);
          if (view.stage === 'ready') {
            drawSprite(ctx, 'fx:ready', sx, sy - 52 * zoom + bob * zoom, zoom);
          } else if (view.stage === 'withered') {
            drawSprite(ctx, 'fx:hungry', sx, sy - 40 * zoom + bob * zoom, zoom);
          }
        },
      });
    }

    for (const pl of scene.placements) {
      const def = buildingDef(pl.defId);
      if (def.category === 'path') continue;
      const cx = pl.x + (def.w - 1) / 2;
      const cy = pl.y + (def.h - 1) / 2;
      const sx = camera.sx(isoX(cx, cy));
      const sy = camera.sy(isoY(cx, cy) + TILE_H / 2);
      items.push({
        depth: pl.x + def.w - 1 + pl.y + def.h - 1,
        draw: () => {
          if (pl.rot === 1) {
            ctx.save();
            ctx.translate(sx, 0);
            ctx.scale(-1, 1);
            drawSprite(ctx, `bld:${pl.defId}`, 0, sy, zoom);
            ctx.restore();
          } else {
            drawSprite(ctx, `bld:${pl.defId}`, sx, sy, zoom);
          }
        },
      });
    }

    for (const a of scene.animals) {
      const sx = camera.sx(isoX(a.x, a.y));
      const sy = camera.sy(isoY(a.x, a.y) + TILE_H / 2);
      const phase = animalPhase(a, now);
      items.push({
        depth: a.x + a.y,
        draw: () => {
          drawSprite(ctx, `animal:${a.defId}`, sx, sy + Math.abs(Math.sin(now / 400 + a.uid)) * -2 * zoom, zoom);
          if (phase === 'hungry') drawSprite(ctx, 'fx:hungry', sx, sy - 46 * zoom + bob * zoom, zoom);
          else if (phase === 'ready') drawSprite(ctx, 'fx:ready', sx, sy - 46 * zoom + bob * zoom, zoom);
        },
      });
    }

    for (const b of scene.beasts) {
      const sx = camera.sx(isoX(b.x, b.y));
      const sy = camera.sy(isoY(b.x, b.y) + TILE_H / 2);
      items.push({
        depth: b.x + b.y,
        draw: () => {
          const shake = Math.sin(now / 90 + b.uid) * 1.2 * zoom;
          drawSprite(ctx, `beast:${b.defId}`, sx + shake, sy, zoom);
          drawSprite(ctx, 'fx:beast', sx, sy - 48 * zoom + bob * zoom, zoom);
        },
      });
    }

    for (const w of scene.weeds) {
      const sx = camera.sx(isoX(w.x, w.y));
      const sy = camera.sy(isoY(w.x, w.y));
      items.push({ depth: w.x + w.y, draw: () => drawSprite(ctx, 'weed', sx, sy, zoom) });
    }

    for (const p of scene.pets) {
      const sx = camera.sx(isoX(p.x, p.y));
      const sy = camera.sy(isoY(p.x, p.y) + TILE_H / 2);
      items.push({
        depth: p.x + p.y,
        draw: () => drawSprite(ctx, `pet:${p.defId}`, sx, sy + Math.abs(Math.sin(now / 300 + p.x)) * -2.4 * zoom, zoom),
      });
    }

    for (const actor of scene.actors) {
      const sx = camera.sx(isoX(actor.x, actor.y));
      const sy = camera.sy(isoY(actor.x, actor.y) + TILE_H / 2);
      const frame = actor.walking ? Math.floor(now / 90) % 8 : -1;
      items.push({
        depth: actor.x + actor.y + 0.01,
        draw: () => {
          drawSprite(ctx, charKey(actor.avatar, frame), sx, sy, zoom);
          if (actor.name) {
            ctx.font = `${Math.round(11 * zoom)}px "Segoe UI", sans-serif`;
            ctx.textAlign = 'center';
            const tw = ctx.measureText(actor.name).width;
            ctx.fillStyle = 'rgba(40, 34, 28, 0.55)';
            ctx.fillRect(sx - tw / 2 - 4, sy - 76 * zoom, tw + 8, 14 * zoom);
            ctx.fillStyle = '#fff';
            ctx.fillText(actor.name, sx, sy - 76 * zoom + 11 * zoom);
            ctx.textAlign = 'start';
          }
        },
      });
    }

    // 摆放虚影
    if (scene.ghost) {
      const def = buildingDef(scene.ghost.defId);
      const g = scene.ghost;
      for (let dy = 0; dy < def.h; dy++) {
        for (let dx = 0; dx < def.w; dx++) {
          const sx = camera.sx(isoX(g.tx + dx, g.ty + dy));
          const sy = camera.sy(isoY(g.tx + dx, g.ty + dy));
          drawSprite(ctx, `hl:${g.ok ? 'ok' : 'bad'}`, sx, sy, zoom);
        }
      }
      const cx = g.tx + (def.w - 1) / 2;
      const cy = g.ty + (def.h - 1) / 2;
      items.push({
        depth: 9999,
        draw: () => {
          ctx.globalAlpha = 0.65;
          drawSprite(ctx, `bld:${g.defId}`, camera.sx(isoX(cx, cy)), camera.sy(isoY(cx, cy) + TILE_H / 2), zoom);
          ctx.globalAlpha = 1;
        },
      });
    }

    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw();

    // ---- 日夜色调
    const na = nightAlpha(now);
    if (na > 0.01) {
      ctx.fillStyle = `rgba(24, 34, 76, ${na})`;
      ctx.fillRect(0, 0, camera.viewW, camera.viewH);
      // 路灯/篝火光晕
      for (const pl of scene.placements) {
        if (pl.defId !== 'bld_streetlamp' && pl.defId !== 'bld_bonfire' && pl.defId !== 'bld_lighthouse') continue;
        const sx = camera.sx(isoX(pl.x, pl.y));
        const sy = camera.sy(isoY(pl.x, pl.y));
        const r = (pl.defId === 'bld_lighthouse' ? 110 : 70) * zoom;
        const grad = ctx.createRadialGradient(sx, sy - 30 * zoom, 6, sx, sy - 30 * zoom, r);
        grad.addColorStop(0, `rgba(255, 224, 130, ${na * 0.75})`);
        grad.addColorStop(1, 'rgba(255, 224, 130, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - r, sy - 30 * zoom - r, r * 2, r * 2);
      }
    }
  }

  centerOnIsland(scene: RenderScene): void {
    const size = buildTerrain(scene.seed, scene.islandTier).length;
    this.camera.centerOnTile(size / 2 - 0.5, size / 2 - 0.5);
  }
}

export { TILE_W };
