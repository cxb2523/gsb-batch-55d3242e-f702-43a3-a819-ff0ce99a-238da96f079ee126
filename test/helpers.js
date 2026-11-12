import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { isAbsolute, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../dist/server.js';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

// 1x1 transparent PNG.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const CONTENT_TYPES = new Map([
  ['.html', 'text/html'],
  ['.png', 'image/png'],
  ['.js', 'text/javascript'],
  ['.css', 'text/css'],
  ['.json', 'application/json'],
]);

/** Serves test/fixtures on a random local port. */
export async function startFixtureServer() {
  const server = createHttpServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/pixel.png') {
      res.writeHead(200, { 'content-type': 'image/png' }).end(PIXEL);
      return;
    }
    if (path === '/second.html') {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Second</title><p>Second page</p>');
      return;
    }
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(await readFile(join(fixtures, 'index.html')));
      return;
    }

    // Generic static serving for any other file under test/fixtures (e.g. /pagination/page1.html).
    const relative = decodeURIComponent(path).replace(/^\/+/, '');
    const filePath = normalize(isAbsolute(relative) ? relative : join(fixtures, relative));
    const insideFixtures = filePath === fixtures || filePath.startsWith(fixtures.endsWith(sep) ? fixtures : fixtures + sep);
    if (!insideFixtures) {
      res.writeHead(403).end('forbidden');
      return;
    }
    try {
      const body = await readFile(filePath);
      const ext = filePath.slice(filePath.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': CONTENT_TYPES.get(ext) ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Connects an MCP client to an in-process PlayMCP server. */
export async function connectClient() {
  const server = createServer();
  const client = new Client({ name: 'playmcp-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  /** Calls a tool and returns the text of its first content block; throws if the tool errored. */
  async function call(name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    const first = result.content[0];
    if (result.isError) throw new Error(`${name} failed: ${first?.text}`);
    return first?.type === 'text' ? first.text : first;
  }

  /** Like call, but parses the text as JSON. */
  async function callJson(name, args = {}) {
    return JSON.parse(await call(name, args));
  }

  return { client, call, callJson, close: () => client.close() };
}
