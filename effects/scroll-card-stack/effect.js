/*
 * Scroll Card Stack
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Three cards slide up one after another and pile onto a stage; the cards underneath shrink a little and keep their top
 * edge showing. Scroll, drag or use the arrow keys to move through the stack and back. Good for featured work, a
 * product launch or a chaptered case study.
 *
 * How it moves
 * - One number drives everything: progress, from 0 (first card alone) to 2 (all three stacked). Input sets a target;
 *   progress chases it each frame with exponential damping at rate 1000 / followLag per second (5 at the default
 *   200 ms). Stopping mid-way leaves the cards mid-way; reversing un-stacks continuously.
 * - Per card i: depth = max(0, progress - i), enter = max(0, i - progress).
 *   translateY = enter x stageHeight x 0.87 - depth x stackGap, scale = 1 - depth x shrink / 100,
 *   transform-origin top centre. A card not yet in waits 0.87 stage heights below; a buried card moves up stackGap px
 *   and shrinks shrink percent per level, so its top edge peeks out above the card in front.
 * - Input lives on a virtual track 2.5 stage heights long (one card = 1.25 stage heights).
 *   Wheel: deltaY maps 1:1 onto the track (line mode x 32, page mode x stage height); ctrl+wheel is ignored.
 *   Drag: one px of pointer travel moves the track by 2.5 / 1.74 px, so about 0.87 stage heights of drag is one card.
 *   On touch, drag that runs past either end scrolls the page instead.
 * - Page scroll handoff at the ends: a wheel gesture that moved the stack keeps being swallowed at the end until the
 *   wheel has been quiet for 250 ms (stops trackpad inertia leaking into the page). After that the page scrolls only
 *   once the cards have settled (within 0.02 of the target) and you push another 100 px outward; that count resets
 *   after 1.2 s idle or a direction change.
 * - Keys (the board is focusable): ArrowDown / PageDown / Space next card, ArrowUp / PageUp / Shift+Space previous,
 *   Home / End first / last. Each step is a whole card, eased by the same damping.
 * - Layout: the deck has a 1.62 aspect ratio, width = min(stage width - 2 x 32 px padding (16 under 760 px),
 *   stage height x 0.52 x 1.62, 620 px), centred and pushed 60 px down to leave room for the peeking edges.
 *
 * Options
 *   params.stackGap   16..54, default 30     px each buried card rises per level
 *   params.shrink     3..12, default 6       percent each buried card shrinks per level
 *   params.followLag  150..1000, default 200 ms; time constant of the chase, higher feels heavier
 *   reducedMotion     true / false / null    force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountScrollCardStack(element, {params: {...}, reducedMotion: null});
 *   fx.params                    copy of current params
 *   fx.setParams({stackGap: 40}) change params live
 *   fx.setPaused(true|false)     freeze / resume; input is ignored while paused
 *   fx.reset()                   params back to defaults, stack eases back to the first card over 0.5 s
 *                                (cubic-bezier(0.22, 1, 0.36, 1))
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                 removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountScrollCardStack(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Card faces: the item callback in mountScrollCardStack returns the HTML for card i (now a white card with a centred
 *   mark, the middle one in the accent colour). Put images or text there. The card count is fixed at three
 *   (the projects array and the 0..2 range of progress).
 * - Colours, radius, shadow and accent via the CSS variables in effect.css.
 * - Stage height, params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The exponential chase toward a target. Swapping it for CSS transitions or snapping on a threshold loses the
 *   continuous scrub and the clean reversal.
 * - The 0.87 stage-height entry offset and transform-origin top centre; they make the buried card's top edge peek out.
 * - The wheel latch (250 ms) and the 100 px end push; without them the page jumps as soon as the last card lands.
 * - Keep touch-action: none on the board and pointer capture on drag.
 * - Do not let a framework re-render the cards while the effect runs; it writes transforms to them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the rAF loop and listeners leak. In React StrictMode the mount runs twice; destroy
 *   in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - The effect scrolls its own virtual track; it does not use page scroll position or ScrollTrigger. To bind it to page
 *   scroll instead you would have to drive the target yourself.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountScrollCardStack on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The board is a focusable role="group" ("Three cards. Scroll, drag, or use arrow keys.") with a focus ring; the cards
 *   themselves are aria-hidden placeholders. If you put real content in them, give it its own accessible text.
 * - With reduced motion: no chase. The stack opens fully stacked on the last card; wheel, drag and keys jump
 *   whole cards instantly. It is not turned into a list.
 * - The loop stops when the tab is hidden, the stage is off screen, it is paused, or the cards have settled.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
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
  const R = { bars, mark, clamp, mix, damp };

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
    { key: 'stackGap', type: 'range', default: 30, min: 16, max: 54, step: 1 },
    { key: 'shrink', type: 'range', default: 6, min: 3, max: 12, step: 1 },
    { key: 'followLag', type: 'range', default: 200, min: 150, max: 1000, step: 50 },
  ];

  // ---- the effect ----
  const projects = ['01', '02', '03'];
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const cardOpt = options.card || null;
    {
      element.classList.add('stack-stage');
      element.innerHTML =
        '<div class="stack-deck" aria-hidden="true">' +
        projects.map((p, i) => '<div class="stack-card">' + cardOpt.item(i) + '</div>').join('') +
        '</div>';
    }
    const scroller = element.querySelector('.stack-scroller'),
      cards = [...element.querySelectorAll('.stack-card')],
      counter = element.querySelector('.stack-count'),
      button = element.querySelector('.stack-next');
    let progress = 0,
      target = 0,
      extent = 1,
      last = -1;
    function layout() {
      extent = api.height * 2.5;
      return;
    }
    function scrollTo(top) {
      target = R.clamp((top / extent) * 2, 0, 2);
      api.wake();
      if (api.reduced) api.paint();
    }
    api.on('resize', layout);
    api.on('motion', () => {
      progress = target = cardTop = 0;
    });
    api.on('replay', () => {
      progress = target = 0;
      if (scroller) scroller.scrollTop = 0;
      last = -1;
      cardTop = cardTime = cardSent = 0;
    });
    let cardTop = 0,
      cardTime = 0,
      cardSent = 0;
    const RESTORE = 0.5;
    let drag = null,
      back = null;
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
    function release() {
      if (!drag) return;
      const pid = drag.id;
      drag = null;
      element.classList.remove('stack-dragging');
      if (element.hasPointerCapture(pid)) element.releasePointerCapture(pid);
    }
    function nudge(d, chain) {
      const was = cardTop;
      cardTop = R.clamp(cardTop + d, 0, extent);
      if (cardTop !== was) {
        back = null;
        scrollTo(cardTop);
        if (cardOpt.touched) cardOpt.touched();
      }
      const left = d - (cardTop - was);
      if (chain && Math.abs(left) > 0.5) window.scrollBy(0, (left * 1.74 * api.height) / extent);
    }
    function stepBack(dt) {
      back.t += dt;
      const u = Math.min(1, back.t / RESTORE);
      progress = R.mix(back.from, 0, outEase(u));
      if (u >= 1) back = null;
    }
    function whole(params) {
      progress = Math.round(target);
      cards.forEach((card, i) => {
        const depth = Math.max(0, progress - i),
          enter = Math.max(0, i - progress);
        card.style.transform =
          'translate3d(0,' +
          (enter * api.height * 0.87 - depth * params.stackGap) +
          'px,0) scale(' +
          (1 - depth * (params.shrink / 100)) +
          ')';
      });
    }
    {
      if (api.reduced) {
        progress = target = 2;
      }
      api.on('resize', () => {
        cardTop = (target / 2) * extent;
      });
      api.on('motion', (reduced) => {
        release();
        back = null;
        if (reduced) {
          progress = target = 2;
          cardTop = extent;
        }
      });
      const WHEEL_GAP = 250,
        gap = cardOpt.wheelLatch ? (typeof cardOpt.wheelLatch === 'number' ? cardOpt.wheelLatch : WHEEL_GAP) : 0;
      let wheelAt = -Infinity,
        held = false;
      const PUSH_IDLE = 1200,
        push = cardOpt.endPush ? (typeof cardOpt.endPush === 'number' ? cardOpt.endPush : 100) : 0;
      let pushed = 0,
        pushDir = 0,
        pushAt = -Infinity;
      api.listen(
        element,
        'wheel',
        (event) => {
          if (event.ctrlKey || api.paused) return;
          const d = event.deltaY * (event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? api.height : 1);
          if (gap && d) {
            const now = performance.now();
            if (now - wheelAt > gap) held = false;
            wheelAt = now;
          }
          if (!d || (d < 0 && cardTop <= 0) || (d > 0 && cardTop >= extent)) {
            if (gap && d && held) {
              event.preventDefault();
              return;
            }
            if (push && d) {
              const now = performance.now();
              if (Math.sign(d) !== pushDir || now - pushAt > PUSH_IDLE) pushed = 0;
              pushDir = Math.sign(d);
              pushAt = now;
              if (Math.abs(progress - target) > 0.02) {
                pushed = 0;
                event.preventDefault();
                return;
              }
              if (pushed < push) {
                pushed += Math.abs(d);
                event.preventDefault();
                return;
              }
            }
            return;
          }
          if (gap) held = true;
          pushed = 0;
          event.preventDefault();
          nudge(d, false);
        },
        { passive: false },
      );
      api.listen(element, 'pointerdown', (event) => {
        if (event.button !== 0 || api.paused) return;
        release();
        drag = { id: event.pointerId, y: event.clientY, touch: event.pointerType !== 'mouse' };
        element.setPointerCapture(event.pointerId);
        element.classList.add('stack-dragging');
      });
      api.listen(element, 'pointermove', (event) => {
        if (!drag || event.pointerId !== drag.id || api.paused) return;
        const dy = drag.y - event.clientY;
        drag.y = event.clientY;
        if (dy) nudge((dy * extent) / (1.74 * api.height), drag.touch);
      });
      api.listen(element, 'pointerup', release);
      api.listen(element, 'pointercancel', release);
      api.listen(element, 'lostpointercapture', release);
      api.listen(element, 'keydown', (event) => {
        const k = event.key,
          step =
            k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !event.shiftKey)
              ? 1
              : k === 'ArrowUp' || k === 'PageUp' || k === ' '
                ? -1
                : 0;
        if (api.paused || event.altKey || event.ctrlKey || event.metaKey || (!step && k !== 'Home' && k !== 'End'))
          return;
        const to = ((k === 'Home' ? 0 : k === 'End' ? 2 : R.clamp(Math.round(target) + step, 0, 2)) / 2) * extent;
        if (Math.abs(to - cardTop) < 0.5) return;
        event.preventDefault();
        nudge(to - cardTop, false);
      });
      api.on('destroy', release);
      api.restore = () => {
        release();
        if (api.reduced) {
          back = null;
          progress = target = 2;
          cardTop = extent;
          api.paint();
          return;
        }
        cardTop = 0;
        scrollTo(0);
        back = { t: 0, from: progress };
        api.wake();
      };
    }
    api.frame(({ dt, time, params, reduced }) => {
      progress = reduced ? target : R.damp(progress, target, 1000 / params.followLag, dt);
      if (back) stepBack(dt);
      cards.forEach((card, i) => {
        const depth = Math.max(0, progress - i),
          enter = Math.max(0, i - progress),
          scale = 1 - depth * (params.shrink / 100),
          y = enter * api.height * 0.87 - depth * params.stackGap;
        card.style.transform = reduced ? 'none' : 'translate3d(0,' + y + 'px,0) scale(' + scale + ')';
      });
      if (reduced) whole(params);
      const active = R.clamp(Math.round(progress), 0, 2);
      if (active !== last && counter) {
        counter.textContent = '0' + (active + 1) + ' / 03';
        button.textContent = active === 2 ? 'Start over ↗' : 'Next ↓';
        last = active;
      }
      element.dataset.progress = progress.toFixed(4);
      element.dataset.target = target.toFixed(4);
      element.dataset.active = active;
      if (!back && Math.abs(progress - target) <= 0.0001) return false;
      return true;
    });
    layout();
    api.paint();
    const status = api.status;
    api.status = () => ({ ...status(), progress, target, active: last, extent });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountScrollCardStack(element, options) {
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
    element.classList.add('scroll-card-stack');
    element.innerHTML =
      '<div class="fx-board" data-stack-board tabindex="0" role="group" aria-label="Three cards. Scroll, drag, or use arrow keys."></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-stack-board]'),
      narrow = matchMedia('(max-width:760px)');
    const inst = mount(board, {
      params: options.params,
      card: {
        interactive: true,
        endPush: true,
        wheelLatch: true,
        item: (i) => media({ glyph: i, accent: i === 1 }),
      },
    });
    const deck = board.querySelector('.stack-deck');
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        lift = 60,
        pad = narrow.matches ? 16 : 32,
        AR = 1.62;
      let w = Math.min(W - pad * 2, H * 0.52 * AR, 620),
        top = null;
      const Z = panelZone(stage),
        R = Z.right + 16;
      if (!narrow.matches && (W - w) / 2 < R) {
        if (W - 2 * R >= w * 0.8) w = W - 2 * R;
        else {
          top = Math.max((H - w / AR - lift) / 2 + lift, Z.bottom + 24 + lift);
          w = Math.min(w, (H - 24 - top) * AR);
        }
      }
      const h = w / AR,
        left = (W - w) / 2;
      if (top === null) top = (H - h - lift) / 2 + lift;
      Object.assign(deck.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
      board.style.setProperty('--fx-k', (w / 256).toFixed(4));
    }
    layout();
    const observer0 = new ResizeObserver(layout);
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
  global.mountScrollCardStack = mountScrollCardStack;
  if (typeof module === 'object' && module.exports) module.exports = mountScrollCardStack;
})(typeof window !== 'undefined' ? window : this);
