/*
 * Scroll Card Deal
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Four cards start as one face-down pile in the middle. As you scroll, the pile opens into a fan on the spot, slides out
 * sideways into an evenly spaced row while it flattens, and the cards lift and flip face-up one after another, left to
 * right, each with a small overshoot. Every card hovers on its own along the way. Good for service lists, capabilities or
 * plan comparisons. Pure DOM + CSS 3D, no WebGL.
 *
 * How it moves
 * - One number drives everything: progress u in 0..1. Input moves a virtual track 3.1 stage heights long; progress chases
 *   it with exponential damping at about 4.5 per second.
 * - fitN(x, a, b) = clamp((x - a) / (b - a), 0, 1). OUT = cubic-bezier(.22,1,.36,1), SPRING = cubic-bezier(.28,1.3,.36,1),
 *   GLIDE = cubic-bezier(.33,.55,.2,1). Per card p = 0..3, s = flipStagger/100, k = [0, 2.1, 4, 5.3][p]:
 *     x    = pile + (p*(W - cw)/3 - pile) * OUT(fitN(u, .13, .52)), pile = (W - cw)/2
 *     open = u < .3 ? OUT(fitN(u, .04, .2)) : 1 - GLIDE(fitN(u, .3, .62))
 *     rz   = sign(p - 1.5) * |p - 1.5|^1.1 * fanTilt * open
 *     f    = fitN(u, .42 + p*s, .97 - (3 - p)*s)
 *     ry   = 180 * (1 - SPRING(f*f))
 *     env  = smoothstep(fitN(u, .05, .18)) * (1 - smoothstep(fitN(u, .8, .98)))
 *     y    = -.5*bob*sin^2(PI*f) + .9*bob*(.62*sin(2.6*time + k) + .38*sin(4.1*time + 1.7*k))*env
 *   transform = translate3d(x, y, 0) rotateZ(rz) rotateY(ry). Faces use backface-visibility: hidden; the back is
 *   pre-rotated 180deg.
 * - Narrow screens (viewport <= 812 px): one column rising through the stage, cards dealt in from alternate sides.
 *   q = card centre / stage height, end = max(.5, q at the end of the track); ry uses f = fitN(q, end + .6, end);
 *   rest = 1 - OUT(fitN(q, end + .72, end + .1)) gives x = side*.07*width*rest and rz = side*fanTilt*.5*rest.
 *   No spread or float there.
 * - Wheel 1:1 on the track; vertical drag (1 px = track / (1.6 x stage height)); arrow / page keys 1/8 of the track,
 *   Home / End. A wheel gesture that moved the cards is swallowed at the end until it pauses 250 ms; then the page
 *   scrolls only after the cards settled and you push another 100 px outward.
 *
 * Options
 *   params.fanTilt      0..20, default 7    degrees the fan opens (outer cards x1.56, inner x0.47)
 *   params.flipStagger  0..12, default 6    percent of the track between neighbouring flips
 *   params.bob          0..24, default 12   px of hover; the lift while flipping is .5 of it
 *   reducedMotion       true / false / null
 *
 * API
 *   const fx = mountScrollCardDeal(element);
 *   fx.setParams({fanTilt: 12}); fx.setPaused(bool); fx.reset(); fx.setReducedMotion(bool); fx.destroy();
 *
 * Usage
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountScrollCardDeal(document.getElementById('stage'));</script>
 *
 * Safe to change
 * - Card faces: front(i) and back() in the mount function return HTML. Card count is fixed at four.
 * - Colours, radius, shadow via CSS variables; card size via the layout function (width = wrap * 0.225, height = 1.4 x).
 *
 * Do not change (the feel breaks)
 * - Fan, then slide, then turn; all four sliding together; the spring landing; the hover staying out of step between cards.
 * - Do not let a framework re-render the cards while the effect runs; it writes transforms to them directly.
 *
 * Porting
 * - Mount once after the element is in the DOM; call fx.destroy() on unmount. Render an empty container.
 * - It scrolls its own virtual track, not the page. To bind to page scroll, drive the target from your own scroll value.
 *
 * Accessibility and reduced motion
 * - The board is a focusable group with a focus ring; faces are aria-hidden. Give real content its own accessible text.
 * - With reduced motion the four cards are shown face-up and flat: in one row on wide screens, in one column on narrow
 *   screens (viewport <= 812 px). no float.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
  const R = { clamp, damp };

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
    { key: 'fanTilt', type: 'range', default: 7, min: 0, max: 20, step: 1 },
    { key: 'flipStagger', type: 'range', default: 6, min: 0, max: 12, step: 1 },
    { key: 'bob', type: 'range', default: 12, min: 0, max: 24, step: 1 },
  ];

  // ---- the effect ----
  const N = 4;
  const SERVICES = [
    ['Strategy', 'Find the angle'],
    ['Design', 'Shape the look'],
    ['Build', 'Make it real'],
    ['Launch', 'Ship and grow'],
  ];
  const GLYPHS = [
    '<circle cx="50" cy="50" r="34"/>',
    '<path d="M50 16v68M16 50h68"/>',
    '<rect x="20" y="20" width="60" height="60"/>',
    '<path d="M24 24l52 52M76 24L24 76"/>',
  ];
  const glyph = (i) =>
    '<svg class="deal-glyph" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" aria-hidden="true">' +
    GLYPHS[i] +
    '</svg>';
  const BACK =
    '<svg class="deal-back-mark" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="20" cy="20" r="17"/><circle cx="20" cy="20" r="10.5"/><circle cx="20" cy="20" r="4" fill="currentColor" stroke="none"/></svg>';
  function defaultFront(i) {
    const s = SERVICES[i];
    return (
      '<div class="deal-front"><div class="deal-art"' +
      (i === 1 ? ' data-accent' : '') +
      '>' +
      glyph(i) +
      '</div><span class="deal-name">' +
      s[0] +
      '</span><span class="deal-line">' +
      s[1] +
      '</span></div>'
    );
  }
  function defaultBack() {
    return '<div class="deal-back">' + BACK + '</div>';
  }
  const fitN = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
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
  const OUT = cubicBezier(0.22, 1, 0.36, 1),
    SPRING = cubicBezier(0.28, 1.3, 0.36, 1),
    GLIDE = cubicBezier(0.33, 0.55, 0.2, 1);
  const turn = (f) => 180 * (1 - SPRING(f * f));
  const lift = (f) => {
    const k = Math.sin(Math.PI * f);
    return k * k;
  };
  const fanStep = (p) => {
    const d = p - 1.5;
    return Math.sign(d) * Math.pow(Math.abs(d), 1.1);
  };
  function rowPose(p, u, W, cw, par) {
    const pile = (W - cw) / 2,
      n = fitN(u, 0.13, 0.52),
      open = u < 0.3 ? OUT(fitN(u, 0.04, 0.2)) : 1 - GLIDE(fitN(u, 0.3, 0.62)),
      s = par.flipStagger / 100;
    return {
      x: pile + ((p * (W - cw)) / 3 - pile) * OUT(n),
      rz: fanStep(p) * par.fanTilt * open,
      f: fitN(u, 0.42 + p * s, 0.97 - (3 - p) * s),
      ry: turn,
    };
  }
  const PHASE = [0, 2.1, 4, 5.3];
  const hover = (p, time, bob) => {
    const k = PHASE[p];
    return { y: bob * 0.9 * (0.62 * Math.sin(time * 2.6 + k) + 0.38 * Math.sin(time * 4.1 + k * 1.7)), sway: 0 };
  };
  const hoverEnv = (u) => {
    const a = fitN(u, 0.05, 0.18),
      b = fitN(u, 0.8, 0.98);
    return a * a * (3 - 2 * a) * (1 - b * b * (3 - 2 * b));
  };
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const opt = options.card || {},
      front = opt.front || defaultFront,
      back = opt.back || defaultBack;
    element.classList.add('deal-stage');
    element.innerHTML =
      '<div class="deal-wrap" aria-hidden="true">' +
      Array.from(
        { length: N },
        (_, i) =>
          '<div class="deal-card"><div class="deal-face deal-face-front">' +
          front(i) +
          '</div><div class="deal-face deal-face-back">' +
          back(i) +
          '</div></div>',
      ).join('') +
      '</div>';
    const wrap = element.querySelector('.deal-wrap'),
      cards = [...element.querySelectorAll('.deal-card')];
    const FOLLOW = 0.22,
      RESTORE = 0.5;
    let progress = 0,
      target = 0,
      top = 0,
      extent = 1,
      handTime = 0,
      handSent = 0,
      drag = null,
      restoring = null;
    const isNarrow = opt.narrow || (() => innerWidth <= 812);
    let narrow = false,
      ch = 0,
      step = 0,
      y0 = 0;
    function layout() {
      narrow = !!isNarrow();
      element.classList.toggle('deal-narrow', narrow);
      if (narrow) {
        const w = wrap.clientWidth;
        ch = Math.min(w * 0.68, api.height * 0.5);
        const gap = Math.max(20, ch * 0.16);
        step = ch + gap;
        y0 = api.height - ch * 0.3;
        cards.forEach((c) => {
          c.style.height = ch + 'px';
        });
        extent = Math.max(1, y0 + 3 * step + ch - api.height + gap);
      } else {
        cards.forEach((c) => {
          c.style.height = '';
        });
        extent = api.height * 3.1;
      }
      top = target * extent;
    }
    api.on('resize', layout);
    function set(v) {
      top = R.clamp(v, 0, extent);
      target = top / extent;
      api.wake();
      if (api.reduced) api.paint();
    }
    function nudge(d) {
      const was = top;
      set(top + d);
      if (top !== was) {
        restoring = null;
        if (opt.touched) opt.touched();
      }
      return top - was;
    }
    {
      const gap = opt.wheelLatch || !options.card ? 250 : 0,
        push = opt.endPush === true ? 100 : opt.endPush || 0;
      let wheelAt = -1e9,
        held = false,
        pushed = 0,
        pushDir = 0,
        pushAt = -1e9;
      api.listen(
        element,
        'wheel',
        (ev) => {
          if (ev.ctrlKey || api.paused) return;
          const d = ev.deltaY * (ev.deltaMode === 1 ? 32 : ev.deltaMode === 2 ? api.height : 1);
          if (!d) return;
          const now = performance.now();
          if (now - wheelAt > gap) held = false;
          wheelAt = now;
          if ((d < 0 && top <= 0) || (d > 0 && top >= extent)) {
            if (gap && held) {
              ev.preventDefault();
              return;
            }
            if (push) {
              if (Math.sign(d) !== pushDir || now - pushAt > 1200) pushed = 0;
              pushDir = Math.sign(d);
              pushAt = now;
              if (Math.abs(progress - target) > 0.01) {
                pushed = 0;
                ev.preventDefault();
                return;
              }
              if (pushed < push) {
                pushed += Math.abs(d);
                ev.preventDefault();
                return;
              }
            }
            return;
          }
          held = true;
          pushed = 0;
          ev.preventDefault();
          nudge(d);
        },
        { passive: false },
      );
      const release = () => {
        if (!drag) return;
        const pid = drag.id;
        drag = null;
        element.classList.remove('deal-dragging');
        if (element.hasPointerCapture(pid)) element.releasePointerCapture(pid);
      };
      api.listen(element, 'pointerdown', (ev) => {
        if (ev.button !== 0 || api.paused) return;
        release();
        drag = { id: ev.pointerId, y: ev.clientY, touch: ev.pointerType !== 'mouse' };
        element.setPointerCapture(ev.pointerId);
        element.classList.add('deal-dragging');
      });
      api.listen(element, 'pointermove', (ev) => {
        if (!drag || ev.pointerId !== drag.id || api.paused) return;
        const dy = drag.y - ev.clientY;
        drag.y = ev.clientY;
        if (!dy) return;
        const k = extent / (1.6 * api.height),
          left = dy * k - nudge(dy * k);
        if (drag.touch && Math.abs(left) > 0.5) window.scrollBy(0, left / k);
      });
      api.listen(element, 'pointerup', release);
      api.listen(element, 'pointercancel', release);
      api.listen(element, 'lostpointercapture', release);
      api.listen(element, 'keydown', (ev) => {
        const k = ev.key;
        if (api.paused || ev.altKey || ev.ctrlKey || ev.metaKey) return;
        let to;
        if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') to = top + extent / 8;
        else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') to = top - extent / 8;
        else if (k === 'Home') to = 0;
        else if (k === 'End') to = extent;
        else return;
        to = R.clamp(to, 0, extent);
        if (Math.abs(to - top) < 0.5) return;
        ev.preventDefault();
        nudge(to - top);
      });
      api.on('destroy', release);
    }
    api.restore = () => {
      if (api.reduced) {
        progress = target = 1;
        top = extent;
        api.paint();
        return;
      }
      restoring = { t: 0, from: progress };
      top = 0;
      target = 0;
      api.wake();
    };
    api.on('motion', (reduced) => {
      if (reduced) {
        progress = target = 1;
        top = extent;
      } else {
        progress = target = top = 0;
      }
    });
    api.on('replay', () => {
      progress = target = top = 0;
      handTime = handSent = 0;
      restoring = null;
    });
    if (api.reduced) {
      progress = target = 1;
    }
    api.frame(({ dt, time, params, reduced }) => {
      if (reduced) progress = 1;
      else if (restoring) {
        restoring.t += dt;
        const u = Math.min(1, restoring.t / RESTORE);
        progress = restoring.from * (1 - OUT(u));
        if (u >= 1) restoring = null;
      } else progress = R.damp(progress, target, 1 / FOLLOW, dt);
      if (narrow !== !!isNarrow()) layout();
      if (narrow) {
        const off = progress * extent,
          w = wrap.clientWidth,
          H = api.height;
        wrap.style.perspectiveOrigin = 'center 50%';
        cards.forEach((card, p) => {
          const q = (y0 + p * step - off + ch / 2) / H,
            end = Math.max(0.5, (y0 + p * step - extent + ch / 2) / H),
            side = p % 2 ? 1 : -1,
            rest = reduced ? 0 : 1 - OUT(fitN(q, end + 0.72, end + 0.1));
          const ry = reduced ? 0 : turn(fitN(q, end + 0.6, end));
          card.style.transform =
            'translate3d(' +
            (side * w * 0.07 * rest).toFixed(2) +
            'px,' +
            (y0 + p * step - off).toFixed(2) +
            'px,0) rotateZ(' +
            (side * params.fanTilt * 0.5 * rest).toFixed(3) +
            'deg) rotateY(' +
            ry.toFixed(2) +
            'deg)';
        });
        element.dataset.progress = progress.toFixed(4);
        return !reduced && (!!restoring || Math.abs(progress - target) > 0.0001);
      }
      wrap.style.perspectiveOrigin = '';
      const W = wrap.clientWidth,
        cw = cards[0].offsetWidth,
        env = hoverEnv(progress);
      cards.forEach((card, p) => {
        if (reduced) {
          card.style.transform = 'translate3d(' + ((p * (W - cw)) / 3).toFixed(2) + 'px,0,0)';
          return;
        }
        const o = rowPose(p, progress, W, cw, params),
          h = hover(p, time, params.bob),
          y = h.y * env - params.bob * 0.5 * lift(o.f),
          rz = o.rz + h.sway * env;
        card.style.transform =
          'translate3d(' +
          o.x.toFixed(2) +
          'px,' +
          y.toFixed(2) +
          'px,0) rotateZ(' +
          rz.toFixed(3) +
          'deg) rotateY(' +
          o.ry(o.f).toFixed(2) +
          'deg)';
      });
      element.dataset.progress = progress.toFixed(4);
      const bobbing = params.bob > 0 && env > 0.002;
      return !reduced && (!!restoring || Math.abs(progress - target) > 0.0001 || bobbing);
    });
    layout();
    api.paint();
    const status = api.status;
    api.status = () => ({ ...status(), progress, target, extent });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountScrollCardDeal(element, options) {
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
    element.classList.add('scroll-card-deal');
    element.innerHTML =
      '<div class="fx-board" data-deal-board tabindex="0" role="group" aria-label="Four service cards. Scroll, drag, or use arrow keys."></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-deal-board]'),
      narrow = matchMedia('(max-width:760px)'),
      wide = matchMedia('(min-width:813px)');
    const inst = mount(board, {
      params: options.params,
      card: {
        interactive: true,
        endPush: true,
        wheelLatch: true,
        narrow: () => !wide.matches,
      },
    });
    const wrap = board.querySelector('.deal-wrap'),
      cards = [...board.querySelectorAll('.deal-card')];
    function layout() {
      if (!wide.matches) {
        const W = stage.clientWidth,
          H = stage.clientHeight,
          w = Math.min(W - 48, 420);
        Object.assign(wrap.style, { left: (W - w) / 2 + 'px', top: '0px', width: w + 'px', height: H + 'px' });
        board.style.setProperty('--fx-k', (w / 260).toFixed(4));
        inst.measure();
        return;
      }
      const W = stage.clientWidth,
        H = stage.clientHeight,
        pad = narrow.matches ? 16 : 40,
        bob = 24;
      let w = Math.min(W - pad * 2, (H - 2 * bob - pad * 2) / 1.4 / 0.225, 980),
        top = null;
      const Z = panelZone(stage),
        R = Z.right + 16;
      if (!narrow.matches && (W - w) / 2 < R) {
        if (W - 2 * R >= w * 0.85) w = W - 2 * R;
        else {
          top = Math.max((H - w * 0.225 * 1.4) / 2, Z.bottom + 24 + bob);
          w = Math.min(w, (H - top - bob - pad) / 1.4 / 0.225);
        }
      }
      const cw = w * 0.225,
        h = cw * 1.4,
        left = (W - w) / 2;
      if (top === null) top = (H - h) / 2;
      Object.assign(wrap.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
      cards.forEach((c) => (c.style.width = cw + 'px'));
      inst.measure();
      board.style.setProperty('--fx-k', (cw / 150).toFixed(4));
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
  global.mountScrollCardDeal = mountScrollCardDeal;
  if (typeof module === 'object' && module.exports) module.exports = mountScrollCardDeal;
})(typeof window !== 'undefined' ? window : this);
