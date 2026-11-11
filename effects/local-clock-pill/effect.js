/*
 * Local Clock Pill
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A white pill that shows a city, an open / closed dot, its UTC offset and the live time with a blinking colon. Hover
 * and the face rolls up to a "Contact us" button. As shipped, the city and time are the visitor's own, taken from the
 * browser's time zone (Shanghai for a visitor in China, New York for one in New York); set a fixed place to show your
 * studio's city instead. Made for a footer, a contact section or a header corner of a studio or agency site.
 *
 * How it moves
 * - The pill holds two faces stacked in an overflow mask: the time face and the contact face right below it.
 * - Hover, keyboard focus or a pin moves both faces up by 100% (translate3d), params.duration ms,
 *   cubic-bezier(.22,1,.36,1). Leaving moves them back the same way. It is a CSS transition on a class (.is-contact),
 *   so a quick in and out reverses from wherever it is.
 * - Click pins the contact face (aria-pressed); a second click unpins it. Hover still works on top of the pin.
 * - The colon is two 8 px dots that blink with a 1 s step animation (on half a second, off half a second).
 *   params.blink = false stops it.
 * - Time: read with Intl.DateTimeFormat, 24 h, in the zone picked by params.zone: by default the place's zone, which
 *   is the visitor's own zone unless you set a fixed one. The offset label comes from the same call (for example UTC+8,
 *   UTC+5:30, UTC-4 in New York in summer), so daylight saving is handled.
 *   It re-renders 20 ms after each full minute, not every frame, and again when the pill comes back into view.
 * - City, with timeZone 'visitor': the browser's zone name (Intl.DateTimeFormat().resolvedOptions().timeZone, read once
 *   on mount), its last part with spaces for underscores: Asia/Shanghai -> Shanghai, America/Argentina/Buenos_Aires ->
 *   Buenos Aires. Browsers still report some old names; the small OLD_NAMES table maps them (Asia/Calcutta -> Kolkata,
 *   Asia/Saigon -> Ho Chi Minh City, Europe/Kiev -> Kyiv, Asia/Katmandu -> Kathmandu, Asia/Rangoon -> Yangon,
 *   America/Godthab -> Nuuk ...). Zones without a city (UTC, Etc/GMT+5) show "Local time". No city database, no
 *   network. The longest name any zone gives (Ho Chi Minh City) still leaves about a quarter of the row free; a longer
 *   custom city is cut with an ellipsis, the row never wraps.
 * - Status dot: accent colour inside the place's hours (default Mon to Fri, 9:00 to 18:00, counted in the place's zone
 *   whatever zone the time is shown in), muted grey otherwise. With the visitor's zone it means "working hours where
 *   you are"; with a fixed studio it means "the studio is open".
 * - Size: the pill is 200 x 132 px of content at scale 1 and grows with the element up to 1.625x, never below 1.
 *
 * Options
 *   params.duration  200..800, default 400    ms for the roll
 *   params.blink     true / false, default true   blinking colon
 *   params.zone      'place' | 'local' | '0' | '1' | '8' | '-5', default 'place'. 'place' = the place's zone (the
 *                    visitor's own as shipped), 'local' = the visitor's zone, a number = that fixed UTC offset. Changes
 *                    apply at once.
 *   reducedMotion    true / false / null      force reduced motion; null follows prefers-reduced-motion live
 *   The place (whose city, zone and hours the pill shows) is the place: {...} inside mountLocalClockPill, two ways:
 *     visitor (as shipped)  {timeZone: 'visitor', hours: [9, 18], days: [1, 2, 3, 4, 5]}
 *     fixed studio          {city: 'Berlin', timeZone: 'Europe/Berlin', hours: [9, 18], days: [1, 2, 3, 4, 5]}
 *   Fields are under Safe to change.
 *
 * API
 *   const fx = mountLocalClockPill(element, {params: {...}, reducedMotion: null});
 *   fx.params                       copy of current params
 *   fx.setParams({duration: 600})   change params live
 *   fx.setPaused(true|false)        freeze / resume (also stops the blink; clicks are ignored while paused)
 *   fx.reset()                      params back to defaults, time face shown, pin cleared
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                    removes listeners, observers, the minute timer
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:420px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountLocalClockPill(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The place, in mountLocalClockPill (the place: {...} passed to mount), one of:
 *   - Visitor (as shipped): timeZone 'visitor'. City, time, offset label and dot all follow the visitor's browser zone.
 *     Leave city out to use the zone's city name, or set one to override it.
 *   - Fixed studio: city (label) and timeZone (any IANA name, for example 'America/New_York'), like
 *     {city: 'Berlin', timeZone: 'Europe/Berlin', hours: [9, 18], days: [1, 2, 3, 4, 5]}.
 *   - Both: hours ([open, close) in local hours there, decimals allowed, default [9, 18]) and days (0 = Sunday ...
 *     6 = Saturday, default Monday to Friday).
 * - OLD_NAMES: add a pair if a browser reports an old zone name you want spelled differently.
 * - The "Contact us" text and arrow in placeRoll, colours, fonts and radius via effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Both faces must move together by exactly 100% of the mask height, with the out-expo curve; the roll should read as
 *   one strip turning, not a fade.
 * - Keep the minute-aligned timer. A per-frame or per-second redraw wastes work and makes the digits flicker.
 * - Keep the step timing on the colon blink; a smooth fade looks like a loading spinner.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - The pill is a button that only toggles the face. To make it a real contact link, add your own click handler on
 *   .clock-pill (mailto, a contact page) or swap it for an anchor and keep the classes.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountLocalClockPill on an embed div with a fixed height.
 * - SSR: only call it in the browser. Server and client clocks differ and the visitor's zone is only known in the
 *   browser, so render the pill on the client only.
 *
 * Accessibility and reduced motion
 * - The button's label is kept current: "<city> HH:MM, <offset>. Within|Outside working hours. Contact us" with the
 *   visitor's zone, "<city> HH:MM, <offset>. Studio open|closed. Contact us" with a fixed studio. aria-pressed tells
 *   whether the contact face is pinned; the contact face itself is aria-hidden. A polite live region announces pin and
 *   unpin ("Showing Contact." / "Showing local time.").
 * - With reduced motion: no roll transition (faces switch instantly) and no blink. The clock still
 *   updates every minute.
 * - The minute timer is cleared by destroy().
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
    {
      key: 'zone',
      type: 'select',
      default: 'place',
      options: [
        { value: 'place' },
        { value: 'local' },
        { value: '0' },
        { value: '1' },
        { value: '8' },
        { value: '-5' },
      ],
    },
    { key: 'duration', type: 'range', default: 400, min: 200, max: 800, step: 50 },
    { key: 'blink', type: 'toggle', default: true },
  ];

  // ---- the effect ----
  const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const OLD_NAMES = {
    Calcutta: 'Kolkata',
    Saigon: 'Ho Chi Minh City',
    Ho_Chi_Minh: 'Ho Chi Minh City',
    Kiev: 'Kyiv',
    Katmandu: 'Kathmandu',
    Rangoon: 'Yangon',
    Godthab: 'Nuuk',
    Asmera: 'Asmara',
    Faeroe: 'Faroe',
  };
  function cityOf(tz) {
    const m =
      /^(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/(?:[\w-]+\/)?([A-Za-z][\w-]*)$/.exec(
        tz || '',
      );
    return m ? OLD_NAMES[m[1]] || m[1].replace(/_/g, ' ') : '';
  }
  function placeOf(p) {
    const visitor = p.timeZone === 'visitor',
      tz = visitor ? new Intl.DateTimeFormat().resolvedOptions().timeZone : p.timeZone;
    return {
      city: p.city || cityOf(tz) || 'Local time',
      timeZone: tz || undefined,
      hours: p.hours || [9, 18],
      days: p.days || [1, 2, 3, 4, 5],
      visitor,
    };
  }
  function placeRoll(place, time) {
    return (
      '<span class="clock-roll"><span class="clock-face clock-face--time"><span class="clock-row"><i class="ck-dot clock-status"></i><span class="clock-city">' +
      place.city +
      '</span><span class="clock-zone"></span></span><span class="clock-time">' +
      time +
      '</span></span><span class="clock-face clock-face--contact" aria-hidden="true"><span class="clock-cta">Contact us<span class="ck-dot ck-solid clock-go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></span></span></span>'
    );
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('clock-stage');
    const cardOpt = options.card || null,
      place = options.place ? placeOf(options.place) : null;
    {
      const time =
        '<span class="clock-h">00</span><span class="clock-dot" aria-hidden="true">' +
        (cardOpt.dot ? cardOpt.dot() + cardOpt.dot() : '<i></i><i></i>') +
        '</span><span class="clock-m">00</span>';
      element.innerHTML = cardOpt.pill(place ? placeRoll(place, time) : time);
    }
    if (place) element.classList.add('has-place');
    else
      element.innerHTML =
        '<div class="clock-wrap"><button type="button" class="clock-pill" aria-pressed="false" aria-describedby="clock-help"><span class="clock-roll"><span class="clock-face clock-face--time"><span class="clock-label"><span>Local time</span><span class="clock-zone"></span></span><span class="clock-time"><span class="clock-h">00</span><span class="clock-dot" aria-hidden="true"><i></i><i></i></span><span class="clock-m">00</span></span><span class="clock-sub"><span class="clock-date"></span><span>Studio</span></span></span><span class="clock-face clock-face--contact" aria-hidden="true"><span class="clock-label"><span>Contact</span><span>Studio</span></span><span class="clock-cta">Say hello <b aria-hidden="true">→</b></span><span class="clock-sub"><span>studio@example.com</span><span>Reply &lt; 24h</span></span></span></span></button><p class="clock-caption" id="clock-help" data-cr-chrome>Hover or focus to show Contact · Click to pin</p></div><p class="cr-sr clock-live" aria-live="polite"></p>';
    const pill = element.querySelector('.clock-pill'),
      hEl = element.querySelector('.clock-h'),
      mEl = element.querySelector('.clock-m'),
      zoneEl = element.querySelector('.clock-zone'),
      dateEl = element.querySelector('.clock-date'),
      live = element.querySelector('.clock-live'),
      statusEl = element.querySelector('.clock-status');
    const fmt = (tz) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'shortOffset',
      });
    const offset = (p) => p.timeZoneName.replace('GMT', 'UTC').replace('-', '−');
    const placeClock = place && fmt(place.timeZone);
    let shownZone = null,
      shownClock = placeClock;
    function parts(f) {
      return Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
    }
    function shownFmt() {
      const z = api.params.zone,
        tz =
          z === 'place'
            ? place.timeZone
            : z === 'local'
              ? undefined
              : Number(z) === 0
                ? 'Etc/UTC'
                : 'Etc/GMT' + (Number(z) > 0 ? '-' : '+') + Math.abs(Number(z));
      if (z !== shownZone) {
        shownZone = z;
        shownClock = z === 'place' ? placeClock : fmt(tz);
      }
      return shownClock;
    }
    let timer = 0,
      hover = false,
      pinned = false;
    function now() {
      if (cardOpt.time)
        return {
          h: cardOpt.time.h,
          m: cardOpt.time.m,
          date: '',
          day: cardOpt.time.day,
          zone: cardOpt.time.zone || (place ? offset(parts(shownFmt())) : ''),
        };
      if (place) {
        const p = parts(shownFmt()),
          q = shownClock === placeClock ? p : parts(placeClock);
        return {
          h: Number(p.hour),
          m: Number(p.minute),
          date: '',
          day: WEEK.indexOf(p.weekday),
          zone: offset(p),
          ph: Number(q.hour) % 24,
          pm: Number(q.minute),
          pday: WEEK.indexOf(q.weekday),
        };
      }
      const zone = api.params.zone,
        d = new Date();
      if (zone === 'local' || zone === 'place')
        return {
          h: d.getHours(),
          m: d.getMinutes(),
          date: d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }),
        };
      const t = new Date(d.getTime() + Number(zone) * 3600e3);
      return {
        h: t.getUTCHours(),
        m: t.getUTCMinutes(),
        date: t.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }),
      };
    }
    function zoneLabel() {
      const z = api.params.zone;
      if (z === 'local' || z === 'place') {
        const o = -new Date().getTimezoneOffset() / 60;
        return 'UTC' + (o === 0 ? '' : (o > 0 ? '+' : '−') + Math.abs(o));
      }
      const n = Number(z);
      return 'UTC' + (n === 0 ? '' : (n > 0 ? '+' : '−') + Math.abs(n));
    }
    function render() {
      const t = now(),
        h = String(t.h).padStart(2, '0'),
        m = String(t.m).padStart(2, '0');
      hEl.textContent = h;
      mEl.textContent = m;
      dateEl.textContent = t.date;
      if (place) {
        const ph = t.ph === undefined ? t.h : t.ph,
          pm = t.pm === undefined ? t.m : t.pm,
          pd = t.pday === undefined ? t.day : t.pday,
          at = ph + pm / 60,
          open = place.days.includes(pd) && at >= place.hours[0] && at < place.hours[1];
        zoneEl.textContent = t.zone;
        statusEl.toggleAttribute('data-accent', open);
        statusEl.toggleAttribute('data-weak', !open);
        pill.setAttribute(
          'aria-label',
          place.city +
            ' ' +
            h +
            ':' +
            m +
            ', ' +
            t.zone +
            '. ' +
            (place.visitor
              ? (open ? 'Within' : 'Outside') + ' working hours'
              : 'Studio ' + (open ? 'open' : 'closed')) +
            '. Contact us',
        );
        return;
      }
      zoneEl.textContent = zoneLabel();
      pill.setAttribute('aria-label', 'Local time ' + h + ':' + m + ', ' + zoneLabel() + '. Contact us');
    }
    function schedule() {
      clearTimeout(timer);
      if (api.destroyed) return;
      const wait = 60000 - (Date.now() % 60000) + 20;
      timer = setTimeout(() => {
        render();
        schedule();
      }, wait);
    }
    function sync() {
      const open = hover || pinned;
      element.classList.toggle('is-contact', open);
      pill.setAttribute('aria-pressed', String(pinned));
    }
    function apply() {
      element.style.setProperty('--roll', api.params.duration + 'ms');
      element.classList.toggle('no-blink', !api.params.blink);
      render();
    }
    api.listen(pill, 'pointerenter', (e) => {
      if (e.pointerType !== 'touch' && !api.paused) {
        hover = true;
        sync();
      }
    });
    api.listen(pill, 'pointerleave', (e) => {
      if (e.pointerType !== 'touch') {
        hover = false;
        sync();
      }
    });
    api.listen(pill, 'focus', () => {
      if (pill.matches(':focus-visible')) {
        hover = true;
        sync();
      }
    });
    api.listen(pill, 'blur', () => {
      hover = false;
      sync();
    });
    api.listen(pill, 'click', () => {
      if (api.paused) return;
      pinned = !pinned;
      sync();
      live.textContent = pinned ? 'Showing Contact.' : 'Showing local time.';
    });
    api.on('params', apply);
    api.on('replay', () => {
      hover = false;
      pinned = false;
      sync();
      render();
    });
    api.on('visibility', (v) => {
      if (v) {
        render();
        schedule();
      }
    });
    api.cleanup(() => clearTimeout(timer));
    {
      api.listen(pill, 'focus', () => {
        if (pill.matches(':focus-visible')) {
        }
      });
      api.listen(pill, 'click', () => {
        if (!api.paused && cardOpt.touched) cardOpt.touched();
      });
      api.restore = () => {
        hover = false;
        pinned = false;
        sync();
        live.textContent = '';
      };
    }
    api.frame(({ time, reduced }) => {
      return false;
    });
    apply();
    schedule();
    const status = api.status;
    api.status = () => ({
      ...status(),
      time: hEl.textContent + ':' + mEl.textContent,
      contact: element.classList.contains('is-contact'),
      pinned,
      blink: api.params.blink,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountLocalClockPill(element, options) {
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
    element.classList.add('local-clock-pill');
    element.innerHTML = '<div class="fx-board" data-clock></div>';
    const stage = element,
      board = stage.querySelector('[data-clock]');
    const fit = () => Math.max(1, Math.min(1.625, (stage.clientWidth - 96) / 256, (stage.clientHeight * 0.4) / 132));
    const place = () => board.style.setProperty('--clock-k', fit().toFixed(4));
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(board, {
      params: options.params,
      place: { timeZone: 'visitor', hours: [9, 18], days: [1, 2, 3, 4, 5] },
      card: {
        pill: (roll) =>
          '<button type="button" class="clock-pill ck-panel" data-size="lg" aria-pressed="false">' +
          roll +
          '<span class="clock-date" hidden></span></button><span class="clock-live" aria-live="polite"></span>',
        interactive: true,
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
  global.mountLocalClockPill = mountLocalClockPill;
  if (typeof module === 'object' && module.exports) module.exports = mountLocalClockPill;
})(typeof window !== 'undefined' ? window : this);
