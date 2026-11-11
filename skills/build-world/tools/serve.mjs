#!/usr/bin/env node
/**
 * serve.mjs - put the assembled bundle in front of the user, at an address.
 *
 * The first thing a person should do with a finished game is play it, and the
 * first version of this skill got that backwards: it asked "publish?" before
 * anybody had touched the thing. This serves the bundle and prints the address
 * to hand over, then stays up until the session ends.
 *
 * It serves the ASSEMBLED BUNDLE - dist/ plus its runtime assets, the exact
 * files that will be zipped and published - and not the dev server. That is
 * the whole point. A dev server resolves bare imports, rewrites paths and
 * tolerates a missing asset directory; a static host does none of that, and
 * "worked locally, black screen once published" is how the difference shows
 * up. Played from these files, what works here works on thrixel.world. Every
 * 404 is printed as it happens, because a missing file here is the black
 * screen there.
 *
 *   node tools/serve.mjs ./dist                 # http://127.0.0.1:5590/
 *   node tools/serve.mjs ./dist --lan           # also http://<this machine>:5590/ for a phone on the same Wi-Fi
 *   node tools/serve.mjs ./dist --port=5591
 *
 * Run it in the background (your harness's background option, or `&`), then
 * give the user the address. It dies with your session, which is fine - the
 * address that lasts is the published one. A rebuild is picked up on the next
 * refresh: files are read from disk on every request, nothing is cached.
 */

import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';

import { serve } from './lib/headless.mjs';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const flag = (n, d = null) => {
  const hit = args.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
};

if (!target) {
  console.error('usage: serve.mjs <bundle-dir> [--port=5590] [--lan]');
  process.exit(2);
}
const root = resolve(target);
if (!existsSync(join(root, 'index.html'))) {
  console.error(`serve: ${root} has no index.html at its root - serve the ASSEMBLED bundle (dist/ plus assets), not the source tree.`);
  process.exit(2);
}

const port = Number(flag('port', 5590));
const lan = flag('lan') === true;
let server;
try {
  server = await serve(root, port, lan ? '0.0.0.0' : '127.0.0.1');
} catch (e) {
  console.error(`serve: could not listen on ${port} (${e.code ?? e.message}). Pick another with --port.`);
  process.exit(2);
}

/** The first non-internal IPv4 address - what a phone on the same network dials. */
function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return null;
}

const local = `http://127.0.0.1:${port}/`;
const phone = lan ? (lanAddress() ? `http://${lanAddress()}:${port}/` : null) : null;
console.log(`serve: ${root}`);
console.log(`serve: playing at  ${local}`);
if (phone) console.log(`serve: on a phone   ${phone}   (same Wi-Fi; a firewall may block it)`);
else if (lan) console.log('serve: --lan asked for a phone address, but this machine has no network address to give');
console.log('serve: every missing file is listed below as it is asked for. A 404 here is a black screen once published.');

// The static server collects 404s in `missing`; surface each one once, live.
let seen = 0;
setInterval(() => {
  while (seen < server.missing.length) console.log(`serve: 404 ${server.missing[seen++]}`);
}, 500).unref();

const stop = () => { server.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
