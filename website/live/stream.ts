/** Typing and colouring the streamed source — the left half of a frame, independent of rendering. */

/**
 * Characters per second at `pos`, after the carousel in macaron-genui-demo#1408: imports and
 * hooks arrive at full speed (nothing can paint before the first `return (`), then it settles to a
 * pace you can read, slowing as the JSX grows — the way a model's tokens actually feel.
 */
export function rate(source: string, pos: number) {
  const body = source.search(/\n\s*return \(/);
  return pos < body ? 2400 : 1500 / (1 + (pos - body) / 1600);
}

const TOKEN = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"?|`(?:[^`\\]|\\.)*`?)|(<\/?[A-Za-z][\w.]*|\/?>)|\b(import|from|export|default|function|const|let|return|typeof|new|if)\b|\b(\d[\d.]*)\b|([A-Za-z_$][\w$]*)(?=\()/g;
const KIND = ["", "c", "s", "t", "k", "n", "f"];

export type Piece = { text: string; kind: string };

export function highlight(line: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), kind: "" });
    out.push({ text: m[0], kind: KIND[m.findIndex((g, i) => i > 0 && g !== undefined)] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), kind: "" });
  return out;
}

/**
 * `b` as it looks `k` characters into the edit that turns `a` into it: kept lines whole, added lines
 * typed out in order. An edit here only ever adds lines, so `a`'s lines are a subsequence of `b`'s.
 */
export function reveal(a: string, b: string, k: number) {
  const old = a.split("\n");
  let i = 0;
  const out: { text: string; fresh?: boolean }[] = [];
  for (const line of b.split("\n")) {
    if (old[i] === line) {
      i++;
      out.push({ text: line });
      continue;
    }
    if (k <= 0) continue;
    out.push({ text: line.slice(0, k), fresh: true });
    k -= line.length + 1;
  }
  return out;
}
