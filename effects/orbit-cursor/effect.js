/*
 * Orbit Cursor
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A round dial with two dots on its inner track. Move the pointer over it and the blue dot swings round to point at
 * you along the shortest arc; click and the dark "hour" dot turns to that spot. Good as a small toy in a header corner,
 * a "point here" hint or a direction / time themed detail.
 *
 * How it moves
 * - Direction only: the bearing from the dial centre to the pointer is atan2(dx, -dy), 0 degrees at 12 o'clock,
 *   clockwise. Nothing on the dial translates; only the two dots rotate.
 * - Follow dot: every pointermove starts a fresh tween from the current angle to the new one, params.followTime long,
 *   ease cubic-bezier(0.22, 1, 0.36, 1) (strong ease-out). The target is unwrapped to the nearest equivalent angle
 *   (difference folded into -180..180), so it never goes the long way round. Restarting the tween on every move is
 *   what gives the soft lag on fast moves.
 * - Enter: when the pointer enters the zone the stage gets .is-active and CSS does the rest: the dial grows from d to
 *   d x 1.18 (400 ms, same ease-out), the shadow lifts, and both dots grow from 0.125 d to 0.165 d, starting 120 ms
 *   after the dial. The blue dot fades in over 200 ms. Leave reverses it: the hour dot shrinks at once, the blue dot
 *   fades out over 300 ms.
 * - Click inside the dial: the hour dot turns to the clicked angle along the shortest arc in 650 ms,
 *   ease cubic-bezier(0.6, 0, 0.3, 1).
 * - Dial size: d = min(min(width, height) x 0.56 x ringSize / 260, width x 0.74, height x 0.74). Dot centres sit
 *   0.2 d below the top of the dial. The hour dot starts at 305 degrees.
 * - Zone: "ring" means only the dial circle reacts; "stage" means anywhere on the element. Outside the zone counts
 *   as leave.
 *
 * Options
 *   params.followTime  150..900 ms, default 400   duration of each follow tween; higher = lazier dot
 *   params.ringSize    160..320, default 260     dial size; 260 = 56% of the shorter side of the element
 *   params.zone        "ring" | "stage", default "ring"   area that drives the follow dot
 *   reducedMotion      true / false / null       force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountOrbitCursor(element, {params: {...}, reducedMotion: null});
 *   fx.params                       copy of current params
 *   fx.setParams({followTime: 600}) change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)        freeze / resume; pointer input is ignored while paused
 *   fx.reset()                      params back to defaults, hour dot back to 305 degrees (650 ms)
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()                    removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountOrbitCursor(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Colours via the CSS variables on .orbit-cursor (--fx-accent is the follow dot, --fx-ink the hour dot), the dial
 *   shadow, the tick marks (.dial-tick) and the dotted background.
 * - The 305 degree start angle and the 0.56 / 0.74 sizing factors in mountOrbitCursor.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The shortest-arc unwrapping. Without it the dot spins all the way round when the pointer crosses 12 o'clock.
 * - Restarting the ease-out tween on every pointermove. A spring, a CSS transition on transform or a lerp per frame
 *   feel different.
 * - The 1.18 swell, the 0.125 d -> 0.165 d dot growth and the 120 ms dot lag; together they make the "wake up".
 * - Do not let a framework re-render the dial elements; the effect writes rotate() to them every frame.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountOrbitCursor on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The dial is a focusable role="button" (tabindex 0) labelled "Orbit dial..." with a focus ring on keyboard focus.
 *   ArrowLeft / ArrowRight turn the follow dot 15 degrees (half an hour; Shift: 30 degrees, a whole hour), Enter or
 *   Space sets the hour dot there (like a click), Escape or leaving the dial lets go. A polite live region says
 *   "Pointing at 16:10." / "Hand set to 16:40.".. The face itself is aria-hidden.
 * - With reduced motion: no CSS transitions; the dots jump straight to their angles.
 *   Pointer and click still work.
 * - The animation loop runs only while something moves: when both dots have arrived it stops, and
 *   the next pointer move, click, key or reset wakes it. It also stops when the tab is hidden, the element is off screen
 *   or it is paused. A page unload (pagehide that is not a back/forward cache) destroys the instance.
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
    { key: 'followTime', type: 'range', default: 400, min: 150, max: 900, step: 50 },
    { key: 'ringSize', type: 'range', default: 260, min: 160, max: 320, step: 10 },
    { key: 'zone', type: 'select', default: 'stage', options: [{ value: 'stage' }, { value: 'ring' }] },
  ];

  // ---- the effect ----
  const SET_MS = 650,
    HOME_MS = 1000;
  const CARD_FILL = 0.62;
  const KEYS = ['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape'],
    RAD = Math.PI / 180;
  function bezierEase(x1, y1, x2, y2) {
    const axis = (c1, c2) => {
      const a = 1 + 3 * c1 - 3 * c2,
        b = 3 * c2 - 6 * c1,
        c = 3 * c1;
      return { at: (s) => ((a * s + b) * s + c) * s, slope: (s) => (3 * a * s + 2 * b) * s + c };
    };
    const X = axis(x1, x2),
      Y = axis(y1, y2),
      STEPS = 32,
      table = [];
    for (let i = 0; i <= STEPS; i++) table.push(X.at(i / STEPS));
    return (p) => {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      let i = 1;
      while (i < STEPS && table[i] < p) i++;
      const lo = table[i - 1],
        hi = table[i];
      let s = (i - 1 + (hi > lo ? (p - lo) / (hi - lo) : 0)) / STEPS;
      for (let pass = 0; pass < 2; pass++) {
        const g = X.slope(s);
        if (Math.abs(g) < 1e-6) break;
        s = Math.min(1, Math.max(0, s - (X.at(s) - p) / g));
      }
      return Y.at(s);
    };
  }
  const FOLLOW_EASE = bezierEase(0.22, 1, 0.36, 1),
    HAND_EASE = bezierEase(0.6, 0, 0.3, 1);
  const wrap = (d) => d - 360 * Math.round(d / 360);
  const two = (n) => (n < 10 ? '0' : '') + n;
  const clockText = (mins) => two(Math.floor(mins / 60) % 24) + ':' + two(mins % 60);
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('orbit-stage');
    const card = options.card || null;
    const markers =
      '<div class="orbit-rot orbit-hour" aria-hidden="true">' +
      (card.mark ? card.mark('hour') : '<i></i>') +
      '</div><div class="orbit-rot orbit-follow" aria-hidden="true">' +
      (card.mark ? card.mark('follow') : '<i></i>') +
      '</div>';
    {
      const role =
        ' role="button" tabindex="0" aria-label="Orbit dial. Left and right arrow keys turn the dot, Shift for whole hours; Enter or Space sets the hour hand there; Escape lets go."';
      element.innerHTML =
        '<div class="orbit-wrap"><div class="orbit"' +
        role +
        '><div class="orbit-ring" aria-hidden="true">' +
        (card.face ? card.face() : '') +
        '</div>' +
        markers +
        '</div></div>' +
        '<p class="cr-sr orbit-live" aria-live="polite"></p>';
    }
    const pick = (sel) => element.querySelector(sel);
    const orbit = pick('.orbit'),
      hourEl = pick('.orbit-hour'),
      followEl = pick('.orbit-follow'),
      label = pick('.orbit-label'),
      hText = pick('.orbit-h'),
      mText = pick('.orbit-m'),
      live = pick('.orbit-live');
    let awake = false,
      afternoon = false,
      lastBearing = 0,
      travelled = false,
      skewMs = 0,
      elapsed = 0,
      minuteTimer = 0;
    let loopIndex = -1;
    const turn = (ease) => ({ angle: 0, from: 0, goal: 0, since: 0, ms: 0, ease });
    const follower = turn(FOLLOW_EASE),
      hourHand = turn(HAND_EASE);
    function aim(t, goal, ms, ease) {
      t.from = t.angle;
      t.goal = goal;
      t.since = elapsed;
      t.ease = ease;
      t.ms = api.reduced ? 0 : ms;
      if (!t.ms) {
        t.angle = goal;
        api.paint();
      } else api.wake();
    }
    function advance(t) {
      if (!t.ms) {
        t.angle = t.goal;
        return false;
      }
      const k = Math.min(1, ((elapsed - t.since) * 1000) / t.ms);
      t.angle = t.from + (t.goal - t.from) * t.ease(k);
      if (k < 1) return true;
      t.ms = 0;
      return false;
    }
    const centre = () => {
      const b = orbit.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2, w: b.width };
    };
    const bearing = (x, y) => {
      const c = centre();
      return (Math.atan2(x - c.x, c.y - y) / RAD + 360) % 360;
    };
    const pointAt = (deg, dist) => {
      const c = centre();
      return { x: c.x + Math.sin(deg * RAD) * dist, y: c.y - Math.cos(deg * RAD) * dist };
    };
    const inZone = (x, y) => {
      if (api.params.zone === 'stage') return true;
      const c = centre();
      return Math.hypot(x - c.x, y - c.y) <= c.r;
    };
    function fit() {
      const w = element.clientWidth,
        h = element.clientHeight,
        want = api.params.ringSize;
      let d;
      {
        const cap = +card.fill || CARD_FILL;
        d = Math.min(want * (+card.scale || 1), (h || 1) * cap, (w || 1) * cap);
      }
      element.style.setProperty('--d', Math.round(d) + 'px');
    }
    const dayMinutes = () => {
      const t = new Date(Date.now() + skewMs);
      return t.getHours() * 60 + t.getMinutes();
    };
    const handAngleNow = () => (dayMinutes() % 720) / 2;
    const minutesAt = (deg) => (Math.floor(deg * 2) % 720) + (afternoon ? 720 : 0);
    function writeReadout(mins) {
      if (!hText) return;
      hText.textContent = two(Math.floor(mins / 60) % 24);
      mText.textContent = two(mins % 60);
    }
    const showClock = () => writeReadout(dayMinutes());
    const say = (text) => {
      if (live) live.textContent = text;
    };
    const startAngle = () => +card.start || 0;
    function rouse() {
      if (awake) return;
      awake = true;
      element.classList.add('is-active');
      afternoon = dayMinutes() >= 720;
    }
    function release() {
      if (!awake) return;
      awake = false;
      element.classList.remove('is-active');
      showClock();
    }
    function track(x, y) {
      if (api.paused) return;
      const b = bearing(x, y);
      if (!awake) {
        rouse();
        lastBearing = b;
        follower.angle = follower.goal = hourHand.angle;
      }
      if (Math.abs(b - lastBearing) > 180) afternoon = !afternoon;
      lastBearing = b;
      aim(follower, follower.goal + wrap(b - follower.goal), api.params.followTime, FOLLOW_EASE);
      writeReadout(minutesAt(b));
    }
    function setHand(x, y) {
      if (api.paused) return;
      const b = bearing(x, y),
        mins = minutesAt(b),
        then = new Date();
      then.setHours(0, mins, 0, 0);
      skewMs = then - Date.now();
      aim(hourHand, hourHand.angle + wrap(b - hourHand.angle), SET_MS, HAND_EASE);
      travelled = true;
      element.classList.add('is-travel');
      if (label) label.tabIndex = 0;
      say('Hand set to ' + clockText(mins) + '.');
    }
    function goHome() {
      skewMs = 0;
      travelled = false;
      element.classList.remove('is-travel');
      if (label) label.tabIndex = -1;
      aim(hourHand, hourHand.angle + wrap(handAngleNow() - hourHand.angle), HOME_MS, HAND_EASE);
      showClock();
      say('Back to the current time.');
    }
    api.listen(element, 'pointermove', (e) => {
      {
      }
      if (e.target.closest('.orbit-label')) {
        release();
        return;
      }
      if (inZone(e.clientX, e.clientY)) track(e.clientX, e.clientY);
      else release();
    });
    api.listen(element, 'pointerleave', () => {
      release();
    });
    api.listen(orbit, 'click', (e) => {
      if (e.detail === 0) return;
      setHand(e.clientX, e.clientY);
    });
    api.listen(element, 'click', (e) => {
      if (e.target.closest('.orbit,.orbit-label') || api.params.zone !== 'stage') return;
      setHand(e.clientX, e.clientY);
    });
    if (label)
      api.listen(label, 'click', (e) => {
        e.stopPropagation();
        if (travelled) goHome();
      });
    api.listen(orbit, 'keydown', (e) => {
      if (!KEYS.includes(e.key) || api.paused) return;
      e.preventDefault();
      if (e.key === 'Escape') {
        release();
        return;
      }
      const nudge = e.key === 'ArrowRight' ? 15 : e.key === 'ArrowLeft' ? -15 : 0,
        p = pointAt((awake ? lastBearing : hourHand.angle) + nudge, centre().w);
      if (e.key === 'Enter' || e.key === ' ') setHand(p.x, p.y);
      else track(p.x, p.y);
    });
    api.listen(orbit, 'keydown', (e) => {
      if (!KEYS.includes(e.key) || api.paused) return;
      if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const p = pointAt(lastBearing + (e.key === 'ArrowRight' ? 15 : -15), centre().w);
        track(p.x, p.y);
      }
      if (!live) return;
      if (e.key === 'Escape') {
        live.textContent = '';
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (card.touched) card.touched();
      } else live.textContent = 'Pointing at ' + clockText(minutesAt(((lastBearing % 360) + 360) % 360)) + '.';
    });
    api.listen(orbit, 'blur', release);
    {
      api.listen(orbit, 'click', (e) => {
        if (e.detail !== 0 && !api.paused && card.touched) card.touched();
      });
      api.restore = () => {
        release();
        skewMs = 0;
        travelled = false;
        element.classList.remove('is-travel');
        aim(hourHand, hourHand.angle + wrap((+card.start || 0) - hourHand.angle), SET_MS, HAND_EASE);
        follower.angle = follower.goal = hourHand.goal;
        follower.ms = 0;
        api.paint();
        api.wake();
      };
    }
    api.on('params', fit);
    api.on('resize', fit);
    api.on('replay', () => {
      release();
      skewMs = 0;
      travelled = false;
      element.classList.remove('is-travel');
      hourHand.angle = hourHand.goal = startAngle();
      hourHand.ms = 0;
      follower.angle = follower.goal = hourHand.angle;
      follower.ms = 0;
      loopIndex = -1;
      showClock();
      api.paint();
    });
    api.on('visibility', (v) => {
      if (v) showClock();
    });
    function nextMinute() {
      clearTimeout(minuteTimer);
      return;
    }
    api.cleanup(() => clearTimeout(minuteTimer));
    api.frame(({ dt, time, reduced }) => {
      elapsed += dt;
      const followTurning = advance(follower),
        hourTurning = advance(hourHand);
      hourEl.style.transform = 'rotate(' + hourHand.angle.toFixed(2) + 'deg)';
      followEl.style.transform = 'rotate(' + follower.angle.toFixed(2) + 'deg)';
      element.dataset.phase = awake ? 'following' : 'idle';
      return followTurning || hourTurning;
    });
    hourHand.angle = hourHand.goal = startAngle();
    follower.angle = follower.goal = hourHand.angle;
    fit();
    showClock();
    nextMinute();
    const baseStatus = api.status;
    api.status = () => ({
      ...baseStatus(),
      active: awake,
      follow: follower.angle,
      followTarget: follower.goal,
      hour: hourHand.angle,
      traveled: travelled,
      readout: hText ? hText.textContent + ':' + mText.textContent : '',
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountOrbitCursor(element, options) {
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
    element.classList.add('orbit-cursor');
    element.innerHTML = '<div class="fx-board" data-orbit></div>';
    const stage = element,
      board = stage.querySelector('[data-orbit]');
    const inst = mount(board, {
      card: {
        start: 305,
        interactive: true,
        fill: 0.74,
        get scale() {
          return (Math.min(stage.clientWidth, stage.clientHeight) * 0.56) / 260;
        },
        face: () =>
          Array.from(
            { length: 12 },
            (_, i) =>
              '<i class="dial-tick"' +
              (i % 3 ? '' : ' data-major') +
              ' style="transform:rotate(' +
              i * 30 +
              'deg)"></i>',
          ).join(''),
        mark: (kind) => (kind === 'follow' ? '<i class="dial-dot" data-accent></i>' : '<i class="dial-dot"></i>'),
      },
      params: Object.assign({}, { zone: 'ring' }, options.params),
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
  global.mountOrbitCursor = mountOrbitCursor;
  if (typeof module === 'object' && module.exports) module.exports = mountOrbitCursor;
})(typeof window !== 'undefined' ? window : this);
