/*
 * Fluid Mask Hero
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A sample hero card with a round "hole" that follows the pointer on a spring and shows an inverted copy of the same
 * hero underneath (ink background, white type, coloured full stop). When the pointer leaves, the hole drifts back to the
 * centre and shrinks to a resting size. Good as a landing hero or a portfolio cover.
 *
 * What it shows
 * - One card filling the element with a 40 px margin (20 px when the element is narrower than 600 px): a nav row,
 *   a large two-line title, a sub line and a button. Inside the card everything is sized in container units, and a
 *   portrait card (aspect ratio < 1) switches to a stacked phone layout.
 * - Two identical layers: the top one (white) carries a CSS mask, a radial-gradient circle that is transparent inside;
 *   the bottom one is a copy with the colours swapped. Both use the same markup and rules, so they always line up.
 * - The mask is driven by three CSS variables on the top layer: --reveal-x / --reveal-y (percent of the card),
 *   --reveal-radius (px) and --reveal-edge (soft edge, percent of the gradient).
 *
 * How it moves
 * - The hole chases its target on springs, integrated every frame (dt capped at 50 ms):
 *   position stiffness 120, damping ratio 0.78 (a soft overshoot when it stops); radius stiffness 90, damping ratio 0.7.
 *   The loop sleeps once everything has settled.
 * - Every radius is multiplied by fit = min(1, min(card width, card height) / 444), so small or portrait cards get a
 *   smaller hole.
 * - Pointer input: in
 *   the card: the hole follows it with radius revealRadius * fit. Pointer leaves (or a touch lifts / is cancelled): back
 *   to the centre with radius idleRadius * fit. On touch, press and drag (the card has touch-action: none).
 * - First frame and rest state: hole at the centre, radius idleRadius * fit. A resize while resting re-centres it.
 *
 * Options
 *   params.revealRadius  48..240, default 116 (px)  hole radius while the pointer is in the card
 *   params.edgeSoftness  0..10, default 2 (%)       width of the soft edge
 *   params.idleRadius    0..180, default 88 (px)    hole radius at rest; 0 closes it
 *
 * API
 *   const fx = mountFluidMaskHero(element, {params: {...}});
 *   fx.params                          copy of current params
 *   fx.setParams({revealRadius: 160})  change params live
 *   fx.reset()                         params back to defaults, the hole glides to the centre and resting
 *                                      size over 500 ms (ease-out .22,1,.36,1)
 *   fx.destroy()                       removes listeners, observers, the animation loop
 * There is no pause or reduced-motion setter; reduced motion is read once at mount (see below).
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountFluidMaskHero(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The hero content in the markup string inside the mount function (studio name, links, title, sub line, button).
 *   Edit the top layer only; the bottom layer is cloned from it at mount.
 * - Colours via the CSS variables; the bottom layer simply swaps paper and ink (.hero-inv). Type sizes, padding and
 *   the portrait layout in effect.css (container units, keep them relative to the card).
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The spring constants (120 / 0.78 for position, 90 / 0.7 for radius). A CSS transition or a fixed tween loses the
 *   weight and the overshoot.
 * - The hole is a mask on the top layer over a full copy below; do not fake it with a blend mode or a moving circle
 *   element, the type inside the hole has to be the real inverted layout.
 * - Keep both layers identical in markup and size, or the type inside the hole will not line up.
 * - Do not let a framework re-render the layers while it runs; the effect writes the CSS variables directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountFluidMaskHero on an embed div with a fixed height. The mask needs CSS mask-image (all current browsers).
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The top layer is a labelled group ("Sample hero"); the inverted copy is aria-hidden and inert, so screen readers
 *   and the keyboard see the content once. The effect is decorative; nothing in the card is interactive.
 * - With prefers-reduced-motion: reduce at mount time: no springs; the hole jumps straight to the
 *   pointer or to the centre, and its radius is never smaller than 150 px (times fit). A change of the setting after
 *   mount is not picked up.
 */
(function (global) {
  'use strict';

  // ---- the effect ----
  const lib = {};
  (function () {
    'use strict';
    const controls = [
      {
        key: 'revealRadius',
        label: 'Opening',
        type: 'range',
        group: 'Space',
        min: 48,
        max: 240,
        step: 1,
        default: 116,
        unit: 'px',
        description: 'Size of the area the pointer reveals.',
        visualizer: 'radius',
      },
      {
        key: 'edgeSoftness',
        label: 'Soft edge',
        type: 'range',
        group: 'Edge',
        min: 0,
        max: 10,
        step: 0.5,
        default: 2,
        unit: '%',
        description: 'Width of the mask edge falloff.',
        visualizer: 'none',
      },
      {
        key: 'idleRadius',
        label: 'Resting size',
        type: 'range',
        group: 'State',
        min: 0,
        max: 180,
        step: 1,
        default: 88,
        unit: 'px',
        description: 'Size of the opening after the pointer leaves.',
        visualizer: 'radius',
      },
    ];
    function create(parts, specimen, cardOpt) {
      const { stage, over, ring } = parts;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let values = { revealRadius: 116, edgeSoftness: 2, idleRadius: 88 };
      let pointerInside = false;
      let raf = 0;
      let last = 0;
      let pausedAt = 0;
      const cur = { x: 50, y: 50, r: 0, vx: 0, vy: 0, vr: 0 };
      const target = { x: 50, y: 50, r: 0 };
      function apply() {
        over.style.setProperty('--reveal-x', cur.x.toFixed(2) + '%');
        over.style.setProperty('--reveal-y', cur.y.toFixed(2) + '%');
        over.style.setProperty('--reveal-radius', Math.max(0, cur.r).toFixed(1) + 'px');
        over.style.setProperty('--reveal-edge', values.edgeSoftness + '%');
        if (ring) {
          ring.style.setProperty('--reveal-x', cur.x.toFixed(2) + '%');
          ring.style.setProperty('--reveal-y', cur.y.toFixed(2) + '%');
          ring.style.setProperty('--reveal-diameter', Math.max(cur.r * 2, 2).toFixed(1) + 'px');
          ring.style.opacity = cur.r < 8 ? '0' : '1';
        }
      }
      function setTarget(x, y, r, snap) {
        target.x = x;
        target.y = y;
        target.r = r;
        if (snap || reduce) {
          cur.x = x;
          cur.y = y;
          cur.r = r;
          cur.vx = cur.vy = cur.vr = 0;
          apply();
        }
        kick();
      }
      const textRange = document.createRange();
      function step(now) {
        raf = 0;
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
        last = now;
        const k = 120,
          c = 2 * Math.sqrt(k) * 0.78;
        cur.vx += ((target.x - cur.x) * k - cur.vx * c) * dt;
        cur.x += cur.vx * dt;
        cur.vy += ((target.y - cur.y) * k - cur.vy * c) * dt;
        cur.y += cur.vy * dt;
        const kr = 90,
          cr = 2 * Math.sqrt(kr) * 0.7;
        cur.vr += ((target.r - cur.r) * kr - cur.vr * cr) * dt;
        cur.r += cur.vr * dt;
        apply();
        const moving =
          Math.abs(target.x - cur.x) +
            Math.abs(target.y - cur.y) +
            Math.abs(target.r - cur.r) +
            Math.abs(cur.vx) +
            Math.abs(cur.vy) +
            Math.abs(cur.vr) >
          0.02;
        if (moving || false) kick();
        else last = 0;
      }
      function kick() {
        if (!raf && !reduce) raf = requestAnimationFrame(step);
      }
      function setPaused() {
        if (specimen.isPaused()) {
          if (!pausedAt) pausedAt = performance.now();
          return;
        }
        if (pausedAt) {
          pausedAt = 0;
        }
        kick();
      }
      function interactive() {
        const opt = cardOpt,
          base = specimen;
        const fitNow = () => {
          const r = stage.getBoundingClientRect();
          return opt.fit ? opt.fit(r.width || 1, r.height || 1) : Math.min(1, (r.height || 1) / 444);
        };
        const size = (r) => (reduce ? Math.max(r, 150) : r) * fitNow();
        specimen = { getMode: () => 'live', isPaused: base.isPaused };
        function rest(snap) {
          pointerInside = false;
          setTarget(50, 50, size(values.idleRadius), snap);
        }
        function cubicBezier(x1, y1, x2, y2) {
          const at = (a, b, s) => {
              const r = 1 - s;
              return 3 * r * s * (r * a + s * b) + s * s * s;
            },
            rate = (a, b, s) => {
              const r = 1 - s;
              return 3 * (r * r * a + 2 * r * s * (b - a) + s * s * (1 - b));
            };
          return (p) => {
            if (p <= 0) return 0;
            if (p >= 1) return 1;
            let s = p,
              done = false;
            for (let n = 0; n < 6; n++) {
              const miss = at(x1, x2, s) - p,
                k = rate(x1, x2, s);
              done = Math.abs(miss) < 1e-7;
              if (done || Math.abs(k) < 1e-6) break;
              const next = s - miss / k;
              if (next < 0 || next > 1) break;
              s = next;
            }
            if (done) return at(y1, y2, s);
            let lo = 0,
              hi = 1;
            while (hi - lo > 1e-7) {
              s = (lo + hi) / 2;
              if (at(x1, x2, s) < p) lo = s;
              else hi = s;
            }
            return at(y1, y2, (lo + hi) / 2);
          };
        }
        const out = cubicBezier(0.22, 1, 0.36, 1);
        let back = 0;
        function glide() {
          cancelAnimationFrame(back);
          back = 0;
          if (reduce) {
            rest(true);
            return;
          }
          pointerInside = false;
          const from = { x: cur.x, y: cur.y, r: cur.r },
            start = performance.now();
          const tick = (now) => {
            const u = Math.max(0, Math.min(1, (now - start) / 500)),
              e = out(u),
              r = size(values.idleRadius);
            cur.x = target.x = from.x + (50 - from.x) * e;
            cur.y = target.y = from.y + (50 - from.y) * e;
            cur.r = target.r = from.r + (r - from.r) * e;
            cur.vx = cur.vy = cur.vr = 0;
            apply();
            back = u < 1 ? requestAnimationFrame(tick) : 0;
          };
          back = requestAnimationFrame(tick);
        }
        function follow(event) {
          const rect = stage.getBoundingClientRect();
          cancelAnimationFrame(back);
          back = 0;
          pointerInside = true;
          setTarget(
            Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
            Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
            size(values.revealRadius),
          );
        }
        cardOpt = Object.assign({}, opt, {});
        const on = [];
        const listen = (type, fn) => {
          stage.addEventListener(type, fn);
          on.push([type, fn]);
        };
        listen('pointermove', (event) => {
          follow(event);
        });
        listen('pointerdown', (event) => {
          follow(event);
        });
        listen('pointerup', (event) => {
          if (event.pointerType === 'touch') rest();
        });
        listen('pointercancel', () => {
          rest();
        });
        listen('pointerleave', () => {
          rest();
        });
        const resize = new ResizeObserver(() => {
          if (!pointerInside) rest();
        });
        resize.observe(stage);
        rest(true);
        return {
          destroy() {
            cancelAnimationFrame(raf);
            raf = 0;
            cancelAnimationFrame(back);
            back = 0;
            resize.disconnect();
            on.forEach(([type, fn]) => stage.removeEventListener(type, fn));
          },
          setParams(next) {
            values = Object.assign({}, values, next);
            if (pointerInside) {
              target.r = size(values.revealRadius);
              if (reduce) cur.r = target.r;
              apply();
              kick();
            } else rest();
          },
          restore() {
            glide();
          },
          setPaused,
          status() {
            return { pointerInside, x: cur.x, y: cur.y, r: cur.r, target: Object.assign({}, target) };
          },
        };
      }
      return interactive();
    }
    lib.CommonFluidHero = {
      controls,
      mount(parts, options) {
        options = options || {};
        let paused = false;
        const host = { getMode: () => 'live', isPaused: () => paused };
        const api = create(parts, host, options.card);
        return Object.assign({}, api, {
          setPaused(value) {
            paused = !!value;
            if (typeof api.setPaused === 'function') api.setPaused();
          },
        });
      },
    };
  })();
  const LIB = lib;

  // the effect's API as the mount function sees it: every object a call returns that has destroy() is destroyed with the mount
  function ownInstances(api, owned) {
    const out = {};
    for (const name of Object.keys(api)) {
      const part = api[name];
      if (!part || typeof part !== 'object') {
        out[name] = part;
        continue;
      }
      const copy = Object.create(part);
      for (const key of Object.keys(part))
        if (typeof part[key] === 'function')
          copy[key] = function () {
            const made = part[key].apply(this === copy ? part : this, arguments);
            if (made && typeof made === 'object' && typeof made.destroy === 'function') owned.add(made);
            return made;
          };
      out[name] = copy;
    }
    return out;
  }

  // ---- mounting: stage markup, layout, motion and input ----
  function mountFluidMaskHero(element, options) {
    options = options || {};
    // destroy() puts the element back as it was and stops whatever this mount function still has scheduled
    const mounted = {
      html: element.innerHTML,
      attrs: Array.from(element.attributes, (a) => [a.name, a.value]),
      frames: new Set(),
      timers: new Set(),
      observers: new Set(),
      owned: new Set(),
      done: false,
    };
    const watched = (Base) =>
      Base &&
      class extends Base {
        constructor(cb, opts) {
          super(cb, opts);
          mounted.observers.add(this);
        }
      };
    const ResizeObserver = watched(global.ResizeObserver),
      IntersectionObserver = watched(global.IntersectionObserver),
      MutationObserver = watched(global.MutationObserver);
    mounted.restore = () => {
      mounted.done = true;
      mounted.owned.forEach((o) => {
        if (o && typeof o.destroy === 'function') o.destroy();
      });
      mounted.owned.clear();
      mounted.frames.forEach((f) => global.cancelAnimationFrame(f));
      mounted.frames.clear();
      mounted.timers.forEach((t) => {
        global.clearTimeout(t);
        global.clearInterval(t);
      });
      mounted.timers.clear();
      mounted.observers.forEach((o) => o.disconnect());
      mounted.observers.clear();
      element.innerHTML = mounted.html;
      for (const a of Array.from(element.attributes)) element.removeAttribute(a.name);
      for (const [name, value] of mounted.attrs) element.setAttribute(name, value);
    };
    const lib = ownInstances(LIB, mounted.owned);
    element.classList.add('fluid-mask-hero');
    element.innerHTML = '<div class="fx-board" data-hero-board></div>';
    const listeners = new AbortController();
    const stage = element,
      board = stage.querySelector('[data-hero-board]');
    board.innerHTML =
      '<div class="ck-panel hero-card"><div class="ck-panel hero-over"><div class="hero-face" lang="en" role="group" aria-label="Sample hero">' +
      '<div class="hero-nav"><span class="ck-text" data-strong>Oriel Studio</span><span class="hero-links"><span class="ck-text">Work</span><span class="ck-text">About</span><span class="ck-text">Journal</span></span><span class="ck-pill hero-menu" data-size="sm">Menu</span></div>' +
      '<p class="hero-title">Look<br>closer<span class="hero-stop">.</span></p>' +
      '<div class="hero-foot"><p class="ck-text hero-sub">Independent design studio.</p><span class="ck-pill ck-solid hero-cta" data-size="sm">Get in touch</span></div>' +
      '</div></div></div>';
    const box = board.firstChild;
    box.insertAdjacentHTML('afterbegin', box.firstChild.outerHTML);
    const under = box.firstChild,
      over = box.lastChild;
    under.className = 'ck-panel hero-under hero-inv';
    under.setAttribute('aria-hidden', 'true');
    under.inert = true;
    under.firstChild.removeAttribute('role');
    under.firstChild.removeAttribute('aria-label');
    let inst = null;
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        m = W < 600 ? 20 : 40,
        x0 = m;
      box.style.left = x0 + 'px';
      box.style.top = m + 'px';
      box.style.width = W - m - x0 + 'px';
      box.style.height = H - 2 * m + 'px';
    }
    const applyParams = (p) => inst && inst.setParams(p),
      resetView = () => inst && inst.restore();
    place();
    inst = lib.CommonFluidHero.mount(
      { stage: box, over },
      {
        card: {
          interactive: true,
          fit: (w, h) => Math.min(1, Math.min(w, h) / 444),
        },
      },
    );
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);

    const DEFAULTS = Object.fromEntries(lib.CommonFluidHero.controls.map((c) => [c.key, c.default]));
    let params = Object.assign({}, DEFAULTS);
    const setParams = (next) => {
      params = Object.assign({}, params, next);
      if (applyParams) applyParams(Object.assign({}, params));
    };
    if (options.params) setParams(options.params);
    return {
      get params() {
        return Object.assign({}, params);
      },
      setParams,
      reset() {
        params = Object.assign({}, DEFAULTS);
        if (applyParams) applyParams(Object.assign({}, params));
        if (resetView) resetView();
      },
      destroy() {
        if (mounted.done) return;
        listeners.abort();
        observer0.disconnect();
        if (inst) mounted.owned.add(inst);
        mounted.restore();
      },
    };
  }
  global.mountFluidMaskHero = mountFluidMaskHero;
  if (typeof module === 'object' && module.exports) module.exports = mountFluidMaskHero;
})(typeof window !== 'undefined' ? window : this);
