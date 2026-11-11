/*
 * Hanging Card Carousel
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Eight cards hang from pins on a horizontal rail. Drag the rail and it glides on after release, snaps to a whole card,
 * and every card swings on its pin when the rail speeds up or brakes, then settles back to vertical. Good for a
 * services row, a team or feature carousel, or any row that should feel physical.
 *
 * How it moves
 * - The rail has one offset in px. Dragging moves it 1:1 with the pointer (dragging right moves the cards right).
 *   Past either end it rubber-bands: over -> d x (1 - 1 / (over / d + 1)) with d = 0.55 x lane width.
 * - Release velocity is the last pointer velocity (smoothed, 60 % new sample each move), zero if the pointer stood
 *   still for more than 90 ms, clamped to +-4200 px/s.
 * - Glide: the natural stop is offset + v / resistance, rounded to the nearest whole card. If the throw is faster than
 *   40 px/s and heads that way, the rail glides there on an exponential curve, offset = end - (end - start) x
 *   exp(-k t), with k = v / distance clamped to 0.6..1.8 x resistance, so it leaves at the release speed and lands
 *   exactly on a card. Otherwise, and whenever it is released past an end, a spring pulls it to the card / end
 *   (stiffness 170, damping ratio 0.86).
 * - Swing: each card is a damped pendulum. Natural frequency 8.2 + ((i x 37) mod 7) x 0.18 rad/s, so neighbours swing
 *   slightly out of step; damping ratio 0.085, so it swings back several times. It is driven by the rail's
 *   acceleration (velocity smoothed at rate 30, acceleration clamped to +-30000 px/s^2, scaled by 235 / card width so
 *   small cards swing like big ones) times 0.19 x swing / 9. The angle is capped at 2.2 x swing degrees; hitting the cap
 *   reverses the angular speed at 30 %. Card bodies rotate by the angle around their top; the connector (line and pin)
 *   rotates by -0.8 x the angle, so the hanger kinks against the card.
 * - While dragging, all cards get data-lifted (a slightly stronger shadow). The pin of the card nearest the centre is
 *   marked with the accent colour.
 * - Size: the rail sits 174 px from the top (centred vertically under 760 px). Card height = 0.575 x lane height x
 *   cardScale / 100 (at least 60 px), width = 0.72 x height, gap = max(10 px, 0.14 x width). The card at the offset is
 *   centred; the rail starts on the second card and can travel seven cards.
 *
 * Options
 *   params.resistance  2..10, default 4.5    glide decay; higher stops sooner and shorter
 *   params.swing       2..16, default 9      swing strength and cap (cap = 2.2 x swing degrees)
 *   params.cardScale   75..115, default 100  card size in percent; the rail re-measures and keeps its position
 *   reducedMotion      true / false / null   force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountHangingCardCarousel(element, {params: {...}, reducedMotion: null});
 *   fx.params                  copy of current params
 *   fx.setParams({swing: 14})  change params live
 *   fx.setPaused(true|false)   freeze / resume; pausing releases a running drag
 *   fx.reset()                 params back to defaults, the rail eases back to the second card over 0.5 s
 *                              (cubic-bezier(0.22, 1, 0.36, 1)) while the swing fades out
 *   fx.setReducedMotion(bool)
 *   fx.destroy()               removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountHangingCardCarousel(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Card faces: the item callback in mountHangingCardCarousel returns the HTML for card i (now a white tile with a
 *   mark); the hanger callback draws the connector. Each card is an article labelled "Service 01".."Service 08"
 *   (the services array). The count is eight; the travel is computed as 7 x card step.
 * - Colours, shadow, rail and pin styles in effect.css. Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Swing driven by acceleration, not velocity: cards must hang still while the rail moves at constant speed and kick
 *   when it starts or brakes.
 * - The low damping ratio (0.085) and the slightly different frequency per card; equal frequencies make the row swing
 *   as one stiff block.
 * - The exponential glide solved to land on a whole card; snapping after a free glide looks like a correction.
 * - Rotation around the card's top edge and the counter-rotated connector.
 * - Do not let a framework re-render the cards while the effect runs; it writes transforms to them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the rAF loop and listeners leak. In React StrictMode the mount runs twice; destroy
 *   in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountHangingCardCarousel on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The track is a focusable role="group" (tabindex 0, labelled "Hanging card track with eight items..."; the stage
 *   shows an accent ring on keyboard focus only); cards are articles with their labels. ArrowLeft / ArrowRight glide
 *   one card (with the same glide and swing as a throw), Home / End go to the first / last card, so all eight are
 *   reachable from the keyboard.
 * - With reduced motion: no swing, no glide, no spring, no rubber band, . Dragging still moves the rail inside
 *   its bounds and release snaps straight to the nearest card.
 * - The rAF loop runs only while something moves: when the rail has stopped and every card has
 *   swung back to rest, it stops; the next press, key or reset wakes it. It also stops when the tab is hidden, the
 *   stage is off screen or it is paused.
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
  function bars() {
    return '<div class="cr-bars" aria-hidden="true"><i></i><i></i><i></i></div>';
  }
  const R = { mark, bars, clamp, mix, smooth };

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
    { key: 'resistance', type: 'range', default: 4.5, min: 2, max: 10, step: 0.5 },
    { key: 'swing', type: 'range', default: 9, min: 2, max: 16, step: 1 },
    { key: 'cardScale', type: 'range', default: 100, min: 75, max: 115, step: 1 },
  ];

  // ---- the effect ----
  const services = Array.from({ length: 8 }, (_, i) => 'Service ' + String(i + 1).padStart(2, '0'));
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('services-stage');
    const cardOpt = options.card || null;
    let back = null,
      prior = null;
    element.innerHTML =
      '<div class="services-scroller"' +
      ' tabindex="0"' +
      ' role="group" aria-label="Hanging card track' +
      ' with eight items. Drag or use the left and right arrow keys, Home and End.' +
      '"><div class="services-rail" aria-hidden="true">' +
      (cardOpt.rail ? cardOpt.rail() : '') +
      '</div><div class="services-track">' +
      services
        .map(
          (s, i) =>
            '<article class="hanging-card" aria-label="' +
            s +
            '"><div class="service-connector" aria-hidden="true">' +
            (cardOpt.hanger ? cardOpt.hanger(i) : '') +
            '</div><div class="service-card-body">' +
            (cardOpt.item ? cardOpt.item(i) : '') +
            '</div></article>',
        )
        .join('') +
      '</div></div>';
    const scroller = element.querySelector('.services-scroller'),
      cards = [...element.querySelectorAll('.hanging-card')],
      bodies = cards.map((c) => c.querySelector('.service-card-body')),
      connectors = cards.map((c) => c.querySelector('.service-connector')),
      counter = element.querySelector('.services-count');
    let fresh = true,
      width = 1,
      height = 1,
      cardW = 1,
      cardH = 1,
      gap = 1,
      step = 1,
      max = 1,
      left = 0,
      unit = 1,
      offset = 0,
      velocity = 0,
      smoothV = 0,
      glide = null,
      spring = null,
      drag = null,
      lastIndex = -1,
      lastCurrent = -1;
    let pendulums = services.map((_, i) => ({ angle: 0, speed: 0, omega: 8.2 + ((i * 37) % 7) * 0.18 }));
    const rubber = (over, dim) => dim * 0.55 * (1 - 1 / (over / (dim * 0.55) + 1));
    function layout() {
      prior = { step, offset };
      {
        width = scroller.clientWidth;
        height = scroller.clientHeight;
        cardH = (Math.max(60, height * 0.575) * api.params.cardScale) / 100;
        cardW = cardH * 0.72;
        gap = Math.max(10, cardW * 0.14);
        step = cardW + gap;
        max = step * 7;
        left = (width - cardW) / 2;
        unit = 235 / cardW;
        if (!drag && !glide && !spring) offset = R.clamp(offset, 0, max);
        cards.forEach((c) => {
          c.style.width = cardW + 'px';
          c.style.height = cardH + 'px';
        });
        if (fresh && width > 1) {
          fresh = false;
          restart();
        }
        return;
      }
    }
    api.on('resize', layout);
    api.on('params', layout);
    const snap = (x) => R.clamp(Math.round(x / step) * step, 0, max);
    function fling(v) {
      spring = null;
      glide = null;
      if (offset < 0 || offset > max) {
        spring = { to: offset < 0 ? 0 : max };
        velocity = v;
        return;
      }
      const k = api.params.resistance,
        natural = offset + v / k,
        end = snap(natural),
        dist = end - offset;
      if (Math.abs(v) > 40 && Math.sign(dist) === Math.sign(v) && Math.abs(dist) > 2) {
        const kk = R.clamp(v / dist, k * 0.6, k * 1.8);
        glide = { from: offset, to: end, k: kk, t: 0, v0: v };
        velocity = v;
      } else {
        spring = { to: end };
        velocity = v;
      }
    }
    function goTo(x) {
      if (api.reduced) {
        offset = R.clamp(x, 0, max);
        velocity = 0;
        glide = spring = null;
        api.paint();
        return;
      }
      const dist = R.clamp(x, 0, max) - offset;
      fling(dist * api.params.resistance);
      api.wake();
    }
    function jump(direction) {
      goTo(snap(offset) + direction * step);
    }
    api.listen(scroller, 'keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        jump(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        goTo(event.key === 'Home' ? 0 : max);
      }
    });
    function press(x) {
      drag = { x, base: offset - 0, raw: offset, at: performance.now(), v: 0 };
      glide = spring = null;
      velocity = 0;
      scroller.classList.add('is-dragging');
      if (cardOpt.lift) cardOpt.lift(true);
    }
    function moveTo(x, now) {
      const dt = Math.max(0.008, (now - drag.at) / 1000),
        dx = x - drag.x;
      drag.raw -= dx;
      const prevOffset = offset;
      offset =
        drag.raw < 0 ? -rubber(-drag.raw, width) : drag.raw > max ? max + rubber(drag.raw - max, width) : drag.raw;
      if (api.reduced) offset = R.clamp(offset, 0, max);
      const v = (offset - prevOffset) / dt;
      drag.v = R.mix(drag.v, v, 0.6);
      drag.x = x;
      drag.at = now;
    }
    function letGo() {
      if (!drag) return;
      const v = performance.now() - drag.at > 90 ? 0 : R.clamp(drag.v, -4200, 4200);
      drag = null;
      scroller.classList.remove('is-dragging');
      if (cardOpt.lift) cardOpt.lift(false);
      if (api.reduced) {
        offset = snap(offset);
        return;
      }
      fling(v);
    }
    api.listen(scroller, 'pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id || api.paused) return;
      moveTo(event.clientX, performance.now());
      api.paint();
      api.wake();
    });
    function release(event) {
      if (!drag || drag.id == null) return;
      if (scroller.hasPointerCapture(drag.id)) scroller.releasePointerCapture(drag.id);
      if (event && event.type === 'pointercancel') drag.v = 0;
      letGo();
      api.paint();
      api.wake();
    }
    api.listen(scroller, 'pointerup', release);
    api.listen(scroller, 'pointercancel', release);
    api.on('pause', (value) => {
      if (value) release();
    });
    api.on('visibility', (visible) => {
      if (!visible) release();
    });
    function restart() {
      drag = null;
      scroller.classList.remove('is-dragging');
      if (cardOpt.lift) cardOpt.lift(false);
      velocity = smoothV = 0;
      glide = spring = null;
      lastIndex = lastCurrent = -1;
      pendulums.forEach((p) => {
        p.angle = p.speed = 0;
      });
      offset = R.clamp(step, 0, max);
    }
    api.on('replay', restart);
    api.on('motion', (reduced) => {
      if (reduced) {
        glide = spring = null;
        velocity = 0;
        offset = snap(offset);
        pendulums.forEach((p) => {
          p.angle = p.speed = 0;
        });
      }
    });
    api.on('destroy', () => release());
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
    const RESTORE = 0.5,
      outEase = cubicBezier(0.22, 1, 0.36, 1);
    function stepBack(dt, reduced) {
      back.t += dt;
      const u = reduced ? 1 : Math.min(1, back.t / RESTORE),
        e = outEase(u);
      offset = R.mix(back.from, back.to, e);
      velocity = smoothV = 0;
      glide = spring = null;
      pendulums.forEach((p, i) => {
        p.angle = back.a[i] * (1 - e);
        p.speed = 0;
      });
      if (u >= 1) back = null;
    }
    {
      api.listen(scroller, 'pointerdown', (event) => {
        if (event.button !== 0 || api.paused) return;
        back = null;
        scroller.setPointerCapture(event.pointerId);
        press(event.clientX);
        drag.id = event.pointerId;
        api.wake();
      });
      api.listen(scroller, 'pointermove', (event) => {
        if (drag && drag.id === event.pointerId && !api.paused && cardOpt.touched) cardOpt.touched();
      });
      api.listen(
        scroller,
        'keydown',
        (event) => {
          if (api.paused || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          back = null;
          if (cardOpt.touched) cardOpt.touched();
        },
        { capture: true },
      );
      const rescale = () => {
        const p0 = prior;
        prior = null;
        if (!p0 || p0.step <= 1 || p0.step === step) return;
        const f = step / p0.step;
        offset = p0.offset * f;
        if (drag) drag.raw *= f;
        if (glide) {
          glide.from *= f;
          glide.to *= f;
        }
        if (spring) spring.to *= f;
        if (back) {
          back.from *= f;
          back.to *= f;
        }
        if (!drag && !glide && !spring && !back) offset = R.clamp(offset, 0, max);
      };
      api.on('resize', rescale);
      api.on('params', rescale);
      api.on('replay', () => {
        back = null;
      });
      api.restore = () => {
        if (drag) {
          if (drag.id != null && scroller.hasPointerCapture(drag.id)) scroller.releasePointerCapture(drag.id);
          drag = null;
          scroller.classList.remove('is-dragging');
          if (cardOpt.lift) cardOpt.lift(false);
        }
        glide = spring = null;
        velocity = smoothV = 0;
        const home = R.clamp(step, 0, max);
        if (api.reduced) {
          back = null;
          offset = home;
          pendulums.forEach((p) => {
            p.angle = p.speed = 0;
          });
          api.paint();
          return;
        }
        back = { t: 0, from: offset, to: home, a: pendulums.map((p) => p.angle) };
        api.wake();
      };
    }
    api.frame(({ dt, time, params, reduced }) => {
      if (back) stepBack(dt, reduced);
      const before = offset;
      if (!drag && !reduced && dt > 0) {
        if (glide) {
          glide.t += dt;
          const e = Math.exp(-glide.k * glide.t);
          offset = glide.to - (glide.to - glide.from) * e;
          velocity = (glide.to - glide.from) * glide.k * e;
          if (Math.abs(glide.to - offset) < 0.3) {
            offset = glide.to;
            velocity = 0;
            glide = null;
          }
        } else if (spring) {
          const k = 170,
            c = 2 * Math.sqrt(k) * 0.86;
          velocity += (-k * (offset - spring.to) - c * velocity) * dt;
          offset += velocity * dt;
          if (Math.abs(offset - spring.to) < 0.3 && Math.abs(velocity) < 4) {
            offset = spring.to;
            velocity = 0;
            spring = null;
          }
        }
      }
      if (reduced && !drag) offset = R.clamp(offset, 0, max);
      const v = dt > 0 ? (offset - before) / dt : 0,
        prevV = smoothV;
      smoothV = dt > 0 ? R.mix(smoothV, v, 1 - Math.exp(-30 * dt)) : smoothV;
      const accel = dt > 0 ? R.clamp((smoothV - prevV) / dt, -30000, 30000) * unit : 0;
      const gain = ((0.19 * params.swing) / 9) * (!cardOpt.fullSwing ? 0.5 : 1),
        limit = params.swing * (!cardOpt.fullSwing ? 0.8 : 2.2);
      let moving = false;
      cards.forEach((card, i) => {
        const p = pendulums[i],
          x = left + i * step - offset;
        if (!reduced && dt > 0) {
          const w = p.omega,
            z = 0.085;
          p.speed += (-w * w * p.angle - 2 * z * w * p.speed + gain * accel) * dt;
          p.angle += p.speed * dt;
          if (Math.abs(p.angle) > limit) {
            p.angle = Math.sign(p.angle) * limit;
            p.speed *= -0.3;
          }
          if (Math.abs(p.angle) < 0.01 && Math.abs(p.speed) < 0.05) p.angle = p.speed = 0;
        }
        if (reduced) p.angle = p.speed = 0;
        card.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
        bodies[i].style.transform = 'rotate(' + p.angle.toFixed(3) + 'deg)';
        connectors[i].style.transform = 'rotate(' + (-p.angle * 0.8).toFixed(3) + 'deg)';
        moving = moving || Math.abs(p.angle) + Math.abs(p.speed) > 0.01;
      });
      const index = R.clamp(Math.round(offset / step), 0, 7);
      if (index !== lastIndex) {
        if (counter) counter.textContent = String(index + 1).padStart(2, '0') + ' / 08';
        lastIndex = index;
      }
      if (index !== lastCurrent) {
        cards.forEach((c, i) => c.classList.toggle('is-current', i === index));
        lastCurrent = index;
        if (cardOpt.current) cardOpt.current(index);
      }
      element.dataset.offset = offset.toFixed(3);
      element.dataset.phase = drag ? 'dragging' : moving || glide || spring ? 'settling' : 'resting';
      return !!drag || !!glide || !!spring || moving;
    });
    const status = api.status;
    api.status = () => ({
      ...status(),
      offset,
      target: glide ? glide.to : spring ? spring.to : offset,
      velocity,
      max,
      cardWidth: cardW,
      cardHeight: cardH,
      dragging: !!drag,
      angles: pendulums.map((p) => p.angle),
      visibleCards: cards.map((_, i) => {
        const x = left + i * step - offset;
        return x + cardW > 0 && x < width;
      }),
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountHangingCardCarousel(element, options) {
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
    element.classList.add('hanging-card-carousel');
    element.innerHTML = '<div class="fx-board"><div class="ck-lane" data-physics></div></div>';
    const stage = element,
      board = stage.querySelector('.fx-board'),
      lane = board.querySelector('[data-physics]');
    const PANEL_B = 158,
      GAP = 16,
      below = matchMedia('(max-width:760px)');
    let ox = 0,
      oy = 0,
      pins = [],
      tiles = [],
      current = -1;
    function fit() {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      let h, rail;
      if (below.matches) {
        h = Math.min((H - 120) / 0.65, (W * 0.56) / 0.414);
        rail = (H - 0.65 * h) / 2;
      } else {
        rail = PANEL_B + GAP;
        h = Math.min((H - 56 - rail) / 0.65, (W * 0.26) / 0.414);
      }
      h = Math.round(h);
      ox = 0;
      oy = Math.round(rail - 0.175 * h);
      lane.style.top = oy + 'px';
      lane.style.height = h + 'px';
      board.style.setProperty('--phys-k', (h / 240).toFixed(4));
    }
    fit();
    const observer0 = new ResizeObserver(fit);
    observer0.observe(stage);
    const inst = mount(lane, {
      params: options.params,
      card: {
        interactive: true,
        fullSwing: true,
        rail: () => '<i class="ck-line"></i>',
        hanger: () => '<i class="ck-line" data-v data-strong></i><span class="ck-dot"></span>',
        item: (i) => media({ glyph: i, lift: true }),
        current: (i) => {
          if (pins[current]) pins[current].removeAttribute('data-accent');
          current = i;
          if (pins[i]) pins[i].setAttribute('data-accent', '');
        },
        lift: (on) => tiles.forEach((t) => t.toggleAttribute('data-lifted', on)),
      },
    });
    pins = [...lane.querySelectorAll('.service-connector .ck-dot')];
    tiles = [...lane.querySelectorAll('.ck-media')];
    if (pins[current]) pins[current].setAttribute('data-accent', '');

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
  global.mountHangingCardCarousel = mountHangingCardCarousel;
  if (typeof module === 'object' && module.exports) module.exports = mountHangingCardCarousel;
})(typeof window !== 'undefined' ? window : this);
