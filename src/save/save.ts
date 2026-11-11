/**
 * 存档：localStorage 槽位 + JSON 导出/导入 + schema 版本迁移。
 * core 层不依赖本模块；测试直接调用 serialize/deserialize/migrate。
 */
import type { GameState } from '../core/types';
import { SAVE_VERSION, createNewGame, emptyStats } from '../core/state';
import { initNeighbors } from '../core/social';

export const SLOT_COUNT = 3;
const KEY_PREFIX = 'paradise-isle:save:';
const KEY_ACTIVE = 'paradise-isle:activeSlot';

export function serialize(state: GameState, now: number): string {
  state.savedAt = now;
  return JSON.stringify(state);
}

/**
 * 版本迁移链：每个函数把 vN 提升到 vN+1。
 * v1 → v2：补 pets/collections；v2 → v3：补 stats 新字段与 neighbors。
 */
type Migrator = (raw: Record<string, unknown>) => void;

const MIGRATIONS: Record<number, Migrator> = {
  1: (raw) => {
    if (!raw.pets) raw.pets = [];
    if (!raw.collections) raw.collections = { fish: {}, beasts: {} };
    raw.version = 2;
  },
  2: (raw) => {
    const stats = (raw.stats ?? {}) as Record<string, unknown>;
    const full = emptyStats() as unknown as Record<string, unknown>;
    for (const k of Object.keys(full)) {
      if (!(k in stats)) stats[k] = full[k];
    }
    raw.stats = stats;
    if (!raw.neighbors) raw.neighbors = [];
    raw.version = 3;
  },
};

export function migrate(raw: Record<string, unknown>): GameState {
  let v = Number(raw.version ?? 1);
  if (v > SAVE_VERSION) throw new Error(`save version ${v} is newer than game (${SAVE_VERSION})`);
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`no migration from v${v}`);
    step(raw);
    v = Number(raw.version);
  }
  return raw as unknown as GameState;
}

export function deserialize(json: string, now: number): GameState {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null || !raw.player) {
    throw new Error('not a valid save');
  }
  const state = migrate(raw);
  // 邻居为空（老档/异常）时重建
  initNeighbors(state, now);
  return state;
}

// ---------------------------------------------------------------- localStorage 封装

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined';
}

export function saveToSlot(state: GameState, slot: number, now: number): void {
  if (!storageAvailable()) return;
  localStorage.setItem(KEY_PREFIX + slot, serialize(state, now));
  localStorage.setItem(KEY_ACTIVE, String(slot));
}

export function loadFromSlot(slot: number, now: number): GameState | null {
  if (!storageAvailable()) return null;
  const json = localStorage.getItem(KEY_PREFIX + slot);
  if (!json) return null;
  try {
    return deserialize(json, now);
  } catch (err) {
    console.error('save corrupted:', err);
    return null;
  }
}

export interface SlotInfo {
  slot: number;
  name: string;
  level: number;
  coins: number;
  savedAt: number;
}

export function slotInfos(): (SlotInfo | null)[] {
  if (!storageAvailable()) return Array.from({ length: SLOT_COUNT }, () => null);
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const json = localStorage.getItem(KEY_PREFIX + i);
    if (!json) return null;
    try {
      const raw = JSON.parse(json) as GameState;
      return {
        slot: i,
        name: raw.player?.name ?? '?',
        level: raw.player?.level ?? 1,
        coins: raw.player?.coins ?? 0,
        savedAt: raw.savedAt ?? 0,
      };
    } catch {
      return null;
    }
  });
}

export function activeSlot(): number {
  if (!storageAvailable()) return 0;
  return Number(localStorage.getItem(KEY_ACTIVE) ?? 0);
}

export function deleteSlot(slot: number): void {
  if (!storageAvailable()) return;
  localStorage.removeItem(KEY_PREFIX + slot);
}

export function newGameInSlot(name: string, slot: number, now: number): GameState {
  const seed = (Math.floor(Math.random() * 0xffffffff) ^ now) >>> 0;
  const state = createNewGame(name, seed, now);
  saveToSlot(state, slot, now);
  return state;
}

/** 导出为可分享的 base64 字符串 */
export function exportSave(state: GameState, now: number): string {
  const json = serialize(state, now);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function importSave(b64: string, now: number): GameState {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const json = new TextDecoder().decode(bytes);
  return deserialize(json, now);
}
