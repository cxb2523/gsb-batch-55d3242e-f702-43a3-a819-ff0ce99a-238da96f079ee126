/*
 * Smear-Trail Preloader
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A site preloader on an ink screen: lines of uppercase text whip in from the left, and the first and last letter of each
 * line drag a string of translucent copies of themselves. The trail closes up as the line lands. After a short hold each
 * line whips out to the right while coming in again from the left. When loading is done the cover lifts off a placeholder page.
 *
 * How it moves (default values)
 * - Sweep: 1650 ms (params.sweep) on a lopsided quintic that turns at K = .38: t < K ? K (t / K)^5 : 1 - (1 - K) ((1 - t) /
 *   (1 - K))^5. A hard launch, then a long landing; most of the trail shows while the line lands.
 * - Line starts: index * 58 ms + 150 ms * random^2. Hold after landing: 600 ms (params.hold) * (.45 + 1.1 * random^2).
 * - Rest position: centred, then shifted by group (9 %, -3 %, -10 %) and line (26 %, -8 %, 13 %, -21 %, 5 %) percentages of
 *   the line's width, kept inside the screen.
 * - Trail: text-shadow stamps on the first letter (22 stamps, looks back 560 ms, params.trail) and the last letter (36 stamps,
 *   looks back 800 ms). The look-back shrinks by clamp((.93 - e) / (.93 - .18), 0, 1), e being the eased progress, so the
 *   trail retracts on landing. With x the current and tail the looked-back position, gap = x - tail: stamp i of n sits at
 *   x - gap * (i / n)^1.7 (bunched near the letter), at least .6 em from the previous one; alpha = base * (1 - i / n)^1.5 *
 *   min(1, (stamp - tail) / (.9 em)); base is .42 + .48 * random per lap.
 * - Reveal: when every line has landed + 260 ms, the cover moves up 100 % over 1150 ms on a lopsided cubic in-out (turns at
 *   .42). Page content rises 22 px from +360 ms (640 ms, cubic-bezier(.22, 1, .36, 1), 55 ms apart). One clock drives everything, so it can play backward and replay.
 *
 * Input
 * - Click or tap the screen (under 6 px of movement) or the Replay pill: replay. Wheel down / up over it: play forward /
 *   backward at normal speed; the wheel only picks a direction. Keyboard when focused: Enter or Space replays, ArrowDown /
 *   ArrowUp play forward / back.
 *
 * Options
 *   params.sweep   800..4000 ms, default 1650   one sweep
 *   params.hold    0..2400 ms, default 600      rest between sweeps
 *   params.trail   100..1500 ms, default 560    trail look-back
 *   params.laps    1..6, default 2              sweeps before the reveal (ignored with manual)
 *   lines          array of strings             the text, default five loading lines
 *   groups         1..3                         copies of the block; default 2, or 3 at 760 px or narrower
 *   manual         true / false                 loop until instance.finish(), which lands every line and lifts the cover
 *   reducedMotion  true / false / null          force reduced motion; null follows prefers-reduced-motion live
 *
 * Swap the colours with the CSS variables --sm-cover and --sm-paper on .sm-screen; the trail reads its colour from the text.
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountSmearTrailPreloader(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect replaces its children (fx.destroy() puts them back).
 * As a real preloader: mountSmearTrailPreloader(element, {manual: true}), then call fx.finish() once the page has loaded.
 * The instance also has fx.replay(), fx.setParams({...}), fx.setPaused(true / false), fx.setReducedMotion(true / false / null).
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const runtimeClamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const R = {};

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
    { key: 'sweep', type: 'range', default: 1650, min: 800, max: 4000, step: 50 },
    { key: 'hold', type: 'range', default: 600, min: 0, max: 2400, step: 20 },
    { key: 'trail', type: 'range', default: 560, min: 100, max: 1500, step: 10 },
    { key: 'laps', type: 'range', default: 2, min: 1, max: 6, step: 1 },
  ];

  // ---- the effect ----
  const K = 0.38,
    POW = 5,
    LEAD = 1.3,
    STEP = 58,
    JIT = 150,
    HF0 = 0.45,
    HF1 = 1.1;
  const STAMPS = 22,
    ESTAMPS = 36,
    END_RATIO = 800 / 560,
    SPREAD = 1.7,
    FADE_POW = 1.5,
    MIN_STEP = 0.6,
    FADE_LEN = 0.9,
    TALPHA = 0.42,
    TALPHA_R = 0.48,
    MERGE0 = 0.18,
    MERGE1 = 0.93;
  const GS = [0.09, -0.03, -0.1],
    ST = [0.26, -0.08, 0.13, -0.21, 0.05];
  const START = 240,
    REST = 260,
    LIFT = 1150,
    LIFT_K = 0.42,
    HERO_AT = 360,
    HERO = 640,
    HERO_RISE = 22,
    HERO_STAG = 55,
    LOOP_HOLD = 1300,
    LOOP_BACK = 280,
    RESTORE = 360;
  const DEFAULT_LINES = ['Loading the page', 'Fetching the images', 'Setting the type', 'Nearly there', 'Welcome in'];
  const CARD_LINES = ['Loading', 'Fetching', 'Setting type', 'Nearly there', 'Welcome'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const seg = (t, a, d) => clamp((t - a) / d, 0, 1);
  const lop = (t, k, p) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < k ? k * Math.pow(t / k, p) : 1 - (1 - k) * Math.pow((1 - t) / (1 - k), p);
  const E = (t) => lop(t, K, POW);
  const liftE = (t) => lop(t, LIFT_K, 3);
  function bezier(x1, y1, x2, y2) {
    const c = (a, b, t) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0,
        hi = 1,
        t = x;
      for (let i = 0; i < 22; i++) {
        t = (lo + hi) / 2;
        if (c(x1, x2, t) < x) lo = t;
        else hi = t;
      }
      return c(y1, y2, t);
    };
  }
  const outE = bezier(0.22, 1, 0.36, 1);
  const merge = (p) => clamp((MERGE1 - E(p)) / (MERGE1 - MERGE0), 0, 1);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let z = a;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lineHTML(s) {
    s = String(s);
    const lead = esc(s.charAt(0)),
      mid = esc(s.slice(1, -1)),
      end = s.length > 1 ? esc(s.slice(-1)) : '';
    return '<span data-l>' + lead + '</span>' + mid + '<span data-e>' + end + '</span>';
  }
  function heroHTML(compact) {
    return (
      '<div class="sm-site" lang="en"><div class="sm-face">' +
      '<div class="sm-nav" data-hero><span class="ck-text" data-strong>Oriel Studio</span>' +
      (compact
        ? ''
        : '<span class="sm-links"><span class="ck-text">Work</span><span class="ck-text">About</span><span class="ck-text">Journal</span></span>') +
      '</div>' +
      '<p class="sm-title"><span data-hero>Come</span><span data-hero>on in<span class="sm-stop">.</span></span></p>' +
      '<div class="sm-foot" data-hero><span class="ck-pill ck-solid" data-size="sm">Get in touch</span></div>' +
      '</div></div>'
    );
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const card = options.card || null,
      loop = !!options.preview && !(card && card.once);
    const manual = !!options.manual,
      groups = clamp(options.groups || (card ? 1 : 3), 1, 3),
      texts = options.lines || (card ? CARD_LINES : DEFAULT_LINES);
    element.classList.add('sm-stage');
    const screen = document.createElement('div');
    screen.className = 'sm-screen' + (card ? ' ck-panel' : '');
    if (card) screen.setAttribute('data-size', 'lg');
    screen.setAttribute('role', 'status');
    screen.setAttribute('aria-label', 'Loading');
    let html = heroHTML(!!card) + '<div class="sm-cover" aria-hidden="true">';
    for (let g = 0; g < groups; g++) {
      html += '<div class="sm-group">';
      texts.forEach((s) => {
        const h = lineHTML(s);
        html += '<div class="sm-row"><p>' + h + '</p><p>' + h + '</p></div>';
      });
      html += '</div>';
    }
    screen.innerHTML = html + '</div>';
    element.appendChild(screen);
    const cover = screen.querySelector('.sm-cover'),
      heroes = [...screen.querySelectorAll('[data-hero]')];
    const lines = [...screen.querySelectorAll('.sm-row')].map((row, i) => {
      const [live, ghost] = row.children;
      const n = texts.length,
        g = Math.floor(i / n);
      return {
        i,
        gs: GS[g % 3],
        st: ST[(i % n) % 5],
        live,
        ghost,
        lead: live.querySelector('[data-l]'),
        end: live.querySelector('[data-e]'),
        glead: ghost.querySelector('[data-l]'),
        gend: ghost.querySelector('[data-e]'),
        w: 0,
        base: 0,
        dist: 0,
        back: 0,
        size: 32,
        start: 0,
        laps: [],
        last: Infinity,
        rand: null,
      };
    });
    let W = 0,
      paper = '240 240 239',
      seed = 1,
      finished = false,
      t = START,
      dir = 1,
      back = 0,
      loopT = 0,
      restoreFrom = -1,
      restoreAt = 0;
    const D = () => api.params.sweep;
    function lap(l, a) {
      const r = l.rand();
      return { a: a === undefined ? l.start : a, hf: HF0 + HF1 * r * r, ta: TALPHA + l.rand() * TALPHA_R };
    }
    function grow(l, time) {
      if (!l.laps.length) l.laps.push(lap(l));
      for (;;) {
        const q = l.laps[l.laps.length - 1],
          next = q.a + D() + api.params.hold * q.hf;
        if (l.laps.length - 1 >= l.last || next > time) return;
        l.laps.push(lap(l, next));
      }
    }
    function schedule() {
      lines.forEach((l) => {
        l.rand = rng(seed * 7919 + l.i * 104729);
        const r = l.rand();
        l.start = (l.i % texts.length) * STEP + JIT * r * r;
        l.laps = [];
        l.last = manual ? Infinity : Math.round(api.params.laps) - 1;
        grow(l, manual ? 0 : Infinity);
      });
      finished = !manual;
    }
    const revealAt = () => {
      if (!finished) return Infinity;
      let m = 0;
      lines.forEach((l) => {
        m = Math.max(m, l.laps[l.laps.length - 1].a + D());
      });
      return m + REST;
    };
    const total = () => revealAt() + Math.max(LIFT, HERO_AT + HERO + 200);
    function layout() {
      const H = screen.clientHeight;
      W = screen.clientWidth;
      if (!W || !H) return;
      cover.style.setProperty('--sm-fs', '100px');
      let widest = 0;
      lines.forEach((l) => {
        l.w = l.live.offsetWidth;
        widest = Math.max(widest, l.w);
      });
      const rows = texts.length * groups,
        fs = Math.floor(Math.min((H * 0.84) / (rows * 1.04 + (groups - 1) * 1.1), (W * 0.86) / (widest / 100)));
      cover.style.setProperty('--sm-fs', fs + 'px');
      const m = getComputedStyle(cover).color.match(/[\d.]+/g);
      if (m) paper = m.slice(0, 3).join(' ');
      lines.forEach((l) => {
        l.w = (l.w * fs) / 100;
        l.size = fs;
        const pad = Math.min(W * 0.03, 20);
        l.base = clamp((W - l.w) / 2 + (l.gs + l.st) * l.w, pad, Math.max(pad, W - l.w - pad));
        l.dist = l.base + l.w;
        l.back = Math.max(0, LEAD * fs - l.base);
      });
    }
    function smear(pos, x, tau, scale, size, ta, count, win) {
      const tail = scale > 0 ? pos(tau - win * scale) : x,
        gap = x - tail;
      if (gap <= 1) return '';
      const minStep = size * MIN_STEP,
        fadeLen = size * FADE_LEN,
        stamps = [];
      let behind = 0,
        n = 0;
      while (++n <= count) {
        const f = n / count;
        behind = Math.max(gap * Math.pow(f, SPREAD), behind + minStep);
        if (behind >= gap) break;
        const alpha = ta * Math.pow(1 - f, FADE_POW) * Math.min(1, (gap - behind) / fadeLen);
        if (alpha > 0.01)
          stamps.push((-behind).toFixed(1) + 'px 0 rgb(' + paper + ' / ' + (alpha * 100).toFixed(0) + '%)');
      }
      return stamps.join(', ');
    }
    function paint(el, lead, end, pos, tau, size, ta, p) {
      const x = pos(tau),
        s = p < 1 ? merge(p) : 0,
        win = api.params.trail;
      el.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
      el.style.opacity = '1';
      lead.style.textShadow = p < 1 ? smear(pos, x, tau, s, size, ta, STAMPS, win) : '';
      end.style.textShadow = p < 1 ? smear(pos, x, tau, s, size, ta, ESTAMPS, win * END_RATIO) : '';
    }
    function render(time) {
      const d = D();
      lines.forEach((l) => {
        grow(l, time);
        if (time < l.start) {
          l.live.style.opacity = '0';
          l.ghost.style.opacity = '0';
          return;
        }
        let k = l.laps.length - 1;
        while (k > 0 && l.laps[k].a > time) k--;
        const q = l.laps[k],
          tau = time - q.a;
        const enter = (u) => l.base - (l.dist + l.back) * (1 - E(clamp(u / d, 0, 1)));
        paint(l.live, l.lead, l.end, enter, tau, l.size, q.ta, tau / d);
        if (k > 0 && tau < d) {
          const travel = W - l.base + l.size * 0.5,
            leave = (u) => l.base + travel * E(clamp(u / d, 0, 1));
          paint(l.ghost, l.glead, l.gend, leave, tau, l.size, l.laps[k - 1].ta, tau / d);
        } else l.ghost.style.opacity = '0';
      });
      const r = revealAt(),
        lift = liftE(seg(time, r, LIFT));
      cover.style.transform = lift > 0 ? 'translateY(' + (-100 * lift).toFixed(3) + '%)' : '';
      cover.style.visibility = lift >= 1 ? 'hidden' : '';
      const fade = restoreFrom >= 0 ? 1 - restoreAt : back > 0 ? back : 1;
      cover.style.opacity = fade < 1 ? fade.toFixed(3) : '';
      if (back > 0) {
        cover.style.transform = '';
        cover.style.visibility = '';
        lines.forEach((l) => {
          l.live.style.opacity = '0';
          l.ghost.style.opacity = '0';
        });
      }
      const h0 = restoreFrom >= 0 || back > 0 ? Infinity : time - (r + HERO_AT);
      heroes.forEach((el, i) => {
        const e = outE(seg(h0, i * HERO_STAG, HERO));
        el.style.opacity = e < 1 ? e.toFixed(3) : '';
        el.style.transform = e < 1 ? 'translateY(' + (HERO_RISE * (1 - e)).toFixed(2) + 'px)' : '';
      });
    }
    function setT(v) {
      t = clamp(v, START, total());
    }
    function fresh() {
      seed++;
      schedule();
      t = START;
      dir = 1;
      back = 0;
      loopT = 0;
      restoreFrom = -1;
    }
    schedule();
    layout();
    render(t);
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(() => {
        if (!api.destroyed) {
          layout();
          render(t);
        }
      });
    const ro = new ResizeObserver(() => {
      if (!api.destroyed && screen.clientWidth !== W) {
        layout();
        render(t);
      } else if (!api.destroyed && screen.clientHeight) {
        layout();
        render(t);
      }
    });
    ro.observe(screen);
    api.on('destroy', () => {
      ro.disconnect();
      screen.remove();
      element.classList.remove('sm-stage');
    });
    api.on('resize', () => {
      layout();
      render(t);
    });
    api.on('params', () => {
      schedule();
      setT(t);
      render(t);
    });
    api.on('replay', () => {
      fresh();
      render(t);
    });
    api.on('motion', () => {
      render(t);
    });
    api.frame(({ dt, reduced }) => {
      const end = total();
      if (reduced) {
        back = 0;
        restoreFrom = -1;
        dir = 0;
        t = finished ? end : Math.max(...lines.map((l) => l.start + D()));
        render(t);
        return false;
      }
      const ms = dt * 1000;
      if (restoreFrom >= 0) {
        restoreAt = clamp(restoreAt + ms / RESTORE, 0, 1);
        render(t);
        if (restoreAt >= 1) {
          restoreFrom = -1;
          t = end;
          dir = 0;
          render(t);
          return false;
        }
        return true;
      }
      if (back > 0 || (loop && t >= end && dir > 0)) {
        loopT += ms;
        if (loopT < LOOP_HOLD) {
          render(t);
          return true;
        }
        back = clamp((loopT - LOOP_HOLD) / LOOP_BACK, 0.001, 1);
        render(t);
        if (back >= 1) {
          fresh();
          render(t);
        }
        return true;
      }
      if (!dir) {
        render(t);
        return false;
      }
      setT(t + ms * dir);
      render(t);
      if (dir > 0 && t >= end && !loop) {
        dir = 0;
        return false;
      }
      if (dir < 0 && t <= START) {
        dir = 0;
        return false;
      }
      return true;
    });
    api.finish = () => {
      if (api.destroyed || finished) return;
      lines.forEach((l) => {
        grow(l, t);
        let k = l.laps.length - 1;
        while (k > 0 && l.laps[k].a > t) k--;
        l.last = k;
        l.laps.length = k + 1;
      });
      finished = true;
      api.wake();
    };
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
    api.total = total;
    api.start = () => START;
    api.moving = () => (restoreFrom >= 0 ? 0 : (dir > 0 && t < total()) || (dir < 0 && t > START) ? dir : 0);
    api.restore = () => {
      if (api.destroyed) return;
      const end = total();
      back = 0;
      loopT = 0;
      if (t >= end && restoreFrom < 0) {
        dir = 0;
        render(t);
        return;
      }
      if (api.reduced) {
        t = end;
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
    api.status = () => ({ ...status(), t, dir, total: total(), finished, groups });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountSmearTrailPreloader(element, options) {
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
    element.classList.add('smear-trail-preloader');
    element.innerHTML =
      '<div class="fx-board" data-sm-board tabindex="0" role="group" aria-label="Preloader. Click to replay; scroll down to play forward, up to play back."></div><button type="button" class="ck-pill sm-replay" data-size="sm">Replay</button>';
    const listeners = new AbortController();
    const stage = element,
      board = stage.querySelector('[data-sm-board]'),
      replayBtn = stage.querySelector('.sm-replay');
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

      let w = x1 - x0,
        h = y1 - y0;
      if (!phone.matches) h = Math.min(h, w / 1.45);
      const x = x0 + (x1 - x0 - w) / 2,
        y = y0 + (y1 - y0 - h) / 2;
      [
        ['x', x],
        ['y', y],
        ['w', w],
        ['h', h],
      ].forEach(([k, v]) => board.style.setProperty('--sm-' + k, Math.round(v) + 'px'));
    }
    place();
    inst = mount(board, {
      params: options.params,
      groups: options.groups || (phone.matches ? 3 : 2),
      lines: options.lines,
      manual: options.manual,
    });
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
      if (d > 0 ? p >= inst.total() : p <= inst.start()) return false;
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
      finish: () => inst.finish(),
      replay: () => inst.replay(),
    };
  }
  global.mountSmearTrailPreloader = mountSmearTrailPreloader;
  if (typeof module === 'object' && module.exports) module.exports = mountSmearTrailPreloader;
})(typeof window !== 'undefined' ? window : this);
