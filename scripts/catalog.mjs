import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || '--check';
assert(['--check', '--write'].includes(mode) && process.argv.length <= 3, 'Usage: node scripts/catalog.mjs [--check|--write]');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
assert.equal(catalog.schemaVersion, 1, 'Unsupported catalog schema');
assert(Array.isArray(catalog.categories) && Array.isArray(catalog.effects), 'Categories and effects must be arrays');

const safePath = relative => {
  assert(typeof relative === 'string' && relative && !path.isAbsolute(relative) && !relative.includes('\\'), 'Use a relative POSIX path');
  const result = path.resolve(root, relative);
  assert(result.startsWith(root + path.sep), 'Path leaves the repository: ' + relative);
  return result;
};
const filesIn = (directory, prefix = '') => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  assert(!entry.isSymbolicLink(), 'Catalog files must not be symlinks');
  return entry.isDirectory() ? filesIn(path.join(directory, entry.name), prefix + entry.name + '/') : [prefix + entry.name];
}).sort();
const requiredText = (object, keys, label) => {
  for (const key of keys) assert(typeof object[key] === 'string' && object[key].trim(), label + ': missing ' + key);
};
const groups = new Map();
for (const category of catalog.categories) {
  requiredText(category, ['id', 'name', 'nameZh'], 'Category');
  assert(/^[a-z]+$/.test(category.id) && !groups.has(category.id), 'Invalid or duplicate category: ' + category.id);
  groups.set(category.id, category);
}
const slugs = new Set();
for (const effect of catalog.effects) {
  requiredText(effect, ['slug', 'name', 'nameZh', 'description', 'descriptionZh', 'directory', 'preview'], 'Effect');
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(effect.slug) && !slugs.has(effect.slug), 'Invalid or duplicate slug: ' + effect.slug);
  slugs.add(effect.slug);
  assert.equal(effect.directory, 'effects/' + effect.slug);
  assert.equal(effect.preview, 'https://effectatlas.com/effects/' + effect.slug);
  assert(Array.isArray(effect.categories) && effect.categories.length && new Set(effect.categories).size === effect.categories.length, effect.slug + ': invalid categories');
  for (const category of effect.categories) assert(groups.has(category), effect.slug + ': unknown category ' + category);
  assert.equal(effect.entry?.demo, 'index.html');
  assert.equal(effect.entry?.script, 'effect.js');
  assert.equal(effect.entry?.styles, 'effect.css');
  assert(/^mount[A-Z][A-Za-z0-9]*$/.test(effect.entry?.mount), effect.slug + ': invalid mount function');
  const directory = safePath(effect.directory);
  assert.deepEqual(effect.files, filesIn(directory), effect.slug + ': file list differs from folder');
  for (const file of ['index.html', 'effect.js', 'effect.css']) assert(effect.files.includes(file), effect.slug + ': missing ' + file);
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(directory, 'effect.js'), 'utf8');
  assert(new RegExp('\\b' + effect.entry.mount + '\\s*\\(').test(html), effect.slug + ': demo does not call the documented mount');
  assert(new RegExp('\\b' + effect.entry.mount + '\\b').test(script), effect.slug + ': mount name missing in effect.js');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1]);
  assert(scripts.includes('effect.js'), effect.slug + ': demo does not load effect.js');
  assert.deepEqual(effect.dependencies, scripts.filter(file => file !== 'effect.js'), effect.slug + ': dependency load order differs from demo');
  for (const dependency of effect.dependencies) assert(effect.files.includes(dependency), effect.slug + ': missing dependency ' + dependency);
  if (effect.dependencies.includes('three.min.js')) assert(effect.files.includes('three.LICENSE.txt'), effect.slug + ': three.js license missing');
  assert(script.includes('Copyright (c) 2026 PROJECT Y/O') && script.includes('Effect Atlas License'), effect.slug + ': copyright notice missing');
  execFileSync(process.execPath, ['--check', path.join(directory, 'effect.js')], { stdio: 'pipe', windowsHide: true });
}
const folders = fs.readdirSync(path.join(root, 'effects'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
assert.deepEqual([...slugs].sort(), folders, 'Catalog and effect folders differ');

const tableText = text => text.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
function directory(zh) {
  const name = effect => zh ? effect.nameZh : effect.name;
  const label = group => zh ? group.nameZh : group.name;
  const lines = [
    zh ? '# 效果目录' : '# Effect directory', '',
    zh ? '[English](README.md) · [仓库首页](../README.zh-CN.md) · [AI 接入指南](../docs/ai-integration.zh-CN.md)' : '[简体中文](README.zh-CN.md) · [Repository home](../README.md) · [AI integration guide](../docs/ai-integration.md)', '',
    '<!-- Generated from catalog.json by scripts/catalog.mjs. Edit the catalog, then run --write. -->', '',
    zh ? `共 ${catalog.effects.length} 个效果。每项在主分类下列出一次；完整的辅助分类、挂载函数和文件依赖见 [catalog.json](../catalog.json)。` : `${catalog.effects.length} effects. Each appears once under its primary category. Additional categories, mount functions and file dependencies are in [catalog.json](../catalog.json).`, '',
    catalog.categories.map(group => `[${label(group)}](#${group.id})`).join(' · '), ''
  ];
  for (const group of catalog.categories) {
    const effects = catalog.effects.filter(effect => effect.categories[0] === group.id);
    if (!effects.length) continue;
    lines.push(`<a id="${group.id}"></a>`, '', `## ${label(group)} (${effects.length})`, '',
      zh ? '| 效果文件夹 | 介绍 | 预览 |' : '| Effect folder | What it does | Preview |', '| --- | --- | --- |');
    for (const effect of effects) {
      const preview = zh ? effect.preview.replace('effectatlas.com/', 'effectatlas.com/zh/') : effect.preview;
      lines.push(`| [${tableText(name(effect))}](${effect.slug}/) | ${tableText(zh ? effect.descriptionZh : effect.description)} | [${zh ? '在线查看' : 'Live demo'}](${preview}) |`);
    }
    lines.push('');
  }
  lines.push(zh ? '使用约定见 [LICENSE](../LICENSE)。每个文件夹均可单独复制使用，请保留其中附带的资源与许可证。' : 'See [LICENSE](../LICENSE) for terms. Each folder can be copied independently; include its bundled assets and licenses.', '');
  return lines.join('\n');
}
const generated = new Map([
  ['effects/README.md', directory(false)],
  ['effects/README.zh-CN.md', directory(true)]
]);
for (const [file, text] of generated) {
  if (mode === '--write') fs.writeFileSync(safePath(file), text);
  else assert.equal(fs.readFileSync(safePath(file), 'utf8').replace(/\r\n/g, '\n'), text, file + ': run node scripts/catalog.mjs --write');
}
for (const [file, description] of [
  ['README.md', `${catalog.effects.length} web motion effects in plain JavaScript, written for your AI to build into your site.`],
  ['README.zh-CN.md', `${catalog.effects.length} 个前端动效，原生 JavaScript 编写，写给你的 AI，让它搭进你的网站。`]
]) {
  const existing = fs.readFileSync(safePath(file), 'utf8');
  const marker = /<!-- catalog-summary:start -->[\s\S]*?<!-- catalog-summary:end -->/g;
  assert.equal([...existing.matchAll(marker)].length, 1, file + ': summary markers missing or duplicated');
  const expected = existing.replace(marker, `<!-- catalog-summary:start -->\n${description}\n<!-- catalog-summary:end -->`);
  if (mode === '--write') fs.writeFileSync(safePath(file), expected);
  else assert.equal(existing.replace(/\r\n/g, '\n'), expected.replace(/\r\n/g, '\n'), file + ': effect count is stale');
}

const markdown = ['README.md', 'README.zh-CN.md', 'CONTRIBUTING.md', 'effects/README.md', 'effects/README.zh-CN.md',
  ...filesIn(path.join(root, 'docs')).filter(file => file.endsWith('.md')).map(file => 'docs/' + file)];
let localLinks = 0;
for (const file of markdown) {
  const text = fs.readFileSync(safePath(file), 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const [, href] of text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    if (/^(?:https?:|mailto:|#)/.test(href)) continue;
    const target = decodeURIComponent(href.split('#')[0]);
    const resolved = path.resolve(path.dirname(safePath(file)), target);
    assert(resolved.startsWith(root + path.sep) && fs.existsSync(resolved), file + ': broken local link ' + href);
    localLinks++;
  }
}
console.log(`${mode === '--write' ? 'Updated' : 'Checked'} ${catalog.effects.length} effects, ${catalog.categories.length} categories, ${localLinks} local documentation links. JavaScript syntax and dependency files passed.`);
