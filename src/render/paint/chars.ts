/**
 * 纸娃娃角色：Q 版三头身，画布 48×68，锚点底部中心 (24, 64)。
 * 分层绘制：身体(肤色) → 下装 → 上装 → 头 → 表情 → 头发 → 帽子 → 配饰。
 * 每层的样式与颜色来自 ClothingDef.paint。
 */
import type { AvatarConfig } from '../../core/types';
import { clothingDef } from '../../core/registry';
import { circle, dotEye, ellipse, leafShape, PAL, rrect, shade, softShadow, tri, type Ctx } from './common';

const AX = 24;
const AY = 64;
// 身体比例
const HEAD_R = 11;
const HEAD_CY = AY - 34;
const BODY_TOP = AY - 24;
const BODY_H = 16;
const LEG_H = 8;

function paintOf(id: string | null): Record<string, string> {
  if (!id) return {};
  try {
    return clothingDef(id).paint;
  } catch {
    return {};
  }
}

export function paintCharacter(ctx: Ctx, avatar: AvatarConfig, opts: { walk?: number } = {}): void {
  const skin = paintOf(avatar.skin).color ?? '#ffe0c2';
  const hairP = paintOf(avatar.hair);
  const faceP = paintOf(avatar.face);
  const topP = paintOf(avatar.top);
  const bottomP = paintOf(avatar.bottom);
  const hatP = avatar.hat ? paintOf(avatar.hat) : null;
  const accP = avatar.accessory ? paintOf(avatar.accessory) : null;

  const walkPhase = opts.walk ?? -1;
  const legSwing = walkPhase >= 0 ? Math.sin(walkPhase * Math.PI * 2) * 3 : 0;

  softShadow(ctx, AX, AY, 11, 4);

  // ---- 腿（下装颜色的短腿）
  const legColor = bottomP.color ?? '#d9c49a';
  ctx.lineCap = 'round';
  ctx.strokeStyle = legColor;
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(AX - 4, AY - LEG_H - 2);
  ctx.lineTo(AX - 4 + legSwing, AY - 1);
  ctx.moveTo(AX + 4, AY - LEG_H - 2);
  ctx.lineTo(AX + 4 - legSwing, AY - 1);
  ctx.stroke();
  // 鞋
  ellipse(ctx, AX - 4 + legSwing, AY - 1, 3.4, 2.2, '#8a6242');
  ellipse(ctx, AX + 4 - legSwing, AY - 1, 3.4, 2.2, '#8a6242');

  // ---- 下装（短裤/裙）
  const bottomStyle = avatar.bottom.includes('skirt') || avatar.bottom.includes('grass') ? 'skirt' : 'shorts';
  if (bottomStyle === 'skirt') {
    tri(ctx, AX - 9, BODY_TOP + BODY_H, AX + 9, BODY_TOP + BODY_H, AX, BODY_TOP + 6, legColor, shade(legColor, -0.25));
    if (avatar.bottom.includes('grass')) {
      ctx.strokeStyle = shade(legColor, -0.3);
      ctx.lineWidth = 1.4;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(AX + i * 2.4, BODY_TOP + 10);
        ctx.lineTo(AX + i * 2.8, BODY_TOP + BODY_H);
        ctx.stroke();
      }
    }
  } else {
    rrect(ctx, AX - 7.5, BODY_TOP + BODY_H - 6, 15, 6, 2.5, legColor, shade(legColor, -0.25));
  }

  // ---- 上身
  const topColor = topP.color ?? '#5aa7e0';
  const accent = topP.accent ?? '#ffffff';
  const topStyle = topP.style ?? 'tee';
  rrect(ctx, AX - 8.5, BODY_TOP, 17, BODY_H - 4, 5, topColor, shade(topColor, -0.28));
  // 手臂
  ctx.strokeStyle = topColor;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(AX - 8, BODY_TOP + 3);
  ctx.lineTo(AX - 11 - legSwing * 0.5, BODY_TOP + 11);
  ctx.moveTo(AX + 8, BODY_TOP + 3);
  ctx.lineTo(AX + 11 + legSwing * 0.5, BODY_TOP + 11);
  ctx.stroke();
  // 手
  circle(ctx, AX - 11 - legSwing * 0.5, BODY_TOP + 13, 2.6, skin);
  circle(ctx, AX + 11 + legSwing * 0.5, BODY_TOP + 13, 2.6, skin);
  // 上装风格细节
  switch (topStyle) {
    case 'tang':
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(AX, BODY_TOP + 1);
      ctx.lineTo(AX, BODY_TOP + BODY_H - 5);
      ctx.stroke();
      for (const dy of [3, 7]) {
        ctx.beginPath();
        ctx.moveTo(AX - 3.4, BODY_TOP + dy);
        ctx.lineTo(AX + 3.4, BODY_TOP + dy);
        ctx.stroke();
      }
      break;
    case 'school':
      // 水手领
      tri(ctx, AX - 7, BODY_TOP, AX + 7, BODY_TOP, AX, BODY_TOP + 6.5, accent, shade(topColor, -0.3));
      rrect(ctx, AX - 1.4, BODY_TOP + 4, 2.8, 4.5, 1, '#d1574d');
      break;
    case 'suit':
      tri(ctx, AX - 5, BODY_TOP, AX + 5, BODY_TOP, AX, BODY_TOP + 7, accent);
      rrect(ctx, AX - 1.2, BODY_TOP + 1, 2.4, 6, 1, '#c9473c');
      circle(ctx, AX - 4, BODY_TOP + 7, 0.8, shade(topColor, -0.4));
      break;
    case 'swim':
      for (const [dx, dy] of [[-4, 4], [3, 7], [-1, 9]] as const) {
        circle(ctx, AX + dx, BODY_TOP + dy, 1.2, accent);
      }
      break;
    case 'hawaii':
      for (const [dx, dy] of [[-4, 3], [4, 5], [-2, 8], [5, 9]] as const) {
        circle(ctx, AX + dx, BODY_TOP + dy, 1.8, accent);
        circle(ctx, AX + dx, BODY_TOP + dy, 0.8, '#fef8ec');
      }
      break;
    case 'hoodie':
      // 兜帽绳与口袋
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(AX - 2.4, BODY_TOP + 1);
      ctx.lineTo(AX - 2.4, BODY_TOP + 5);
      ctx.moveTo(AX + 2.4, BODY_TOP + 1);
      ctx.lineTo(AX + 2.4, BODY_TOP + 5);
      ctx.stroke();
      rrect(ctx, AX - 4.5, BODY_TOP + 7.5, 9, 4, 1.6, shade(topColor, -0.1), shade(topColor, -0.3));
      break;
    case 'pirate':
      // 交叉皮带 + 金扣
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(AX - 7, BODY_TOP + 1);
      ctx.lineTo(AX + 7, BODY_TOP + BODY_H - 6);
      ctx.stroke();
      circle(ctx, AX, BODY_TOP + 6, 1.6, '#f2c018');
      break;
    case 'kimono': {
      // 衣襟 + 腰带
      ctx.strokeStyle = shade(topColor, -0.25);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(AX - 4, BODY_TOP);
      ctx.lineTo(AX + 3, BODY_TOP + 8);
      ctx.stroke();
      rrect(ctx, AX - 8.5, BODY_TOP + 7, 17, 3.6, 1, topP.accent ?? '#a24a63');
      circle(ctx, AX - 5, BODY_TOP + 3, 1.4, '#fef8ec');
      break;
    }
    case 'royal':
      rrect(ctx, AX - 8.5, BODY_TOP, 17, 3.4, 1.6, accent);
      for (const dx of [-5, 0, 5]) circle(ctx, AX + dx, BODY_TOP + 8, 1.2, accent);
      break;
    default: // tee
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(AX - 4, BODY_TOP + 2.4);
      ctx.quadraticCurveTo(AX, BODY_TOP + 4.6, AX + 4, BODY_TOP + 2.4);
      ctx.stroke();
  }

  // ---- 头
  circle(ctx, AX, HEAD_CY, HEAD_R, skin, shade(skin, -0.22));

  // ---- 表情
  const faceStyle = faceP.style ?? 'smile';
  const eyeY = HEAD_CY + 0.5;
  switch (faceStyle) {
    case 'wink':
      dotEye(ctx, AX - 4.2, eyeY, 1.9);
      ctx.strokeStyle = '#33281f';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(AX + 2.6, eyeY);
      ctx.lineTo(AX + 6, eyeY);
      ctx.stroke();
      smileMouth(ctx);
      break;
    case 'happy': {
      arcEye(ctx, AX - 4.2, eyeY);
      arcEye(ctx, AX + 4.2, eyeY);
      // 张嘴笑
      ctx.beginPath();
      ctx.arc(AX, HEAD_CY + 4.5, 3, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = '#8a4a42';
      ctx.fill();
      break;
    }
    case 'cool':
      ctx.strokeStyle = '#33281f';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(AX - 6.5, eyeY - 2.4);
      ctx.lineTo(AX - 2, eyeY - 1.4);
      ctx.moveTo(AX + 6.5, eyeY - 2.4);
      ctx.lineTo(AX + 2, eyeY - 1.4);
      ctx.stroke();
      dotEye(ctx, AX - 4.2, eyeY + 0.5, 1.7);
      dotEye(ctx, AX + 4.2, eyeY + 0.5, 1.7);
      flatMouth(ctx);
      break;
    case 'shy':
      dotEye(ctx, AX - 4.2, eyeY, 1.9);
      dotEye(ctx, AX + 4.2, eyeY, 1.9);
      ellipse(ctx, AX - 6.5, HEAD_CY + 3.4, 2.2, 1.3, 'rgba(240, 120, 120, 0.55)');
      ellipse(ctx, AX + 6.5, HEAD_CY + 3.4, 2.2, 1.3, 'rgba(240, 120, 120, 0.55)');
      smallMouth(ctx);
      break;
    case 'cat': {
      dotEye(ctx, AX - 4.2, eyeY, 1.9);
      dotEye(ctx, AX + 4.2, eyeY, 1.9);
      // ω 嘴
      ctx.strokeStyle = '#8a4a42';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(AX - 1.7, HEAD_CY + 4.5, 1.7, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(AX + 1.7, HEAD_CY + 4.5, 1.7, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      break;
    }
    default:
      dotEye(ctx, AX - 4.2, eyeY, 1.9);
      dotEye(ctx, AX + 4.2, eyeY, 1.9);
      smileMouth(ctx);
  }

  // ---- 头发
  const hairColor = hairP.color ?? '#7a4a2b';
  const hairStyle = hairP.style ?? 'short';
  paintHair(ctx, hairStyle, hairColor);

  // ---- 帽子
  if (hatP) paintHat(ctx, hatP.style ?? 'straw', hatP.color ?? '#e0c27e');

  // ---- 配饰
  if (accP) paintAccessory(ctx, accP.style ?? 'scarf', accP.color ?? '#cf4a3f');
}

function smileMouth(ctx: Ctx): void {
  ctx.strokeStyle = '#8a4a42';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(AX, HEAD_CY + 3.4, 2.6, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
}

function smallMouth(ctx: Ctx): void {
  ctx.strokeStyle = '#8a4a42';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(AX, HEAD_CY + 4.2, 1.4, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
}

function flatMouth(ctx: Ctx): void {
  ctx.strokeStyle = '#8a4a42';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(AX - 2, HEAD_CY + 5);
  ctx.lineTo(AX + 2.4, HEAD_CY + 5);
  ctx.stroke();
}

function arcEye(ctx: Ctx, x: number, y: number): void {
  ctx.strokeStyle = '#33281f';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(x, y + 1, 2.2, 1.15 * Math.PI, 1.85 * Math.PI);
  ctx.stroke();
}

function paintHair(ctx: Ctx, style: string, color: string): void {
  const dark = shade(color, -0.2);
  switch (style) {
    case 'long':
      // 披肩长发
      ctx.beginPath();
      ctx.arc(AX, HEAD_CY - 1.5, HEAD_R + 1.2, Math.PI * 0.95, Math.PI * 2.05);
      ctx.quadraticCurveTo(AX + HEAD_R + 3, HEAD_CY + 12, AX + HEAD_R - 3, HEAD_CY + 15);
      ctx.lineTo(AX + HEAD_R - 7, HEAD_CY + 6);
      ctx.lineTo(AX - HEAD_R + 7, HEAD_CY + 6);
      ctx.lineTo(AX - HEAD_R + 3, HEAD_CY + 15);
      ctx.quadraticCurveTo(AX - HEAD_R - 3, HEAD_CY + 12, AX - HEAD_R - 1.2, HEAD_CY - 1.5);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      fringe(ctx, color);
      break;
    case 'pony': {
      capHair(ctx, color, dark);
      // 高马尾
      ellipse(ctx, AX + HEAD_R - 1, HEAD_CY - 8, 3.4, 4, color, dark);
      ctx.beginPath();
      ctx.moveTo(AX + HEAD_R - 1, HEAD_CY - 6);
      ctx.quadraticCurveTo(AX + HEAD_R + 6, HEAD_CY + 2, AX + HEAD_R + 2, HEAD_CY + 12);
      ctx.quadraticCurveTo(AX + HEAD_R - 2, HEAD_CY + 6, AX + HEAD_R - 3, HEAD_CY - 2);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.stroke();
      break;
    }
    case 'curly':
      capHair(ctx, color, dark);
      for (const [dx, dy] of [[-HEAD_R + 1, 2], [HEAD_R - 1, 2], [-HEAD_R + 3, 7], [HEAD_R - 3, 7]] as const) {
        circle(ctx, AX + dx, HEAD_CY + dy, 3.2, color, dark);
      }
      break;
    case 'spiky':
      capHair(ctx, color, dark);
      for (let i = -2; i <= 2; i++) {
        tri(ctx, AX + i * 4 - 2.4, HEAD_CY - HEAD_R + 2, AX + i * 4 + 2.4, HEAD_CY - HEAD_R + 2,
          AX + i * 5, HEAD_CY - HEAD_R - 5 - (2 - Math.abs(i)), color, dark);
      }
      break;
    case 'buns':
      capHair(ctx, color, dark);
      circle(ctx, AX - HEAD_R + 1, HEAD_CY - HEAD_R + 3, 4.2, color, dark);
      circle(ctx, AX + HEAD_R - 1, HEAD_CY - HEAD_R + 3, 4.2, color, dark);
      break;
    default: // short
      capHair(ctx, color, dark);
      fringe(ctx, color);
  }
}

/** 基础发盖 */
function capHair(ctx: Ctx, color: string, dark: string): void {
  ctx.beginPath();
  ctx.arc(AX, HEAD_CY - 1.5, HEAD_R + 1.2, Math.PI * 0.92, Math.PI * 2.08);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/** 刘海小尖 */
function fringe(ctx: Ctx, color: string): void {
  for (const dx of [-6, -1, 4]) {
    tri(ctx, AX + dx, HEAD_CY - 6.5, AX + dx + 4.5, HEAD_CY - 6.5, AX + dx + 2.2, HEAD_CY - 2.5, color);
  }
}

function paintHat(ctx: Ctx, style: string, color: string): void {
  const dark = shade(color, -0.25);
  const topY = HEAD_CY - HEAD_R;
  switch (style) {
    case 'straw':
      ellipse(ctx, AX, topY + 2, HEAD_R + 6, 4.5, color, dark);
      ctx.beginPath();
      ctx.arc(AX, topY + 1.5, HEAD_R - 2.5, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.stroke();
      rrect(ctx, AX - (HEAD_R - 2.5), topY - 1, (HEAD_R - 2.5) * 2, 2.6, 1, '#d1574d');
      break;
    case 'cap':
      ctx.beginPath();
      ctx.arc(AX, topY + 2.5, HEAD_R - 1, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ellipse(ctx, AX + HEAD_R - 3, topY + 3, 6, 2, color, dark);
      circle(ctx, AX, topY - 4.5, 1.6, dark);
      break;
    case 'flower':
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        const px = AX + Math.cos(a) * (HEAD_R - 0.5);
        const py = topY + 4 + Math.sin(a) * 4;
        circle(ctx, px, py, 2.4, i % 2 ? color : '#fef8ec');
        circle(ctx, px, py, 1, '#f2c018');
      }
      break;
    case 'pirate':
      ctx.beginPath();
      ctx.moveTo(AX - HEAD_R - 5, topY + 4);
      ctx.quadraticCurveTo(AX, topY - 10, AX + HEAD_R + 5, topY + 4);
      ctx.quadraticCurveTo(AX + HEAD_R + 1, topY + 1, AX, topY + 1.5);
      ctx.quadraticCurveTo(AX - HEAD_R - 1, topY + 1, AX - HEAD_R - 5, topY + 4);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // 骷髅标志（可爱版：圆点+叉）
      circle(ctx, AX, topY - 2, 2.2, '#fef8ec');
      break;
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(AX - 6, topY + 2);
      ctx.lineTo(AX - 6, topY - 4);
      ctx.lineTo(AX - 3, topY - 1);
      ctx.lineTo(AX, topY - 5.5);
      ctx.lineTo(AX + 3, topY - 1);
      ctx.lineTo(AX + 6, topY - 4);
      ctx.lineTo(AX + 6, topY + 2);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      circle(ctx, AX, topY - 0.5, 1.2, '#e8425c');
      break;
    case 'shark': {
      // 鲨鱼头套
      ctx.beginPath();
      ctx.arc(AX, HEAD_CY - 2, HEAD_R + 2.4, Math.PI * 0.85, Math.PI * 2.15);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      tri(ctx, AX - 3, topY - 3, AX + 3, topY - 3, AX, topY - 11, color, dark);
      // 牙
      for (const dx of [-7, -2.5, 2, 6.5]) {
        tri(ctx, AX + dx, HEAD_CY - 5, AX + dx + 3, HEAD_CY - 5, AX + dx + 1.5, HEAD_CY - 1.5, '#fef8ec');
      }
      break;
    }
  }
}

function paintAccessory(ctx: Ctx, style: string, color: string): void {
  switch (style) {
    case 'scarf':
      rrect(ctx, AX - 8, BODY_TOP - 2.4, 16, 4.6, 2, color, shade(color, -0.25));
      rrect(ctx, AX + 2, BODY_TOP + 1, 4.5, 9, 2, color, shade(color, -0.25));
      break;
    case 'glasses':
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(AX - 4.2, HEAD_CY + 0.5, 3.4, 0, Math.PI * 2);
      ctx.moveTo(AX + 7.6, HEAD_CY + 0.5);
      ctx.arc(AX + 4.2, HEAD_CY + 0.5, 3.4, 0, Math.PI * 2);
      ctx.moveTo(AX - 0.8, HEAD_CY + 0.5);
      ctx.lineTo(AX + 0.8, HEAD_CY + 0.5);
      ctx.stroke();
      break;
    case 'necklace':
      ctx.strokeStyle = '#c9b48a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(AX, BODY_TOP - 1, 5.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      tri(ctx, AX - 2, BODY_TOP + 3.4, AX + 2, BODY_TOP + 3.4, AX, BODY_TOP + 7, color, shade(color, -0.25));
      break;
    case 'wings':
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(AX + side * 8, BODY_TOP + 2);
        ctx.quadraticCurveTo(AX + side * 20, BODY_TOP - 8, AX + side * 16, BODY_TOP + 8);
        ctx.quadraticCurveTo(AX + side * 12, BODY_TOP + 10, AX + side * 8, BODY_TOP + 6);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = shade(color, -0.2);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      break;
    case 'parrot':
      // 肩上小鹦鹉
      ellipse(ctx, AX + 11, BODY_TOP - 1, 4, 5, color, shade(color, -0.3));
      circle(ctx, AX + 11, BODY_TOP - 7, 3.2, color, shade(color, -0.3));
      tri(ctx, AX + 13.5, BODY_TOP - 7.5, AX + 13.5, BODY_TOP - 5.5, AX + 16, BODY_TOP - 6.5, '#f0a03c');
      dotEye(ctx, AX + 10, BODY_TOP - 7.5, 1.2);
      leafShape(ctx, AX + 8, BODY_TOP + 2, 6, 2, 2.6, '#e8425c');
      break;
  }
}

export { PAL };
