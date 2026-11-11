/*
 * Inertia Drag
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Four small widget tiles (weather, now playing, a focus switch, a message) on a dotted tray. Pick one up and toss it:
 * it glides on after you let go, straightens itself and stays where it lands. Good as a playful hero, an empty state
 * or a "try me" corner on a product page.
 *
 * How it moves
 * - While held, a tile follows the pointer (pointer capture, so it keeps tracking outside the tile).
 * - Tilt: each pointermove tilts the tile by 0.7 degrees per pixel of horizontal step, capped at params.tilt. A fast
 *   flick tilts more than a slow drag, so the tilt reads as speed. Tilt and speed are measured relative to a 144.5 px
 *   reference tile, so a small tile tilts as much as a big one for the same gesture.
 * - Release: the tile keeps the velocity of the last pointermove (step / time, time floored at 12 ms), clamped to
 *   1800 px/s at the reference size. Each frame: position += v * dt, then v *= exp(-resistance * dt). Below 0.1 px/s it
 *   stops. This is frame-rate independent friction, not a tween.
 * - Straightening: the angle chases its target with exponential damping at rate 8 (about half a second). The target is
 *   the drag tilt while held and 0 after release.
 * - No spring back. Tiles are clamped 4 px inside the tray; hitting an edge zeroes that velocity axis.
 * - Grabbed tile: z-index on top, its block gets data-lifted (shadow grows, scale 1.03 over 240 ms).
 * - Layout, 520 px and wider: one row centred, tiles 1.5 tile widths apart, tile height = width x 1.3125. Narrower:
 *   2 x 2 block near the bottom. On resize, positions are rescaled proportionally and re-clamped.
 *
 * Options
 *   params.resistance  3..12, default 7      velocity decay per second; higher stops sooner
 *   params.tilt        0..24, default 12     max tilt in degrees while dragging; 0 disables tilt
 *   params.glyphScale  75..115, default 100  tile size in percent
 *   reducedMotion      true / false / null   force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountInertiaDrag(element, {params: {...}, reducedMotion: null});
 *   fx.params                  copy of current params
 *   fx.setParams({tilt: 20})   change params live
 *   fx.setPaused(true|false)   freeze / resume
 *   fx.reset()                 params back to defaults, every tile glides home (0.5 s ease-out)
 *   fx.setReducedMotion(bool)
 *   fx.destroy()               removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountInertiaDrag(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Tile content: the THINGS array (HTML strings) and the matching LABELS (accessible names). Content is laid out in
 *   px of a 70 px wide tile and scales with the tile, so keep that design size.
 * - Colours, radius, shadow and the dot grid via the CSS variables and rules in effect.css.
 * - Tray height, params within their ranges.
 *
 * Do not change (the feel breaks)
 * - 0.7 deg/px tilt, the 1800 px/s clamp, the 12 ms dt floor, the exponential decay and the rate-8 straightening.
 *   Replacing them with CSS transitions or a fixed-duration tween kills the throw.
 * - Velocity must come from the last pointermove, not an average over the whole drag.
 * - Keep touch-action: none on tiles (the tray keeps pan-y so the page still scrolls on touch) and pointer capture.
 * - Do not let a framework re-render the tile elements while the effect runs; it writes transforms to them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the rAF loop and listeners leak. In React StrictMode the mount runs twice; destroy
 *   in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams, not a remount.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountInertiaDrag on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Each tile is a focusable role="button" labelled with its content (for example "Weather, 24 degrees, Lisbon. Drag
 *   or use arrow keys to move..."), with a focus ring on keyboard focus. Tab selects a tile, the arrow keys move it
 *   10 px (Shift: 28 px; scaled with the tile size), Home puts it back in its slot; a polite live region says
 *   "Weather moved." / "Weather is back in place.".. Keep essential content out of it.
 * - With reduced motion: no glide, no tilt, no lift transition; the "now playing" tile rests at the
 *   upper-right spot. Dragging still moves tiles, they just stop where released.
 * - The rAF loop runs only while something moves: when every tile is at rest (no drag, glide,
 *   tilt or reset glide) it stops; the next press, drag, key or reset wakes it. It also stops when the tab is hidden,
 *   the tray is off screen or it is paused.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const damp = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
  const R = { clamp, mix, smooth, easeOut, damp };

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
    { key: 'resistance', type: 'range', default: 7, min: 3, max: 12, step: 0.5 },
    { key: 'tilt', type: 'range', default: 12, min: 0, max: 24, step: 1 },
    { key: 'glyphScale', type: 'range', default: 100, min: 75, max: 115, step: 1 },
  ];

  // ---- the effect ----
  const MOON =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/></svg>',
    THINGS = [
      '<span class="glyph-thing glyph-weather"><svg class="glyph-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><b>24°</b><small>Lisbon</small></span>',
      '<span class="glyph-thing glyph-player"><span class="glyph-cover"><i></i></span><span class="glyph-controls"><i class="glyph-play"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 4.6v6.8l5.4-3.4z" fill="currentColor"/></svg></i><i class="glyph-bar"><i></i></i></span></span>',
      '<span class="glyph-thing glyph-focus"><i class="glyph-disc">' +
        MOON +
        '</i><b>Focus</b><i class="glyph-switch"></i></span>',
      '<span class="glyph-thing glyph-message"><i class="glyph-disc">A</i><b>Ana</b><small>On my way</small></span>',
    ],
    LABELS = ['Weather, 24 degrees, Lisbon', 'Now playing', 'Focus, off', 'Message from Ana: On my way'],
    SHORT = ['Weather', 'Now playing', 'Focus', 'Message'];
  let helpCount = 0;
  function mount(element, options) {
    const helpId = 'glyph-help-' + ++helpCount;
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('glyph-stage');
    const cardOpt = options.card || null,
      things = options.things ? THINGS : null;
    if (things) element.classList.add('has-things');
    const keys = !!(things && true);
    element.innerHTML =
      '<div class="glyph-field"' +
      (things ? '' : ' aria-hidden="true"') +
      '>' +
      [0, 1, 2, 3]
        .map(
          (i) =>
            '<div class="play-glyph" data-glyph="' +
            i +
            '"' +
            (keys
              ? ' role="button" tabindex="0" aria-label="' +
                LABELS[i] +
                '. Drag or use arrow keys to move, Shift for bigger steps, Home to put it back."'
              : things
                ? ' role="img" aria-label="' + LABELS[i] + '"'
                : '') +
            '>' +
            (cardOpt.item ? (things ? cardOpt.item(i, things[i]) : cardOpt.item(i)) : '') +
            '</div>',
        )
        .join('') +
      '</div>' +
      (keys ? '<p class="cr-sr glyph-announcement" aria-live="polite"></p>' : '');
    const field = element.querySelector('.glyph-field'),
      buttons = [...element.querySelectorAll('.play-glyph')],
      announcement = element.querySelector('.glyph-announcement');
    let letters = [],
      fieldW = 1,
      fieldH = 1,
      drag = null;
    let unit = 1,
      homes = [],
      spot = [0, 0],
      leg = null;
    function bound(l) {
      const nx = R.clamp(l.x, l.w * 0.5 + 4, fieldW - l.w * 0.5 - 4),
        ny = R.clamp(l.y, l.h * 0.5 + 4, fieldH - l.h * 0.5 - 4);
      if (nx !== l.x) l.vx = 0;
      if (ny !== l.y) l.vy = 0;
      l.x = nx;
      l.y = ny;
    }
    function layout(reset = false) {
      const oldW = fieldW,
        oldH = fieldH;
      fieldW = field.clientWidth;
      fieldH = field.clientHeight;
      const custom = cardOpt.layout ? cardOpt.layout(fieldW, fieldH, api.params.glyphScale / 100) : null;
      const fontSize = custom ? custom.size : (Math.min(fieldW * 0.224, fieldH * 0.78) * api.params.glyphScale) / 100;
      {
        unit = 144.5 / (fontSize * 0.8);
        homes = custom ? custom.homes : [0, 1, 2, 3].map((i) => [fieldW * (0.16 + i * 0.226), fieldH * 0.5]);
        spot = custom ? custom.spot : [fieldW * 0.76, fontSize * 1.05 * 0.5 + 8];
      }
      letters = buttons.map((button, i) => {
        const homeX = homes[i][0],
          homeY = homes[i][1];
        const old = letters[i],
          l = {
            x: reset || !old ? homeX : (old.x / oldW) * fieldW,
            y: reset || !old ? homeY : (old.y / oldH) * fieldH,
            vx: reset ? 0 : old?.vx || 0,
            vy: reset ? 0 : old?.vy || 0,
            angle: reset ? 0 : old?.angle || 0,
            targetAngle: 0,
            w: fontSize * 0.8,
            h: fontSize * 1.05,
            homeX,
            homeY,
          };
        button.style.fontSize = fontSize + 'px';
        button.style.width = l.w + 'px';
        button.style.height = l.h + 'px';
        bound(l);
        return l;
      });
    }
    api.on('resize', () => layout());
    api.on('params', () => layout());
    api.on('replay', () => {
      release();
      layout(true);
      leg = null;
      if (announcement) announcement.textContent = 'Shapes are back in place.';
    });
    function grab(index, x, y, now, rect, pointerId) {
      const l = letters[index];
      drag = {
        index,
        pointerId,
        offsetX: x - rect.left - l.x,
        offsetY: y - rect.top - l.y,
        lastX: x,
        lastY: y,
        at: now,
        rect,
      };
      l.vx = l.vy = 0;
    }
    function raise(index) {
      const button = buttons[index];
      button.classList.add('is-grabbed');
      button.style.zIndex = '6';
      buttons.filter((b) => b !== button).forEach((b) => (b.style.zIndex = '3'));
      if (cardOpt.lift) cardOpt.lift(index, true);
    }
    function dragTo(x, y, now) {
      const l = letters[drag.index],
        dt = Math.max(0.012, (now - drag.at) / 1000),
        dx = x - drag.lastX,
        dy = y - drag.lastY;
      l.x = x - drag.rect.left - drag.offsetX;
      l.y = y - drag.rect.top - drag.offsetY;
      l.vx = api.reduced ? 0 : R.clamp(dx / dt, -1800 / unit, 1800 / unit);
      l.vy = api.reduced ? 0 : R.clamp(dy / dt, -1800 / unit, 1800 / unit);
      l.targetAngle = api.reduced ? 0 : R.clamp(dx * unit * 0.7, -api.params.tilt, api.params.tilt);
      drag.lastX = x;
      drag.lastY = y;
      drag.at = now;
      bound(l);
    }
    function drop() {
      const index = drag.index,
        b = buttons[index];
      letters[index].targetAngle = 0;
      b.classList.remove('is-grabbed');
      if (cardOpt.lift) cardOpt.lift(index, false);
      drag = null;
    }
    function release() {
      if (!drag) return;
      const b = buttons[drag.index];
      if (b.hasPointerCapture(drag.pointerId)) b.releasePointerCapture(drag.pointerId);
      drop();
      api.wake();
    }
    buttons.forEach((button, index) => {
      api.listen(button, 'pointerdown', (event) => {
        if (event.button !== 0 || api.paused) return;
        const r = field.getBoundingClientRect();
        grab(index, event.clientX, event.clientY, performance.now(), r, event.pointerId);
        button.setPointerCapture(event.pointerId);
        raise(index);
        api.wake();
      });
      api.listen(button, 'pointermove', (event) => {
        if (!drag || drag.index !== index || drag.pointerId !== event.pointerId || api.paused) return;
        dragTo(event.clientX, event.clientY, performance.now());
        api.paint();
        api.wake();
      });
      api.listen(button, 'pointerup', release);
      api.listen(button, 'pointercancel', release);
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
    {
      buttons.forEach((button, index) => {
        api.listen(button, 'pointerdown', () => {
          if (back && drag && drag.index === index) back.from[index] = null;
        });
        api.listen(button, 'pointermove', (event) => {
          if (drag && drag.index === index && drag.pointerId === event.pointerId && !api.paused && cardOpt.touched)
            cardOpt.touched();
        });
      });
      api.restore = () => {
        release();
        back = { t: 0, from: letters.map((l) => [l.x, l.y]) };
        letters.forEach((l) => {
          l.vx = l.vy = 0;
          l.targetAngle = 0;
        });
        api.paint();
        api.wake();
      };
    }
    if (keys)
      buttons.forEach((button, index) => {
        api.listen(button, 'keydown', (event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key) || api.paused) return;
          event.preventDefault();
          if (drag && drag.index === index) release();
          if (back) back.from[index] = null;
          const l = letters[index],
            step = (event.shiftKey ? 28 : 10) / unit;
          if (event.key === 'Home') {
            l.x = l.homeX;
            l.y = l.homeY;
          } else {
            l.x += event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
            l.y += event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
          }
          l.vx = l.vy = 0;
          l.targetAngle = 0;
          bound(l);
          api.paint();
          api.wake();
          announcement.textContent = SHORT[index] + (event.key === 'Home' ? ' is back in place.' : ' moved.');
          if (cardOpt.touched) cardOpt.touched();
        });
      });
    function stepBack(dt, reduced) {
      back.t += dt;
      const u = reduced ? 1 : Math.min(1, back.t / RESTORE),
        e = outEase(u);
      letters.forEach((l, i) => {
        const f = back.from[i];
        if (!f) return;
        const to = reduced && i === 1 ? spot : homes[i];
        l.x = R.mix(f[0], to[0], e);
        l.y = R.mix(f[1], to[1], e);
        l.vx = l.vy = 0;
      });
      if (u >= 1) {
        back = null;
        buttons.forEach((b) => {
          b.style.zIndex = '';
        });
      }
    }
    api.on('motion', () => {
      release();
      leg = null;
      letters.forEach((l) => {
        l.vx = l.vy = l.angle = l.targetAngle = 0;
      });
    });
    api.on('destroy', release);
    api.frame(({ dt, time, params, reduced }) => {
      if (!letters.length) layout(true);
      let moving = false;
      if (back) stepBack(dt, reduced);
      letters.forEach((l, i) => {
        if ((!drag || drag.index !== i) && true) {
          if (!reduced) {
            l.x += l.vx * dt;
            l.y += l.vy * dt;
            l.vx *= Math.exp(-params.resistance * dt);
            l.vy *= Math.exp(-params.resistance * dt);
          }
          l.targetAngle = 0;
        }
        if (reduced) l.angle = 0;
        else l.angle = R.damp(l.angle, l.targetAngle, 8, dt);
        if (Math.abs(l.vx) + Math.abs(l.vy) < 0.1) l.vx = l.vy = 0;
        if (Math.abs(l.angle) < 0.01 && l.targetAngle === 0) l.angle = 0;
        bound(l);
        buttons[i].style.transform =
          'translate3d(' + (l.x - l.w / 2) + 'px,' + (l.y - l.h / 2) + 'px,0) rotate(' + l.angle + 'deg)';
        moving = moving || Math.abs(l.vx) + Math.abs(l.vy) + Math.abs(l.angle - l.targetAngle) > 0.01;
      });
      element.dataset.phase = drag || false ? 'dragging' : moving ? 'settling' : 'resting';
      return moving || !!drag || !!back;
    });
    const status = api.status;
    api.status = () => ({
      ...status(),
      dragging: drag?.index ?? null,
      letters: letters.map((l) => ({ x: l.x, y: l.y, vx: l.vx, vy: l.vy, angle: l.angle, w: l.w, h: l.h })),
      bounds: { width: fieldW, height: fieldH },
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountInertiaDrag(element, options) {
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
    element.classList.add('inertia-drag');
    element.innerHTML = '<div class="fx-board" data-glyph-board></div>';
    const stage = element,
      board = stage.querySelector('[data-glyph-board]');
    const F = 70 / 51.2;
    function layout(W, H, k) {
      k = k || 1;
      const pad = 16;
      if (W < 520) {
        const w = Math.max(60, Math.min(W / 4.1, H / 5.2, 96)) * k,
          h = w * 1.3125,
          gx = w * 0.78,
          gy = h * 0.62,
          cx = W / 2,
          cy = H - pad - h * 1.62;
        const homes = [
          [cx + gx, cy - gy],
          [cx - gx, cy - gy],
          [cx - gx, cy + gy],
          [cx + gx, cy + gy],
        ];
        return { size: w / 0.8, homes, spot: [W - w * 0.5 - pad - 8, h * 0.5 + pad + 18] };
      }
      const w =
          Math.min(
            Math.max(64, Math.min(W / 9.6, H / 4.8, 112)) * F,
            (W - pad * 2) / 6.4,
            (H * 0.62 - pad * 2 - 12) / 2.17,
          ) * k,
        h = w * 1.3125,
        s = w * 1.5,
        cx = W / 2;
      const cy = Math.min(H - pad - h * 0.5, Math.max(H * 0.62, h * 1.5 + pad * 2 + 24));
      const homes = [0, 1, 2, 3].map((i) => [cx + (i - 1.5) * s, cy]);
      return {
        size: w / 0.8,
        homes,
        spot: [Math.min(W - w * 0.5 - pad * 3, cx + s * 2.9), Math.max(h * 0.5 + pad * 2, cy - h * 1.85)],
      };
    }
    let faces = [];
    const inst = mount(board, {
      params: options.params,
      things: true,
      card: {
        interactive: true,
        layout,
        item: (i, thing) => '<div class="glyph-block">' + thing + '</div>',
        lift: (i, on) => {
          if (faces[i]) faces[i].toggleAttribute('data-lifted', on);
        },
      },
    });
    faces = [...board.querySelectorAll('.glyph-block')];

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
  global.mountInertiaDrag = mountInertiaDrag;
  if (typeof module === 'object' && module.exports) module.exports = mountInertiaDrag;
})(typeof window !== 'undefined' ? window : this);
