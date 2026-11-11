// tests/report-issue.test.mjs
// 既有行为回归：无 token 时 report-issue.js 必须跳过投递（不访问网络、退出码 0）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('无 token 时 report-issue 跳过投递', async () => {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  delete env.RADAR_TOKEN;
  delete env.PATROL_TOKEN;

  const { stdout } = await execFileP(process.execPath, ['scripts/report-issue.js'], {
    cwd: ROOT,
    env,
  });
  assert.match(stdout, /跳过 issue 投递/);
});
