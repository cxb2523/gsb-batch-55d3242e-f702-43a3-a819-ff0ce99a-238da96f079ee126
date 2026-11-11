/**
 * Every moving thing on the page is a spring stepped from its current value and velocity, so any
 * animation can be retargeted mid-flight without a jump — the one rule the page's motion keeps.
 */
import { useEffect, useLayoutEffect, useRef } from "react";

export const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Semi-implicit Euler. `response` is the period in seconds, `damping` the ratio (1 = no overshoot). */
export function stepSpring(s: { x: number; v: number }, target: number, dt: number, response = 0.4, damping = 1) {
  const k = (2 * Math.PI) / response;
  s.v += (k * k * (target - s.x) - 2 * damping * k * s.v) * dt;
  s.x += s.v * dt;
}

/** Sub-stepped at ≤1/120s: a 1/30s frame on a busy main thread would otherwise blow the spring up. */
export function advance(s: { x: number; v: number }, target: number, dt: number, response?: number, damping?: number) {
  const n = Math.ceil(dt * 120);
  for (let i = 0; i < n; i++) stepSpring(s, target, dt / n, response, damping);
}

/** One rAF loop for the lifetime of the component; `tick` gets seconds, clamped so a background tab does not teleport. */
export function useFrame(tick: (dt: number, now: number) => void, active = true) {
  const ref = useRef(tick);
  useLayoutEffect(() => {
    ref.current = tick;
  });
  useEffect(() => {
    if (!active) return;
    let last = performance.now();
    let id = requestAnimationFrame(function loop(now) {
      ref.current(Math.min(0.05, (now - last) / 1000), now);
      last = now;
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [active]);
}

/** True while the element is at least partly on screen — every loop on the page pauses off screen. */
export function useInView(ref: { current: Element | null }, margin = "0px") {
  const seen = useRef(false);
  useEffect(() => {
    const io = new IntersectionObserver(
      ([entry]) => {
        seen.current = entry.isIntersecting;
      },
      { rootMargin: margin },
    );
    io.observe(ref.current!);
    return () => io.disconnect();
  }, [ref, margin]);
  return { get: () => seen.current };
}

/**
 * Keeps a scroll box pinned to its bottom on a spring, but only until the reader takes it: a wheel,
 * touch or drag hands the scroll over, and following resumes from wherever they left it once they
 * scroll back to the bottom or let go for a moment. `to` overrides the bottom while it returns a value.
 */
export function useFollowScroll(ref: { current: HTMLElement | null }, response = 0.6, to?: (el: HTMLElement) => number | null) {
  const y = useRef({ x: 0, v: 0 });
  const held = useRef(-Infinity);
  // On window, not the element: a box remounted per scene would drop listeners attached to the old one.
  useEffect(() => {
    const take = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) held.current = performance.now();
    };
    const events = ["wheel", "touchmove", "pointerdown"] as const;
    for (const type of events) addEventListener(type, take, { passive: true });
    return () => {
      for (const type of events) removeEventListener(type, take);
    };
  }, [ref]);
  useFrame((dt, now) => {
    const el = ref.current;
    if (!el) return;
    const bottom = Math.max(0, el.scrollHeight - el.clientHeight);
    if (now - held.current < 2200 && bottom - el.scrollTop > 4) {
      y.current = { x: el.scrollTop, v: 0 };
      return;
    }
    advance(y.current, to?.(el) ?? bottom, dt, response, 1);
    el.scrollTop = y.current.x;
  });
  return () => {
    y.current = { x: 0, v: 0 };
    held.current = -Infinity;
  };
}

type Spring = { x: number; v: number };
const stop = (s: Spring) => {
  s.x = s.v = 0;
};

/**
 * FLIP on springs for the transcript: a row that moves because something above or below it changed
 * springs from where it was, a new row rises in, and the user's message lifts out of the composer.
 * Offsets are added to the live spring, so a row that moves again mid-flight keeps its velocity.
 */
export function useFlip(box: { current: HTMLElement | null }, from?: { current: HTMLElement | null }) {
  const rows = useRef(new Map<HTMLElement, { top: number; x: Spring; y: Spring }>());
  useLayoutEffect(() => {
    const seen = rows.current;
    const kids = [...(box.current?.children ?? [])] as HTMLElement[];
    for (const el of seen.keys()) if (!kids.includes(el)) seen.delete(el);
    if (reducedMotion()) return;
    for (const el of kids) {
      const row = seen.get(el);
      if (row) {
        row.y.x += row.top - el.offsetTop;
        row.top = el.offsetTop;
        continue;
      }
      const next = { top: el.offsetTop, x: { x: 0, v: 0 }, y: { x: 10, v: 0 } };
      const src = from?.current;
      const morph = el.querySelector<HTMLElement>("[data-morph]");
      if (morph && src) {
        const a = src.getBoundingClientRect();
        const b = morph.getBoundingClientRect();
        next.x.x = a.left - b.left;
        next.y.x = a.top - b.top;
      }
      seen.set(el, next);
    }
  });
  useFrame((dt) => {
    for (const [el, r] of rows.current) {
      if (!r.x.x && !r.y.x && !r.x.v && !r.y.v) continue;
      advance(r.x, 0, dt, 0.5, 0.9);
      advance(r.y, 0, dt, 0.45, 0.95);
      if (Math.abs(r.x.x) + Math.abs(r.y.x) < 0.2 && Math.abs(r.x.v) + Math.abs(r.y.v) < 4) {
        stop(r.x);
        stop(r.y);
      }
      el.style.setProperty("transform", r.x.x || r.y.x ? `translate3d(${r.x.x}px,${r.y.x}px,0)` : "");
    }
  });
}
