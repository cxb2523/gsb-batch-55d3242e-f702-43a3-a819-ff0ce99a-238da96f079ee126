import { normalizeGeneratedTsx, type PartialTsxOptions } from "partial-tsx";

const skipQuoted = (code: string, index: number) => {
  const quote = code[index];
  index += 1;
  while (index < code.length) {
    if (code[index] === "\\") index += 2;
    else if (code[index++] === quote) break;
  }
  return index;
};

const matchingParen = (code: string, start: number) => {
  let depth = 0;
  for (let index = start; index < code.length; index += 1) {
    if (code[index] === '"' || code[index] === "'" || code[index] === "`") {
      index = skipQuoted(code, index) - 1;
      continue;
    }
    if (code[index] === "/" && code[index + 1] === "/") {
      const end = code.indexOf("\n", index + 2);
      index = (end === -1 ? code.length : end) - 1;
      continue;
    }
    if (code[index] === "/" && code[index + 1] === "*") {
      const end = code.indexOf("*/", index + 2);
      index = (end === -1 ? code.length : end + 2) - 1;
      continue;
    }
    if (code[index] === "(") depth += 1;
    else if (code[index] === ")" && --depth === 0) return index;
  }
  return -1;
};

const isGenericArrowContext = (code: string, start: number) => {
  const before = code.slice(0, start).trimEnd();
  const previous = before.at(-1);
  return previous === "=" || previous === ":" || /\basync\s*$/.test(before);
};

const findOutside = (code: string, token: string, start: number, boundary = false) => {
  for (let index = start; index < code.length; index += 1) {
    if (code[index] === '"' || code[index] === "'" || code[index] === "`") {
      index = skipQuoted(code, index) - 1;
      continue;
    }
    if (code[index] === "/" && code[index + 1] === "/") {
      const end = code.indexOf("\n", index + 2);
      index = (end === -1 ? code.length : end) - 1;
      continue;
    }
    if (code[index] === "/" && code[index + 1] === "*") {
      const end = code.indexOf("*/", index + 2);
      index = (end === -1 ? code.length : end + 2) - 1;
      continue;
    }
    if (code.startsWith(token, index) && (!boundary || /[\s/>]/.test(code[index + token.length] ?? ""))) return index;
  }
  return -1;
};

const hasDirectJsxClose = (code: string, arrow: number, name: string) => {
  const close = findOutside(code, `</${name}>`, arrow);
  if (close === -1) return false;
  if (/(?:^|\n)\s*(?:const|let|var|type|export|function|class)\b/.test(code.slice(arrow, close))) return false;
  const opener = findOutside(code, `<${name}`, arrow, true);
  return opener === -1 || opener > close;
};

/**
 * `partial-tsx@0.0.5` recognizes `<T,>` and constrained/defaulted parameters as TypeScript,
 * but reads a plain `<T>(...) => ...` as an opening JSX element and appends `</T>`. The model
 * writes the plain spelling in type aliases and hook casts, so normalize only the unambiguous
 * generic-arrow form before handing the source to the dependency. Real JSX remains untouched.
 */
const rewritePlainGenericArrows = (code: string) => {
  let next = "";
  let cursor = 0;
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === '"' || code[index] === "'" || code[index] === "`") {
      index = skipQuoted(code, index) - 1;
      continue;
    }
    if (code[index] === "/" && code[index + 1] === "/") {
      const end = code.indexOf("\n", index + 2);
      index = (end === -1 ? code.length : end) - 1;
      continue;
    }
    if (code[index] === "/" && code[index + 1] === "*") {
      const end = code.indexOf("*/", index + 2);
      index = (end === -1 ? code.length : end + 2) - 1;
      continue;
    }
    if (code[index] !== "<") continue;
    const match = /^<\s*([A-Za-z_$][\w$]*)\s*>/.exec(code.slice(index));
    if (!match || !isGenericArrowContext(code, index)) continue;
    let parameterEnd = index + match[0].length;
    while (/\s/.test(code[parameterEnd] ?? "")) parameterEnd += 1;
    if (code[parameterEnd] !== "(") continue;
    const close = matchingParen(code, parameterEnd);
    if (close === -1) continue;
    let arrow = close + 1;
    while (/\s/.test(code[arrow] ?? "")) arrow += 1;
    if (code.slice(arrow, arrow + 2) !== "=>") continue;
    if (hasDirectJsxClose(code, arrow + 2, match[1])) continue;
    next += code.slice(cursor, index) + `<${match[1]},>`;
    cursor = index + match[0].length;
    index = cursor - 1;
  }
  return cursor === 0 ? code : next + code.slice(cursor);
};

export const normalizeGeneratedTsxCompat = (code: string, options: PartialTsxOptions = {}) => normalizeGeneratedTsx(rewritePlainGenericArrows(code), options);
