/**
 * Can each screen still see its defect in code a current model writes?
 *
 * A long clean streak has two explanations — the rules work, or the checker went blind — and they
 * look identical from the outside. This takes real cards, injects one defect each, and reports
 * whether the screen notices. A screen that catches 0 of N is either broken or correctly cleared
 * by something those cards do; both need explaining, which is the point.
 *
 *     bun scripts/inject.ts /tmp/allfresh
 *
 * Exits non-zero if a screen with an injection defined catches nothing anywhere.
 */
import { readFileSync, readdirSync } from "node:fs";
import { SCREENS } from "./screens.ts";

// One mutation per screen, written the way a card would write the mistake.
const INJECTIONS: Record<string, ((source: string) => string) | undefined> = {
  "AND-INTO-ARROW": (s) => s.replace(/\n(export default)/, "\nconst pick = n > 0 && (i: number) => i + n;\n$1"),
  // Two things this injection got wrong before it worked, both worth keeping in view:
  //
  // - The screen fires on the PAIRING, not the fill. A brand background alone is merely odd.
  // - The token is `brand-primary`, NOT `state-business-primary`. Those are different colours:
  //   `brand-primary` is a FOREGROUND despite its name (it equals the body text colour), so
  //   filling with it and writing white on top is a white square with invisible text.
  //   `state-business-primary` is the real accent, and white on it is correct — widening the
  //   screen to accept both spellings would have flagged 95 of 378 cards, 84 of them fine.
  "BRAND-PRIMARY-FILL": (s) => s.replace(/style=\{\{ /, 'style={{ background: "var(--dsw-alias-brand-primary)", color: "#fff", '),
  "COMMA-IN-STYLE": (s) => s.replace(/style=\{\{ /, "style={base, { "),
  "DESTRUCTURED-HOOK": (s) => s.replace(/\n(export default)/, "\nconst [w, setW] = useRef(0);\n$1"),
  "DUPLICATE-STYLE-KEY": (s) => s.replace(/style=\{\{ /, "style={{ padding: 4, padding: 8, "),
  "GLOB-IN-JSX": (s) => s.replace(/<div/, "<div>src/**/*.{ts,tsx}</div><div"),
  "HARDCODED-BACKGROUND": (s) => s.replace(/style=\{\{ /, 'style={{ background: "#ffffff", '),
  "JSX-SUBSCRIPT": (s) => s.replace(/<div/, "<Icons[kind] /><div"),
  "MISSING-REACT-IMPORT": (s) => s.replace(/<div/, "<Suspense><div"),
  "MODULE-SCOPE-HOOK": (s) => s.replace(/\n(export default)/, "\nconst [z, setZ] = useState(0);\n$1"),
  "NO-FOCUS-RING": (s) => s.replaceAll(/[^{}\n]*:focus-visible[^}]*\}/g, "").replace(/style=\{\{ /, 'style={{ outline: "none", '),
  "REGEX-IN-JSX-TEXT": (s) => s.replace(/<div>/, "<div>\n  ^\\w+@\\w+\\.\\w{2,}$\n"),
  // Needs the default export's own name, so the mutation reads it out of the card first.
  "SHADOWED-EXPORT": (s) => {
    const name = /export default function (\w+)/.exec(s)?.[1];
    return name === undefined ? s : `import { ${name} } from "recharts";\n${s}`;
  },
  "TRANSITION-WITHOUT-TRANSFORM": (s) => s.replaceAll(/\btransform\b\s*[:=][^,;}\n]*/g, "opacity: 1").replace(/style=\{\{ /, 'style={{ transition: "transform .12s ease", '),
  "UNGUARDED-ASYNC-HANDLER": (s) => s.replace(/\n(export default)/, '\nconst load = async () => { const r = await bash("ls"); setRows(r.stdout) };\n$1'),
  // Scoped to EXTERNALLY-filled arrays, so the injection has to supply the whole shape: a
  // capability import, a state setter the array is filled through, and the unguarded index.
  // Indexing an array built from a literal cannot be empty and is correctly ignored.
  // The card has to FETCH before it can fail to announce, so the injection adds the fetch and
  // strips any existing announcement.
  // Needs a try/catch WRAPPING a capability call, with nothing surfacing the failure — and the
  // card's own error handling stripped, or its `setError` elsewhere clears the screen.
  "SWALLOWED-CAPABILITY-FAILURE": (s) =>
    `import { bash } from "$dsh/exec";\n${s.replaceAll(/set(?:Err|Error|ErrMsg|Failure|Status)\w*\(/g, "setValue(").replaceAll(/\.stderr\b/g, ".stdout")}`.replace(/\n(export default)/, '\nconst sync = async () => { try { const r = await bash("ls"); setRows(r.stdout) } catch {} };\n$1'),
  "UNANNOUNCED-ASYNC-RESULT": (s) => `import { bash } from "$dsh/exec";\n${s.replaceAll(/aria-live=["'][^"']*["']|role=["'](?:status|alert|log)["']/g, "")}`.replace(/\n(export default)/, '\nconst reload = async () => { const r = await bash("ls"); setEntries(r.stdout.split("\\n")) };\n$1'),
  "UNGUARDED-LAST-INDEX": (s) => `import { bash } from "$dsh/exec";\n${s}`.replace(/\n(export default)/, '\nconst useLog = () => { const [lines, setLines] = useState<string[]>([]); void bash("ls").then((r) => setLines(r.stdout.split("\\n"))); return lines[lines.length - 1].trim() };\n$1'),
  "UNGUARDED-NUMBER-INPUT": (s) => s.replace(/<div/, '<input type="number" value={q} onChange={(e) => setQ(Number(e.target.value))} /><div'),
  "UNLABELLED-CONTROL": (s) => s.replace(/<div/, '<input type="range" min={0} max={9} value={q} onChange={f} /><div'),
  "UNQUOTED-CSS-UNIT": (s) => s.replace(/style=\{\{ /, "style={{ fontSize: 11px, "),
  "UNREACHABLE-CONTROL": (s) => s.replace(/<div/, "<div onClick={go}>go</div><div"),
  "UNSTOPPABLE-MOTION": (s) => s.replaceAll(/@media \(prefers-reduced-motion[^}]*\}[^}]*\}/g, "").replace(/(<style>\{`)/, "$1 @keyframes spin { to { transform: rotate(360deg) } } "),
  "VIEWPORT-UNITS": (s) => s.replace(/style=\{\{ /, 'style={{ width: "100vw", '),
};

const dir = process.argv[2] ?? "/tmp/allfresh";
const cards = readdirSync(dir)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => readFileSync(`${dir}/${name}`, "utf8"));
let blind = 0;
let missing = 0;

for (const name of Object.keys(SCREENS).toSorted()) {
  const inject = INJECTIONS[name];
  if (inject === undefined) {
    console.log(`${name.padEnd(30)} no injection written`);
    missing += 1;
    continue;
  }
  let caught = 0;
  let injected = 0;
  for (const source of cards) {
    // Only cards the screen is currently silent on: a card that already fires proves nothing.
    if (SCREENS[name](source)) continue;
    const mutated = inject(source);
    if (mutated === source) continue;
    injected += 1;
    if (SCREENS[name](mutated)) caught += 1;
  }
  const rate = injected === 0 ? "nothing to inject into" : `${caught}/${injected}`;
  console.log(`${name.padEnd(30)} ${rate}`);
  if (injected > 0 && caught === 0) blind += 1;
}

console.log(`\n${blind} screen(s) caught nothing, ${missing} without an injection`);
if (blind > 0) process.exit(1);
