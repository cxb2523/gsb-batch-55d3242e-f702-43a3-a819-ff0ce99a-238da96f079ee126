// tests/insight-baseline.test.mjs
// 快照对比链路：7 日基线的窗口选择、缺拍回退、完全无基线三种情形。
// 全程离线：自造快照目录 + 自造 dataset，直接调 insight.run。
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { run as runInsight } from '../scripts/insight.js';
import { tmpDataDir, silent } from './helpers.mjs';

const TODAY = '2026-11-11';

function repo(fullName, stars) {
  return {
    fullName,
    name: fullName.split('/')[1],
    url: `https://github.com/${fullName}`,
    description: 'reverse engineering tool',
    owner: { login: fullName.split('/')[0] },
    stars,
    language: 'C',
    createdAt: '2026-10-01T00:00:00Z',
  };
}

function makeDataset(repos) {
  return {
    date: TODAY,
    alertThreshold: 1000,
    discovery: { repos: [] },
    legs: { binary: { key: 'binary', repos } },
  };
}

async function writeSnapshot(dataDir, date, stars) {
  const dir = path.join(dataDir, 'snapshot');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${date}.json`),
    JSON.stringify({ date, takenAt: `${date}T02:07:00Z`, stars }),
  );
}

test('窗口内有快照：按原逻辑选最近基线，不标回退', async () => {
  const dataDir = await tmpDataDir();
  await writeSnapshot(dataDir, '2026-10-20', { 'a/tool': 80 }); // 22 天前，窗口外
  await writeSnapshot(dataDir, '2026-11-04', { 'a/tool': 120 }); // 7 天前，窗口内

  const insight = await runInsight(makeDataset([repo('a/tool', 150)]), { dataDir, log: silent });

  assert.deepEqual(insight.baseline, { date: '2026-11-04', age: 7, fallback: false });
  assert.equal(insight.rising7d.length, 1);
  assert.equal(insight.rising7d[0].delta, 30);
  assert.equal(insight.rising7d[0].days, 7);
  assert.equal(insight.rising7d[0].perDay, 4.3); // 30/7
});

test('基线缺拍：窗口内无快照时回退到最近一份更早快照，perDay 按实际天数算', async () => {
  const dataDir = await tmpDataDir();
  // 7–11 天窗口内什么都没有，最近的一份在 22 天前
  await writeSnapshot(dataDir, '2026-10-20', { 'a/tool': 100 });

  const insight = await runInsight(makeDataset([repo('a/tool', 150)]), { dataDir, log: silent });

  // 不退化成首跑：如实写出实际基线日期与天数
  assert.deepEqual(insight.baseline, { date: '2026-10-20', age: 22, fallback: true });
  assert.equal(insight.rising7d.length, 1);
  assert.equal(insight.rising7d[0].delta, 50);
  assert.equal(insight.rising7d[0].days, 22);
  assert.equal(insight.rising7d[0].perDay, 2.3); // 50/22，按实际 22 天而非 7 天
  // 新面孔同样基于回退后的基线判定
  assert.equal(insight.newEntries.length, 0);
});

test('完全无基线：没有任何更早快照时才返回首跑语义', async () => {
  const dataDir = await tmpDataDir();
  await fs.mkdir(path.join(dataDir, 'snapshot'), { recursive: true }); // 空快照目录

  const insight = await runInsight(makeDataset([repo('a/tool', 150)]), { dataDir, log: silent });

  assert.equal(insight.baseline, null);
  assert.match(insight.note, /首跑/);
  assert.deepEqual(insight.rising7d, []);
  assert.deepEqual(insight.newEntries, []);
  assert.deepEqual(insight.surges, []);
});
