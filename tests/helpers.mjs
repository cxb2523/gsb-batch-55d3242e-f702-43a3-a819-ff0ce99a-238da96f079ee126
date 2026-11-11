// tests/helpers.mjs
// 离线测试共享工具：伪造 GitHub 搜索结果、最小关键词配置、临时数据目录。
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function tmpDataDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'radar-test-'));
}

// 形状对齐 GitHub Search API 的 repository item（lib.js 的 formatRepo 所消费的字段）
export function fakeItem(id, stars, overrides = {}) {
  return {
    id,
    name: `tool-${id}`,
    full_name: `owner-${id}/tool-${id}`,
    html_url: `https://github.com/owner-${id}/tool-${id}`,
    description: 'reverse engineering dynamic instrumentation tool',
    stargazers_count: stars,
    forks_count: 1,
    open_issues_count: 0,
    language: 'C',
    owner: { login: `owner-${id}`, avatar_url: '', html_url: '' },
    topics: [],
    created_at: '2026-10-01T00:00:00Z',
    pushed_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    license: null,
    archived: false,
    ...overrides,
  };
}

// 最小可用关键词配置：2 条主榜查询 + 1 条发现查询，共 3 条
export function makeCfg() {
  return {
    minStars: 0,
    pageSize: 100,
    maxPagesPerQuery: 2,
    legs: [
      {
        key: 'binary',
        name: '二进制 / 安全逆向',
        icon: '🔬',
        desc: '测试腿',
        queries: ['q-one', 'q-two'],
        topics: [],
        minStarsFloor: 0,
      },
    ],
    discovery: {
      name: '本周期新面孔',
      icon: '🌱',
      desc: '测试发现腿',
      queries: ['disc created:>__CREATED__'],
    },
    alert: { surge7dStars: 1000 },
  };
}

export const silent = () => {};
