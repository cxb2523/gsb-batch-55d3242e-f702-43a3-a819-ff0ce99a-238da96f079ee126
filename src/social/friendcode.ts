/**
 * 好友码：把小岛快照（地形档位/地块/摆放/形象/名字）编码成
 * 可复制粘贴的短字符串 —— LZW 压缩 + base64url。
 * 不需要服务器即可"互访"：把码发给朋友，对方粘贴即可参观你的岛。
 *
 * 版本标记：
 *   PI0. v1 原始 UTF-8 字节   PI1. v1 LZW（16 位码点）
 *   PI2. v2 原始 UTF-8 字节   PI3. v2 LZW —— v2 在 v1 基础上携带邻居岛快照
 * 旧版 PI0./PI1. 码仍可解码，邻居字段归一化为空数组。
 */
import type {
  AvatarConfig, BeastInstance, FarmPlot, GameState, NeighborState, Placement,
} from '../core/types';

/** 邻居岛的可参观状态快照（对应 NeighborState 的公开字段） */
export interface NeighborSnapshot {
  /** 邻居标识（NPC defId，如 npc_xxx） */
  defId: string;
  /** 好友度 */
  friendship: number;
  /** 地块（含作物状态） */
  plots: FarmPlot[];
  /** 杂草 */
  weeds: { uid: number; x: number; y: number }[];
  /** 野兽 */
  beasts: BeastInstance[];
  /** 摆放 */
  placements: Placement[];
  /** 上次惰性演化时间 */
  simulatedAt: number;
  /** 当日帮工次数 */
  helpedToday: number;
  /** 当日捣蛋次数 */
  prankedToday: number;
  /** 次数对应的日期（YYYY-MM-DD） */
  helpDay: string;
}

export interface IslandSnapshot {
  v: 1 | 2;
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
  /** v1 快照解码后归一化为空数组；v2 携带邻居岛的可参观状态 */
  neighbors: NeighborSnapshot[];
}

const SNAPSHOT_VERSION = 2;

export function takeSnapshot(state: GameState, beauty: number, now: number): IslandSnapshot {
  return {
    v: SNAPSHOT_VERSION,
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
    neighbors: state.neighbors.map(neighborSnapshot),
  };
}

function neighborSnapshot(ns: NeighborState): NeighborSnapshot {
  return {
    defId: ns.defId,
    friendship: ns.friendship,
    plots: ns.plots,
    weeds: ns.weeds.map((w) => ({ uid: w.uid, x: w.x, y: w.y })),
    beasts: ns.beasts,
    placements: ns.placements,
    simulatedAt: ns.simulatedAt,
    helpedToday: ns.helpedToday,
    prankedToday: ns.prankedToday,
    helpDay: ns.helpDay,
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

/** base64url 解码：空段或非法字符直接抛可读错误（atob 自身的报错不可读，这里先行拦截） */
function fromBase64Url(s: string): Uint8Array {
  if (s.length === 0) throw new Error('friend code: empty payload segment');
  if (!/^[A-Za-z0-9_-]+$/.test(s)) {
    throw new Error('friend code: payload is not valid base64url');
  }
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  let bin: string;
  try {
    bin = atob(b64 + pad);
  } catch {
    throw new Error('friend code: payload is not valid base64url');
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** 版本标记 → (版本号, 是否 LZW) */
const MARKERS = {
  PI0: { version: 1, lzw: false },
  PI1: { version: 1, lzw: true },
  PI2: { version: 2, lzw: false },
  PI3: { version: 2, lzw: true },
} as const;

type MarkerKey = keyof typeof MARKERS;

function matchMarker(trimmed: string): { key: MarkerKey; version: 1 | 2; lzw: boolean; segment: string } {
  const head = trimmed.slice(0, 4);
  const key = head.slice(0, 3) as MarkerKey;
  const entry = MARKERS[key];
  if (!entry || head.length < 4 || head[3] !== '.') {
    throw new Error(`friend code: unknown version marker '${head || trimmed.slice(0, 4)}'`);
  }
  return { key, version: entry.version, lzw: entry.lzw, segment: trimmed.slice(4) };
}

/** 快照 → 好友码（自动选 LZW 或原始编码中更短者；v2 使用 PI2./PI3. 新标记） */
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
  const magicLzw = snap.v === 2 ? 'PI3.' : 'PI1.';
  const magicRaw = snap.v === 2 ? 'PI2.' : 'PI0.';
  const lzw = magicLzw + toBase64Url(bytes);
  const raw = magicRaw + toBase64Url(utf8);
  return lzw.length <= raw.length ? lzw : raw;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 校验并归一化单个邻居条目；字段缺失/类型错误/计数为负均抛错，不返回半成品 */
function parseNeighbor(raw: unknown, index: number): NeighborSnapshot {
  const where = `friend code: neighbor entry #${index}`;
  if (!isRecord(raw)) throw new Error(`${where} is not an object`);
  const required = [
    'defId', 'friendship', 'plots', 'weeds', 'beasts', 'placements',
    'simulatedAt', 'helpedToday', 'prankedToday', 'helpDay',
  ] as const;
  for (const key of required) {
    if (!(key in raw)) throw new Error(`${where} is missing required field '${key}'`);
  }
  if (typeof raw.defId !== 'string') throw new Error(`${where}: 'defId' must be a string`);
  if (typeof raw.helpDay !== 'string') throw new Error(`${where}: 'helpDay' must be a string`);
  const numericFields = ['friendship', 'simulatedAt', 'helpedToday', 'prankedToday'] as const;
  for (const field of numericFields) {
    const value: unknown = raw[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${where}: '${field}' must be a number`);
    }
  }
  const helpedToday = raw.helpedToday as number;
  const prankedToday = raw.prankedToday as number;
  if (helpedToday < 0) throw new Error(`${where}: 'helpedToday' must not be negative`);
  if (prankedToday < 0) throw new Error(`${where}: 'prankedToday' must not be negative`);
  for (const field of ['plots', 'weeds', 'beasts', 'placements'] as const) {
    if (!Array.isArray(raw[field])) throw new Error(`${where}: '${field}' must be an array`);
  }
  return {
    defId: raw.defId,
    friendship: raw.friendship as number,
    plots: raw.plots as FarmPlot[],
    weeds: raw.weeds as NeighborSnapshot['weeds'],
    beasts: raw.beasts as BeastInstance[],
    placements: raw.placements as Placement[],
    simulatedAt: raw.simulatedAt as number,
    helpedToday,
    prankedToday,
    helpDay: raw.helpDay,
  };
}

/** 好友码 → 快照；格式错误抛可读异常，绝不返回半成品 */
export function decodeFriendCode(code: string): IslandSnapshot {
  const trimmed = code.trim();
  const marker = matchMarker(trimmed);

  let utf8: Uint8Array;
  if (marker.lzw) {
    const bytes = fromBase64Url(marker.segment);
    // LZW 码点按 16 位小端写入，字节数必须为偶数且非空
    if (bytes.length === 0) throw new Error('friend code: empty LZW payload');
    if (bytes.length % 2 !== 0) {
      throw new Error('friend code: LZW payload has an odd byte count');
    }
    const codes: number[] = [];
    for (let i = 0; i < bytes.length; i += 2) {
      codes.push(bytes[i] | (bytes[i + 1] << 8));
    }
    let latin1: string;
    try {
      latin1 = lzwDecode(codes);
    } catch {
      throw new Error('friend code: LZW stream is corrupted');
    }
    utf8 = new Uint8Array(latin1.length);
    for (let i = 0; i < latin1.length; i++) utf8[i] = latin1.charCodeAt(i);
  } else {
    utf8 = fromBase64Url(marker.segment);
  }

  const json = new TextDecoder().decode(utf8);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('friend code: payload is not valid JSON');
  }
  if (!isRecord(parsed)) throw new Error('friend code: payload JSON must be an object');
  if (parsed.v !== marker.version) {
    throw new Error(
      `friend code: version mismatch (marker '${marker.key}.' expects v${marker.version}, payload is v${String(parsed.v)})`,
    );
  }
  if (typeof parsed.seed !== 'number' || !Number.isFinite(parsed.seed)) {
    throw new Error('friend code: "seed" must be a number');
  }
  if (!Array.isArray(parsed.plots)) throw new Error('friend code: "plots" must be an array');

  if (marker.version === 1) {
    // 旧版 PI0./PI1. 不含邻居数据，归一化为空数组
    return { ...(parsed as unknown as IslandSnapshot), v: 1, neighbors: [] };
  }

  if (!Array.isArray(parsed.neighbors)) {
    throw new Error('friend code: v2 snapshot requires "neighbors" array');
  }
  const neighbors = parsed.neighbors.map((entry, i) => parseNeighbor(entry, i));
  return { ...(parsed as unknown as IslandSnapshot), v: 2, neighbors };
}
