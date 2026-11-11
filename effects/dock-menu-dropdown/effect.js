/*
 * Dock Menu Dropdown
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A small floating nav pill that grows into a scrollable catalogue when you click Index: the white panel stretches
 * down and out, the rows fade up one after another, and a dark plate wipes over the row you point at. Made for a
 * project index, a work list or any "all items" menu in a site header.
 *
 * How it moves
 * - Open / close is a class toggle (.is-open) with CSS transitions. Opening takes 0.54 s (--open-d), closing 0.36 s
 *   (--close-d). Easing is --dock-ease: cubic-bezier(.22,1,.36,1) by default, cubic-bezier(.5,0,.15,1) with
 *   params.curve = 'classic'. 'classic' is a carefully hand-tuned curve; keep its values as they are.
 * - The white panel (.dock-bg) animates height from 3em (the pill) to params.openHeight px, and width from the closed
 *   row width + 1em to max(closed width + 4em, 22em), capped at the element width. The shadow grows with it.
 * - The list area (.dock-drop) grows in height and widens through clip-path from the pill width to the full width.
 *   Its opacity runs over 50% of the open time (50% on close); on close it turns invisible after that.
 * - Rows: each starts at opacity 0, translateY(0.6em). On open, row n starts after 60 ms + params.stagger x n and runs
 *   opacity over 70% of the open time and the move over the full open time. On close they drop out together in 0.2 s.
 * - The chevron turns 180 degrees with the panel.
 * - Hover plate: each row has a dark fill at scaleY(0). Pointing at a row scales it to 1 in params.rowDuration ms.
 *   The transform origin is the edge the pointer came in from (top half -> grows from the top, bottom half -> from the
 *   bottom), and it leaves towards the edge it exits from. The origin is only switched while the plate is fully open or
 *   fully closed, so a quick pass never jumps.
 * - While a row is hot, the text steps .14em to the right on the --spring curve, once, over params.rowDuration. Nothing loops.
 * - Catalogue rows: a 2 px tick, the name (18 px) and a kind line (14 px, muted). The current item has an accent tick
 *   and no plate; hovering it still shows the plate. Clicking a row makes it current.
 * - Scrolling: the list scrolls natively (hidden scrollbar). The top and bottom edges fade through a mask over 3em,
 *   each fade appearing only when there is more to scroll that way. A custom bar on the right (4 px wide, 7.25em tall)
 *   shows a thumb sized to the visible share (at least 16%). Drag the thumb or press anywhere on the bar to jump; wheel
 *   over the bar scrolls the list.
 *
 * Options
 *   params.openHeight   260..440, default 360      open panel height in px
 *   params.rowDuration  150..600, default 280      ms for the hover plate
 *   params.stagger      0..80, default 50          ms between rows on open
 *   params.curve        'library' | 'classic', default 'library'   easing for everything above
 *   reducedMotion       true / false / null        force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountDockMenuDropdown(element, {params: {...}, reducedMotion: null});
 *   fx.params                     copy of current params
 *   fx.setParams({stagger: 60})   change params live
 *   fx.setPaused(true|false)      freeze / resume
 *   fx.reset()                    params back to defaults, menu closed, third item current again
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                  removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountDockMenuDropdown(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Items: NAMES and KINDS (same length; row count, stagger and the bar adapt). The current item is catalog.current
 *   in mountDockMenuDropdown.
 * - The button text "Index", colours, fonts, radii and shadows via effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Open slower than close (0.54 s / 0.36 s) and the per-row delay of 60 ms + stagger x n.
 * - The plate entering from the side the pointer came from, and the rule that the origin only switches at rest.
 * - Panel height and list height must animate together with the same curve, or the rows slide under a moving edge.
 * - Do not let a framework re-render the rows while the effect runs; it toggles classes on them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountDockMenuDropdown on an embed div with a fixed height.
 * - Rows are buttons and only mark the current item; hook your own navigation onto their click.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The menu is a nav landmark. The Index button carries aria-expanded; the list is aria-hidden while closed. Rows are
 *   buttons labelled "<name>, <kind>", the current one has aria-current. Arrow Up / Down move between rows, Escape
 *   closes and returns focus to Index, and a press outside the menu closes it. Keyboard focus shows the plate too.
 * - With reduced motion: every transition is off, and the menu starts open so the
 *   list is visible at once. It still opens, closes and scrolls, without animation.
 *
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
  const R = { clamp, smooth, mix };

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
    { key: 'openHeight', type: 'range', default: 360, min: 260, max: 440, step: 10 },
    { key: 'rowDuration', type: 'range', default: 280, min: 150, max: 600, step: 10 },
    { key: 'stagger', type: 'range', default: 50, min: 0, max: 80, step: 5 },
    { key: 'curve', type: 'select', default: 'library', options: [{ value: 'library' }, { value: 'classic' }] },
  ];

  // ---- the effect ----
  const NAMES = [
    'Long Table',
    'Field Notes',
    'Quiet Hours',
    'North Light',
    'Paper Moon',
    'Salt Flats',
    'Second Draft',
    'Low Tide',
    'Common Room',
    'Night Ferry',
    'Open Studio',
    'Glass House',
    'Slow Signal',
    'After Image',
    'Blue Hour',
    'Lantern',
    'Half Light',
    'Wide Open',
  ];
  const KINDS = [
    'Identity',
    'Editorial',
    'Exhibition',
    'Type',
    'Packaging',
    'Web',
    'Editorial',
    'Motion',
    'Spatial',
    'Identity',
    'Web',
    'Exhibition',
    'Type',
    'Motion',
    'Print',
    'Packaging',
    'Print',
    'Identity',
  ];
  const CLASSIC_EASE = 'cubic-bezier(.5,0,.15,1)',
    THUMB_MIN = 0.16;
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('dock-stage');
    const card = options.card || null,
      catalog = options.catalog || null,
      first = catalog ? (catalog.current != null ? +catalog.current : -1) : -1,
      chev =
        '<svg class="dock-chev" viewBox="0 0 17 10" aria-hidden="true"><path d="M1.5 1.5 8.5 8.5 15.5 1.5"/></svg>';
    const cardRow = (name, i) =>
      catalog
        ? '<li><button type="button" class="dock-item ck-row ck-text" tabindex="-1" data-i="' +
          i +
          '" style="--n:' +
          i +
          '" aria-label="' +
          name +
          ', ' +
          KINDS[i] +
          '"><span class="dock-fill ck-solid" aria-hidden="true"></span><span class="dock-inner"><i class="dock-tick" aria-hidden="true"></i><span class="dock-name">' +
          name +
          '</span><span class="dock-kind">' +
          KINDS[i] +
          '</span></span></button></li>'
        : '<li><button type="button" class="dock-item ck-row ck-text" tabindex="-1" data-i="' +
          i +
          '" style="--n:' +
          i +
          '"><span class="dock-fill ck-solid" aria-hidden="true"></span><span class="dock-inner"><span class="dock-name">' +
          name +
          '</span><span class="dock-yr-mask"><span class="dock-yr" aria-hidden="true">' +
          (card.mark ? card.mark(i) : '') +
          '</span></span></span></button></li>';
    element.innerHTML =
      '<nav class="dock ck-text" data-card' +
      (catalog ? ' data-catalog' : '') +
      ' aria-label="Sample navigation"><div class="dock-bg ck-panel" aria-hidden="true"></div><div class="dock-row"><span class="dock-logo" aria-hidden="true"><i class="ck-dot"></i><i class="ck-dot"></i></span>' +
      '<button type="button" class="dock-link dock-toggle ck-text" data-strong tabindex="-1" aria-expanded="false"><span class="dock-label"><span class="dock-word">Index</span><span class="dock-count ck-num" aria-hidden="true">' +
      NAMES.length +
      '</span></span>' +
      chev +
      '</button></div>' +
      '<div class="dock-drop" aria-hidden="true"><div class="dock-scroller"><ul class="dock-list">' +
      NAMES.map(cardRow).join('') +
      '</ul></div><div class="dock-bar"><i class="dock-thumb"></i></div></div></nav>';
    const $ = (s) => element.querySelector(s),
      dock = $('.dock'),
      row = $('.dock-row'),
      toggle = $('.dock-toggle'),
      label = $('.dock-label'),
      word = $('.dock-word'),
      count = $('.dock-count'),
      drop = $('.dock-drop'),
      scroller = $('.dock-scroller'),
      bar = $('.dock-bar'),
      thumb = $('.dock-thumb'),
      live = $('.dock-live') || {};
    const items = [...element.querySelectorAll('.dock-item')];
    let open = false,
      active = first,
      hot = -1,
      drag = null,
      closedW = 0,
      widths = { word: 0, count: 0 };
    let rewind = 0,
      stillOpen = false;
    const fontPx = () => parseFloat(getComputedStyle(dock).fontSize) || 15;
    function measure() {
      closedW = row.scrollWidth + fontPx();
      widths.word = word.scrollWidth;
      widths.count = widths.word;
      const wOpen = Math.max(closedW + fontPx() * 4, fontPx() * 22);
      dock.style.setProperty('--w', closedW + 'px');
      dock.style.setProperty('--w-open', Math.min(element.clientWidth, wOpen) + 'px');
      dock.style.setProperty('--oh', element.clientHeight + 'px');
      if (card.height) dock.style.setProperty('--oh', api.params.openHeight + 'px');
      label.style.width = (open ? widths.count : widths.word) + 'px';
      sync();
    }
    function apply() {
      const p = api.params;
      dock.style.setProperty('--oh', element.clientHeight + 'px');
      element.style.setProperty('--row', p.rowDuration + 'ms');
      element.style.setProperty('--stagger', p.stagger + 'ms');
      if (card.height) dock.style.setProperty('--oh', p.openHeight + 'px');
      element.style.setProperty('--dock-ease', p.curve === 'classic' ? CLASSIC_EASE : 'var(--out)');
      sync();
    }
    function sync() {
      const vh = scroller.clientHeight,
        sh = scroller.scrollHeight,
        max = Math.max(0, sh - vh),
        top = R.clamp(scroller.scrollTop, 0, max),
        fade = fontPx() * 3;
      scroller.style.setProperty('--ft', max > 0 ? R.clamp(top / fade, 0, 1).toFixed(3) : 0);
      scroller.style.setProperty('--fb', max > 0 ? R.clamp((max - top) / fade, 0, 1).toFixed(3) : 0);
      const track = bar.clientHeight,
        ratio = max <= 0 ? 1 : R.clamp(vh / sh, THUMB_MIN, 1),
        th = track * ratio,
        travel = Math.max(0, track - th);
      thumb.style.height = (ratio * 100).toFixed(2) + '%';
      thumb.style.transform = 'translate3d(0,' + (max <= 0 ? 0 : (travel * top) / max).toFixed(2) + 'px,0)';
      bar.classList.toggle('is-disabled', max <= 0);
      return { max, travel, th, top };
    }
    function setOpen(next, announce) {
      if (next === open) return;
      open = next;
      dock.classList.toggle('is-open', open);
      element.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      drop.setAttribute('aria-hidden', String(!open));
      label.style.width = (open ? widths.count : widths.word) + 'px';
      if (open) {
        scroller.scrollTop = 0;
        sync();
      } else {
        setHot(-1);
      }
      if (announce) live.textContent = open ? 'Index open, ' + NAMES.length + ' items.' : 'Index closed.';
      if (announce && true && card.touched) card.touched();
    }
    function scaleOf(el) {
      const m = getComputedStyle(el).transform;
      if (!m || m === 'none') return 1;
      return new DOMMatrix(m).d;
    }
    function plate(i, on, fromTop) {
      const item = items[i];
      if (!item) return;
      const fill = item.firstElementChild,
        s = scaleOf(fill);
      if ((on && s <= 0.001) || (!on && s >= 0.999))
        fill.style.transformOrigin = fromTop ? 'center top' : 'center bottom';
      item.classList.toggle('is-hot', on);
    }
    function setHot(i, fromTop) {
      if (i === hot) return;
      if (hot >= 0 && (hot !== active || catalog)) plate(hot, false, fromTop);
      hot = i;
      if (i >= 0) plate(i, true, fromTop);
    }
    function setActive(i) {
      if (i === active) return;
      const prev = active;
      active = i;
      items.forEach((item, n) => {
        item.classList.toggle('is-active', n === i);
        if (n === i) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
      if (prev !== hot) plate(prev, false, false);
      live.textContent = 'Current: ' + NAMES[i] + '.';
    }
    function scrollToThumb(clientY) {
      const r = bar.getBoundingClientRect(),
        s = sync();
      if (s.travel <= 0) return;
      scroller.scrollTop = (R.clamp(clientY - r.top - drag.offset, 0, s.travel) / s.travel) * s.max;
      sync();
    }
    items.forEach((item, i) => {
      api.listen(item, 'pointerenter', (e) => {
        if (e.pointerType === 'touch' || api.paused || !open) return;
        const r = item.getBoundingClientRect();
        setHot(i, e.clientY - r.top < r.height / 2);
      });
      api.listen(item, 'pointerleave', (e) => {
        if (e.pointerType === 'touch' || hot !== i) return;
        const r = item.getBoundingClientRect();
        hot = -1;
        if (i !== active || catalog) plate(i, false, e.clientY - r.top < r.height / 2);
      });
      api.listen(item, 'focus', () => {
        if (item.matches(':focus-visible') && open) setHot(i, false);
      });
      api.listen(item, 'blur', () => {
        if (hot === i) {
          hot = -1;
          if (i !== active || catalog) plate(i, false, false);
        }
      });
      api.listen(item, 'click', () => {
        if (!api.paused) setActive(i);
      });
      api.listen(item, 'keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const n = items[R.clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1)];
        n.focus();
        n.scrollIntoView({ block: 'nearest' });
      });
    });
    api.listen(toggle, 'click', () => {
      if (!api.paused) setOpen(!open, true);
    });
    api.listen(element, 'keydown', (e) => {
      if (e.key === 'Escape' && open) {
        setOpen(false, true);
        toggle.focus();
      }
    });
    api.listen(element, 'pointerdown', (e) => {
      if (open && !dock.contains(e.target)) setOpen(false, true);
    });
    element.querySelectorAll('.dock-link[href]').forEach((a) => api.listen(a, 'click', (e) => e.preventDefault()));
    api.listen(scroller, 'scroll', sync, { passive: true });
    api.listen(
      bar,
      'wheel',
      (e) => {
        if (sync().max <= 0) return;
        e.preventDefault();
        scroller.scrollTop += e.deltaY;
      },
      { passive: false },
    );
    api.listen(bar, 'pointerdown', (e) => {
      if (api.paused || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const s = sync();
      if (s.max <= 0) return;
      e.preventDefault();
      const tr = thumb.getBoundingClientRect(),
        onThumb = e.target === thumb;
      drag = { id: e.pointerId, offset: onThumb ? R.clamp(e.clientY - tr.top, 0, tr.height) : s.th / 2 };
      thumb.classList.add('is-dragging');
      try {
        bar.setPointerCapture(e.pointerId);
      } catch {}
      scrollToThumb(e.clientY);
    });
    api.listen(bar, 'pointermove', (e) => {
      if (drag && drag.id === e.pointerId) {
        e.preventDefault();
        scrollToThumb(e.clientY);
      }
    });
    const endDrag = (e) => {
      if (!drag || (e && drag.id !== e.pointerId)) return;
      drag = null;
      thumb.classList.remove('is-dragging');
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => api.listen(bar, t, endDrag));
    function reset() {
      endDrag();
      setOpen(false, false);
      hot = -1;
      items.forEach((item, n) => {
        item.classList.remove('is-hot');
        item.classList.toggle('is-active', n === first);
        if (n === first) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
      active = first;
      scroller.scrollTop = 0;
      sync();
    }
    api.on('params', apply);
    api.on('resize', measure);
    api.on('replay', () => {
      reset();
    });
    api.on('pause', (v) => {
      if (v) endDrag();
    });
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(() => {
        if (!api.destroyed) measure();
      });
    function tidy() {
      items.forEach((item, n) => {
        if (n !== hot) item.classList.remove('is-hot');
      });
    }
    {
      const touch = () => {
        if (card.touched) card.touched();
      };
      toggle.removeAttribute('tabindex');
      items.forEach((item) => item.removeAttribute('tabindex'));
      items.forEach((item) =>
        ['pointerenter', 'pointerleave', 'focus', 'blur'].forEach((type) => api.listen(item, type, tidy)),
      );
      items.forEach((item) =>
        api.listen(item, 'click', () => {
          if (!api.paused) touch();
        }),
      );
      api.listen(
        drop,
        'wheel',
        (e) => {
          const s = sync();
          if (open && ((e.deltaY > 0 && s.top < s.max - 0.5) || (e.deltaY < 0 && s.top > 0.5))) touch();
        },
        { passive: true },
      );
      api.listen(bar, 'pointerdown', (e) => {
        if (open && !api.paused && !(e.pointerType === 'mouse' && e.button !== 0)) touch();
      });
      api.listen(
        scroller,
        'touchmove',
        () => {
          if (open) touch();
        },
        { passive: true },
      );
      api.listen(scroller, 'keydown', (e) => {
        if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) touch();
      });
      api.listen(drop, 'transitionend', (e) => {
        if (e.target === drop && e.propertyName === 'height') sync();
      });
      api.on('destroy', () => clearTimeout(rewind));
      api.restore = () => {
        clearTimeout(rewind);
        const was = open;
        endDrag();
        setOpen(false, false);
        hot = -1;
        items.forEach((item, n) => {
          item.classList.remove('is-hot');
          item.classList.toggle('is-active', n === first);
          if (n === first) item.setAttribute('aria-current', 'true');
          else item.removeAttribute('aria-current');
        });
        active = first;
        const toTop = () => {
          scroller.scrollTop = 0;
          sync();
        };
        if (api.reduced) {
          toTop();
          setOpen(true, false);
        } else if (was)
          rewind = setTimeout(
            () => {
              if (!open) toTop();
            },
            (parseFloat(getComputedStyle(element).getPropertyValue('--close-d')) || 0.36) * 1000,
          );
        else toTop();
      };
    }
    api.frame(({ time, reduced }) => {
      if (reduced) {
        if (!stillOpen) {
          stillOpen = true;
          setOpen(true, false);
        }
        return false;
      }
      if (reduced) {
        if (!open) setOpen(true, false);
        return false;
      }
      return false;
    });
    if (first >= 0 && items[first]) {
      items[first].classList.add('is-active');
      items[first].setAttribute('aria-current', 'true');
    }
    apply();
    measure();
    const status = api.status;
    api.status = () => ({
      ...status(),
      open,
      active,
      hot,
      scroll: sync().max > 0 ? scroller.scrollTop / sync().max : 0,
      label: open ? count.textContent : word.textContent,
      dragging: !!drag,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountDockMenuDropdown(element, options) {
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
    element.classList.add('dock-menu-dropdown');
    element.innerHTML = '<div class="fx-board" data-dock></div>';
    const stage = element,
      board = stage.querySelector('[data-dock]');
    const inst = mount(board, {
      params: options.params,
      catalog: { current: 2 },
      card: {
        lead: 0,
        height: true,
        interactive: true,
      },
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
  global.mountDockMenuDropdown = mountDockMenuDropdown;
  if (typeof module === 'object' && module.exports) module.exports = mountDockMenuDropdown;
})(typeof window !== 'undefined' ? window : this);
