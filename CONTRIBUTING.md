# Contributing

This repository distributes standalone effect folders. The website is maintained separately.

## Report a problem

Include the effect's folder name, the browser and device, the steps to reproduce, and what you expected to happen. Explain whether the issue occurs in the included `index.html`, on the live website, or after integration into your own project. A small reproduction is useful for integration issues.

## Update or add an effect

1. Keep the folder at `effects/<slug>/`. Preserve existing paths when reorganizing documentation; links and integrations use them.
2. Keep each effect usable on its own. Its demo must include the actual mount call and any required content or dependencies.
3. Document the effect's DOM requirements, options, lifecycle and cleanup in the header of `effect.js`. Keep the copyright notice and relevant licenses.
4. Test the demo's actual interaction and the changes you made. A metadata check does not validate animation behavior.
5. Update the entry in `catalog.json`, including English and Chinese names/descriptions, categories, file list and mount function.
6. Run `node scripts/catalog.mjs --write`, then `node scripts/catalog.mjs --check` with Node.js 22 or newer.

`catalog.json` is the source for the two generated effect directories. The first category is the primary group; additional categories are discovery tags. Do not copy an effect into several folders to represent several categories.

The check verifies metadata, required files, local documentation links, JavaScript syntax and generated directories. GitHub Actions runs the same check on pushes and pull requests. There are no npm dependencies for these maintenance commands.

## 中文说明

反馈问题时，请附上效果文件夹名称、浏览器与设备、复现步骤和预期结果，并说明问题出现在独立示例、网站还是自己的接入项目中。

新增或修改效果时，保留独立可运行的文件夹、源码说明、版权注释和许可证；实际操作验证动效，再同步 `catalog.json` 的中英文介绍、分类、挂载函数和文件清单。运行 `node scripts/catalog.mjs --write` 更新目录，随后运行 `node scripts/catalog.mjs --check` 检查。维护命令需要 Node.js 22 或更新版本，使用效果本身不需要 Node.js。
