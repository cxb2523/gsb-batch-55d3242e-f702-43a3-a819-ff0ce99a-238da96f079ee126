/*
 * Masked Word Flip
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A two-line label whose words roll up out of a mask and are replaced by the next pair (Studio Index, Selected Work,
 * Recent Projects), with dots showing which one is up. It cycles on its own and steps forward when you hover, move,
 * click or press a key. Good for a hero heading, a section label or a nav title that names several things.
 *
 * How it moves
 * - Each line is a one-cell grid with overflow: hidden. All words of a line sit in the same cell; the one shown is at
 *   translateY(0), the others wait at 100% (below the mask).
 * - A flip moves the current word 0 -> -100% (out the top) and the next word 100% -> 0 (in from below), both with the Web
 *   Animations API, params.duration ms, cubic-bezier(.22,1,.36,1), fill backwards. The final transform is written inline
 *   first, so cancelling or finishing an animation never leaves a word half way.
 * - The second line starts params.lineDelay ms after the first.
 * - Auto cycle: the next flip comes params.hold s + duration after the last one, plus 3 s extra when it lands back on
 *   the first pair, so the loop has a visible start.
 * - Hover (mouse or pen): entering the block flips once and pauses the auto cycle. While the pointer stays inside, every
 *   max(80 px, 30% of the block width) of pointer travel flips again. Movement during a running flip does not count.
 *   Leaving resumes the cycle after hold seconds.
 * - Click / tap and Enter, Space or an arrow key flip once. A request during a running flip is queued and runs as soon
 *   as it ends (at most one queued); key repeat is ignored.
 * - Size: the block's font size is fitted to the element (max 96 px, 64 px when the viewport is 760 px wide or less)
 *   and the block is centred. Lines are as wide as their longest word, so the block never jumps.
 *
 * Options
 *   params.hold       0.8..4, default 1.5     seconds a pair stays up in the auto cycle
 *   params.duration   200..1200, default 400  ms per flip
 *   params.lineDelay  0..150, default 0       ms the second line lags behind the first
 *   reducedMotion     true / false / null     force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountMaskedWordFlip(element, {params: {...}, reducedMotion: null});
 *   fx.params                       copy of current params
 *   fx.setParams({duration: 600})   change params live
 *   fx.setPaused(true|false)        freeze / resume the cycle
 *   fx.reset()                      params back to defaults, rolls back to the first pair
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                    removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:480px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountMaskedWordFlip(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The word pairs: STATES in mountMaskedWordFlip (any number of pairs, two lines each). The accessible name is built
 *   from it.
 * - Font, weight, letter spacing, colours and the dots via effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The out-expo curve cubic-bezier(.22,1,.36,1): fast start, long settle. A linear or ease-in-out roll looks mechanical.
 * - Old word and new word must move together by exactly 100% of the line height, inside the overflow mask.
 * - The extra 3 s rest on the first pair and the movement threshold for hover; without them it flips too often.
 * - Do not let a framework re-render the words while the effect runs; it animates them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountMaskedWordFlip on an embed div with a fixed height.
 * - It refits when the element resizes and once web fonts have loaded; nothing to call yourself.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The block is focusable (tabindex 0, role group) and its label lists every pair, so a screen reader gets all words
 *   at once; the moving words and dots are aria-hidden.
 * - With reduced motion: no auto cycle, no roll. Click, keys and hover still change the pair, instantly.
 * - The loop stops when the tab is hidden, the element is off screen or it is paused.
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
    { key: 'hold', type: 'range', default: 1.5, min: 0.8, max: 4, step: 0.1 },
    { key: 'duration', type: 'range', default: 400, min: 200, max: 1200, step: 50 },
    { key: 'lineDelay', type: 'range', default: 0, min: 0, max: 150, step: 10 },
  ];

  // ---- the effect ----
  const OUT = 'cubic-bezier(.22, 1, .36, 1)',
    REST = 3,
    FIRST = 0.6;
  const STEER_PATH = 0.3;
  const DEMO_STATES = [
    ['Studio', 'Index'],
    ['Selected', 'Work'],
    ['Recent', 'Projects'],
  ];
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('flip-stage');
    const cardOpt = options.card || null,
      STATES = cardOpt.states || DEMO_STATES;
    element.innerHTML = cardOpt.block(
      [0, 1]
        .map((line) =>
          cardOpt.line(
            STATES.map((s, i) => '<span class="flip-word" data-state="' + i + '">' + s[line] + '</span>').join('') +
              '<span class="flip-word flip-echo"></span>',
          ),
        )
        .join(''),
      STATES.map((_, i) => cardOpt.tick(i)).join(''),
    );
    const block = element.querySelector('.flip-block'),
      lines = [...element.querySelectorAll('.flip-line')],
      live = element.querySelector('.flip-live'),
      ticks = [...element.querySelectorAll('.flip-ticks i')];
    const words = lines.map((l) => [...l.querySelectorAll('.flip-word[data-state]')]),
      echoes = lines.map((l) => l.querySelector('.flip-echo'));
    const steer = !!cardOpt.steer;
    let state = 0,
      clock = 0,
      next = FIRST,
      busy = 0;
    const mark = (t, on) => {
      t.classList.toggle('is-on', on);
      if (cardOpt.mark) cardOpt.mark(t, on);
    };
    const set = (el, y) => {
      el.style.transform = 'translate3d(0,' + y + '%,0)';
    };
    function settle() {
      words.forEach((ws) => ws.forEach((w, i) => set(w, i === state ? 0 : 100)));
      echoes.forEach((e) => set(e, 100));
      ticks.forEach((t, i) => mark(t, i === state));
      live.textContent = STATES[state].join(' ');
    }
    function move(el, from, to, delay) {
      set(el, to);
      if (api.reduced) return;
      api.animate(
        el,
        [{ transform: 'translate3d(0,' + from + '%,0)' }, { transform: 'translate3d(0,' + to + '%,0)' }],
        { duration: api.params.duration, delay, easing: OUT, fill: 'backwards' },
      );
    }
    function flip() {
      const from = state;
      state = (state + 1) % STATES.length;
      lines.forEach((l, li) => {
        const d = li * api.params.lineDelay;
        move(words[li][from], 0, -100, d);
        move(words[li][state], 100, 0, d);
      });
      ticks.forEach((t, i) => mark(t, i === state));
      live.textContent = STATES[state].join(' ');
      busy = clock + (api.params.duration + api.params.lineDelay) / 1000;
    }
    function rollHover() {
      if (api.paused || api.reduced || clock < busy) return false;
      lines.forEach((l, li) => {
        const w = words[li][state],
          e = echoes[li];
        e.textContent = w.textContent;
        move(w, 0, -100, 0);
        move(e, 100, 0, 0);
      });
      busy = clock + api.params.duration / 1000;
      rollPending = true;
      return true;
    }
    let rollPending = false;
    function finishRoll() {
      if (!rollPending) return;
      rollPending = false;
      lines.forEach((l, li) => {
        set(words[li][state], 0);
        set(echoes[li], 100);
      });
    }
    if (!steer) {
      api.listen(block, 'pointerenter', (event) => {
        if (event.pointerType !== 'touch') rollHover();
      });
      api.listen(block, 'focus', () => rollHover());
      api.listen(block, 'pointerdown', (event) => {
        if (event.pointerType === 'touch') rollHover();
      });
    }
    api.on('replay', () => {
      element.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      state = 0;
      clock = 0;
      next = FIRST;
      busy = 0;
      rollPending = false;
      queued = false;
      path = 0;
      settle();
    });
    api.on('motion', (reduced) => {
      if (reduced) {
        element.getAnimations({ subtree: true }).forEach((a) => a.finish());
        rollPending = false;
        settle();
      }
    });
    let queued = false,
      hovering = false,
      path = 0;
    {
      const real = (e) => {
        if (e.type === 'pointermove' && e.pointerType === 'mouse' && !e.movementX && !e.movementY) return;
      };
      api.listen(element, 'pointermove', real);
      api.listen(element, 'pointerdown', real);
      api.listen(block, 'focus', real);
      api.restore = () => {
        element.getAnimations({ subtree: true }).forEach((a) => a.finish());
        finishRoll();
        const from = state;
        if (from !== 0) {
          state = 0;
          lines.forEach((l, li) => {
            const d = li * api.params.lineDelay;
            move(words[li][from], 0, -100, d);
            move(words[li][0], 100, 0, d);
          });
          ticks.forEach((t, i) => mark(t, i === 0));
          live.textContent = STATES[0].join(' ');
          busy = clock + (api.params.duration + api.params.lineDelay) / 1000;
        }
        queued = false;
        path = 0;
        next = clock + api.params.hold + api.params.duration / 1000 + REST;
        api.wake();
      };
    }
    const cadence = () => api.params.hold + api.params.duration / 1000 + (state === 0 ? REST : 0);
    function userFlip() {
      flip();
      path = 0;
      next = hovering ? Infinity : clock + cadence();
      if (cardOpt.touched) cardOpt.touched();
    }
    function request() {
      if (api.reduced) {
        flip();
        busy = clock;
        if (cardOpt.touched) cardOpt.touched();
        return;
      }
      if (clock < busy - 1e-3) queued = true;
      else userFlip();
      api.wake();
    }
    if (steer) {
      let lastX = null,
        lastY = 0,
        lastId = null;
      api.listen(block, 'pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        hovering = true;
        path = 0;
        lastX = null;
        next = Infinity;
        request();
      });
      api.listen(block, 'pointerleave', (e) => {
        if (e.pointerType === 'touch') return;
        hovering = false;
        path = 0;
        lastX = null;
        next = Math.max(clock, busy) + api.params.hold;
        api.wake();
      });
      api.listen(block, 'pointermove', (e) => {
        if (e.pointerType === 'touch' || !hovering || false) return;
        const step = lastX === null || e.pointerId !== lastId ? 0 : Math.hypot(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX;
        lastY = e.clientY;
        lastId = e.pointerId;
        if (clock < busy || queued) {
          path = 0;
          return;
        }
        path += step;
        if (path >= Math.max(80, block.offsetWidth * STEER_PATH)) request();
      });
      api.listen(block, 'pointerdown', (e) => {
        if (e.button > 0) return;
        request();
      });
      api.listen(block, 'keydown', (e) => {
        if (!/^(Enter| |Spacebar|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.key)) return;
        e.preventDefault();
        if (e.repeat) return;
        request();
      });
    }
    api.frame(({ dt, time, params, reduced }) => {
      if (reduced) return false;
      clock += dt;
      if (rollPending && clock >= busy) finishRoll();
      if (queued && clock >= busy - 1e-3) {
        queued = false;
        userFlip();
        return true;
      }
      if (clock >= next && clock >= busy) {
        flip();
        next = clock + params.hold + params.duration / 1000 + (state === 0 ? REST : 0);
      }
      return true;
    });
    settle();
    const status = api.status;
    api.status = () => ({ ...status(), state, text: STATES[state].join(' '), rolling: rollPending });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountMaskedWordFlip(element, options) {
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
    element.classList.add('masked-word-flip');
    element.innerHTML = '<div class="fx-board" data-flip></div>';
    const stage = element,
      board = stage.querySelector('[data-flip]'),
      narrow = matchMedia('(max-width:760px)');
    const STATES = [
      ['Studio', 'Index'],
      ['Selected', 'Work'],
      ['Recent', 'Projects'],
    ];
    const inst = mount(board, {
      params: options.params,
      card: {
        states: STATES,
        block: (lines, ticks) =>
          '<div class="flip-block ck-panel" tabindex="0" role="group" aria-label="Rotating label: ' +
          STATES.map((s) => s.join(' ')).join(', ') +
          '"><p class="flip-live" hidden></p><div aria-hidden="true">' +
          lines +
          '<div class="ck-rule"></div><div class="flip-ticks">' +
          ticks +
          '</div></div></div>',
        line: (words) => '<div class="ck-row"><span class="flip-line ck-text" data-strong>' + words + '</span></div>',
        tick: () => '<i class="ck-dot" data-weak></i>',
        mark: (el, on) => {
          el.toggleAttribute('data-accent', on);
          el.toggleAttribute('data-weak', !on);
        },
        interactive: true,
        steer: true,
      },
    });
    const block = board.querySelector('.flip-block'),
      lines = [...block.querySelectorAll('.flip-line')];
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      block.style.fontSize = '100px';
      const tw = Math.max(...lines.map((l) => l.offsetWidth));
      block.style.setProperty('--fx-k', (tw / 176).toFixed(4));
      const w = block.offsetWidth / 100,
        h = block.offsetHeight / 100;
      let F,
        top = 0;
      if (narrow.matches) F = Math.min(64, (W - 80) / w, (H - 80) / h);
      else F = Math.min(96, (W - 80) / w, (H - 96) / h);
      block.style.fontSize = F.toFixed(2) + 'px';
      block.style.setProperty('--fx-k', (((tw / 176) * F) / 100).toFixed(4));
      block.style.left = ((W - block.offsetWidth) / 2).toFixed(1) + 'px';
      block.style.top = Math.max(top, (H - block.offsetHeight) / 2).toFixed(1) + 'px';
    }
    layout();
    const observer0 = new ResizeObserver(layout);
    observer0.observe(stage);
    if (document.fonts) document.fonts.ready.then(layout);

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
  global.mountMaskedWordFlip = mountMaskedWordFlip;
  if (typeof module === 'object' && module.exports) module.exports = mountMaskedWordFlip;
})(typeof window !== 'undefined' ? window : this);
