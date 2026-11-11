// Wraps every `if (…)` condition in `!( )`. A regex cannot do this: `if ([^)]*)` stops at the
// first `)`, so any condition containing a call or a group — 27 of them across this source tree —
// becomes a syntax error instead of a mutant, and the module scores as if its tests were weak.
// Optional second argument restricts the mutation to a single 1-based line.
import { readFileSync, writeFileSync } from "node:fs";
const [file, only] = process.argv.slice(2);
// Lines inside a fenced code block in a template literal are EXAMPLE code — `skill.ts` shows a
// card how to abort a stale request, and its `if (error.name === "AbortError")` is a rule being
// taught, not a branch this module runs. Tracked by counting fences rather than by indentation,
// since the examples are indented exactly like real statements.
let fenced = false;
const out = readFileSync(file, "utf8")
  .split("\n")
  .map((line, index) => {
    if (/^\s*(?:\\`|`){3,}/.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) return line;
    if (only !== undefined && index + 1 !== Number(only)) return line;
    const at = line.indexOf("if (");
    if (at === -1) return line;
    // `skill.ts` documents the `AbortError` check inside its prompt template, and prose is not a
    // branch. A statement's `if` opens the line; one with anything but whitespace before it is
    // either inside a string or part of an `else if` chain the mutator cannot see the end of.
    // A statement's `if` opens the line, or follows `else` / a closing brace. Anything else before
    // it — words — means the `if` is inside a string.
    if (!/(?:^\s*|[{};)]\s*|\belse\s+)$/.test(line.slice(0, at))) return line;
    let depth = 0;
    for (let i = at + 3; i < line.length; i += 1) {
      if (line[i] === "(") depth += 1;
      else if (line[i] === ")" && (depth -= 1) === 0) return `${line.slice(0, at)}if (!(${line.slice(at + 4, i)}))${line.slice(i + 1)}`;
    }
    return line;
  });
writeFileSync(file, out.join("\n"));
