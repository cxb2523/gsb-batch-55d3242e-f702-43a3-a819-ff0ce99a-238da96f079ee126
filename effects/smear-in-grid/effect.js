/*
 * Smear-In Grid
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A grid of twelve pictures arrives with a smear: each card starts squashed flat into a blurred horizontal band, then
 * opens and sharpens into place, in a random order, a beat apart. Squashing a picture pulls its own colour
 * fields into streaks, so the band reads as a smear of the image rather than a grey line. Plays once on load. Good for a
 * portfolio or product grid entrance.
 *
 * How it moves (default values)
 * - Card i with rank r starts at delay + r x stagger (120 ms + r x 40 ms) and takes ms (760 ms). Its progress p runs
 *   through two curves: scaleY 0.12 -> 1 on cubic-bezier(.28,1.3,.36,1), which overshoots about 3% past full height and
 *   settles back (a small pop on landing); opacity 0 -> 1 and blur 14 px -> 0 share a quadratic fall-off, remain =
 *   (1 - p)^2, opacity = 1 - remain, blur = 14 px x remain (in CSS: cubic-bezier(.33,.67,.67,1)), so a card fades in
 *   while its smear is still wide. Twelve cards take about 1.3 s in all.
 * - The sequence is a pure function of time, so it can play forward or backward from any point. A landed card has every
 *   inline style removed (no filter, transform or will-change left behind).
 * - The animation is written on a wrapper (.sq-arrive) around each picture, so the picture's own transforms are untouched.
 * - Order (params.order): random (the default, a new shuffle on every replay), rows, centre (nearest the middle first) or
 *   edges (outermost first).
 * - Layout: 4 x 3 when the viewport is wider than 760 px, 3 x 4 at 760 px and below (the same twelve pictures,
 *   re-ordered; crossing the breakpoint jumps to the landed grid). Cards are 4:3, gaps are 14/105 of a card width, the
 *   grid is at most 720 px wide, centred, and shrinks until it fits with 32 px margins (16 px on phones).
 *
 * Input
 * - Wheel down over the grid: play forward at normal speed until every card has landed; wheel up: play backward to the
 *   start (all bands, invisible). The wheel only picks a direction; reversing mid-way turns around in place. A gesture
 *   that moved the grid keeps its trailing inertia; a new gesture (after 250 ms) with nothing to play scrolls the page.
 * - Touch or pen: a vertical drag of more than 12 px picks the direction (finger up = forward). A drag that has nothing
 *   to move from its first step scrolls the page instead (the grid has touch-action: none and scrolls it by script).
 * - Click or tap without dragging (under 6 px), or the Replay pill: replay with a new random order.
 * - Keyboard, grid focused (tabindex 0): ArrowDown / PageDown forward, ArrowUp / PageUp back, Home / End jump to the start
 *   or the landed grid.
 *
 * Options
 *   params.squash    0.01..1, default 0.12       starting scaleY; 1 = no squash, only the fade and blur
 *   params.blur      0..60 px, default 14        starting blur
 *   params.ms        200..2400 ms, default 760   one card's arrival
 *   params.stagger   0..160 ms, default 40       gap between two cards' starts
 *   params.delay     0..2000 ms, default 120     pause before the first card
 *   params.order     'random' | 'rows' | 'centre' | 'edges', default 'random'
 *   reducedMotion    true / false / null         force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountSmearInGrid(element, {params: {...}, reducedMotion: null});
 *   fx.params                 copy of current params
 *   fx.setParams({ms: 1200})  change params; the arrival then replays (new random order) so the change is visible
 *   fx.setPaused(true|false)  freeze / resume
 *   fx.reset()                params back to defaults; the grid fades out (200 ms) and back in landed (300 ms, both
 *                             cubic-bezier(.22,1,.36,1)), no replay
 *   fx.setReducedMotion(bool)
 *   fx.destroy()              stops the loop, removes listeners and observers (the grid markup stays in the element;
 *                             empty it if you reuse the element)
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountSmearInGrid(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect replaces its children.
 *
 * Safe to change
 * - The pictures: PICTURES (placeholder pictures built from fields in % of the card) and the DESK / PHONE lists that pick
 *   them. Real images work too; images with strong left/right contrast give the best streaks, flat or centred images
 *   smear into a dull grey band.
 * - Grid size, columns and gap (place(), --sq-x / --sq-y / --sq-w / --sq-gap), colours and radius in effect.css.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Height on its own springy curve, opacity and blur together on the slower fall-off: if the blur clears faster than the
 *   fade the streaks never show, and without the overshoot the cards stop dead instead of landing.
 * - Squash and blur together: blur without squash is a soft fade, squash without blur is a thin hard line.
 * - The random order with a small stagger; a left-to-right sweep reads as a wipe, not as cards landing.
 * - Animate the wrapper, not the picture; clear the inline styles once a card has landed.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children; it writes styles to the cells directly.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The grid is a focusable group with an aria-label describing the controls; the pictures are aria-hidden placeholders.
 *   Give real images alt text if you swap them in.
 * - With reduced motion every card is shown landed at once; playing back jumps straight to the start.
 * - The loop runs only while something moves and stops when the tab is hidden, the element is off screen or paused.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
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
            value = Number.isFinite(+value) ? clamp(+value, control.min, control.max) : control.default;
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
    { key: 'squash', type: 'range', default: 0.12, min: 0.01, max: 1, step: 0.01 },
    { key: 'blur', type: 'range', default: 14, min: 0, max: 60, step: 1 },
    { key: 'ms', type: 'range', default: 760, min: 200, max: 2400, step: 20 },
    { key: 'stagger', type: 'range', default: 40, min: 0, max: 160, step: 2 },
    { key: 'delay', type: 'range', default: 120, min: 0, max: 2000, step: 20 },
    {
      key: 'order',
      type: 'select',
      default: 'random',
      options: [{ value: 'random' }, { value: 'rows' }, { value: 'centre' }, { value: 'edges' }],
    },
  ];

  // ---- the effect ----
  function bezierEase(ax, ay, bx, by) {
    const poly = (c1, c2, u) => {
      const v = 1 - u;
      return 3 * v * v * u * c1 + 3 * v * u * u * c2 + u * u * u;
    };
    const slope = (c1, c2, u) => {
      const v = 1 - u;
      return 3 * v * v * c1 + 6 * v * u * (c2 - c1) + 3 * u * u * (1 - c2);
    };
    const N = 64,
      table = new Float64Array(N + 1);
    for (let j = 0; j <= N; j++) table[j] = poly(ax, bx, j / N);
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let j = 0;
      while (j < N - 1 && table[j + 1] < x) j++;
      const span = table[j + 1] - table[j];
      let u = (j + (span > 0 ? (x - table[j]) / span : 0)) / N;
      for (let pass = 0; pass < 2; pass++) {
        const d = slope(ax, bx, u);
        if (Math.abs(d) < 1e-6) break;
        u -= (poly(ax, bx, u) - x) / d;
        u = Math.min(1, Math.max(0, u));
      }
      return poly(ay, by, u);
    };
  }
  const curve = {
    out: bezierEase(0.22, 1, 0.36, 1),
    spring: bezierEase(0.28, 1.3, 0.36, 1),
  };
  const REST_MS = 3600,
    OUTRO_MS = 320,
    FADE_AWAY = 200,
    FADE_BACK = 300;
  const PICTURES = [
    {
      g: 2,
      parts: [
        ['block', 0, 0, 36, 100],
        ['disc', 58, 22, 26],
      ],
    },
    {
      g: 1,
      parts: [
        ['disc', 8, 14, 50],
        ['block', 72, 0, 9, 100],
      ],
    },
    {
      g: 0,
      parts: [
        ['block', 16, 0, 11, 100],
        ['block', 42, 0, 11, 100],
        ['block', 68, 0, 11, 100],
      ],
    },
    {
      g: 2,
      parts: [
        ['block', 0, 62, 100, 38],
        ['mark', 56, 12, 28],
      ],
    },
    {
      g: 1,
      parts: [
        ['block', 52, 0, 48, 100],
        ['soft', 12, 30, 26],
      ],
    },
    {
      g: 0,
      parts: [
        ['block', 0, 0, 100, 30],
        ['disc', 14, 44, 34],
        ['thin', 62, 44, 26, 40],
      ],
    },
    {
      g: 2,
      parts: [
        ['block', 0, 0, 60, 100],
        ['soft', 70, 34, 20],
      ],
    },
    {
      g: 1,
      parts: [
        ['block', 0, 0, 12, 100],
        ['block', 34, 38, 46, 24],
      ],
    },
  ];
  const DEMO_SET = [0, 1, 2, 3, 4, 5, 6, 7, 7, 0, 5, 2],
    CARD_SET = [0, 3, 2, 4, 1, 6];
  function partHTML([kind, x, y, w, h]) {
    const box = 'left:' + x + '%;top:' + y + '%;width:' + w + '%;';
    if (kind === 'block' || kind === 'thin')
      return (
        '<i class="sq-f ck-line"' +
        (kind === 'block' ? ' data-strong' : '') +
        ' style="' +
        box +
        'height:' +
        h +
        '%"></i>'
      );
    const extra = kind === 'disc' ? ' ck-solid' : '',
      flag = kind === 'soft' ? ' data-weak' : kind === 'mark' ? ' data-accent' : '';
    return '<i class="sq-f sq-disc ck-dot' + extra + '"' + flag + ' style="' + box + 'height:auto"></i>';
  }
  function pictureHTML(index) {
    const pic = PICTURES[index % PICTURES.length];
    return (
      '<div class="sq-pic ck-media" data-size="sm"' +
      (pic.g ? ' data-tone="' + pic.g + '"' : '') +
      ' aria-hidden="true">' +
      pic.parts.map(partHTML).join('') +
      '</div>'
    );
  }
  function seeded(start) {
    let h = start >>> 0 || 1;
    return () => {
      h ^= h << 13;
      h >>>= 0;
      h ^= h >>> 17;
      h ^= h << 5;
      h >>>= 0;
      return h / 4294967296;
    };
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options),
      card = options.card || null;
    element.classList.add('sq-stage');
    const set = card ? card.pics || CARD_SET : DEMO_SET,
      columns = card ? card.cols || 3 : 4;
    const hint = card
      ? ''
      : '<p class="cr-hint" data-cr-chrome>' +
        (options.preview ? 'Cards squash into bands, then open into images' : 'Click to replay') +
        '</p>';
    element.innerHTML =
      '<div class="sq-grid" style="--sq-cols:' +
      columns +
      '">' +
      set.map((k) => '<div class="sq-cell"><div class="sq-arrive">' + pictureHTML(k) + '</div></div>').join('') +
      '</div>' +
      hint;
    const grid = element.querySelector('.sq-grid'),
      wraps = [...element.querySelectorAll('.sq-arrive')],
      count = wraps.length;
    const repeats = !!(options.preview || card) && !(card && card.once);
    const slot = new Array(count).fill(0);
    let shuffleSeed = 7,
      clock = 0,
      heading = 0,
      state = repeats ? 'loop' : 'run',
      lastRound = -1,
      fadeClock = -1,
      fadeStart = 1,
      gridAlpha = 1;
    if (state === 'run') heading = 1;
    const num = (key, min) => Math.max(min, +api.params[key]);
    const total = () => num('delay', 0) + (count - 1) * num('stagger', 0) + num('ms', 60);
    function order() {
      const how = api.params.order,
        ids = wraps.map((_, i) => i);
      let list = ids;
      if (how === 'centre' || how === 'edges') {
        const g = grid.getBoundingClientRect(),
          mx = g.left + g.width / 2,
          my = g.top + g.height / 2;
        const dist = wraps.map((w) => {
          const b = w.parentNode.getBoundingClientRect();
          return Math.hypot(b.left + b.width / 2 - mx, b.top + b.height / 2 - my);
        });
        list = ids.slice().sort((a, b) => dist[a] - dist[b] || a - b);
        if (how === 'edges') list.reverse();
      } else if (how !== 'rows') {
        const rnd = seeded((shuffleSeed += 101));
        list = ids.slice();
        for (let k = list.length - 1; k > 0; k--) {
          const j = Math.floor(rnd() * (k + 1));
          [list[k], list[j]] = [list[j], list[k]];
        }
      }
      list.forEach((w, pos) => {
        slot[w] = pos;
      });
    }
    function draw(at) {
      const flat = Math.max(0.01, +api.params.squash),
        smear = num('blur', 0),
        len = num('ms', 60),
        gap = num('stagger', 0),
        wait = num('delay', 0);
      for (let i = 0; i < count; i++) {
        const w = wraps[i],
          st = w.style,
          u = (at - wait - slot[i] * gap) / len;
        if (u >= 1) {
          if (w.dataset.live) {
            st.opacity = st.transform = st.filter = st.willChange = '';
            delete w.dataset.live;
          }
          continue;
        }
        const x = Math.max(0, u),
          height = flat + (1 - flat) * curve.spring(x),
          remain = (1 - x) * (1 - x),
          soft = smear * remain;
        st.opacity = (1 - remain).toFixed(4);
        st.transform = 'scaleY(' + height.toFixed(4) + ')';
        st.filter = soft > 0.005 ? 'blur(' + soft.toFixed(2) + 'px)' : 'none';
        if (!w.dataset.live) {
          st.willChange = 'transform,opacity,filter';
          w.dataset.live = '1';
        }
      }
    }
    function alpha(v) {
      if (v === gridAlpha) return;
      gridAlpha = v;
      grid.style.opacity = v >= 1 ? '' : v.toFixed(4);
    }
    api.listen(element, 'click', () => {
      if (!card && !options.preview && !api.paused) api.replay();
    });
    api.on('replay', () => {
      order();
      lastRound = -1;
      fadeClock = -1;
      alpha(1);
      clock = 0;
      state = repeats ? 'loop' : 'run';
      if (!repeats) heading = 1;
    });
    api.on('params', () => {
      if (state === 'rest') clock = total();
    });
    api.frame(({ dt, time, reduced }) => {
      const step = dt * 1000;
      if (reduced) {
        alpha(1);
        clock = total();
        if (state !== 'loop') state = 'rest';
        heading = 0;
        draw(Infinity);
        return false;
      }
      if (state === 'loop') {
        const run = total(),
          round = REST_MS + OUTRO_MS + run,
          now = time * 1000,
          r = Math.floor(now / round),
          local = now - r * round;
        if (local < REST_MS) {
          alpha(1);
          draw(Infinity);
        } else if (local < REST_MS + OUTRO_MS) {
          alpha(1 - curve.out((local - REST_MS) / OUTRO_MS));
          draw(Infinity);
        } else {
          if (r !== lastRound) {
            lastRound = r;
            order();
          }
          alpha(1);
          draw(local - REST_MS - OUTRO_MS);
        }
        return true;
      }
      if (state === 'restore') {
        fadeClock += step;
        if (fadeClock < FADE_AWAY) {
          alpha(fadeStart * (1 - curve.out(fadeClock / FADE_AWAY)));
          draw(clock);
          return true;
        }
        clock = total();
        draw(Infinity);
        const back = (fadeClock - FADE_AWAY) / FADE_BACK;
        if (back < 1) {
          alpha(curve.out(back));
          return true;
        }
        alpha(1);
        state = 'rest';
        fadeClock = -1;
        return false;
      }
      if (state === 'run' && heading) {
        const run = total();
        clock += heading * step;
        if (heading > 0 && clock >= run) {
          clock = run;
          heading = 0;
          state = 'rest';
          draw(Infinity);
          return false;
        }
        if (heading < 0 && clock <= 0) {
          clock = 0;
          heading = 0;
          state = 'hold';
          draw(0);
          return false;
        }
        draw(clock);
        return true;
      }
      draw(state === 'rest' ? Infinity : clock);
      return false;
    });
    api.position = () => (state === 'rest' || state === 'loop' ? total() : Math.min(clock, total()));
    api.end = total;
    api.moving = () => (state === 'run' ? heading : 0);
    api.play = (d) => {
      if (state === 'restore') return;
      const from = api.position();
      fadeClock = -1;
      alpha(1);
      if (api.reduced) {
        heading = 0;
        clock = d > 0 ? total() : 0;
        state = d > 0 ? 'rest' : 'hold';
        draw(d > 0 ? Infinity : 0);
        return;
      }
      clock = from;
      state = 'run';
      heading = d > 0 ? 1 : -1;
      api.wake();
    };
    api.jump = (d) => {
      heading = 0;
      fadeClock = -1;
      alpha(1);
      if (d > 0) {
        clock = total();
        state = 'rest';
        draw(Infinity);
      } else {
        clock = 0;
        state = 'hold';
        draw(0);
      }
    };
    api.restore = () => {
      if (state === 'loop' || (state === 'rest' && gridAlpha >= 1)) return;
      heading = 0;
      if (api.reduced) {
        alpha(1);
        clock = total();
        state = 'rest';
        draw(Infinity);
        return;
      }
      fadeStart = gridAlpha;
      fadeClock = 0;
      state = 'restore';
      api.wake();
    };
    order();
    const baseStatus = api.status;
    api.status = () => ({
      ...baseStatus(),
      mode: state,
      t: Math.round(api.position()),
      dir: heading,
      end: total(),
      grid: gridAlpha,
      order: slot.slice(),
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountSmearInGrid(element, options) {
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
    element.classList.add('smear-in-grid');
    element.innerHTML =
      '<div class="fx-board" data-sq-board tabindex="0" role="group" aria-label="Entrance animation. Scroll, swipe, or use arrow keys to play forward or back; Home and End jump to either end; click to replay."></div><button type="button" class="ck-pill sq-replay" data-size="sm">Replay</button>';
    const listeners = new AbortController();
    const stage = element,
      board = stage.querySelector('[data-sq-board]'),
      replayBtn = stage.querySelector('.sq-replay');
    const phone = matchMedia('(max-width: 760px)'),
      reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const DESK = [0, 1, 2, 3, 4, 5, 6, 7, 7, 0, 5, 2],
      PHONE = [0, 1, 2, 4, 3, 5, 6, 7, 0, 7, 5, 2];
    let inst = null,
      cols = 0;
    function build() {
      cols = phone.matches ? 3 : 4;
      inst = mount(board, {
        params: options.params,
        preview: true,
        card: { cols, pics: cols === 3 ? PHONE : DESK, once: true },
      });
      const applyParams = inst.setParams;
      inst.setParams = (next) => {
        applyParams(next);
        inst.replay();
      };
    }
    function relayout() {
      const c = phone.matches ? 3 : 4;
      if (c === cols) return;
      const grid = board.querySelector('.sq-grid'),
        from = cols === 3 ? PHONE : DESK,
        want = c === 3 ? PHONE : DESK,
        cells = [...grid.children],
        used = new Set();
      want.forEach((n) => {
        const k = from.findIndex((m, j) => m === n && !used.has(j));
        used.add(k);
        grid.appendChild(cells[k]);
      });
      grid.style.setProperty('--sq-cols', c);
      cols = c;
    }
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        rows = 12 / cols,
        gapK = 14 / 105;
      let w = Math.min(720, W - (phone.matches ? 32 : 64));
      const hOf = (w) => {
        const c = (w - ((cols - 1) * w * gapK) / (cols + (cols - 1) * gapK)) / cols;
        return c * 0.75 * rows + (rows - 1) * c * gapK;
      };
      while (hOf(w) > H - (phone.matches ? 32 : 64) && w > 120) w -= 4;
      let x = (W - w) / 2;

      const cell = (w - ((cols - 1) * w * gapK) / (cols + (cols - 1) * gapK)) / cols,
        gap = cell * gapK,
        y = (H - hOf(w)) / 2;
      board.style.setProperty('--sq-x', Math.round(x) + 'px');
      board.style.setProperty('--sq-y', Math.round(y) + 'px');
      board.style.setProperty('--sq-w', Math.round(w) + 'px');
      board.style.setProperty('--sq-gap', gap.toFixed(1) + 'px');
      board.style.setProperty('--fx-k', (cell / 105).toFixed(4));
    }
    build();
    place();
    function go(d) {
      if (inst.moving() === d) return true;
      const at = inst.position();
      if (d > 0 ? at >= inst.end() : at <= 0) return false;
      inst.play(d);
      return true;
    }
    function jump(d) {
      const at = inst.position();
      if (d > 0 ? at >= inst.end() : at <= 0) return false;
      inst.jump(d);
      return true;
    }
    function replay() {
      inst.replay();
    }
    const WHEEL_GAP = 250,
      DRAG_TH = 12;
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
      if (!d.drag && e.type === 'pointerup') {
        replay();
      }
    };
    board.addEventListener('pointerup', up, { signal: listeners.signal });
    board.addEventListener('pointercancel', up, { signal: listeners.signal });
    replayBtn.addEventListener(
      'click',
      () => {
        replay();
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

    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    phone.addEventListener(
      'change',
      () => {
        relayout();
        inst.jump(1);
        place();
      },
      { signal: listeners.signal },
    );

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
  global.mountSmearInGrid = mountSmearInGrid;
  if (typeof module === 'object' && module.exports) module.exports = mountSmearInGrid;
})(typeof window !== 'undefined' ? window : this);
