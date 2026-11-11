/**
 * 特效与状态徽章：感叹号（饥饿/待处理）、对勾（可收获）、
 * 心、汗滴、Z、剑（野兽）、光斑等。画布 24×24。
 */
import { circle, heart, PAL, rrect, shade, star, tri, type Ctx } from './common';

export type FxKind =
  | 'ready'      // 可收获（绿对勾泡泡）
  | 'hungry'     // 饥饿（红感叹号泡泡）
  | 'beast'      // 野兽（剑）
  | 'heart'      // 爱心
  | 'sleep'      // Z
  | 'drop'       // 水滴
  | 'sparkle'    // 星光
  | 'coin';      // 金币

function bubble(ctx: Ctx, color: string): void {
  circle(ctx, 12, 11, 10, '#ffffff', shade(color, -0.1));
  tri(ctx, 9, 19.5, 15, 19.5, 12, 23.5, '#ffffff');
}

export function paintFx(ctx: Ctx, kind: FxKind): void {
  switch (kind) {
    case 'ready':
      bubble(ctx, '#6cbf6c');
      ctx.strokeStyle = '#3fa14b';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(7, 11);
      ctx.lineTo(11, 15);
      ctx.lineTo(17, 7);
      ctx.stroke();
      break;
    case 'hungry':
      bubble(ctx, '#e8425c');
      ctx.strokeStyle = '#d8382e';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(12, 5.5);
      ctx.lineTo(12, 12.5);
      ctx.stroke();
      circle(ctx, 12, 16.5, 1.8, '#d8382e');
      break;
    case 'beast':
      bubble(ctx, '#e0a03c');
      // 小剑
      ctx.save();
      ctx.translate(12, 11);
      ctx.rotate(Math.PI / 4);
      rrect(ctx, -1.5, -8, 3, 12, 1, '#aeb9c4', shade('#aeb9c4', -0.3));
      rrect(ctx, -4, 3.4, 8, 2.4, 1, '#c9a066');
      rrect(ctx, -1.4, 5.5, 2.8, 4, 1, '#8a6242');
      ctx.restore();
      break;
    case 'heart':
      heart(ctx, 12, 12, 9, '#f0637a');
      break;
    case 'sleep':
      ctx.fillStyle = '#7a8ab8';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('Z', 4, 14);
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('z', 13, 9);
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('z', 18, 6);
      break;
    case 'drop':
      ctx.beginPath();
      ctx.moveTo(12, 4);
      ctx.quadraticCurveTo(19, 13, 12, 19);
      ctx.quadraticCurveTo(5, 13, 12, 4);
      ctx.closePath();
      ctx.fillStyle = '#6fc8e8';
      ctx.fill();
      ctx.strokeStyle = shade('#6fc8e8', -0.25);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      circle(ctx, 9.5, 12, 1.6, 'rgba(255,255,255,0.7)');
      break;
    case 'sparkle':
      star(ctx, 12, 12, 8, '#ffe97a');
      star(ctx, 12, 12, 3.4, '#fffbe0');
      break;
    case 'coin':
      circle(ctx, 12, 12, 9, '#f2c018', shade('#f2c018', -0.3));
      circle(ctx, 12, 12, 6, shade('#f2c018', 0.12));
      ctx.fillStyle = shade('#f2c018', -0.35);
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 12, 12.5);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      break;
  }
}

export { PAL };
