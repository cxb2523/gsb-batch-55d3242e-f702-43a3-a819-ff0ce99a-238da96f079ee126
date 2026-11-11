/*
 * Noise Dissolve Reveal
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A light title sheet sits over a dark panel. Scroll and the sheet is eaten away from the bottom by a ragged, slowly
 * crawling edge until the panel underneath is fully open; scroll back and it closes again. Sweep the pointer up across
 * the edge to bite holes into it, down to drip the sheet back. Good for a film or project cover, a hero over a video,
 * or a chapter opener.
 *
 * How it moves
 * - No WebGL, no canvas. The top layer (.dv-over) gets clip-path: path(evenodd, ...) every frame: the outer rectangle
 *   plus closed contour loops. Everything inside a loop is cut out and shows the layer below (.dv-under).
 * - Noise: two periodic 256 x 256 gradient-noise tiles (three octaves, fixed seed) built once per page and shared by
 *   every instance. Each grid node (every 15 px x k, at least 4 px; k = box width / 1440; 3 extra cells around the
 *   edge) keeps a fixed, domain-warped spot in the first tile and a turning phase from the second. One noise unit is
 *   scale px.
 * - Field: s = (y - front(x)) + amp(x) x N + bite; nodes with s > 0 are cut. N is the tile value x 0.9, soft-clipped
 *   with x / sqrt(1 + x^2), and its negative half is scaled by 0.45, so tongues and pin holes run ahead of the edge more
 *   than the sheet drips back. amp = wander x height x (0.5 + 0.5 c), c a Gaussian crest (width 0.3) that is 1 in the
 *   middle; the front line is also 0.12 x height higher in the middle. Only rows the noise can reach are sampled.
 * - Edge: crack following on the grid (walk the links between cut and kept nodes, cut side 8-connected); each vertex is
 *   where s crosses 0 on its link. Loops smaller than a 34 px (x k) circle are dropped, the rest are written as closed
 *   Catmull-Rom cubics with coordinates snapped to 0.1 px.
 * - Crawl: a phase turns at lifeSpeed cycles per second; every node's lookup point circles its spot (radius 0.4 noise
 *   units) starting at its own phase, so neighbouring regions churn out of step. It never stops while the effect is
 *   visible.
 * - Progress: wheel adds deltaY / (track x box height) to a target in 0..1 (line mode x 16, page mode x box height).
 *   Touch drag counts 1.5x; mouse drag does nothing. The shown progress chases the target by 10 % per 60 fps frame
 *   (frame-rate corrected). The sheet is fully gone at 82 % progress.
 * - Front: at progress 0 the middle of the ridge peeks 3 % of the height up from the bottom; the front moves linearly
 *   until 0.2 x height past the top, so the last bits clear briskly. On mount an intro grows it in from nothing over
 *   1.5 s (quintic ease).
 * - Speed: progress speed in box heights per second (divided by 2.4, clamped to +-1, smoothed with a 0.12 s time
 *   constant) pushes the edge ahead by up to 0.6 x wander x height and makes the crawl up to 3x faster. Fast scrolling
 *   looks rougher.
 * - Pointer bites (mouse / pen on hover-capable devices only): strokes stamp ragged domes into a bite field every 0.3 x
 *   cursorDrop px along the stroke. Moving up bites in, moving down drips the sheet back, moving sideways nibbles a
 *   little; strength = 2.4 x wander x height x cursorBite x speed factor (full at 800 px/s x k) x proximity (full inside
 *   the band the edge can reach, fading out over 110 px x k; always on over an open bite). Each frame the field diffuses
 *   (a bite widens) and decays with a 0.6 s time constant, so a bite opens, spreads and closes in about a second. The
 *   last 6 coalesced pointer events are used, timed by their own timestamps, so fast strokes stay continuous.
 * - Wheel handoff: at either end a wheel gesture that moved the reveal keeps being swallowed until the wheel has been
 *   quiet for 250 ms; after that the page scrolls normally.
 * - Keys (the box is focusable): ArrowDown / ArrowUp +-0.1, PageDown / PageUp +-0.3, End / Home fully open / closed.
 * - Layout: the box is inset 40 px from every edge (20 under 600 px wide), so it is centred.
 *
 * Options
 *   params.wander      0.04..0.25, default 0.13  edge amplitude as a fraction of box height
 *   params.lifeSpeed   0..0.5, default 0.15      crawl speed in cycles per second; 0 freezes the crawl
 *   params.scale       120..400, default 230     width of one bump in px at a 1440 px wide box
 *   params.cursorDrop  30..180, default 90       bite blob radius in px at 1440 px
 *   params.cursorBite  0..1, default 0.5         bite depth; 0 disables bites
 *   params.track       0.8..3, default 1.5       wheel distance for a full reveal, in box heights
 *   reducedMotion      true / false / null       force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountNoiseDissolveReveal(element, {params: {...}, reducedMotion: null});
 *   fx.params                    copy of current params
 *   fx.setParams({wander: 0.2})  change params live (wander and scale rebuild the grid)
 *   fx.setPaused(true|false)     freeze / resume; input is ignored while paused
 *   fx.reset()                   params back to defaults, sheet closes over 0.5 s
 *                                (cubic-bezier(0.22, 1, 0.36, 1))
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                 removes listeners, observers and the clip-path
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountNoiseDissolveReveal(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The two layers: the under and over callbacks in mountNoiseDissolveReveal return their HTML. Put an image or a video
 *   in under, your own title in over. The clip is written to the over layer only.
 * - Colours, radius and type via the CSS variables and rules in effect.css.
 * - Box height, params within their ranges.
 * - To drive it from page scroll instead of the wheel, set the target from your scroll progress (for example a
 *   ScrollTrigger scrub) instead of the wheel handler.
 *
 * Do not change (the feel breaks)
 * - The soft clip, the 0.45 factor on negative noise, the crest and the 0.5..1 amplitude profile; they make it a ridge
 *   rather than flat noise.
 * - The end line past the top and the 82 % finish point; the loop only sleeps once every node is cut for good.
 * - The 10 % per frame chase and the speed push; with direct mapping the edge jitters on trackpads.
 * - clip-path: path(evenodd, ...) on the over layer. Masks or canvas redraws are slower at this resolution.
 * - Keep touch-action: none on the box. Do not let a framework re-render the layers while the effect runs.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the rAF loop and listeners leak. In React StrictMode the mount runs twice; destroy
 *   in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountNoiseDissolveReveal on an embed div with a fixed height.
 * - clip-path: path() needs a current browser (Safari 13.1+, Chrome 88+, Firefox 97+).
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The box is a focusable role="group" with a focus ring and keyboard control. The under layer is aria-hidden; the over
 *   layer's text stays in the accessibility tree even when cut away, so keep real content readable there or label it.
 * - With reduced motion: no intro, no crawl, no speed push, no pointer bites, . The edge is a still noisy line
 *   and progress jumps straight to the target; wheel, touch and keys still open and close it.
 * - While any of the edge can show, the loop runs every frame (the edge always crawls; that is part of the look). It
 *   stops once nothing can change any more: progress has settled, no bite is alive and either the
 *   sheet is fully open (every grid node stays cut whatever the crawl does) or crawl speed is 0. Wheel, touch, keys,
 *   pointer bites, reset and setParams wake it. It also stops when the tab is hidden, the box is off screen or it is
 *   paused.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const runtimeClamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => {
    t = runtimeClamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  function mark(index, className) {
    const names = ['ring', 'cross', 'square', 'x'];
    const name = names[Math.abs(Number(index) || 0) % names.length];
    const symbol = '';
    const inner =
      symbol.match(/<symbol[^>]*>([\s\S]*)<\/symbol>/)?.[1] ||
      '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="8"/>';
    const css = String(className || '').replace(/[^a-z0-9 _-]/gi, '');
    return '<svg class="' + css + '" viewBox="0 0 100 100" aria-hidden="true">' + inner + '</svg>';
  }
  const R = { mark, smooth, mix };

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
            value = Number.isFinite(+value) ? runtimeClamp(+value, control.min, control.max) : control.default;
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
  const CONTROLS = [
    { key: 'wander', type: 'range', default: 0.13, min: 0.04, max: 0.25, step: 0.01 },
    { key: 'lifeSpeed', type: 'range', default: 0.15, min: 0, max: 0.5, step: 0.01 },
    { key: 'scale', type: 'range', default: 230, min: 120, max: 400, step: 10 },
    { key: 'cursorDrop', type: 'range', default: 90, min: 30, max: 180, step: 5 },
    { key: 'cursorBite', type: 'range', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'track', type: 'range', default: 1.5, min: 0.8, max: 3, step: 0.1 },
  ];

  // ---- the effect ----
  const REF_W = 1440,
    NODE = 15,
    RIM = 3,
    TILE = 256,
    TMASK = TILE - 1,
    TEX = 16,
    TAU = Math.PI * 2;
  const PEEK = 0.03,
    CREST = 0.12,
    CREST_W = 0.3,
    SIDE = 0.5,
    SINK = 0.45,
    CONTRAST = 0.9,
    WARP = 0.35,
    ORBIT = 0.4,
    MIN_SPOT = 34;
  const SURGE = 0.6,
    AGITATE = 2,
    SPEED_REF = 2.4,
    SPEED_TAU = 0.12,
    INTRO = 1.5,
    FINISH = 0.82,
    OVERSHOOT = 0.2;
  const BITE_DEPTH = 2.4,
    BITE_REACH = 110,
    BITE_SPEED = 800,
    BITE_STEP = 0.3,
    BITE_RAG = 0.5,
    BITE_GROW = 0.45,
    BITE_FADE = 0.6,
    BITE_EPS = 0.3,
    BITE_INK = 0.07,
    BITE_QUEUE = 96;
  const FOLLOW = 0.1,
    FRAME = 1000 / 60,
    RESTORE = 0.5,
    WHEEL_GAP = 250;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fade5 = (v) => {
    const t = clamp(v, 0, 1),
      t3 = t * t * t;
    return t3 * (10 + t * (6 * t - 15));
  };
  function xorshift(seed) {
    let s = seed | 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }
  function gradientTile(seed) {
    const rand = xorshift(seed),
      out = new Float32Array(TILE * TILE);
    for (const [L, weight] of [
      [8, 0.66],
      [16, 0.24],
      [32, 0.1],
    ]) {
      const gx = new Float32Array(L * L),
        gy = new Float32Array(L * L);
      for (let i = 0; i < L * L; i++) {
        const a = rand() * TAU;
        gx[i] = Math.cos(a);
        gy[i] = Math.sin(a);
      }
      const per = L / TILE;
      for (let ty = 0; ty < TILE; ty++) {
        const fy = ty * per,
          cy = Math.floor(fy),
          ry = fy - cy,
          top = (cy % L) * L,
          bot = ((cy + 1) % L) * L,
          wy = fade5(ry);
        for (let tx = 0; tx < TILE; tx++) {
          const fx = tx * per,
            cx = Math.floor(fx),
            rx = fx - cx,
            l = cx % L,
            r = (cx + 1) % L,
            wx = fade5(rx);
          const g0 = top + l,
            g1 = top + r,
            g2 = bot + l,
            g3 = bot + r;
          const n0 = gx[g0] * rx + gy[g0] * ry,
            n1 = gx[g1] * (rx - 1) + gy[g1] * ry,
            n2 = gx[g2] * rx + gy[g2] * (ry - 1),
            n3 = gx[g3] * (rx - 1) + gy[g3] * (ry - 1);
          const up = n0 + (n1 - n0) * wx,
            dn = n2 + (n3 - n2) * wx;
          out[ty * TILE + tx] += weight * (up + (dn - up) * wy);
        }
      }
    }
    let sq = 0;
    for (let i = 0; i < out.length; i++) sq += out[i] * out[i];
    const norm = 1 / Math.sqrt(sq / out.length);
    for (let i = 0; i < out.length; i++) out[i] *= norm;
    return out;
  }
  let tiles = null;
  function getTiles() {
    if (!tiles) tiles = { a: gradientTile(0x2f6b1d), b: gradientTile(0x51c3a9) };
    return tiles;
  }
  function tap(T, x, y) {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy,
      c0 = ix & TMASK,
      c1 = (ix + 1) & TMASK,
      r0 = (iy & TMASK) * TILE,
      r1 = ((iy + 1) & TMASK) * TILE;
    const a = T[r0 + c0],
      b = T[r0 + c1],
      c = T[r1 + c0],
      d = T[r1 + c1],
      u = a + (b - a) * fx;
    return u + (c + (d - c) * fx - u) * fy;
  }
  const tenth = (v) => Math.round(v * 10) / 10;
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options),
      card = options.card || null;
    element.classList.add('dv-stage');
    const hoverDevice = typeof matchMedia !== 'function' || matchMedia('(hover: hover) and (pointer: fine)').matches;
    element.innerHTML =
      '<div class="dv-under" aria-hidden="true">' +
      (card.under ? card.under() : '') +
      '</div><div class="dv-over">' +
      (card.over ? card.over() : '') +
      '</div>';
    const frame = element,
      over = frame.querySelector('.dv-over');
    frame.classList.add('dv-frame');
    const T = getTiles();
    let W = 1,
      H = 1,
      k = 1,
      M = null,
      shapeKey = '';
    let P = 0,
      Pt = 0,
      prevShown = 0,
      vel = 0,
      phase = 0,
      U = !card.intro ? 1 : 0,
      cleared = false;
    function build() {
      W = Math.max(1, Math.round(frame.clientWidth));
      H = Math.max(1, Math.round(frame.clientHeight));
      k = card.kpx ? card.kpx(W, H) : W / REF_W;
      const p = api.params,
        cell = Math.max(4, NODE * k),
        cols = Math.ceil(W / cell) + 2 * RIM + 1,
        rows = Math.ceil(H / cell) + 2 * RIM + 1,
        ox = -RIM * cell,
        oy = -RIM * cell,
        count = cols * rows;
      const perPx = TEX / (p.scale * k),
        spotX = new Float32Array(count),
        spotY = new Float32Array(count),
        turnC = new Float32Array(count),
        turnS = new Float32Array(count);
      const hump = new Float32Array(cols),
        amp = new Float32Array(cols),
        ampMid = p.wander * H;
      for (let i = 0; i < cols; i++) {
        const u = (ox + i * cell) / W - 0.5;
        hump[i] = Math.exp(-(u * u) / (CREST_W * CREST_W));
        amp[i] = ampMid * (SIDE + (1 - SIDE) * hump[i]);
      }
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const q = j * cols + i,
            tx = (ox + i * cell) * perPx,
            ty = (oy + j * cell) * perPx;
          const wx = tap(T.b, tx * 0.5 + 37.3, ty * 0.5 + 11.9),
            wy = tap(T.b, tx * 0.5 + 141.7, ty * 0.5 + 83.1);
          spotX[q] = tx + wx * WARP * TEX;
          spotY[q] = ty + wy * WARP * TEX;
          const turn = tap(T.b, tx * 0.31 + 203.5, ty * 0.31 + 59.2) * Math.PI * 1.4;
          turnC[q] = Math.cos(turn);
          turnS[q] = Math.sin(turn);
        }
      const floorRow = Math.min(rows - 2, Math.ceil((H + cell - oy) / cell));
      const topY = oy + cell,
        end = topY - ampMid * SINK - 2 * cell - OVERSHOOT * H;
      M = {
        cols,
        rows,
        cell,
        ox,
        oy,
        count,
        spotX,
        spotY,
        turnC,
        turnS,
        hump,
        amp,
        ampMid,
        floorRow,
        end,
        field: new Float32Array(count),
        bite: new Float32Array(count),
        front: new Float32Array(cols),
        bandLo: new Int32Array(cols),
        bandHi: new Int32Array(cols),
        seen: new Uint8Array(count),
        line: new Float32Array(cols > rows ? cols : rows),
        vx: new Float32Array(4096),
        vy: new Float32Array(4096),
      };
      shapeKey = p.wander + '|' + p.scale;
      inks.length = 0;
      biteLive = false;
      biteBox = null;
      biteUp = biteDn = 0;
    }
    let biteLive = false,
      biteBox = null,
      biteCap = 0,
      biteUp = 0,
      biteDn = 0,
      ptr = null;
    const inks = [];
    const stampRand = xorshift(0x1a2b3c);
    function nodeOf(x, y) {
      const i = Math.round((x - M.ox) / M.cell),
        j = Math.round((y - M.oy) / M.cell);
      return i < 1 || i > M.cols - 2 || j < 1 || j > M.rows - 2 ? -1 : j * M.cols + i;
    }
    function stamp(cx, cy, rad, amount) {
      if (inks.length >= BITE_QUEUE) {
        const o = inks.shift();
        deposit(o, 1 - o.done);
      }
      inks.push({ cx, cy, rad, amount, sx: stampRand() * TILE, sy: stampRand() * TILE, age: 0, done: 0 });
      biteLive = true;
    }
    function deposit(o, u) {
      if (u <= 0) return;
      const cx = o.cx,
        cy = o.cy,
        rad = o.rad,
        amount = o.amount * u;
      const { cols, rows, cell, ox, oy, bite } = M,
        up = biteCap * 2,
        down = biteCap,
        i0 = Math.max(1, Math.ceil((cx - rad - ox) / cell)),
        i1 = Math.min(cols - 2, Math.floor((cx + rad - ox) / cell)),
        j0 = Math.max(1, Math.ceil((cy - rad - oy) / cell)),
        j1 = Math.min(rows - 2, Math.floor((cy + rad - oy) / cell));
      if (i1 < i0 || j1 < j0) return;
      const fine = (TEX * 2.6) / rad,
        sx = o.sx,
        sy = o.sy,
        inv = 1 / (rad * rad);
      for (let j = j0; j <= j1; j++) {
        const dy = oy + j * cell - cy,
          row = j * cols;
        for (let i = i0; i <= i1; i++) {
          const dx = ox + i * cell - cx,
            d2 = (dx * dx + dy * dy) * inv;
          if (d2 >= 1) continue;
          const dome = 1 - d2 * d2,
            rag = 1 + BITE_RAG * tap(T.a, dx * fine + sx, dy * fine + sy) * (0.35 + 0.65 * d2),
            add = amount * dome * (rag > 0 ? rag : 0),
            q = row + i,
            b = bite[q];
          const v = b + add * (add > 0 ? Math.max(0, 1 - b / up) : Math.max(0, 1 + b / down));
          bite[q] = v;
          if (v > biteUp) biteUp = v;
          else if (-v > biteDn) biteDn = -v;
        }
      }
      if (biteBox) {
        if (i0 < biteBox[0]) biteBox[0] = i0;
        if (i1 > biteBox[1]) biteBox[1] = i1;
        if (j0 < biteBox[2]) biteBox[2] = j0;
        if (j1 > biteBox[3]) biteBox[3] = j1;
      } else biteBox = [i0, i1, j0, j1];
      biteLive = true;
    }
    function ink(dt) {
      if (!inks.length || dt <= 0) return;
      let keep = 0;
      for (const o of inks) {
        o.age += dt;
        const u = clamp(o.age / BITE_INK, 0, 1),
          e = u * u * (3 - 2 * u);
        deposit(o, e - o.done);
        o.done = e;
        if (u < 1) inks[keep++] = o;
      }
      inks.length = keep;
    }
    function reachAt(x, y, rad) {
      const i = clamp(Math.round((x - M.ox) / M.cell), 0, M.cols - 1),
        f = M.front[i],
        a = M.amp[i] * fade5(U),
        top = f - a - rad * 0.5,
        bot = f + a * SINK + rad * 0.5,
        off = y < top ? top - y : y > bot ? y - bot : 0,
        near = 1 - clamp(off / (BITE_REACH * k), 0, 1),
        q = nodeOf(x, y),
        open = q < 0 ? 0 : clamp(Math.abs(M.bite[q]) / (biteCap * 0.2), 0, 1);
      return near > open ? near : open;
    }
    function track(x, y, now) {
      if (!M || api.reduced) return false;
      if (!ptr || now - ptr.t > 0.12 || now < ptr.t) {
        ptr = { x, y, t: now, vx: 0, vy: 0, left: 0 };
        return false;
      }
      const span = Math.max(0.004, now - ptr.t),
        mix = ptr.vx || ptr.vy ? 0.55 : 1;
      ptr.vx += ((x - ptr.x) / span - ptr.vx) * mix;
      ptr.vy += ((y - ptr.y) / span - ptr.vy) * mix;
      const px = ptr.x,
        py = ptr.y;
      ptr.x = x;
      ptr.y = y;
      ptr.t = now;
      const p = api.params,
        rad = p.cursorDrop * k;
      if (p.cursorBite <= 0 || x < -rad || x > W + rad) return false;
      const speed = BITE_SPEED * k,
        drive = clamp(-ptr.vy / speed, -1, 1) + 0.2 * clamp(Math.abs(ptr.vx) / speed, 0, 1) * (ptr.vy <= 0 ? 1 : 0);
      biteCap = BITE_DEPTH * M.ampMid;
      const step = rad * BITE_STEP,
        ex = x - px,
        ey = y - py,
        len = Math.hypot(ex, ey);
      let hit = false,
        at = ptr.left;
      for (; at <= len; at += step) {
        const u = len > 0 ? at / len : 0,
          sx = px + ex * u,
          sy = py + ey * u,
          gate = reachAt(sx, sy, rad),
          amount = biteCap * p.cursorBite * drive * gate;
        if (Math.abs(amount) < 1.5 * k) continue;
        const r = rad * (0.8 + 0.4 * stampRand()),
          jit = r * 0.3;
        stamp(sx + (stampRand() - 0.5) * jit, sy + (stampRand() - 0.5) * jit, r, amount * (0.75 + 0.25 * stampRand()));
        hit = true;
      }
      ptr.left = at - len;
      if (hit) api.wake();
      return hit;
    }
    function relax(dt) {
      if (!biteLive || !biteBox || dt <= 0) return;
      const { cols, rows, bite, line } = M,
        rc = (api.params.cursorDrop * k) / M.cell,
        decay = Math.exp(-dt / BITE_FADE);
      let need = 2 * BITE_GROW * rc * rc * dt;
      let [i0, i1, j0, j1] = biteBox;
      while (need > 1e-4) {
        const w = need > 1 ? 1 : need;
        need -= w;
        i0 = Math.max(1, i0 - 1);
        i1 = Math.min(cols - 2, i1 + 1);
        j0 = Math.max(1, j0 - 1);
        j1 = Math.min(rows - 2, j1 + 1);
        for (let j = j0; j <= j1; j++) {
          const row = j * cols;
          for (let i = i0 - 1; i <= i1 + 1; i++) line[i] = bite[row + i];
          for (let i = i0; i <= i1; i++) bite[row + i] = line[i] + w * 0.25 * (line[i - 1] + line[i + 1] - 2 * line[i]);
        }
        for (let i = i0; i <= i1; i++) {
          for (let j = j0 - 1; j <= j1 + 1; j++) line[j] = bite[j * cols + i];
          for (let j = j0; j <= j1; j++)
            bite[j * cols + i] = line[j] + w * 0.25 * (line[j - 1] + line[j + 1] - 2 * line[j]);
        }
      }
      let hi = 0,
        lo = 0;
      for (let j = j0; j <= j1; j++) {
        const row = j * cols;
        for (let i = i0; i <= i1; i++) {
          const v = bite[row + i] * decay;
          bite[row + i] = v;
          if (v > hi) hi = v;
          else if (-v > lo) lo = -v;
        }
      }
      biteBox = [i0, i1, j0, j1];
      biteUp = hi;
      biteDn = lo;
      if (hi < BITE_EPS && lo < BITE_EPS && !inks.length) {
        for (let j = j0; j <= j1; j++) bite.fill(0, j * cols + i0, j * cols + i1 + 1);
        biteLive = false;
        biteBox = null;
        biteUp = biteDn = 0;
      }
    }
    function sample() {
      const {
        cols,
        rows,
        cell,
        ox,
        oy,
        spotX,
        spotY,
        turnC,
        turnS,
        hump,
        amp,
        ampMid,
        floorRow,
        end,
        field,
        bite,
        front,
        bandLo,
        bandHi,
      } = M;
      const n = fade5(U),
        V = clamp(P / FINISH, 0, 1),
        start = H + (CREST - PEEK) * H,
        line = start + (end - start) * V,
        push = vel * SURGE * ampMid;
      const reachUp = biteLive ? biteUp : 0,
        reachDn = biteLive ? biteDn : 0,
        far = 4 * cell;
      let top = rows,
        bottom = 0;
      for (let i = 0; i < cols; i++) {
        const f = H + n * (line - H - CREST * H * hump[i] - push),
          a = amp[i] * n;
        front[i] = f;
        bandLo[i] = Math.floor((f - a - reachUp - oy) / cell) - 1;
        bandHi[i] = Math.ceil((f + a * SINK + reachDn - oy) / cell) + 1;
        if (bandLo[i] < top) top = bandLo[i];
        if (bandHi[i] > bottom) bottom = bandHi[i];
      }
      M.scanTop = top;
      M.scanBottom = bottom;
      const ang = phase * TAU,
        oc = Math.cos(ang) * ORBIT * TEX,
        os = Math.sin(ang) * ORBIT * TEX;
      for (let j = 0; j < rows; j++) {
        const y = oy + j * cell,
          row = j * cols,
          edge = j === 0 || j === rows - 1;
        for (let i = 0; i < cols; i++) {
          const q = row + i;
          if (edge || i === 0 || i === cols - 1) {
            field[q] = -far;
            continue;
          }
          if (j >= floorRow) {
            field[q] = far;
            continue;
          }
          let s = y - front[i] + bite[q];
          if (j >= bandLo[i] && j <= bandHi[i]) {
            const c = turnC[q],
              d = turnS[q],
              mx = oc * c - os * d,
              my = os * c + oc * d,
              bx = spotX[q],
              by = spotY[q];
            const v = tap(T.a, bx + mx, by + my) * CONTRAST;
            let N = v / Math.sqrt(1 + v * v);
            if (N < 0) N *= SINK;
            s += amp[i] * n * N;
          }
          field[q] = s;
        }
      }
    }
    const DI = [1, 0, -1, 0],
      DJ = [0, 1, 0, -1];
    function trace() {
      const { cols, rows, cell, ox, oy, field, seen, count } = M,
        step = [1, cols, -1, -cols],
        minArea = Math.PI * 0.25 * (MIN_SPOT * k) * (MIN_SPOT * k);
      let vx = M.vx,
        vy = M.vy;
      seen.fill(0);
      let d =
          'M' +
          tenth(ox) +
          ' ' +
          tenth(oy) +
          'H' +
          tenth(ox + (cols - 1) * cell) +
          'V' +
          tenth(oy + (rows - 1) * cell) +
          'H' +
          tenth(ox) +
          'Z',
        loops = 0;
      for (let q = cols + 1; q < count - cols - 1; q++) {
        const i = q % cols,
          j = (q - i) / cols;
        if (j > 1 && j < rows - 2 && (j < M.scanTop || j > M.scanBottom) && i > 1 && i < cols - 2) {
          q += cols - 5;
          continue;
        }
        if (!(field[q] > 0)) continue;
        for (let d0 = 0; d0 < 4; d0++) {
          if (field[q + step[d0]] > 0 || seen[q] & (1 << d0)) continue;
          let at = q,
            dir = d0,
            m = 0,
            area = 0;
          do {
            seen[at] |= 1 << dir;
            const nb = at + step[dir],
              a = field[at],
              t = a / (a - field[nb]),
              i = at % cols,
              j = (at - i) / cols;
            if (m === vx.length) {
              const gx = new Float32Array(m * 2),
                gy = new Float32Array(m * 2);
              gx.set(vx);
              gy.set(vy);
              vx = M.vx = gx;
              vy = M.vy = gy;
            }
            vx[m] = ox + (i + DI[dir] * t) * cell;
            vy[m] = oy + (j + DJ[dir] * t) * cell;
            if (m) area += vx[m - 1] * vy[m] - vx[m] * vy[m - 1];
            m++;
            const turn = (dir + 3) & 3,
              ahead = at + step[turn],
              corner = ahead + step[dir];
            if (field[corner] > 0) {
              at = corner;
              dir = (dir + 1) & 3;
            } else if (field[ahead] > 0) at = ahead;
            else dir = turn;
          } while (at !== q || dir !== d0);
          area += vx[m - 1] * vy[0] - vx[0] * vy[m - 1];
          if (m < 3 || Math.abs(area) * 0.5 < minArea) continue;
          d += curve(vx, vy, m, cell < 7 && m >= 12 ? 2 : 1);
          loops++;
        }
      }
      return { d, loops };
    }
    function curve(vx, vy, m, stride) {
      const n = Math.floor(m / stride),
        X = (i) => Math.round(vx[(((i % n) + n) % n) * stride] * 10),
        Y = (i) => Math.round(vy[(((i % n) + n) % n) * stride] * 10);
      let s = 'M' + X(0) / 10 + ' ' + Y(0) / 10;
      for (let i = 0; i < n; i++) {
        const ax = X(i),
          ay = Y(i),
          bx = X(i + 1) - ax,
          by = Y(i + 1) - ay,
          c1x = Math.round((bx - X(i - 1) + ax) / 6),
          c1y = Math.round((by - Y(i - 1) + ay) / 6),
          c2x = bx - Math.round((X(i + 2) - ax) / 6),
          c2y = by - Math.round((Y(i + 2) - ay) / 6);
        s += 'c' + c1x / 10 + ' ' + c1y / 10 + ' ' + c2x / 10 + ' ' + c2y / 10 + ' ' + bx / 10 + ' ' + by / 10;
      }
      return s + 'Z';
    }
    function draw() {
      if (!M) return;
      if (shapeKey !== api.params.wander + '|' + api.params.scale) build();
      sample();
      cleared = P / FINISH >= 1 && U >= 1 && vel >= 0 && !biteLive;
      const out = trace();
      if (out.d.indexOf('NaN') === -1) over.style.clipPath = 'path(evenodd, "' + out.d + '")';
      element.dataset.open = out.loops ? 'true' : 'false';
    }
    let back = null,
      wheelAt = -Infinity,
      held = false,
      drag = null;
    const unitOf = (e) => (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1),
      trackPx = () => Math.max(1, api.params.track * H);
    function touched() {
      if (card.touched) card.touched();
    }
    function push(delta) {
      Pt = clamp(Pt + delta, 0, 1);
      back = null;
      if (api.reduced) {
        P = Pt;
        api.paint();
      }
      api.wake();
    }
    {
      api.listen(
        element,
        'wheel',
        (event) => {
          if (api.paused) return;
          const dy = event.deltaY * unitOf(event);
          if (!dy) return;
          const now = performance.now();
          if (now - wheelAt > WHEEL_GAP) held = false;
          wheelAt = now;
          const latch = card.wheelLatch;
          if (latch && card && ((dy > 0 && Pt >= 1) || (dy < 0 && Pt <= 0))) {
            if (held) event.preventDefault();
            return;
          }
          event.preventDefault();
          held = true;
          push(dy / trackPx());
          touched();
        },
        { passive: false },
      );
      api.listen(element, 'pointerdown', (event) => {
        if (event.pointerType === 'mouse' || api.paused) return;
        drag = { id: event.pointerId, y: event.clientY };
      });
      api.listen(element, 'pointermove', (event) => {
        if (drag && drag.id === event.pointerId) {
          const d = drag.y - event.clientY;
          drag.y = event.clientY;
          if (d) {
            push((d / trackPx()) * 1.5);
            touched();
          }
          return;
        }
        if (event.pointerType === 'touch' || !hoverDevice) return;
        const rect = frame.getBoundingClientRect(),
          list = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : null,
          samples = list && list.length > 1 ? list.slice(-6) : [event];
        let hit = false;
        for (const e of samples) hit = track(e.clientX - rect.left, e.clientY - rect.top, e.timeStamp / 1000) || hit;
        if (hit) {
          touched();
        }
      });
      const end = (event) => {
        if (drag && drag.id === event.pointerId) drag = null;
      };
      api.listen(element, 'pointerup', end);
      api.listen(element, 'pointercancel', end);
      api.listen(element, 'pointerleave', () => {
        ptr = null;
      });
      api.listen(element, 'keydown', (event) => {
        const map = { ArrowDown: 0.1, ArrowUp: -0.1, PageDown: 0.3, PageUp: -0.3, End: 1, Home: -1 };
        if (!(event.key in map)) return;
        event.preventDefault();
        push(map[event.key]);
        touched();
      });
    }
    api.restore = () => {
      drag = null;
      if (api.reduced) {
        Pt = P = 0;
        api.paint();
        return;
      }
      back = { t: 0, from: P };
      Pt = 0;
      api.wake();
    };
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
    const outEase = cubicBezier(0.22, 1, 0.36, 1);
    let cycle = -1;
    api.on('resize', () => {
      build();
      api.paint();
    });
    api.on('params', () => {
      if (shapeKey !== api.params.wander + '|' + api.params.scale) build();
      api.wake();
    });
    api.on('replay', () => {
      P = Pt = prevShown = 0;
      vel = 0;
      phase = 0;
      U = !card.intro ? 1 : 0;
      cycle = -1;
      back = null;
      ptr = null;
      inks.length = 0;
      biteLive = false;
      biteBox = null;
      if (M) M.bite.fill(0);
    });
    api.on('motion', (reduced) => {
      if (reduced) {
        P = Pt;
        U = 1;
      }
    });
    api.on('pause', (v) => {
      if (v) drag = null;
    });
    api.on('destroy', () => {
      M = null;
      over.style.clipPath = '';
    });
    build();
    api.frame(({ dt, time, params, reduced }) => {
      if (!M) return false;
      if (reduced) {
        U = 1;
        vel = 0;
        P = Pt;
        draw();
        return false;
      }
      const step = Math.min(0.1, dt);
      if (back) {
        back.t += dt;
        const e = outEase(Math.min(1, back.t / RESTORE));
        P = R.mix(back.from, 0, e);
        if (back.t >= RESTORE) {
          P = Pt = 0;
          back = null;
        }
      } else {
        const r = Math.min(4, Math.max(0.25, (dt > 0 ? dt * 1000 : FRAME) / FRAME)),
          diff = Pt - P;
        if (Math.abs(diff) < 1e-5) P = Pt;
        else if (dt > 0) P += diff * (1 - Math.pow(1 - FOLLOW, r));
      }
      if (step > 0) {
        const v = ((P - prevShown) / step) * params.track;
        vel += (clamp(v / SPEED_REF, -1, 1) - vel) * (1 - Math.exp(-step / SPEED_TAU));
      }
      prevShown = P;
      if (U < 1 && step > 0) U = INTRO <= 0 ? 1 : Math.min(1, U + step / INTRO);
      phase += step * params.lifeSpeed * (1 + Math.abs(vel) * AGITATE);
      ink(step);
      relax(step);
      draw();
      element.dataset.progress = P.toFixed(3);
      const still = !back && P === Pt && U >= 1 && !biteLive;
      if (still && params.lifeSpeed === 0 && Math.abs(vel) < 1e-4) vel = 0;
      return !(still && (cleared || (params.lifeSpeed === 0 && vel === 0)));
    });
    const status = api.status;
    api.status = () => ({ ...status(), progress: P, target: Pt, intro: U, phase, velocity: vel, bites: biteLive });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountNoiseDissolveReveal(element, options) {
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
    element.classList.add('noise-dissolve-reveal');
    element.innerHTML = '<div class="fx-board"></div>';
    const stage = element,
      board = stage.querySelector('.fx-board');
    board.innerHTML = '<div class="dv-box" tabindex="0" role="group" aria-label="Noise Dissolve Reveal"></div>';
    const box = board.firstChild;
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
      board.style.setProperty('--fx-k', (box.clientWidth / 336).toFixed(4));
    }

    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    inst = mount(box, {
      params: options.params,
      card: {
        intro: true,
        interactive: true,
        wheelLatch: true,
        under: () =>
          '<div class="ck-panel ck-solid" data-size="lg"><div class="dv-figure">' +
          [0, 1, 2, 3].map((i) => glyph(i)).join('') +
          '</div><span class="ck-dot dv-play" data-size="lg" data-accent></span></div>',
        over: () =>
          '<div class="ck-panel" data-size="lg"><div class="dv-sheet" lang="en"><div class="dv-head"><span class="ck-text" data-strong>Studio</span><span class="ck-text">Index</span></div><hr class="ck-rule">' +
          '<p class="dv-title">Night<br>Field</p><div class="dv-meta"><span><span class="ck-hint">Direction</span><span class="ck-text">A. Moreau</span></span><span><span class="ck-hint">Runtime</span><span class="ck-text">94 min</span></span><span><span class="ck-hint">Format</span><span class="ck-text">35 mm</span></span></div>' +
          '<span class="ck-pill" data-size="sm" style="position:absolute;left:clamp(20px,4.5cqw,40px);bottom:clamp(18px,5cqh,36px)">Watch</span></div></div>',
      },
    });

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
  global.mountNoiseDissolveReveal = mountNoiseDissolveReveal;
  if (typeof module === 'object' && module.exports) module.exports = mountNoiseDissolveReveal;
})(typeof window !== 'undefined' ? window : this);
