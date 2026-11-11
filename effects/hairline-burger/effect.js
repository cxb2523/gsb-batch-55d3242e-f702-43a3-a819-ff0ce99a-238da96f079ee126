/*
 * Hairline Burger
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A menu button with two thin lines. Hover and the lines pinch towards each other; click and they cross into an X
 * while a small Menu / Close label rolls over; hover the X and it spins a quarter turn. For a site header, a mobile
 * nav trigger or any open / close toggle.
 *
 * How it moves
 * - Two lines, params.weight px thick, 32 px wide, params.gap px apart (top edge of one to bottom edge of the other).
 * - Every state change is a CSS transition on transform, params.duration ms, cubic-bezier(.22,1,.36,1).
 * - Hover (closed): each line moves params.shift px towards the middle. The button shadow lifts.
 * - Open: each line moves to the centre ((gap - weight) / 2) and turns +45 / -45 degrees. The label under the button is
 *   a two-row strip in an overflow mask; it slides up 50% so "Menu" leaves and "Close" arrives, same duration and curve.
 * - Hover (open): the whole line group spins rotate(0 -> 90deg) once in 600 ms with the same curve (Web Animations
 *   API). An X turned 90 degrees looks the same, so it ends seamlessly. It runs on each pointer enter, not on a loop.
 *   From 400 ms after opening, hovering also tints the button background light grey.
 * - Size: the button is 72 px at scale 1 and scales up to 3x with the element (half of its width or height decides),
 *   never below 1. Line sizes, gap and shift scale with it.
 *
 * Options
 *   params.gap       6..16, default 11        px between the lines
 *   params.shift     0..4, default 2          px each line moves on hover; 0 disables the pinch
 *   params.duration  200..900, default 500    ms for pinch, cross and label roll
 *   params.weight    1..2.5, default 1.5      line thickness in px
 *   reducedMotion    true / false / null      force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountHairlineBurger(element, {params: {...}, reducedMotion: null});
 *   fx.params                      copy of current params
 *   fx.setParams({weight: 2})      change params live
 *   fx.setPaused(true|false)       freeze / resume (clicks are ignored while paused)
 *   fx.reset()                     params back to defaults, button closed
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                   removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:420px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountHairlineBurger(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Label words: labels in mountHairlineBurger (default ['Menu', 'Close']).
 * - Button size, radius, colours, shadow and the label font via effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Same curve and duration for lines and label, so the cross and the roll land together.
 * - The spin must be exactly 90 degrees (or a multiple); anything else leaves the X crooked at the end.
 * - The lines meet at (gap - weight) / 2; change the gap only through params.gap so this stays true.
 * - Keep the states as classes (.is-hover, .is-open) with CSS transitions, so fast toggles reverse from where they are.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - The button only toggles its own state. To open a real menu, listen for its click (it is the .hl-btn element) or watch
 *   aria-expanded, and drive your menu from there.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountHairlineBurger on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - A real button with aria-expanded and a label that switches between "Open menu" and "Close menu". Keyboard focus
 *   (focus-visible) counts as hover. The Menu / Close text is aria-hidden; a visually hidden polite live region
 *   (.hl-live) announces "Menu opened." / "Menu closed.".
 * - With reduced motion: no spin, all transitions off; pinch, cross and label change instantly.
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
      hooks = new Map(),
      animations = new Set();
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
      animations.forEach((animation) => {
        if (reduced()) animation.finish();
        else if (paused || !visible || document.hidden) animation.pause();
        else animation.play();
      });
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
        animations.forEach((animation) =>
          paused || !visible || document.hidden ? animation.pause() : reduced() ? animation.finish() : animation.play(),
        );
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
      animate(target, keyframes, timing) {
        const animation = target.animate(keyframes, timing);
        animations.add(animation);
        const remove = () => animations.delete(animation);
        animation.finished.then(remove, remove);
        if (paused || !visible || document.hidden) animation.pause();
        if (reduced()) animation.finish();
        return animation;
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
          animations.forEach((animation) => animation.cancel());
          animations.clear();
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
          animations: animations.size,
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
      animations.forEach((animation) => (document.hidden ? animation.pause() : !paused && animation.play()));
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
      animations.forEach((animation) => (!visible ? animation.pause() : !paused && animation.play()));
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
    { key: 'gap', type: 'range', default: 11, min: 6, max: 16, step: 1 },
    { key: 'shift', type: 'range', default: 2, min: 0, max: 4, step: 0.5 },
    { key: 'duration', type: 'range', default: 500, min: 200, max: 900, step: 50 },
    { key: 'weight', type: 'range', default: 1.5, min: 1, max: 2.5, step: 0.5 },
  ];

  // ---- the effect ----
  const OUT = 'cubic-bezier(.22,1,.36,1)';
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('hl-stage');
    const cardOpt = options.card || null,
      lab = cardOpt.labels || ['Menu', 'Close'];
    element.innerHTML =
      '<div class="hl-wrap" data-card><div class="hl-bar"><button type="button" class="hl-btn ck-panel"' +
      '' +
      ' aria-label="Open menu" aria-expanded="false"><span class="hl-lines"><i></i><i></i></span></button></div>' +
      '<span class="hl-state ck-hint" aria-hidden="true"><span class="hl-roll"><span>' +
      lab[0] +
      '</span><span>' +
      lab[1] +
      '</span></span></span></div><p class="cr-sr hl-live" aria-live="polite"></p>';
    const btn = element.querySelector('.hl-btn'),
      lines = element.querySelector('.hl-lines'),
      bars = [...lines.children],
      live = element.querySelector('.hl-live');
    let open = false,
      hover = false,
      spin = null,
      bgTimer = 0;
    function apply() {
      const p = api.params;
      element.style.setProperty('--gap', p.gap + 'px');
      element.style.setProperty('--shift', p.shift + 'px');
      element.style.setProperty('--dur', p.duration + 'ms');
      element.style.setProperty('--weight', p.weight + 'px');
    }
    function intro() {
      bars.forEach((b, i) =>
        api.animate(b, [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)' }], {
          duration: 1000,
          delay: 120 + i * 100,
          easing: OUT,
          fill: 'backwards',
        }),
      );
    }
    function setHover(on) {
      if (on === hover) return;
      hover = on;
      element.classList.toggle('is-hover', on);
      if (on && open && !api.reduced) {
        if (spin) spin.cancel();
        spin = api.animate(lines, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(90deg)' }], {
          duration: 600,
          easing: OUT,
        });
      }
    }
    function setOpen(next) {
      open = next;
      element.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (spin) {
        spin.cancel();
        spin = null;
      }
      clearTimeout(bgTimer);
      element.classList.remove('is-open-late');
      if (open) bgTimer = setTimeout(() => element.classList.add('is-open-late'), 400);
      live.textContent = open ? 'Menu opened.' : 'Menu closed.';
    }
    api.listen(btn, 'pointerenter', (e) => {
      if (e.pointerType !== 'touch' && !api.paused) setHover(true);
    });
    api.listen(btn, 'pointerleave', () => setHover(false));
    api.listen(btn, 'focus', () => {
      if (btn.matches(':focus-visible')) setHover(true);
    });
    api.listen(btn, 'blur', () => setHover(false));
    api.listen(btn, 'click', () => {
      if (!api.paused) setOpen(!open);
    });
    api.cleanup(() => clearTimeout(bgTimer));
    api.on('params', apply);
    api.on('replay', () => {
      if (open) setOpen(false);
      setHover(false);
      live.textContent = '';
      intro();
    });
    {
      api.listen(btn, 'focus', () => {
        if (btn.matches(':focus-visible')) {
        }
      });
      api.listen(btn, 'click', () => {
        if (api.paused) return;
        if (cardOpt.touched) cardOpt.touched();
      });
      api.restore = () => {
        if (open) setOpen(false);
        setHover(false);
        live.textContent = '';
      };
    }
    api.frame(({ time, reduced }) => {
      return false;
    });
    apply();
    const status = api.status;
    api.status = () => ({
      ...status(),
      open,
      hover,
      offset: (() => {
        const m = getComputedStyle(bars[0]).transform;
        return m === 'none' ? 0 : new DOMMatrix(m).m42;
      })(),
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountHairlineBurger(element, options) {
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
    element.classList.add('hairline-burger');
    element.innerHTML = '<div class="fx-board" data-hl></div>';
    const stage = element,
      board = stage.querySelector('[data-hl]');
    const narrow = matchMedia('(max-width: 760px)');
    const fit = () => {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      let k = Math.min(3, (H * 0.5) / 104, (W * 0.5) / 72);
      return Math.max(1, k);
    };
    const place = () => board.style.setProperty('--hl-k', fit().toFixed(4));
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(board, {
      params: options.params,
      card: {
        labels: ['Menu', 'Close'],
        interactive: true,
        near: [0.42, 0.28],
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
  global.mountHairlineBurger = mountHairlineBurger;
  if (typeof module === 'object' && module.exports) module.exports = mountHairlineBurger;
})(typeof window !== 'undefined' ? window : this);
