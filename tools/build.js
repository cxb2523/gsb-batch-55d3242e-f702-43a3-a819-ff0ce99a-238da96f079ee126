// build.js — folds the brush, the visible brush, the stroke list and the page
// script into one self-contained file: index.html. No bundler, no dependencies.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const n = require('./strokes.js').load().bytes.length / 12;
let html = read('page.html');
for (const [mark, file] of [['/*__BRUSH__*/', 'brush.js'], ['/*__TOOL__*/', 'tool.js'], ['/*__STROKES__*/', 'strokes.js'], ['/*__APP__*/', 'app.js']]) {
  if (!html.includes(mark)) throw new Error('missing ' + mark);
  html = html.replace(mark, () => read(file).trimEnd());
}
html = html.split('__COUNT__').join(n.toLocaleString('en-US'));
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`index.html  ${(html.length / 1024).toFixed(0)} KB  ${n} strokes`);
