/*
 * Curtain Menu
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A full-screen menu that drops over the page like a curtain: a white panel slides down from the top, the big menu
 * words rise into place one after another, and hovering a word dims the others and swaps a preview picture. Made for
 * the main navigation of a portfolio, studio or brand site.
 *
 * How it moves
 * - Open / close is a class toggle (.is-open). The panel sits at translate3d(0, -102%, 0) and slides to 0 in
 *   params.panelDuration ms with cubic-bezier(.22,1,.36,1). Closing slides it back up 1.15 times slower, then hides it.
 * - Menu words: on open each one rises from below with the Web Animations API, same curve, duration .9 x panelDuration,
 *   delay 160 ms + params.itemStagger x index. The rise is 64 px scaled to the word size (64 x word height / 61.4), so
 *   big and small layouts travel the same share of a line. On close the words go up with the panel, no separate exit.
 * - Hover (or keyboard focus) on a word: the stage gets .has-hover, every other word fades to params.dim percent opacity
 *   in 240 ms, and the preview frame shows the picture for that word. Leaving brings everyone back and the frame returns
 *   to its default picture.
 * - Picture swap: params.swap = 'cut' switches instantly; 'fade' crossfades in 180 ms.
 * - Menu button: two 1.5 px lines. Hover pulls them 1 px towards each other; open turns them into an X (+45 / -45 deg)
 *   in 0.5 s. Its label switches between "Open menu" and "Close menu".
 * - Until the first real click on the button, a soft accent ring breathes around it (two outlines growing 10 px and
 *   fading, 2.4 s, half a cycle apart). It hides while is near the button and goes away for good after
 *   the first click.
 * - Layout: the words sit bottom left, sized to fit the height (at least 40 px). The preview frame (4:5) sits right on
 *   wide screens and top left on narrow ones (760 px viewport or less).
 *
 * Options
 *   params.panelDuration  500..1400, default 900    ms for the panel; each word takes .9 x this
 *   params.itemStagger    30..120, default 60       ms between words
 *   params.dim            5..60, default 20         opacity in percent of the words you are not on
 *   params.swap           'cut' | 'fade', default 'cut'   how the preview picture changes
 *   reducedMotion         true / false / null       force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountCurtainMenu(element, {params: {...}, reducedMotion: null});
 *   fx.params                          copy of current params
 *   fx.setParams({itemStagger: 90})    change params live
 *   fx.setPaused(true|false)           freeze / resume
 *   fx.reset()                         params back to defaults, menu closed (quickly if it was open)
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                       removes listeners, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:600px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountCurtainMenu(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children. For a real site menu make
 * it a fixed, full-viewport layer.
 *
 * Safe to change
 * - Menu words: ITEMS (the layout is tuned for five; fewer is fine, more needs a smaller word size).
 * - Preview pictures: the looks array in mountCurtainMenu; one default picture plus one per word. Put your own images in
 *   the .ct-art blocks.
 * - Colours, font, the frame radius via effect.css. params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The curves on panel and words, and the 160 ms head start before the first word.
 * - Words must move with transforms only, never with top or margin, or the stagger stutters.
 * - Closing slower than opening (x1.15) is deliberate; it reads as the curtain falling back on its own weight.
 * - Do not let a framework re-render the words while the effect runs; it animates them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountCurtainMenu on an embed div with a fixed height.
 * - Word links are href="#" and their click is prevented; the menu just closes and focus goes back to the button.
 *   A visually hidden polite live region (.ct-live) announces "Menu opened." / "Menu closed." and "Go to <word>.".
 *   Replace that click handler with your router navigation.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The button has aria-expanded and a changing label. The menu is a labelled section, aria-hidden and out of the tab
 *   order while closed. Escape closes it and returns focus to the button. Focus on a word previews it like hover.
 * - On touch the first tap on a word previews it; a second tap on the same word follows it.
 * - With reduced motion: all transitions off and no word animation, so the menu opens and
 *   closes instantly. The ring around the button stays still.
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
    { key: 'panelDuration', type: 'range', default: 900, min: 500, max: 1400, step: 50 },
    { key: 'itemStagger', type: 'range', default: 60, min: 30, max: 120, step: 5 },
    { key: 'dim', type: 'range', default: 20, min: 5, max: 60, step: 5 },
    { key: 'swap', type: 'select', default: 'cut', options: [{ value: 'cut' }, { value: 'fade' }] },
  ];

  // ---- the effect ----
  const CARD_RISE = 38;
  const ITEMS = ['Work', 'Studio', 'Journal', 'Contact', 'Careers'];
  const OUT = 'cubic-bezier(.22,1,.36,1)';
  const T = {
    rise: 64,
    itemLength: 0.9,
    itemLead: 160,
    itemEase: OUT,
    wordDur: 640,
    wordLead: 520,
    wordGap: 45,
    wordExit: 560,
    wordExitGap: 36,
    blockGap: 360,
    lineGap: 80,
    charGap: 16,
    charDur: 220,
    handleLead: 880,
  };
  const ART = [
    '<rect width="80" height="100" fill="#f0f0ef"/>' +
      Array.from(
        { length: 24 },
        (_, i) =>
          '<circle cx="' +
          (16 + (i % 4) * 16) +
          '" cy="' +
          (22 + Math.floor(i / 4) * 12) +
          '" r="1.4" fill="rgba(23,24,26,.32)"/>',
      ).join(''),
    '<rect width="80" height="100" fill="#17181a"/><circle cx="40" cy="46" r="17" fill="none" stroke="#fff" stroke-width="3"/>',
    '<rect width="80" height="100" fill="rgba(23,24,26,.16)"/><rect x="24" y="30" width="32" height="32" fill="#17181a"/>',
    '<rect width="80" height="100" fill="#4559ff"/><circle cx="40" cy="50" r="12" fill="#fff"/>',
    '<rect width="80" height="100" fill="rgba(23,24,26,.32)"/>' +
      [0, 1, 2, 3, 4].map((i) => '<rect x="14" y="' + (26 + i * 10) + '" width="52" height="3" fill="#fff"/>').join(''),
    '<rect width="80" height="100" fill="rgba(23,24,26,.08)"/><path d="M22 32 58 68M58 32 22 68" stroke="#17181a" stroke-width="3"/>',
  ];
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('ct-stage');
    const card = options.card || null;
    {
      element.dataset.card = '';
      element.innerHTML =
        '<button type="button" class="ct-burger ck-pill" tabindex="-1" aria-label="Open menu" aria-expanded="false"><span class="ct-lines"><i class="ck-line" data-strong></i><i class="ck-line" data-strong></i></span></button>' +
        '<div class="ct-drop"><section class="ct-menu ck-panel" data-size="lg" aria-label="Main menu" aria-hidden="true"><nav class="ct-list">' +
        ITEMS.map(
          (t, i) =>
            '<a href="#" class="ct-item ck-row ck-text" data-strong data-i="' + i + '" tabindex="-1">' + t + '</a>',
        ).join('') +
        '</nav>' +
        '<div class="ct-shot" aria-hidden="true">' +
        ART.map(
          (a, i) =>
            '<div class="ct-art' +
            (i === 0 ? ' is-on' : '') +
            '" data-a="' +
            i +
            '">' +
            (card.media ? card.media(i) : '') +
            '</div>',
        ).join('') +
        '</div></section></div><p class="ct-live" aria-live="polite"></p>';
    }
    const $ = (s) => element.querySelector(s),
      screen = $('.ct-screen'),
      page = $('.ct-page'),
      menu = $('.ct-menu'),
      btn = $('.ct-burger'),
      live = $('.ct-live');
    const items = [...element.querySelectorAll('.ct-item')],
      arts = [...element.querySelectorAll('.ct-art')],
      secs = [...element.querySelectorAll('.ct-sec')],
      letters = [...element.querySelectorAll('.ct-wl>span')],
      handle = [...element.querySelectorAll('.ct-handle .ct-ch')];
    if (card.big)
      items.forEach((it) => {
        it.classList.remove('ck-row', 'ck-text');
        it.removeAttribute('data-strong');
      });
    let open = false,
      hover = -1,
      running = [];
    function apply() {
      const p = api.params;
      element.style.setProperty('--panel', p.panelDuration + 'ms');
      element.style.setProperty('--dim', String(p.dim / 100));
      element.classList.toggle('is-fade', p.swap === 'fade');
    }
    function anim(el, frames, o) {
      const a = api.animate(el, frames, Object.assign({ fill: 'both' }, o));
      running.push(a);
      return a;
    }
    function stopRunning() {
      running.forEach((a) => {
        try {
          a.cancel();
        } catch {}
      });
      running = [];
    }
    function setHover(i) {
      hover = i;
      element.classList.toggle('has-hover', i >= 0);
      items.forEach((it, n) => it.classList.toggle('is-hot', n === i));
      arts.forEach((a, n) => a.classList.toggle('is-on', n === i + 1 || (i < 0 && n === 0)));
    }
    function setOpen(next, announce) {
      if (next === open) return;
      open = next;
      stopRunning();
      const D = api.params.panelDuration,
        S = api.params.itemStagger;
      element.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      items.forEach((it) => (it.tabIndex = open ? 0 : -1));
      if (announce) live.textContent = open ? 'Menu opened.' : 'Menu closed.';
      if (api.reduced) {
        setHover(-1);
        return;
      }
      if (open) {
        setHover(-1);
        items.forEach((it, i) =>
          anim(
            it,
            [
              { transform: 'translateY(' + (card.big ? pitchRise() : CARD_RISE) + 'px)' },
              { transform: 'translateY(0)' },
            ],
            { duration: D * T.itemLength, delay: T.itemLead + i * S, easing: T.itemEase },
          ),
        );
        letters.forEach((l, i) =>
          anim(l, [{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], {
            duration: T.wordDur,
            delay: T.wordLead + i * T.wordGap,
            easing: OUT,
          }),
        );
        secs.forEach((sec, si) => {
          const base = T.blockGap * si;
          [...sec.children].forEach((p, pi) =>
            [...p.querySelectorAll('.ct-ch')].forEach((ch, ci) =>
              anim(ch, [{ opacity: 0 }, { opacity: 1 }], {
                duration: T.charDur,
                delay: base + (pi ? T.lineGap : 0) + ci * T.charGap,
                easing: 'linear',
              }),
            ),
          );
        });
        handle.forEach((ch, ci) =>
          anim(ch, [{ opacity: 0 }, { opacity: 1 }], {
            duration: T.charDur,
            delay: T.handleLead + ci * T.charGap,
            easing: 'linear',
          }),
        );
      } else {
        setHover(-1);
        if (page)
          anim(page, [{ transform: 'translateY(22%)' }, { transform: 'translateY(0)' }], {
            duration: D,
            easing: OUT,
            fill: 'none',
          });
        letters.forEach((l, i) =>
          anim(l, [{ transform: 'translateY(0)' }, { transform: 'translateY(110%)' }], {
            duration: T.wordExit,
            delay: (letters.length - 1 - i) * T.wordExitGap,
            easing: OUT,
          }),
        );
        [...secs.flatMap((s) => [...s.querySelectorAll('.ct-ch')]), ...handle].forEach((ch) =>
          anim(ch, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease-in-out' }),
        );
      }
    }
    items.forEach((it, i) => {
      api.listen(it, 'pointerenter', (e) => {
        if (e.pointerType !== 'touch' && open && !api.paused) setHover(i);
      });
      api.listen(it, 'pointerleave', (e) => {
        if (e.pointerType !== 'touch' && hover === i) setHover(-1);
      });
      api.listen(it, 'focus', () => {
        if (open) setHover(i);
      });
      api.listen(it, 'blur', () => {
        if (hover === i) setHover(-1);
      });
      api.listen(it, 'click', (e) => {
        e.preventDefault();
        if (api.paused) return;
        live.textContent = 'Go to ' + ITEMS[i] + '.';
        setOpen(false, false);
        btn.focus({ preventScroll: true });
      });
    });
    api.listen(btn, 'click', () => {
      if (!api.paused) setOpen(!open, true);
    });
    api.listen(element, 'keydown', (e) => {
      if (e.key === 'Escape' && open) {
        setOpen(false, true);
        btn.focus();
      }
    });
    function reset() {
      stopRunning();
      open = true;
      setOpen(false, false);
      stopRunning();
      setHover(-1);
    }
    api.on('params', apply);
    api.on('replay', () => {
      reset();
    });
    api.on('motion', () => {
      stopRunning();
    });
    const intro = 0;
    function pitchRise() {
      return Math.round((T.rise * items[0].offsetHeight) / 61.4);
    }
    {
      btn.tabIndex = 0;
      let lastType = 'mouse',
        tapHot = -1;
      const touched = () => {
        if (!api.paused && card.touched) card.touched();
      };
      api.listen(element, 'pointerdown', (e) => {
        lastType = e.pointerType;
        tapHot = hover;
      });
      api.listen(
        element,
        'keydown',
        (e) => {
          if (e.key === 'Escape' && open) touched();
        },
        true,
      );
      api.listen(
        element,
        'click',
        (e) => {
          if (lastType !== 'touch' || !open || api.paused) return;
          const it = e.target.closest('.ct-item');
          if (!it) {
            if (hover >= 0 && !e.target.closest('.ct-burger')) setHover(-1);
            return;
          }
          const i = +it.dataset.i;
          if (i === tapHot) return;
          e.preventDefault();
          e.stopPropagation();
          setHover(i);
          touched();
        },
        true,
      );
      api.listen(btn, 'click', touched);
      items.forEach((it) => api.listen(it, 'click', touched));
      api.restore = () => {
        stopRunning();
        if (intro) {
          if (open) {
            if (!api.reduced) element.style.setProperty('--panel', '500ms');
            setOpen(false, false);
            running.forEach((a) => a.finish());
            void getComputedStyle(menu).transform;
            apply();
          }
        } else if (!open) {
          if (!api.reduced) element.style.setProperty('--panel', '500ms');
          setOpen(true, false);
          running.forEach((a) => a.finish());
          void getComputedStyle(menu).transform;
          apply();
        }
        setHover(-1);
      };
    }
    api.frame(({ time, reduced }) => {
      return false;
    });
    apply();
    const status = api.status;
    api.status = () => ({ ...status(), open, hover });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountCurtainMenu(element, options) {
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
    const setTimeout = (cb, ms, ...args) => {
      const t = global.setTimeout(() => {
        mounted.timers.delete(t);
        cb(...args);
      }, ms);
      mounted.timers.add(t);
      return t;
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
    element.classList.add('curtain-menu');
    element.innerHTML = '<div class="fx-board" data-curtain></div>';
    const listeners = new AbortController();
    const stage = element,
      board = stage.querySelector('[data-curtain]');
    const looks = [
      { tone: 1, glyph: false },
      { tone: 2, glyph: 0 },
      { tone: 1, glyph: 2 },
      { tone: 2, glyph: 1, accent: true },
      { tone: 1, glyph: 3 },
      { tone: 2, glyph: 0 },
    ];
    const M = 8,
      RESERVE = 16 + 142 + 24,
      narrowQ = matchMedia('(max-width:760px)');
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        sw = W - 2 * M,
        sh = H - 2 * M,
        narrow = narrowQ.matches;
      const pad = narrow ? 20 : Math.round(Math.min(56, Math.max(32, sw * 0.045)));
      let f, pw, ph, px, py;
      if (!narrow) {
        f = Math.floor(Math.max(40, Math.min(sh * 0.126, (H - M - pad - RESERVE) / 4.95)));
        const top = sh - pad - 4.95 * f;
        py = Math.round(top + 0.13 * f);
        ph = Math.round(Math.min((sw * 0.19) / 0.8, sh - pad - py));
        pw = Math.round(ph * 0.8);
        px = sw - pad - pw;
      } else {
        f = Math.floor(Math.min(sh * 0.09, sw * 0.15));
        const top = sh - pad - 4.95 * f;
        ph = Math.round(Math.min(top - pad - 24, sh * 0.42));
        pw = Math.round(ph * 0.8);
        px = pad;
        py = pad;
      }
      const s = board.style;
      s.setProperty('--ct-f', f + 'px');
      s.setProperty('--ct-x', pad + 'px');
      s.setProperty('--ct-b', pad + 'px');
      s.setProperty('--ct-px', px + 'px');
      s.setProperty('--ct-py', py + 'px');
      s.setProperty('--ct-pw', pw + 'px');
      s.setProperty('--ct-ph', ph + 'px');
      s.setProperty('--ct-k', (pw / 144).toFixed(4));
    }
    layout();
    let ring = null,
      btn = null;
    const inst = mount(board, {
      params: options.params,
      card: {
        big: true,
        interactive: true,
        introDelay: 3,
        media: (i) => media(Object.assign({ size: 'sm' }, looks[i])),
      },
    });
    btn = board.querySelector('.ct-burger');
    if (btn) {
      ring = document.createElement('div');
      ring.className = 'ctx-ring';
      ring.setAttribute('aria-hidden', 'true');
      btn.after(ring);
      btn.addEventListener(
        'click',
        (e) => {
          if (!e.isTrusted || !ring) return;
          const r = ring;
          ring = null;
          r.setAttribute('data-gone', '');
          setTimeout(() => r.remove(), 340);
        },
        { signal: listeners.signal },
      );
    }
    function placeRing() {
      if (!ring) return;
      const b = board.getBoundingClientRect(),
        r = btn.getBoundingClientRect();
      ring.style.cssText =
        '--ctx-x:' +
        (r.left - b.left) +
        'px;--ctx-y:' +
        (r.top - b.top) +
        'px;--ctx-w:' +
        r.width +
        'px;--ctx-h:' +
        r.height +
        'px';
    }
    placeRing();
    const observer0 = new ResizeObserver(() => {
      layout();
      placeRing();
    });
    observer0.observe(stage);

    inst.on('destroy', () => {
      listeners.abort();
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
  global.mountCurtainMenu = mountCurtainMenu;
  if (typeof module === 'object' && module.exports) module.exports = mountCurtainMenu;
})(typeof window !== 'undefined' ? window : this);
