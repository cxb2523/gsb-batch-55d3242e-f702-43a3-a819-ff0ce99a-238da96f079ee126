/**
 * The four sessions the stage plays, one per selling point in the UI4A brief. Each card is a real
 * `.tsx` file next to this one, loaded as text and streamed into partial-react — what you see on the
 * page is the plugin's pipeline running, not a recording of it.
 */
import budget from "../cards/budget.tsx?raw";
import orbit from "../cards/orbit.tsx?raw";
import breakout from "../cards/breakout.tsx?raw";
import interest from "../cards/interest.tsx?raw";
import { centerOf, type Cursor } from "./cursor.ts";
import type { Clock } from "./clock.ts";
import type { IconName } from "../ui/icons.tsx";

export type Ctx = { clock: Clock; cursor: Cursor; q: (selector: string, text?: string) => HTMLElement | null };

export type Case = {
  id: string;
  /** The tab label under the stage, and which point of the brief it proves. */
  tab: string;
  point: string;
  session: string;
  prompt: string;
  tools: [IconName, string, string][];
  /**
   * Later turns of the same conversation: the reader asks for more, the model edits the file, and the
   * new source lands in the surface that is already running — same mount, state and motion intact.
   */
  turns?: { prompt: string; edit: string; reply: string; source: string }[];
  lead: string;
  file: string;
  source: string;
  surface: "inline" | "canvas";
  /** What the cursor does — started when streaming starts, so it acts on a card still being written. */
  play: (ctx: Ctx) => Promise<void>;
};

/** React Aria nests the range input in a visually-hidden div inside the thumb; the thumb is two levels up. */
/** `src` with everything from `from` up to `to` removed, and every line starting with one of `tags`. */
const without = (src: string, from: string, to: string, tags: string[]) =>
  (src.slice(0, src.indexOf(from)) + src.slice(src.indexOf(to)))
    .split("\n")
    .filter((l) => !tags.some((t) => l.trimStart().startsWith(t)))
    .join("\n");

/** The atom in three passes: the nucleus alone, then the shells, then the dust — each a real edit of the last. */
const ATOM = [without(orbit, "function Shell", "export default", ["<Shell", "<Dust"]), without(orbit, "function Dust", "export default", ["<Dust"]), orbit];

const thumb = (q: Ctx["q"]) => () => q("input[type=range]")?.parentElement?.parentElement ?? null;
/** A point `f` of the way along the knob's track — where a drag should end. */
const along = (knob: () => HTMLElement | null, f: number) => () => {
  const t = knob()?.parentElement?.getBoundingClientRect();
  return t ? { x: t.left + t.width * f, y: t.top + t.height / 2 } : null;
};

export const CASES: Case[] = [
  {
    id: "breakout",
    tab: "Playable while streaming",
    point: "The board, the paddle and the ball arrive before the bricks do — it is playable before the file is finished.",
    session: "Something fun",
    prompt: "bored. make me a tiny game",
    tools: [["skill", "Skill", "generative-ui"]],
    lead: "Breakout — move inside the board to steer.",
    file: "breakout.ui4a.tsx",
    source: breakout,
    surface: "inline",
    async play({ clock, cursor, q }) {
      await clock.until(() => q("[data-board]"));
      const board = () => q("[data-board]");
      const ball = () => q("[data-ball]");
      await cursor.glide(centerOf(board, 0.5, 0.88));
      await clock.until(() => ball(), 50);
      await cursor.follow(() => {
        const b = ball()?.getBoundingClientRect();
        const r = board()?.getBoundingClientRect();
        return r ? { x: b ? b.left + b.width / 2 : r.left + r.width / 2, y: r.top + r.height * 0.9 } : null;
      }, 9000);
    },
  },
  {
    id: "budget",
    tab: "Interact mid-stream",
    point: "The slider works before the card is finished — the model is still typing the totals below it.",
    session: "Tokyo trip budget",
    prompt: "how much is 4 nights in Tokyo?",
    tools: [
      ["context", "Context injection", "skill-catalog"],
      ["skill", "Skill", "generative-ui"],
    ],
    lead: "Depends on where you sleep — drag it and see:",
    file: "budget.ui4a.tsx",
    source: budget,
    surface: "inline",
    async play({ clock, cursor, q }) {
      await clock.until(() => q("input[type=range]"));
      const knob = thumb(q);
      const track = () => knob()?.parentElement ?? null;
      // Swept twice on purpose: NumberFlow is only interesting while the value is moving.
      await cursor.drag(centerOf(knob), along(knob, 0.88), track);
      await clock.wait(450);
      await cursor.drag(centerOf(knob), along(knob, 0.22), track);
      await clock.wait(450);
      await cursor.drag(centerOf(knob), along(knob, 0.55), track);
      await clock.until(() => q("button", "ryokan"));
      await cursor.click(centerOf(() => q("button", "ryokan")));
      await clock.wait(550);
      await cursor.click(centerOf(() => q("button", "hostel")));
    },
  },
  {
    id: "orbit",
    tab: "Edits land in a running scene",
    point: "`@react-three/fiber` from esm.sh. Two follow-ups rewrite the file while the atom keeps spinning — nothing restarts.",
    session: "Atom model",
    prompt: "make me a little atom model I can keep open",
    tools: [
      ["skill", "Skill", "generative-ui"],
      ["edit", "Write", ".dsh/ui4a/canvases/orbit.ui4a.tsx"],
    ],
    turns: [
      { prompt: "give it electron shells", edit: "orbit.ui4a.tsx · add three shells", reply: "Three shells on their own tilts — the nucleus never stopped.", source: ATOM[1] },
      { prompt: "and some dust drifting around it", edit: "orbit.ui4a.tsx · add two dust layers", reply: "Two layers, drifting opposite ways.", source: ATOM[2] },
    ],
    lead: "Opened it in the canvas — it stays there while we talk.",
    file: "orbit.ui4a.tsx",
    source: ATOM[0],
    surface: "canvas",
    async play({ clock, cursor, q }) {
      await clock.until(() => q("canvas") && q("input[type=range]"));
      const knob = thumb(q);
      await cursor.drag(centerOf(knob), along(knob, 0.7), () => knob()?.parentElement ?? null);
    },
  },
  {
    id: "interest",
    tab: "Any npm package, wired to the host",
    point: "KaTeX and NumberFlow straight from npm; the answer persists, and one click starts the next turn.",
    session: "Savings, then a trip",
    prompt: "what does 2k at 5% become?",
    tools: [["skill", "Skill", "generative-ui"]],
    lead: "Here's the curve — the button hands the result back to me.",
    file: "interest.ui4a.tsx",
    source: interest,
    surface: "inline",
    async play({ clock, cursor, q }) {
      await clock.until(() => q("input[type=range]"));
      const knob = thumb(q);
      const track = () => knob()?.parentElement ?? null;
      // Long sweeps so the odometer actually rolls — a single short drag barely moves the total.
      await cursor.drag(centerOf(knob), along(knob, 0.92), track);
      await clock.wait(500);
      await cursor.drag(centerOf(knob), along(knob, 0.18), track);
      await clock.wait(500);
      await cursor.drag(centerOf(knob), along(knob, 0.62), track);
      await clock.until(() => q("button", "Spend the interest"));
      await clock.wait(550);
      await cursor.click(centerOf(() => q("button", "Spend the interest")));
    },
  },
];
