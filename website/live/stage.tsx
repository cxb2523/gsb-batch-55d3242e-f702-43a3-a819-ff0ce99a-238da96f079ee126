import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CASES, type Case } from "./cases.ts";
import { CANCEL, createClock } from "./clock.ts";
import { centerOf, createCursor, type Cursor } from "./cursor.ts";
import { advance, reducedMotion, useFlip, useFollowScroll, useFrame, useInView } from "./motion.ts";
import { createRenderer, prewarm } from "./runtime.ts";
import { highlight, rate, reveal } from "./stream.ts";
import { Composer, Frame, Header, Sidebar, ToolRow, UserBubble } from "../ui/dsh.tsx";
import { Icon } from "../ui/icons.tsx";

type Phase = "typing" | "sent" | "tools" | "lead" | "card" | "edit" | "done";
/** `turn` counts the follow-ups sent so far; `draft` is whatever the composer holds. */
type Scene = { n: number; c: Case; phase: Phase; leaving?: boolean; draft: string; tools: number; lead: number; turn: number; painted: number | null };
/** What the frame loop advances: read by the few things that move per character, so the stage does not re-render for each. */
type Live = { pos: number; ms: number };

const SPEEDS = [0.5, 1, 2] as const;
const HOLD_MS = 2600;

/** A height that springs toward its content's, so a card growing line by line never jumps. */
function Grow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const h = useRef({ x: 0, v: 0 });
  useFrame((dt) => {
    if (!inner.current || !outer.current) return;
    const target = inner.current.offsetHeight;
    advance(h.current, target, dt, 0.45, 1);
    if (Math.abs(h.current.x - target) < 0.5 && Math.abs(h.current.v) < 5) h.current.x = target;
    outer.current.style.height = `${h.current.x}px`;
  });
  return (
    <div ref={outer} className={`overflow-hidden ${className}`}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

/** The active tab's bar, written straight to the style each frame. */
function Progress({ scene, live }: { scene: Scene; live: { current: Live } }) {
  const bar = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const f = scene.phase === "done" || scene.turn > 0 ? 1 : (live.current.pos / scene.c.source.length) * 0.9 + (scene.phase === "typing" ? 0 : 0.1);
    bar.current?.style.setProperty("transform", `scaleX(${f})`);
  });
  return <span ref={bar} className="block h-full origin-left scale-x-0 rounded-full bg-[#7aaaff] transition-transform duration-300 ease-out" />;
}

const Line = memo(({ text, fresh }: { text: string; fresh?: boolean }) => (
  <div className={`min-h-[18px] whitespace-pre ${fresh ? "-mx-4 bg-[#7aaaff14] px-4" : ""}`}>
    {highlight(text).map((p, i) => (
      <span key={i} className={p.kind && `hl-${p.kind}`}>
        {p.text}
      </span>
    ))}
  </div>
));

/** The source as it arrives, followed at the bottom by a spring so the scroll has momentum too. */
function Source({ scene, live, speed, setSpeed }: { scene: Scene; live: { current: Live }; speed: number; setSpeed: (s: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  // While an edit is being typed, follow the lines it adds rather than the bottom of the file.
  const reset = useFollowScroll(box, 0.6, (el) => (mark.current ? Math.max(0, Math.min(el.scrollHeight - el.clientHeight, mark.current.offsetTop - el.clientHeight * 0.55)) : null));
  const [{ code, ms }, setView] = useState({ code: 0, ms: 0 });
  useFrame(() => {
    const next = Math.floor(live.current.pos);
    setView((v) => (v.code === next ? v : { code: next, ms: live.current.ms }));
  });
  const turns = scene.c.turns ?? [];
  const target = scene.turn ? turns[scene.turn - 1].source : scene.c.source;
  const lines = scene.turn
    ? reveal(scene.turn > 1 ? turns[scene.turn - 2].source : scene.c.source, target, scene.phase === "sent" ? 0 : scene.phase === "edit" ? code : Infinity)
    : scene.c.source
        .slice(0, code)
        .split("\n")
        .map((text) => ({ text, fresh: false }));
  const last = lines.findLastIndex((l) => l.fresh);
  const tokens = Math.round(code / 3.6);
  useEffect(reset, [scene.n]);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#ffffff1f] bg-[#1b1b1c]">
      <div className="flex h-10 items-center gap-3 border-b border-[#ffffff0f] bg-[#2c2c2e] px-4 text-[11px] text-[#adb2b8]">
        <span className="font-mono text-[#cfd3d6]">ui4a/tsx</span>
        <span className="truncate">{scene.c.surface === "canvas" ? `.dsh/ui4a/canvases/${scene.c.file}` : "inline"}</span>
        <div role="radiogroup" aria-label="Streaming speed" className="ml-auto flex rounded-full bg-[#1b1b1c] p-0.5">
          {SPEEDS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)} className={`rounded-full px-2 py-0.5 tabular-nums transition-colors duration-200 ${speed === s ? "bg-[#43454a] text-[#f9fafb]" : "hover:text-[#f9fafb]"}`}>
              {s}×
            </button>
          ))}
        </div>
      </div>
      <div ref={box} className="ui4a-scroll relative min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-[18px] text-[#cfd3d6]">
        {lines.map((l, i) => (
          <div key={i} ref={i === last ? mark : undefined}>
            <Line text={l.text} fresh={l.fresh} />
          </div>
        ))}
        {scene.phase === "card" && <span className="ui4a-caret" />}
      </div>
      <div className="flex h-9 items-center gap-4 border-t border-[#ffffff0f] px-4 text-[11px] tabular-nums text-[#81858c]">
        <span>
          <b className="font-medium text-[#cfd3d6]">{tokens}</b> tokens
        </span>
        <span>
          <b className="font-medium text-[#cfd3d6]">{((code ? ms : 0) / 1000).toFixed(1)}</b>s
        </span>
        <span className={`ml-auto transition-opacity duration-500 ${scene.painted === null ? "opacity-0" : "opacity-100"}`}>
          first paint at <b className="font-medium text-[#7aaaff]">{Math.round((scene.painted ?? 0) / 3.6)}</b> tokens
        </span>
      </div>
    </div>
  );
}

export function Stage() {
  const stage = useRef<HTMLDivElement>(null);
  const pointer = useRef<HTMLDivElement>(null);
  const send = useRef<HTMLButtonElement>(null);
  const mount = useRef<HTMLDivElement | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const inView = useInView(stage, "-10% 0px");
  const [clock] = useState(createClock);
  const cursor = useRef<Cursor | null>(null);
  const [scene, setScene] = useState<Scene>(() => ({ n: 0, c: CASES[0], phase: "typing", draft: "", tools: 0, lead: 0, turn: 0, painted: null }));
  const [past, setPast] = useState<string[]>([]);
  const [speed, setSpeed] = useState(1);
  const [sent, setSent] = useState<string | null>(null);
  const jumpTo = useRef<number | null>(null);
  const live = useRef({ scene, speed, pos: 0, ms: 0, edit: 0, renderer: null as ReturnType<typeof createRenderer> | null });
  useLayoutEffect(() => {
    live.current.scene = scene;
    live.current.speed = speed;
  });

  useLayoutEffect(() => {
    cursor.current = createCursor(stage.current!, pointer.current!, clock);
    prewarm();
    return () => cursor.current?.dispose();
  }, [clock]);

  // Text arrives on the frame clock, so pausing the stage pauses the stream mid-token, not mid-sentence.
  useFrame((dt) => {
    if (!inView.get() || document.hidden) return;
    clock.tick(dt * 1000);
    cursor.current!.step(dt);
    const l = live.current;
    const s = l.scene;
    if (s.phase === "card" && l.renderer) {
      l.ms += dt * 1000;
      const before = Math.floor(l.pos);
      l.pos = Math.min(s.c.source.length, l.pos + rate(s.c.source, l.pos) * l.speed * dt);
      const next = Math.floor(l.pos);
      if (next > before) void l.renderer.then((r) => r.pushCode(s.c.source.slice(before, next)));
    }
    // An edit is one tool call: its lines are typed into the source pane, and the file lands whole when it is done.
    if (s.phase === "edit") {
      l.ms += dt * 1000;
      l.pos = Math.min(l.edit, l.pos + 700 * l.speed * dt);
    }
  });

  useEffect(() => {
    const q = (selector: string, text?: string) => {
      const all = [...(mount.current?.querySelectorAll<HTMLElement>(selector) ?? [])];
      return (text ? all.find((el) => el.textContent?.includes(text)) : all[0]) ?? null;
    };
    const step = (patch: Partial<Scene>) => setScene((p) => ({ ...p, ...patch }));
    let n = 0;

    /** Types word by word while the cursor is already on its way to Send, and presses it as the last word lands. */
    async function type(text: string) {
      // Runs beside the typing, so a cancel mid-word would leave its rejection with no one awaiting it.
      const aim = cursor.current?.enabled
        ? cursor.current
            .glide(
              centerOf(() => send.current),
              { maxMs: 2400 },
            )
            .catch(() => {})
        : null;
      if (reducedMotion()) step({ draft: text });
      else {
        let at = 0;
        for (const w of text.split(/(?<=\s)/)) {
          at += w.length;
          step({ draft: text.slice(0, at) });
          await clock.wait(/[.?!]\s?$/.test(w) ? 150 : 55 + Math.random() * 40);
        }
      }
      if (aim) {
        await aim;
        await cursor.current!.click(centerOf(() => send.current));
      }
      step({ draft: "" });
    }

    async function lead(text: string) {
      for (let k = 1; k <= text.length; k += 2) {
        step({ lead: k });
        await clock.wait(16);
      }
      step({ lead: text.length });
    }

    async function play(i: number) {
      const c = CASES[i % CASES.length];
      const reduced = reducedMotion();
      const inline = c.surface === "inline";
      live.current.pos = 0;
      live.current.ms = 0;
      setScene({ n: ++n, c, phase: "typing", draft: "", tools: 0, lead: 0, turn: 0, painted: null });
      await type(c.prompt);
      step({ phase: "sent" });
      cursor.current?.rest();
      await clock.wait(450);
      for (let k = 1; k <= c.tools.length; k++) {
        step({ phase: "tools", tools: k });
        await clock.wait(620);
      }
      // Inline, the reply leads into the card; a canvas is the Write itself, and the reply follows it.
      if (inline) {
        step({ phase: "lead" });
        await lead(c.lead);
      }
      step({ phase: "card" });
      await clock.until(() => live.current.renderer);
      if (reduced) {
        live.current.pos = c.source.length;
        void live.current.renderer!.then((r) => r.render(c.source));
      }
      const acting = (cursor.current?.enabled ? c.play({ clock, cursor: cursor.current, q }) : Promise.resolve()).catch(() => {});
      await clock.until(() => live.current.pos >= c.source.length);
      void live.current.renderer!.then((r) => r.finish());
      if (!inline) await lead(c.lead);
      step({ phase: "done" });
      // A script waiting on something the visitor removed would stall the loop; it gets a deadline instead.
      // Cancelling unwinds only that script's waits; this scene still holds and fades out as usual.
      if (await Promise.race([acting.then(() => false), clock.wait(14000).then(() => true)])) clock.cancel();
      cursor.current?.rest();
      let prev = c.source;
      for (const [k, t] of (c.turns ?? []).entries()) {
        await clock.wait(700);
        await type(t.prompt);
        step({ phase: "sent", turn: k + 1 });
        cursor.current?.rest();
        await clock.wait(520);
        live.current.pos = 0;
        live.current.ms = 0;
        live.current.edit = reveal(prev, t.source, Infinity).reduce((sum, l) => sum + (l.fresh ? l.text.length + 1 : 0), 0);
        step({ phase: "edit" });
        await clock.until(() => live.current.pos >= live.current.edit);
        // Same renderer, same mount: the new file swaps in under a scene that never stops moving.
        void live.current.renderer!.then((r) => r.render(t.source));
        prev = t.source;
        await clock.wait(380);
        step({ phase: "done" });
      }
      await clock.wait(HOLD_MS);
      step({ leaving: true });
      await clock.wait(420);
      setSent(null);
      setPast((p) => [c.session, ...p].slice(0, 3));
    }

    const onSend = (e: Event) => setSent((e as CustomEvent<string>).detail);
    addEventListener("ui4a:send", onSend);
    let i = 0;
    let stopped = false;
    (async () => {
      while (!stopped) {
        try {
          await play(i++);
        } catch (e) {
          if (e !== CANCEL) console.error(e);
          i = jumpTo.current ?? i;
          jumpTo.current = null;
        }
      }
    })();
    return () => {
      stopped = true;
      clock.cancel();
      removeEventListener("ui4a:send", onSend);
    };
  }, [clock]);

  useFlip(transcript, composer);
  useFollowScroll(scroller, 0.5);

  const pick = (i: number) => {
    jumpTo.current = i;
    clock.cancel();
  };

  // One renderer per scene, mounted into that scene's own node so the outgoing one can fade with its card intact.
  const attach = (node: HTMLDivElement | null) => {
    if (!node || node === mount.current) return;
    mount.current = node;
    const n = scene.n;
    live.current.renderer?.then((r) => r.detach());
    // A compiled frame is not a painted one: mid-stream the default export is often an empty shell.
    live.current.renderer = createRenderer(node, () => (node.textContent?.trim() || node.querySelector("canvas,svg")) && setScene((p) => (p.n === n && p.painted === null ? { ...p, painted: Math.floor(live.current.pos) } : p)));
  };

  const s = scene;
  const shown = s.phase !== "typing";
  const card = s.phase === "card" || s.phase === "edit" || s.phase === "done" || s.turn > 0;
  const canvas = s.c.surface === "canvas" && card && !s.leaving;

  return (
    <div className="relative">
      <div ref={stage} data-phase={s.phase} className="ui4a-stage relative flex h-[640px] gap-4 max-lg:h-[600px]">
        <Frame className="min-w-0 flex-1" sidebar={<Sidebar sessions={shown ? [s.c.session, ...past] : past} active={shown ? 0 : -1} />}>
          <Header title={shown ? s.c.session : "New session"} />
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div key={s.n} ref={scroller} className={`ui4a-scroll flex ${s.leaving ? "ui4a-leave" : ""} min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-6 pb-4 pt-6 max-sm:px-4`}>
                <div ref={transcript} className="ui4a-scene relative mt-auto flex flex-col gap-3 [&>*]:shrink-0">
                  {shown && <UserBubble>{s.c.prompt}</UserBubble>}
                  {s.c.tools.slice(0, s.tools).map(([icon, kind, detail], k) => (
                    <ToolRow key={k} icon={icon} kind={kind} detail={detail} done={k < s.tools - 1 || s.lead > 0} />
                  ))}
                  {s.lead > 0 && <p className="ui4a-fade text-[14px] leading-6 text-[#f9fafb]">{s.c.lead.slice(0, s.lead)}</p>}
                  {s.c.surface === "inline" && card && (
                    <Grow className="ui4a-fade">
                      <div ref={attach} data-ui4a-live className="ui4a-card max-w-[440px]" />
                    </Grow>
                  )}
                  {sent && (
                    <div className="ui4a-fade flex items-center gap-2 self-end rounded-full bg-[#34415b] px-3 py-1.5 text-[12px] text-[#cfd3d6]">
                      <Icon name="send" className="size-3" /> sendMessage → “{sent}”
                    </div>
                  )}
                  {(s.c.turns ?? []).slice(0, s.turn).map((t, k) => {
                    const over = k < s.turn - 1 || s.phase === "done";
                    return (
                      <Fragment key={`t${k}`}>
                        <UserBubble>{t.prompt}</UserBubble>
                        {(over || s.phase === "edit") && <ToolRow icon="edit" kind="Edit" detail={t.edit} done={over} />}
                        {over && <p className="ui4a-fade text-[14px] leading-6 text-[#f9fafb]">{t.reply}</p>}
                      </Fragment>
                    );
                  })}
                  {s.phase === "done" && s.turn === (s.c.turns?.length ?? 0) && (
                    <div className="ui4a-fade text-[12px] text-[#81858c]">
                      Completed in {(2 + s.c.source.length / 900).toFixed(0)}s · {s.c.tools.length + (s.c.turns?.length ?? 0)} tool calls
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 pb-5 max-sm:px-3 max-sm:pb-3">
                <div ref={composer}>
                  <Composer text={s.draft} narrow={canvas} sendRef={send} onSend={() => setScene((p) => (p.phase === "typing" ? { ...p, phase: "sent" } : p))} />
                </div>
              </div>
            </div>
            <div className={`ui4a-canvas shrink-0 overflow-hidden border-l border-[#ffffff0f] ${canvas ? "w-[46%]" : "w-0 border-transparent"}`}>
              <div className="flex h-11 items-center justify-between gap-2 px-4 text-[14px] font-medium text-[#f9fafb]">
                <span className="truncate">orbit</span>
                <Icon name="close" className="size-3.5 shrink-0 text-[#81858c]" />
              </div>
              {canvas && <div key={s.n} ref={attach} data-ui4a-live className="ui4a-card px-4" />}
            </div>
          </div>
        </Frame>
        <div className="hidden w-[340px] shrink-0 flex-col xl:flex">
          <Source scene={s} live={live} speed={speed} setSpeed={setSpeed} />
        </div>
        <div ref={pointer} aria-hidden className="ui4a-pointer pointer-events-none absolute left-0 top-0 z-20 opacity-0">
          <svg width="22" height="24" viewBox="0 0 22 24">
            <path d="M2 1.5 19.5 13l-7.6 1.6L7.6 22z" fill="#f9fafb" stroke="#151517" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div role="tablist" aria-label="Demos" className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        {CASES.map((c, i) => {
          const active = c.id === s.c.id;
          return (
            <button key={c.id} type="button" role="tab" aria-selected={active} onClick={() => pick(i)} className="group self-start text-left">
              <span className="block h-[2px] overflow-hidden rounded-full bg-[#ffffff1f]">{active ? <Progress scene={s} live={live} /> : <span className="block h-full origin-left scale-x-0 rounded-full bg-[#7aaaff] transition-transform duration-300 ease-out" />}</span>
              <span className={`mt-3 block text-[14px] font-medium transition-colors duration-300 ${active ? "text-[#f9fafb]" : "text-[#81858c] group-hover:text-[#cfd3d6]"}`}>{c.tab}</span>
              <span className={`mt-1 block text-[13px] leading-5 transition-colors duration-300 ${active ? "text-[#adb2b8]" : "text-[#5d6066]"}`}>{c.point}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
