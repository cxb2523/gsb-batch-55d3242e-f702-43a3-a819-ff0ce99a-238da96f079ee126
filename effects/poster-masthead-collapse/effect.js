/*
 * Poster Masthead Collapse
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * An opening sequence for a site header: a white poster card with the wordmark "Form & Field" and a blue dot unfolds
 * in the middle of the stage, turns from portrait to a wide banner, then shrinks into a small pill where the wordmark
 * collapses to "F&F". Scroll, swipe or use the arrow keys to play it forward or back. Good as an intro that ends in
 * your logo, or as the first screen of a portfolio or report.
 *
 * How it moves
 * - One timeline, progress 0..1 over params.duration ms, played in real time (not a tween per step). The open and
 *   dock segments use cubic-bezier(0.22, 1, 0.36, 1) (fast start, soft landing); the fold uses
 *   cubic-bezier(0.33, 0.55, 0.2, 1). On mount it starts at 0.05.
 *   0.08          the card fades in over 300 ms (1 px tall at this point)
 *   0.15..0.31    open: the card grows from 1 px to a 600 x 720 poster; the wordmark slides in from the left
 *                 (offset 0.64 x poster width, shrinking to 0)
 *   0.47..0.585   fold: the poster turns into a banner, width 700 x fit (at most the stage width), height
 *                 min(width x 0.34, stage height x 0.43); the wordmark grows to fill the banner width
 *   0.715..0.93   dock: the banner shrinks to a 64 px tall pill, corners go from 24 x fit to fully round, the text to
 *                 30 px, "orm" and "ield" are clipped away (Form & Field -> F&F) and the gaps close from 12 to 3 units;
 *                 the dot shrinks to 0.46 x the text size
 *   after 0.93    the pill rests in the middle. Nothing loops.
 * - The card is always centred in the stage. fit = min(params.posterScale / 100 x room, width / 600, height / 720),
 *   where room fits the 600 x 720 poster inside the stage with 64 px side and 44 px top / bottom margins (20 / 40 px
 *   when the viewport is 760 px wide or less).
 * - Scrubbing: a wheel step, a vertical touch drag (one step per 12 px) or ArrowDown / ArrowUp plays the timeline at
 *   normal speed in that direction until it reaches an end; more input in the same direction does not speed it up.
 *   Going back stops at 0.08 + 300 ms / duration (card just visible), going forward at 1.
 * - Wheel handoff: a wheel gesture that moved the timeline is swallowed until the wheel has been quiet for 250 ms;
 *   at an end, a new gesture scrolls the page. Touch: if the first step of a drag cannot move the timeline, the drag
 *   scrolls the page instead (the board has touch-action: none and scrolls the window itself).
 * - Click or tap without dragging (under 6 px), or the Replay pill: replays from 0.05.
 *
 * Options
 *   params.duration     2800..7200 ms, default 5600   length of the whole timeline
 *   params.posterScale  65..115, default 100          card size in percent of the room it fits in (never larger than
 *                                                      the stage)
 * Values are not clamped; keep them in these ranges. There is no reducedMotion option (see below).
 *
 * API
 *   const fx = mountPosterMastheadCollapse(element, {params: {...}});
 *   fx.params                          copy of current params
 *   fx.setParams({duration: 4000})     change params live; a new duration keeps the current progress
 *   fx.reset()                         params back to defaults; if the sequence is mid-way it glides to the docked
 *                                      pill over 500 ms (cubic-bezier(0.22, 1, 0.36, 1)), otherwise it stays there
 *   fx.destroy()                       removes listeners, observers and frame loops
 * There is no setPaused or setReducedMotion in this version.
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountPosterMastheadCollapse(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The wordmark: the five .mh-piece spans in the markup ("F", "orm", "&", "F", "ield"). The 2nd and 5th pieces are
 *   the ones that collapse; keep five pieces in that role order. Widths are measured from the rendered text on resize
 *   and when fonts load, so any font works.
 * - Colours: --fx-object (card), --fx-ink (text), --fx-accent (dot and focus ring), radius and shadow in effect.css.
 * - The phase points (TIMING) and the pill size (poster = {pill: 64, text: 30} in mountPosterMastheadCollapse).
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - A single progress value driving every part. Animating card, text and dot with separate tweens makes them drift
 *   apart when scrubbed backwards.
 * - Clipping the collapsing pieces (width of .mh-piece with overflow hidden) instead of fading them; the letters
 *   must be cut, not dissolved.
 * - The pauses between segments (0.31..0.47 and 0.585..0.715); without them the poster and banner never read.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountPosterMastheadCollapse on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The stage is a focusable group with an aria-label describing the controls; the moving parts are aria-hidden.
 *   Keys: ArrowDown / PageDown forward, ArrowUp / PageUp back, End / Home jump to either end. Focus shows a 2 px ring.
 * - Reduced motion (prefers-reduced-motion, followed live): it starts on the docked pill, the fade is skipped, and
 *   wheel, keys, swipes and clicks jump straight to the end points instead of playing.
 * - The timeline's own loop stops when the stage is off screen and after the sequence ends. A wheel / swipe / key
 *   playback also pauses while the stage is off screen and carries on from the same point when it is back.
 */
(function (global) {
  'use strict';

  const CONTROLS = [
    { key: 'duration', type: 'range', min: 2800, max: 7200, step: 100, default: 5600 },
    { key: 'posterScale', type: 'range', min: 65, max: 115, step: 1, default: 100 },
  ];
  const DEFAULTS = Object.fromEntries(CONTROLS.map((c) => [c.key, c.default]));

  // ---- the effect ----
  const lib = {};
  (function () {
    'use strict';
    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, p) => a + (b - a) * p;
    const ease = (p) => {
      p = clamp(p);
      return p * p * (3 - 2 * p);
    };
    const segment = (p, a, b, fn = ease) => fn(clamp((p - a) / (b - a)));
    const bezier = (x1, y1, x2, y2) => {
      const b = (a, c, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * c * t * t * (1 - t) + t * t * t;
      return (p) => {
        p = clamp(p);
        let lo = 0,
          hi = 1,
          t = p;
        for (let i = 0; i < 22; i++) {
          t = (lo + hi) / 2;
          if (b(x1, x2, t) < p) lo = t;
          else hi = t;
        }
        return b(y1, y2, t);
      };
    };
    const OUT = bezier(0.22, 1, 0.36, 1),
      GLIDE = bezier(0.33, 0.55, 0.2, 1);
    const inOut = (p) => {
      p = clamp(p);
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    };
    const TIMING = {
      bar: 0.08,
      open: [0.15, 0.31],
      fold: [0.47, 0.585],
      dock: [0.715, 0.93],
      ease: { open: OUT, fold: GLIDE, dock: OUT },
    };
    const POSTER = { w: 600, h: 720, lw: 700, lr: 0.34 };
    const easeOf = (T, key) => (T.ease && (typeof T.ease === 'function' ? T.ease : T.ease[key])) || inOut;
    const phases = (t, T = TIMING) => ({
      expand: segment(t, T.open[0], T.open[1], easeOf(T, 'open')),
      fold: segment(t, T.fold[0], T.fold[1], easeOf(T, 'fold')),
      dock: segment(t, T.dock[0], T.dock[1], easeOf(T, 'dock')),
      contract: segment(t, T.dock[0], T.dock[1], easeOf(T, 'dock')),
    });
    const stageAt = (t, T = TIMING) =>
      t < T.bar
        ? 'media'
        : t < T.open[1]
          ? 'expand'
          : t < T.fold[0]
            ? 'portrait'
            : t < T.fold[1]
              ? 'fold'
              : t < T.dock[0]
                ? 'landscape'
                : t < T.dock[1]
                  ? 'dock'
                  : 'ready';
    const CARD = { start: 0.36, fade: 300 };
    function create(host, options = {}) {
      let params = Object.assign({ duration: 5600, posterScale: 100 }, options.params);
      const card = options.card || null;
      let timing = options.timing || null;
      const T = () => timing || TIMING;
      let dead = false,
        paused = false,
        visible = true,
        raf = 0,
        elapsed = CARD.start * params.duration,
        last = 0;
      let width = 1,
        height = 1,
        phase = '';
      const mq = matchMedia('(prefers-reduced-motion: reduce)');
      let reduced = mq.matches;
      const still = () => reduced && !(card && card.seekReduced);
      const scene = host;
      const cardPanel = host.querySelector('[data-mh-panel]');
      const cardPieces = Array.from(host.querySelectorAll('[data-mh-piece]'));
      const cardMark = host.querySelector('[data-mh-mark]');
      let cardWidths = [8, 30, 10, 8, 24],
        cardMarkWidth = 8;
      const listeners = [];
      const on = (node, event, handler, opts) => {
        node.addEventListener(event, handler, opts);
        listeners.push(() => node.removeEventListener(event, handler, opts));
      };
      function measure() {
        if (dead) return;
        width = Math.max(1, host.clientWidth);
        height = Math.max(1, host.clientHeight);
        cardWidths = cardPieces.map((node) => Math.max(1, node.firstElementChild.offsetWidth));
        cardMarkWidth = cardMark ? cardMark.offsetWidth : 0;
        render();
      }
      function renderPoster() {
        const P = card.poster,
          T0 = T();
        const t = still() ? 1 : clamp(elapsed / params.duration);
        const { expand, fold, dock, contract } = phases(t, T0);
        const fit = Math.min((params.posterScale / 100) * (P.scale || 1), width / POSTER.w, height / POSTER.h);
        const pw = POSTER.w * fit,
          ph = POSTER.h * fit;
        const lw = Math.min(POSTER.lw * fit, width),
          lh = Math.min(lw * POSTER.lr, height * 0.43);
        const pillH = P.pill || 56,
          pillText = P.text || 22;
        const pad = lerp(lerp(30, 28, fold) * fit, pillH * 0.4, dock);
        const gapU = lerp(12, 3, contract);
        const fullU = cardWidths.reduce((x, y) => x + y, 0) + 24;
        let fs = lerp(56 * fit, ((lw - 2 * 28 * fit) / fullU) * 100, fold);
        fs = lerp(fs, pillText, dock);
        const s = fs / 100;
        const shortU = cardWidths[0] + cardWidths[2] + cardWidths[3] + 6;
        const markEnd = pillText * 0.46;
        let md = lerp(44 * fit, Math.min(64 * fit, lh * 0.24), fold);
        md = lerp(md, markEnd, dock);
        const dockWidth = pillH * 0.4 + (shortU * pillText) / 100 + pillH * 0.3 + markEnd + pillH * 0.4;
        let rw = lerp(pw, lw, fold),
          rh = lerp(1, ph, expand);
        rh = lerp(rh, lh, fold);
        rw = lerp(rw, dockWidth, dock);
        rh = lerp(rh, pillH, dock);
        const rx = (width - rw) / 2,
          ry = (height - rh) / 2;
        cardPanel.style.width = rw.toFixed(3) + 'px';
        cardPanel.style.height = rh.toFixed(3) + 'px';
        cardPanel.style.transform = 'translate3d(' + rx.toFixed(3) + 'px,' + ry.toFixed(3) + 'px,0)';
        cardPanel.style.borderRadius = lerp(Math.min(24 * fit, rh / 2), rh / 2, dock).toFixed(3) + 'px';
        const fade = reduced ? 1 : clamp((elapsed - T0.bar * params.duration) / CARD.fade);
        cardPanel.style.opacity = fade.toFixed(3);
        const top = lerp(pad * 0.8, (pillH - fs) / 2, dock);
        const slide = (1 - expand) * pw * 0.64 * (1 - fold);
        let cursor = pad - slide;
        cardPieces.forEach((node, i) => {
          const retained = i === 1 || i === 4 ? 1 - contract : 1;
          node.style.transform =
            'translate3d(' + cursor.toFixed(3) + 'px,' + top.toFixed(3) + 'px,0) scale(' + s.toFixed(5) + ')';
          node.style.width = (cardWidths[i] * retained + (retained ? 2 : 0)).toFixed(4) + 'px';
          cursor += cardWidths[i] * retained * s;
          if (i === 1 || i === 2) cursor += gapU * s;
        });
        if (cardMark) {
          cardMark.style.width = cardMark.style.height = md.toFixed(3) + 'px';
          const mx = rw - pad - md + slide,
            my = lerp(rh - pad - md, (pillH - md) / 2, dock);
          cardMark.style.transform = 'translate3d(' + mx.toFixed(3) + 'px,' + my.toFixed(3) + 'px,0)';
        }
        scene.dataset.progress = t.toFixed(4);
        scene.dataset.contract = contract.toFixed(4);
        scene.dataset.panelBox = [rx, ry, rw, rh].map((v) => Number(v.toFixed(2))).join(',');
        const next = stageAt(t, T0);
        if (phase !== next) {
          phase = next;
          scene.dataset.openingStage = next;
        }
      }
      function render() {
        if (dead) return;
        renderPoster();
      }
      function needsFrame() {
        return !dead && !paused && visible && !reduced && elapsed < params.duration;
      }
      function schedule() {
        if (!raf && needsFrame()) raf = requestAnimationFrame(tick);
      }
      function tick(now) {
        raf = 0;
        if (!needsFrame()) {
          last = 0;
          return;
        }
        const dt = last ? Math.min(now - last, 80) : 0;
        last = now;
        elapsed += dt;
        render();
        schedule();
      }
      function stop() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
      }
      const api = {
        element: scene,
        setParams(next) {
          if (dead) return;
          const ratio = elapsed / params.duration;
          params = Object.assign({}, params, next);
          elapsed = ratio * params.duration;
          render();
          schedule();
        },
        setPaused(value) {
          if (dead) return;
          paused = Boolean(value);
          scene.classList.toggle('motion-paused', paused);
          stop();
          if (!paused) schedule();
        },
        setTiming(next) {
          if (dead) return;
          timing = next || null;
          render();
        },
        seek(progress) {
          if (dead) return;
          elapsed = clamp(progress) * params.duration;
          render();
        },
        snapshot() {
          return {
            phase,
            progress: still() ? 1 : clamp(elapsed / params.duration),
            elapsed,
            paused,
            reduced,
            destroyed: dead,
            raf: raf ? 1 : 0,
            listeners: listeners.length,
            observing: dead ? 0 : 2,
            panel: scene.dataset.panelBox,
            contract: Number(scene.dataset.contract),
          };
        },
        destroy() {
          if (dead) return;
          dead = true;
          stop();
          resize.disconnect();
          intersection.disconnect();
          while (listeners.length) listeners.pop()();
          scene.dataset.destroyed = 'true';
        },
      };
      on(mq, 'change', (event) => {
        reduced = event.matches;
        stop();
        if (reduced) elapsed = params.duration;
        render();
        schedule();
      });
      const resize = new ResizeObserver(measure);
      resize.observe(host);
      const intersection = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        stop();
        schedule();
      });
      intersection.observe(host);
      document.fonts.ready.then(() => {
        if (!dead) measure();
      });
      measure();
      schedule();
      return api;
    }
    lib.Masthead190 = { create, TIMING, POSTER, inOut, phases };
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
  function mountPosterMastheadCollapse(element, options) {
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
    const setTimeout = (cb, ms, ...args) => {
      const t = global.setTimeout(() => {
        mounted.timers.delete(t);
        cb(...args);
      }, ms);
      mounted.timers.add(t);
      return t;
    };
    const clearTimeout = (t) => {
      mounted.timers.delete(t);
      global.clearTimeout(t);
    };
    const setInterval = (cb, ms, ...args) => {
      const t = global.setInterval(cb, ms, ...args);
      mounted.timers.add(t);
      return t;
    };
    const clearInterval = (t) => {
      mounted.timers.delete(t);
      global.clearInterval(t);
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
    element.classList.add('poster-masthead-collapse');
    element.innerHTML =
      '<div class="fx-board" data-mh-board tabindex="0" role="group" aria-label="Intro animation. Scroll, swipe, or use arrow keys to play forward or back; Home and End jump to either end; click to replay.">\n  <div class="mh-box" data-mh aria-hidden="true">\n   <div class="mh-panel" data-mh-panel>\n    <span class="mh-piece" data-mh-piece><span>F</span></span><span class="mh-piece" data-mh-piece><span>orm</span></span><span class="mh-piece" data-mh-piece><span>&amp;</span></span><span class="mh-piece" data-mh-piece><span>F</span></span><span class="mh-piece" data-mh-piece><span>ield</span></span>\n    <span class="mh-mark" data-mh-mark></span>\n   </div>\n  </div>\n </div><button type="button" class="ck-pill mh-replay" data-size="sm">Replay</button>';
    const listeners = new AbortController();
    const C = [
      { key: 'duration', min: 2800, max: 7200, step: 100, default: 5600, unit: 'ms' },
      { key: 'posterScale', min: 65, max: 115, step: 1, default: 100, unit: '%' },
    ];
    const M = lib.Masthead190,
      START = Math.max(0, M.TIMING.bar - 0.03),
      FADE = 300,
      BACK = 500;
    const stage = element,
      board = stage.querySelector('[data-mh-board]'),
      replayBtn = stage.querySelector('.mh-replay'),
      box = board.querySelector('[data-mh]');
    const phone = matchMedia('(max-width: 760px)');
    const poster = { pill: 64, text: 30, scale: 1 };
    let inst = null;
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        floating = !phone.matches;
      const mx = floating ? 64 : 20,
        my = floating ? 44 : 40;
      const PW = M.POSTER.w,
        PH = M.POSTER.h;
      let fit = Math.max(0.1, Math.min((W - 2 * mx) / PW, (H - 2 * my) / PH));

      poster.scale = fit;
      if (inst) inst.setParams({});
    }
    place();
    inst = M.create(box, { card: { poster, seekReduced: true } });
    const reduced = () => inst.snapshot().reduced;
    inst.seek(reduced() ? 1 : START);
    const OUT = (() => {
      const b = (p1, p2, t) => 3 * p1 * t * (1 - t) * (1 - t) + 3 * p2 * t * t * (1 - t) + t * t * t;
      return (x) => {
        let lo = 0,
          hi = 1,
          t = x;
        for (let i = 0; i < 24; i++) {
          t = (lo + hi) / 2;
          if (b(0.22, 0.36, t) < x) lo = t;
          else hi = t;
        }
        return b(1, 1, t);
      };
    })();
    let live = { duration: 5600, posterScale: 100 },
      before = live,
      back = 0;
    const WHEEL_GAP = 250,
      DRAG_TH = 12,
      END = 1;
    const LO = () => M.TIMING.bar + FADE / live.duration;
    let mode = 'auto',
      dir = 0,
      cur = END,
      raf = 0,
      last = 0;
    const pos = () => inst.snapshot().progress;
    const now = () => (mode === 'run' || mode === 'hold' ? cur : Math.max(LO(), Math.min(END, pos())));
    const moving = () => (mode === 'run' ? dir : mode === 'auto' && !back && pos() < END ? 1 : 0);
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
    let seen = true;
    function run() {
      if (!raf && seen) raf = requestAnimationFrame(tick);
    }
    function finishBack() {
      cancelAnimationFrame(back);
      back = 0;
      inst.setTiming(null);
      inst.setParams({ posterScale: live.posterScale });
      inst.seek(1);
      inst.setPaused(false);
    }
    function settle() {
      if (back) finishBack();
    }
    function arrive() {
      stop();
      dir = 0;
      if (cur >= END) {
        cur = END;
        inst.seek(END);
        inst.setPaused(false);
        mode = 'auto';
      } else {
        cur = LO();
        inst.seek(cur);
        mode = 'hold';
      }
    }
    function tick(t) {
      raf = 0;
      const dt = last ? Math.min(t - last, 64) : 0;
      last = t;
      cur += (dir * dt) / live.duration;
      if ((dir > 0 && cur >= END) || (dir < 0 && cur <= LO())) {
        arrive();
        return;
      }
      inst.seek(cur);
      raf = requestAnimationFrame(tick);
    }
    function go(d) {
      settle();
      if (moving() === d) return true;
      const from = now();
      if (d > 0 ? from >= END : from <= LO()) return false;
      stop();
      inst.setPaused(true);
      mode = 'run';
      dir = d;
      cur = from;
      inst.seek(cur);
      if (reduced()) {
        cur = d > 0 ? END : LO();
        arrive();
      } else run();
      return true;
    }
    function jump(d) {
      settle();
      const from = now();
      if (d > 0 ? from >= END : from <= LO()) return false;
      stop();
      inst.setPaused(true);
      cur = d > 0 ? END : LO();
      arrive();
      return true;
    }
    function replay() {
      settle();
      stop();
      dir = 0;
      if (reduced()) {
        const changed = now() < END;
        cur = END;
        arrive();
        return changed;
      }
      mode = 'auto';
      inst.seek(START);
      inst.setPaused(false);
      return true;
    }
    function restore() {
      stop();
      dir = 0;
      mode = 'auto';
      cur = END;
      settle();
      const s = inst.snapshot(),
        p0 = s.progress,
        from = before.posterScale,
        to = live.posterScale;
      if (s.reduced || p0 >= 1) {
        inst.seek(1);
        inst.setPaused(false);
        return;
      }
      const v = M.phases(p0),
        run = (v0) => (x) => v0 + (1 - v0) * x;
      inst.setPaused(true);
      inst.setTiming({
        bar: M.TIMING.bar,
        open: [p0, 1],
        fold: [p0, 1],
        dock: [p0, 1],
        ease: { open: run(v.expand), fold: run(v.fold), dock: run(v.dock) },
      });
      inst.setParams({ posterScale: from });
      let t0 = 0;
      const step = (t) => {
        if (!t0) t0 = t;
        const k = Math.min(1, (t - t0) / BACK);
        if (k >= 1) return finishBack();
        const e = OUT(k);
        inst.setParams({ posterScale: from + (to - from) * e });
        inst.seek(p0 + (1 - p0) * e);
        back = requestAnimationFrame(step);
      };
      back = requestAnimationFrame(step);
    }
    let wheelAt = -Infinity,
      held = false;
    board.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || !e.deltaY) return;
        const t = performance.now();
        if (t - wheelAt > WHEEL_GAP) held = false;
        wheelAt = t;
        if (go(e.deltaY > 0 ? 1 : -1)) {
          held = true;
          e.preventDefault();
        } else if (held) e.preventDefault();
      },
      { signal: listeners.signal, passive: false },
    );
    let down = null;
    board.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        down = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          ay: e.clientY,
          ly: e.clientY,
          touch: e.pointerType !== 'mouse',
          drag: false,
          own: null,
        };
        if (down.touch)
          try {
            board.setPointerCapture(e.pointerId);
          } catch (err) {}
      },
      { signal: listeners.signal },
    );
    board.addEventListener(
      'pointermove',
      (e) => {
        if (!down || e.pointerId !== down.id) return;
        if (!down.drag) {
          if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) return;
          down.drag = true;
        }
        if (!down.touch) return;
        if (down.own === false) {
          window.scrollBy(0, down.ly - e.clientY);
          down.ly = e.clientY;
          return;
        }
        const dy = down.ay - e.clientY;
        if (Math.abs(dy) < DRAG_TH) return;
        down.ay = e.clientY;
        const used = go(dy > 0 ? 1 : -1);
        if (down.own === null) {
          down.own = used;
          if (!used) {
            window.scrollBy(0, down.y - e.clientY);
            down.ly = e.clientY;
          }
        }
      },
      { signal: listeners.signal },
    );
    const up = (e) => {
      if (!down || e.pointerId !== down.id) return;
      const d = down;
      down = null;
      if (!d.drag && e.type === 'pointerup' && replay());
    };
    board.addEventListener('pointerup', up, { signal: listeners.signal });
    board.addEventListener('pointercancel', up, { signal: listeners.signal });
    replayBtn.addEventListener(
      'click',
      () => {
        if (replay());
      },
      { signal: listeners.signal },
    );
    board.addEventListener(
      'keydown',
      (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const k = e.key;
        const used =
          k === 'ArrowDown' || k === 'PageDown'
            ? go(1)
            : k === 'ArrowUp' || k === 'PageUp'
              ? go(-1)
              : k === 'End'
                ? jump(1)
                : k === 'Home'
                  ? jump(-1)
                  : false;
        if (used) e.preventDefault();
      },
      { signal: listeners.signal },
    );
    const applyParams = (p) => {
        settle();
        before = live;
        live = Object.assign({}, p);
        inst.setParams(p);
      },
      resetView = restore;

    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const observer1 = new IntersectionObserver((es) => {
      seen = es[es.length - 1].isIntersecting;
      if (!seen) stop();
      else if (mode === 'run') run();
    });
    observer1.observe(board);

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
        observer1.disconnect();
        cancelAnimationFrame(raf);
        cancelAnimationFrame(back);
        if (inst) mounted.owned.add(inst);
        mounted.restore();
      },
    };
  }
  global.mountPosterMastheadCollapse = mountPosterMastheadCollapse;
  if (typeof module === 'object' && module.exports) module.exports = mountPosterMastheadCollapse;
})(typeof window !== 'undefined' ? window : this);
