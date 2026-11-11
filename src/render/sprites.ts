/**
 * 精灵缓存：按 key 惰性绘制并缓存离屏画布。
 * key 约定：
 *   tile:grass:3 / tile:sand:1 / tile:water:2:deep / tile:plot:wet
 *   crop:<cropId>:<stage>   animal:<defId>   beast:<defId>   pet:<defId>
 *   bld:<defId>             char:<avatarJson>:<walkFrame>
 *   fish:<fishId>           icon:<itemId>    fx:<kind>       weed / hl:ok / hl:bad
 */
import type { AvatarConfig, CropStage } from '../core/types';
import { buildingDef, cropDef, fishDef } from '../core/registry';
import { makeCanvas, SS } from './paint/common';
import { paintGrassTile, paintHighlight, paintPlotTile, paintSandTile, paintWaterTile, paintWeed, TILE_SPRITE_H } from './paint/terrain';
import { paintCrop } from './paint/plants';
import { paintAnimal, paintBeast, paintPet } from './paint/creatures';
import { buildingCanvasSize, paintBuilding } from './paint/buildings';
import { paintCharacter } from './paint/chars';
import { paintFishSide, paintItemIcon } from './paint/items';
import { paintFx, type FxKind } from './paint/fx';
import { TILE_W } from './iso';

export interface Sprite {
  img: CanvasImageSource;
  /** 逻辑尺寸（未乘 SS） */
  w: number;
  h: number;
  /** 锚点（相对左上角，逻辑像素）；渲染时对齐到目标点 */
  ax: number;
  ay: number;
}

const cache = new Map<string, Sprite>();

function build(key: string): Sprite {
  const parts = key.split(':');
  const kind = parts[0];

  const make = (w: number, h: number, ax: number, ay: number, paint: (ctx: CanvasRenderingContext2D) => void): Sprite => {
    const { canvas, ctx } = makeCanvas(w, h);
    paint(ctx);
    return { img: canvas as CanvasImageSource, w, h, ax, ay };
  };

  switch (kind) {
    case 'tile': {
      const sub = parts[1];
      if (sub === 'plot') {
        return make(TILE_W, TILE_SPRITE_H, TILE_W / 2, 16, (ctx) => paintPlotTile(ctx, parts[2] === 'wet'));
      }
      const variant = Number(parts[2] ?? 0);
      return make(TILE_W, TILE_SPRITE_H, TILE_W / 2, 16, (ctx) => {
        if (sub === 'grass') paintGrassTile(ctx, variant);
        else if (sub === 'sand') paintSandTile(ctx, variant);
        else paintWaterTile(ctx, variant, parts[3] === 'deep');
      });
    }
    case 'hl':
      return make(TILE_W, TILE_SPRITE_H, TILE_W / 2, 16, (ctx) => paintHighlight(ctx, parts[1] === 'ok'));
    case 'weed':
      return make(TILE_W, TILE_SPRITE_H, TILE_W / 2, 16, (ctx) => paintWeed(ctx));
    case 'crop': {
      const def = cropDef(parts[1]);
      const stage = parts[2] as CropStage;
      return make(64, 72, 32, 64, (ctx) => paintCrop(ctx, def, stage));
    }
    case 'animal':
      return make(56, 64, 28, 58, (ctx) => paintAnimal(ctx, parts[1]));
    case 'beast':
      return make(56, 64, 28, 58, (ctx) => paintBeast(ctx, parts[1]));
    case 'pet':
      return make(56, 64, 28, 58, (ctx) => paintPet(ctx, parts[1]));
    case 'bld': {
      const def = buildingDef(parts[1]);
      const size = buildingCanvasSize(def);
      return make(size.w, size.h, size.ax, size.ay, (ctx) => paintBuilding(ctx, def));
    }
    case 'char': {
      const avatar = JSON.parse(parts.slice(1, -1).join(':')) as AvatarConfig;
      const walkFrame = Number(parts[parts.length - 1]);
      return make(48, 68, 24, 64, (ctx) =>
        paintCharacter(ctx, avatar, { walk: walkFrame < 0 ? undefined : walkFrame / 8 }),
      );
    }
    case 'fish':
      return make(48, 32, 24, 16, (ctx) => paintFishSide(ctx, fishDef(parts[1])));
    case 'icon':
      return make(32, 32, 16, 16, (ctx) => paintItemIcon(ctx, parts[1]));
    case 'fx':
      return make(24, 24, 12, 22, (ctx) => paintFx(ctx, parts[1] as FxKind));
    default:
      return make(24, 24, 12, 12, (ctx) => paintFx(ctx, 'sparkle'));
  }
}

export function getSprite(key: string): Sprite {
  let s = cache.get(key);
  if (!s) {
    s = build(key);
    cache.set(key, s);
  }
  return s;
}

export function charKey(avatar: AvatarConfig, walkFrame = -1): string {
  return `char:${JSON.stringify(avatar)}:${walkFrame}`;
}

/** 绘制精灵：把锚点对齐到 (x, y)，可选缩放 */
export function drawSprite(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, scale = 1): void {
  const s = getSprite(key);
  ctx.drawImage(
    s.img as CanvasImageSource,
    0, 0, s.w * SS, s.h * SS,
    x - s.ax * scale, y - s.ay * scale, s.w * scale, s.h * scale,
  );
}

/** 生成 dataURL 供 DOM UI 使用（背包图标等） */
const urlCache = new Map<string, string>();
export function spriteDataUrl(key: string): string {
  let url = urlCache.get(key);
  if (!url) {
    const s = getSprite(key);
    const canvas = s.img as HTMLCanvasElement;
    url = canvas.toDataURL ? canvas.toDataURL() : '';
    urlCache.set(key, url);
  }
  return url;
}

export function clearSpriteCache(): void {
  cache.clear();
  urlCache.clear();
}
