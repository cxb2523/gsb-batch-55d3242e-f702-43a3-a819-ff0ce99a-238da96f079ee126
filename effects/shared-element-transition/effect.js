/*
 * Shared Element Transition
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Three rounded thumbnails in a row. Click one and it grows in place into the large detail image while the other two
 * fade out; click again and it shrinks back into its slot. A single-page take on the list-to-detail shared element
 * transition, good for portfolios, product grids and galleries.
 *
 * How it moves
 * - Everything happens inside one box with a 336:260 aspect ratio, centred on the stage: height min(stage height - 80,
 *   520), narrowed to stage width - 64 (32 at 760 px and below) if needed. All positions are fractions of the box.
 * - List: thumbnails are 27% of the box wide and 50% high, at x = 5.5%, 36.5%, 67.5%, y = 25%.
 * - Detail: the selected one moves to (14%, 16%) and scales to 72% x 68% of the box. Others fade to opacity 0.
 * - It is one transform (translate + scale) on the thumbnail, eased with 1 - (1 - t)^4 over params.duration.
 *   The mark inside is counter-scaled so it never stretches.
 * - Corners: border-radius goes from params.roundness % (list) to a fixed 24 px (detail), corrected for the scale so
 *   the corner stays round mid-flight.
 * - Clicks: on a resting thumbnail it grows; anywhere while one is open (or opening) it shrinks; on the shrinking one it
 *   grows again; on another thumbnail that was still visible when pressed, the open one shrinks and then the clicked one
 *   grows. Enter / Space on a focused thumbnail does the same.
 * - The box's data-phase attribute is "list", "transition" or "detail".
 *
 * Options
 *   params.duration   500..1600, default 700   grow / shrink time in ms
 *   params.roundness  0..50, default 42        corner radius of the list thumbnails in percent (detail is always 24 px)
 *   reducedMotion     true / false / null      force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountSharedElementTransition(element, {params: {duration: 900}, reducedMotion: null});
 *   fx.params                     copy of current params
 *   fx.setParams({roundness: 20}) change params live (next frame)
 *   fx.setPaused(true|false)      freeze / resume
 *   fx.reset()                    params back to defaults, ; an open image shrinks back to the list
 *                                 over 0.5 s (with reduced motion it jumps)
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                  removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountSharedElementTransition(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Thumbnail content: the item passed in the mount glue (a white card with a mark). Any HTML works; the rounding is
 *   applied to its first child. Keep content that tolerates a non-uniform scale or counter-scale it like the mark.
 * - The list / detail fractions (5.5%, 31% step, 25%; 14%, 16%, 72% x 68%), the 24 px detail radius, the box ratio.
 * - Colours, shadows and hover via effect.css.
 *
 * Do not change (the feel breaks)
 * - One element travels. Replacing it with a fade between two separate elements loses the shared-element read.
 * - The radius correction for scale; without it corners go oval mid-flight.
 * - The 1 - (1 - t)^4 ease (fast departure, soft landing).
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Let the effect own its children; push changes through fx.setParams, not a remount.
 * - For a real page-to-page version, use the View Transitions API with a shared view-transition-name on the image;
 *   this file is the in-page version only.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Thumbnails are role="button", focusable, labelled "Project 01" to "Project 03"; Enter and Space open and close.
 * - With reduced motion: clicks switch between list and detail at once.
 * - The loop stops when the tab is hidden, the effect is off screen or it is paused.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const R = { mix };

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
    { key: 'duration', type: 'range', default: 700, min: 500, max: 1600, step: 50 },
    { key: 'roundness', type: 'range', default: 42, min: 0, max: 50, step: 1 },
  ];

  // ---- the effect ----
  function mount(element, options) {
    const api = scope(element, CONTROLS, options),
      cardOpt = options.card;
    element.classList.add('shared-stage');
    element.innerHTML = [0, 1, 2]
      .map((i) => '<div class="shared-preview-art" data-preview-art="' + i + '">' + cardOpt.item(i) + '</div>')
      .join('');
    const art = [...element.querySelectorAll('.shared-preview-art')],
      round = art.map((a) => a.firstElementChild);
    let progress = 0,
      w = 1,
      h = 1,
      cardW = 1,
      cardH = 1;
    let sel = 0,
      userP = 0,
      tw = null,
      pending = null,
      aimP = null;
    const RESTORE = 0.5;
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    api.on('resize', () => {
      w = api.width;
      h = api.height;
      cardW = w * 0.27;
      cardH = h * 0.5;
      art.forEach((a) => {
        a.style.width = cardW + 'px';
        a.style.height = cardH + 'px';
      });
    });
    api.frame(({ dt, time, params, reduced }) => {
      const t = time % 8,
        d = params.duration / 1000,
        back = 2.5 + d;
      progress =
        reduced || t < 0.9
          ? 0
          : t < 0.9 + d
            ? ease((t - 0.9) / d)
            : t < back
              ? 1
              : t < back + d
                ? 1 - ease((t - back) / d)
                : 0;
      {
        if (tw) {
          tw.t += dt;
          const u = reduced ? 1 : Math.min(1, tw.t / tw.d);
          userP = R.mix(tw.from, tw.to, ease(u));
          if (u >= 1) {
            tw = null;
            if (userP === 0) {
              sel = 0;
              if (pending != null) {
                sel = pending;
                pending = null;
                tw = { from: 0, to: 1, t: 0, d };
                if (reduced) {
                  userP = 1;
                  tw = null;
                }
              }
            }
          }
        }
        progress = userP;
      }

      art.forEach((a, i) => {
        const x = w * (0.055 + i * 0.31),
          y = h * 0.25,
          sx = i === sel ? R.mix(1, (w * 0.72) / cardW, progress) : 1,
          sy = i === sel ? R.mix(1, (h * 0.68) / cardH, progress) : 1;
        a.style.transform =
          'translate3d(' +
          (i === sel ? R.mix(x, w * 0.14, progress) : x) +
          'px,' +
          (i === sel ? R.mix(y, h * 0.16, progress) : y) +
          'px,0) scale(' +
          sx +
          ',' +
          sy +
          ')';
        if (i === sel) {
          const q = progress,
            r = params.roundness * (1 - q);
          round[i].style.borderRadius =
            'calc(' +
            r +
            '% + ' +
            ((24 * q) / sx).toFixed(2) +
            'px) / calc(' +
            r +
            '% + ' +
            ((24 * q) / sy).toFixed(2) +
            'px)';
        } else round[i].style.borderRadius = params.roundness + '%';
        a.style.opacity = i === sel ? '1' : String(1 - progress);
        a.style.zIndex = i === sel ? '3' : '1';
        a.querySelector('svg').style.transform = 'scaleY(' + sx / sy + ')';
      });
      {
        element.dataset.phase = progress === 0 ? 'list' : progress === 1 ? 'detail' : 'transition';
        return !!tw && !reduced;
      }
    });
    function toggle(i) {
      const d = api.params.duration / 1000;
      const dir = tw ? tw.to : null,
        hit = i != null && i >= 0,
        seen = aimP != null ? aimP : userP;
      pending = null;
      aimP = null;
      if (dir === null && userP === 0) {
        if (!hit) return;
        sel = i;
        tw = { from: 0, to: 1, t: 0, d };
      } else if (hit && i === sel && dir === 1) return;
      else if (hit && i === sel && dir === 0) tw = { from: userP, to: 1, t: 0, d };
      else {
        tw = { from: userP, to: 0, t: 0, d };
        if (hit && i !== sel && seen < 0.5) pending = i;
      }
      api.paint();
      api.wake();
    }
    art.forEach((a, i) => {
      a.tabIndex = 0;
      a.setAttribute('role', 'button');
      a.setAttribute('aria-label', 'Project ' + String(i + 1).padStart(2, '0'));
    });
    api.listen(element, 'pointerdown', () => {
      aimP = userP;
    });
    api.listen(element, 'click', (event) => {
      const a = event.target.closest('.shared-preview-art');
      toggle(a ? art.indexOf(a) : null);
    });
    api.listen(element, 'keydown', (event) => {
      const a = event.target.closest('.shared-preview-art');
      if (!a || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      toggle(art.indexOf(a));
    });
    api.restore = () => {
      pending = null;
      if (!tw && userP === 0) {
        sel = 0;
        api.paint();
        return;
      }
      tw = { from: userP, to: 0, t: 0, d: RESTORE };
      api.paint();
      api.wake();
    };
    const status = api.status;
    api.status = () => ({ ...status(), view: 'preview', progress, project: 0 });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountSharedElementTransition(element, options) {
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
    element.classList.add('shared-element-transition');
    element.innerHTML = '<div class="fx-board" data-shared-board><div class="shared-box" data-shared-box></div></div>';
    const stage = element,
      box = stage.querySelector('[data-shared-box]');
    const RATIO = 336 / 260,
      phone = matchMedia('(max-width: 760px)');
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        floating = !phone.matches;
      let bh = Math.min(H - 80, 520),
        bw = bh * RATIO;
      const maxW = W - (floating ? 64 : 32);
      if (bw > maxW) {
        bw = maxW;
        bh = bw / RATIO;
      }
      let x = (W - bw) / 2,
        y = (H - bh) / 2;

      [
        ['x', x],
        ['y', y],
        ['w', bw],
        ['h', bh],
      ].forEach(([k, v]) => box.style.setProperty('--sh-' + k, Math.round(v) + 'px'));
      box.style.setProperty('--fx-k', (Math.round(bw) / 336).toFixed(4));
    }
    place();
    const inst = mount(box, {
      params: options.params,
      card: {
        item: (i) => media({ glyph: i, accent: i === 0 }),
      },
    });

    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);

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
  global.mountSharedElementTransition = mountSharedElementTransition;
  if (typeof module === 'object' && module.exports) module.exports = mountSharedElementTransition;
})(typeof window !== 'undefined' ? window : this);
