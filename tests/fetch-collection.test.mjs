// tests/fetch-collection.test.mjs
// 抓取链路：采集完整性台账（latest.json 的 collection 字段）。
// 全程离线：searchFn 是伪造的查询结果，dataDir 是临时目录。
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { run } from '../scripts/fetch.js';
import { tmpDataDir, fakeItem, makeCfg, silent } from './helpers.mjs';

const DATE = '2026-11-11';

async function readLatest(dataDir) {
  return JSON.parse(await fs.readFile(path.join(dataDir, 'latest.json'), 'utf8'));
}

test('全部查询成功：collection.complete 为 true，快照覆盖全部入库仓库', async () => {
  const dataDir = await tmpDataDir();
  // q-one 返回 70 个仓库（超过展示切片 60），其余查询为空
  const items70 = Array.from({ length: 70 }, (_, i) => fakeItem(i + 1, 1000 - i));
  const searchFn = async (q) =>
    q === 'q-one' ? { items: items70, total_count: 70 } : { items: [], total_count: 0 };

  await run({ searchFn, cfg: makeCfg(), dataDir, date: DATE, log: silent });

  const latest = await readLatest(dataDir);
  assert.equal(latest.collection.complete, true);
  assert.equal(latest.collection.totalQueries, 3);
  assert.equal(latest.collection.succeededQueries, 3);
  assert.equal(latest.collection.failedQueries, 0);
  assert.deepEqual(latest.collection.failures, []);

  // 展示切片只有 60 条，但快照必须覆盖全部 70 个入库仓库——
  // 否则排在 61 位正在起量的仓库永远不会被增速榜发现。
  assert.equal(latest.legs.binary.repos.length, 60);
  assert.equal(latest.stats.uniqueRepos, 70);
  const snap = JSON.parse(
    await fs.readFile(path.join(dataDir, 'snapshot', `${DATE}.json`), 'utf8'),
  );
  assert.equal(Object.keys(snap.stars).length, 70);
  assert.equal(snap.stars['owner-1/tool-1'], 1000);
  assert.equal(snap.stars['owner-70/tool-70'], 931);
});

test('部分查询失败：不中断整轮抓取，collection 记录查询文本与错误原因', async () => {
  const dataDir = await tmpDataDir();
  const searchFn = async (q) => {
    if (q === 'q-two') throw new Error('GitHub API 502: bad gateway');
    return { items: [fakeItem(1, 100)], total_count: 1 };
  };

  // 单条查询失败不应抛出——整轮抓取必须完成
  await run({ searchFn, cfg: makeCfg(), dataDir, date: DATE, log: silent });

  const latest = await readLatest(dataDir);
  assert.equal(latest.collection.complete, false);
  assert.equal(latest.collection.totalQueries, 3);
  assert.equal(latest.collection.succeededQueries, 2);
  assert.equal(latest.collection.failedQueries, 1);
  assert.equal(latest.collection.failures.length, 1);
  assert.equal(latest.collection.failures[0].query, 'q-two');
  assert.match(latest.collection.failures[0].reason, /502/);

  // 成功查询的仓库照常入库、照常写快照
  assert.equal(latest.stats.uniqueRepos, 1);
  assert.equal(latest.legs.binary.repos.length, 1);
  const snap = JSON.parse(
    await fs.readFile(path.join(dataDir, 'snapshot', `${DATE}.json`), 'utf8'),
  );
  assert.equal(snap.stars['owner-1/tool-1'], 100);
});

test('失败明细截断：failedQueries 记全量，failures 数组截断到合理长度', async () => {
  const dataDir = await tmpDataDir();
  const cfg = makeCfg();
  // 25 条查询全部失败，超过 MAX_FAILURE_DETAILS(20)
  cfg.legs[0].queries = Array.from({ length: 25 }, (_, i) => `bad-${i}`);
  cfg.discovery.queries = [];
  const longReason = 'x'.repeat(500);
  const searchFn = async () => {
    throw new Error(longReason);
  };

  await run({ searchFn, cfg, dataDir, date: DATE, log: silent });

  const latest = await readLatest(dataDir);
  assert.equal(latest.collection.complete, false);
  assert.equal(latest.collection.totalQueries, 25);
  assert.equal(latest.collection.succeededQueries, 0);
  assert.equal(latest.collection.failedQueries, 25); // 全量计数不截断
  assert.equal(latest.collection.failures.length, 20); // 明细数组截断
  assert.ok(latest.collection.failures[0].reason.length <= 300); // 单条原因截断
});
