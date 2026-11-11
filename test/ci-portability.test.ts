import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Anything `check:ci` can reach has to run on the CI runner, which is ubuntu and has no zsh.
 *
 * `zsh scripts/test-shuffled.sh` there is exit 127 — "command not found" — which GitHub reports as
 * a failing check with no failing test in it, and which no local run can reproduce because macOS
 * ships zsh. The suite was green on every machine that had ever run it.
 *
 * Only the scripts CI actually reaches are constrained; `mutation-audit.sh` and friends are local
 * tools and may use whatever shell they like.
 */
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

/** Every npm script `check:ci` runs, transitively. */
const reachable = (name: string, seen = new Set<string>()): string[] => {
  if (seen.has(name)) return [];
  seen.add(name);
  const body = pkg.scripts[name] ?? "";
  return [name, ...[...body.matchAll(/bun run ([\w:-]+)/g)].flatMap((m) => reachable(m[1], seen))];
};

test("nothing CI runs invokes a shell the runner does not have", () => {
  const offenders = reachable("check:ci")
    .map((name) => [name, pkg.scripts[name] ?? ""] as const)
    .filter(([, body]) => /\bzsh\b/.test(body));
  expect(offenders.map(([name]) => name)).toEqual([]);
});

// The shebang matters too: a script invoked as `sh foo.sh` ignores it, but anything that runs it
// directly (a hook, a human) follows it, and then the two paths differ.
test("and no script CI runs carries a zsh shebang", () => {
  const scripts = reachable("check:ci").flatMap((name) => [...(pkg.scripts[name] ?? "").matchAll(/(?:^|\s)(?:sh|bash|zsh) (scripts\/[\w.-]+)/g)].map((m) => m[1]));
  for (const path of scripts) {
    expect(readFileSync(path, "utf8").split("\n")[0]).not.toContain("zsh");
  }
});
