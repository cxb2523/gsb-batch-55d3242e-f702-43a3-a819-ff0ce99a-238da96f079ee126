/*
 * Test runner.
 *
 * headless-gl (`gl`) ships native, ABI-specific prebuilds and has no build for
 * Node 24+ (ABI 137); the available prebuilds target Node 22 (ABI 127). When
 * the current `node` cannot load the native GL module, this runner looks for a
 * compatible runtime (e.g. a portable Node bundled under ../tools) and re-runs
 * the suite there. With a compatible node on PATH it simply runs in-process.
 */
const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_FILE = path.join(__dirname, 'webgl-canvas.js');

function glLoads(execPath) {
  const result = spawnSync(execPath, ['-e', "require('gl'); require('canvas');"], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  return result.status === 0;
}

function findCompatibleNode() {
  const exe = process.platform === 'win32' ? 'node.exe' : 'node';
  const roots = [
    path.join(__dirname, '..', 'tools'),
    path.join(__dirname, '..', '..', 'tools'),
    process.env.TOOLS_DIR || '',
  ];
  for(const root of roots) {
    if(!root || !fs.existsSync(root)) continue;
    const stack = [root];
    while(stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, {withFileTypes: true});
      } catch(e) {
        continue; // eslint-disable-line no-continue
      }
      for(const entry of entries) {
        const full = path.join(dir, entry.name);
        if(entry.isDirectory()) {
          if(entry.name.startsWith('node-v')) stack.push(full);
        } else if(entry.name === exe && glLoads(full)) {
          return full;
        }
      }
    }
  }
  return null;
}

if(glLoads(process.execPath)) {
  require(TEST_FILE);
} else {
  const compatible = findCompatibleNode();
  if(!compatible) {
    console.error([
      'Cannot run the WebGL tests: the installed headless-gl prebuild is not',
      'compatible with this Node runtime (ABI ' + process.versions.modules + ').',
      'Use Node 22 (ABI 127), or place a compatible runtime under ../tools.',
    ].join('\n'));
    process.exit(1);
  }
  const result = spawnSync(compatible, [TEST_FILE], {stdio: 'inherit'});
  process.exit(result.status == null ? 1 : result.status);
}
