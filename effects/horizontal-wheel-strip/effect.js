/*
 * Horizontal Wheel Strip
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A looping row of eight cards that the vertical mouse wheel moves sideways. The row glides after the input and the
 * cards shrink slightly while it moves fast, then grow back when it settles. Drag and throw also work. Good for a
 * portfolio index, a case-study rail or any "browse many projects" row.
 *
 * How it moves
 * - Two positions in px: aimX, where input wants the row, and stripX, where it is drawn. Input only changes aimX.
 *   Every frame the remaining gap aimX - stripX is multiplied by exp(-dt / glide), with glide a time constant in ms
 *   (default 260; dt capped at 1/15 s), so the glide feels the same at any frame rate. stripX lands exactly on aimX
 *   once within 0.01 px. There is no fixed-duration tween.
 * - Wheel: the larger of deltaX / deltaY (line mode x 16, page mode x lane height) times wheelGain is added to aimX.
 * - Drag: after 3 px of travel, aimX and stripX move together with the pointer (no lag while held). Velocity in px/s is
 *   smoothed as v += (step / time - v) x 0.45. On release, if the last move was under 90 ms ago, aimX is pushed on by
 *   v x 0.25 s, so a flick throws the row.
 * - Shrink: speed = |stripX change| / dt in px/s, scaled by 396 / card width. Goal scale =
 *   1 - squash / 100 x (1 - exp(-speed / 3600)): a soft knee, no hard cap, so fast flicks approach squash percent
 *   smaller. The drawn scale follows the goal with its own 220 ms time constant, so it trails the speed a little and
 *   eases back to 1 when the row stops. Only visible cards are scaled.
 * - Loop: card i sits at i x pitch - stripX, wrapped modulo 8 x pitch, so the row is seamless in both directions. Only cards
 *   in view (plus 20 % of a card) get new transforms.
 * - The wheel covers exactly one lap: aimX is kept in 0..one lap for the wheel. At either end the wheel first rubber-bands
 *   the row past the end, by up to min(0.45 card width, 0.12 lane width) x (1 - exp(-push / 150)), which springs back
 *   160 ms after the last wheel event. After 300 px of push (reset after 1200 ms idle or a direction change) and once the
 *   row has settled, the page scrolls. A wheel gesture that moved the row is swallowed at the end until the wheel has
 *   been quiet for 250 ms. Dragging is not limited and can loop forever.
 * - Size: the lane is 336 x 150 px (max) with 15 % fade masks at both sides. Card width = lane height x 396 / 496,
 *   gap = lane height / 15. The row starts centred on the first card.
 *
 * Options
 *   params.glide      120..600 ms, default 260  time constant of the chase; higher glides longer
 *   params.wheelGain  1..3, default 2           wheel px to strip px
 *   params.squash     0..30, default 18         shrink in percent approached at high speed; 0 disables it
 *   reducedMotion     true / false / null       force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountHorizontalWheelStrip(element, {params: {...}, reducedMotion: null});
 *   fx.params                   copy of current params
 *   fx.setParams({squash: 10})  change params live
 *   fx.setPaused(true|false)    freeze / resume; input is ignored while paused and a running drag is released
 *   fx.reset()                  params back to defaults, the row glides back to the first card over
 *                               0.5 s (cubic-bezier(0.22, 1, 0.36, 1)) and the scale returns to 1
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:360px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountHorizontalWheelStrip(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Card faces: the item callback in mountHorizontalWheelStrip returns the HTML for card i (now a placeholder with a
 *   mark). Put images or video there. The count is the COUNT constant (8); keep enough cards to fill the lane twice or
 *   the wrap shows.
 * - Lane size via --ck-max and the .ck-lane height in effect.css; the 396 / 496 card ratio in layout().
 * - Colours, radius and the fade masks in effect.css. Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The exponential chase driven by a time constant. A CSS transition or a fixed tween loses the glide.
 * - During a drag aimX and stripX move together; only the release adds the 0.25 s throw. A lagging drag feels mushy.
 * - Scale from speed through the soft knee, trailing on its own 220 ms time constant. Tying it to the wheel delta or skipping the smoothing makes it flicker.
 * - The wrap math and writing transforms only to visible cards.
 * - Do not let a framework re-render the cards while the effect runs; it writes transforms to them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the rAF loop and listeners leak. In React StrictMode the mount runs twice; destroy
 *   in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountHorizontalWheelStrip on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The row is role="group" (roledescription "Horizontal strip"), each card an article labelled "Project 01".."Project 08".
 *   The row takes focus (tabindex 0; the stage shows an accent ring on keyboard focus only) and ArrowLeft / ArrowRight
 *   move it one card per press. The viewport keeps
 *   touch-action: pan-y, so vertical page scrolling still works on touch.
 * - With reduced motion: no glide, no squash, no throw, no rubber band, . The row jumps straight to the target.
 * - The rAF loop runs only while something moves: when the row has settled (target reached, squash
 *   back to 1, no drag or stretch) it stops, and the next wheel, drag, key or reset wakes it. It also stops when the tab
 *   is hidden, the stage is off screen or it is paused.
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
  const R = { mark, mix, smooth, clamp };

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
    { key: 'glide', type: 'range', default: 260, min: 120, max: 600, step: 10 },
    { key: 'wheelGain', type: 'range', default: 2, min: 1, max: 3, step: 0.25 },
    { key: 'squash', type: 'range', default: 18, min: 0, max: 30, step: 1 },
  ];

  // ---- the effect ----
  const COUNT = 8;
  const REST_PX = 0.01,
    MAX_STEP = 1 / 15;
  const SPEED_KNEE = 3600,
    SIZE_LAG = 220;
  const FLING_TIME = 0.25,
    FLING_WINDOW = 90;
  const remain = (dt, tau) => Math.exp((-dt * 1000) / Math.max(1, tau));
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('strip-stage');
    const tones = [0, 1, 3, 2, 0, 1, 2, 3],
      card = options.card || null;
    element.innerHTML =
      '<div class="strip-viewport"' +
      ' tabindex="0"' +
      ' role="group" aria-roledescription="Horizontal strip" aria-label="Card strip' +
      '. Scroll, drag, or use the left and right arrow keys.' +
      '"><div class="strip-track">' +
      Array.from(
        { length: COUNT },
        (_, i) =>
          '<article class="strip-item" aria-label="Project ' +
          String(i + 1).padStart(2, '0') +
          '"><div class="strip-wrap">' +
          (card.item ? card.item(i, { tone: tones[i], accent: i === 2 }) : '') +
          '</div></article>',
      ).join('') +
      '</div></div>';
    const viewport = element.querySelector('.strip-viewport'),
      items = [...element.querySelectorAll('.strip-item')],
      wraps = items.map((i) => i.querySelector('.strip-wrap')),
      counter = element.querySelector('.strip-count');
    let W = 1,
      H = 1,
      itemW = 1,
      pitch = 1,
      total = 1,
      pad = 0,
      lead = 1,
      speedUnit = 1,
      aimX = 0,
      stripX = 0,
      lastStripX = 0,
      sizeNow = 1,
      bounce = 0,
      bounceStep = null,
      drag = null,
      dragged = false,
      lastIndex = -1;
    const scales = new Array(COUNT).fill(1),
      visible = new Array(COUNT).fill(false);
    const wrap = (v) => {
      const span = total,
        back = lead * pitch;
      return ((((v + back) % span) + span) % span) - back;
    };
    function layout() {
      W = element.clientWidth;
      H = element.clientHeight;
      {
        itemW = Math.max(1, Math.round((H * 396) / 496));
        pitch = itemW + (card.gap > 0 ? Math.round(card.gap) : 10);
        total = pitch * COUNT;
        pad = Math.round((W - itemW) / 2);
        lead = Math.max(1, Math.ceil((pad + itemW) / pitch));
        speedUnit = 396 / itemW;
        items.forEach((item) => {
          item.style.width = itemW + 'px';
        });
        place(true);
        return;
      }
    }
    function place(all) {
      for (let i = 0; i < COUNT; i++) {
        const x = pad + wrap(i * pitch - stripX - bounce),
          show = x < W + itemW * 0.2 && x + itemW > -itemW * 0.2;
        if (all || show || visible[i]) items[i].style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
        visible[i] = show;
        const s = show ? sizeNow : 1;
        if (scales[i] !== s) {
          wraps[i].style.transform = s === 1 ? '' : 'scale(' + s.toFixed(4) + ')';
          scales[i] = s;
        }
      }
      const index = ((Math.round(stripX / pitch) % COUNT) + COUNT) % COUNT;
      if (index !== lastIndex) {
        lastIndex = index;
        if (counter) counter.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(COUNT).padStart(2, '0');
      }
    }
    api.on('resize', layout);
    api.on('params', () => api.wake());
    api.on('replay', () => {
      drag = null;
      aimX = stripX = lastStripX = 0;
      sizeNow = 1;
      place(true);
    });
    api.on('motion', (reduced) => {
      if (reduced) {
        stripX = aimX;
        sizeNow = 1;
        place(true);
      }
    });
    const nudge = (delta) => {
      if (api.paused) return;
      aimX += delta;
      if (api.reduced) {
        stripX = aimX;
        place(false);
      }
      api.wake();
    };
    api.listen(
      viewport,
      'wheel',
      (event) => {
        if (api.paused) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? H : 1;
        const dx = event.deltaX * unit,
          dy = event.deltaY * unit;
        nudge((Math.abs(dx) > Math.abs(dy) ? dx : dy) * api.params.wheelGain);
      },
      { passive: false },
    );
    api.listen(viewport, 'pointerdown', (event) => {
      if (event.button !== 0 || api.paused) return;
      drag = { id: event.pointerId, x: event.clientX, at: performance.now(), v: 0, moved: 0 };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging');
    });
    api.listen(viewport, 'pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const now = performance.now(),
        dx = event.clientX - drag.x,
        dt = Math.max(1, now - drag.at);
      drag.moved += Math.abs(dx);
      if (drag.moved < 3 && !dragged) return;
      dragged = true;
      aimX -= dx;
      stripX -= dx;
      drag.v += ((dx / dt) * 1000 - drag.v) * 0.45;
      drag.x = event.clientX;
      drag.at = now;
      place(false);
      api.wake();
    });
    const release = (event) => {
      if (!drag || (event && drag.id !== event.pointerId)) return;
      if (viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
      if (performance.now() - drag.at < FLING_WINDOW && !api.reduced) aimX -= drag.v * FLING_TIME;
      drag = null;
      viewport.classList.remove('is-dragging');
      setTimeout(() => {
        dragged = false;
      }, 0);
      if (api.reduced) {
        stripX = aimX;
        place(false);
      }
      api.wake();
    };
    api.listen(viewport, 'pointerup', release);
    api.listen(viewport, 'pointercancel', release);
    api.listen(viewport, 'keydown', (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        nudge(pitch);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        nudge(-pitch);
      }
    });
    api.on('pause', (value) => {
      if (value && drag) release();
    });
    api.on('destroy', () => {
      drag = null;
    });
    const RESTORE = 0.5;
    let back = null;
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
    function stepBack(dt, reduced) {
      back.t += dt;
      const u = reduced ? 1 : Math.min(1, back.t / RESTORE),
        e = outEase(u);
      stripX = aimX = R.mix(back.from, back.to, e);
      sizeNow = R.mix(back.scale, 1, e);
      if (u >= 1) {
        aimX = stripX = 0;
        sizeNow = 1;
        back = null;
      }
      lastStripX = stripX;
      place(true);
      element.dataset.phase = back ? 'gliding' : 'resting';
    }
    {
      const WHEEL_GAP = 250,
        gap = card.lap && card.wheelLatch ? (typeof card.wheelLatch === 'number' ? card.wheelLatch : WHEEL_GAP) : 0;
      let wheelAt = -Infinity,
        held = false;
      const PUSH_IDLE = 1200,
        push = card.lap && card.endPush ? (typeof card.endPush === 'number' ? card.endPush : 100) : 0;
      let pushed = 0,
        pushDir = 0,
        pushAt = -Infinity;
      const BOUNCE_K = 150,
        BOUNCE_IDLE = 1200,
        BOUNCE_HOLD = 160,
        need = card.lap && card.endBounce ? (typeof card.endBounce === 'number' ? card.endBounce : 300) : 0;
      let bounceGoal = 0;
      if (card.lap)
        api.listen(
          element,
          'wheel',
          (event) => {
            if (api.paused) return;
            const e = event;
            if (aimX < 0 || aimX > total) {
              const n = Math.floor(aimX / total) * total;
              aimX -= n;
              stripX -= n;
              lastStripX -= n;
            }
            const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? H : 1,
              dx = event.deltaX * unit,
              dy = event.deltaY * unit,
              d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
            if (gap && d) {
              const now = performance.now();
              if (now - wheelAt > gap) held = false;
              wheelAt = now;
            }
            if ((d > 0 && aimX >= total) || (d < 0 && aimX <= 0)) {
              event.stopPropagation();
              if (gap && d && held) {
                event.preventDefault();
                return;
              }
              if (need && d) {
                const now = performance.now();
                if (Math.sign(d) !== pushDir || now - pushAt > BOUNCE_IDLE) pushed = 0;
                pushDir = Math.sign(d);
                pushAt = now;
                if (back || pushed < need || Math.abs(aimX - stripX) > 4) {
                  pushed += Math.abs(d);
                  bounceGoal = api.reduced
                    ? 0
                    : pushDir * Math.min(itemW * 0.45, W * 0.12) * (1 - Math.exp(-pushed / BOUNCE_K));
                  api.wake();
                  e.preventDefault();
                  return;
                }
                bounceGoal = 0;
                return;
              }
              if (push && d) {
                const now = performance.now();
                if (Math.sign(d) !== pushDir || now - pushAt > PUSH_IDLE) pushed = 0;
                pushDir = Math.sign(d);
                pushAt = now;
                if (!(!back && Math.abs(aimX - stripX) <= 1 && Math.abs(1 - sizeNow) <= 0.01)) {
                  pushed = 0;
                  e.preventDefault();
                  return;
                }
                if (pushed < push) {
                  pushed += Math.abs(d);
                  e.preventDefault();
                  return;
                }
              }
              return;
            }
            if (gap && d) held = true;
            if (d) {
              pushed = 0;
              bounceGoal = 0;
            }
          },
          { capture: true },
        );
      api.listen(viewport, 'wheel', () => {
        if (api.paused) return;
        back = null;
        if (card.lap) aimX = R.clamp(aimX, 0, total);
        if (api.reduced) {
          stripX = aimX;
          place(false);
        }
        if (card.touched) card.touched();
      });
      api.listen(viewport, 'pointerdown', (event) => {
        if (event.button !== 0 || api.paused) return;
        back = null;
      });
      api.listen(viewport, 'pointermove', (event) => {
        if (drag && drag.id === event.pointerId && dragged && !api.paused && card.touched) card.touched();
      });
      api.listen(viewport, 'keydown', (event) => {
        if (api.paused || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
        back = null;
        if (card.touched) card.touched();
      });
      api.on('replay', () => {
        back = null;
        bounce = bounceGoal = 0;
      });
      if (need)
        bounceStep = (dt) => {
          const goal = performance.now() - pushAt < BOUNCE_HOLD ? bounceGoal : (bounceGoal = 0);
          if (bounce === goal) return false;
          bounce += (goal - bounce) * (1 - Math.exp(-dt * (goal ? 22 : 9)));
          if (Math.abs(goal - bounce) < 0.1) bounce = goal;
          place(false);
          return true;
        };
      api.restore = () => {
        bounce = bounceGoal = 0;
        if (drag) release();
        if (api.reduced) {
          back = null;
          aimX = stripX = lastStripX = 0;
          sizeNow = 1;
          place(true);
          return;
        }
        back = { t: 0, from: stripX, to: Math.round(stripX / total) * total, scale: sizeNow };
        aimX = stripX;
        api.wake();
      };
    }
    function settle(dt, params) {
      const step = Math.min(dt, MAX_STEP),
        left = aimX - stripX,
        sizeWas = sizeNow;
      if (Math.abs(left) <= REST_PX) stripX = aimX;
      else if (dt > 0) stripX = aimX - left * remain(step, params.glide);
      const travelled = stripX - lastStripX;
      if (dt > 0 && (travelled !== 0 || sizeNow !== 1)) {
        const speed = (Math.abs(travelled) / step) * speedUnit,
          want = 1 - (params.squash / 100) * (1 - Math.exp(-speed / SPEED_KNEE));
        sizeNow = want + (sizeNow - want) * remain(step, SIZE_LAG);
        if (want === 1 && 1 - sizeNow <= 1e-4) sizeNow = 1;
      }
      if (dt > 0 || false) lastStripX = stripX;
      return { moved: travelled !== 0, resized: sizeNow !== sizeWas };
    }
    api.frame(({ dt, time, params, reduced }) => {
      if (back) {
        stepBack(dt, reduced);
        return true;
      }
      const bouncing = !!bounceStep && bounceStep(dt);
      if (reduced) {
        stripX = aimX;
        sizeNow = 1;
        place(false);
        return false;
      }
      const { moved, resized } = settle(dt, params);
      if (moved || resized) place(false);
      element.dataset.phase = drag ? 'dragging' : moved ? 'gliding' : 'resting';
      return bouncing || aimX !== stripX || moved || sizeNow !== 1 || !!drag;
    });
    const status = api.status;
    api.status = () => ({
      ...status(),
      target: aimX,
      current: stripX,
      scale: sizeNow,
      pitch,
      index: lastIndex,
      dragging: !!drag,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountHorizontalWheelStrip(element, options) {
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
    element.classList.add('horizontal-wheel-strip');
    element.innerHTML = '<div class="fx-board"><div class="ck-lane" data-strip></div></div>';
    const stage = element,
      board = stage.querySelector('.fx-board'),
      lane = board.querySelector('[data-strip]');
    const tones = [0, 1, 0, 2, 0, 1, 0, 2];
    let ox = 0,
      oy = 0;
    const fit = () => {
      ox = lane.offsetLeft;
      oy = lane.offsetTop;
      board.style.setProperty('--fx-k', (lane.clientHeight / 150).toFixed(4));
    };
    fit();
    const observer0 = new ResizeObserver(fit);
    observer0.observe(lane);
    const inst = mount(lane, {
      params: options.params,
      card: {
        interactive: true,
        lap: true,
        wheelLatch: true,
        endBounce: true,
        get gap() {
          return lane.clientHeight / 15;
        },
        item: (i, info) => media({ tone: tones[i], glyph: i, accent: info.accent }),
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
  global.mountHorizontalWheelStrip = mountHorizontalWheelStrip;
  if (typeof module === 'object' && module.exports) module.exports = mountHorizontalWheelStrip;
})(typeof window !== 'undefined' ? window : this);
