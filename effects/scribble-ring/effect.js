/*
 * Scribble Ring
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Hover a word, an image or a button and a hand-drawn pen loop is scrawled around it; the loop keeps "boiling" like
 * a frame-by-frame animation and scribbles itself away when you leave. Good for highlighting a key phrase, a project
 * thumbnail or a call to action on an editorial or portfolio page.
 *
 * How it moves
 * - Any element with data-scribble is a target. The ring is one SVG layer over the whole stage with up to 3 filled
 *   paths (one per loop).
 * - Base ellipse around the target: rx = width / 2 x fit + 4, ry = height / 2 x fit + height x 0.12 + 4 px, where fit
 *   is data-scribble-fit (default 1.18; the image uses 1.3). data-scribble-shape="circle" makes it a circle.
 * - Each loop sits further out: offset = S x (0.048 + loop x 0.05), with S = max(average radius, 160 px).
 * - One loop is not closed: it runs params.sweep % of a full turn, rescaled by 1 +/- 15% per draw (never below 15%).
 *   Each hover picks a start angle per loop (loops a third to two thirds of a turn apart); every draw moves it by at
 *   most +/-0.6 rad, so the gap stays roughly in one place. The radius wobbles by +/-params.jitter % through 16
 *   random knots per full turn (Catmull-Rom between them) and coils in or out by -2%..+1.5% from start to end.
 * - The stroke is a filled outline S x width / 100 thick at its widest. The pen lands blunt (35% width, full after
 *   5% of the length) and lifts off thin (down to 8% over the last 16%), quarter-sine ramps at both ends.
 * - A target inside running text never inks over the lines above and below: all loops are squeezed vertically so
 *   the outermost one stays within line-height - 0.56em (at least 0.5em) of the word's centre.
 * - Stepped timing: nothing tweens. The ring changes only on ticks of 1000 / fps ms. Draw-in shows 35%, 65%, 88%
 *   of the loop (1 - (1 - k/4)^1.5) on three ticks, then full. While held, every tick re-randomises the whole shape
 *   (the "boil"). On leave it drops at once to the next shorter frame, steps down 88%, 65%, 35% and disappears on
 *   the following tick (300 ms at 10 fps). Coming back while it lifts climbs up again from where it is.
 * - Moving to another target restarts the draw-in there at once. If the target moves or resizes, the ellipse eases
 *   after it with factor 1 - exp(-lag x dt).
 *
 * Options
 *   params.fps     4..24, default 10      ticks per second for draw-in, boil and draw-out; lower = choppier, more hand-made
 *   params.jitter  0..8, default 3.2      radius wobble in %
 *   params.sweep   30..100, default 74    arc length of one loop, % of a full turn
 *   params.width   0.4..3, default 1.4    stroke thickness in % of S
 *   params.loops   1..3, default 2        number of loops
 *   params.lag     4..40, default 12      how fast the ring follows a moving target (per second)
 *   reducedMotion  true / false / null    force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountScribbleRing(element, {params: {...}, reducedMotion: null});
 *   fx.params                 copy of current params
 *   fx.setParams({loops: 3})  change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)  freeze / resume; new hovers are ignored while paused
 *   fx.reset()                params back to defaults, ring cleared
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()              removes listeners, observers, the SVG layer
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountScribbleRing(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The content: the markup string in mountScribbleRing. Put data-scribble on anything that should get a ring;
 *   data-scribble-fit and data-scribble-shape tune the ellipse per target.
 * - The layout: the content is centred; place() scales it by min(1.45, height / 430) (never below 1) on stages 600 px
 *   and wider, and keeps it at 1 below that.
 * - Ring colour: .sc-layer path { fill } in effect.css (default ink #17181a).
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Stepped ticks with no tweening, and re-randomising on every tick. Smooth stroke-dashoffset drawing looks like a
 *   progress ring, not a pen.
 * - The open sweep with a blunt start and a thin tail; a closed even-width ellipse loses the hand-drawn look.
 * - The 160 px minimum for S, which keeps small targets from getting a tiny, thin ring.
 * - Do not let a framework re-render the stage while a ring is shown; it measures targets with getBoundingClientRect
 *   and the SVG layer is appended by the effect.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountScribbleRing on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The ring layer is aria-hidden. Targets that are not links or buttons get tabindex="0"; keyboard focus
 *   (focus-visible) circles them, blur clears. The "View project" pill is a span with role="button"; Enter and Space
 *   activate it like a real button. A visually hidden polite live region (.sc-live) announces "Circled: <label>" when
 *   a ring is drawn and "<label> pressed." on keyboard activation.
 * - Touch: tap a target to circle it, tap it again or tap elsewhere to clear.
 * - With reduced motion: no boil, no draw-in or draw-out; the full ring appears and disappears at once.
 *   Before the first real interaction the word target is shown circled.
 * - The loop sleeps when no ring is shown, and stops when the tab is hidden, the element is off screen or it is paused.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  // ---- inlined from the shared runtime: lifecycle ----
  // One requestAnimationFrame loop that runs only while something moves; pauses when the tab is hidden, the element is
  // off screen or setPaused(true); follows prefers-reduced-motion live; re-measures on resize; destroy() removes every
  // listener and observer it added.
  function scope(element, controls, options) {
    options = options || {};
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
    // Only card wrappers that supply a startup coordinator opt into deferred preparation.
    // Keep mount synchronous, but prevent font/resize/replay callbacks from drawing an incomplete renderer.
    const startup = options.card && options.card.startup;
    let preparing = !!startup,
      preparationRevision = 0,
      preparationState = preparing ? 'pending' : 'legacy';
    let resolveReady,
      rejectReady,
      preparationError = null,
      preparationStarted = false;
    const abortError = () =>
      (startup && startup.signal.aborted && startup.signal.reason) ||
      new DOMException('Effect preparation was cancelled', 'AbortError');
    const ready = preparing
      ? new Promise((resolve, reject) => {
          resolveReady = resolve;
          rejectReady = reject;
        })
      : null;
    if (ready) ready.catch(() => {});
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let preferenceReduced = preference.matches;
    const reduced = () => (reducedOverride === null ? preferenceReduced : reducedOverride);
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
      return (
        !destroyed &&
        !preparing &&
        preparationState !== 'failed' &&
        !paused &&
        visible &&
        !document.hidden &&
        !reduced()
      );
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
      if (destroyed || preparing || preparationState === 'failed') return;
      active = draw({ dt: 0, time, width, height, params, reduced: reduced() }) !== false;
    }
    function measure() {
      if (destroyed) return;
      const nextWidth = Math.max(1, element.clientWidth),
        nextHeight = Math.max(1, element.clientHeight);
      if (preparing) {
        if (width !== nextWidth || height !== nextHeight) preparationRevision++;
        width = nextWidth;
        height = nextHeight;
        return;
      }
      width = nextWidth;
      height = nextHeight;
      emit('resize', { width, height });
      paint();
      if (active) wake();
    }
    function syncMotion() {
      stop();
      element.dataset.reduced = String(reduced());
      if (preparing) {
        preparationRevision++;
        return;
      }
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
      get preparing() {
        return preparing;
      },
      invalidatePreparation() {
        if (preparing) preparationRevision++;
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
      runPreparationPhase(fn, label) {
        if (!startup) return Promise.resolve().then(fn);
        if (destroyed || preparationError || startup.signal.aborted)
          return Promise.reject(preparationError || abortError());
        return startup.runPhase(() => {
          if (destroyed || preparationError || startup.signal.aborted) throw preparationError || abortError();
          return fn();
        }, label);
      },
      prepare(task) {
        if (!startup || preparationStarted) return ready;
        preparationStarted = true;
        // Params/replay/resize may change while a GPU compilation or font is pending. Re-run only the
        // module's idempotent preparation work for the newest inputs, with its renderer resources reused.
        (async () => {
          while (preparing && !destroyed && !preparationError) {
            measure();
            const revision = preparationRevision;
            await task((fn, label) => api.runPreparationPhase(fn, label));
            const completed = await api.runPreparationPhase(() => {
              measure();
              if (revision !== preparationRevision) return false;
              time = 0;
              last = 0;
              preparing = false;
              try {
                paint();
              } catch (error) {
                preparing = true;
                throw error;
              }
              preparationState = 'ready';
              element.dataset.preparation = 'ready';
              resolveReady(api);
              if (active) wake();
              return true;
            }, 'first-frame');
            if (completed) break;
          }
        })().catch((error) => api.failPreparation(error));
        return ready;
      },
      failPreparation(error) {
        if (!startup || preparationState === 'ready' || preparationState === 'failed') return;
        preparationError =
          error instanceof Error || (error && error.name)
            ? error
            : new Error(String(error || 'Effect preparation failed'));
        preparationState = 'failed';
        preparing = false;
        stop();
        element.dataset.preparation = 'failed';
        rejectReady(preparationError);
        api.destroy();
      },
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
        if (preparing) {
          preparationRevision++;
          return;
        }
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
        if (preparing) {
          preparationRevision++;
          return;
        }
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
        if (preparing) api.failPreparation(abortError());
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
          preparing,
          preparation: preparationState,
          listeners: cleanup.length,
          params: Object.assign({}, params),
        };
      },
    };
    if (ready) {
      api.ready = ready;
      element.dataset.preparation = 'pending';
      listen(startup.signal, 'abort', () => api.destroy());
      if (startup.signal.aborted) Promise.resolve().then(() => api.destroy());
    }
    listen(preference, 'change', (event) => {
      preferenceReduced = event.matches;
      syncMotion();
    });
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

  // ---- inlined from the shared card parts: a white card with a centred mark (used when WebGL is unavailable) ----
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
  function cardMedia(options) {
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
    { key: 'fps', type: 'range', default: 10, min: 4, max: 24, step: 1 },
    { key: 'jitter', type: 'range', default: 3.2, min: 0, max: 8, step: 0.2 },
    { key: 'sweep', type: 'range', default: 74, min: 30, max: 100, step: 1 },
    { key: 'width', type: 'range', default: 1.4, min: 0.4, max: 3, step: 0.1 },
    { key: 'loops', type: 'range', default: 2, min: 1, max: 3, step: 1 },
    { key: 'lag', type: 'range', default: 12, min: 4, max: 40, step: 1 },
  ];

  // ---- the effect ----
  const SVG_NS = 'http://www.w3.org/2000/svg',
    TURN = Math.PI * 2;
  const LOOP = {
    margin: 0.048,
    spacing: 0.05,
    knots: 16,
    spread: 0.3,
    shortest: 0.15,
    drift: 0.6,
    coilLo: -0.02,
    coilHi: 0.015,
    segsPerTurn: 96,
    unitFloor: 160,
    most: 3,
  };
  const NIB = { land: 0.05, landWidth: 0.35, lift: 0.16, liftWidth: 0.08 };
  const DRAW_FRAMES = [1, 2, 3].map((k) => 1 - Math.pow(1 - k / 4, 1.5));
  function measure(host, el) {
    const hb = host.getBoundingClientRect(),
      b = el.getBoundingClientRect();
    const f = { x: b.left - hb.left + b.width / 2, y: b.top - hb.top + b.height / 2, rx: 0, ry: 0, cap: lineCap(el) };
    if (el.dataset.scribbleShape === 'circle') {
      f.rx = f.ry = Math.max(b.width, b.height) / 2;
    } else {
      const fit = +el.dataset.scribbleFit || 1.18;
      f.rx = (b.width * fit) / 2 + 4;
      f.ry = (b.height * fit) / 2 + b.height * 0.12 + 4;
    }
    return f;
  }
  function lineCap(el) {
    const parent = el.parentElement;
    if (!parent || !/^inline/.test(getComputedStyle(el).display)) return 0;
    const prose = [...parent.childNodes].some((n) => n !== el && n.nodeType === 3 && n.textContent.trim() !== '');
    if (!prose) return 0;
    const ps = getComputedStyle(parent),
      em = parseFloat(ps.fontSize) || 16,
      lh = parseFloat(ps.lineHeight) || em * 1.2;
    return Math.max(lh - em * 0.56, em * 0.5);
  }
  const unitOf = (f) => Math.max((f.rx + f.ry) / 2, LOOP.unitFloor);
  function pickStarts() {
    const a = [Math.random() * TURN];
    for (let i = 1; i < LOOP.most; i++) a.push(a[i - 1] + TURN * (1 / 3 + Math.random() / 3));
    return a;
  }
  function sketch(p, starts) {
    const count = Math.round(p.loops),
      wob = p.jitter / 100,
      out = [];
    for (let i = 0; i < count; i++) {
      const arc = Math.min(1, Math.max(LOOP.shortest, (p.sweep / 100) * (1 + (Math.random() - 0.5) * LOOP.spread)));
      const knots = new Float32Array(LOOP.knots + 4);
      for (let j = 0; j < knots.length; j++) knots[j] = 1 + (Math.random() * 2 - 1) * wob;
      out.push({
        start: starts[i] + (Math.random() * 2 - 1) * LOOP.drift,
        arc,
        knots,
        coil: LOOP.coilLo + Math.random() * (LOOP.coilHi - LOOP.coilLo),
      });
    }
    return out;
  }
  function spline(a, b, c, d, q) {
    return b + 0.5 * q * (c - a + q * (2 * a - 5 * b + 4 * c - d + q * (3 * (b - c) + d - a)));
  }
  function nib(t) {
    const land = NIB.landWidth + (1 - NIB.landWidth) * Math.sin((Math.min(1, t / NIB.land) * Math.PI) / 2);
    const lift = NIB.liftWidth + (1 - NIB.liftWidth) * Math.sin((Math.min(1, (1 - t) / NIB.lift) * Math.PI) / 2);
    return Math.min(land, lift);
  }
  function ribbon(f, i, loop, amount, p) {
    const S = unitOf(f),
      half = (S * p.width) / 200,
      gap = S * (LOOP.margin + i * LOOP.spacing),
      turns = loop.arc * amount;
    let squash = 1;
    if (f.cap) {
      const reach =
        (f.ry + S * (LOOP.margin + (Math.round(p.loops) - 1) * LOOP.spacing)) *
          (1 + (p.jitter / 100) * 1.15 + LOOP.coilHi) +
        half;
      if (reach > f.cap) squash = Math.max(0, f.cap - half) / (reach - half);
    }
    const ax = f.rx + gap * squash,
      ay = (f.ry + gap) * squash,
      segs = Math.max(12, Math.ceil(LOOP.segsPerTurn * turns)),
      K = loop.knots;
    const edgeA = [],
      edgeB = [];
    for (let j = 0; j <= segs; j++) {
      const t = j / segs,
        ang = loop.start + t * turns * TURN,
        u = t * turns * LOOP.knots,
        b = Math.min(Math.floor(u), LOOP.knots),
        q = u - b;
      const r = spline(K[b], K[b + 1], K[b + 2], K[b + 3], q) * (1 + loop.coil * t),
        w = half * nib(t);
      const cx = Math.cos(ang),
        sy = Math.sin(ang),
        px = f.x + cx * ax * r,
        py = f.y + sy * ay * r;
      edgeA.push((px + cx * w).toFixed(2) + ',' + (py + sy * w).toFixed(2));
      edgeB.push((px - cx * w).toFixed(2) + ',' + (py - sy * w).toFixed(2));
    }
    return 'M' + edgeA.join(' ') + ' L' + edgeB.reverse().join(' ') + 'Z';
  }
  function makePen(host, api) {
    const layer = document.createElementNS(SVG_NS, 'svg');
    layer.setAttribute('class', 'sc-layer');
    layer.setAttribute('aria-hidden', 'true');
    const strokes = [];
    for (let i = 0; i < LOOP.most; i++) strokes.push(layer.appendChild(document.createElementNS(SVG_NS, 'path')));
    host.appendChild(layer);
    api.cleanup(() => layer.remove());
    const pen = {
      phase: 'idle',
      target: null,
      want: null,
      frame: null,
      starts: null,
      loops: [],
      amount: 0,
      step: 0,
      queue: [],
      beatAt: 0,
    };
    function paint() {
      const p = api.params,
        on = pen.phase !== 'idle' && pen.target && pen.frame;
      strokes.forEach((el, i) => {
        if (on && i < pen.loops.length) el.setAttribute('d', ribbon(pen.frame, i, pen.loops[i], pen.amount, p));
        else el.removeAttribute('d');
      });
    }
    function redraw(amount) {
      pen.amount = amount;
      pen.loops = sketch(api.params, pen.starts);
      paint();
    }
    function track(dt, snap) {
      if (!pen.target) return false;
      const f = measure(host, pen.target);
      if (!pen.frame || snap) {
        pen.frame = f;
        return true;
      }
      const k = 1 - Math.exp(-api.params.lag * dt);
      let moved = false;
      pen.frame.cap = f.cap;
      for (const key of ['x', 'y', 'rx', 'ry']) {
        const d = (f[key] - pen.frame[key]) * k;
        if (Math.abs(d) > 0.01) moved = true;
        pen.frame[key] += d;
      }
      return moved;
    }
    function clear() {
      pen.phase = 'idle';
      pen.target = null;
      pen.queue = [];
      paint();
    }
    function climbFrom(now) {
      pen.step = DRAW_FRAMES.findIndex((v) => v > pen.amount + 1e-6);
      pen.beatAt = now;
      if (pen.step < 0) {
        pen.phase = 'boiling';
        redraw(1);
      } else {
        pen.phase = 'drawing';
        redraw(DRAW_FRAMES[pen.step]);
      }
    }
    function begin(el, now) {
      pen.target = el;
      pen.starts = pickStarts();
      pen.amount = 0;
      track(0, true);
      climbFrom(now);
    }
    function advance(now, dt, reduced) {
      const want = pen.want;
      if (reduced) {
        if (!want) {
          if (pen.phase !== 'idle') clear();
          return false;
        }
        if (pen.target !== want || pen.phase !== 'boiling') {
          pen.target = want;
          pen.starts = pickStarts();
          pen.phase = 'boiling';
          track(0, true);
          redraw(1);
        } else if (track(0, true)) paint();
        return false;
      }
      const beat = 1000 / api.params.fps;
      if (!want) {
        if (pen.phase === 'idle') return false;
        if (pen.phase !== 'lifting') {
          pen.phase = 'lifting';
          pen.beatAt = now;
          pen.queue = DRAW_FRAMES.filter((v) => v < pen.amount - 1e-6).reverse();
          if (pen.queue.length) redraw(pen.queue.shift());
          return true;
        }
        if (track(dt)) paint();
        if (now - pen.beatAt < beat) return true;
        pen.beatAt = now;
        if (!pen.queue.length) {
          clear();
          return false;
        }
        redraw(pen.queue.shift());
        return true;
      }
      if (pen.phase === 'idle' || pen.target !== want) {
        begin(want, now);
        return true;
      }
      if (pen.phase === 'lifting') {
        climbFrom(now);
        return true;
      }
      if (track(dt)) paint();
      if (now - pen.beatAt < beat) return true;
      pen.beatAt = now;
      if (pen.phase === 'drawing' && ++pen.step < DRAW_FRAMES.length) redraw(DRAW_FRAMES[pen.step]);
      else {
        pen.phase = 'boiling';
        redraw(1);
      }
      return true;
    }
    function resketch() {
      if (pen.phase !== 'idle' && pen.target) {
        pen.loops = sketch(api.params, pen.starts);
        paint();
      }
    }
    return { pen, advance, clear, resketch };
  }
  const PHASE_NAME = { idle: 'hidden', drawing: 'in', boiling: 'on', lifting: 'out' };
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('sc-host');
    if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
    const card = options.card || null;
    element.innerHTML =
      card.markup || '<div class="sc-card"><a href="#" class="sc-pill" data-scribble>View project</a></div>';
    if (!element.querySelector('.sc-live'))
      element.insertAdjacentHTML('beforeend', '<p class="sc-live" aria-live="polite"></p>');
    const targets = [...element.querySelectorAll('[data-scribble]')],
      live = element.querySelector('.sc-live');
    targets.forEach((t) => {
      if (!t.matches('a[href],button')) t.tabIndex = 0;
    });
    const ink = makePen(element, api);
    let hovered = null,
      pinned = null,
      lastPointer = '';
    const wanted = () => hovered || pinned || null;
    const labelOf = (t) => (t.getAttribute('aria-label') || t.textContent || '').trim();
    function update() {
      const w = wanted();
      if (w === ink.pen.want) return;
      ink.pen.want = w;
      if (live && w) live.textContent = 'Circled: ' + labelOf(w);
      if (api.reduced) api.paint();
      else api.wake();
    }
    targets.forEach((t) => {
      api.listen(t, 'pointerenter', (e) => {
        if (e.pointerType !== 'touch' && !api.paused) {
          hovered = t;
          update();
        }
      });
      api.listen(t, 'pointerleave', (e) => {
        if (e.pointerType !== 'touch' && hovered === t) {
          hovered = null;
          update();
        }
      });
      api.listen(t, 'focus', () => {
        if (t.matches(':focus-visible')) {
          hovered = t;
          update();
        }
      });
      api.listen(t, 'blur', () => {
        if (hovered === t) {
          hovered = null;
          update();
        }
      });
      api.listen(t, 'click', (e) => {
        if (t.tagName === 'A') e.preventDefault();
        if (api.paused) return;
        if (e.detail && lastPointer === 'touch') {
          pinned = pinned === t ? null : t;
          update();
        } else if (!e.detail && live) live.textContent = labelOf(t) + ' pressed.';
      });
      if (t.getAttribute('role') === 'button' && !t.matches('button'))
        api.listen(t, 'keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            t.click();
          }
        });
    });
    api.listen(
      element,
      'pointerdown',
      (e) => {
        lastPointer = e.pointerType;
        if (e.pointerType === 'touch' && pinned && !targets.some((t) => t.contains(e.target))) {
          pinned = null;
          update();
        }
      },
      true,
    );
    {
      targets.forEach((t) =>
        api.listen(t, 'focus', () => {
          if (t.matches(':focus-visible')) {
          }
        }),
      );
      api.restore = () => {
        pinned = null;
        hovered = null;
        update();
      };
    }
    api.on('replay', () => {
      pinned = null;
      hovered = null;
      update();
      ink.clear();
    });
    api.on('params', () => ink.resketch());
    api.frame(({ dt, time, reduced }) => {
      let more = false;
      ink.pen.want = wanted();
      return ink.advance(time * 1000, dt, reduced) || more;
    });
    const status = api.status;
    api.status = () => ({
      ...(status ? status() : {}),
      state: PHASE_NAME[ink.pen.phase],
      progress: ink.pen.amount,
      target: ink.pen.target ? targets.indexOf(ink.pen.target) : -1,
      fps: api.params.fps,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountScribbleRing(element, options) {
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
    element.classList.add('scribble-ring');
    element.innerHTML = '<div class="fx-board" data-sc></div>';
    const stage = element,
      board = stage.querySelector('[data-sc]');
    const media = cardMedia({ tone: 1, glyph: 0, accent: true }).replace(
      'class="ck-media',
      'data-scribble data-scribble-fit="1.3" class="ck-media',
    );
    const markup =
      '<div class="sc-ep"><p class="sc-fx-line">Circle the <span class="sc-fx-word" data-scribble>one idea</span><br>worth a second look.</p>' +
      '<div class="sc-fx-row">' +
      media +
      '<span class="ck-pill ck-solid" data-scribble role="button">View project</span></div></div>';
    const place = () => {
      const w = stage.clientWidth,
        mobile = w < 600;
      board.style.setProperty('--sc-left', '0px');
      board.style.setProperty(
        '--fx-k',
        (mobile ? 1 : Math.min(1.45, Math.max(1, stage.clientHeight / 430))).toFixed(4),
      );
    };
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(board, { params: options.params, card: { markup, loop: 8, interactive: true } });

    inst.on('destroy', () => {
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
  global.mountScribbleRing = mountScribbleRing;
  if (typeof module === 'object' && module.exports) module.exports = mountScribbleRing;
})(typeof window !== 'undefined' ? window : this);
