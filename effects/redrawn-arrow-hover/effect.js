/*
 * Redrawn Arrow
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Three round arrow buttons (previous, next, open). On hover the line arrow is pushed forward and wipes itself out, then a
 * fresh arrow is drawn in its place: shaft first, barbs a beat later. Good for carousel controls, "next project"
 * links and external-link corners.
 *
 * How it moves
 * - All CSS on an inline SVG. JS only toggles .is-on on the hovered button and writes timing variables.
 * - The arrow is a 24 x 12 viewBox: shaft M1 6 H23, two barbs starting at the tip (23,6) and ending at (18,1.5) and
 *   (18,10.5). Every path has pathLength="1" and stroke-dasharray 1, so a stroke-dashoffset from 0 to 1 is "fully
 *   drawn" to "gone" whatever the arrow size. "left" is the same arrow mirrored, "up" is rotated -45 deg.
 * - Each button holds two copies of the arrow: a spent one (visible at rest) and a fresh one (hidden at rest).
 * - Hover, spent copy: over params.erase ms, on cubic-bezier(0.64, 0, 0.78, 0) (the library ease-out played
 *   backwards, so it accelerates away), it is pushed 8 units toward where it points, the shaft is wiped from the tail
 *   (offset 0 to -1) and the barbs fold into the tip (0 to 1).
 * - Hover, fresh copy: the shaft draws tail to tip over params.draw ms on ease-out cubic-bezier(0.22, 1, 0.36, 1),
 *   starting at max(0, erase - 60) ms, so it overlaps the end of the wipe and there is never an empty frame. The barbs
 *   draw out from the tip over 0.75 x draw, starting params.lag ms after the shaft. Defaults: erase 260, shaft from
 *   200 to 640 ms, barbs from 400 to 730 ms.
 * - Leave: .is-on is removed and the arrow snaps back to its resting copy with no animation. Hovering again replays
 *   the whole sequence.
 * - Size: button diameter = floor(max(56, min(120, height x 0.28, available width / (3 + 2k)))) px, gap = size x k
 *   (k = 0.6 on wide stages, 0.4 at 760 px and below). Arrow width is 2 em at a font size of 0.35 x the diameter.
 *
 * Options
 *   params.erase   100..800 ms, default 260    push-and-wipe duration
 *   params.draw    200..1400 ms, default 440   shaft draw duration; barbs take 0.75 x this
 *   params.lag     0..600 ms, default 200      delay of the barbs after the shaft starts
 *   reducedMotion  true / false / null         force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountRedrawnArrow(element, {params: {...}, reducedMotion: null});
 *   fx.params                 copy of current params
 *   fx.setParams({draw: 800}) change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)  pauses running CSS animations (animation-play-state) and ignores new hovers
 *   fx.reset()                params back to defaults, all arrows at rest
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()              removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountRedrawnArrow(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Button labels (Previous, Next, Open) and what the buttons do; they are plain <button type="button"> with no
 *   action attached.
 * - The layout: the row is centred. Size and gap via --rd-size and --rd-gap (set by layout() in mountRedrawnArrow).
 * - Colours, stroke width (stroke-width 1 in viewBox units), button background and shadow in effect.css.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - pathLength="1" with dasharray 1; without it every path needs its own measured length.
 * - Accelerating wipe and decelerating draw, and the new shaft starting 60 ms before the wipe ends, so the old arrow
 *   is never fully gone before the new one appears.
 * - The barbs starting after the shaft (the lag); drawing everything at once reads as a fade.
 * - The two-copy structure. Animating one path out and back in leaves a gap where nothing is visible.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - The visual part is pure CSS: copy the arrow SVG (both copies) and the .is-on rules, and toggle .is-on yourself or
 *   rewrite the selectors with :hover / :focus-visible.
 * - Using the JS: mount once on a ref after the element is in the DOM; call fx.destroy() on unmount. In React
 *   StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountRedrawnArrow on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Each button has an aria-label (Previous, Next, Open); the SVGs are aria-hidden. Keyboard focus (focus-visible)
 *   plays the redraw and shows a focus ring; Enter and Space press the button. No other keyboard behaviour.
 * - Touch: a tap replays the redraw and keeps that button in its hovered state until you tap elsewhere.
 * - With reduced motion: the entering copy is hidden and nothing animates; the arrow stays static.
 *
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
    { key: 'erase', type: 'range', default: 260, min: 100, max: 800, step: 10 },
    { key: 'draw', type: 'range', default: 440, min: 200, max: 1400, step: 10 },
    { key: 'lag', type: 'range', default: 200, min: 0, max: 600, step: 10 },
  ];

  // ---- the effect ----
  const STROKES =
    '<path class="ra-stem" pathLength="1" d="M1 6H23"/><path class="ra-hook" pathLength="1" d="M23 6L18 1.5"/><path class="ra-hook" pathLength="1" d="M23 6L18 10.5"/>';
  const arrow = (dir) =>
    '<svg class="rd-arrow" data-dir="' +
    dir +
    '" viewBox="0 0 24 12" aria-hidden="true">' +
    ['ra-spent', 'ra-fresh'].map((c) => '<g class="' + c + '">' + STROKES + '</g>').join('') +
    '</svg>';
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('rd-stage');
    const card = options.card || null,
      trio = !!card.trio;
    if (trio) {
      const btn = (dir, label) =>
        '<button type="button" class="rd-h rd-ico rd-btn" data-k="' +
        dir +
        '" aria-label="' +
        label +
        '">' +
        arrow(dir) +
        '</button>';
      element.innerHTML =
        '<div class="rd-trio">' +
        btn('left', 'Previous') +
        btn('right', 'Next') +
        btn('up', 'Open') +
        '</div><p class="cr-sr rd-live" aria-live="polite" hidden></p>';
    } else {
      const btn = (dir, label) =>
        '<button type="button" class="rd-h rd-ico rd-btn ck-pill" data-k="' +
        dir +
        '" aria-label="' +
        label +
        '">' +
        arrow(dir) +
        '</button>';
      element.innerHTML =
        '<div class="rd-set">' +
        btn('left', 'Previous') +
        btn('right', 'Next') +
        btn('up', 'Open') +
        '</div><p class="cr-sr rd-live" aria-live="polite" hidden></p>';
    }
    const hs = [...element.querySelectorAll('.rd-h')],
      live = element.querySelector('.rd-live');
    let stuck = null,
      lastType = 'mouse';
    function apply() {
      const { erase, draw, lag } = api.params,
        stemAt = Math.max(0, erase - 60),
        ms = (v) => Math.round(v) + 'ms';
      const vars = {
        '--ra-out': erase,
        '--ra-stem': draw,
        '--ra-hook': draw * 0.75,
        '--ra-at': stemAt,
        '--ra-hook-at': stemAt + lag,
      };
      for (const k in vars) element.style.setProperty(k, ms(vars[k]));
    }
    const setOn = (el, on) => el.classList.toggle('is-on', on);
    function replayOn(el) {
      el.classList.remove('is-on');
      el.classList.add('is-on');
    }
    hs.forEach((el) => {
      api.listen(el, 'pointerenter', (e) => {
        if (e.pointerType === 'touch' || api.paused) return;
        setOn(el, true);
      });
      api.listen(el, 'pointerleave', (e) => {
        if (e.pointerType === 'touch') return;
        setOn(el, false);
      });
      api.listen(el, 'focus', () => {
        if (el.matches(':focus-visible')) {
          setOn(el, true);
        }
      });
      api.listen(el, 'blur', () => {
        if (el !== stuck) setOn(el, false);
      });
      api.listen(el, 'click', (e) => {
        if (el.tagName === 'A') e.preventDefault();
        if (api.paused) return;
        live.textContent = (el.getAttribute('aria-label') || el.textContent || '').trim() + ' clicked.';
        if (lastType === 'touch') {
          if (stuck && stuck !== el) setOn(stuck, false);
          stuck = el;
          replayOn(el);
        }
      });
    });
    {
      api.listen(
        element,
        'pointerdown',
        (e) => {
          lastType = e.pointerType;
          if (stuck && !stuck.contains(e.target)) {
            setOn(stuck, false);
            stuck = null;
          }
        },
        true,
      );
    }
    function reset() {
      hs.forEach((el) => setOn(el, false));
      stuck = null;
      live.textContent = '';
    }
    api.on('params', apply);
    api.on('replay', () => {
      reset();
    });
    api.restore = () => {
      reset();
    };
    api.frame(({ time, reduced }) => {
      return false;
    });
    apply();
    const status = api.status;
    api.status = () => ({
      ...status(),
      on: hs.filter((el) => el.classList.contains('is-on')).map((el) => el.dataset.k),
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountRedrawnArrow(element, options) {
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
    element.classList.add('redrawn-arrow-hover');
    element.innerHTML = '<div class="fx-board" data-rd></div>';
    const listeners = new AbortController();
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-rd]');
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        left = panelZone(stage, 3).right,
        desk = !matchMedia('(max-width: 760px)').matches,
        k = desk ? 0.6 : 0.4,
        pad = desk ? 40 : 28;
      const size = Math.floor(Math.max(56, Math.min(120, H * 0.28, (W - left - 2 * pad) / (3 + 2 * k)))),
        s = board.style;
      s.setProperty('--rd-left', left + 'px');
      s.setProperty('--rd-size', size + 'px');
      s.setProperty('--rd-gap', Math.round(size * k) + 'px');
    }
    const inst = mount(board, { params: options.params, card: { trio: true, interactive: true, introDelay: 3 } });
    layout();
    const observer0 = new ResizeObserver(layout);
    observer0.observe(stage);
    matchMedia('(max-width:760px)').addEventListener('change', layout, { signal: listeners.signal });

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
  global.mountRedrawnArrow = mountRedrawnArrow;
  if (typeof module === 'object' && module.exports) module.exports = mountRedrawnArrow;
})(typeof window !== 'undefined' ? window : this);
