/*
 * Cut-Line Preloader
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A site intro in a small browser-sized screen: on an ink cover, a three-wheel counter rolls from 000 to 100 while a pair
 * of line-drawn scissors cuts along a dashed line; once the cut is done the two halves of the cover fold away and the
 * page underneath (a placeholder hero) comes in. Plays once on load and stops on the revealed page. Good as a preloader,
 * a page transition or a "reveal" moment; each half can also run alone.
 *
 * How it moves (all times from the start of the sequence, default values)
 * - Time-based, not scroll-scrubbed: one clock t drives everything, so the whole sequence can play forward, play
 *   backward, be replayed or jump to its end. Default total length 2390 ms.
 * - Counter, 120 -> 1420 ms. With the cut on it reads the cut's own progress (same curve, params.cutDuration), so the digits
 *   show the percentage cut at every frame. Counter only: params.countDuration on cubic-bezier(.33,.55,.2,1). One eased value
 *   drives three digit strips, each in its own 1.3 em window: hundreds strip 0-9, tens strip 0-9 repeated, ones strip
 *   0,5,0,5... so the last digit ticks five at a time. Each strip moves linearly from its start cell to its end cell
 *   (hundreds floor(n / 100), tens floor(n / 10), ones n / 5). The end value params.countTo is rounded to a multiple of 5.
 * - Cut, 120 -> 1420 ms (params.cutDuration), cubic-bezier(.5,0,.15,1): the scissors' left edge moves from 4 % of the screen
 *   width to 100 % - 3.4em (their width) - clamp(12px, 1.4cqw, 20px), so the whole pair, tips included, stays on screen
 *   while it stops and snips. The solid line follows to the pivot (left edge + 1.275em) over the dashed line (6 px dash,
 *   5 px gap); on the frame the blades shut, the rest of the dashed line turns solid. The line sits at 55 % height.
 * - Snip: over the last 80 ms of the cut each blade opens 6 deg further (cubic-bezier(.22,1,.36,1)), then they shut over
 *   90 ms (cubic-bezier(.55,0,1,.45)), each turning to 7.9 deg past rest so the tips meet. Two separate <g class="cl-blade">
 *   rotate in opposite directions around the pivot (15,12). The close lands exactly as the reveal starts.
 * - Reveal, 90 ms after the cut ends: the top cover (55 %) and bottom cover (45 %) scale to 0 towards their own edge
 *   over 560 ms on cubic-bezier(.7,.05,.3,1); line, scissors, counter and the "Cut here" label fade out in 120 ms.
 * - Five small marks under the line slide in from t = 0, starting -60 % of the width to the left (1100 / 1050 / 1000 / 950 / 900 ms,
 *   cubic-bezier(.22,1,.36,1)).
 * - Page underneath, from reveal + 120 ms: nav y 14 -> 0 px (280 ms); the two title lines blur 8 -> 0 px and y 18 -> 0
 *   (520 ms each, from +80 ms, 60 ms apart); button row y 22 -> 0 (520 ms, from +240 ms); all cubic-bezier(.22,1,.36,1) with an
 *   opacity fade. At rest every inline style is cleared.
 * - Counter only (params.cut = false): no cover or line; the digits sit alone in the middle, large (clamp(40px, 16cqw,
 *   140px)), in ink, and stop on the end value. Cut only (params.counter = false): no digits. Switching either toggle
 *   rebuilds the screen and starts over. With both off the screen is empty.
 * - Layout: the screen is centred in the element with 24 px margins and a 64 px strip kept free at the bottom for the
 *   Replay pill; at most 800 px wide, 16:10. When the viewport is 760 px or narrower: 16 px margins, full width, up to
 *   1.3 x as tall as wide. When the screen is taller than wide, the page underneath hides its nav words and subline and
 *   sets the title larger.
 *
 * Input
 * - Click or tap the screen (less than 6 px of movement) or the Replay pill: play again from the start.
 * - Wheel down over the screen: play forward from where it is at normal speed; wheel up: play backward to the first
 *   frame. Wheel speed and distance do not matter, the wheel only picks a direction; reversing mid-way turns around in
 *   place. A wheel gesture that moved the sequence keeps its trailing inertia; a new gesture (after a 250 ms pause) with
 *   nothing left to play in that direction scrolls the page as usual.
 * - Keyboard, with the screen focused (tabindex 0): Enter or Space replays, ArrowDown plays forward, ArrowUp plays back.
 *
 * Options
 *   params.countTo        5..995 step 5, default 100     where the counter stops
 *   params.countDuration  600..4000 ms, default 1300     counter duration, counter-only mode (with the cut on the counter follows cutDuration)
 *   params.cutDuration    600..4000 ms, default 1300     scissors / solid line duration
 *   params.counter        true / false, default true     the digit wheels
 *   params.cut            true / false, default true     the cut and reveal
 *   reducedMotion         true / false / null            force reduced motion; null follows prefers-reduced-motion live
 * The counter always starts at 0 here (the effect code has a start value option, not wired to the mount function).
 *
 * API
 *   const fx = mountCutLinePreloader(element, {params: {...}, reducedMotion: null});
 *   fx.params                    copy of current params
 *   fx.setParams({countTo: 50})  change params; the sequence then replays from the start so the change is visible
 *   fx.setPaused(true|false)     freeze / resume
 *   fx.reset()                   params back to defaults; the covers fade out over 400 ms (ease-out) onto the finished
 *                                page, no replay
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                 stops the loop, removes listeners and observers (the last frame's markup stays in the
 *                                element; empty it if you reuse the element)
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountCutLinePreloader(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect replaces its children.
 * For a real full-page intro: make .cl-screen position:fixed; inset:0; border-radius:0, and remove it once the sequence
 * has ended (the total length is 120 + cutDuration + 90 + 120 + 760 ms; counter only: 120 + countDuration).
 *
 * Safe to change
 * - The page underneath: heroHTML() (studio name, nav words, title, button). Keep the data-hero="nav" / "line" / "foot"
 *   hooks, they carry the entrance.
 * - Colours: the cover uses --ink, the line, scissors, digits and label use --surface; the one accent is the full stop.
 * - Label text ("Cut here"), the scissors SVG, font size (--cl-fs), the line height (--cl-line, also moves the seam).
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The blades shut before the covers move: that order is what makes the cut cause the reveal.
 * - The counter is the cut's progress (do not give it its own curve while the cut runs); the scissors stop with their full
 *   width on screen; the 55 / 45 split with each cover folding towards its own edge. All timing lives in the TUNE object.
 * - The counter is three strips in clipped windows moved by transform, not text that changes; the ones strip steps by 5.
 * - Do not drive it from scroll position; the wheel is a direction switch on a time-based sequence.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The screen is a focusable group with an aria-label; the counter is role="img" whose label is the current number.
 *   Nothing is announced live.
 * - With reduced motion the sequence jumps straight to the revealed page; replay and the wheel land on the end frame.
 * - The loop runs only while something moves and stops when the tab is hidden, the element is off screen or paused.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const runtimeClamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const R = { mix };

  // ---- inlined from the shared runtime: lifecycle ----
  // One requestAnimationFrame loop that runs only while something moves; pauses when the tab is hidden, the element is
  // off screen or setPaused(true); follows prefers-reduced-motion live; re-measures on resize; destroy() removes every
  // listener and observer it added.
  function scope(element, controls, options) {
    options = options || {};
    element.dataset.preview = String(options.preview === true);
    const defaults = Object.fromEntries(controls.map((control) => [control.key, control.default]));
    let params = Object.assign({}, defaults, options.params || {});
    let paused = false,
      destroyed = false,
      visible = true,
      reducedOverride = null;
    let raf = 0,
      last = 0,
      time = 0,
      frameCount = 0,
      draw = () => false,
      ticking = false;
    let width = 1,
      height = 1,
      active = true;
    const cleanup = [],
      hooks = new Map();
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = () => (reducedOverride === null ? preference.matches : reducedOverride);
    const emit = (type, value) => {
      (hooks.get(type) || []).forEach((fn) => fn(value));
    };
    function listen(target, type, fn, listenerOptions) {
      target.addEventListener(type, fn, listenerOptions);
      cleanup.push(() => target.removeEventListener(type, fn, listenerOptions));
      return fn;
    }
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
    function allowed() {
      return !destroyed && !paused && visible && !document.hidden && !reduced();
    }
    function tick(now) {
      raf = 0;
      if (!allowed()) return;
      const dt = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 0;
      last = now;
      time += dt;
      frameCount++;
      // A wake() from inside draw (directly or via measure/setParams/replay) books the next frame itself;
      // it must not reset `last` (the loop never went idle) and the line below must not book a second one.
      ticking = true;
      try {
        active = draw({ dt, time, width, height, params, reduced: false }) !== false;
      } finally {
        ticking = false;
      }
      if (active && allowed() && !raf) raf = requestAnimationFrame(tick);
    }
    function wake() {
      if (allowed() && !raf) {
        if (!ticking) last = 0;
        raf = requestAnimationFrame(tick);
      }
    }
    function paint() {
      if (destroyed) return;
      active = draw({ dt: 0, time, width, height, params, reduced: reduced() }) !== false;
    }
    function measure() {
      if (destroyed) return;
      width = Math.max(1, element.clientWidth);
      height = Math.max(1, element.clientHeight);
      emit('resize', { width, height });
      paint();
      if (active) wake();
    }
    function syncMotion() {
      stop();
      element.dataset.reduced = String(reduced());
      emit('motion', reduced());
      paint();
      if (active) wake();
    }
    const api = {
      element,
      defaults,
      listen,
      get params() {
        return params;
      },
      get time() {
        return time;
      },
      get width() {
        return width;
      },
      get height() {
        return height;
      },
      get paused() {
        return paused;
      },
      get reduced() {
        return reduced();
      },
      get destroyed() {
        return destroyed;
      },
      get preview() {
        return options.preview === true;
      },
      on(type, fn) {
        if (!hooks.has(type)) hooks.set(type, []);
        hooks.get(type).push(fn);
        return fn;
      },
      cleanup(fn) {
        cleanup.push(fn);
        return fn;
      },
      frame(fn) {
        draw = fn;
        measure();
        wake();
      },
      wake,
      paint,
      measure,
      setParams(next) {
        if (destroyed) return;
        const updated = Object.assign({}, params);
        controls.forEach((control) => {
          if (!Object.hasOwn(next || {}, control.key)) return;
          let value = next[control.key];
          if (control.type === 'range')
            value = Number.isFinite(+value) ? runtimeClamp(+value, control.min, control.max) : control.default;
          else if (control.type === 'color')
            value = /^#[a-f0-9]{6}$/i.test(String(value)) ? String(value) : control.default;
          else if (control.type === 'toggle') value = !!value;
          else if (control.type === 'select' && !control.options.some((option) => option.value === value))
            value = control.default;
          updated[control.key] = value;
        });
        params = updated;
        emit('params', params);
        paint();
        if (active) wake();
      },
      setPaused(value) {
        if (destroyed) return;
        paused = !!value;
        element.dataset.paused = String(paused);
        stop();
        emit('pause', paused);
        if (!paused) {
          paint();
          if (active) wake();
        }
      },
      setReduced(value) {
        if (destroyed) return;
        reducedOverride = value == null ? null : !!value;
        syncMotion();
      },
      replay() {
        if (destroyed) return;
        stop();
        time = 0;
        emit('replay');
        paint();
        if (active) wake();
      },
      reset() {
        api.setParams(defaults);
        api.replay();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        stop();
        try {
          emit('destroy');
        } finally {
          cleanup
            .splice(0)
            .reverse()
            .forEach((fn) => {
              try {
                fn();
              } catch {}
            });
          hooks.clear();
          element.dataset.destroyed = 'true';
        }
      },
      status() {
        return {
          time,
          raf,
          frameCount,
          width,
          height,
          paused,
          destroyed,
          visible,
          reduced: reduced(),
          listeners: cleanup.length,
          params: Object.assign({}, params),
        };
      },
    };
    listen(preference, 'change', syncMotion);
    listen(document, 'visibilitychange', () => {
      stop();
      emit('visibility', !document.hidden);
      if (!document.hidden) wake();
    });
    listen(window, 'pageshow', (event) => {
      if (event.persisted) {
        measure();
        wake();
      }
    });
    listen(window, 'pagehide', (event) => {
      if (event.persisted) stop();
      else api.destroy();
    });
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    cleanup.push(() => resize.disconnect());
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      stop();
      emit('visibility', visible);
      if (visible) wake();
    });
    intersection.observe(options.visibilityTarget || element);
    cleanup.push(() => intersection.disconnect());
    element.dataset.reduced = String(reduced());
    width = Math.max(1, element.clientWidth);
    height = Math.max(1, element.clientHeight);
    return api;
  }

  const CONTROLS = [
    { key: 'countTo', type: 'range', default: 100, min: 5, max: 995, step: 5 },
    { key: 'countDuration', type: 'range', default: 1300, min: 600, max: 4000, step: 100 },
    { key: 'cutDuration', type: 'range', default: 1300, min: 600, max: 4000, step: 100 },
    { key: 'counter', type: 'toggle', default: true },
    { key: 'cut', type: 'toggle', default: true },
  ];

  // ---- the effect ----
  const TUNE = {
    start: 120,
    x0: 4,
    openDelay: 90,
    open: 560,
    fade: 120,
    dots: [1100, 1050, 1000, 950, 900],
    dotFrom: -60,
    line: 55,
    snip: [80, 90, 6, 7.9],
    snipOpen: [0.22, 1, 0.36, 1],
    snipClose: [0.55, 0, 1, 0.45],
    heroAt: 120,
    nav: [0, 280, 14],
    lines: [80, 60, 520, 18, 8],
    foot: [240, 520, 22],
    count: [0.33, 0.55, 0.2, 1],
    cut: [0.5, 0, 0.15, 1],
    fold: [0.7, 0.05, 0.3, 1],
    hero: [0.22, 1, 0.36, 1],
    dot: [0.22, 1, 0.36, 1],
  };
  const START = TUNE.start,
    X0 = TUNE.x0,
    OPEN_DELAY = TUNE.openDelay,
    OPEN = TUNE.open,
    FADE = TUNE.fade,
    DOTS = TUNE.dots,
    DOT_FROM = TUNE.dotFrom;
  const HERO_AT = TUNE.heroAt,
    HERO_END = Math.max(
      TUNE.nav[0] + TUNE.nav[1],
      TUNE.lines[0] + TUNE.lines[1] + TUNE.lines[2],
      TUNE.foot[0] + TUNE.foot[1],
    ),
    LOOP_HOLD = 1400,
    LOOP_BACK = 300,
    RESTORE = 400;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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
  const openEase = cubicBezier(...TUNE.fold),
    countEase = cubicBezier(...TUNE.count),
    cutEase = cubicBezier(...TUNE.cut),
    heroEase = cubicBezier(...TUNE.hero),
    dotEase = cubicBezier(...TUNE.dot);
  const outEase = cubicBezier(0.22, 1, 0.36, 1),
    snipOpenEase = cubicBezier(...TUNE.snipOpen),
    snipCloseEase = cubicBezier(...TUNE.snipClose);
  function bladeAngle(time, openAt) {
    const [lead, close, wide, rest] = TUNE.snip,
      c0 = openAt - close;
    if (time < c0 - lead) return 0;
    if (time < c0) return wide * snipOpenEase(seg(time, c0 - lead, lead));
    return wide - (wide + rest) * snipCloseEase(seg(time, c0, close));
  }
  const seg = (t, a, d) => clamp((t - a) / d, 0, 1);
  const SCISSORS =
    '<svg class="cl-scissors" viewBox="0 0 40 24" aria-hidden="true"><g class="cl-blade"><circle cx="5.5" cy="6.5" r="4"/><path d="M8.6 9.2 L15 12 L38 15.2"/></g><g class="cl-blade"><circle cx="5.5" cy="17.5" r="4"/><path d="M8.6 14.8 L15 12 L38 8.8"/></g><circle class="cl-pin" cx="15" cy="12" r="1.2"/></svg>';
  const strip = (cls, cells) =>
    '<span class="cl-win"><span class="cl-strip ' +
    cls +
    '">' +
    cells.map((d) => '<span>' + d + '</span>').join('') +
    '</span></span>';
  const H_CELLS = Array.from({ length: 10 }, (_, i) => i),
    T_CELLS = Array.from({ length: 100 }, (_, i) => i % 10),
    O_CELLS = Array.from({ length: 200 }, (_, i) => (i % 2) * 5);
  function counterHTML() {
    return (
      '<span class="cl-count" role="img" aria-label="0">' +
      strip('cl-h', H_CELLS) +
      strip('cl-t', T_CELLS) +
      strip('cl-o', O_CELLS) +
      '</span>'
    );
  }
  function heroHTML(compact) {
    return (
      '<div class="cl-site" lang="en"><div class="cl-face">' +
      '<div class="cl-nav" data-hero="nav"><span class="ck-text" data-strong>Oriel Studio</span>' +
      (compact
        ? '<span class="cl-links"><i class="ck-dot" data-weak></i><i class="ck-dot" data-weak></i><i class="ck-dot" data-weak></i></span>'
        : '<span class="cl-links"><span class="ck-text">Work</span><span class="ck-text">About</span><span class="ck-text">Journal</span></span>') +
      '</div>' +
      '<p class="cl-title"><span data-hero="line">Look</span><span data-hero="line">closer<span class="cl-stop">.</span></span></p>' +
      '<div class="cl-foot" data-hero="foot">' +
      (compact ? '' : '<p class="ck-text cl-sub">Independent design studio.</p>') +
      '<span class="ck-pill ck-solid" data-size="sm">Get in touch</span></div>' +
      '</div></div>'
    );
  }
  function mount(element, options) {
    options = options || {};
    const params = Object.assign({}, options.params || {});
    if (typeof options.counter === 'boolean') params.counter = options.counter;
    if (typeof options.cut === 'boolean') params.cut = options.cut;
    const api = scope(element, CONTROLS, Object.assign({}, options, { params }));
    const card = options.card || null,
      loop = !!options.preview && !(card && card.once);
    element.classList.add('cl-stage');
    let els = {},
      parts = {},
      t = 0,
      dir = 1,
      back = 0,
      restoreFrom = -1,
      restoreAt = 0,
      loopT = 0;
    const from = () => Math.round(clamp(+options.from || 0, 0, 995) / 5) * 5;
    const to = () => Math.round(api.params.countTo / 5) * 5;
    function timing() {
      const p = api.params,
        c = p.counter !== false,
        k = p.cut !== false;
      const end = START + (k ? p.cutDuration : p.countDuration);
      const openAt = k ? end + OPEN_DELAY : Infinity;
      return { c, k, end, openAt, total: k ? openAt + HERO_AT + HERO_END : end };
    }
    function build() {
      const p = api.params,
        c = p.counter !== false,
        k = p.cut !== false;
      parts = { c, k };
      const screenCls =
        'cl-screen' + (card ? ' ck-panel' : '') + (k ? '' : ' cl-only-count') + (c ? '' : ' cl-no-count');
      let html = '<div class="' + screenCls + '"' + (card ? ' data-size="lg"' : '') + '>';
      if (k) {
        html +=
          heroHTML(!!card) +
          '<i class="cl-cover cl-top"></i><i class="cl-cover cl-bot"></i>' +
          '<div class="cl-progress"><i class="cl-dash"></i><i class="cl-solid"></i><span class="cl-cutter">' +
          SCISSORS +
          '</span>' +
          (c ? counterHTML() : '') +
          '<span class="cl-label">Cut here<span class="cl-arrows" aria-hidden="true"><i></i><i></i><i></i></span></span></div>' +
          (card ? '' : '<div class="cl-dots" aria-hidden="true">' + DOTS.map(() => '<i></i>').join('') + '</div>');
      } else if (c) html += '<div class="cl-solo">' + counterHTML() + '</div>';
      html += '</div>';
      element.innerHTML = html;
      const q = (s) => element.querySelector(s),
        qa = (s) => [...element.querySelectorAll(s)];
      q('.cl-screen').style.setProperty('--cl-line', TUNE.line + '%');
      els = {
        screen: q('.cl-screen'),
        top: q('.cl-top'),
        bot: q('.cl-bot'),
        prog: q('.cl-progress'),
        solid: q('.cl-solid'),
        cutter: q('.cl-cutter'),
        count: q('.cl-count'),
        h: q('.cl-h'),
        t: q('.cl-t'),
        o: q('.cl-o'),
        dots: qa('.cl-dots i'),
        blades: qa('.cl-blade'),
        dotsBox: q('.cl-dots'),
        nav: q('[data-hero="nav"]'),
        lines: qa('[data-hero="line"]'),
        foot: q('[data-hero="foot"]'),
      };
    }
    function valueAt(e) {
      return R.mix(from(), to(), e);
    }
    function render(time) {
      const tm = timing(),
        p = api.params;
      if (els.count) {
        const e = parts.k ? cutEase(seg(time, START, p.cutDuration)) : countEase(seg(time, START, p.countDuration)),
          a = from(),
          b = to();
        const cell = [(n) => Math.floor(n / 100), (n) => Math.floor(n / 10), (n) => n / 5];
        [els.h, els.t, els.o].forEach((s, i) => {
          const pos = R.mix(cell[i](a), cell[i](b), e);
          s.style.transform = 'translateY(' + (-pos * 1.3).toFixed(4) + 'em)';
        });
        els.count.setAttribute('aria-label', String(Math.round(valueAt(e))));
      }
      if (!tm.k) return;
      const ce = cutEase(seg(time, START, p.cutDuration));
      els.cutter.style.transform = 'translateX(' + cutPos(ce) + ')';
      els.solid.style.width = time >= tm.openAt ? '100%' : 'calc(' + cutPos(ce) + ' + var(--cl-pivot))';
      setBlades(bladeAngle(time, tm.openAt));
      els.dots.forEach((d, i) => {
        d.style.translate = R.mix(DOT_FROM, 0, dotEase(seg(time, 0, DOTS[i]))).toFixed(3) + 'cqw 0';
      });
      const oe = openEase(seg(time, tm.openAt, OPEN));
      els.top.style.transform = 'scaleY(' + (1 - oe).toFixed(5) + ')';
      els.bot.style.transform = 'scaleY(' + (1 - oe).toFixed(5) + ')';
      const pf = 1 - seg(time, tm.openAt, FADE);
      let veil = 1;
      if (back > 0) {
        veil = back;
      }
      const hide = restoreFrom >= 0 ? 1 - outEase(restoreAt) : 1;
      if (back > 0) {
        els.top.style.transform = els.bot.style.transform = 'scaleY(1)';
        els.cutter.style.transform = 'translateX(' + cutPos(0) + ')';
        setBlades(0);
        els.solid.style.width = 'calc(' + cutPos(0) + ' + var(--cl-pivot))';
        els.dots.forEach((d) => {
          d.style.translate = DOT_FROM + 'cqw 0';
        });
        if (els.count) {
          [els.h, els.t, els.o].forEach((s, i) => {
            const pos = [Math.floor(from() / 100), Math.floor(from() / 10), from() / 5][i];
            s.style.transform = 'translateY(' + (-pos * 1.3).toFixed(4) + 'em)';
          });
        }
        els.top.style.opacity = els.bot.style.opacity = els.prog.style.opacity = veil.toFixed(4);
        if (els.dotsBox) els.dotsBox.style.opacity = veil.toFixed(4);
      } else {
        els.top.style.opacity = els.bot.style.opacity = hide.toFixed(4);
        els.prog.style.opacity = (pf * hide).toFixed(4);
        if (els.dotsBox) els.dotsBox.style.opacity = (pf * hide).toFixed(4);
      }
      const h0 = back > 0 || restoreFrom >= 0 ? Infinity : time - (tm.openAt + HERO_AT);
      const [n0, nd, ny] = TUNE.nav,
        [l0, lg, ld, ly, lb] = TUNE.lines,
        [f0, fd, fy] = TUNE.foot;
      rise(els.nav, heroEase(seg(h0, n0, nd)), ny);
      els.lines.forEach((l, i) => {
        const e = heroEase(seg(h0, l0 + i * lg, ld));
        rise(l, e, ly);
        l.style.filter = e < 1 ? 'blur(' + Math.max(0, lb * (1 - e)).toFixed(2) + 'px)' : '';
      });
      rise(els.foot, heroEase(seg(h0, f0, fd)), fy);
    }
    function cutPos(e) {
      return 'calc(' + X0 + '% + ' + e.toFixed(5) + ' * (100% - ' + X0 + '% - var(--cl-sw) - var(--cl-edge)))';
    }
    function setBlades(a) {
      if (els.blades.length === 2) {
        els.blades[0].setAttribute('transform', 'rotate(' + a.toFixed(3) + ' 15 12)');
        els.blades[1].setAttribute('transform', 'rotate(' + (-a).toFixed(3) + ' 15 12)');
      }
    }
    function rise(el, e, dy) {
      el.style.opacity = e < 1 ? e.toFixed(3) : '';
      el.style.transform = e < 1 ? 'translateY(' + (dy * (1 - e)).toFixed(2) + 'px)' : '';
    }
    function setT(v) {
      t = clamp(v, 0, timing().total);
    }
    build();
    api.on('params', () => {
      const p = api.params;
      if ((p.counter !== false) !== parts.c || (p.cut !== false) !== parts.k) {
        build();
        t = 0;
        dir = 1;
        back = 0;
        loopT = 0;
        restoreFrom = -1;
        api.wake();
      }
      setT(t);
      render(t);
    });
    api.on('replay', () => {
      t = 0;
      dir = 1;
      back = 0;
      loopT = 0;
      restoreFrom = -1;
      render(0);
    });
    api.on('motion', () => {
      render(t);
    });
    api.frame(({ dt, reduced }) => {
      const total = timing().total;
      if (reduced) {
        t = total;
        dir = 0;
        back = 0;
        restoreFrom = -1;
        render(t);
        return false;
      }
      const ms = dt * 1000;
      if (restoreFrom >= 0) {
        restoreAt = clamp(restoreAt + ms / RESTORE, 0, 1);
        render(t);
        if (restoreAt >= 1) {
          restoreFrom = -1;
          t = total;
          dir = 0;
          render(t);
          return false;
        }
        return true;
      }
      if (back > 0 || (loop && t >= total && dir > 0)) {
        loopT += ms;
        if (loopT < LOOP_HOLD) {
          render(t);
          return true;
        }
        back = clamp((loopT - LOOP_HOLD) / LOOP_BACK, 0, 1);
        render(t);
        if (back >= 1) {
          back = 0;
          loopT = 0;
          t = 0;
          render(0);
        }
        return true;
      }
      if (!dir) {
        render(t);
        return false;
      }
      setT(t + ms * dir);
      render(t);
      if ((dir > 0 && t >= total) || (dir < 0 && t <= 0)) {
        if (!loop) {
          dir = 0;
          return false;
        }
        if (dir < 0) {
          dir = 0;
          return false;
        }
      }
      return true;
    });
    api.play = (d) => {
      if (api.destroyed) return;
      restoreFrom = -1;
      back = 0;
      loopT = 0;
      dir = d > 0 ? 1 : -1;
      api.wake();
    };
    api.seek = (ms) => {
      if (api.destroyed) return;
      restoreFrom = -1;
      back = 0;
      setT(ms);
      render(t);
    };
    api.position = () => t;
    api.total = () => timing().total;
    api.moving = () => (restoreFrom >= 0 ? 0 : (dir > 0 && t < timing().total) || (dir < 0 && t > 0) ? dir : 0);
    api.restore = () => {
      if (api.destroyed) return;
      const total = timing().total;
      back = 0;
      loopT = 0;
      if (t >= total && restoreFrom < 0) {
        dir = 0;
        render(t);
        return;
      }
      if (api.reduced) {
        t = total;
        dir = 0;
        render(t);
        return;
      }
      dir = 0;
      restoreFrom = t;
      restoreAt = 0;
      api.wake();
    };
    const status = api.status;
    api.status = () => ({
      ...status(),
      t,
      dir,
      total: timing().total,
      value: els.count ? +els.count.getAttribute('aria-label') : null,
      counter: parts.c,
      cut: parts.k,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountCutLinePreloader(element, options) {
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
    element.classList.add('cut-line-preloader');
    element.innerHTML =
      '<div class="fx-board" data-cl-board tabindex="0" role="group" aria-label="Preloader. Click to replay; scroll down to play forward, up to play back."></div><button type="button" class="ck-pill cl-replay" data-size="sm">Replay</button>';
    const listeners = new AbortController();
    const stage = element,
      board = stage.querySelector('[data-cl-board]'),
      replayBtn = stage.querySelector('.cl-replay');
    const phone = matchMedia('(max-width: 760px)');
    let inst = null;
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        foot = 64;
      let x0 = 24,
        y0 = 24,
        x1 = W - 24,
        y1 = H - foot;
      if (phone.matches) {
        x0 = 16;
        x1 = W - 16;
        y0 = 16;
      }

      let w = Math.min(800, x1 - x0),
        h = w / 1.6;
      if (h > y1 - y0) {
        h = y1 - y0;
        w = Math.min(w, h * 1.6);
      }
      if (phone.matches) {
        w = x1 - x0;
        h = Math.min(y1 - y0, w * 1.3);
      }
      const x = x0 + (x1 - x0 - w) / 2,
        y = y0 + (y1 - y0 - h) / 2;
      [
        ['x', x],
        ['y', y],
        ['w', w],
        ['h', h],
      ].forEach(([k, v]) => board.style.setProperty('--cl-' + k, Math.round(v) + 'px'));
    }
    place();
    inst = mount(board, { params: options.params });
    const applyParams = inst.setParams;
    inst.setParams = (next) => {
      applyParams(next);
      inst.replay();
    };
    const touch = () => {};
    function replay() {
      inst.replay();
      touch();
    }
    function go(d) {
      if (inst.moving() === d) return true;
      const p = inst.position();
      if (d > 0 ? p >= inst.total() : p <= 0) return false;
      inst.play(d);
      touch();
      return true;
    }
    const WHEEL_GAP = 250;
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
        if (e.button === 0) down = { x: e.clientX, y: e.clientY };
      },
      { signal: listeners.signal },
    );
    board.addEventListener(
      'pointerup',
      (e) => {
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) replay();
        down = null;
      },
      { signal: listeners.signal },
    );
    board.addEventListener(
      'pointercancel',
      () => {
        down = null;
      },
      { signal: listeners.signal },
    );
    board.addEventListener(
      'keydown',
      (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const k = e.key;
        if (k === 'Enter' || k === ' ') {
          e.preventDefault();
          replay();
          return;
        }
        const used = k === 'ArrowDown' ? go(1) : k === 'ArrowUp' ? go(-1) : false;
        if (used) e.preventDefault();
      },
      { signal: listeners.signal },
    );
    replayBtn.addEventListener('click', replay, { signal: listeners.signal });

    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);

    inst.on('destroy', () => {
      listeners.abort();
      observer0.disconnect();
    });
    if (options.reducedMotion != null) inst.setReduced(options.reducedMotion);
    return {
      get params() {
        return Object.assign({}, inst.params);
      },
      setParams: inst.setParams,
      setPaused: inst.setPaused,
      reset() {
        inst.setParams(inst.defaults);
        if (inst.restore) inst.restore();
        else inst.replay();
      },
      setReducedMotion: inst.setReduced,
      destroy() {
        if (mounted.done) return;
        inst.destroy();
        mounted.restore();
      },
    };
  }
  global.mountCutLinePreloader = mountCutLinePreloader;
  if (typeof module === 'object' && module.exports) module.exports = mountCutLinePreloader;
})(typeof window !== 'undefined' ? window : this);
