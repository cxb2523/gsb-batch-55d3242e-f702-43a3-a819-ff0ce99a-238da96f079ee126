/**
 * 好友码 v2 协议测试：快照携带邻居岛可参观状态，
 * 新标记 PI2./PI3. 与旧版 PI0./PI1. 兼容，损坏码全部拒绝且不返回半成品。
 */
import { describe, expect, it } from 'vitest';
import { decodeFriendCode, encodeFriendCode, type IslandSnapshot, type NeighborSnapshot } from '../src/social/friendcode';
import type { FarmPlot } from '../src/core/types';

const NOW = new Date(2026, 6, 18, 12, 0, 0).getTime();

function makePlots(): FarmPlot[] {
  return [
    { uid: 1, x: 2, y: 3, crop: { defId: 'crop_carrot', plantedAt: NOW - 60_000, wateredBonusMs: 0, lastWateredAt: 0 } },
    { uid: 2, x: 3, y: 3, crop: null },
    { uid: 3, x: 4, y: 3, crop: { defId: 'crop_potato', plantedAt: NOW - 30_000, wateredBonusMs: 5_000, lastWateredAt: NOW - 10_000 } },
  ];
}

function makeNeighbors(): NeighborSnapshot[] {
  // 邻居 A：带杂草和野兽
  const neighborA: NeighborSnapshot = {
    defId: 'npc_panda',
    friendship: 42,
    plots: [
      { uid: 101, x: 7, y: 7, crop: { defId: 'crop_carrot', plantedAt: NOW - 120_000, wateredBonusMs: 0, lastWateredAt: 0 } },
    ],
    weeds: [
      { uid: 201, x: 5, y: 6 },
      { uid: 202, x: 6, y: 6 },
    ],
    beasts: [
      { uid: 301, defId: 'beast_boar', x: 8, y: 8, hp: 2, spawnedAt: NOW - 90_000 },
    ],
    placements: [{ uid: 401, defId: 'bld_fence', x: 9, y: 9, rot: 0 }],
    simulatedAt: NOW - 45_000,
    helpedToday: 2,
    prankedToday: 1,
    helpDay: '2026-07-18',
  };
  // 邻居 B：无杂草无野兽
  const neighborB: NeighborSnapshot = {
    defId: 'npc_fox',
    friendship: 7,
    plots: [
      { uid: 102, x: 7, y: 8, crop: null },
    ],
    weeds: [],
    beasts: [],
    placements: [],
    simulatedAt: NOW - 5_000,
    helpedToday: 0,
    prankedToday: 0,
    helpDay: '2026-07-18',
  };
  return [neighborA, neighborB];
}

function makeSnapshot(neighbors: NeighborSnapshot[]): IslandSnapshot {
  return {
    v: 2,
    name: '星光椰子岛', // 中文岛主名
    level: 12,
    seed: 987654321,
    islandTier: 3,
    beauty: 555,
    avatar: {
      skin: 'cl_skin_1', hair: 'cl_hair_2', face: 'cl_face_1',
      top: 'cl_top_3', bottom: 'cl_bottom_1', hat: null, accessory: null,
    },
    plots: makePlots(),
    placements: [{ uid: 501, defId: 'bld_lamp', x: 1, y: 1, rot: 0 }],
    animals: [{ defId: 'animal_chicken', x: 4, y: 5 }],
    pets: [{ defId: 'pet_dog', name: '旺财' }],
    takenAt: NOW,
    neighbors,
  };
}

// ------------------------------------------------- 测试用编码小工具

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 测试内置的旧版 LZW 编码器，用于模拟老客户端产出的 PI1. 码 */
function legacyLzw(input: string): number[] {
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

function lzwCode(marker: string, json: string): string {
  const utf8 = new TextEncoder().encode(json);
  let latin1 = '';
  for (const b of utf8) latin1 += String.fromCharCode(b);
  const codes = legacyLzw(latin1);
  const bytes = new Uint8Array(codes.length * 2);
  codes.forEach((c, i) => {
    bytes[i * 2] = c & 0xff;
    bytes[i * 2 + 1] = c >> 8;
  });
  return marker + base64url(bytes);
}

function rawCode(marker: string, text: string): string {
  return marker + base64url(new TextEncoder().encode(text));
}

describe('好友码 v2：邻居岛快照', () => {
  it('含中文名/地块/两个邻居（其一有杂草和野兽）的快照 roundtrip，且使用新标记', () => {
    const snap = makeSnapshot(makeNeighbors());
    const code = encodeFriendCode(snap);

    // 携带邻居数据的新版本必须使用 PI2.(raw) 或 PI3.(LZW) 新标记
    expect(code).toMatch(/^PI[23]\./);
    expect(code.startsWith('PI0.') || code.startsWith('PI1.')).toBe(false);

    const decoded = decodeFriendCode(code);
    expect(decoded.v).toBe(2);
    expect(decoded.name).toBe('星光椰子岛');
    expect(decoded.neighbors).toHaveLength(2);

    const [a, b] = decoded.neighbors;
    const [wantA, wantB] = snap.neighbors;

    // 邻居 A：字段逐一相等
    expect(a.defId).toBe(wantA.defId);
    expect(a.friendship).toBe(wantA.friendship);
    expect(a.plots).toEqual(wantA.plots);
    expect(a.weeds).toEqual(wantA.weeds);
    expect(a.beasts).toEqual(wantA.beasts);
    expect(a.placements).toEqual(wantA.placements);
    expect(a.simulatedAt).toBe(wantA.simulatedAt);
    expect(a.helpedToday).toBe(wantA.helpedToday);
    expect(a.prankedToday).toBe(wantA.prankedToday);
    expect(a.helpDay).toBe(wantA.helpDay);
    expect(a.weeds).toHaveLength(2);
    expect(a.beasts).toHaveLength(1);

    // 邻居 B：空杂草/空野兽也保持一致
    expect(b.defId).toBe(wantB.defId);
    expect(b.friendship).toBe(wantB.friendship);
    expect(b.plots).toEqual(wantB.plots);
    expect(b.weeds).toEqual([]);
    expect(b.beasts).toEqual([]);
    expect(b.placements).toEqual([]);
    expect(b.helpedToday).toBe(0);
    expect(b.prankedToday).toBe(0);
    expect(b.helpDay).toBe('2026-07-18');

    // 整个邻居数组深度相等
    expect(decoded.neighbors).toEqual(snap.neighbors);
    // 岛主快照字段保持不变
    expect(decoded.plots).toEqual(snap.plots);
    expect(decoded.seed).toBe(snap.seed);
  });

  it('旧版 PI1. 码仍可解码，邻居字段归一化为空数组', () => {
    const legacyV1 = {
      v: 1,
      name: '老岛主',
      level: 5,
      seed: 42,
      islandTier: 2,
      beauty: 100,
      avatar: {
        skin: 'cl_skin_1', hair: 'cl_hair_1', face: 'cl_face_1',
        top: 'cl_top_1', bottom: 'cl_bottom_1', hat: null, accessory: null,
      },
      plots: makePlots(),
      placements: [],
      animals: [],
      pets: [],
      takenAt: NOW,
    };
    const code = lzwCode('PI1.', JSON.stringify(legacyV1));
    expect(code.startsWith('PI1.')).toBe(true);

    const decoded = decodeFriendCode(code);
    expect(decoded.v).toBe(1);
    expect(decoded.name).toBe('老岛主');
    expect(decoded.seed).toBe(42);
    expect(decoded.plots).toHaveLength(3);
    expect(decoded.neighbors).toEqual([]);
  });

  it('旧版 PI0. 原始字节码同样解码为空邻居', () => {
    const code = rawCode('PI0.', JSON.stringify({
      v: 1, name: 'raw 老岛', level: 1, seed: 7, islandTier: 1, beauty: 0,
      avatar: { skin: 's', hair: 'h', face: 'f', top: 't', bottom: 'b', hat: null, accessory: null },
      plots: [], placements: [], animals: [], pets: [], takenAt: NOW,
    }));
    const decoded = decodeFriendCode(code);
    expect(decoded.v).toBe(1);
    expect(decoded.neighbors).toEqual([]);
  });
});

describe('好友码：损坏/非法输入一律拒绝', () => {
  const valid = encodeFriendCode(makeSnapshot(makeNeighbors()));

  it('截断码抛错', () => {
    expect(() => decodeFriendCode(valid.slice(0, valid.length - 24))).toThrow();
    // 只剩标记、负载段为空
    expect(() => decodeFriendCode('PI3.')).toThrow(/empty/);
    expect(() => decodeFriendCode('PI2.')).toThrow(/empty/);
  });

  it('版本标记被篡改（不认识的标记）抛可读错误', () => {
    const tampered = 'PI9.' + valid.slice(4);
    expect(() => decodeFriendCode(tampered)).toThrow(/unknown version marker/);
    expect(() => decodeFriendCode('hello world')).toThrow(/unknown version marker/);
  });

  it('版本号与标记不匹配抛错（v2 负载套 PI1. 标记）', () => {
    const snap = makeSnapshot(makeNeighbors());
    const mismatched = lzwCode('PI1.', JSON.stringify(snap));
    expect(() => decodeFriendCode(mismatched)).toThrow(/version mismatch/);
  });

  it('邻居计数为负数抛错', () => {
    const badHelp = makeSnapshot(makeNeighbors());
    badHelp.neighbors[0]!.helpedToday = -1;
    expect(() => decodeFriendCode(encodeFriendCode(badHelp))).toThrow(/helpedToday/);

    const badPrank = makeSnapshot(makeNeighbors());
    badPrank.neighbors[1]!.prankedToday = -99;
    expect(() => decodeFriendCode(encodeFriendCode(badPrank))).toThrow(/prankedToday/);
  });

  it('base64url 段非法字符抛错', () => {
    expect(() => decodeFriendCode('PI3.@@@@')).toThrow(/base64url/);
    expect(() => decodeFriendCode('PI2.###bad###')).toThrow(/base64url/);
  });

  it('LZW 段字节数为奇数抛错', () => {
    // base64url 'AA' 解码为单个 0x00 字节 → 奇数
    expect(() => decodeFriendCode('PI3.AA')).toThrow(/odd byte count/);
  });

  it('JSON 解析失败抛错', () => {
    expect(() => decodeFriendCode(rawCode('PI2.', 'not-json{'))).toThrow(/JSON/);
  });

  it('seed 非数字 / plots 非数组抛错', () => {
    const badSeed = makeSnapshot(makeNeighbors()) as unknown as Record<string, unknown>;
    badSeed.seed = 'rolling in the deep';
    expect(() => decodeFriendCode(rawCode('PI2.', JSON.stringify(badSeed)))).toThrow(/seed/);

    const badPlots = makeSnapshot(makeNeighbors()) as unknown as Record<string, unknown>;
    badPlots.plots = 'farm-grid';
    expect(() => decodeFriendCode(rawCode('PI2.', JSON.stringify(badPlots)))).toThrow(/plots/);
  });

  it('邻居条目缺少必要字段抛错', () => {
    const broken = makeSnapshot(makeNeighbors());
    const partial = { ...broken.neighbors[0] } as Partial<NeighborSnapshot>;
    delete partial.helpDay;
    broken.neighbors = [partial as NeighborSnapshot];
    expect(() => decodeFriendCode(encodeFriendCode(broken))).toThrow(/missing required field 'helpDay'/);
  });

  it('所有错误路径都抛出 Error 且不返回半成品', () => {
    const badInputs = [
      valid.slice(0, 12),
      'PI9.xxxx',
      'PI3.',
      'PI3.AA',
      rawCode('PI2.', '{}'),
    ];
    for (const input of badInputs) {
      let threw = false;
      try {
        decodeFriendCode(input);
      } catch (err) {
        threw = true;
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message.length).toBeGreaterThan(0);
      }
      expect(threw).toBe(true);
    }
  });
});
