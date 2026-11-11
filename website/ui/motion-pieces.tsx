/**
 * Two sections that are pure motion: a headline that streams in the way the cards do, and a race
 * between the same answer written two ways. The race is a function of one clock modulo its period,
 * so its last frame is its first — it loops without a seam and only runs while it is on screen.
 */
import { useRef, useState } from "react";
import { reducedMotion, useFrame, useInView } from "../live/motion.ts";

export function StreamedHeadline({ lines }: { lines: string[] }) {
  const text = lines.join("\n");
  const [n, setN] = useState(0);
  const t = useRef(0);
  useFrame((dt) => {
    if (n >= text.length) return;
    t.current += dt;
    setN(reducedMotion() ? text.length : Math.min(text.length, Math.floor(Math.max(0, t.current - 0.25) * 34)));
  }, n < text.length);
  const starts = lines.map((_, i) => lines.slice(0, i).reduce((a, l) => a + l.length + 1, 0));
  return (
    <h1 aria-label={lines.join(" ")} className="text-[clamp(36px,6vw,80px)] font-semibold leading-[1.02] tracking-[-0.035em] text-[#f9fafb]">
      {lines.map((line, i) => {
        const left = n - starts[i];
        const shown = line.slice(0, Math.max(0, left));
        const typing = left > 0 && left <= line.length;
        return (
          <span key={i} aria-hidden className={`block ${i === 1 ? "text-[#7aaaff]" : ""}`}>
            {/* The full line holds the box so the page below never moves while it types. */}
            <span className="relative block">
              <span className="invisible">{line}</span>
              <span className="absolute inset-0">
                {shown}
                {typing && <span className="ui4a-caret ui4a-caret-lg" />}
              </span>
            </span>
          </span>
        );
      })}
    </h1>
  );
}

const PERIOD = 9;
/** Measured on the 48-case gallery in the UI4A report: tokens to finish the same interface. */
const HTML_TOKENS = 1224;
const UI4A_TOKENS = 672;

const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

function Lane({ label, tokens, firstPaint, at, accent }: { label: string; tokens: number; firstPaint: number; at: number; accent: boolean }) {
  // The writer emits ~200 tokens a second for both lanes; only what each needs before it can paint differs.
  const written = Math.min(tokens, at * 200);
  const painted = written >= firstPaint;
  const grown = tokens === firstPaint ? 1 : ease((written - firstPaint) / (tokens - firstPaint));
  const done = written >= tokens;
  return (
    <div className="grid grid-cols-[176px_1fr] items-center gap-6 max-sm:grid-cols-1 max-sm:gap-3">
      <div>
        <div className={`text-[12px] font-medium uppercase tracking-[0.06em] ${accent ? "text-[#7aaaff]" : "text-[#81858c]"}`}>{label}</div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className={`text-[32px] font-semibold tabular-nums tracking-[-0.035em] ${accent ? "text-[#f9fafb]" : "text-[#6a6f77]"}`}>{Math.round(written)}</span>
          <span className="text-[12px] tabular-nums text-[#81858c]">/ {tokens} tok</span>
        </div>
        <div className="mt-1 text-[12px]" style={{ color: accent ? "#a8c4ff" : done ? "#cfd3d6" : "#6a6f77" }}>
          {accent ? "usable — still streaming" : done ? "ready — after every token" : "nothing until it parses"}
        </div>
      </div>
      <div>
        {/* A well in the page: fill only. The card inside answers with a stroke of its own — one signal each. */}
        <div className="relative h-[118px] overflow-hidden rounded-2xl bg-[#131316]">
          {/* How far the writer has got — the same for both lanes, so the gap below is the whole point. */}
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[#ffffff0a]" />
          <div className="absolute bottom-0 left-0 h-[3px] rounded-full" style={{ width: `${(written / HTML_TOKENS) * 100}%`, background: accent ? "#7aaaff" : "#4a4e55" }} />
          <div className="absolute inset-y-0 border-l border-dashed border-[#ffffff2e]" style={{ left: `${(firstPaint / HTML_TOKENS) * 100}%` }} />
          {/* The card itself: UI4A grows it in place, HTML only ever shows the finished one. */}
          <div className="absolute inset-3 transition-[opacity,transform] duration-500" style={{ opacity: painted ? 1 : 0, transform: `translateY(${painted ? 0 : 12}px) scale(${painted ? 1 : 0.94})` }}>
            <div className={`flex h-full flex-col gap-2 rounded-xl border-2 p-2.5 ${accent ? "border-[#7aaaff]" : "border-[#5a5e66]"}`}>
              <div className="h-2 rounded-full" style={{ width: "62%", background: accent ? "#7aaaff99" : "#5a5e66" }} />
              <div className="min-h-0 flex-1 rounded-lg" style={{ background: accent ? "linear-gradient(180deg,#7aaaff2e,#7aaaff12)" : "#232326", opacity: 0.35 + grown * 0.65 }} />
              <div className="h-2 rounded-full" style={{ width: `${28 + grown * 38}%`, background: accent ? "#7aaaff66" : "#5a5e66" }} />
            </div>
          </div>
          {/* Until it parses, HTML has an outline and nothing inside — which is the comparison. */}
          {!accent && !painted && (
            <div className="absolute inset-3 rounded-xl border border-dashed border-[#ffffff24]">
              <div className="ui4a-pulse m-2.5 h-2 w-3/5 rounded-full bg-[#ffffff14]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FirstPaintRace() {
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box);
  const [t, setT] = useState(PERIOD * 0.7);
  useFrame((dt) => {
    if (seen.get() && !reducedMotion()) setT((x) => (x + dt) % PERIOD);
  });
  // The loop fades fully out before it wraps and the reset happens while invisible — no frame jumps.
  const at = Math.max(0, Math.min(t - 0.8, PERIOD - 2));
  const fade = Math.min(1, (PERIOD - t) / 0.7, t / 0.5);
  return (
    <div ref={box} className="flex flex-col gap-5" style={{ opacity: fade }}>
      <Lane label="UI4A" tokens={UI4A_TOKENS} firstPaint={110} at={at} accent />
      <Lane label="HTML" tokens={HTML_TOKENS} firstPaint={HTML_TOKENS} at={at} accent={false} />
    </div>
  );
}
