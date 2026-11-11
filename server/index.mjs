/**
 * 可选的岛屿快照交换服务（纯 Node，无外部依赖，无数据库）。
 *
 * 游戏本体完全离线可玩；这个小服务只是让"好友码"多一种更短的分享方式：
 *   POST /island        body: {"code": "PI1.xxxx"}  → {"id": "abc123"}
 *   GET  /island/:id                                → {"code": "PI1.xxxx"}
 *
 * 运行：npm run server   （默认端口 8787，PORT 环境变量可改）
 * 数据落盘在 server/data/*.json，重启不丢。
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');
mkdirSync(DATA_DIR, { recursive: true });

const MAX_CODE_LENGTH = 64 * 1024; // 64KB 上限，防滥用
const ID_PATTERN = /^[a-z0-9]{10}$/;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'POST' && url.pathname === '/island') {
    let body = '';
    let overflow = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_CODE_LENGTH + 1024) {
        overflow = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (overflow) return;
      try {
        const { code } = JSON.parse(body);
        if (typeof code !== 'string' || !/^PI[01]\.[A-Za-z0-9_-]+$/.test(code) || code.length > MAX_CODE_LENGTH) {
          sendJson(res, 400, { error: 'invalid code' });
          return;
        }
        const id = randomBytes(8).toString('hex').slice(0, 10);
        writeFileSync(join(DATA_DIR, `${id}.json`), JSON.stringify({ code, at: Date.now() }));
        sendJson(res, 200, { id });
      } catch {
        sendJson(res, 400, { error: 'bad request' });
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/island/')) {
    const id = url.pathname.slice('/island/'.length);
    if (!ID_PATTERN.test(id)) {
      sendJson(res, 400, { error: 'invalid id' });
      return;
    }
    const file = join(DATA_DIR, `${id}.json`);
    if (!existsSync(file)) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    const { code } = JSON.parse(readFileSync(file, 'utf8'));
    sendJson(res, 200, { code });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    sendJson(res, 200, { service: 'paradise-isle snapshot exchange', ok: true });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`paradise-isle snapshot server listening on http://localhost:${PORT}`);
});
