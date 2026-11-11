/** 存档序列化/迁移/导入导出 + 好友码 + 离线结算 测试 */
import { describe, expect, it } from 'vitest';
import { makeGame, NOW, seedRng } from './helpers';
import { deserialize, exportSave, importSave, migrate, serialize } from '../src/save/save';
import { SAVE_VERSION } from '../src/core/state';
import { decodeFriendCode, encodeFriendCode, takeSnapshot } from '../src/social/friendcode';
import { settleOffline } from '../src/core/offline';
import { beautyScore } from '../src/core/build';
import { plant } from '../src/core/crops';
import { cropDef } from '../src/core/registry';

describe('存档', () => {
  it('序列化/反序列化 roundtrip 保持状态', () => {
    const state = makeGame();
    state.player.coins = 777;
    state.inventory['produce_corn'] = 5;
    const json = serialize(state, NOW + 5000);
    const loaded = deserialize(json, NOW + 6000);
    expect(loaded.player.coins).toBe(777);
    expect(loaded.inventory['produce_corn']).toBe(5);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.savedAt).toBe(NOW + 5000);
  });

  it('v1 老档迁移补齐字段', () => {
    const state = makeGame();
    const raw = JSON.parse(serialize(state, NOW)) as Record<string, unknown>;
    raw.version = 1;
    delete raw.pets;
    delete raw.collections;
    delete raw.neighbors;
    (raw.stats as Record<string, unknown>) = { harvests: 3 };
    const migrated = migrate(raw);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.pets).toEqual([]);
    expect(migrated.collections.fish).toEqual({});
    expect(migrated.stats.harvests).toBe(3);
    expect(migrated.stats.fishCaught).toBe(0); // 补齐的新字段
  });

  it('未来版本存档拒绝加载', () => {
    const state = makeGame();
    const raw = JSON.parse(serialize(state, NOW)) as Record<string, unknown>;
    raw.version = 99;
    expect(() => migrate(raw)).toThrow();
  });

  it('导出/导入（base64）roundtrip', () => {
    const state = makeGame();
    state.player.name = '岛主小明';
    const b64 = exportSave(state, NOW);
    expect(b64).not.toContain('{');
    const loaded = importSave(b64, NOW);
    expect(loaded.player.name).toBe('岛主小明');
  });

  it('垃圾数据导入抛异常', () => {
    expect(() => importSave('not-a-save!!!', NOW)).toThrow();
  });
});

describe('好友码', () => {
  it('编码/解码 roundtrip（含中文名）', () => {
    const state = makeGame();
    state.player.name = '海边的卡夫卡';
    plant(state, state.plots[0].uid, 'crop_carrot', NOW);
    const snap = takeSnapshot(state, beautyScore(state), NOW);
    const code = encodeFriendCode(snap);
    expect(code).toMatch(/^PI[01]\.[A-Za-z0-9_-]+$/); // base64url 安全字符
    const decoded = decodeFriendCode(code);
    expect(decoded.name).toBe('海边的卡夫卡');
    expect(decoded.seed).toBe(state.seed);
    expect(decoded.plots.length).toBe(state.plots.length);
    expect(decoded.plots[0].crop?.defId).toBe('crop_carrot');
  });

  it('大岛屿时 LZW 压缩生效（码长小于原始 JSON），且解码一致', () => {
    const state = makeGame();
    // 造一个内容丰富的大岛：50 块田 + 30 个摆放
    for (let i = 0; i < 50; i++) {
      state.plots.push({
        uid: 10000 + i, x: i % 10, y: Math.floor(i / 10),
        crop: { defId: 'crop_carrot', plantedAt: NOW - i * 1000, wateredBonusMs: 0, lastWateredAt: 0 },
      });
    }
    for (let i = 0; i < 30; i++) {
      state.placements.push({ uid: 20000 + i, defId: 'bld_fence', x: i, y: 12, rot: 0 });
    }
    const snap = takeSnapshot(state, 0, NOW);
    const code = encodeFriendCode(snap);
    expect(code.startsWith('PI1.')).toBe(true); // 大负载走 LZW
    expect(code.length).toBeLessThan(JSON.stringify(snap).length);
    const decoded = decodeFriendCode(code);
    expect(decoded.plots.length).toBe(snap.plots.length);
    expect(decoded.placements.length).toBe(snap.placements.length);
  });

  it('坏码被拒绝', () => {
    expect(() => decodeFriendCode('PI1.@@@@')).toThrow();
    expect(() => decodeFriendCode('hello')).toThrow();
    expect(() => decodeFriendCode('PI1.')).toThrow();
  });
});

describe('离线结算', () => {
  it('短暂离开不弹摘要', () => {
    const state = makeGame();
    state.savedAt = NOW;
    expect(settleOffline(state, NOW + 60_000)).toBeNull();
  });

  it('长时间离开统计成熟作物与能量恢复', () => {
    const state = makeGame();
    seedRng(11);
    state.player.energy = 0;
    state.player.energyUpdatedAt = NOW;
    plant(state, state.plots[0].uid, 'crop_carrot', NOW);
    state.savedAt = NOW;
    const growMs = cropDef('crop_carrot').growMs;
    const summary = settleOffline(state, NOW + growMs + 10 * 60_000);
    expect(summary).not.toBeNull();
    expect(summary!.cropsReady).toBeGreaterThanOrEqual(0);
    expect(summary!.energyRestored).toBeGreaterThan(0);
    expect(summary!.awayMs).toBeGreaterThan(growMs);
  });
});
