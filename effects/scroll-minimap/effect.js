/*
 * Scroll Minimap
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A long page scrolls in a window; beside it a column of small copies of every block of the page (real copies,
 * scaled down). A 1 px frame over the column marks what the window shows right now. Scroll and the frame slides
 * down and grows or shrinks with how much of the blocks is in view; click a copy to jump to that block. Good for
 * case studies, long articles, docs and long forms.
 *
 * How it moves (default values)
 * - Smooth scroll: input only moves a target T. The shown scroll S chases it every frame:
 *   S += (T - S) * (1 - exp(-dt / glide)), glide = 80 ms (about a lerp of 0.19 per 60 fps frame). Snaps within 0.05 px.
 * - The frame maps S into the column, then chases that with a second, shorter damping (frameLag = 40 ms).
 * - Mapping is piecewise linear: each block maps onto its copy (scale k = copy width / page width), each gap between
 *   blocks onto the 8 px gap in the column, the page's top and bottom padding onto the 6 px the frame sticks out.
 *   Frame top = map(S), bottom = map(S + window height); frame width = copy width + 12 px.
 * - Click a copy: T = that block's top minus one gap (first block: 0), same glide.
 * - If the column would be taller than 92 % of the window, the copy width shrinks to fit.
 * - Wheel (line mode x 16, page mode x window height). At either end, a wheel gesture that already moved the page
 *   keeps being swallowed (events < 250 ms apart), so trackpad inertia does not scroll the host page.
 *
 * Options
 *   params.glide       0..300, default 80     ms, page follow time constant (0 = instant)
 *   params.frameLag    0..200, default 40     ms, extra frame follow time constant
 *   params.thumbWidth  32..96, default 56     px, copy width (shrinks automatically to fit)
 *
 * API
 *   const fx = mountScrollMinimap(element);
 *   fx.setParams({glide: 120}); fx.setPaused(bool); fx.reset(); fx.setReducedMotion(bool); fx.destroy();
 *
 * Safe to change
 * - The blocks in SECTIONS (any markup; copies are made from it), colours, fonts, radii via effect.css.
 *
 * Do not change (the feel breaks)
 * - The frame must read the shown scroll S, not the target T, or it jumps ahead of the page.
 * - Keep gaps compressed in the map (piecewise mapping); a plain proportional map loses the changing frame height.
 *
 * Porting
 * - Mount once on a sized element after it is in the DOM; destroy on unmount. The effect owns its children.
 *
 * Accessibility and reduced motion
 * - The window is a focusable region (arrows, Page Up / Down, Space, Home, End). Copies are buttons labelled
 *   "Go to <block>". Touch drag scrolls the page. With reduced motion everything jumps, no cursor.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const R = { clamp, smooth, mix };

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

  const CONTROLS = [
    { key: 'glide', type: 'range', default: 80, min: 0, max: 300, step: 10 },
    { key: 'frameLag', type: 'range', default: 40, min: 0, max: 200, step: 10 },
    { key: 'thumbWidth', type: 'range', default: 56, min: 32, max: 96, step: 2 },
  ];

  // ---- the effect ----
  const TG = 8,
    FP = 6,
    WHEEL_GAP = 250,
    RESTORE = 0.5;
  const GLYPHS = [
    '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M50 16v68M16 50h68" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    '<rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M24 24l52 52M76 24L24 76" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  ];
  const media = (tone, glyph, accent) =>
    '<div class="ck-media"' +
    (tone ? ' data-tone="' + tone + '"' : '') +
    (accent ? ' data-accent' : '') +
    ' aria-hidden="true"><svg class="ck-glyph" viewBox="0 0 100 100">' +
    GLYPHS[glyph % 4] +
    '</svg></div>';
  const SECTIONS = [
    [
      'Overview',
      '<div class="ck-panel mm-hero">' +
        media(2, 0) +
        '<div class="mm-row"><span class="ck-text" data-strong>Field Notes</span><span class="ck-pill" data-size="sm">Visit site</span></div></div>',
    ],
    [
      'The brief',
      '<div class="ck-panel mm-copy"><p class="ck-text" data-strong>The brief</p><p class="ck-text">A reading room that wanted to feel as calm online as it does on a Sunday morning.</p></div>',
    ],
    ['Spreads', '<div class="mm-grid" data-cols="2">' + media(1, 1) + media(2, 2) + '</div>'],
    ['Signage', '<div class="mm-wide">' + media(0, 0, true) + '</div>'],
    [
      'Quote',
      '<div class="ck-panel mm-copy"><p class="ck-text" data-strong>“Quiet, sturdy and easy to read.”</p></div>',
    ],
    ['Details', '<div class="mm-grid" data-cols="3">' + media(2, 3) + media(1, 2) + media(2, 1) + '</div>'],
    ['Interior', '<div class="mm-tall">' + media(2, 3) + '</div>'],
    [
      'Next project',
      '<div class="ck-panel mm-next"><span class="ck-text" data-strong>Next: Salt Flats</span><span class="ck-pill ck-solid" data-size="sm">View</span></div>',
    ],
  ];
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
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const card = options.card || null;
    element.classList.add('mm-stage');
    element.dataset.card = 'live';
    const off = '';
    element.innerHTML =
      '<div class="mm-view" role="region" aria-label="Sample case study"' +
      ' tabindex="0"' +
      '><div class="mm-doc">' +
      SECTIONS.map((s, i) => '<section class="mm-sec" data-i="' + i + '">' + s[1] + '</section>').join('') +
      '</div></div>' +
      '<nav class="mm-map" aria-label="Page minimap">' +
      SECTIONS.map(
        (s, i) =>
          '<button type="button" class="mm-thumb" data-i="' +
          i +
          '" aria-label="Go to ' +
          s[0] +
          '"' +
          off +
          '></button>',
      ).join('') +
      '<i class="mm-frame" aria-hidden="true"></i></nav>' +
      '';
    const q = (s) => element.querySelector(s),
      view = q('.mm-view'),
      doc = q('.mm-doc'),
      map = q('.mm-map'),
      frameEl = q('.mm-frame');
    const secs = [...element.querySelectorAll('.mm-sec')],
      thumbs = [...element.querySelectorAll('.mm-thumb')];
    thumbs.forEach((b, i) => {
      const c = secs[i].cloneNode(true);
      c.className = 'mm-sec mm-mini';
      c.removeAttribute('data-i');
      c.setAttribute('aria-hidden', 'true');
      c.setAttribute('inert', '');
      b.appendChild(c);
    });
    const L = {
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      C: 1,
      tw: 1,
      k: 1,
      gap: 20,
      tops: [],
      hs: [],
      ty: [],
      th: [],
      D: [0, 1],
      M: [0, 1],
      max: 0,
      mx: 0,
      my: 0,
      mh: 0,
    };
    function box(W, H) {
      if (card.box) return card.box(W, H);
      return { x: 0, y: 0, w: W, h: H };
    }
    const set = (k, v) => element.style.setProperty(k, v);
    function layout() {
      const W = element.clientWidth || 1,
        H = element.clientHeight || 1,
        b = box(W, H),
        compact = b.w < 420;
      const gap = compact ? 12 : 20,
        mg = compact ? 20 : 40,
        maxH = b.h * 0.92;
      set('--mm-gap', gap + 'px');
      set('--mm-in', (compact ? 8 : 12) + 'px');
      let tw = api.params.thumbWidth,
        C = 1,
        hs = [],
        sum = 1;
      const measure = () => {
        C = Math.max(120, b.w - mg - tw - 2 * FP);
        set('--mm-c', C.toFixed(2) + 'px');
        hs = secs.map((s) => s.offsetHeight);
        sum = hs.reduce((a, c) => a + c, 0) || 1;
      };
      for (let it = 0; it < 5; it++) {
        measure();
        if ((sum * tw) / C + TG * (hs.length - 1) + 2 * FP <= maxH + 0.5) break;
        tw = Math.max(16, Math.floor((((maxH - TG * (hs.length - 1) - 2 * FP) * C) / sum) * 100) / 100);
      }
      const k = tw / C,
        tops = secs.map((s) => s.offsetTop),
        docH = doc.offsetHeight;
      const th = hs.map((h) => h * k),
        ty = [];
      let y = FP;
      th.forEach((h, i) => {
        ty[i] = y;
        y += h + TG;
      });
      const mh = y - TG + FP;
      const D = [0],
        M = [0];
      tops.forEach((t, i) => {
        D.push(t, t + hs[i]);
        M.push(ty[i], ty[i] + th[i]);
      });
      D.push(Math.max(docH, D[D.length - 1] + 1));
      M.push(mh);
      Object.assign(L, {
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        C,
        tw,
        k,
        gap,
        tops,
        hs,
        ty,
        th,
        D,
        M,
        max: Math.max(0, docH - b.h),
        mx: b.x + C + mg,
        my: b.y + (b.h - mh) / 2,
        mh,
      });
      set('--mm-x', b.x.toFixed(2) + 'px');
      set('--mm-y', b.y.toFixed(2) + 'px');
      set('--mm-h', b.h.toFixed(2) + 'px');
      set('--mm-w', tw + 'px');
      set('--mm-k', k.toFixed(5));
      set('--mm-mx', L.mx.toFixed(2) + 'px');
      set('--mm-my', L.my.toFixed(2) + 'px');
      set('--mm-mh', mh.toFixed(2) + 'px');
      thumbs.forEach((el, i) => {
        el.style.top = ty[i].toFixed(2) + 'px';
        el.style.height = th[i].toFixed(2) + 'px';
      });
      T = R.clamp(T, 0, L.max);
      S = R.clamp(S, 0, L.max);
      if (!laid) {
        laid = true;
        snapFrame();
      }
      render();
    }
    function mapY(y) {
      const D = L.D,
        M = L.M;
      if (y <= D[0]) return M[0];
      for (let i = 1; i < D.length; i++)
        if (y <= D[i]) return M[i - 1] + ((M[i] - M[i - 1]) * (y - D[i - 1])) / (D[i] - D[i - 1] || 1);
      return M[M.length - 1];
    }
    let T = 0,
      S = 0,
      ft = 0,
      fb = 0,
      laid = false,
      restoring = null;
    function snapFrame() {
      ft = mapY(S);
      fb = mapY(S + L.h);
    }
    function render() {
      doc.style.transform = 'translate3d(0,' + (-S).toFixed(2) + 'px,0)';
      frameEl.style.transform = 'translate3d(0,' + ft.toFixed(2) + 'px,0)';
      frameEl.style.height = Math.max(2, fb - ft).toFixed(2) + 'px';
    }
    const chase = (a, b, tau, dt) =>
      tau > 0 ? (Math.abs(b - a) < 0.05 ? b : a + (b - a) * (1 - Math.exp(-dt / tau))) : b;
    function step(dt) {
      if (restoring) {
        restoring.t += dt;
        const u = Math.min(1, restoring.t / RESTORE);
        S = T = restoring.from * (1 - outEase(u));
        snapFrame();
        render();
        if (u >= 1) restoring = null;
        return !!restoring;
      }
      const p = api.params;
      S = chase(S, T, p.glide / 1000, dt);
      const a = mapY(S),
        b = mapY(S + L.h),
        fl = p.frameLag / 1000;
      ft = chase(ft, a, fl, dt);
      fb = chase(fb, b, fl, dt);
      render();
      return S !== T || ft !== a || fb !== b;
    }
    function scrollTo(v) {
      const n = R.clamp(v, 0, L.max);
      if (Math.abs(n - T) < 0.01) return false;
      restoring = null;
      T = n;
      if (api.reduced) {
        S = T;
        snapFrame();
        render();
      } else api.wake();
      return true;
    }
    const go = (i) => scrollTo(i <= 0 ? 0 : L.tops[i] - L.gap);
    const touch = () => {
      if (card.touched) card.touched();
    };
    const gap = card.wheelLatch ? (typeof card.wheelLatch === 'number' ? card.wheelLatch : WHEEL_GAP) : 0;
    let wheelAt = -Infinity,
      held = false;
    {
      api.listen(
        element,
        'wheel',
        (e) => {
          if (e.ctrlKey || api.paused) return;
          const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? L.h : 1);
          if (gap && dy) {
            const now = performance.now();
            if (now - wheelAt > gap) held = false;
            wheelAt = now;
          }
          if (!dy || !scrollTo(T + dy)) {
            if (gap && dy && held) e.preventDefault();
            return;
          }
          if (gap) held = true;
          e.preventDefault();
          touch();
        },
        { passive: false },
      );
      thumbs.forEach((b, i) =>
        api.listen(b, 'click', () => {
          if (api.paused) return;
          if (go(i)) touch();
        }),
      );
      api.listen(view, 'keydown', (e) => {
        if (api.paused) return;
        const k = e.key,
          h = L.h;
        const to = {
          ArrowDown: T + 48,
          ArrowUp: T - 48,
          PageDown: T + h * 0.9,
          PageUp: T - h * 0.9,
          ' ': T + (e.shiftKey ? -1 : 1) * h * 0.9,
          Home: 0,
          End: L.max,
        }[k];
        if (to === undefined) return;
        if (scrollTo(to)) {
          e.preventDefault();
          touch();
        }
      });
      let drag = null;
      api.listen(view, 'pointerdown', (e) => {
        if (e.pointerType !== 'touch' || api.paused) return;
        restoring = null;
        drag = { id: e.pointerId, y: e.clientY, t: T };
        try {
          view.setPointerCapture(e.pointerId);
        } catch {}
      });
      api.listen(view, 'pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (scrollTo(drag.t - (e.clientY - drag.y))) {
          S = T;
          touch();
        }
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) =>
        api.listen(view, t, (e) => {
          if (drag && e.pointerId === drag.id) drag = null;
        }),
      );
      {
      }
    }
    let cyc = -1;
    {
      api.restore = () => {
        if (T === 0 && S === 0 && !restoring) return;
        if (api.reduced) {
          restoring = null;
          T = S = 0;
          snapFrame();
          render();
          return;
        }
        restoring = { t: 0, from: S };
        api.wake();
      };
    }
    api.on('resize', layout);
    api.on('params', () => {
      if (laid) layout();
    });
    api.on('replay', () => {
      restoring = null;
      T = S = 0;
      cyc = -1;
      snapFrame();
      render();
    });
    api.on('motion', (r) => {
      if (r) {
        restoring = null;
        S = T;
        snapFrame();
        render();
      }
    });
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(() => {
        if (!api.destroyed) layout();
      });
    api.frame(({ dt, time, reduced }) => {
      if (reduced) {
        S = T;
        snapFrame();
        render();
        return false;
      }
      const moving = step(dt);
      return moving;
    });
    layout();
    const status = api.status;
    api.status = () => ({
      ...status(),
      scroll: S,
      target: T,
      max: L.max,
      frameTop: ft,
      frameHeight: fb - ft,
      thumbWidth: L.tw,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountScrollMinimap(element, options) {
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
    element.classList.add('scroll-minimap');
    element.innerHTML = '<div class="fx-board" data-mm-board></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-mm-board]');
    const phone = matchMedia('(max-width: 760px)');
    function box(W, H) {
      if (phone.matches) return { x: 16, y: 0, w: W - 32, h: H };
      const want = Math.min(640, W - 64),
        left = Math.max((W - want) / 2, panelZone(stage).right + 24);
      return { x: left, y: 0, w: Math.min(want, W - 32 - left), h: H };
    }
    const inst = mount(board, { params: options.params, card: { box, interactive: true, wheelLatch: true } });

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
  global.mountScrollMinimap = mountScrollMinimap;
  if (typeof module === 'object' && module.exports) module.exports = mountScrollMinimap;
})(typeof window !== 'undefined' ? window : this);
