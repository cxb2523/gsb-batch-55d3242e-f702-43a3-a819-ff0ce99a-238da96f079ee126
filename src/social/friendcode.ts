/**
 * 好友码：把小岛快照（地形档位/地块/摆放/形象/名字）编码成
 * 可复制粘贴的短字符串 —— LZW 压缩 + base64url。
 * 不需要服务器即可"互访"：把码发给朋友，对方粘贴即可参观你的岛。
 */
import type { AvatarConfig, FarmPlot, GameState, Placement } from '../core/types';

export interface IslandSnapshot {
  v: 1;
  name: string;
  level: number;
  seed: number;
  islandTier: number;
  beauty: number;
  avatar: AvatarConfig;
  plots: FarmPlot[];
  placements: Placement[];
  animals: { defId: string; x: number; y: number }[];
  pets: { defId: string; name: string }[];
  takenAt: number;
}

export function takeSnapshot(state: GameState, beauty: number, now: number): IslandSnapshot {
  return {
    v: 1,
    name: state.player.name,
    level: state.player.level,
    seed: state.seed,
    islandTier: state.islandTier,
    beauty,
    avatar: state.player.avatar,
    plots: state.plots,
    placements: state.placements,
    animals: state.animals.map((a) => ({ defId: a.defId, x: a.x, y: a.y })),
    pets: state.pets.map((p) => ({ defId: p.defId, name: p.name })),
    takenAt: now,
  };
}

// ---------------------------------------------------------------- LZW

/** LZW 压缩到码点数组（字典上限 0xFFFF，足够快照体量） */
function lzwEncode(input: string): number[] {
  const dict = new Map<string, number>();
  for (let i = 0; i < 256; i++) dict.set(String.fromCharCode(i), i);
  let next = 256;
  const out: number[] = [];
  let w = '';
  for (const ch of input) {
    const wc = w + ch;
    if (dict.has(wc)) {
      w = wc;
    } else {
      out.push(dict.get(w)!);
      if (next < 0xffff) dict.set(wc, next++);
      w = ch;
    }
  }
  if (w) out.push(dict.get(w)!);
  return out;
}

function lzwDecode(codes: number[]): string {
  const dict: string[] = [];
  for (let i = 0; i < 256; i++) dict.push(String.fromCharCode(i));
  let w = dict[codes[0]];
  let out = w;
  for (let i = 1; i < codes.length; i++) {
    const k = codes[i];
    const entry = k < dict.length ? dict[k] : w + w[0];
    out += entry;
    if (dict.length < 0xffff) dict.push(w + entry[0]);
    w = entry;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const MAGIC_LZW = 'PI1.';
const MAGIC_RAW = 'PI0.'; // 小负载时 LZW（16位码点）反而更大，用原始字节兜底

/** 快照 → 好友码（自动选 LZW 或原始编码中更短者） */
export function encodeFriendCode(snap: IslandSnapshot): string {
  const json = JSON.stringify(snap);
  // JSON 先转 UTF-8 字节流的 latin1 表达，保证 LZW 字典均为单字节字符
  const utf8 = new TextEncoder().encode(json);
  let latin1 = '';
  for (const b of utf8) latin1 += String.fromCharCode(b);
  const codes = lzwEncode(latin1);
  // 码点按 16 位小端写入
  const bytes = new Uint8Array(codes.length * 2);
  codes.forEach((c, i) => {
    bytes[i * 2] = c & 0xff;
    bytes[i * 2 + 1] = c >> 8;
  });
  const lzw = MAGIC_LZW + toBase64Url(bytes);
  const raw = MAGIC_RAW + toBase64Url(utf8);
  return lzw.length <= raw.length ? lzw : raw;
}

/** 好友码 → 快照；格式错误抛异常 */
export function decodeFriendCode(code: string): IslandSnapshot {
  const trimmed = code.trim();
  let utf8: Uint8Array;
  if (trimmed.startsWith(MAGIC_LZW)) {
    const bytes = fromBase64Url(trimmed.slice(MAGIC_LZW.length));
    if (bytes.length % 2 !== 0 || bytes.length === 0) throw new Error('bad friend code');
    const codes: number[] = [];
    for (let i = 0; i < bytes.length; i += 2) {
      codes.push(bytes[i] | (bytes[i + 1] << 8));
    }
    const latin1 = lzwDecode(codes);
    utf8 = new Uint8Array(latin1.length);
    for (let i = 0; i < latin1.length; i++) utf8[i] = latin1.charCodeAt(i);
  } else if (trimmed.startsWith(MAGIC_RAW)) {
    utf8 = fromBase64Url(trimmed.slice(MAGIC_RAW.length));
    if (utf8.length === 0) throw new Error('bad friend code');
  } else {
    throw new Error('bad friend code');
  }
  const json = new TextDecoder().decode(utf8);
  const snap = JSON.parse(json) as IslandSnapshot;
  if (snap.v !== 1 || typeof snap.seed !== 'number' || !Array.isArray(snap.plots)) {
    throw new Error('bad friend code payload');
  }
  return snap;
}
