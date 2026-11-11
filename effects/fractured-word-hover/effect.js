/*
 * Fractured Word Hover
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A large one-line link ("Start a project"). Hover a word and it cracks along a jagged line: the top half jumps up and
 * left, the bottom half down and right, with a small springy overshoot; leave and it closes again. Good for a big
 * call to action, a footer contact line or display-size navigation.
 *
 * How it moves
 * - All CSS. JS only toggles .is-hover on the hovered word and writes a few custom properties.
 * - Each word is rendered three times: the real text, plus ::before and ::after copies (content: attr(data-word))
 *   stacked on top. ::before is clipped to the area above a zigzag cut (polygon through 44%, 52%, 41%, 63%, 50%,
 *   60% of the height, right to left); ::after to the area below the same cut. The two halves therefore fit together exactly.
 * - Hover: the real text turns transparent instantly and the halves become visible. The top half moves
 *   (-0.03 em, -0.07 em) and rotates -1 deg around 25% 35%; the bottom half moves (+0.03 em, +0.07 em) and
 *   rotates +0.7 deg around 75% 65%. All values are multiplied by crack / 100.
 * - In: duration params.ms, easing cubic-bezier(0.28, 1 + spring / 100, 0.36, 1). spring 100 gives a y1 of 2,
 *   a clear overshoot; spring 0 gives a plain ease-out.
 * - Out: duration 0.65 x ms with cubic-bezier(0.22, 1, 0.36, 1), no overshoot. Only after that time do the halves
 *   hide and the real text return (an opacity / color step delayed by the out duration), so there is no visible seam.
 * - Each word is its own hover zone; hovering "project" leaves "Start" and "a" whole.
 * - Size: font size = min(120 px, the size that fits with about 40 px margins; 24 px at 760 px and below). The line
 *   is centred.
 *
 * Options
 *   params.crack   0..300, default 100      size of the split in percent; 0 = no visible crack
 *   params.spring  0..200, default 100      overshoot on the way in; 0 = none
 *   params.ms      200..1200 ms, default 460   open duration; close is 0.65 x this
 *   reducedMotion  true / false / null      force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountFracturedWordHover(element, {params: {...}, reducedMotion: null});
 *   fx.params                  copy of current params
 *   fx.setParams({crack: 200}) change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)   while paused, new hovers and clicks are ignored
 *   fx.reset()                 params back to defaults, every word closed
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()               removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountFracturedWordHover(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The text: line: 'Start a project' in mountFracturedWordHover. Words are split on spaces; each needs its
 *   data-word attribute to match its text (the markup helper does this).
 * - The layout() function (font size and position of the line).
 * - Colour via --fx-color on .fx-link, font in .fx-line.
 * - The zigzag: both clip-path polygons, as long as ::before and ::after share the same cut points.
 *
 * Do not change (the feel breaks)
 * - The shared cut line between the two clip-paths; if they differ you get a gap or a doubled band.
 * - The delayed hide on leave (the "opacity 0s linear var(--fx-shut)" transitions). Without it the real text pops back
 *   before the halves have closed.
 * - em-based offsets, so the crack scales with the font size.
 * - Inside .fx-stage, --fx-open / --fx-shut are durations and --fx-open-ease / --fx-shut-ease easings. Keep them scoped there.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - The visual part is pure CSS: you can copy the .fx-word rules and the markup
 *   <span class="fx-word" data-word="Start">Start</span> and toggle .is-hover on the parent .fx-link yourself, or
 *   rewrite the selector as .fx-link:hover.
 * - Using the JS: mount once on a ref after the element is in the DOM; call fx.destroy() on unmount. In React
 *   StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountFracturedWordHover on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The whole line is one link (<a href="#">, click prevented by default; remove the preventDefault to make it real).
 *   The duplicated half-words are pseudo-elements, so screen readers read the text once. Keyboard focus
 *   (focus-visible) cracks every word of the line and shows a focus ring. There are no other keyboard actions.
 * - Touch: a tap cracks the tapped word and keeps it open until you tap elsewhere.
 * - With reduced motion: the halves are hidden, words never crack, .
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
    { key: 'crack', type: 'range', default: 100, min: 0, max: 300, step: 10 },
    { key: 'spring', type: 'range', default: 100, min: 0, max: 200, step: 10 },
    { key: 'ms', type: 'range', default: 460, min: 200, max: 1200, step: 20 },
  ];

  // ---- the effect ----
  const NAV = ['Work', 'About', 'Journal', 'Contact'],
    SOCIAL = ['Instagram', 'Newsletter', 'Careers'];
  const link = (t, cls) =>
    '<a href="#" class="fx-link' +
    (cls ? ' ' + cls : '') +
    '">' +
    t
      .split(' ')
      .map((w) => '<span class="fx-word" data-word="' + w + '">' + w + '</span>')
      .join(' ') +
    '</a>';
  const lineLink = (t) =>
    '<a href="#" class="fx-link fx-line">' +
    t
      .split(' ')
      .map((w) => '<span class="fx-link fx-part"><span class="fx-word" data-word="' + w + '">' + w + '</span></span>')
      .join(' ') +
    '</a>';
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('fx-stage');
    const card = options.card || null,
      line = card.line ? String(card.line) : '',
      page = !!card.page && !line;
    if (page)
      element.innerHTML =
        '<div class="fx-page ck-panel" data-size="lg"><header class="fx-bar"><span class="fx-brand ck-text" data-strong><i class="ck-dot" data-accent aria-hidden="true"></i>Studio</span><nav class="fx-nav" aria-label="Sample navigation">' +
        NAV.map((t) => link(t)).join('') +
        '</nav></header>' +
        '<div class="fx-hero"><span class="ck-hint">Have something in mind?</span>' +
        link('Start a project', 'fx-cta') +
        '</div>' +
        '<footer class="fx-foot"><span class="ck-hint">Studio, 2026</span><nav class="fx-social" aria-label="Sample footer links">' +
        SOCIAL.map((t) => link(t)).join('') +
        '</nav></footer></div>' +
        '' +
        '<p class="cr-sr fx-live" aria-live="polite"></p>';
    else if (line) element.innerHTML = lineLink(line) + '<p class="cr-sr fx-live" aria-live="polite"></p>';
    else
      element.innerHTML =
        '<div class="fx-mini ck-panel">' +
        link('Contact', 'fx-big') +
        '<nav class="fx-row" aria-label="Sample links">' +
        ['Work', 'About', 'Journal'].map((t) => link(t)).join('') +
        '</nav></div><p class="cr-sr fx-live" aria-live="polite"></p>';
    const links = [...element.querySelectorAll('.fx-link')],
      live = element.querySelector('.fx-live'),
      pageEl = element.querySelector('.fx-page'),
      lineEl = element.querySelector('.fx-line');
    const spots = lineEl ? links.filter((el) => el !== lineEl) : links,
      anchors = lineEl ? [lineEl] : links;
    const setHover = (el, on) => el.classList.toggle('is-hover', on);
    function apply() {
      const { crack, spring, ms } = api.params,
        vars = {
          '--fx-amt': crack / 100,
          '--fx-open': ms + 'ms',
          '--fx-shut': Math.round(ms * 0.65) + 'ms',
          '--fx-open-ease': 'cubic-bezier(.28,' + (1 + spring / 100).toFixed(2) + ',.36,1)',
        };
      for (const k in vars) element.style.setProperty(k, String(vars[k]));
    }
    let unit = null;
    function place() {
      if (lineEl) {
        if (!unit) {
          lineEl.style.setProperty('--fx-size', '100px');
          unit = { w: lineEl.offsetWidth / 100, h: lineEl.offsetHeight / 100 };
        }
        const W = api.width,
          H = api.height,
          L = card.layout ? card.layout(W, H, unit) : { size: Math.min(120, (W - 48) / unit.w) };
        const s = L.size,
          x = L.x == null ? (W - s * unit.w) / 2 : L.x,
          y = L.y == null ? (H - s * unit.h) / 2 : L.y;
        lineEl.style.setProperty('--fx-size', s.toFixed(2) + 'px');
        lineEl.style.setProperty('--fx-x', x.toFixed(1) + 'px');
        lineEl.style.setProperty('--fx-y', y.toFixed(1) + 'px');
        return;
      }
      if (!pageEl) return;
      const W = api.width,
        H = api.height;
      const L = card.layout
        ? card.layout(W, H)
        : (() => {
            const w = Math.min(820, W * 0.8);
            return { x: (W - w) / 2, y: null, w };
          })();
      pageEl.style.setProperty('--fx-w', L.w.toFixed(1) + 'px');
      pageEl.style.setProperty('--fx-x', L.x.toFixed(1) + 'px');
      const y = L.y == null ? (H - pageEl.offsetHeight) / 2 - 0 : L.y;
      pageEl.style.setProperty('--fx-y', Math.max(0, y).toFixed(1) + 'px');
    }
    api.on('resize', place);
    if (lineEl && document.fonts) {
      const again = () => {
        if (!api.destroyed) {
          unit = null;
          place();
        }
      };
      document.fonts.ready.then(again);
      api.listen(document.fonts, 'loadingdone', again);
    }
    let stuck = null,
      lastType = '';
    links.forEach((el) => {
      if (spots.includes(el)) {
        api.listen(el, 'pointerenter', (e) => {
          if (e.pointerType !== 'touch' && true && !api.paused) setHover(el, true);
        });
        api.listen(el, 'pointerleave', () => {
          if (stuck === el) return;
          setHover(el, false);
        });
      }
      if (!anchors.includes(el)) return;
      api.listen(el, 'focus', () => {
        if (el.matches(':focus-visible')) setHover(el, true);
      });
      api.listen(el, 'blur', () => {
        if (stuck !== el) setHover(el, false);
      });
      api.listen(el, 'click', (e) => {
        e.preventDefault();
        if (api.paused) return;
        if (e.detail && lastType === 'touch') {
          const t = (lineEl && spots.find((s) => s.contains(e.target))) || el;
          if (stuck && stuck !== t) setHover(stuck, false);
          stuck = t;
          setHover(t, true);
        }
        live.textContent = (el.textContent || '').trim() + ' clicked.';
      });
    });
    function clearAll() {
      links.forEach((el) => setHover(el, false));
      stuck = null;
    }
    api.listen(
      element,
      'pointerdown',
      (e) => {
        lastType = e.pointerType;
        if (stuck && !stuck.contains(e.target)) {
          setHover(stuck, false);
          stuck = null;
        }
      },
      true,
    );
    {
      api.restore = () => {
        clearAll();
        live.textContent = '';
      };
    }
    api.on('params', apply);
    api.on('replay', () => {
      clearAll();
    });
    api.frame(({ time, reduced }) => {
      return false;
    });
    apply();
    place();
    const status = api.status;
    api.status = () => ({
      ...status(),
      hovered: links.filter((el) => el.classList.contains('is-hover')).map((el) => el.textContent.trim()),
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountFracturedWordHover(element, options) {
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
    element.classList.add('fractured-word-hover');
    element.innerHTML = '<div class="fx-board" data-fx></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-fx]');
    const layout = (W, H, m) => {
      const Z = panelZone(stage, 3),
        fit = (w, h) => Math.min(120, w / m.w, h / m.h);
      if (!!matchMedia('(max-width: 760px)').matches) {
        const size = fit(W - 48, H - 48);
        return { size, x: null, y: null };
      }
      const top = Z.bottom + 24,
        left = Z.right + 24,
        mid = fit(W - 80, H - top - 40),
        side = fit(W - left - 40, H - 80);
      if (mid >= side) {
        const x = (W - mid * m.w) / 2,
          y = (H - mid * m.h) / 2;
        return { size: mid, x, y: x >= left ? y : Math.max(top, y) };
      }
      return { size: side, x: left + (W - left - 40 - side * m.w) / 2, y: null };
    };
    const inst = mount(board, {
      params: options.params,
      card: { line: 'Start a project', layout, interactive: true, introDelay: 3 },
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
  global.mountFracturedWordHover = mountFracturedWordHover;
  if (typeof module === 'object' && module.exports) module.exports = mountFracturedWordHover;
})(typeof window !== 'undefined' ? window : this);
