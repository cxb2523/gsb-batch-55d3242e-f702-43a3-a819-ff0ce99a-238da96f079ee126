# A real multi-file canvas

Unretouched output from one prompt (`做个多页的项目仪表盘画布，拆成几个子组件文件，主文件用相对路径 import 它们`),
kept because nothing else in the suite exercises the shape that actually ships:

- the entry imports five sub-pages as `./project-dashboard/<Name>` — the id-prefixed form the
  contract requires beside the entry file;
- four of those import `./ui` and `./data` as **siblings of each other**, which resolves only
  when `from` is the path the server resolved rather than a bare basename.

A `lastIndex` bug that dropped every one of these shipped, because the unit tests each passed a
single hand-written specifier. Regenerate rather than edit.
