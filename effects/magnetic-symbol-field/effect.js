/*
 * Magnetic Symbol Field
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A loose field of small white cards, each with a simple mark (ring, plus, square, cross), on a dotted tray. Move the
 * pointer through it and the cards near it are pushed away and wobble back on springs. Good as a quiet interactive
 * backdrop for a hero, an about section or an empty state.
 *
 * How it moves
 * - Push: each card has a home point. When the pointer is within params.influenceRadius px of it, its target offset is
 *   params.displacement x (1 - distance / radius) ^ params.falloff, pointing away from the pointer. Outside the radius
 *   the target is 0 (home).
 * - Springs: every card chases its target with a damped spring, integrated per frame (dt capped at 34 ms):
 *   v += (k x (target - pos) - c x v) x dt, pos += v x dt. Cards are handled in groups of five; inside a group
 *   stiffness k = 150, 172, 194, 216, 238 and damping c = 15, 17.2, 19.4, 15, 17.2, so neighbours lag each other and the
 *   field ripples instead of moving as one block.
 * - Tilt: each card has a fixed base rotation (from -18 to 16 degrees) plus horizontal velocity x 0.025 degrees, so a
 *   card leans while it moves.
 * - Release: when the pointer leaves the field (or a touch ends), the targets return to 0 and the cards spring home.
 *   A mouse button release does not count; a mouse keeps pushing until it leaves.
 * - The loop runs only while something moves: a card at rest within 0.05 px of home and under 0.5 px/s snaps to 0 and
 *   the frame loop stops until the next pointer event.
 * - Layout: element wider than tall: 11 cards, size = clamp(64, min(width / 11, height / 6), 104) px. Taller than wide:
 *   7 cards, size = clamp(56, min(width / 5.2, height / 7.6), 80) px. Homes are fractions of the element (the WIDE and
 *   TALL tables), so the field fills and centres itself at any size; it is rebuilt when the shape flips and re-placed
 *   on resize. Card corners and mark stroke scale with --fx-k = size / 52.
 *
 * Options
 *   params.influenceRadius  80..360 px, default 230   how far from the pointer cards react
 *   params.displacement     20..160 px, default 92    how far a card right under the pointer is pushed
 *   params.falloff          0.6..3, default 1.6       curve of the push over distance; higher = only close cards move
 * Values are not clamped; keep them in these ranges. There is no reducedMotion option (see below).
 *
 * API
 *   const fx = mountMagneticSymbolField(element, {params: {...}});
 *   fx.params                          copy of current params
 *   fx.setParams({displacement: 120})  change params live
 *   fx.reset()                         params back to defaults, cards spring home
 *   fx.destroy()                       removes listeners, the resize observer, the frame loop
 * There is no setPaused or setReducedMotion in this version.
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountMagneticSymbolField(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Card positions, base rotations and marks: the WIDE and TALL tables in mountMagneticSymbolField, rows of
 *   [x fraction, y fraction, rotation in degrees, mark 0..3]. Mark 1 (plus) gets the accent card.
 * - The marks themselves (GLYPHS, SVG in a 100 x 100 box) and the card look (.ck-media rules, colours, radius, shadow)
 *   in effect.css; the dot grid on the tray.
 * - Card size: the clamps in layout().
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The per-card spread of k and c. Giving every card the same spring makes the field move as one sheet.
 * - The spring integration with real dt (capped at 34 ms). A CSS transition or fixed tween cannot be redirected while
 *   the pointer keeps moving.
 * - The velocity tilt (0.025 deg per px/s); without it the cards slide instead of being shoved.
 * - Do not let a framework re-render the cards while the effect runs; it writes their transforms directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams, not a remount.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountMagneticSymbolField on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Purely decorative: the cards are aria-hidden, not focusable, and there is no keyboard interaction. Do not put
 *   essential content in them.
 * - Touch: the field keeps touch-action pan-y so vertical swipes still scroll the page; a touch push works until the
 *   finger lifts or the browser takes over the swipe.
 * - Reduced motion (prefers-reduced-motion, read on every frame): cards stay at home and do not react.
 *   It is checked when a frame runs, so a live change of the setting shows on the next pointer move. To force it
 *   yourself, there is no option; set the media query or skip mounting.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared card parts: a white card with a centred mark ----
  const GLYPHS = [
    '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M50 16v68M16 50h68" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    '<rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M24 24l52 52M76 24L24 76" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  ];
  function glyph(index) {
    return (
      '<svg class="ck-glyph" viewBox="0 0 100 100" aria-hidden="true">' +
      GLYPHS[Math.abs(index | 0) % GLYPHS.length] +
      '</svg>'
    );
  }
  function media(options) {
    options = options || {};
    return (
      '<div class="ck-media' +
      (options.lift ? ' ck-lift' : '') +
      '"' +
      (options.tone ? ' data-tone="' + (options.tone | 0) + '"' : '') +
      (options.size === 'sm' ? ' data-size="sm"' : '') +
      (options.accent ? ' data-accent' : '') +
      ' aria-hidden="true">' +
      (options.glyph == null || options.glyph === false ? '' : glyph(options.glyph)) +
      '</div>'
    );
  }

  const CONTROLS = [
    { key: 'influenceRadius', type: 'range', min: 80, max: 360, step: 1, default: 230 },
    { key: 'displacement', type: 'range', min: 20, max: 160, step: 1, default: 92 },
    { key: 'falloff', type: 'range', min: 0.6, max: 3, step: 0.1, default: 1.6 },
  ];
  const DEFAULTS = Object.fromEntries(CONTROLS.map((c) => [c.key, c.default]));

  // ---- the effect ----
  const lib = {};
  (function () {
    'use strict';
    function makeBodies(objects) {
      return objects.map((object, i) => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        k: 150 + i * 22,
        c: 15 + (i % 3) * 2.2,
        rot: Number(object.dataset.rotation),
      }));
    }
    function stepBody(body, dx, dy, values, dt, reduce) {
      const distance = Math.hypot(dx, dy);
      const radius = values.influenceRadius;
      const force = distance > radius ? 0 : Math.pow(1 - distance / radius, values.falloff);
      const tx = distance ? (-dx / distance) * force * values.displacement : 0;
      const ty = distance ? (-dy / distance) * force * values.displacement : 0;
      if (reduce) {
        body.x = 0;
        body.y = 0;
        body.vx = body.vy = 0;
      } else if (dt > 0) {
        body.vx += (body.k * (tx - body.x) - body.c * body.vx) * dt;
        body.vy += (body.k * (ty - body.y) - body.c * body.vy) * dt;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
      }
    }
    function bodyTransform(body) {
      const tilt = body.rot + body.vx * 0.025;
      return (
        'translate3d(' + body.x.toFixed(2) + 'px,' + body.y.toFixed(2) + 'px,0) rotate(' + tilt.toFixed(2) + 'deg)'
      );
    }
    lib.MagnetField = { makeBodies, stepBody, bodyTransform, duration: 6000 };
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
  function mountMagneticSymbolField(element, options) {
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
    const requestAnimationFrame = (cb) => {
      const f = global.requestAnimationFrame((t) => {
        mounted.frames.delete(f);
        cb(t);
      });
      mounted.frames.add(f);
      return f;
    };
    const cancelAnimationFrame = (f) => {
      mounted.frames.delete(f);
      global.cancelAnimationFrame(f);
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
    element.classList.add('magnetic-symbol-field');
    element.innerHTML = '<div class="fx-board" data-field></div>';
    const listeners = new AbortController();
    const F = lib.MagnetField,
      stage = element,
      board = stage.querySelector('[data-field]');
    const rq = matchMedia('(prefers-reduced-motion: reduce)');
    const C = [
      { key: 'influenceRadius', min: 80, max: 360, step: 1, default: 230, unit: 'px' },
      { key: 'displacement', min: 20, max: 160, step: 1, default: 92, unit: 'px' },
      { key: 'falloff', min: 0.6, max: 3, step: 0.1, default: 1.6, unit: '' },
    ];
    const values = {};
    C.forEach((c) => {
      values[c.key] = c.default;
    });
    const WIDE = [
      [0.42, 0.27, 0, 0],
      [0.63, 0.2, 12, 1],
      [0.85, 0.29, -18, 3],
      [0.13, 0.55, 8, 2],
      [0.33, 0.5, -6, 3],
      [0.54, 0.55, -12, 2],
      [0.75, 0.49, 6, 0],
      [0.23, 0.82, 14, 3],
      [0.45, 0.79, -4, 0],
      [0.66, 0.83, -10, 3],
      [0.88, 0.76, 16, 2],
    ];
    const TALL = [
      [0.27, 0.15, 0, 0],
      [0.72, 0.22, 12, 1],
      [0.4, 0.38, -18, 3],
      [0.78, 0.5, 8, 2],
      [0.24, 0.6, -6, 0],
      [0.62, 0.75, -10, 3],
      [0.3, 0.87, 6, 2],
    ];
    let kind = '',
      list = [],
      objects = [],
      bodies = [],
      homes = [],
      W = 1,
      H = 1;
    function build() {
      board.innerHTML = '';
      objects = list.map(([rot, glyph]) => {
        const el = document.createElement('div');
        el.className = 'mf-object';
        el.dataset.rotation = rot;
        el.innerHTML = media({ glyph, size: 'sm', accent: glyph === 1 });
        board.appendChild(el);
        return el;
      });
      bodies = [];
      for (let i = 0; i < objects.length; i += 5) bodies.push(...F.makeBodies(objects.slice(i, i + 5)));
    }
    function draw() {
      objects.forEach((el, i) => {
        el.style.transform = F.bodyTransform(bodies[i]);
      });
    }
    function layout() {
      W = board.clientWidth || 1;
      H = board.clientHeight || 1;
      const tall = W < H;
      if (kind !== (tall ? 'tall' : 'wide')) {
        kind = tall ? 'tall' : 'wide';
        list = tall ? TALL : WIDE;
        build();
      }
      const s = Math.round(
        tall ? Math.max(56, Math.min(W / 5.2, H / 7.6, 80)) : Math.max(64, Math.min(W / 11, H / 6, 104)),
      );
      board.style.setProperty('--mf-s', s + 'px');
      board.style.setProperty('--fx-k', (s / 52).toFixed(4));
      homes = list.map(([fx, fy]) => [W * fx, H * fy]);
      objects.forEach((el, i) => {
        el.style.left = homes[i][0].toFixed(1) + 'px';
        el.style.top = homes[i][1].toFixed(1) + 'px';
      });
      draw();
    }
    let raf = 0,
      last = 0,
      pointer = null;
    function frame(now) {
      raf = 0;
      const dt = last ? Math.min(0.034, (now - last) / 1000) : 0;
      last = now;
      const reduce = rq.matches;
      if (reduce) {
      }
      let busy = !reduce && !!pointer;
      bodies.forEach((b, i) => {
        F.stepBody(
          b,
          pointer ? pointer.x - homes[i][0] : 1e5,
          pointer ? pointer.y - homes[i][1] : 1e5,
          values,
          dt,
          reduce,
        );
        if (!pointer && Math.abs(b.x) < 0.05 && Math.abs(b.y) < 0.05 && Math.abs(b.vx) < 0.5 && Math.abs(b.vy) < 0.5) {
          b.x = b.y = b.vx = b.vy = 0;
        } else if (!reduce) busy = true;
      });
      draw();
      if (busy) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    function wake() {
      if (!raf) raf = requestAnimationFrame(frame);
    }
    const at = (e) => {
      const r = board.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    board.addEventListener(
      'pointermove',
      (e) => {
        pointer = at(e);
        wake();
      },
      { signal: listeners.signal },
    );
    board.addEventListener(
      'pointerdown',
      (e) => {
        pointer = at(e);
        wake();
      },
      { signal: listeners.signal },
    );
    const away = () => {
      pointer = null;
      wake();
    };
    board.addEventListener('pointerleave', away, { signal: listeners.signal });
    board.addEventListener('pointercancel', away, { signal: listeners.signal });
    board.addEventListener(
      'pointerup',
      (e) => {
        if (e.pointerType !== 'mouse') away();
      },
      { signal: listeners.signal },
    );
    function restore() {
      pointer = null;
      wake();
    }
    const applyParams = (p) => {
        Object.assign(values, p);
        wake();
      },
      resetView = restore;
    layout();
    const observer0 = new ResizeObserver(() => {
      layout();
      wake();
    });
    observer0.observe(board);
    if (rq.matches) {
    } else wake();

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
        cancelAnimationFrame(raf);
        mounted.restore();
      },
    };
  }
  global.mountMagneticSymbolField = mountMagneticSymbolField;
  if (typeof module === 'object' && module.exports) module.exports = mountMagneticSymbolField;
})(typeof window !== 'undefined' ? window : this);
