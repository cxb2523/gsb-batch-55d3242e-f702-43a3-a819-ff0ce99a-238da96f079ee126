/*
 * Crop-Line Page Transition
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A small two-page site (Work / About) with nav pills at the bottom. Pick a pill and four thin lines come in from the
 * four edges; the page is cropped with them and shrinks to nothing at the centre, where the lines cross. The lines do
 * not stop or turn back: they keep going through each other towards the opposite edges, and the next page opens from
 * the centre behind them. Good as a page transition for any site; it needs no images and works on any content.
 *
 * How it moves (default values)
 * - One progress value per line, "trans", runs 0 -> 50 -> 100 % of the screen in one continuous path. The top line sits
 *   at top = trans, the bottom line at bottom = trans, the left at left = trans, the right at right = trans, each
 *   centred on its position (offset by half the line width). So in the first half the lines close in from the edges;
 *   at 50 % they form a cross; in the second half each line carries on to the opposite edge.
 * - Close, 800 ms (params.close), power1.in (t * t): trans 0 -> 50 %, and the old page gets clip-path: inset(m %) with
 *   m 0 -> 50 %, so it is cropped exactly along the lines.
 * - Open, 800 ms (params.open), power1.out (1 - (1 - t)^2): trans 50 -> 100 %, the new page clip-path inset 50 -> 0 %.
 *   The lines now sit on the opposite side of the opening edge, still tracing it. Fastest at the crossing.
 * - 100 ms after the open starts, the new page's blocks (title, button, image blocks) rise in: y 24 px -> 0 and
 *   opacity 0 -> 1, 600 ms on cubic-bezier(.22, 1, .36, 1), 60 ms apart.
 * - Behind the pages the screen is the light grey surface, so the cropped page reads as a white sheet shrinking on grey.
 *   The lines are hidden at rest. A pick while a switch runs is ignored.
 *
 * Input
 * - Click a nav pill (buttons, so Tab + Enter works too). The current page is marked with aria-current and a dot, and
 *   the new page name is announced in a polite live region.
 *
 * Options
 *   params.close   300..2000 ms, default 800    close half (lines to the centre)
 *   params.open    300..2000 ms, default 800    open half (lines to the opposite edges)
 *   params.line    1..4 px, default 1           line width
 *   reducedMotion  true / false / null          force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountCropLinePageTransition(element, {params: {...}, reducedMotion: null});
 *   fx.params                    copy of current params
 *   fx.setParams({open: 1200})   change params; used by the next switch (and the one running)
 *   fx.setPaused(true|false)     freeze / resume
 *   fx.reset()                   params back to defaults; the view fades out, comes back on Work at rest, fades in
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                 stops the loop, removes listeners and observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountCropLinePageTransition(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect replaces its children.
 * For a real site: put clip-path: inset(var(--mask)) on your main wrapper and four fixed 1 px lines in an overlay with
 * pointer-events: none; tween --mask and the line position on leave / enter of your router (Barba, Swup, View
 * Transitions, Next.js), swapping the content at the end of the close half.
 *
 * Safe to change
 * - The two pages (pagesHTML): any content. Mark the blocks that should rise in with data-rise.
 * - Line colour (.cp-l background), the grey behind the pages (.cp-site background), the nav words.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The lines must not stop or reverse at the centre: one path 0 -> 50 -> 100 %, quad in then quad out, so the crossing
 *   is the fastest moment.
 * - The page crop and the lines share one value; the crop is a symmetric inset, so the page closes to (and opens from)
 *   the exact centre.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Nav pills are real buttons; aria-current marks the page; a polite live region names the new page.
 * - With reduced motion the page swaps at once, no lines, no rise.
 * - The loop runs only while something moves and stops when the tab is hidden, the element is off screen or paused.
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

  const CONTROLS = [
    { key: 'close', type: 'range', default: 800, min: 300, max: 2000, step: 50 },
    { key: 'open', type: 'range', default: 800, min: 300, max: 2000, step: 50 },
    { key: 'line', type: 'range', default: 1, min: 1, max: 4, step: 0.5 },
  ];

  // ---- the effect ----
  const NAV = ['Work', 'About'],
    ENTER_DELAY = 100,
    RISE = 600,
    RISE_GAP = 60,
    RISE_Y = 24;
  const GLYPHS = [
    '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M50 16v68M16 50h68" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    '<rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M24 24l52 52M76 24L24 76" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  ];
  const media = (tone, glyph) =>
    '<div class="ck-media" data-rise' +
    (tone ? ' data-tone="' + tone + '"' : '') +
    ' aria-hidden="true"><svg class="ck-glyph" viewBox="0 0 100 100">' +
    GLYPHS[glyph % 4] +
    '</svg></div>';
  const quadIn = (t) => t * t,
    quadOut = (t) => 1 - (1 - t) * (1 - t);
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
  function pagesHTML() {
    const p0 =
      '<section class="cp-page cp-p0" data-page="0"><h3 class="cp-title" data-rise>Selected work</h3>' +
      '<div class="cp-grid">' +
      [1, 0, 2, 2, 1, 0].map((tone, i) => media(tone, i)).join('') +
      '</div></section>';
    const p1 =
      '<section class="cp-page cp-p1" data-page="1" hidden><div class="cp-copy"><h3 class="cp-title" data-rise>Small studio.<br>Long table.</h3>' +
      '<span class="ck-pill ck-solid" data-size="sm" data-rise>Get in touch</span></div>' +
      media(2, 0) +
      '</section>';
    return p0 + p1;
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const cardOpt = options.card || null;
    element.classList.add('cp-stage');
    element.dataset.card = 'live';
    element.innerHTML =
      '<div class="cp-site ck-panel" data-size="lg"><div class="cp-view">' +
      pagesHTML() +
      '</div>' +
      '<nav class="cp-nav" aria-label="Sample navigation">' +
      NAV.map(
        (w, i) =>
          '<button type="button" class="ck-pill" data-size="sm" data-go="' +
          i +
          '"' +
          '' +
          (i ? '' : ' aria-current="page"') +
          '><i class="ck-dot" data-accent></i>' +
          w +
          '</button>',
      ).join('') +
      '</nav>' +
      '<div class="cp-lines" aria-hidden="true"><i class="cp-l cp-top"></i><i class="cp-l cp-bot"></i><i class="cp-l cp-left"></i><i class="cp-l cp-right"></i></div></div>' +
      '' +
      '<p class="cp-live" aria-live="polite"></p>';
    const q = (s) => element.querySelector(s);
    const site = q('.cp-site'),
      view = q('.cp-view'),
      lines = q('.cp-lines'),
      pages = [...element.querySelectorAll('.cp-page')],
      pills = [...element.querySelectorAll('.cp-nav .ck-pill')],
      liveEl = q('.cp-live');
    const nav = q('.cp-nav');
    const rises = pages.map((p) => [...p.querySelectorAll('[data-rise]')]);
    let page = 0,
      target = 0,
      phase = 'idle',
      t = 0,
      restoring = null;
    function showPage(i) {
      pages.forEach((el, k) => {
        el.hidden = k !== i;
      });
      element.dataset.page = String(i);
    }
    function markNav(i) {
      pills.forEach((el, k) => {
        if (k === i) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      });
    }
    function clearPage(el) {
      el.style.clipPath = '';
    }
    function cropNav(m) {
      if (m === null) {
        nav.style.clipPath = '';
        return;
      }
      const W = site.clientWidth,
        H = site.clientHeight,
        top = nav.offsetTop,
        bot = H - top - nav.offsetHeight,
        y = (H * m) / 100,
        x = (W * m) / 100;
      nav.style.clipPath =
        'inset(' +
        Math.max(0, y - top).toFixed(2) +
        'px ' +
        x.toFixed(2) +
        'px ' +
        Math.max(0, y - bot).toFixed(2) +
        'px)';
    }
    function clearRise(i) {
      rises[i].forEach((el) => {
        el.style.opacity = '';
        el.style.transform = '';
      });
    }
    function setLines(trans) {
      if (trans === null) {
        lines.hidden = true;
        return;
      }
      lines.hidden = false;
      lines.style.setProperty('--cp-trans', trans.toFixed(3) + '%');
    }
    function settleIdle(i) {
      phase = 'idle';
      element.dataset.phase = 'idle';
      page = target = i;
      t = 0;
      pages.forEach(clearPage);
      cropNav(null);
      clearRise(0);
      clearRise(1);
      showPage(i);
      markNav(i);
      setLines(null);
    }
    function openTotal() {
      return Math.max(api.params.open, ENTER_DELAY + (rises[target].length - 1) * RISE_GAP + RISE);
    }
    function render() {
      const prm = api.params;
      if (phase === 'close') {
        const e = quadIn(Math.min(1, t / prm.close)),
          m = 50 * e;
        pages[page].style.clipPath = 'inset(' + m.toFixed(3) + '%)';
        cropNav(m);
        setLines(m);
      } else if (phase === 'open') {
        const k = Math.min(1, t / prm.open),
          e = quadOut(k),
          m = 50 * (1 - e);
        pages[page].style.clipPath = k < 1 ? 'inset(' + m.toFixed(3) + '%)' : '';
        cropNav(k < 1 ? m : null);
        setLines(k < 1 ? 50 + 50 * e : null);
        rises[page].forEach((el, i) => {
          const u = outEase((t - ENTER_DELAY - i * RISE_GAP) / RISE);
          el.style.opacity = u < 1 ? u.toFixed(3) : '';
          el.style.transform = u < 1 ? 'translateY(' + (RISE_Y * (1 - u)).toFixed(2) + 'px)' : '';
        });
      }
    }
    function go(i) {
      if (restoring || phase !== 'idle' || i === page) return false;
      target = i;
      markNav(i);
      liveEl.textContent = NAV[i] + '.';
      if (api.reduced) {
        settleIdle(i);
        return true;
      }
      phase = 'close';
      element.dataset.phase = 'close';
      t = 0;
      render();
      api.wake();
      return true;
    }
    function step(dt) {
      if (phase === 'idle') return;
      t += dt * 1000;
      if (phase === 'close' && t >= api.params.close) {
        t -= api.params.close;
        clearPage(pages[page]);
        page = target;
        showPage(page);
        phase = 'open';
        element.dataset.phase = 'open';
        rises[page].forEach((el) => {
          el.style.opacity = '0';
          el.style.transform = 'translateY(' + RISE_Y + 'px)';
        });
      }
      if (phase === 'open' && t >= openTotal()) {
        settleIdle(page);
        return;
      }
      render();
    }
    pills.forEach((btn, i) =>
      api.listen(btn, 'click', () => {
        if (api.paused || false) return;
        if (go(i) && cardOpt && cardOpt.touched) cardOpt.touched();
      }),
    );
    api.on('params', () => {
      lines.style.setProperty('--cp-line', api.params.line + 'px');
      if (phase !== 'idle') render();
    });
    api.on('replay', () => {
      restoring = null;
      view.style.opacity = '';
      settleIdle(0);
      cyc = -1;
    });
    api.on('motion', (reduced) => {
      if (reduced) {
        restoring = null;
        view.style.opacity = '';
        settleIdle(target);
      }
    });
    let cyc = -1;
    {
      api.restore = () => {
        if (restoring || (phase === 'idle' && page === 0)) return;
        if (api.reduced) {
          settleIdle(0);
          return;
        }
        restoring = { t: 0, from: +getComputedStyle(view).opacity || 1, swapped: false };
        api.wake();
      };
    }
    function stepRestore(dt) {
      restoring.t += dt;
      const OUT = 0.2,
        IN = 0.3,
        r = restoring;
      if (r.t < OUT) {
        view.style.opacity = (r.from * (1 - outEase(r.t / OUT))).toFixed(3);
        return;
      }
      if (!r.swapped) {
        r.swapped = true;
        settleIdle(0);
      }
      const u = (r.t - OUT) / IN;
      if (u >= 1) {
        view.style.opacity = '';
        restoring = null;
        return;
      }
      view.style.opacity = outEase(u).toFixed(3);
    }
    api.frame(({ dt, time, reduced }) => {
      if (reduced) {
        return false;
      }
      if (restoring) stepRestore(dt);
      else step(dt);
      return phase !== 'idle' || !!restoring;
    });
    lines.style.setProperty('--cp-line', api.params.line + 'px');
    settleIdle(0);
    const status = api.status;
    api.status = () => ({ ...status(), page, target, phase, t });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountCropLinePageTransition(element, options) {
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
    element.classList.add('crop-line-page-transition');
    element.innerHTML = '<div class="fx-board" data-cp-board></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-cp-board]');
    const phone = matchMedia('(max-width: 760px)');
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      let w, h, x, y;
      if (phone.matches) {
        w = W - 32;
        h = H - 32;
        x = 16;
        y = 16;
      } else {
        w = Math.min(800, W - 64);
        h = Math.min(Math.round(w * 0.62), H - 64);
        x = Math.max((W - w) / 2, panelZone(stage).right + 16);
        w = Math.min(w, W - 32 - x);
        y = (H - h) / 2;
      }
      [
        ['x', x],
        ['y', y],
        ['w', w],
        ['h', h],
      ].forEach(([k, v]) => board.style.setProperty('--cp-' + k, Math.round(v) + 'px'));
      board.style.setProperty('--fx-k', (w / 336).toFixed(4));
    }
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(board, { params: options.params, card: { interactive: true } });

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
  global.mountCropLinePageTransition = mountCropLinePageTransition;
  if (typeof module === 'object' && module.exports) module.exports = mountCropLinePageTransition;
})(typeof window !== 'undefined' ? window : this);
