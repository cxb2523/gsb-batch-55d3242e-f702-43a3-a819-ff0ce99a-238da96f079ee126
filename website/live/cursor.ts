/**
 * An autoplay cursor with mass, after macaron-genui-demo#1482: a 2D spring stepped at ≤1/120s,
 * a fresh frequency and damping per glide so no two moves look alike, velocity carried across glides
 * and bled off when there is no target. Its events are real DOM events on the element under its tip,
 * so the card it drives cannot tell it from a mouse.
 *
 * One addition: the moment a real pointer moves over the stage, it fades out and every pending
 * action waits — the visitor is driving now. It comes back where it was, never teleporting, once the
 * pointer leaves or simply rests: a visitor who stops moving has stopped driving.
 */
import { advance, reducedMotion } from "./motion.ts";
import type { Clock } from "./clock.ts";

type Point = { x: number; y: number };
/** Client coordinates, re-read every frame — the thing it chases may be moving. */
export type Target = () => Point | null;

export const centerOf =
  (el: () => Element | null | undefined, fx = 0.5, fy = 0.5): Target =>
  () => {
    const r = el()?.getBoundingClientRect();
    return r && r.width > 0 ? { x: r.left + r.width * fx, y: r.top + r.height * fy } : null;
  };

export function createCursor(stage: HTMLElement, node: HTMLElement, clock: Clock) {
  const px = { x: 0, v: 0 };
  const py = { x: 0, v: 0 };
  const press = { x: 1, v: 0 };
  const alpha = { x: 0, v: 0 };
  let target: Target | null = null;
  let response = 0.7;
  let damping = 1;
  let tail = 0;
  let pressTo = 1;
  let placed = false;
  let yielded = false;
  let down = false;
  let hover = false;
  let scrub: (() => Element | null) | null = null;
  let sinceHover = 0;
  let idle = 0;

  const origin = () => stage.getBoundingClientRect();
  const client = () => {
    const r = origin();
    return { clientX: r.left + px.x, clientY: r.top + py.x };
  };

  function fire(type: string, at?: Element | null) {
    const c = client();
    const el = at ?? document.elementFromPoint(c.clientX, c.clientY);
    if (!el) return;
    const init = { bubbles: true, cancelable: true, composed: true, view: window, ...c, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: down ? 1 : 0 };
    el.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, init) : new MouseEvent(type, init));
  }

  function spark() {
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("span");
      s.className = "ui4a-spark";
      s.style.cssText = `left:${px.x}px;top:${py.x}px;--a:${i * 45 + 22}deg`;
      s.addEventListener("animationend", () => s.remove());
      stage.append(s);
    }
  }

  const resume = (ms: number) => {
    clearTimeout(idle);
    idle = window.setTimeout(() => {
      yielded = false;
    }, ms);
  };
  const onMove = (e: PointerEvent) => {
    if (!e.isTrusted) return;
    yielded = true;
    resume(2600);
  };
  const onLeave = () => resume(1400);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerdown", onMove);
  stage.addEventListener("pointerleave", onLeave);

  const free = () => clock.until(() => !yielded, 16);

  function place(t: Point) {
    if (placed) return;
    const r = origin();
    px.x = Math.min(r.width - 24, t.x - r.left + 160);
    py.x = r.height + 30;
    tail = px.x;
    placed = true;
  }

  function step(dt: number) {
    const t = target?.();
    if (t) {
      const r = origin();
      advance(px, t.x - r.left, dt, response, damping);
      advance(py, t.y - r.top, dt, response, damping);
    } else {
      const bleed = Math.max(0, 1 - dt * 6);
      px.v *= bleed;
      py.v *= bleed;
      px.x += px.v * dt;
      py.x += py.v * dt;
    }
    tail += (px.x - tail) * Math.min(1, 8 * dt);
    advance(press, pressTo, dt, 0.16, 0.6);
    advance(alpha, placed && !yielded ? 1 : 0, dt, 0.35);
    const rot = 30 * Math.tanh((px.x - tail) * 0.02);
    node.style.transform = `translate3d(${px.x}px,${py.x}px,0) rotate(${rot}deg) scale(${press.x})`;
    node.style.opacity = String(Math.max(0, Math.min(1, alpha.x)));
    if ((hover || scrub) && !yielded && (sinceHover += dt) > 0.04) {
      sinceHover = 0;
      if (scrub) {
        const el = scrub();
        down = true;
        fire("pointerdown", el);
        down = false;
        fire("pointerup", el);
      } else {
        fire("pointermove");
        fire("mousemove");
      }
    }
  }

  async function glide(t: Target, { maxMs = 1500, snappy = false } = {}) {
    await free();
    const first = t();
    if (!first) return;
    place(first);
    target = t;
    response = snappy ? 0.32 : 1 / (1.15 + Math.random() * 0.5);
    damping = 0.95 + Math.random() * 0.2;
    const start = clock.now;
    await clock.until(() => {
      const g = t();
      if (!g) return true;
      const r = origin();
      return (Math.hypot(g.x - r.left - px.x, g.y - r.top - py.x) < 2.5 && Math.hypot(px.v, py.v) < 30) || clock.now - start > maxMs;
    }, 16);
  }

  async function click(t: Target) {
    await glide(t);
    await free();
    const c = client();
    const el = document.elementFromPoint(c.clientX, c.clientY);
    if (!el) return;
    pressTo = 0.82;
    spark();
    down = true;
    fire("pointerdown", el);
    fire("mousedown", el);
    await clock.wait(110);
    down = false;
    pressTo = 1;
    fire("pointerup", el);
    fire("mouseup", el);
    ((el.closest("button,[role=button],label,a") as HTMLElement | null) ?? (el as HTMLElement)).click?.();
  }

  /**
   * Drags by scrubbing: every ~40ms a press-and-release on `track` at the tip. One long press would
   * die with the first recompile mid-stream — the card remounts and the library's move listener goes
   * with it — while a press per step lands on whatever slider is there now. It still reads as a drag.
   */
  async function drag(from: Target, to: Target, track: () => Element | null) {
    await glide(from);
    await free();
    pressTo = 0.88;
    scrub = track;
    try {
      await glide(to, { maxMs: 1100 });
    } finally {
      scrub = null;
      pressTo = 1;
    }
  }

  /** Chases a moving target for `ms`, sending moves the whole time — how it plays the game. */
  async function follow(t: Target, ms: number) {
    await glide(t, { snappy: true, maxMs: 600 });
    hover = true;
    response = 0.22;
    damping = 0.9;
    target = t;
    await clock.wait(ms);
    hover = false;
  }

  const rest = () => {
    target = null;
  };
  const dispose = () => {
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("pointerdown", onMove);
    stage.removeEventListener("pointerleave", onLeave);
    clearTimeout(idle);
  };

  return { step, glide, click, drag, follow, rest, dispose, enabled: !reducedMotion() };
}
export type Cursor = ReturnType<typeof createCursor>;
