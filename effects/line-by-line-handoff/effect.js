/*
 * Line-by-Line Handoff
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A small two-page site in one panel. Click "Open" and the index page leaves line by line: text slides up behind masks,
 * rules retract, the disc fades, until only the logo is left; then the second page rises in line by line. "Back"
 * reverses it. Good for an index-to-project transition in a portfolio, article switches, or any page change that keeps
 * the brand and swaps the content.
 *
 * How it moves
 * - Every text line is wrapped in a mask (.ho-m, overflow hidden) with the moving line inside (.ho-l). Each block that
 *   takes part carries data-item and a group number data-g. All motion is Web Animations API on transform and opacity.
 * - Out (current page): blocks go in DOM order, 24 ms apart; inside a block each line starts another 10 ms later.
 *   Lines: translateY(0) -> translateY(calc(-106% - .3em)) over outDuration. Rules: scaleX(1) -> scaleX(0), origin right.
 *   The disc: opacity 1 -> 0 and scale 1 -> 0.96 over 340 ms. The nav links fade out over 255 ms. The logo stays.
 * - Hold: when the last out animation ends, 180 ms of nothing but the logo.
 * - In (next page): the old page gets hidden, the new one shown. Blocks go in DOM order 40 ms apart, plus an extra 90 ms
 *   whenever the group number changes. Lines: translateY(calc(112% + .3em)) -> 0 over inDuration, lineStagger ms apart inside a block.
 *   Rules: scaleX(0) -> scaleX(1), origin left. The disc fades and scales back in over 510 ms; the nav fades in over
 *   340 ms after a 170 ms delay.
 * - When everything has finished (+20 ms) the inline animations are cancelled and the page is left in its plain state.
 * - Easing for everything: curve "library" = cubic-bezier(.22, 1, .36, 1), curve "classic" = cubic-bezier(.62, 0, .14, 1).
 *   "classic" is a carefully hand-tuned curve; keep its values as they are.
 * - Clicks during a transition are ignored, not queued.
 * - Layout: the panel is at most 560 x 360 px, centred with at least 32 px margins (16 px at 760 px and below, where
 *   a panel narrower than 440 px takes the full height minus 16 px top and bottom).
 *
 * Options
 *   params.outDuration  200..800, default 320    ms per line on the way out
 *   params.inDuration   400..1200, default 760   ms per line on the way in
 *   params.lineStagger  0..100, default 45       ms between lines of one block on the way in
 *   params.curve        "library" | "classic", default "library"   easing (see above)
 *   reducedMotion       true / false / null      force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountLineByLineHandoff(element, {params: {...}, reducedMotion: null});
 *   fx.params                       copy of current params
 *   fx.setParams({inDuration: 900}) applies from the next transition
 *   fx.setPaused(true|false)        pausing mid-transition cancels it and snaps to a plain page (the old page if it
 *                                   was still leaving, the new one if it was arriving); resume does not continue it
 *   fx.reset()                      params back to defaults, ; if not on the index, the visible page fades
 *                                   out over 200 ms and the index fades in over 300 ms
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                    cancels animations and timers, removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountLineByLineHandoff(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Page content: the pages array passed in mountLineByLineHandoff (title, rows of [label, value], button text, disc)
 *   and the nav words. Each line of text needs its own mask wrapper (the m() helper) to animate on its own.
 * - Order and grouping: DOM order sets the stagger; data-g groups add the 90 ms gaps on the way in.
 * - Colours, type and the disc via effect.css.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - -106 % - .3em out and 112 % + .3em in inside overflow-hidden masks. The extra .3em is not optional: descenders
 *   (g, y) hang below the line box and the masks keep .08-.14em of padding for them, so a bare percentage leaves a sliver. Without the masks the lines just slide over each other.
 * - Rules retract to the right and grow from the left; flipping either origin makes it look like a rewind.
 * - The 180 ms hold with only the logo on screen. Overlapping out and in turns it into a cross-fade.
 * - The short 24 / 10 ms out stagger against the longer 40 / 45 / 90 ms in stagger: leave fast, arrive slow.
 * - Do not let a framework re-render the page elements during a transition; the animations hold references to them.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - For real routes (Next.js, Nuxt, Webflow page transitions) reuse the timing, not the component: run the out
 *   sequence before navigation, keep the logo in a persistent layout, run the in sequence after the new page mounts.
 * - Load effect.css globally (class names are not scoped).
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The Open / Back controls are real buttons; the hidden page uses the hidden attribute so it is out of the tab order
 *   and the accessibility tree. After an animated switch started from inside the old page (keyboard or click),
 *   focus moves to the new page's section (tabindex="-1", no focus ring), so Tab continues from there.
 *   A visually hidden polite live region (.ho-live) announces "Detail page." / "Back to the index.".
 * - With reduced motion: no animation. A click swaps the pages instantly and moves focus to the new page's
 *   button.
 * - Animations pause when the tab is hidden or the panel is off screen.
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
    { key: 'outDuration', type: 'range', default: 320, min: 200, max: 800, step: 20 },
    { key: 'inDuration', type: 'range', default: 760, min: 400, max: 1200, step: 20 },
    { key: 'lineStagger', type: 'range', default: 45, min: 0, max: 100, step: 5 },
    { key: 'curve', type: 'select', default: 'library', options: [{ value: 'library' }, { value: 'classic' }] },
  ];

  // ---- the effect ----
  const EASE = { library: 'cubic-bezier(.22,1,.36,1)', classic: 'cubic-bezier(.62,0,.14,1)' };
  const OUT_ITEM = 24,
    OUT_LINE = 10,
    IN_ITEM = 40,
    GROUP_GAP = 90,
    HOLD = 180,
    FADE = 340,
    OUT_Y = -106,
    IN_Y = 112,
    CLEAR = '.3em';
  const OUT_T = 'translateY(calc(' + OUT_Y + '% - ' + CLEAR + '))',
    IN_T = 'translateY(calc(' + IN_Y + '% + ' + CLEAR + '))';
  const m = (text, cls) =>
    '<span class="ho-m' + (cls ? ' ' + cls : '') + '"><span class="ho-l">' + text + '</span></span>';
  const PAGE_A =
    '<section class="ho-page ho-a" data-page="0">' +
    '<div class="ho-info"><h2 class="ho-title" data-item data-g="0">' +
    m('Long Table') +
    '</h2>' +
    [
      ['Client', 'Studio North'],
      ['Year', '2026'],
      ['Role', 'Identity, Motion'],
    ]
      .map(
        ([k, v]) =>
          '<i class="ho-rule" data-item data-g="1"></i><div class="ho-row" data-item data-g="1">' +
          m(k, 'ho-k') +
          m(v, 'ho-v') +
          '</div>',
      )
      .join('') +
    '<i class="ho-rule" data-item data-g="1"></i>' +
    '<button type="button" class="ho-go" data-item data-g="2">' +
    m('Open project <b aria-hidden="true">→</b>') +
    '</button></div>' +
    '<div class="ho-disc" aria-hidden="true"><i></i></div>' +
    '<div class="ho-notes">' +
    [
      ['Review one', '“Quiet, exact,', 'and very sure of itself.”'],
      ['Review two', '“A room you want', 'to stay in.”'],
    ]
      .map(
        ([k, a, b]) =>
          '<div class="ho-note" data-item data-g="3">' +
          m('<span class="ho-stars" aria-label="Five stars"><i></i><i></i><i></i><i></i><i></i></span>') +
          m(k, 'ho-k') +
          m(a) +
          m(b) +
          '</div>',
      )
      .join('') +
    '</div></section>';
  const PAGE_B =
    '<section class="ho-page ho-b" data-page="1" hidden>' +
    '<div class="ho-disc ho-disc--small" aria-hidden="true"><i></i></div>' +
    '<div class="ho-detail"><p class="ho-copy" data-item data-g="0">' +
    m('A long dining table built for a studio that') +
    m('cooks for its guests. The identity follows') +
    m('the table: one line, extended as needed.') +
    '</p>' +
    [
      ['Scope', 'Identity, Signage, Web'],
      ['Team', 'Four people, nine weeks'],
      ['Status', 'Open since spring'],
    ]
      .map(
        ([k, v]) =>
          '<i class="ho-rule" data-item data-g="1"></i><div class="ho-row" data-item data-g="1">' +
          m(k, 'ho-k') +
          m(v, 'ho-v') +
          '</div>',
      )
      .join('') +
    '<i class="ho-rule" data-item data-g="1"></i>' +
    '<button type="button" class="ho-go ho-back" data-item data-g="2">' +
    m('<b aria-hidden="true">←</b> Back to index') +
    '</button></div>' +
    '<h2 class="ho-title ho-title--xl" data-item data-g="3">' +
    m('Long') +
    m('Table') +
    '</h2></section>';
  function cardPage(i, d) {
    return (
      '<section class="ho-page ho-cp" data-page="' +
      i +
      '"' +
      (i ? ' hidden' : '') +
      '><div class="ho-info">' +
      '<div class="ho-title" data-item data-g="0">' +
      m(d.title, 'ck-text" data-strong="') +
      '</div>' +
      (d.rows || [[d.k, d.v]])
        .map(
          ([k, v]) =>
            '<i class="ho-rule ck-line" data-strong data-item data-g="1"></i><div class="ho-row" data-item data-g="1">' +
            m(k, 'ck-hint') +
            m(v, 'ck-text') +
            '</div>',
        )
        .join('') +
      '<i class="ho-rule ck-line" data-strong data-item data-g="1"></i>' +
      '<button type="button" class="ho-go" tabindex="-1" data-item data-g="2">' +
      m(d.go, 'ck-text" data-strong="') +
      '</button></div>' +
      (d.disc
        ? '<div class="ho-disc' + (d.disc === 'small' ? ' ho-disc--small' : '') + '" aria-hidden="true"><i></i></div>'
        : '') +
      '</section>'
    );
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('ho-stage');
    const cardOpt = options.card || null;
    element.innerHTML =
      '<div class="ho-screen ck-panel" data-size="lg" data-card><header class="ho-head"><span class="ho-logo"><i class="ck-dot"></i><i class="ck-dot"></i></span><span class="ho-nav" aria-hidden="true">' +
      (cardOpt.nav || []).map((w) => '<span class="ck-hint">' + w + '</span>').join('') +
      '</span></header>' +
      cardPage(0, cardOpt.pages[0]) +
      cardPage(1, cardOpt.pages[1]) +
      '</div><p class="cr-sr ho-live" aria-live="polite"></p>';
    const pages = [...element.querySelectorAll('.ho-page')];
    pages.forEach((p) => {
      p.tabIndex = -1;
    });
    const nav = element.querySelector('.ho-nav'),
      live = element.querySelector('.ho-live');
    let current = 0,
      busy = false,
      running = [],
      timers = [],
      phase = 'idle';
    const items = (p) => [...pages[p].querySelectorAll('[data-item]')];
    const lines = (el) => [...el.querySelectorAll('.ho-l')];
    const discs = (p) => [...pages[p].querySelectorAll('.ho-disc')];
    function clearAll() {
      running.forEach((a) => {
        try {
          a.cancel();
        } catch {}
      });
      running = [];
      timers.forEach(clearTimeout);
      timers = [];
    }
    function settle(p) {
      pages.forEach((page, i) => {
        page.hidden = i !== p;
        page.querySelectorAll('.ho-l,.ho-rule,.ho-disc').forEach((el) => {
          el.style.transform = '';
          el.style.opacity = '';
        });
      });
      nav.style.opacity = '';
    }
    function tween(el, frames, duration, delay, easing) {
      const a = api.animate(el, frames, { duration, delay, easing, fill: 'both' });
      running.push(a);
      return a;
    }
    function go(next) {
      if (busy || next === current) return;
      const ease = EASE[api.params.curve] || EASE.library,
        outD = api.params.outDuration,
        inD = api.params.inDuration,
        lineS = api.params.lineStagger;
      live.textContent = next === 1 ? 'Detail page.' : 'Back to the index.';
      if (api.reduced) {
        clearAll();
        current = next;
        settle(next);
        pages[next].querySelector('.ho-go').focus({ preventScroll: true });
        return;
      }
      busy = true;
      phase = 'out';
      element.dataset.phase = 'out';
      clearAll();
      const from = current,
        anims = [],
        refocus = pages[from].contains(document.activeElement);
      items(from).forEach((el, i) => {
        const at = i * OUT_ITEM;
        if (el.classList.contains('ho-rule'))
          anims.push(
            tween(
              el,
              [
                { transform: 'scaleX(1)', transformOrigin: 'right center' },
                { transform: 'scaleX(0)', transformOrigin: 'right center' },
              ],
              outD,
              at,
              ease,
            ),
          );
        else
          lines(el).forEach((l, k) =>
            anims.push(tween(l, [{ transform: 'translateY(0)' }, { transform: OUT_T }], outD, at + k * OUT_LINE, ease)),
          );
      });
      discs(from).forEach((d) =>
        anims.push(
          tween(
            d,
            [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(.96)' },
            ],
            FADE,
            0,
            ease,
          ),
        ),
      );
      anims.push(tween(nav, [{ opacity: 1 }, { opacity: 0 }], FADE * 0.75, 0, ease));
      const outTotal = Math.max(...anims.map((a) => a.effect.getComputedTiming().endTime));
      timers.push(
        setTimeout(() => {
          if (api.destroyed) return;
          phase = 'hold';
          element.dataset.phase = 'hold';
          timers.push(
            setTimeout(() => {
              enter(next, from, ease, inD, lineS);
              if (refocus) pages[next].focus({ preventScroll: true });
            }, HOLD),
          );
        }, outTotal),
      );
    }
    function enter(next, from, ease, inD, lineS) {
      clearAll();
      pages[from].hidden = true;
      pages[next].hidden = false;
      current = next;
      phase = 'in';
      element.dataset.phase = 'in';
      const anims = [];
      let at = 0,
        group = null;
      items(next).forEach((el) => {
        if (group !== null && el.dataset.g !== group) at += GROUP_GAP;
        group = el.dataset.g;
        if (el.classList.contains('ho-rule'))
          anims.push(
            tween(
              el,
              [
                { transform: 'scaleX(0)', transformOrigin: 'left center' },
                { transform: 'scaleX(1)', transformOrigin: 'left center' },
              ],
              inD,
              at,
              ease,
            ),
          );
        else
          lines(el).forEach((l, k) =>
            anims.push(tween(l, [{ transform: IN_T }, { transform: 'translateY(0)' }], inD, at + k * lineS, ease)),
          );
        at += IN_ITEM;
      });
      discs(next).forEach((d) =>
        anims.push(
          tween(
            d,
            [
              { opacity: 0, transform: 'scale(.96)' },
              { opacity: 1, transform: 'scale(1)' },
            ],
            FADE * 1.5,
            0,
            ease,
          ),
        ),
      );
      anims.push(tween(nav, [{ opacity: 0 }, { opacity: 1 }], FADE, FADE * 0.5, ease));
      const total = Math.max(...anims.map((a) => a.effect.getComputedTiming().endTime));
      timers.push(
        setTimeout(() => {
          if (api.destroyed) return;
          clearAll();
          settle(current);
          busy = false;
          phase = 'idle';
          element.dataset.phase = 'idle';
        }, total + 20),
      );
    }
    element.querySelectorAll('.ho-go').forEach((btn) =>
      api.listen(btn, 'click', () => {
        if (!api.paused) go(current === 0 ? 1 : 0);
      }),
    );
    api.on('pause', (v) => {
      if (v && busy) {
        clearAll();
        settle(current);
        busy = false;
        phase = 'idle';
        element.dataset.phase = 'idle';
      }
    });
    api.on('replay', () => {
      clearAll();
      busy = false;
      current = 0;
      phase = 'idle';
      settle(0);
    });
    api.on('motion', () => {
      clearAll();
      busy = false;
      settle(current);
    });
    api.cleanup(clearAll);
    let goA = null,
      goB = null;
    api.on('resize', () => {
      goA = goB = null;
    });
    let restoring = false;
    const RESTORE_OUT = 200,
      RESTORE_IN = 300;
    {
      element.querySelectorAll('.ho-go').forEach((btn) => btn.removeAttribute('tabindex'));
      let before = null;
      api.listen(
        element,
        'click',
        (event) => {
          if (!event.target.closest('.ho-go')) return;
          before = { current, busy };
        },
        true,
      );
      element.querySelectorAll('.ho-go').forEach((btn) =>
        api.listen(btn, 'click', () => {
          if (before && ((busy && !before.busy) || current !== before.current) && cardOpt.touched) cardOpt.touched();
          before = null;
        }),
      );
      api.restore = () => {
        if (restoring || (!busy && current === 0)) return;
        timers.forEach(clearTimeout);
        timers = [];
        if (api.reduced) {
          clearAll();
          busy = false;
          current = 0;
          phase = 'idle';
          element.dataset.phase = 'idle';
          settle(0);
          return;
        }
        running.forEach((a) => {
          try {
            a.pause();
          } catch {}
        });
        busy = true;
        restoring = true;
        phase = 'restore';
        element.dataset.phase = 'restore';
        const ease = EASE.library,
          fade = (el, from, to, duration) =>
            api.animate(el, [{ opacity: from }, { opacity: to }], { duration, easing: ease, fill: 'both' });
        const out = [...pages.filter((p) => !p.hidden), nav].map((el) =>
          fade(el, +getComputedStyle(el).opacity, 0, RESTORE_OUT),
        );
        let back = [];
        Promise.all(out.map((a) => a.finished))
          .then(() => {
            if (api.destroyed) return;
            clearAll();
            pages.forEach((p) => {
              p.hidden = true;
            });
            return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
          })
          .then(() => {
            if (api.destroyed) return;
            settle(0);
            current = 0;
            back = [pages[0], nav].map((el) => fade(el, 0, 1, RESTORE_IN));
            out.forEach((a) => a.cancel());
            return Promise.all(back.map((a) => a.finished));
          })
          .catch(() => {})
          .then(() => {
            back.forEach((a) => a.cancel());
            restoring = false;
            if (api.destroyed) return;
            busy = false;
            phase = 'idle';
            element.dataset.phase = 'idle';
          });
      };
    }
    api.frame(({ time, reduced }) => {
      return false;
    });
    settle(0);
    const status = api.status;
    api.status = () => ({ ...status(), page: current, busy, phase });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountLineByLineHandoff(element, options) {
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
    element.classList.add('line-by-line-handoff');
    element.innerHTML = '<div class="fx-board" data-ho-board></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-ho-board]');
    const MIN_W = 320,
      phone = matchMedia('(max-width: 760px)');
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      let w, h, x, y;
      if (phone.matches) {
        w = Math.min(560, W - 32);
        h = w < 440 ? H - 32 : Math.min(360, H - 32);
        x = (W - w) / 2;
        y = (H - h) / 2;
      } else {
        w = Math.min(560, W - 64);
        h = Math.min(360, H - 64);
        x = (W - w) / 2;
        y = (H - h) / 2;
        const Z = panelZone(stage),
          R = Z.right + 16;
        if (x < R) {
          if (W - 24 - R >= MIN_W) {
            x = R;
            w = Math.min(w, W - 24 - x);
          } else {
            y = Math.max(y, Z.bottom + 16);
            h = Math.min(h, H - 24 - y);
          }
        }
      }
      [
        ['x', x],
        ['y', y],
        ['w', w],
        ['h', h],
      ].forEach(([k, v]) => board.style.setProperty('--ho-' + k, Math.round(v) + 'px'));
    }
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(board, {
      params: options.params,
      card: {
        pages: [
          {
            title: 'Long Table',
            rows: [
              ['Client', 'Northbank Studio'],
              ['Type', 'Restaurant and studio'],
              ['Role', 'Identity, motion'],
            ],
            go: 'Open <b aria-hidden="true">→</b>',
            disc: true,
          },
          {
            title: 'One table, extended',
            rows: [
              ['Scope', 'Identity and website'],
              ['Team', 'Four people, nine weeks'],
              ['State', 'Opens in spring'],
            ],
            go: '<b aria-hidden="true">←</b> Back',
            disc: 'small',
          },
        ],
        nav: ['Index', 'Archive', 'Info'],
        interactive: true,
      },
    });

    place();

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
  global.mountLineByLineHandoff = mountLineByLineHandoff;
  if (typeof module === 'object' && module.exports) module.exports = mountLineByLineHandoff;
})(typeof window !== 'undefined' ? window : this);
