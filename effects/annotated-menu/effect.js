/*
 * Annotated Menu
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A menu panel that gets marked up like a proof, one item at a time: hover (or focus, or tap) an item and
 * just that item is struck through (or circled, or underlined) with an uneven marker stroke that is written on, a
 * hairline grows above it and, a beat later, a handwritten note is wiped in next to it. Moving to another item erases the old
 * annotation while the new one is drawn. Closing the menu takes the annotation off first; the panel lifts once that is three quarters done.
 * Good for portfolio, studio and editorial navigation.
 *
 * How it moves
 * - Each mark is a filled outline whose width varies along the stroke (pen pressure). It is generated from a
 *   centre line (Catmull-Rom through MARKS[i].pts, viewBox units) and a width table (MARKS[i].w), and used as an
 *   SVG mask (maskUnits="userSpaceOnUse"). The visible ink is the centre line stroked much wider than the outline
 *   (max width + 4, round caps) with pathLength=1, stroke-dasharray 1. The mask cuts it back to the uneven
 *   outline, so it reads as a marker being written.
 * - All timings besides the three params live in three constants near the top of effect.js: PACE (note lag,
 *   hairline share, panel overlap, turn-back point, nib fade), CURVE (the six easing functions) and NOTE (the note
 *   mask positions). Keyframes are sampled from CURVE in JS (36 steps for marks, 20 for hairlines and notes) and
 *   played with linear easing, because the pen-tip opacity is computed from the offset.
 * - Mark in: stroke-dashoffset 1 -> 0, drawIn ms (default 1300), cubic-bezier(.28,.8,.12,1): the pen sets down
 *   softly, runs, and slows into the end (about 90% written after half a second). Mark out: 0 -> -1 (keeps going
 *   in the same direction and erases itself), drawOut ms (default 760), cubic out. Opacity near the pen tip: a
 *   smoothstep over the first and last 9% of the stroke, so no round dot pops in at the start or end.
 * - Marks never get in the way of reading the word: a near-straight strike through the middle, a loop around
 *   the word, a straight underline, a gentle wavy underline.
 * - Hairlines: scaleX 0 -> 1 from the left (drawIn, expo out: 1 - 2^(-10t)), back to 0 towards the right in half
 *   the erase time (drawOut x 0.5, default 380 ms, quart out), 1px at 10% ink.
 * - Handwritten notes start 120 ms after the mark. A 115 degree soft-edged mask gradient
 *   (#0000 0 18%, #0007 23%, #000 28% 72%, #0007 77%, #0000 82% 100%), mask-size 250%; mask-position 140% -> 50%
 *   in (drawIn, cubic-bezier(.33,.55,.2,1)), 50% -> -40% out (drawOut, quad out). At 250% the note covers the
 *   middle 40% of the gradient line, so it sits fully inside the solid band at 50% and fully outside it at 140%
 *   and -40%.
 * - Only the hovered / focused / tapped item is annotated (priority: mouse hover > keyboard focus > tap). Leaving it erases it (same direction); switching items erases the old one and draws the new one at
 *   the same time. Nothing is drawn sooner than delay ms (default 900, about 0.2 s after the 700 ms panel has
 *   opened) after the menu opens. Touch: the first tap on an item shows its annotation, a second tap on it follows
 *   the link (here: closes the menu). Closing: the annotation goes out first and the panel starts to close at
 *   0.75 x drawOut (default 570 ms). When an item is sent the other way, one decision covers the whole item (mark,
 *   hairline and note together), taken from its first ink stroke: still moving and short of 75% of its time, every
 *   part reverses from where it is; later, each part gets a fresh animation, and a fresh erase starts from the
 *   part's current position. A part still waiting to start (menu just opened, or the note's 120 ms lag) that is
 *   taken off goes straight to blank instead of flashing in and erasing.
 * - Panel: clip-path inset from the top + fade + 8px, 700 ms open / 500 ms close. Menu button: letter-spacing
 *   grows to .26em on hover over 1.1 s, cubic-bezier(.22,1,.36,1).
 *
 * Options
 *   params.delay    0..2400, default 900    ms after opening the menu before a hovered item is annotated
 *   params.drawIn   600..3200, default 1300 ms to write the marks, grow the hairlines and wipe in the notes
 *   params.drawOut  300..1600, default 760  ms to erase them; the panel starts closing at 0.75 of this
 *   params.note1..note4  text, max 16 chars  the handwritten note next to item 1..4 (defaults from ITEMS)
 *   reducedMotion   true / false / null     force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountAnnotatedMenu(element, {params: {...}, reducedMotion: null});
 *   fx.params                    copy of current params
 *   fx.setParams({delay: 600})   change params live (clamped to the ranges above)
 *   fx.setPaused(true|false)     freeze / resume every running animation
 *   fx.reset()                   params back to defaults, menu open
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()                 removes listeners, animations, observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountAnnotatedMenu(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Menu words and handwritten notes: ITEMS in effect.js (search for "const ITEMS"; it sets the note defaults too). Notes can
 *   also be changed live: fx.setParams({note1: 'Old'}) and so on ([word, note, [note x em, note y em, note rotation deg]]).
 * - Marks: MARKS (control points, width table, placement ax / aw / ay in % of the word box). Keep widths in the
 *   same viewBox units as the points.
 * - Size: --an-size on the host (word size; notes are 0.66 of it), --an-px / --an-py panel padding.
 * - Colours: .an-ink { stroke } and .an-note { color } (default accent blue), .an-rule { background }.
 * - Notes may use Basic Latin only (A-Z a-z 0-9, ASCII punctuation); the embedded font has nothing else.
 * - The handwriting font: Caveat 500 (SIL Open Font License 1.1, Copyright 2014 The Caveat Project Authors),
 *   subset to Basic Latin and embedded in effect.js (FONT, registered with FontFace). Swap it for another OFL handwriting font if you
 *   like; keep it embedded or self-hosted.
 *
 * Do not change (the feel breaks)
 * - The wide stroke under an outline mask. A plain stroke-dashoffset line has one even width and looks like a
 *   progress bar, not a marker.
 * - Erasing in the same direction (0 -> -1) instead of playing the drawing backwards.
 * - Closing the panel only once the annotation is mostly erased (it lifts at three quarters of the erase).
 * - Marks that cross the letters (scribbles, curves through the word); they stop the word from being read.
 * - maskUnits="userSpaceOnUse" on the mark masks; the default bounding-box region clips near-horizontal strokes.
 * - The padding on .an-note; without it the mask clips the parts of the handwriting that lean outside the box.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Marks and notes are aria-hidden; the menu words are real links, the button has aria-expanded. Esc closes the menu and returns focus to the button. A closed panel is inert.
 * - With reduced motion every animation jumps to its end state: the menu opens and closes at once, no simulated input.
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
  const R = { smooth, mix, clamp };

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
    { key: 'delay', type: 'range', default: 900, min: 0, max: 2400, step: 10 },
    { key: 'drawIn', type: 'range', default: 1300, min: 600, max: 3200, step: 50 },
    { key: 'drawOut', type: 'range', default: 760, min: 300, max: 1600, step: 20 },
    { key: 'note1', type: 'text', default: 'Selected' },
    { key: 'note2', type: 'text', default: 'About' },
    { key: 'note3', type: 'text', default: 'Thoughts' },
    { key: 'note4', type: 'text', default: 'Say hi' },
  ];

  // ---- the effect ----
  const controls = CONTROLS;
  const ITEMS = [
    ['Work', 'Selected', [0, -0.18, -4]],
    ['Studio', 'About', [0.1, -0.06, 3]],
    ['Journal', 'Thoughts', [0, -0.2, -3]],
    ['Contact', 'Say hi', [0.05, -0.08, 4]],
  ];
  controls.forEach((c) => {
    const m = /^note([0-9]+)$/.exec(c.key);
    if (m && ITEMS[m[1] - 1]) c.default = ITEMS[m[1] - 1][1];
  });
  const FONT =
    '774f4632000100000000a9d80010000000017f940000a9770002000000000000000000000000000000000000000000001a6a1bf97c1c976a06603f535441541c00812e11080a84d80c83ad560136022403873c0b836000042005833207200c075b6627517420773b20687f0a4fa950b67d8ae56e050c918aa8caa8b071006c5bde39fbff7ca0868c3dc83d1b66b972ec14113a5858042f756259adb61aadadd9c1424df990427a939a0be8437ccaef8a6f3ab3075f9ab2a998f4a7f73989f52e8705648bec1f3b72c2a9590726727dc048966cc79527dfe1f9b9f5feffefaf59b311b5207a6c632375c58808894aa5b4514ac40644b0fb142bf2acb8f3bcffbf9cf6bdfb27d73bb3bbe1150f8b0e455559854347f9c7b01f97eab498c4e8a7b0fc5b696b6f0115500859220a64e8060bda68463e23ff94d516ff7c7f489efbb674f035d8595a9092d2ca782c14e068c082dd0218b168fe11dd0adca009da2b5f101e0050b6ed05a042a99b719396048df50889b020f05b52862080b9ee8d9e9969000cead4f94d5eb22319d6d8950c81d56978cc5654b8b20eae5e3b9edeebf1e2885d6497304a048a6e2701535d5d3d7d2729807fa8e89e37703d0e3f7ebcbc12193919396989947c2989b49cfbffe1ebf936d1d91dc655b85affb0602f90bd7cc732b27eafa5a53a1553ead8ebba535ff3e8d49193149502e9af2aa0c19dd6cca21b10c119ca1645eadafbb4d603ffdf5f6c13fb4d220904980494e8b9fad37367deceac6a53eaeafb9974277567fc7726322e75417226fef5a3444a51dac62169a0d5dd3220cd4820019a853b9865768777ecbb6dd4f04fddfbf29d3b8bff272765fc6330605b9e052d7d532af542e18035f546ad1006038a010ccff3bfac66eb9e3eb5bb901bb2a320cb46a839288b315dd54d78f337a5da10d527a4d8b3420d088544e3420a0a2390182180a754bf329d77b83ee3ff9d54f9268172ce68d360d940b38b03f541c64ffdda48c647362348197c8e2abfdd2092ffffcb3269f5cc283aee6628b601c9806d4a809af0aefb7ecd74bf572d75bf6ac933bfa4f5ead7c8eea9d2ee99fdd57b2c558f53083803a2fdb5b1479b7a1c25e410a901313485863e4666d0801b1a50649fe75c7a1d088b263da0e820cad613a36df46fb437baf3f93fc6abf7d5af2aa088042e4f8df628fee753a47ea0ff852b0233c56ba2253efc674213ddc447d3e19046f471c93ef89c3ecabb8364683c04510435e2238cf032d69ca4a2ee95e9ff4f94658c308730ea5ac2ed866cf3f9f0fdfa9afa2a11094b084310becee24932a7f35aeb1b23a2b5d64a7922d6b7e57a24814d35f358535adac365bfca321cba5d65225a41128842790c0deb9cd7f6e7bc99add1080202b976195bc1dd5785a8948201db80010001004de00cc5806cad60f005116d9a3e6185cd10f8f81833215c3891a289154fa22452a4922e8b1c39e4c91f4ef2760a3129f4e4342406d09fdcac2e05741000e0e647b3173cbe5b590a4840702d082dc879b935d7ffa93caf3a31f3be4171d00c2ec12f11d208cb885389bfc936142bca08e52b7580366420a4f733a6323fb2c6d8e738995ca6612f2f9b4fe037f3df18e51b7f36d9634a30659a669a369b4d356f36bf60fece22ceb2dcf286959dd515a14a582a3a20a688fb6d726dded97eb6cbb6db655fec38d5a9df6985d3a8d305e710170797352e775c032469927ab71bb22df27fdcc5ee9f151f95859e3e5e515ee95eed5edd5e2bbc46bd2e78ddf2faee0dbc79de31de99def5de03de1bbcf7795ff27ee0fdd587e023f6d1fb44f8b4fb8c0214a000013e008049201ff800a5bee8652e1b9ca35c682bfc4d10d18938927cb6ec0f5cb9aa6294ccaa56fd5b137dad448c620b290eaeb8e189d7f129fe89400d4d226a16c8a3a8229556a55a4d6aa75ddd69a8ddd0af0c6138233656c7ff9fec4ddd3f4d81ccc28a7081862ca6d2651b6bdbb4cc6188d921f7b99de2ed7c26989012ce44488292c9e23533d036e336d6b42b1da14bb71ebdfa069a9d3641d4eeaa46507810bd4217a5b6c24f4926830e5b9d28c5bf1ed4a0afc22249ec5da5350ee875dcfabc5b786df9bf95d22d78fcf4572346175af437268e4f92a6d4ddda08c6830655112551117520147f46efb8a3885bf10e49ac561881b094f233204222451f8dc1455ce23063acc5a75ca9490b53a4cbf8b84c5cd92ce4e08a2f795a1cb560a9c35ab88b815f211da50fc44e2c9ea251ea0e714f5ba576511c3dc60774af2ae7071a3c93bc2fc759c0ac0d6c83fa6e5d68d80ba16dd079d08802caa36ac8a84fd40e06887bc55c62c91d76d326b4138e44ee12ad47e2d2265d204f6676342b883b0d674d69b9496b1c6bfb5bd2fde4dd3a59d6a3fa31b03a68de7b8aa597e96e2673e6b31059c24636c956b59d9db49723e56ceac2655e765ef1e62b3f6c32a3161c8d030ab1d2ce145fa484bc325a4d19f6e65115bd487624fbb03664b40febd06246dbb8cd2aa6464caace73e75f0f292ed3cb746bc551a167c15848dc848ef120f9e7c153208ddc5154caa292dee0856c85c12cb042821072de892fe58e588eae5e1ad2e89d4d56f539785fda02b643d1a25ab5e979a04d1ee4e1f633efef1192323cd292ec47382827820faa4df98ec75b1ddf757f23dd04ab62a2d6ac84d46f5d4f02b009800a0243d8780bcf148a4fc6f767914a1b614c8bb5a62d9656ace6d70ed2ee833b32ab99d399a87572a7f6c28e5e595096940d65736e2b3bcede33fbb31c3887e4a83acec92ea7b6c8845c393791a75a9eedb96ddeee87cffa75beed27bfca5f9fffbd235b0e1c781dc3d7a3453f92e0dbf5cf1dacdaf156026422fbb214a4550586e5789398860c258fe2c6523188c075c6a7197b3d49b3f65cd3cfae4eee9a8b82d459659c58936e71f5921010289bf391d311a1794415a3cf35d86f9b74a3f428ba1f3a46a31231cfde989b82889879b3a490f4c590461a5ccd88c2d1208bf78ba7807c4b37d4eab32208270abc228a0fb88f2e50b216d9bb6544fc0ebdfeacabeacf1deab2a6cdb65a22ece06eda81bd3453b36b7f5b335610e971a22d252b827005c216ce585828030c6cbdf4a09d98497ed1a7e059495bdf882faacf9ab52044fbc2bb4213beada4543d52bf032df7ff7590bf8cca7801d53b14fa2f1f9afaff820161aeacfc9aade6c7f0033177081121b13a3adabafec3b6ead2d0fa448425b0f6482c9f7760448d2acf030e1eda6bcd3c1ca345f786033c03a9810acb2a91d24b1754e7b757f1876e5329bb45ab4853b9e2e67a0f45f70f7d058ad77734beaa7afdcb9aac3dedff2b0b2e3e7083ef4d05a8bb8699bf0f8f766f67e3ff7900f031b8c6917c3560bf1630ace25aebf99f0ef988385548eed08fc80ae95767d516e0e5d8603fa6ea7b6ed9bca21dfb8a4a1022f138e981b3e1427e2da4739163151ca7d3e0e5f025ef5b4f67b0f29cbefda70c4406a943ff0c6746b49cca8f7dc7df89cfe499bad333e3cc29f3350b5d96940d65135bd976766eb29bc7f7066fd731628dc70be3789c479fd7bedd9577c4db388e2b727f3c98ad33e4fe2826fdd33da01d033196aaf3f94e17cc2bc8a7bd9841fe10d45af8876a53331ba09883f52bedc28948463506de1f7ebac6da79bc1424a889bffde1d9710e4a3726f3219e198a41d98fcce5ced92df862d2724c147eef54fa5458805741c7da775afb5329b80e36231824648481917a43f805dbbb640361c452384eb06f0004884ec45f62a5837fcd1491ade065c76e86b3b09765aca441807e9c2a7bcc253a43fbc12e6306c3a4d2e3b8da079eb23ae6bdc90769fd885593434636e8ed9ede407c60a1b56f46f6d7f5a651150f8bee495985b60e50f3141bb945f562386441190130c265bacae1e7d58e4c347e5faea123af571f3c8289a25294db22b91ac0962a2f49101451e9ba866dec718d99878ef44dd29f19501dbc43641823c6969f6df6bcdb64114ed7ac4e4959b71d63e676500f7bd4e5989cb89ee66ceac2e5b2a08cb8468cd9319e416ba5238ceaab70d59873718eca8f8ab0a1bd26570b8a528d0fa599eb2c3674213a4ae67f6f2ae8ae0c5033cdf02debb2944d517fb038f5e656a77dfd6b3a1f7d089fe91050fc21e943110267a1ed64c8409266159f85294d81625424e38053db3ae83f8f3ba052ee55f5758aa881d55094596a7368d73ad30d8b891edad4e26830fa0af669b40ed2e8b9319a719f4a14968964268ab1ce6905ac6cabfe23dfacf866088ecc4ae15f847111a8c990f86b600acbcfa27d5196ed8fb3afe229a6b98e7aa72fd5f8bcd9aab7f1135d62f94e64a779973dcb662ddb15dc39dc7867e8a6875efa5c7a7738dd824ba9f4aeb398399b95df5814e07539586195b5db75b893b64a71111c4a29a54594cfce6539ae8579bdd5e39d38cf5a1f74fb684aad00c8fb86312895d2170da0066a44a0a9ea2233b46d035a835512d6c85853a555e10c9a174beeb9479b67ed7e1f3606877e7adf07afbe3b42c8029cba233ad79a12eaf9986969721e8be7a94123ca1505550d43e01a807945b6b3e6f189cc88fa57ae81ea1054d5ea41f4df04f11222241610a9f9dc234286d6aacfcbdaf16736c9c88fa8caf406a24165ec7d5cc41c76de8d6f441831748644b6a1ac264ee25b22a19c514851525bc48ccff5abaedffdfa13258a7f480eedd8a3cc615a3b03bb71ba0e4362230c8c034fe3ed3b3d673d0d2e96cb1a56a35e986addf05b7275f6b8ca90957d3de1f85f88d5f826985722b5a655735b69db3c2a2a8f65dff2326609e1f2c4e5d6aa78bd1fe1ec9ce88dedac11d1e0508a8a189f55b7f7c8b69766f8177e0f0d241d167f0a840e1ffbe4d5c4a40d3a8c167d4aada4ab476ec5cc8160076f6496079395fc71e4a76d092b25519bc00e75fdcf27e3a48509b5f5ee14e3c970f2f87f678ea74cc5ce51467963dc81181d27d2862ed98bf71c5068b4eb759e21184db32f9616e8f3a2a39ed6555f8cb466b3cd12aa320845648cd940f55a38fb2f4ed4c8a8a3571ea9c8377122f02ad076007e634ea0bf24ad75bf7d3392387d996e7f50ef6651a6aa9bfaeddac7294193aa60114ad1ba365e5c5ec58e159071ddf88e8fef1a4e8d1fd1884916a92838585957ccd436f9d36d7ac484cb1bc74eb81c2e72d3aea3751ddb855278592ef2c5230f2f8fbc5c3972e4e57279257c7158b9bcbcc0cbe53c24c3fdcbf25005228a5226c7eacf2e0d159af5b16d2feec1701055873bf0becb4c6d1ba0b227326292a96547989a2b5aebd91f921cf41cbec7e067f286543a2d9588000ff97eb3fc798b12a1638e8794d6085d70f2584ebcb0305a4da304daca54dbed03c8f3246db415c14d68224614666991544ba95afdfbad821da434d704bfd7add1d3e6eaab7f1f22ad17cd34bd54bf3f015f53a42009b952bf1cb16110774fdcb0a43d0eb89f2106ade97729e86f79463e952c53261002909cc9176b10dcbeadb2a2e16318600812061918c31900883202018900d30000ca08042422480000af0aee381a5b5cda23e87987b791f7b75dbdba55d1f4b3c8f6e813dd42dc5a662b4f96649322c5d85077d7f34649fb78a4caa64fbf9e02ee18e10c67289b80246b943fd8d94d5289941b76f04ca799d1d143fd7bd9b4dcfa31d8b923184cbc3a900d3c3f0d260a82da4dfedc7e7bb70a616f24fd354f64d21c7433f4c4a26195bbca5b1e4ee93f93f8b1d2e7e08527ee3a2e22fae7c66387e51055ce43c609a2a51bc3696954430fe577d401a45e697e5e4573aa17635b4374be189f2382ef766945d7aae0ecde396ee40300659508102ec7e0666339408b6635596d493431d55885af56ea131ab9a9bab296de96601c0d7b080819e625dc1771f14c44440c27a05f4bd97819f15991c10620a2888828be8c8822a2088898ac7eed2d948deae06322e91b745f2d4da469b1cb2c36dcd6929844e89fa23452dc3dd948a4e5eaa29fc76c03ef45872ef148671cb0b60f41825283987c69571167ad94735da90b4ba55debe5aa70810bae15471c54ee1bef638a178b6bfb8f19ba42d78e7839200675f4b43e5c4bea364399e905eb2f216d00834e954838fad248965952ba23d9ca2c76f2747ddec46841b553c68ba9f42565045655da375449fafe6018895e14c559eb04767d61749c8a19e63e1cebcfcbc7a3b237ceb5700dfcfde6e59f94c208a46e1e9a47dee2607a05e91efc7eb3086e4b32d97aaecc8931a8f5dd3a1f721d6c291ea755eda7bb075a7f01ec1be8f6256c4415961701656bccd353be7fd9238ea45e3a9606a561d2512ad0117bc1eea62e57e21668dfa712b685a51ed15ba2bddf343e27ded8bbc3994a78af5dc87a5640bc037c231a7f22a9781829863981b271549b2182743976d41bd2feeaa65f37d555276bdea036faaeca27832d3221dd5cd10cdd25e4c7ef1824fedb5a351a71c9853a1804b1b7254f575e2c71bfcb0361b3eea2332eec5b52984bd9e106534af1000e4ac596f26e03613e9c54904072e72449a611c718d22505e5a02388826ee26c0ec0ecd982384b30422bc1118745818076200bec18830aa985b02cde8d8a55d96ab987d25af1bbe7abe63dde94b3e9683f5686c3c922b98e696917cb447b0d32446591cb25dc3fddbeb36c0ec319f7c40e0cc8f270592ecbe5f0ca91cbca028b3cf2c88e7309746f6cc8922494a13755de26955c48befab0e35095091ad48cd8fd25965401cadd258b58a843fcef54c15efde2b4d3526987cfa75ed8e9e8abc1877aa3c3ca8e7d5014a878e886841d531363a525b490d1ba68eaebe0002adbff1021811a709fd7b3c2a78fcd803db4839f776d0d259deca16a49ce65d637fec1c6e965221d738fa0f72b31d8a847a2fc5a7da5b28f6130dba396b79d81567fea3a636079cd4a8f825a52716941919139db9397a853665d89753e70f05f510d2bac1e611e6e753ba3b20804de42e0b3075a84088284c88e985f30e412220812220b83d5dc0f42044142a68b98487ea5619d941cb2375112e94245351bdac7ebdc9c82dfd7c0d4176b6af7af3ab7578bdd9d42592205bbfe3c963d5a297961793e8f07dfce362002f88dcc923077d248f7d5f7bbb81509316615efafa898afbcccbb461953ea652a32f9ad14e1d52de66873bf9d39952bca90d7882f3d30858c927fea158d4476c3d3b8db595d401f88f45a3a4bd8d71544aa6b93cce2d8f46a05cb26329dd3bfc445cd9b9f524affdd208a28d78c152f75bc3fc86b38a0d7d9f0f90b96c80a9e70715eeef729358b5fc3af2ef1704ddb622ab2e0c2f82517e4ccad0fb75a082970bd2a233389a2fa397924afd272e4e49ed322b414c7212322656380ca91dd5969caf755206784b4500a56cc5508f0b578385cf77c4c7f04c3ea67316448fec506f5e6cde26aa0bb7df9c383ee1417e481883fba3f02717f810c90f2bc32bb1464be661e5ff8ba4ae206caf5e55250fb5bf00f82e6a87cb64cb7479d0664d48666093943b17183691e996f23337e97c9987c22a6f3fe1cd0b66e212fdb75bbe734fb736ec35d780c6fef030ca8dafe27f7c724ede6e8366099116b6cb2c33e879d70ce15b73cf2c23b9ffdf42788501066bccc12e69024453e690a28ac98924a2fb7e22aabafb519cdabb7c15634dabab6b4ab034d74aa0b5deb4e8f7ad1bb3ef713c694bb5550661450e69450163ca02c794259f18212f08612f28112f185129b04656d32940d15942d35941d0d8c3dad5128073a28477e504ef450cefca15c0440b90a8492088272130c25150225130a25170653a0431a853a29329d623328319352b328339b7273a830974af3a8d245b5f9d45840adeede3a3dd4eba5411f8dfa69b2906603b458c454834cb398564b68b374a5dd32b3d95eb6d8c756fbd9e600db1d648743ecf417bb1c66b723ec31f1360cc20400e1f299586d13395816cbbb43bd5502fad382077767ccbce9b5022646bc95d449b21cfa93080090c8556f8e15b639e581efd111bb34299486daa15e68089a8e56a373d021740f7a097d8341cc0a9bc0ae612fb07f201d8aa1178c8285b013ae80fbf04e7c005f831fc02fe12ff0df042ec189a027a4139a01061064e87cd432d3584bc561bee0090a3e22cdefd06c9c7b883ee48b701e03a7c02924e61d624cec6c03db10b33049a45508969d2e22762bd8993cdd49f53d81a9f6a46ce08a69f2e76af969ea6c14d5038407a26d1178503db6c2311bcc9b519d4158734687627dd6c30a00d1225c3c11528994459402a29510a3825875c469215e07096692682e497a48b668708ae546a47a5cb33edfc5152a0640a972984ab508ea35a39aaa1d9325421431e24890429a4cb2e50f6ba57997cf532fd7a8fc527e3e46aab2aae4206e03eed07eeb59b3674dce684bd32db97e850d637398231de3c4e934ecce72ae0b5c7a52a5d38cfa9859e668324fb7a97a0de83068cfa20f72b140890a755a0efe56c3458b972acb56422afe054106c5006308640ace12021144f690b842e60e852754bed0683110b842174eccc08c05568488d9e1c0a55f42be868268455aa1a00313b79fc74433d219cacd552b339729553e4c00afbc977825b1e825ba5e95bfeb41f981763539a6754dd6a9359e7f1326b061e036b4914d6d75620d14c0a3629eed057c80339894589a66562780bb2023af30d4ed4d5912b1e7ba389f2563308400489bafa104eb271e3cdf437fbf1a8ec98b5e8a7c10059b09a15330376d74a277f95ac72e5fe3e88965fcf37706c7db82de450f4ecfbdef24d8c199758c0e9c6dc38d19b7c63a1beeb8f142208b8be520a7d7605fc581e0ae05133bec0366d8c28305843044985da9b915f481f3d15546cfa708f85e8670a9f9eee0f62af40ed64eaf4056e92ce1a017d251aea1a70619fe9d26192999f36e8e81445b35094602f96023fad0e69b6147fa0a07d08f2f0100c1bdf747ae91fae8647b6b7ef7d0afd39e47f981c3ac8e8db1c3ff0100fb9337fe2cf2e9655ab6606226a41ddc851e44dfdfcfaf5e0db460937760fc145a52d8b61d1e867ebd279524e91a4d3d36feff7fa54af0c55ed49265686ad71ae0ffc3d1bc3ff0e8b74e5ce201d5bf0780c72eb9e6b2275e79e3bafb1e38e7a98b1ebae2a60b6e78e199e7ae7aedaef3eef9db2defddf6d61d2f2190f5ff938bf221c3fc55f3615beee763c52fc1c94eabb5fe87f92124b09e4eae5830a22d253bdc3fcd8787f16cfd21d40fff95f913728a1e3a1da7dda729761f9ba2f7903d59df05d11b63dd3ee241cfb036d8cbe00d3b15e246c8ff02b109721f049e9d177f09fe1f9a46bd55ba206e61e5b488fecc6c9dc0a1a83f5f6c1f237015f25cf946354a87ac291d816ab9796cbaa9c64290e26f5fb33ab237bbbc256b4d73a07775904f9e634d55e6fc197d33ebd3452d7689febea5754dd3bb12f441f197a7c7fa4fe147a8168b2ad25bf54b2ba2db94aca25025db8dd9a163e788393eb44cffa2045b5632d393ee9393a2954c89f5b68a521807b253fc387ac39818b34c237620c38327f2591ae76496cc73e3587ba923fc3d9b2d150a69a09eef27d4c5f8b18ba6f0a3cd592a7a23273e596bcbd6b0038d7de2ab9dfc4ac312142b2d462c4c382b2de23b4dd91df1877c596e469eeefae2c4d4a478ebaa6833532f530f6972434a6962961456441b634491c6c2439ad65a9f641232f67c17af4f0969b831b9342445926febeeccb795c4e58aff4e1bc269348196166e156e458ba6999b9b0b6821e6d9a515fd01614696d1b9e6e6c6c66e6eaec14c5ba66d9f691a9f19de6e6461f06b29f78fe381cddf59d42d0816cd6d2c6fdc85cb684e6e35228eafe1d432263350aa3e0bea1426637b08a6d01a03a304b08a9979b44c7aa0bfb58f8921343ab9f92cd107f6d78e37ce98491a9fce234d68ffb5b03e676a7dccd7875b905d67403abb7f50f573c2ac62ab8e73ae46ce8484f4921c06e9e29faef9ea0586e902209d7c2fb3c81000161922ccca4b76bb97daa5a816dd5e8145c4b25c78000af290ffd554f97911cbf234d74e0ae454e51d897b7bb15fbdfc6c3eee49c1bbf643286e916839958eb3002f59e733200898e0d436a3dcfe0ee58da8d6858ade83c4f41690b4f405e584b5c825c48b40dba5fcfa0b8a45f3b12886d6737ba3b52c593fef23aa6be67891aaa91e4e05134023fb2cccc6e97c2ef1e7b1ee88d6853bb88a18ea940541f5f25746ffd9e82f4d99c76d042008f4d5cc5840e61606011c8c94fdc5ca8344348b78f8a3359be7dae9dc46b70914014a51ce92af83da92d103d136603d80266e30efa666f16e6a86068599efa294e86af956b3a22931595c7b5f01c464471985f4bd7e117cfbc415ebc1a2ed80b8b878f01defd1bc8b4330c30494d56c96a911885575d4d9c805593d7e7224eab4a061e5cefc39000241f39cd9ac2950bf193ca8a9c2e5563e4673227d420c2090185611f2fd95bd95a4c359befcd90439b841da12d3bd783680abceed1c0787975bd975f62b9956355d6e331cfca5ccc4ccade6e323337dfc782bbf37ec45ddf15623162e7adc32faf19ef13bc77f3dd48f2d215477c2447912dbe2f466b223e403f8b56164316a4173759d1b4c46b4f5d0172a24334757d63ebed9897f30890e74b916ac1113e32b630082a4707c445cfba68e54534d9c29150f318a2127ef715e962f996e478ebd00461c1d65e8633896e5bb5075d1cdd607b7bc3f4f71d28b52fd8662562ebaa1463eecaf50ae828b1107c1b72705e283fb17dd5f08591888598620b867c732433a58b735daefbef1957d4196715a3ecf099378a31feebf67b49ecf853216c9fca9c4a9e8d4767587a9f1d2728eb5417540fb56c812d32a7e7e0b2132f4020d4112c657cea90007143da32f160bb3c2c56140646314ce77e6129d1acb968e700bb0e4c40d043d94866fc4e12c8fcb4e1da27f9decf929b783d2863c79efca450a4fb7f757da494df5f7f97267a29bcf4ef23946f9fca4810cbc6490baf0f814b1a0e29e0784d1ad867869f52745c2c0d710509f972a8804673080b75ad2ac7d18f76ae3552fefe288e2856f7c0103d06f4b0008d895298da72972a2ad834dd5781e3324277bd8ee2797bd87b6739c76d30e0054898841157a2b82d4f06f905461cc04cf9b4d094f0a9de3a3121162c79c0bfcb48a3663f15b3696f26b585a14737b439393927a3c9a372243ae9e0c1163dbaf4bdc67477421f5c599cb9641f0076342ac2ec2f21b612f75deb4d0b951684497b17093516c7b2ed327b7aed8a61c1e9fb4b5f8fc86e606532e303bfe17ef75bef54c7c64bc605e207bf0969e3dbf6abb3c70f52a9b947c85b2a1307d297a199f32d1af7222ca2051e1d06dda9f9e516ee96b271f5e18bb76a19743f3e6f25edd4ee78518b50ee13464597ae82f2e262a596c271ef66ac4496cef859dbcd34d2482ccc6727c65d14d4ae42c3c50fdb8d807da494f95d65c7ae6061a5d48413999203ad2b6ed49a66cbe62766400ca7c447913e826427ab3ceb51ffd61e42137bf49734184412cebe7fcdf81c67aded1bd46399d4a3d23d503f9f64ded8f5d63d91f808f1a8fdece08d62c3e22f69b7afee829cb83eaa2fb071e9f1153e294ae91edb5e334d6374237f707cb3c7d0d873486f405b5eec55a54d0030b4795b1d05fdb647d299dfcfea3f1bbd3433dbde918f1a399ad43f9a7c38bd97ce3eee8f3edefcdfdef9b0693f4bbf91de5f3c9648eb2535e2dbbc6889939a8d2caa0a088253b65895708ddf079706b1d6d0aea6f8a6259ff1fcba4fbcd969797a2393480b6d10d859ba65f9db9a17aa1276589478ba92f72d155f1d8ca125a107f9e8a528989bf2b9d7cb74c619c217aaec396e625b199e8746e292406cf294b787181ebdbe49604c278421068f94d57f7519929a9fec3bd12d581b6b26e975bb9052d9e519fba0c304916d47f3f8dd4eb5da5dbb61a5ab473ba9159e4837b4f3d587c60199cc6e99e2aa5be0d1483b1faf44ac750e05adf90a7de7c9e061157901ce52ff0c853de622f820ebe82b93dd493ac086242beb0e337bae015da29c729e8b2d388657f3d1439be16a7165e2019dad0e52d89b55dec55ad6d2def2db6ba70cce6a4546ca51f65c57991a6c63b986e85b64319b793373b37d97188d02d6fd7446c2e5a1a16d41499de709098be6553f788c7e6c07a92308738b73744ab03b59e4a709460306d6ca6d5b208250ea49653bb703c73e8fe8b065355d89a7c654651cc5ef8584e733fefc747a5728be262d9ef48c0a79119ee6fdc9d9e2e59c908006965c5d75fd40d01c906263116ba9ccaa70e44fcefc3c7bb5fb4dae5090b069aa570e35c7c37d4969c29ee40db0dc20ce650ba141ecfdc30234e44d5ba21bbdf7b7df6bcd172df22a568da367fbac1faf28bd535564593c89450d9cc2cf0f5147f460412ff89dc4550cb460728eac8335ffc7c1564795ff1dc73a4f1b0cc492475fb37fef253ed459ba706919dbfff0d3928a82f98cf1de871b07874d9938230deb2ea6fb8443961c0adac07c1b70a3bff31b1cd8265d291a5ad5bb42706f073341189e070330d7776618cf28d8c9373831fa9c48125aabf15ff80f464633a16c9b4dcfbcde652db62ff742b3ca2895d3f560875c56df58f77a82dae17c21c4e8716a0106268ab5998cff64ab2ad32ab085b2f60dcbb11e6ee73cb83bc5906ba78d6238226f932788c8652b055180621a2b47f81deb2da51a1b44e36dbe5c24b872907c096aca7da6cfde7de7a6bb806d0889b364280e8960150d9ce21005ac1a7fd63e5aa73238b5bdd5e3ae2858a9c8e88ff4a758d70a724450260d86074fd4a7f6085ce912f88f8caf067b04b9c52ffbfeb4da47ae41a84cd0564e46a11db4189580b83ade945e6c9205d6e8ce496cdfa353681065aaf06272322a83d3b7399aab1187b9ba40e81b2985ce0dcb29a6b253bbb8d992bd09017e550a22d66c60b504096e61d658aa4623f59b381c6482b28600dbb43960ff410e2227ab90cb47d5cd43a28f9fa21645187049ac9d0c8f984f4b813ce7745d5df4c73cda65848c98bccf871b13f16b216a7756f041b68deee25d94db47656d7975bb08ea0849895d72a87bd1c2115da39e1c498005ffe4028d0d5a4c7db9c0012ea9386bafbf5a58ed08eec8ff04a9080130f99a4792fd0df3294a9ce052456df147d3045922812d3bf60f4a4a0050a00734b043d8ffc5d9014120c7ab97969987f0486baaf5f40f0334a3be490f2af41141ddc72ef32ffd9bcbd8a0e5fdbf86f7dcc7bfbe15b144af66989df157ea0a077db9b134d3ead70a79d9859413e16da8daeb1de8f0c766fd7ef9c744eee42a8d3aeb82797cde7e598953b1951ebfa3d77d87ccd37a01e9f0ec9ec82af86774199dc21e38a25630d6a801fecf1dd51c8c3d2836a16bac8f8ad86180a23e9c34c21e7de47e40731ba57ab04276ac88dfdecb861b3f3fed14facea19bbb09ffc2921f20af094c80b325cedc94d61bebb57abb38a418c4988c9e66b397754a486a9a9f44b54a5b98dd2d9aedfecb3cd40c22660e3a518604b08783b5058657fe18bfbf95149a3be5f870901c34e4708036e0ea0fbf0acc3784da3f9d5c6d7da49838cf6950040269edace32ec8f245644e7897a1f26671aac8f08bc46192a9b9741bffcb8416d9d16965398a2f4c82b15a5cff20f1ee61b6dc4ca44b8c469870dc1623d6f453155e977a25cf61b8595fa5ea7695c08ed69392d7582a2dfd24d478aea8555de29c090369e68959dd03aeb5e83ff25b72e5333b551d4ff932353bce02329442672238801601920dae3c85d87a6ec83c798dcc63cb3679be4d213b1b4b184969628660a9995077a7e554142ce595c74367907b88105204f733279f529d77226de8233b07cdced10d551d3a5c90f6ce659c2ac514bf30680f26a75ac15d0eba534cdfa7393f0031ed90e54c564e8001083ee5161562beca1b8efc74d60b2f9f44b08770a97436e1a51dd2d071eea0833406a4a81f32235be0a2e683728bc12ab1ca3dac6de66241de773d1b6af3a8c9a2ce713bd5c8ad385f5c3679367b70c5558563db779614dd164ab851a9d33939e16ce3ebe2fcd022d40d3537ab0087a11ffb98e943ca9c6c37a53d861eeb21b5d61c6a58d67d4d0e7aedf7a5363000b10a81b486ac07eef550842fc177dda5005ce2c3f3353680c1e77e7dbacd791626e4372100a69eb5e2b17ac40f5597265bb673f0c3e9adba5f5e68d553d533cc5060d730ae7465e480563ad192d79169ac28d62bf90907e587d4cfdd32d43522f876d2a2ffddf8f47e40620d0c3409d57c39599aaa335378403cb220fab6a54cee786a156cc6a55315f545f5c53b0ae6e0f6d5b4c08d27db1dc0f73683e204f46c55e33d9286f9b0b01ac99a3390b9819bb66eb32ba1d6be0194e46a3ac7b125ab9b73da8ca2e5bac49db47def20d97c2551ff9bc44d9cb6943198dacad46717ada3514c57905887f25faa2911d1d80e1e7c166139f422b9513fcabdbebd7d7c35be16393b40d5cab1b34b2e8f3e67a08e9b071ee0f392bd516d802df930f217fa18a70e80fcc30cd66f1375dc0daa7080f397b9fe35efce95039bfedcd013a06ce6eb4f65972e9af14ccb6831023a8bf2fe2b744c21cb1fa02abc81e133d72fbedfa7bcb2d4fe9b5491b34f8427163d7bc3b8a9dec86541f586952530c17d4a02700138a27164ce2dd4ea4d8db5d56ec1f048a5a3095291d26d04054035735ea15e09b682bcd230693fc4177e91b3888b46cd11ffdbab872fd94b80fddbf5e8834ea5be45719cd0175cae5936763d41197b6152d8bb3040d13c9e4d319df5fac6cf0e72e750df04a7711fe25819340db6e28deca937b6dcccd1114d5d1226e0400b00c609bbb88363af07a2047f9e6d73e3bb711b74c177ae9943fc508b3b1bc65e363b66538eca86deb07e96a73d465daa6a7bed8dadeeef2f1a0d20b1c675c8e3d2810c6048b1eb03cbf4a0be3f699db50b425036b8a00e53f041d1832f44002f7bcc88714544671cf37e3aa7b14888761b34983630394586557e60bb817509e880ba4398b53ad1be2a78de93d7e7b19bf356cd5804f21db74bbde57c98e802cf271a05bb293a671af9de03010152af87812d1fffe3018e7c187450c3acf7248b47d324404410e7129ff64e1a60c2c972cabb3cee9c99b8cd9f8bc8943fb20abb30b5c604964630ec021218062b3d68b1fb436be82121f70374a82030adfa169fd795d36563a0d5dd0e3b4702b598f27007ae33393625b18de17f024ec69e5ab6a892faab7bee63066269ba27c2b519ace1fb125bd3a2535526e430bf109871453a19c2330c40adc0a7dca5aaa2ea86204702b8b90400881e7bfb82c328362e80478904c472f7758afd7d2fbaa8c48bc838b9907c0561272c408786e52590ea5829bf9534422eb6a08e584fa951b1ef74c0947cac5ff5da09bf883ad7e46f60291a9e31941ebcd762924f2e52d51ad8cde79e58d08dacf7a2472f01d5360bae7231f0d026d238d76a9fffb639e8941d60d17e140597168caeed773288537e43f9b701b68006a7b4214dbbad24681eb264f37191c247b7bee4c31443a28af1984612dbace87b75686f5735e57b90fe89a05c447d720988d52aaf878106477573580477a3d3414f69687b98bd2bca86969cdeb36b4ace9d08344054d87077dd90c8d073939bff2c5da84c57df3adef8c4890ebf559e80c5ae23e45eac3d78c4ae0801f1ab12d7210b8639e1f6f9a8cab7b8ed45d3f44ac74eea5a8ba7eab5eebd1c17a618c7c371d6c48809c3cc00112278b5c3c5d678ba037b33c8e6c86582c168346d2cce406c4687e739374b7b87c0cff5c252f9e4970ec45b03db58f0446c5cf446bc0165dac5940b7969aaf012ad843ab14d77f693a76ba952acd4a17d425630576cd3acbf297db31a814570ac85e3b084f15e9d2c11a3cd3b9782c31c996407d2d6d208afb498448f736e2c533d29417fb45f4c585b63e11b43907524f8feea39aa117255cb1ab3a01e36fd9854198c5f9fbff4fd9949b270545a9b030b7309e33db8477779e9580919f96e7d5cc70eb6b6a7358dc11e56338a7e34b0fad0566434530f111c0428d6c525a905c30907550ab8942012e4269d52327d782bf5dd8808743966bcb80208534502cd551ade7d740f422e2e07326c88342b43a544dd1f6bdafa7f5e258500db613dc132a62df11e3fa8a4c3131e7b60fea390f1fff3fd132675893151395575c1085718c28570de4fc0a017ad9c5d285a50f090cc3c7ce2e4706ff90bdf4bf878ce5c7c85200c65b12d04f74652214298498159ead2402b2497d95600006110857e3e163ae0d0b9d5329a26d8882664fe9119321c61a410643cf4621299e07a0cdf83b5454eb43dace4f02d6e4da5c1362e22d6dd02f2ad72a93c25a10ecd71958ced66795b91b6612ce776b1024663ba6e7ed7602b7a27d5a0b904bbb9c606fd43993218c622d5c8b0cab9835c2ef4a773a82956a08874b6e3385521a4a0822855f1c2cb197616a0817796b1c690e3e24bf8c6abe5e8b06c24b79c7c4257bb122586e6c53809e4c809abcd910d154dbbda4b40074848ca78f465b006a04eee83a8efe1d427535719cd4d23a7b97a8e714efe333f0870cd7170f6c211f337175a03a7bcb6e4545fa971ca7403b1bd4d9353dc7171a5dfa993d1668a0e50db473365ec0ce26343d73f9d1f8c0c799f2eac512d204c6f29bc5f6d1f1c4eec7c9076a13413260386dea5f02c42667874d9a74d64b5d08dc04a0f2ccc7d9df8c45d525cb9c83db4f28327db7a219a1340a1ccef4b0c1ed5fb91f6b1bf0e05d3a78f2fbd9783641354324e5080cde1e53e3413a5f9eccaa59de9bf2fab818693ea5c190f9822866d77ef693d57a535068fae7b67545101f6c78dc898b968f1cb7ebf67728eb916f57dca33ea570819e800da02c2625106ce4c2ea99e86ace1f5e31994081a6828de4029989536a43f557dd71d04d8e7943c3e172ecbd8cbce58965a79689579e628b001fc8c45d63529232a194570a0e3e684893313ecfd15a4bbc864f071d04f2b5348d06cfe848190725b41743074ef5a42adac1762ecf46dcadf6c9847b0e6a40a2288f5b0ead8e160d47469c15542980e3c40726720a74cbe13fd7edfb403eb58af7e1949d567bdeb24b618c8602a087614be142eb5e56d073d69028322d725274ba65e340d47110ce4621c7f685a34dda3eeb513f7385c2d2ac160874ec03795439336af62b203dbd22aa802ed362a074edf2d1a1a717190e63a8e6c93bc211859c49a9d2c16ab5d1cb20025004b2ac4954267d88829656d6af52b0de52f6ad3259a6025ab3699139a831e6b22c8df184ce7357ac0ee085390f7a5d6e6f29b4caa98c5cc95a5bc434461f82cac4449d558c1b0e4f35b0bab5750ff461a3ceb031a798879b241d3b824082e7599ed7f1becab0fb8be1eaff243b150a73ede4d527405566130a026257fb035b6e8744baa0358c7f2e6bde73390fd82b8dfce57b9ff1a3fa1304b407644d40852bb092b0b0d849e5319a85997f5d6251a77a2ce419731ed233fb7bb54a190b4a4d491781a9995647791f2b840b285adeb388d4625d880e483529ff37b60610544e11b474c07ca1cce1d6fea0fc7a11f05ff9e5139969836e4bea7955b276069480e37c44ffe753fce09d0f2fcdbfa2784089984968ec36c8c97af393a1a37d8698b02ea4eda832938ba1e35aa1f2e76fa35a82f8cfe5231bcd612220b9c21b28efd4b93cdf7ad31cc91fd27c6bc38f0e5b39a19cba3cfeb04d579ef4ffdbd8f3cd12608ef5b058953fdc2a5606136c5f650af975a0b1894179d5eafe27fe14681b4bd0503a6b601e0bc52117ccc782d3b06928d00afa1a55533894972a893f710dab89ea7c9e2a64725fedaf76d03a11198773086510b200a027ff93105097984689280299473799ba8e35d0e731029f6538a2d7ee678f6eee4198ef71f9c7b4840c8317506ea3b36ff6134de5b8923291e45ea0a09f9a30f5efbcb2285b2c4d787cc230292ce9a446a4670818469a775181a29c9688051398ce4a07d18abbd1f0135929b5523768cabb2afbb09c7675c8247df907a7a9157f39eb950a04d176a3c8030a54676aea312ff5d75acbee442bedb5126bc31a6bbd61332c3b77855c547c04d52d9f5bbd8594dcae0fcca32f55eab1551eb3a7a32624449a39ad9b10a96eab96ba2d44d6bf60b11ae06e39ec5bedc467d02b7829c2f0b87cba9846fe40f24c91e81590fa9593c936a16acf3c9861aa9a2c6364241b19484e0a21868901b8a0798290e36d804f69254586d225c83f410041cdc5e32af11a1c43784909d40a0330a841c56a8040ac6da67ca68a5f05d4aa92387db1840523ba4be2ba4ab63300683746a9f7d0f852926a4e8dfb13d445bebd342c41543243f14e99d393db7154a7394198ba104349923ea4a51f7084148b79e1b00eb35c695b574d1021dd6ea6f94c1dd280a1a2ceb6ba3c3646e0ad5a214098853035fe10da2e72d8fdfe14c324c28e477a2a9749247d686bace19c02a7b21c69805d9406c18a34e33258eda4a315dc4cd55f566c357649334d877029a57b5610a0a04490403379a1ff92c86a4b81626912c99ad069010983951e96d3a4f5b47f58703655d4ba3a44f56d9a1bb47063ed613acd21a5c4330a2be81a00581a7ff8f80562318fb5429c757cb58a53765c582f909004df9869fa9fab6ff8285c04cc619f1278fc130abd9004b72d583fd9b337e7fe4cb2a770c61d767f7660ba1cb176d2f1d0811c65d187e49f1905faa656c7300f12c5c288eb6e557f44a3d59d17a5ff2d86152c91934fdf4db107c58a967d13a35d9be5246cd954769e224ca7435c08d000d36e8c50a00da560bddd9819352e417cd6931f33e6bc3922e3118f334419d683a9337790c4229ecdadb3a874f752dbf2d1ab4e73606908077b6dde87a9496a59d0e83c283dcff1b35f115bcc8d4daa0382a9c5668adf26ac69bb31a42a676efe4c218690a7ec164c204de40eefcb3aa7bcbe2382e6c08e59699e29bbf677f15a6f4ab30a51947dc772ad13a967f9b873983d05b476930c54ef8278e61ac7425f952aa231d2f488e5ced1d9ce86cbf52e3cf632b95652b7e8c6ae12257f4af3f5f2818a5381202c1ce88ead838522690608c87858b3e2de7b2e8522fa3c278a676bf52e63481d8b7a3e40d0b2cba643638519844445c6451e62a28c7e11e7649858e6088b272f23da2f3c342f69ba8c0b9b094facd6f699f791f0a3b976302049c9819c5b97f6c6f8642ba76e00ce7de3cc8808c3e8613d2d6668d16b1e80d285c7b60f388d399bb9f8d8c4d5b394bb8b72146c5c9a9ab2bcf66f3472bbde334c34a88cefcf858962a10d9747e4f995e2c7dc9edfbf5c0c63555a620141b1c5c99848e8ee4fee6a9426b1f3634b44565ae5a8a3d371bc579eaeefd5da962ebd87b181385240ad3cd2723a067496628fb2c386c102db2d786b6d0001fa7e5591e7600cf29f9f023e007d561316a1be3af3b6d1df6f97107b702311966e76a6d82e04b2052731ed7bc90cc307dd15202b14de649ac6e9d3024bd77415a810b24fd4c981b6556d9a1986138364669d572af30c865925327f1a0a1e3b3eb6d1a7b08da6c94f0fa79771df93ab26cb06ec9812abebcf9298a790a567116f5ad5a77cd3446df0f5f595fda91c182f0111bcd86e8680f65706b0a9871a680fb9a5a550fd1ea346d242248927b41522790fec660351bfc2444c7198bbf97347d9f58dbcbdb4b5b492b1ed4390740896591253ef59acc56be1c7e2742e6a74302908b5adcc5af83f833094cba70ee9624441cc425f885b73936d73ad9c399e68dfaaa50f39bf53bfb3aafe2aa627561d6a8617e9e86e531a6ffaccc80ab3cfaa99b435dd820a9b28c9ea1b8a408a9af2ae4280af3169f1d56d76ade2564e5f448c777e9af287ecd076f5bdb85d0759ccc3bc0d27f12c5b689d9a9af38c1fac33821308ec29c0b6db46ba0d3a55fd223b53ec506c876437a0748dc6bd64a73b1de7b9256f2399406a46eb722b6bd9e112a4bcb1926ddf65840f5be812a7a54e59e084c3dd030cc5676264c770e9e8a80acbd4f0a9e88d92e48e5b14434c4a36cbf28a399180621148f142f45569976a5ad60985378f518410d66a3f522031963ccc9b93c429c8501ba58d9d7c9f4976311d58388e984644004c8e1907461c2f3d737dc1471a004e0d73eb15a6743b5cd3afe9d09614ab3841e9c3d24f76d3f229401099831d022cbbb53f0ac983f464b9dbc1790843069ea589c1cc7a0b5560558862048b4f69a5b4ebc2fc546868a9816d53f11466980cf35c008e4f3a4baf91e5a7b13b25e582c7995bd38dc5c17c523e1c3e1edb4ba032f5688ffacdbd8d369e451a02967042fb4f34907c3933c9b03d47820d82616ade7b18fdc857cd4ff9702af4321154509d744e5d4e08dc240e3ed4504b291ee34891da0b1a190bf2e50f1b897798d2b5d968842e4f81ed1628b12ec6d95896c16955a3da20bfe16cf701ec2bc4ccfaf42380a79d78c5e400d5ff37468e9c9961a7fece58bc829c1a9a03f1fd36166ef0ccb81ac41e89410ca5e59d6e9e66eaf9c503ec7dc43f42eaa58b212f67ddf41a3501451e5395b6390913e24ef21d9a8b0b035e1946e085ba1a6042f42ff0dcecdaec10e054503400a94c112c0868d2c113dbefa4b495edd924ca29681ee45c06bb2a0019c72c502b4cbd845a2485804884a24bb53fb740b5c5e6f8874fad4dbc0428c42f0e776f94cf86c3e3a8962cb2bce39bc36a858f95981e3a4057fddec921c2680d2b4bb1830611be53da507a1a7a20343a8ef61ff370cdbd9f3036faf4470c4444ea456dfd5859f5787c2c650c666ca9da4f2c457692213ce63271d5a08e744c13b3c49e4896df352950131b6376c2fbd5ba8d14eef90e1b3cfeeac77679ca6d348d6214e136f3ec0a351fbc664de3bf3e2aa7b9047837679d08e24a542328f80c15a1ca00798d4369475c336db1139bf522e9f9345cb02ee72f96428caf0f029541ddac0387b5222538d3725a21e09a64b548ea633294fecc520d33588495abaaebb24c0c9a562f05c91b53dad6240480976794671868eb0e9b4557e99cd08fd4c8ab9286f11da904f31340ddb0746c55935d36f6bff67fa0f1f253ad4d54b742703d727101d896532f706e21c61906bc6f39e2d920f0a1e87ff1445db18f6d500e602de6da58af4aa0d588e0da2b0dccae2cdf9b338031f35e55bf58911d4699561bb89c554646bc594814b4cdd5c0e352f37720e7304083f627e1fe9d6800a20d385585c8d9dca370ec8c24ad119bd8902baddbbfbff1f7ba799c31b6f79f2b3d79a3bd70332fb6ea3477b39290091ddebddb9c3ec6a2e434dad4dc765795ba0087cca9e31bcb5cd07f290972c814074a613d6fef6969a3955792099b892780b434ce4368b617f4d29894ed9c816a9c10c248a190d6b354eb7cf592902a5df8db2564f0176cebbf55ce36072ccac7a8eb25ab89b7c541f168f1df1b170f4a3fc402eae3a1d3ab44596d0fb4c9d04b92d321f8004db2b62ec648129234270b80b889b547282c222a55a01685ea5f5dd134328f64db21264998d7ec0d87f5332e15353cfcd1cc072684644baf2361db28626f015d3d7dfe7a9895ac995635398fe1a3adeec05616dfd2b23b7aa3bc05330586da928b2684ad0136bd120d8067b48f0a376c7082a56f519f5be7122c256dd2dfa47e75e61906402a15d098c2847085ff28ce0a6bfba5da80adcd03666f013fe05346e4afbe66e73171325024284106bb308dfcd9e02ef6b602a0927a6c0f2d3f9e3c70909281fa67a02f10a1a948f75c0392d5f39b95dd5809f2af1c54d5789e6e0d68d266884e78cd390b3112509106793b2ee8150f992f97f5d8663896b9bd9e129258b25c33f10bddb4d3db0e71cc547850ccda6fc2e0e408ddfbf45b4103fd90b87c7ab227d30d84eabc5507980c96eaee2fb816e8ae21bbdf7c2db8064088e03dd73a4bd00ea1858c2af0efb24edcbcc3b4980d2792dec899258b08e039bb9e0f8c2800bf48792c026bccb129b2ac3e458b535741b83f56726915f1d085e0964912ecefde5fa84c7746dc854e4eac5a7b2853ae05038b320c1c940916186c32524184bef4676d05a3faed04ad13b019931a1567a07f825851241753ab04aa6bc793b2cd4e2145c45530bc28408ce63c27dcfd29d608976c5ee7304f62b48d519683318bf8960e31e22f0b5982ff4ba19a8dc681260d0a26c12aaa7f229047659f445e908bbefcab3a6162b08720cb07c651e6a03e0e500917ff5a14b20364c6b2c5efd686f590dae6205006d2512313a5db35b88d582a9ef2c280f60a64470044aa03f56845ab12fb8506f840295b38e87e2fc573635cbdda17771a63e6f28c32ceafca2189641b12dba1391611524ad7c37b073e54f3a8b6fa6176cb08fa88b891a79d0a426a4ade88488dfe8553000f0c95b22cf44011fa62881e24b63ca11164278a8b0f4b06b0218a0554e2eebf7d7a865345c36ce4481570a6b8ab4da021fb43fbf0fc4421c4447a60baa297b2cbdd52d80c4b31cb4f67bf236898fc9cacdcbf11370fe283c60f9998ddadc7892d9b1c509998f85a753ae137cc32525aedc00e55cb6ce50032ca0fc5a405739ce8cba8a0916d7e4e95f6c1e129d8a1e3a27b752f2887eafbce3419880e92fb8aaceba30c85aa1cab49d3f09374ab1d9707359749f16e1639f7b2eb953e2c059adf2d36d21309ace31c54653848411820717acd8309aa0b487190430e940becbb9ed87fb47a406e909064cca3e1cb0ab7ee867a1beca19d831bc252a76923c7958a78bcff9a849bcd839ecc3d57ba7a8fd2bd2044bebad5acbc1164bc9a171a32a8813558009571bbb326baf486e53e2e2f18041fdca2f2be94d72b9a901b6165c613c73ac838ec9d95debb2212dca025015e75dcd5e0d73640c119b3bff62699cd37daa925ce2bb2678a4dae59bf35cb69cc4f1b36a6327eb7e49526c15a11655878c9c28d7d1db78662836a3413550a08ec26ad7498f7b868a4f1509cb1a5db15c61f9d6ccc77733b61cf6b27c71d111f408abcb083a875aca468c6ae11ea5496fa91685751d24f8d9ffc9bc7743b05589545a0653c1e175a4ead492c43d928afec37eed6c3662b99e5bf730325ea4d913902a982f5b614ea1f24137e38bbcd29b8953ba0428875ce2fd36098f0dcc4d873d48fdea980c7db452dbb39962cd73ada454dc54812c1b655a4388df5d3f62a13f3020ec80448478e1626982bc37084f5271108ab6560d39b97752facfe8ba5b99c816ef08b69e264a428b07cc5be474e965beb05211d1f7281cba69f2edfb3c6a09120d815fc89a520303dd7faa75fdcaa3f44746b2599a4cefd4302be2747b33baefd15dae9d45646184575ae75d51173f1ecddaefc4e3b367e42e1fb21c36bf5c59ff715ea37f4ba1352c1461f22b4fa7a2de7bffb431250050650af7366b7c27b78f8460225b9ea3b92a5426c301a30bd4fc5792faa65d203229f1de812f3af3b9d25f94ebdf8fe6d84773dbfe3273f3c9efcfd3a50850cc24bd72e0711ad4def1dcb1d92937af9e4804c81350e8f3e84741aa23428f61ac7a36d0338206a1c2bf33b3acb76957edd366bb6f4fe9127e99f7b771ade7bafee5a7997791db50dd6ae506d2fe93bc8f6c925110d5f7b8cd70ff3abf7ef5dd4cbdc809c2b5bc5db8d0ecb23d92fb68965c71907bed4beed6bb7f30570734ce12f5e7552c48e06f81935d641bde691261a43104c20a0fe0e37c7fb18f608b1ceace66324b4be99212fcda2521fa179c3e551730ae0ac37ea3b885178d2ffb7ea39cf9e5f818fdcd529980c5998917953d6320d480b9460684db1f18a10dd6a1b50147ba0d1e9383ab708eff244284017162d702645e32968ad99f77050c15e4f7c1b8953754175b0865c79a9f70a485324051d74b83a57cedea3926842030a911a383325d1832dd7a646c7b175829683e85f62b22b7f3814d15adaede668ed0c9740d31185b8e4178d97e9f0ab60e8af66efd4d22e46bc9fcacaf7ed5e331d1abf716091d8e5a9282e1e69ffbdd09e5d9e237c52bafe2c431988be3f8c54464e32e440dade91badb8e3bd1a3ef6426c33079707d1558a3fe3bae6dba986c9fb0c25dc815a5f755256583d899717d45198f516b097bcfbef51e398a073a039dd3d21e96611e21e49439d7be998b94d87493e13a664b837dca24c8efab56176a82e8dadf671267559d5aa3aaa92c5ca7202655c8873a1ccd477c99780858bcdd053f59c8d8f849bcbee5274bb26f98626d17894854c59829985aaf25df1277420e7b00f4e46ea490016ba136d08476d819389615438cdd33c36ebb0f0265a791073f2aa148c8ed59b978177c3be7bba430de2161ddcd455b919609a3b4077f940b88f160f85f6e1e9a7797331ee79aee6e6e9f114131bc0da06b69b50a434a66af6a37a25eaefa4eee49277f237bf78154a61b8bd24d229238233edb14a48128475bb70df875cbe0d58824d7d3299622ae4192ce2e4c23947fb87611e7bb18016f179693ff26b76b39ab8d3c1d59aba64b82f3b80c63031bab3e2beafb3f7ccb84f92e4358374e2a82ead00f40858f4c7935e4a52f1316676427a8bdab6768248f09f75439a8edf57152dde1e3496798ee73ca83f42677ab7f5eaa0f3e87c35ec95d60db4dd0c47e6725f7cf343e7aa24bdd5e7ab5f60d2fddeb76e61b581ce30faf623c8a64846e3006b2a18b62de086aa4d8ba4b36de254e7035311612d79618175984e8e480842c44b0938dd14c4fcf58336c58124af8aee3ad03d8db710009586b9e0be41107bfa01b43a7195f7a3e6fe782b1b0c1b017591afb021435196e1056ef90c1df922e06308ee47cd36af70e0823e88fb7e42bf5b4d9b5555cec8f8b5279dbf197f66d3fb05dcf3fbbe3ecd4cd20bbbf0d0f0a4526860ed0a91ba3a317974938ee373e145eb1f702cacb1d4e6fa40d2f3f5ee502cc8c3875f391a66cec5856694eaeef4b017d4d8846738cdaef4410225690b9148376c147e39c3dd19253b9f9571d905581e10f5ff7c4375dbe64ff52c494934ed2458be4cdda6e68d4724845aa5e45cd988ab859161f465d6e1a33c5b87abbb145c0a789bbd4099996584ebb44b5a54cad9640f100aad73a9747581c0d37642fa04f4a18cba34c0ed79154fdbdac1f09fdb5f0fbeb1b5fc46df93607925d2ef66c9f40d58d11e47ad7dedbbe7c69d7bb37de7b794779c9ffdd36ae3ec2e4c52744ecec6eeb4557dc7fb0b539d9b421177611d57119ed03c275a6238d13af06349300a808cb928a5b7c0d6fb0616f3e5aaade0e81c922fa812c8a4d18cb8ffd3af0f2c9361352fe386e83d11d04e0b8648b559ffa81bf1d6bc4dc8b313a1e3f82f49f2b6e7d314c23d1edf04d0d876ba4db7811811e62739c6cd0b65cd38d00be96a2c7831dc5b2619d2e509d07055929a515f53e78b604b4b440987d1b39a7f5d3c7680f9331cba66dc4f81ff22e33070404ad8899926640d8094684656367ff6133de8f6c9c93880f3e9db8fff0e27bf685c5f75869ee68fffdaf2c33eaf77018e3eb1dd7c7ec9f81fc3713fa1d5ccbb0bf8ce6be267d8f99bf1766ba4fd09e2b1341b491f25f52db5984c5ea5e9c1af1f0c76df2a1e296d67fc61adddafeade8ccf04eef1cd2e43209be6e5f5cb868e9b3a50058d1dc265b9b9ace190f0ad089c3373b2dcb1d1435140d6ac5c0c9e6efdfb3d384e65b88a67f84fa9dcae1bb4ea774ee79f9508e3f8cf22f8941ddae390509440d4d89267da70b94819ac95ca2d4a9f260629594a32faa4e82c3016c935f0bcd98265504da79fa3dcc86e2575439558b448cb13fa7cfe3a2b4c9642101562861c842726f629d3096e650d2913411f66c6acb4c2a0d98123f986a51c13f87f6879c81cc695d8338542279608f693be2e181c26305aead2f180993a193f3e77ed51a8132be3c1d17991a3c7ea2224d2653d5e4b4ddc6e7a2a4599c04276bfff672523c8ba2ac8bfbe2e1751e5b04bd279426db4bc58d5c8b276060ae45929edf4c13fa88ad159efc4f6b5b5dda6fbab4e28f22e620361e7cd7b14ada114f238cef69bbcb773c8994ff8f9cee2379ae3f7662bf6b1592b514bda5ee80a48f8ac08dec21ff6f14747fd5ddf9af0fa5ff9213c9552452b0bc1fe582c56a7952e8180f8743e80119aa947d969f45309c959741ce013860ac7e81f6ec75cf2ad4f43be0b185954820708b25e2ab148003c9931a96e4fb9e4306f113775e5e29de2f5978f756e4e234b89d3a68bfc6dcece7b6bcda0463a57fc12302b1a6a65d1045d12cd57f5fad37f9e849fc2179ed8c955de42a207215cce498fc088ace25b0e432dffe388cb7cbe60ac4e99bdd741ac556721493ca95a8090327388e4431dde124eca98afb200aad6ef9d7fcd37c0f4d3f4e6b99404a0092e64dee89cde9c6e530c5bf1949cd5b76e1c0d7334372aef62ad98df06b31404726548d4118c10eb1a7f575f36148762be4df46b29733661517e0520cd059ec734474a66f9bcef553bbdcd28c7e13e0a543c02251680879528927c21825f0e324295e20d783532b1814bc248c6b6cf5a58ef9ec7dd8de1cd328b623b63e140ca8bffd012166e71279e10b6d31bb67837a52c545c7d5aa758df79559360235f8edaf0aeb44f71d0a55e8e1ac99a4548cc2c40d415967f57f451c5902eb27e2378dd1444a4b0f0420848a32184f036ab5ca6a50ae3b9a020de86dbae9ffb1c6de8f8147fda9d2558a30afdc127a7f8f2a533b6814783cbbcd09bd94cab880c8765f084aafa55392ca2193d879ac9ca9b45de4243c86db7c062a38055735c5a2d92c6fc8f1903f71d908dfdc2f1229fc94f551b93f05079dd9a487f497f2ff293dd5b73c8505107d3acf188875e17f8ae72aa6ade99df42e7e26a6cc5d36994003d74e929d2c457da02ed8103d1819e22c7d8f65d2ca7a634926f1eba79be830fa69bf8e7433d6f2f6adaece9cc729461b05e19653b59ff66a6a1af53431dd39d2ad3c341f7ba27513b08d765011a8f462404bf6f1938f0dbd6e4079d6929fe75bebb5b43783ebcd4befea1d72e7200bf2aea8506eb0fd5d25b7036e87dab0d6a29667c5a3c5eda397dbafdd1a1b64ab0744f4d9ddd5d25fad375fdf08fd22268bd029c19f59ed06bb5f1753d7a57021fd2ad437bbd8b54b5f325f701996257b076f1115bc55e0b43c6039ec4d2116033af57d4bbf19d889c714f5efd30aef2601aacfc1776f073d5d3efcf76f0a85581a4508def772bb0c6d5c2a7dff47dd79cb1db348df2e282b76b0865c019a6b09f07d2cbe7cba6f54f23b0df3a72cf69fcd938bc4de11faddd20aeda798fb4ba29feaa0dc19c2f60ccb48b240eb1b30d4939e81b23802ece10ac731b7813a3cc8d45b341eba8c4c23cd87f2a5d8bf168aa70a24a559d94d7ee4803a00c241b032557bc988939fb03c7fcec370e5f86dcebb983194cc34c3bf6ad8d707ee3a538e186b02071ffd128c531e2dc2c012734b7a7636d2bfdcd59a63994af4fdef97529d9ff2e355b14fffa73f1e541ed8cc8fc1a4705cac30f06a65ddfe69752aff89541f87be34b7c41140c18f11c74999bbf08322490f484d5466af6c3fb9151e118495aaa735f635e30cd8070336b2c2e52231d5529920f24fe377aa66556cb8a45dd61f6db493576d575dcc1676e1520736c2a4fa33697c3b62ab0c9589f3c717e5b65d9f3647d694189d46a2a17e5e4fe8981fa2fb8ad353380d1df68a7139d4af0b8ead99ac89671faa7399746718864fef02b09ac00b676abe07949339b9aea3b517ce00d8b81cb1fc877c2f2ed556c6b677ff3467c662468d1dbabd3d9d45b69a6f52b7d0551b25ad0cb70369fe1c3cd0d38e5a4669c0cbed499678eca3b3464223b6315c71988ccdf8de4e9e39e21b8667770182cb9a6b191389407b8de661c38a92670024a088a0d2d3514b400872f60fe835c159e6bafbe0aceffaaea1e887b3dcea0397cddd1a44152c698f36f92b7d670c925139969a12d22bbfd232af27204d136616649bed586437e5d28364159e80c1fb8e6df825887d1168f050150dbcdc137de6441800dfda2ff56d9c54b4af34772a40ff99b274d14b85cd7e356997cd42a018ecd3d82fbed714b13acbeddc9cbcc3f0e81d2a795847980be0aaeb260c70d3ebb9e5bd45cbf2a09c1ef283bde1b14739c9e14c96700b6f4a5fe0c1511f8ee61fcdd953f75a71499c9bc2bb61ca2cd96352819ffa75b57be41dce74804d0dda88a5d2fddf9f5a5d73afa16eb0661ef95a038dce69a9db7c2dfcfe07702f5358f1f2ebf9272b5b3a0e434add7f9b8e5ec94b1ed7ee039cd1cad8b5b305465e84ba914389341535d5ceef9f35d9adafad244d8254eb7c7ad4ed15f8108da86aab910082902098d3e860d2acf9e984faa45f68c07e5a87387d4b1fdd3ec18c0c04861c1ac0efbe8a6eeba95cfbafbfa777f852c764921f87e286ee0a350eeeec8699127ca394a0250c4280c126e1b107ca81847e6dd13af0daecb1ac0728a6489b4c2bf68b5541c3b900e001d33ec8fc38d6c1c595135e58e68bad7efaf6c3436e2023b9226347e7d5ce5db69de4da17d989a3bbdce4a006f61f6d7ba86112bbef0c4f0bedd914c955b1ca82704e16f9edb08357ed39634974c3dae3da2a0d2e5ebce65eda519868bd0f0d6ee20144e19ebfe330abe7511b984d2a92ccf1bc439ae9a6e1f7d6bfaece717ae21cd43b921642e1e7699f2db49fd8b118e1d4f27cd5b0a27ceb90a4fb1bd9d2fe5106fa545411a9a98546b7992f29ec3e2e8f95f5151dd26a8531321be0d621cc74a4a224b66475389a27798542afd90ad77832ebeaa420f8f9095467f4f3c19868d85cc330e0b53a1cb508b6d41c7baa55938dfd190103cfd7cd99a0918d1a661f1d7a3116d1489b79e178df41bbb497aa3ba7d921a903e7abc299ce60295712e5fa6626f5cef1e81349764f1ce589f48a67925aff8a181a981d0b46af10bedc992cf324297993addeb1fd2cdf0a0111026193572294bfc89cf2742d8008905904ac55de820d5192a09522ff7f5321d8f03a72932d4487353a10d123b7cc68320e5ffa5f230d3b7eca701ff5fb3f6155b434196bef628c182d337cc852f95411fb49dedb71fdaa5c6cc47e9543d198fffba96997267a59900058bd1ffdd0a3542b129501d8239fbeac33723bfe6a2dd82f28dc29b83cf6874fdd3604fabc7a737d3ff2ee1a79dc39676c1cc6504be063e95181bed19e44d5e4acf0ce444c16b563add5b611d5334b34d3415b6fb70ef797f9cbb1b5353effa3b76c3c74f01247f3f97e13f8dcf32c63cccecbaedc4d63c8a3b481c403768f777ecce3fba849d42b7b723ea42dba58eb0d0832ac6eb2d75bc614dda310e5c765bbc277b381b596c0e2410c0806a7e2a4954fa5c78e48ebe6f8c50ba605095305d9971c5edff1adbceb43aad2812b8baaac9a83af41804310831b5ad7b7832cdb93ad31343f0c3785a4e3dacaa79054ee1f1c424ab93f3982af3ed24eba8f0122c47f97ad6804a04946d99659c129aa18383feb156e97836efce0b4fd036f27114e4f6a7de2f8f79cefaec1fbcaae9b01cd1a3faefecdde2b205f49ee33bb87a38c50a982f46f7b805c68b9b925671ebc453d26a972dd4334de981c38210625471b8b9a608e04bc76e71eeecef228d98d804bce0dcb56d14cb96c0105d3d807333090228ba5022c55c42a06d8ec436b45a86721ac0d1aa7a5589d4567bccfad4122b2fa91af3bce25019483bc972e8d33074c131b2d9394b12d8cc65c6cbb0a2796b74723474e4c6c8d898c8dd56a4bedb82fa65b7bac49078b5db955733300238a576e318f153c76361b20f50d18d83a34bb92fc9fd8ff46d3bf5c2fd743094fe703cc67eb39c1c6f18b374ccb320cfc69aa8db686da2e7f47e79834bb60f7ac7f7e17b2a8d279b6cc758b4ee768fdcbc87ebad5cd4baf8e398579e7bdd78df2949a6eb2cd92b97f673172228dd7709359099400579966756b92f7c6219e2cc6bf49129369a7bdf7b7e36e0303b28a1379dbead8f73ad56ec682642bc566c97690ed77a6235033cdc125fbab91fa36c01eb7ae61f075334c7678fd890e2ccc621881022ca155d03ebc15e22f568a1af8192a66b022ffee468c4886782385d5a94b365be168420fa1aba85b4f8a3c97a98ccb3d5644d6befe695f69a06bdf03a3b0784bb488cbc88cd17ee3267ff713a50aeb6a964e06db8c82b71bb2429b5c7400c07f32bcc5119efcd9cbfef6361f6d9aa4a3f915a17a039d3892200e48cc4bf18c2558ab32a3661e5e6ed418fcb0a5da9c2c06bbea970425ee8868f68d2602b2fcbcb9ce249e15c72418163727fe0dcaa4b4e6d8dcdd760bb791a86144c24ea9241bfa0fef6ee1a802ca36ed89ce4eb5d8906459c1b4c73b16fb6384761571f596f4f2e5c1f41279f4521cbe8a18da77d1f1d6d2ef9bac8e127c43e6e29c17d81389ef8f7a5f99e15b4587e3808587f85d4a174f1d98381e6d8e7ebd7ca064e12c96da32dc8be2015e063f89a195b4c34a66a48aecf90315d271b0f6c4194ffb79d18b6f0eb1d36ddc3d7d4c29012c7d1a0544e0bc2def2c13139ab2bd973a7eb4f6c9a1b2dc2e39948cde2a64d72d0db617f35de137794cd0fe7c074fdf2cc5bd9a856191feb3cc6366ade704da27f31aff0db2f48f31f3b38b739e412b5c667108f47a7b5ea2ed2f7e40504a027d8d5456e1e6fa0ca228de42e3e9ce5ac21b551bbdc924edfa779ef9faea23c3afd6cdad3af5c56915b94fd2559c59395cba373eb03460d9b7eb8fa33f3312b877fcdc0fc6e83bb0868c55efce3f0bf9646ce0347eb4e16b9716fb98b1fecc991c8028b871809b37f46aa3b34769dce8f8c7f213fb42261b5c21dbceb614bc987be3c7c198057f8e259f4cbd9d2c1aab630288038db9546319676a0a40ebd815dbbc697bbaf62f4249abe7fe1991467e8d1b470141826eca4b18464c02bc7fbb11ae95859be6b26bb4295ba6a33e65e89691f1ccac571de0b60b3585caf8d7b762723e263a32997fced1fe2eafa9068b3683780e94f2747a1d30ad7ca7bd08594731ec04779aaf7c5a59c1d8e68ec84f87263b86660d5b7fc6565f151c6907986c615f76b5c431be2ab7fd9aeee433649b033e02bba56cf040f1bf34089b619897699c284cb34910e4efdaaa7572a56c10ea2c3dcd1338a18db37b5df8f4e6be0a627570e00fc0d561589cacf2f02d35c4ebfc742fc481ef1d3ebab2544f4ccdcab12c6b93a878fed0726ea4d76c410840f05d2501c51abb54007747ab4d45119eaa876b7919007aa995a6d4bdd8ba0d5326b35d3dc3b5bce9ae391e39cc500aa7ff45648466d48f62821354a5f5a418232c9258648b89d558fae8c69453eb96187b7f9df2ee36f983ff450573b8b2a0d1c8a3df57126ea76f0daa6b582c50ff6f1c767e7fa70ae0852383e08bf27088a79c62ea4ab57664869af560f026c62d7e20d64db939bb7af7bb989dff461dcc76347020ea496af70516d369daaa891c3c7575c1e2db0f25e279f42ce5ca465b66c59c713b6dd80271004da8fb6d30a189945454716d3d086f93963cb36ae4e732b30954070f3e3b9fdf197fa74b5e262935b6e6ab240bb5fc99b2216ab8b1de2ac622646cd497043d5efb7ed938df4803ea3b25976f56e4bae61f8673a5775dd7c9730fa9b1255c66f41a2db2f65293871d57092bdc1e3181a74962a157f1650babff692876bf209b5e9b73361e2c4566b11fd54f55459ded9fd5b952d091af517653a235db58980608155cb05c20d3f1052460b84ef8e61fadb1492c42b6f286de72a21784f94ec689d32e4dba377e6b170bb04756b85378e627808ee8e85be597e74920e104e57de9411a5ac8abf7d966c7e56cf0503bced9e5be6b2ba8e016709220b6e19cee4cee0a8f6dbac05a64817f864ee23490e7d2544860aa775217be4ae35448dca72c5cd4e8fc2de2c0a32150efa05668271f5d8c34d58607f756fc8ecd13b968a30fe70aae655076673841b9418d678bac2a2bebc9b02f4baa23caa68f1dddb8d32320202caa2a2162e7eef0bdcbceb7a52fbc3e248d8666a455cbdb2795cd20da747e3c1c00fbfde211f03812def0cbd592a962b6b9b187b38aeca5148662d2632297ea90c71fe7fd51e0e4ad031e363efa16803e4e52ab39ea4cd6fb4bfd1d10ddcb76cd5fbfcd43c75a793f7d4e90fd7231c3a3608bbd4d7e281bb3915a90c93c3a8ed02c90b0ff1e6782635bd011b7a12aa62112800492386e80adef8df09727de0cb20389dc5f6a72006d94f2a45532ac7364787984888d540f448976399f784151e76dec270e20973b66dfb305910054d48dff9804d52641866aee417bd5607f1bb87ad08912b62a5fae0af4ec178a03b96ab7a86d90fcc2243e57c8682680fd0730f578b335aada685c47736397a77d19d43b4fde9c94624cca9cac83663792f41ee468ac8608ceaad20b00100095ddc7f6a7d4badd061d0cf51e1bf50ade85980aa3ca9be9f24b8fb248b83ecff03121a1d64ab9b210d8036e83483ca72d08e795e3f16b57dff7be13c01d7b2e51aad21ebacd2034611ccfe8ef0bc717386eae66b2707a70a404817065441178e164ab326e223812a086c8683ae9af3154f3028243421c2767fc2eba577ddf801153d5634c33cd620fffbe940b7261d4f5434217573aeea01443cb0728c11092fcfff07f5d8a714ee45904509e5c9fe16777ee914cdf4262c6087d9c837dae3da3533204242b90d772f559f75d8fd3b629177797d2c81078d9dbbdea7b6110c6d6071cc7a1d44c2d8915d422c0c2f3158973d1e79a75a034687a1e37b9e4b42aba4391c15b7a5cb7c2390a6b1758bfa55e1d06a8638e2546f9b179597cc7e79a6c068cd56c6d31cb8cfd5f2552d16e4a529ba96b9ecf492becfb23bbbccee44f16ee071b69e8ff5f59142567cedb1d601e32b5d820f422ea6640367abcd59d41f66dfdea40269e893be55348e447c3a4cac7803df4658f7296a855952d93dd8de826ae65e15428c9b4aa8a49ff180141efd7f23bb78c086bcab38fb6b751a286ae1a4bfa1831603594502d0ca4070f477c31d9b8d2d82aa772b504923330e6d028cc1a251fcf4fe6698162d5b0cc2de44b36478ba1126802613c8825006268c3cd3c8eeca84adb45c102365e38ed060eda934fa0a63c66bdd99879a8b966f4d8648de3ea124267ffd3da653883f62a6fc9aaf9463b5509ef069fdeee5c6033e586cb7087610445ffe36bcea32d66482357a21ab65e42f9bd33f668e1923311327375d473b4b0a932860e16240358fed9cb55664fb2e54f669e63e899aab34240c480b0d82b10ca4f64851f5d0720024466817394aba03f3729e88320e0ee2408969d51af244274448dfaa1d13dd66699c5bcf0790f9a69e59394a7a92fefb85651d3e4acb5b331428c0cdfc254195411fa89dea350b12d1b13e956391c18f0bf581a36b2b59a050980b54585e8f1634396e5d447001d39726d3159b0ebe41cb0d3ab61bbf0f24eba11b56a98ddef301ee7fbcdf711c9e3e115635eb88106c2c7ba1d2c7dbd27892ecd999f9a8598cdecc05aabd2236babd3d57ad0feb48763c791f9cb398b737d3e13efd9d8e97086ca24d150df09347de248d4df26f05885ac3396802ffa08047b4edb27f9d3a70e45cc084489c919d36eae11d18977aedf68596fa1cdb303713cc2b08181db1d41be6536d79f649091db1bc9b9346de924f80d91ac9254660fb75e07124e47fa73201cdc641d9e3765caee10c6a224fba71c40f45069a02240060ce289cc2d0f09575f1e448d6c43ebc35e4b00c71e56bfdd312dffe1061df1f97e4fac423bcdaa74bf6345bb8f4f990c243976072c2cbe02c1b63c95cd24139d8c4834fc9da029545201b90d27cb6ccd6d6ea3789c68517757334c4e4fdf0b4028cdc34825031e7f166ff9fee07d23f558ed2e452620d7142dd04b823cd58ab35eb95d824b5f011afff7394fe9cf4f0b01b0ae34f683b7aab5b81f801a46a0020fc359385061846aa380b7997ea63e3769bc92bf199bf3bf8590d5f4c738fa4ffa7a110ec009e67d425c90e40b0b27c96d1e9d2ef1d57962121dd1dfd3834ec3cb59f51c0ab62cc10217ad58d008969b80a567e79335ae2ca8a584d102e38af6e2cc37ba63d9f2653f8a0a6f3f7a72426b4dc1099e38c4ea0d84390e42c216b19124db26dcda547726dd8c5770d174cadfb747e604bcc061eb154c8088437051aade689f9d478b9f3455e62d58bbb3bebd195c2fd6fff882450cd590098204153e73165f7a08704c89acc3cfab56e24db6315b492b847366bccaa1567c3cef53738aad37f05012ed255a829da9412ab176df8884e48aa7b7b01b7a40b7786feedcec83cb0994df46a126218b3396d87a79b50080f1571fdff6eadfea23ab3c086c4bab2a3489908bfbb10bd9ab27afa9f50273c977bd785d9bfd8da7f762a021e8e6249f83b44a408834e6f50d38d89bcf9c19a0b0ced0851f38bee8dca37bfb8d1791352d88cc87cac4c574f633fde96c8257f86c756a297e7ba9214c07f780d43597166cf6b702f5c00c2f3d60a9898094289cfc17c4944cd12655e81300feba2f8c015a77821dbe7b8f155460f04bb2250a2418f2bf0b0e0442e4f5c3bb4f4411aadc1b8fc312140fdc7c1c0aa57573abe9143455c1a1e0542cab0a00962a3d53b58b50558491ee757e7c397a7c6783895fc2349bd61a6bae01ee621d27068b8d70a3fb24405390a0173549411d9934b47112c976ef3963190182fb1bb917b1c0e25c591240d795341fc5585c525f8e685fc4631840b330d329f5e53d897c9b1d3b39c28a8f4eab1ab37c28515dd7060c1a84d1db4ecead86a64ae281ca1cf9a4c91b015c3b497ab172941150c876510f5e19066765d626ee17dfa971c04e1366e64e75f5f06afaf8e8073d0c80e36bad60805c903ac8330330001359028ed9a15b296749899fa76d1c93120e1dcc89a67b79923a9b92ef27a4c0da9b26339948605b9ec7cd9b81fc8df6c7603a281f0c6a1e7ae44d98354d26eb244e26352cb12a9eef748fd6421601d0735c823f318e9ee218b5dc226055ced139548bc7a0cd98387bcdac51546f9cc0642f07e80cb9948d9a395925f8cfdb0794ee6b9a1b978a1903456fb81f619eec389135c21659acb5e6bb3ef876293d4563cd0900c462c19417d164ce0916cd50903fe7e9eb62adda0b99fcf808915b877f23a0db8ef91b6d5e653c0fd7c13d940f0f44376ade6a1a0b0348ae8aba9b73630a06fb3ef15bdb9ac7cdf7aa31165fcbd7be87a899086cb322834e69c7fe303b0b9fb89b6fb243d1859ccb9a0c58bdf770eb662187a3b8f01fe1f2c332ff5beef55620d0e63e2ff6db7cf66d088e0d6c6f7c8ca2b89cc9fce91b6668d2be7dcb28c1842838386b64fd65e67fa575c92c5e62494e040f4301fbf51908923ce5390106b44366fbf7a3259deef8233fc0b794758f8a7f2c545cf8efbf437cd202dfd13693c9abdc26b7e14ceb4702fee3f786a6f7e4913ded50c6e7e04e95538f6df690e5c958567c29b1d3fc31df5e0c893219a694c96944362d4b2760f4e2f0745ce271771935cdb78c04e62b0c4b64a09944ceaf12f49ca244c328e635f0b7958534009fc9cccf372fb52df54838db230eb1fc7783a51e5ce204d3d4da99292276f348058fe413f80a88e5181627abbaf24e07f17a3f59e2ae71872b4c154bbdddd42c0353e3e4a83c52450bddcfa9de4403107c4a0df4c9f1334a03c49b6a682eaef1d4ac5cc7af046436d7ad61628d8113492be5f20d29763646540b3a9587600cd664fbe4103b11e118bb23f2cf0199b9b1139b47150a0c687614020f31b33437f68a5bd8ad5cb89007c2ca65fab00345092db31a034ebf7d1e6bf73289a04efa20d5a4db9fc530bc68699ddfa3e6ec79c9fc46d262f7aca1c6e2a329717389ac1e27fd8d10c541826c38b8c0a639459c50160eb64e32b11392d421c073c717b6cb3f5d5bf77edd35b98a1880445585713c892f4dc305f1c2f0d78b1ad42f880a2377fb70e4cb56e766ab0e469d99c1fdc5d60daa5f009cee5861a916841aebdc7c478824a32c4ab2641ebd1d446b1ffdba10b1e3421800e31ead1740ed3433b5b1ced84018d459cb30cde35a18f855792e0c25ae5112ee4c4d9cf330cfbfe1a9d7f6c099a1bb4faf03ca5c6a9d1b69934387b9f8aff8298acdca85e7b6ae587b0502e946a3baad3f8924201c3c2e847c0f59a8923ca62085027c8a4219033cd6fdf4da0d94a34448812049a63d9ab5baee6f5775154cae939f507aadf7cee0937a5f868528723664cac091da235b7bbaeb3c721bdf7ac913a9d8b598dae0f85562c3caec103bf83ac3f6d09390ac94476876f53e0085abe703b2cf259fb9ee560bbd6bece19a54879fb6faca1ce805b07b13e363d41856b928d85b29e7f4c5587a1ae6afb30e45f31270c870621b77520e14ead9108b972a1768111300f67b5dbb0fb022eab64d2e6a75ecf4720733e96686e7b4a5853e81b5b7948adb2aa887304fd64942ef949c3b57db6aa4c3ec85de3faff208cb1dffbd46ca990efaa8f7fefc9951c7de9b5abcf67d9dd798a3751d43768b529bbe763d8eaa7c84adbd75b68774100568276f365bbb7862cd50cdb76d00585cba4265b3bfddac632ec5312ac1cdf8e6a94b05a6c8c4ff2800003ed5d6db55291940107cfc6698b888f536404789c2da64366c16f3fdd8533d9a827d95ab0c5526e0fc14fb553eadd3f559aeb6468c64e3a3ad5b869efdf282b4bbc26857d58fe185f7ba2d00343ff427b40a82b65ec2a8a93c4f69f0d62330158249ad584203e595421eec33761f80365fef721c3690787697eaf77a12858422726383759e3b4a88a526ed88c6a38e5e625dcd149730718a813d1e0243f91cb277bac1ac03a9f15d129efcf1fc9d4b00df63d63ae14c96b4fa562f2bc334c4f9a7d62af64cae90137ff3c4bcadf926563a52df7db5b9e9f7dd14c2d275a488c12abeda4867c5345f8a727fd8d7e1162b4b5f2b0e9196b064107d931a14a97ef76fe433d1d060537b6fa2a999c3348347bf62bfff950f1e2482d5d5a5217573896f278ab7cc44ddbe12f3ccd520e1e7c8296f2fe4f5d1c17db74f2930d0bfe1dc0d0cf415cfede11be5498fd8da9ff875650ba9e9a67225fdae1dc015e200939f8a035bf251391d0be3843a56996bec2625fbc7687c0b08aac7dbffbcd8be46991131f788a47675ce3a006cbc6fefcf8dd0cb8d4ef89575f154c6590e66009a2267659fbb0f2f2a8a01ee3d9d7fbf3c70b21d8479e9733baa540527b7dc0045e66bcf72b4e69b8e3ff021ce4b1cb67f7905f4996accfde72419751cf978e0eb44f82c9b2bd76ab2687e489971dfeb4fdd019cd7aa71a8216ae7bdf3c9088ed0de583a22521b4e8c0ebd105e7d9a3eece37fe91061950180937f5e3fbe5edd70821c895b4fbc3e13646be766a70c9e7ee3c812a6c22e8e2282e6f84de50caea991da2c78670a0a08e68a75ece0cead806b29ff626b87d7e200254092a614aa98c1cbc819b8ddd7948439f843dfbae92b554bf8f495fb17feab214bbe30016bfa9d629c40bb1375ecec8032b2d6b0894aeb278077dbbfe50eb1bfa7ceeebb3d00c113034c91691784544d67a8482a907b61971f7d6a4df1aa93db9c89efeba467412d1efba1daeb0c53cd1781e8c658841483e93a430c5aa4890cb84bd5b309c0783b782fcc774380f30b2fbf2283469617cd5acbe2420084dd63b15c0f2e86997339c4ad06df0d4616ee4dbd90ddb88f29b86e2d997e910c2db960c7578cf0498bc368e8bec6d9a702b237df3ee9b5fb390f6cb367e3ef8d2095d342062039381ba80edc7ffd6f64cfadf1cf7ae3d6cb3db7fdcf936b3d70bfc0943ffd8efe58c4f107319009407e947516b34d3632fecdde87268fbeb54a1ecb94be9d71b0f050a1a470574a20c90719525dfbe3b268defc8268ff66af788904e07d3dc4275fb3316c522a75d3631b89790afad2c5a15ede06ee441f730835dcce0a300c5e2e171aba459f5e9b7079cbeec3cc0a312e7bfb15fb10ef927b71730487d7f126f5c3bd3aba5f8e8aa93bd762156b9d24081da8dd4b98ea987e246b6f60ee0ab7c0b2d0426b9dcd9973b5082be7eb6395f8b8e6f6740c4cef9cc450add8c11e722dc9f207c732d877e68a7d544cc7fa7f71b4327109e78dc1e1f5366bf8419c30aaca207b2178c2661e46ac224856405ddb7b298687d66ee51cb9d2ffa8b27cce0c3b4b8fd728399b201a5d9b4a390edb1108cc41c4719a7be1c27cbe9809da30bc3b9d64066f70a1464b208a31617defb30c3569b30ac4a0d81c2fc28f4f9c030abae8f8c76b029919f4cdb021983fae10586e8b2c7ffcb64259d421d075f31e59f0cb3fc1c82f97a232f8701a609f76e82af0326c0353c34c4956e54f64added186aab2d88d79cf10f4e164dba496d9109e3008095bc4e9fe7879e83281332d60ae71f46aa979bcf1da66e29ca60173dd23a78629438f20f8d165ac9eedf1d03e6d9e1da1e6e1aa96502ef8cf18bb29dcef7470faadee65a4f4cf071c899bcbb1471fa37fdd8ecf138217b99d17b8ea8a132f9d01796540935375c5caf507ac57b9473754823d7b677bedf4f09b227fd65369f47589140935f7b79312fb3853db533c62dd979de22aca5c38360147f80fab431a00dcbba0e519866ddedb686d14e514e413163fb134c026550482034962bd7d29c026f13cbf371f787b015c173fdbb224a3ba5b40d71f033de93b9d33dcd3a501b4998bd4244354d2da98761300007cc6bda701b02278ce100e46c730900df06d9bcf3ef7e710642b8db3370235c58dd654f569ebd723e428f6136ede5f57c589a1f46fa0c7b38d2255871212ad7d2886385d4436340e08204d8a819065183a3f1700afff1c2fdc135e326efdabbbf4c99725506b6b6760899902f0b4c86cb928c0e6dcaedf070ecce8f857cff993fa4b194e06b4e92f563917fd7a61acf98d624a4fde00571f82a11940602c729ae56645b0267a63f25c1192e5cf691d162fbf2a1cecd102150e4421056d12088dd4c01a2aa7b85a0075b84ee371f3bad98f34fb9faf749525406c4133726f8b7d377e531069854a81b3857db156126b641b622e2e288e74a6380047738e39b7d106ac44629f6d754eb24f8fd8ebb792ecb1f9b8b7cd46af7152da67f5aea7f33a76f7b8e54d38636e565e0614e7d279d17ef66bb21f7f2f1c7cfd6e71586a4bca430e68b4d17af9e3e5b5a460f50cb7a5013ef5768ed9b6c199ed1da94b4f2d5b3a65731ac7f034f9baec4cec1e93c8c1cadb4b1c284e86f29e4d858b585a8eea58e0c640c78e323b93df44708fc53eee9d6240d43d71b223833c20e072ddf520d2840671541e8b49a3819a2d8707befa8a35fa9457735812754437dd6810859120c2b33a6333dd5c34b2df139d398bbbf83e1f3b0c0410bd1b3243ff4f0fc18f59c45c11f40c48b9205436f324c0eba60b04b79fb27489c08d48617a032dca1c5bc571ca9e66034063fef48abffef29db09234da9cfe205eb9d74c67ace35bd44a0766ed030dde1af77f48281e131fdd85bad5b1b08c002cdcf58185ff3434b2924d9a772686b0f4c14e04382e03a29a49266eb35b09e50184e34243403f3a2119b331ddc24b9ea1e2adc900b74eec1a6922f5ef732b69d16ad51471e0ee20afdd5edad9455616cba475079f6efa76949a3831fec64b5d7fcf5c3bff1e708c77b9e71efc0680dd158f0bd85304c60b276118aa93c4301dfddd670efe742d9445c72c3f029e65c5dd19ac2ede7af491d11b3342c9391891892a01bb8f13f8f4b84b4be6c5510d2719b66e3eb8a7c2eb0919f7a869b8c6aeaee1c6faef7efb57d903f11a2ccd74e72063a994e9c36f826eb9fd3983863aa6de27923134b8fcf25f32c78a1c1b430a9f482e085d2909ecff6c19c70bb345a6833c116c82384a32af450d08b618160ce1021b719d276aa09e148112488084c900002659736c3160ac37d350fcf4953480a09d07f7e609116cc86a1b003b6d7326082ae9a79642cbe8cc4f257f88441420a69be744102bac1369cce0bc2928bc99eff39e807d29a7ec42009548db273bcc09745447c5e47a3fa6f955116938182831eb84543e8e290908ddd87316c4df289606e7924c87063a0f80f45bcf2a168431e9ea1391f100bc9cb8e12fe9e8221f9c2084820ce3c104ae567ed24b0d29b3457875469bc37a29a8369fdfeb709adcca34bcb245c88db62d3f98341308c363a085a172f3e9046f1519806149e6d7ec737de95e0ef6897e3d88f9910e0c5a5b038385369cebba684efa670b3f5945a9578351300a5d50de7767c34d064a76189b881010c253a51b786936b1f05daac8ce86af2d28f4a042bcd523309d007aff5b31e31d0175dca61d69bbc2743b66bfdae4abaa9dcf8594931c837e0a6ec3a1ff787a3ba9c15d679800577d211366c9dd186fb6e1a0187a9e0e7ce9baced3c77c913e9b84cc7f737b03f868fb71efabff076acc196c3a51dfc28a32cb89a4172921495d33eb637fe98cdd08d33d29dff040802254619ba6c05250f720ac31c5b048414ff130d4f1db581aaa9e6fe54637f5591ff1c4ecfda707411339da488743486b9789ce249a1362ed3e2343b643dd26e7561aa87f2613d20d313b80943babfaaf0e0d3c2b540064c9ac7883da7a6044bf7a8b9c03f2ed9993d1000ba62d9685a7960a4ab61d7cfe6cb1154103c3b1502f8aa9bedd0a24ffa896a74ad3ec2286591aef027cfd31e1974a37d906c981c5ac0cfd4b8c10b93c6aba9da37ac52b00d9470e5fcfee01f8cf2518b10d80e9063e0626eec06532290482d668489013db96ae329775973749ecf1825c4a173d9193cdc960454fb063ca0b1266c320e3e86dc6b9dc24b25f649e4b804fa34344edf205e7b66f68a017faec67ac9753a28930c6cf7eafb2dd6fd9c54034267eb47697a9562e5e752c873e2addb18d6a5d960cc0f2e34545a721342379edb2935932d5778215ff8bca4f1af0176632b7f5436c37b8d769abb1d2ee75583a6efd24307460f6e7bddee308917d92080e8eac99d8e676ece86a61b64fae73a69dffa77ae1fffc00106a6edcab8b618188318a9b86122a09f3bca702112a8765b346f195da84d7000bfa8a2d8239be2d9f28e762bc0246ff52d4be01a4abb3922eac61dd5d6a16f07063097e0ce0d6d04e26f4ad31b3a5e62710c54af3edc1b53298aa843c6fef0fd809a177ac6cd997558213f0a177b921c427ca96e7b9a8cfbd9665b5ed090e5234bb07ca831db45389caf21ed6876d10ceaa2ab362ad2531f9202c7f54a0b3c90768f5fbc71be63c78e8905d589071b0ed02c0c4991dc72a88c330881fb0de1f276aea2169ec687f25645f4201000a075155750775215b984e4276a4507223a7d53914e7769f5b1f15d485027f3f16f208c78423d4413275a2d65f1c73d7c91d0308494ff3a7c613e02a0006506af2d5519c10706d9c06ca2d941408bd657e67cd55c2ba5f3218078da0f2c09b85a113bf857fa20655ac93678f07755f2ebf4d656ceac17a5adc0f43b94dacde3fc78518c72deb303b131a3d104e32b8e31eb872f439b84573bb9d526f8fe1e5289621b15aa27533e8c9b60e500e3f5de79bd2401e01b088e476c628a79640c8cf4fbc7553002a68a66d50fa6b2b76c94795b9e541a64a6ce22f36eacc48dd2f48e06917fb2d3ef3e64ecd86c511563b58bc93c747036e6897418209ca963b19965f03d7f063825f56ceec08eb886265ddf7eb57495fa269400708ebdc92a46124988ee3977fd9e2d9d2e423caae1641d09bb830ababa3ab7fd8bed11caa6afa4cabf895140521e004fe779c4021a017c341097b629277561a462a373f6334dcea1e98aab23f2946a278b10597a593e7cf350a16c77e18a39553cb423de849278561c254f3e4de58a216ea95fc68ed8d6de55757bcb911932118d83b9e195d63a75b6dfc0b189b578cc6f1ae9c0af3748c9eac32bd559e91b9b1e0cf72030f374dbb423a477f4c6469896923482717cea88bedc48907e451b73e1a9fe9e8b0251a0c4fefed6f788e895723a0bd34bafc619e9b9d17060945e54e88116a546c5d3f4466df84fd0a0f63cdad88a70da11e357b936e1b724c5d0f399b3a07692276fcc32086005ca5480a7d2cc81c1061a06d43c108068938886af11c912160e662149ac57db94a795addafe5621bb51c52020613a081d2b06f6916218e4b529a41848092ad984e3429b87864dfb934f7331bac05d61cbea14def25b77f35d934e5dd516ec00cc7561921152c897b1277f34e795a29597b64cfed497e55fd5cc444726e6a6869f0b2799efa507ed0b4ff8c62dc22a43e12d3bfc9c44b468cb54784d33c9f2e5d6e096649d2bf65d71771a5e137e7590c1db46d7c93f05f72c9523ee93689ee1dd7f345906695f218af562a4b001eeb63df65ea7ff0de7f66bb773b03341a5a4939d6f1db2934b3a14d0989a44883747aeb57209b21e919189b1665ce9819eecda7525f2fa9f63e540f8a4cea0a8d95a4000c8bb62ba3bf1fc6681fb73bafacf31d576e36556ef0e1bac7f9cfea8a1ecbe9645a75589961f192ddf756b6b7183efd067c4fc4ea40fdf74b521a3eb684c4183bbcead3f0b2dd1b32f73063babdc620340a641441e1c4775d5dba584f8859bec479521f01df768480753d085eb4aa7b78c3d4af174467868c36cf4d05d548a5fb5b6ad08f6d8d5ddee52a4dc55927e775e7e6b81893e271d961183195c6b488df230cb4497ac3060dffaeee6bad18288926dbccdd30361c5ab1570b684dd3dc786bfd1a788a20a5f1fea8bf1ce02c27d82e560e01bc2866eb4451c8ad59348387603a269e9b571d1c4734de75fb3007a6124959323c04427f589c6fe2c7d7bec749b349c2cb10d4d5d566d00cb279b6556c08cbbc950f9e0ca29028831440f9e7bb49b2995114701445669044062e446263fae3b571f17b07634279467e8f3612adcab7eae1e38102ade8cc364f8c911e3ef5eece49561117f6477071ea43eb8c4f7c062dcb765de9c46c0cbdedb6488a9e3a0aac0e26128cb1b9f500b875d60c753bee73b6a2b1bdd8227cf869d0af572270c4863bd4e92b64f04408197df6c2216bdfeef833e4aa538bf23e71c8a95d9eea8c42a7ef65a7866d303d4440edd862ebd80b651d38706aafd67936aeea2c80e495d97c48c1cc693c7f8059612860bbf6fa37ed026ba806afd7886cad6ce94027e5104cf8d62f13cb0fefedac898931fd50e0ebe0cc08afefd871383429a8246fc5364f0bd3c8b16316af5d022c374347e0f3041e0e90c705aa2248508ffb2753697b4979d099abb748348f3db87f1d05caf316ebc79b33dd196373990bd5e8e91273da368358d8ac6cb09b5409d4387a6f36d37026cb1f23ccdf8703773920f893a62869b950c2c34969a551a4ffb867068e535ab2ff8d39203b6a04be3ddcfd481b448a33cee3faebb0174f5906a7644c26ddbba57acbc9eaef55d5d7e197eeedbb076414e6fafb3f426188fd676be32bef929a344dde8de92dc4ef7f33eeffb0553ef9e17d653fa8b59cb145e4b8a4c8d4de587b60c58cc3756b0e4c9b7e869495f4dbfb5b54b5deadd0308d380e200e88051f0f2bafc7aa6d3fe73d69d6f59462202aff2f36580e1b68c6c4bc4786b4276372559c4cb210426a67a4a93b4400f12593fe7cc63901d737e79b60759b00dad15ce288408553de39dd0a9229dc401c01c681aaef033841485a15259aa560437880ffdd1d8b24999c35b08fe01a9973d6f77f6782cdd870b5b13dea07a4f44449b822676d63c65c4832822ad31e2bb75a5e50795171db4afdf619337bde3598759587b77e73bf71ac9b69fbcba68a493a4caaa8c857ca3e6dbfcd8ec8b569530f3db93adab8b0d304f8dff1a62dfd74369c0a2291c5681c9f84db1c8e91edba012fdbfe7e92cc6668660624889eed334fbcccbeccd7f85eebec4a3351554d454d4777c96f713f4a42b46b8a72ec4e63ec8defc66ca84609dd60a7674e3227225236d74e3d6f974628d9ce51554f9a0195ad75b284bf823bbe142875155511de4d9db269cc9fb1b2d55b6ac960932d63fc9ca555aed49a28d0496a64f93a3bcf1834269e1b18ea2cd86ab33754772833bc533aab7df77e6cf7b40fad4cee188976d96f56ef4c034898139fdf5ff52c4fcba5396c7fe42793377545d6e9be6db9fdc1861402e0d1a2d6ca196006028fc8a07b559f91790101c7411ca450c0bfb2fd6b48a4108c0aba76ef5f5df6c47b0ba909803a8fdd040981c4944edbf70008af7f57d7047da5d226bccc2a1646f5ffa37891154f798ec2855975765520e2f4ae3d6b273b3e94fb5597f7670f5e694ab50b7a685b1397dc89c1ff4ac33c7b76bd6b07600665f5fe19ad6feb6cfc82cf05f37b3cd7673b689a077f716b5e3c7ecce5e30440582020f025f654c6462900efeaa13f1f0935a264b1faee81b9863191cac199661f6cea7fe7500b0b5c269daa49dfe16676b882812f9e42007b64d5d365a0a7bc3b7bfdd9ff05eb65f918d8eae3e427cff29189b4bb67d6020074d5471e651eaeca582961c318c1d5582ad8cbafe81663380ece7474b1c64d043a892e2ee57e8f717f82638a03d3c8565dca615f3cb1b3ea90b3591d6050955f22e3a69f9f210ed872901ced75958049bc48e99c8765f2e3dbd8a2c7570804e72f60b7d1c4a9d6dcbc14222ce7996743d4c1d3ed2721cce472e05241a8306cb77bddc8ba39ca838a93faba92c1d7ed3be4b1df9540fbbe2040da7d89b12ba4c25cc01b79323e681573eae7b5b04083d544bf7f5faa34166a1e6fec7d742056b88258094eb078daddb5caabb249c89e45ca29009ffe7a30efc8aa55bb19f4f59b58796e5abfd6f34aaa976f10d9a0ef63deb49c8aa16e0079907663cc38f1c7e95f63a72124c8e23f6dc38c6261884c2ffe032439b2da1b302b032ed683120251e0f7713adb804494c598e1d6b3dd90a4069eaca47324f6a17ef611eb9d4c4fffae4243d5bacd0e8259ff6f303e28dcdd792ef2d0e4d312d7425877afd5d5942f261a3a3dd4f28ed5bc3779ed0a713cb222b6b86bb3a5ba111c274a3cd404cc38da21cc617d7f0e8dbab0c3a631c89215ba6dec43b588c2f53d90e731730683a6f0778754c2a5483c6db71b384146dca4bd2b68f8375d25b38f85cc2593145b8c9f30ca66fbf7add354f4b63e3fdf752c6a08b12e19040361878b9f083c0c9b0cc31acd43ad82fb859154f457e944dcd46fcf191c593a8759ea82d0f48e317aa822a01d940e0a5965fb16c71060f544b2bdbc8a5af7a9fcd967eec6b271ab60ec53baccedc633e5545c633729fe2ed87770e8ee4df3f21524b39b79b3ab8bcb339f5da8e9ea2c9b96446282e4f3a37be29ef5fd6826f31fb993ada01dc4ea8e4bda2ad20d00f83efa6c2501c129e5e5694658ca5c58bf7d368e158ea4f92097486ba551c6ab1be71a3425b487b1e708d4ad11ea346302f1c6cb987f738aa2c190f1dcc58b45d4f8b991762910ae15664ea80ba88cbb630e5fc42ee4405e9ccb441a95abfb7e12925264fa3c04e7fde697d0c8f23fc6eaed61d88f7504e2c74665756eddbadb3d244655983001d126fddf794002c1bb26aca984260810882e7e0d9671994b7844674be9ad577b3981a7e7c55bcfde333e4471d765f64bd3abd3554f50b2c6e0113cfa7cea2b3f60773fdff546a6ed008e8d2cc4894f43dbacc8846383fed2c8fe855aea8202d717dc52e514ff99a65f9ee5cf88c18623849180c030bfe78bf4afc66586a191b955f1da5740431c75201cdd97bab9309a5cf471dfffe5531faf8072e6ea0f1616e553041d9b8f99062c7a3ad374e0d5b7fc6277bb767ddb033eb55936b5c9a7212868276f46505d2d7aa3207272c64698d3b880ed701b7efa39657f45fdd5bb17ffd5652c0eec701024121d5eedde1c819f5074621c839c5fcda90b85a2cb1ddb56b01d969456af1acc1a19acae3ffe1f0bd4da2c7c4865544f6665af5ccd0f9a792ce0df59a76e2414bb631388dc6a790f0e9ddd65a5c53e4941deab79b98ef979574e14465a45ce87b141d3c8d3be826962d15288e25078b3b377bec6010523c2966663791f903c8b2e43167999e5d412a563059245de9d97ecefae0824ea45961850138539004efa3d4ece3d2bf2f38e3fabe5550020c1b4bb3804bbfe2235dbc2c5d25289900c8c885732f7fd9dedc879eb89631b34b967497094d83b37d66bae879bb935c6c7e05aa5d3b6390f05794dcdd60afa8215c304006f48e6f85f2b3dd506969168d99fd80c8380b5b1b63ffb5ec546469d5e747a6fadce25b49df20f09e7f61f322cda11890b5452c5e7b85b694a635e741290943b3857feb2527708851840fad41dd32793a10c64d4c731b6f835bafbdbd88c80d3a6dae76b7f246e20094dc3ed82098b9559e5efe2b16ae8260d8889226c85449808d3aff83ace70a87c1a1bb632167a44c9ce48e00c1b9e3b2b1c6bcba21c5df305fcffab8e4ddf0bb2b69ee83d9665d84826745f542406127919727ea59e279260441b93db831b58cfaba4d5951d116c0457b18fedc139080449f3656054a67c7dcfa3f60af7c43690f5d7a78141a9607c76c82c8c602405fcf8652fe63a9ad8d459bb2d7831ea57dfe3635b65a704b112ef33bc20a801371e1f7d8250abfc61677001b6e4f5ba65f55be84a3a835687b052d8dc60a13071577baa4de6f6239a8ecc60281f37a27a7ad419eedea721a241f30912179c687b67d7a1fbf4349af9eaa4744767b8eae1409d207afce7765f7f036c62ac28d79f49842d86dee72de6389c0263a6564fbfb164ad56a4c09bef8eda304b2f51c6d8e69b06fa3b3262b3924c098b7e9ffb6717853a5fd9edb471d99fa1088863117b16436bffde3d3bc104b6e5c31fa9b77166fac9fe77bde6a63027b89f1b60caca75113c78ce3188c9dee9cf228eb578b6c164b5ccd7222b200f27135df2fffebf5d4c3f998f9c68b1d43a8327e06aeabbbff68bcd69f32716e14e7d8f34120a8042316768b8edb3c9d2e9d9897252e64a7d9c0b60044e0512e696e1cf3dfc68cce48729d9ad6204155c3ca5ca206824b367fdfddba22a60626be11c1009b24a36162519633e06b9b3ce5f224efe111c47d2f3c3cc75ffd086b07405b976eed438a40cd2394c1d837af4a2e7ed6bbd380d44d455e5e39e040f077154a3b958693d3f66fa852070d17c80b14ec0ce4df13080bad6eafe2ab6dc96205254bd6f8c29dc682f531e548cd443e90e98bb4b1a07f1cb0c0d8895f1b27e9b1e5ede0f62c14deb7c219b0280cdf584f5abd4d1b31d0cb922871825662302671da107490dc98bf75a2f5a3cdf7f7021f3960331040a89104651a5cfaa449c42ef99b12468b7591bd802cb944d546a87436d16514601584949053940ae8d1e8bf07f9a8aefda4746a60ce63e5e64a51626382544d66e8328a839797a184461cc23feba655f1f9b9c5df9d0c168b1860179e6f77b30ec939f6e4362d7d577026272ded03ba4e499116abb95f83ce686be5811c86c481aa9a63f0943b6bfe07665c77becb0454216da2890680441fd501bdf7520ec5bf4b71be3bba147e3574a9640061c3ebfdf13d32577abe26a191a106f96b124358642352cec954e2c7f53e4b72edaf39629b66880631f5b14cb36a1e6293c1fcf96fa7cf60e722988175b276e34fcedb50722fa684cd6d164092d7f9b1b84dd98ba58941a8401154497ec06ad3cb30a63ab674bec97d816c845e9822decb66ae693dc800c8d49b1b6dcf568ff1e73a7b42475fd48cfff0f7bfe7a269374930e0baac69f46f4f446aeb2843110724eebcbc55c37073064baf57c82a3dc40a47751472d39b1e3eacbab0e9ba6b608eb27c91a202028728a26d5f8c78e1790400cc42912fff738c8ad3551be79d3e71b38b14e2213e54048003079cf4ac211e5a938d9e7dc822fc35e5b6d774197c79e34e80706a4245f598584f90c01026bf2fe49129af642033f6cedc180d2fbca7a3baf13fbd74dd9412ea0673c61351471542bbee6fb8b84636aebe1e7d784b269e785f43dd22c4dbda6aff7d045553721eaea1993be7a5b7c068b8ca3ffd075700778617ea8606ee3b56dc5b66af095739c751afd97a1fc4e4c9c5f7afe44148827a9a1502559b72d04dd7841eee7f69ecaef02a4835759a97bec3c33a4919fc7675f77dc92b14af095f4a31d879d56e8ce93201459f598d62837b63849bfec91d7e8c6d9f3a9baddde9a59d79f15d04708a0c0248dcce1d30d216d0b39d2d6e9ed12191a37b3ed1fcedaf5029bdc985e9d2c2a22c39bfcdbf8ab45d0ed4d86ce8924dbe31fcaacc43010ac619775155988d68a1890a096a846dde00ea8b0ec5bf9e7d76a754e7f39f3fafa53d36425f60f8a9e4f64b1a2b2ea4cd96e9c7c75ac28f0b722faea98cd6a9bdcb1850f15b677e4d5993fbc38c2d9b9e399fd735eb87186c1b2fc6e00095ed0d8546cab4b9c53a25e302438ebbd78c32b26106e8931da380bcca01accdf67bacacfcd0c5785b7362f6ff28f5341fcb455ee8e821561def6b3b21eafb217d655af3bad74a8ccb889d91848f09b9389f7677e1c5249aad49460036ffbc038984ad01ec9f3028f0fdbe2af40dddd448d96f50cd68e54d868679cfbd6e2348b1b9b6be119afde59b92bbfa28d8eb4a7dc9d3395c9a05b69960b4fdc51953f9ef15c3636a59cc99819c38c60aa54922e47dc84cbb141a13587e34df0b20f4765fc30b98013671f1f9b6b7e6e4af8edd8309fc3ec4fdd05ff763059d6c259b4d9e028536cf2beebba295a4caef6c0879374fe1ef6244859c2e4c3debf77dbce360a5ae62371f3b6fd29a0d893c244b01ba0de5684907ad2e6f0850afbfae4fc4553020fceb646daaa92bc7d6d4d7d237d8a6adf1240a323fc0e6030cc4af64af4c9d53ec76058cc40f0df1ca28755a8f25d774713ed681813bf760d254d64ad613278e781f581df270e3c4eedcfdbd91773b8be302b2c35a40ecaeb260be4326e70d27588d926d2f3a13463715da9782ede716e5fc8a40682e2f00131a687e83f06c17d9b6ece1eda956d90f347586ef791c60e01d19864c72ef6bef542cec3f7f202f7198a2bebe448d6e2419b596cbf4ed37eba6180aec16dd15cd39073a7efaceafabdc04015b1adc0d4d172d1cd949679cd70aa14efb00d6539d8ee5b44aceaeebbf5e82cd5c0b1decfc8c48470e04e8e26cf0a6b8a66e7a308471a756ae1acb628d4c8339ecd796efc4d1465519cbf5d7bd3e76e5ceee340ec6312f96044376fab07c8651c3b86518b02518860aec678a15bff1c04e47a334c559b500f946427e234077aa530951e3fb340803599ded833d3d4af63885aeead490be3a036a9e27f7433a20c4d84088a4c3ecd441044fc11f43bdef0e452a6dd2de8d90e4d2be7b27428cf733dbeb9c3f01cb18371a58030df5dd1458dbe26a3fb0140dae32c7fb0dcc9db3ec87bd61e22e566256b12cf5eba3aeb80dae5f658dc9ac9aa57d74c95e281dd9fcdb68d97d4ee5808faeda0b72ccfcaccca38c4422b0a54e6cb30222067f91a9404174e5223a5e9d6aaf57f8ff9ed2acc3475f0c1787dedb11f698ce557e80684766f470b5b8313d23d72e1c3f3e02438fc7d57441d3072063152ac22c1f6d49a2051f59204877865f7efdad305cd30ec3f9ba085ae1d5ecdc63e590e2029e2d82d11dae4ded6e7cf01cae7996e5709845e6600376803377f4d83b1da54337bf60fcc70cf092beed180a08a2c2579cb96c872d762dd25a26496c791d77d3f019cae91a6f7640d9320621c70cd9eaf3f96d65c6fcdbdb2664342e7c0e6c8ddf887c18ee9b1e0e71d2270f0d51e2b7c9b71e5dc4c3fcbd99b6b2f353faba8f2302a39cf323b21a812e4aa576d3b3f854081c4a7887300f6ceee3fee94871fa6edfa78625cbd3a5db5946545b792ed77f24b9862f4c4e5d9c34dae9a20241aa643f5f639a63d7d389c4f6780f91cbf6079d4241a5d9c3bb92125575d73ab47236a947f8deaeeb2908e984d1690372d3a2d7d1ab73a22af0e71b636b5fa33b2c8bc8c7b39e2a7674527384290651691f635de343668bf0a37572303215a97697c7562674f3a22f27ffd692b09199144c1cb39ef4cc5519799fd1a01c039d674b28968cb04dd2c74e197347d114e35a42fb99fce3160b150a4991adb8f5ce90587e45173e3a35cb280b5d06086613af05fbcc68f73cfd20e5df4f034a75f2679a4dd7570b5e430a37d4464d5bc20d2143059db999cf3c8ebcef792399c6a5e1cddb57c141a4bd205cffaf53a7526fe265d8714f7b308274b22de024808aed1140259b082d41582184b54c3f0b959f04f7bb0d6d92a5acf3ac0d3ecb97f28de6383689b9759447897d167f11717d5cbd41c0fad2c2ba7631ecffacb864edd52dbad1fc1599372ce81c28309c6a4791d46b30341c20d76072ee1b55028898d08c1c2494f02eff61fe978cd515262fccc143a3b9b3786a66f84f7693483be67fed3c81e751f6bad696026bffce981ae71d6d9a30e5fdb4d158af9806b0d8d6d3012108b22399c1baa2724419c4410654866f170263030a48b4ca223f7697f681a6c7388f7c74afa7a4d7c0b7c7d3d4993481fdf7d30afc54995317e66368812b379636896570468e7a39f29cb7e79c43faac57f836802e15e3b019fb894576411766c3eeea51711b7d556bc38e784e57b15b9e7194028bffff032bce44527da794ea9a9fcb8327ead3b90cc21da2fbec64e1f13b8d97dca0d6b28fc8b235b3f27e72e187dc57cbd95ecbbc676257575c07391fec8920ed78f138f55eea896a2abe056d49ecdb9a1935d68be6546d34e26f44fc7275b47b4b55a46a43c95a8bfdd40c1d62d183a70603ac21a3c1fdc6dacb24cce50a5289f90bf7ab2f3a300a86405fceb3a2968f1fb58c2239966a373d3952564a9ad7447e5b60bd6746aeebaa5eb377c949b8bc1c0f4e527cde0b147445043fcb2eec771105e12dd1291e138f8875162ade931a3f5ed7ac672db705a7910498f8b1fda61f59f9b87e154c3b046d3400bfff2890ae9d896d780f1f7c5d8ead349e3861cdfb30f3ce9c60f98df61ae257119c05c15812123828c7e1106ca37148ca0908483c816cf1d111ba3d55a11b65c9aec1f378cae30ec5d9b794dfab425305b9999f45ad16f847650328407d92a7f0a0ead2e9a6f2f4fa4d681b092cc900b753a3b2f0c52f29a27a346987131e70f6ce4d0798faac9562eee1b470dcd55723bc3466ef0eaa4128822fabeb6d0eb8b9f19ac1e2497e378e6a317ddf4a3cb5738d245231631a1d6da2ea02daa723a8a220be6242c407123886495786e5fdd3ec6d9767d78a47bfbd8453b4cb55d769bc7560740aab5ddc84006592f22d99a1a2d1c925d755d785396a9bef5ebf0477afe47ff8b8cb64c35a5e80d5cd76d5ae314bb92a28a6eb19c8cacb3f1c89896502079fed65653ed8e10b2fed0e2ef2d0d99d6d86cf56ab4c7ae61b422cf8e5549dddfe84e2d75088014ad5ef26e90521885dd3e9b47606a69a6ef85fc0c8e832324162d3043088863b1b065b9097d9161bbbf87b1fa96f7605c86d352cba4d75c8ed7fefb6534c747f5fdcae69be34900aa6ded12dbb51155721bd6d486c4561412d8eef1c7339f6c1d5a359e660b7f57eb5ef185ea04482072b8d30632484a2151210779bcae8822b6134d276e7f548d515522f58befbb3836ec9cec5138d53c272669ba4f58b9e52a4a8fe3253c63c77ebb82956ec42caafa1a68899082ef6e895288476d0baf9b0b2ef08d72f97499bc717c9b1debb3f933c5136ba48fd18e0ff37aecbc487f8df02539cc51f6210bf32045604015fd9b6b5e815dbadd9e1d4c759d9e192f2745acd4c7331e4d0d6002b1842795be4d6acb5a2592cad588ff5bd2e6b9faa2b9f06ae1bbbfce2bcd690b8eaec5ad230d6f701c1230982496f0dad7447dbb08257832d92039961924e00094c0427483b3deeba62a121044676504b70ac7cd7bee0dbe3feb252273774e2dcfacb845a11d6adb2e158b3a71f7f5b2c37a57b656b0c962a69db179c77d9cea6eaf2e28d901fe951944ecbf3847c035034c19ca62224c2412182284a223c501935a06a5b162c4fde3797225cf98aafb3a29231df94d6ba44cd8f20aba792c3285c942aab3ee470b34647b2dc10498d2896f0583030fc9faf0cd012d3f07eedc187944e46ebe41211a5551962b93a864fdd2851ed614a8202a657e32ac7f18032a0c76b31627aa69815445aee9f0da4d876f364ea152711f13f33ce97122915a9d85e3747212ab13c2645bfdc30b7c2862b0b869810a54b49606c268822ba41c9957709a6c701e50dbeef6e5a857cc3b0dc0e6c5e1e4ab26a3373acfdc4f64a68d946bb0ffa6fbedb5d7074b30f2df78dc1e0f8b108798a9473615963d3ae452d30f56b2dc7e7fb2161740c1d66328d629f5077e0d8be4facf0490abd118c4f28d1737dde33954c7d5c9edae1494bb2d8f5dfa68b61f6f0f950bca7b97a6fe58dce967b849a4cb44fce7a3d8d1f667b7713721570878cfad478e431010f77b45ad09ea66b285a598d99ebcdf1a7ca618ffbd83ca7819c50b22ab4d846b5d264e6d1ebcd4fae544dc420ebc7bfad6c0bf4333bfd2fbdbec214030b5e14b1449c8c1d447abb99cd28ba357e5ea2dd7e499ced63cb705d72e64af4846c1f617bad306cb1f6c9a29fe2b8405d420764da4f71f5de53c04c92098e8a9ba7d6675e927d3315481257d8ca3d564e5ba693bd44ce00631db4397f62c892dc937886a4507beeccc2c3f8eb99f4b9f16d2d32187183921373990daf17af7e907a6aa824cfa436200c32e078c73cdc8eeb8954a8c29c590c85f1bb165c697af2507653870b60d9b44c8487ffc5100549301ce63d4aeda7f29ccaaedf0e05f2dfc373b6f61e3fe8d41526b0988837e62192060843c41c7c0fcbf7e90756aebf86b655a4990890605546312d4deb11785b10283aaf6185507f9e9bdd72f2300cd747dfdabbaf44fff98827515922031bffbdeed6119d60b22d59b3ecc7cc839e701ac7330782ea3e3794ff48f43d2176466fc86e6beaee96ed9001f99d11be18e721a2a8e4ac0b089ab7b5820a114c58e0e8fa8d6eccd2056487f460e7d5a99ced39bae068fb95b1352a5b66996d1a6ecb6d5a21f9ad6287b0c9647d259549c117179f072cbaf531b17f77c2c4a353fb13aa2142598841a3b653d7657021d26f149ec0e7771b82ed506026cc00f2b40c1752792f81eed3821ca1766ea5522eb2077ccadd1afa0b02011cee629920cad2a72f97ad105b0559c4e3188498f14d3c20bb29efbd11a36a25e5e4b20d0dbfc4dbefb65efd5a1c0b9c41dbc011ccb8549202d616e9ff66c857e3694964374e35e3740883eb2b59017f6cc61d761305dc33ba6ea483d15886cec76ae79ed337020f9ae7fc24c0d381bb471852277bf103bd012bb6e5caf3996c4a9fb9844b2248798fa5f0f62dc89322bef48016412b7097858aa5e2d41210e7c08189fc861a80d03965d75ad78e67dd58cbee67898a6b7fff3d61dcfafd838a6b3ceffe710e890f6df6d82361d7e83224a90cd57e96fc7191fc881aa83d7a5e755b98519f59f8b4365e512208101064b015844c0f76fab5bc64f0b8ab50875f0cf07cbe448650481259849655d8db4d3536835239e86546c160242381c4428e6a2ed3d02ccf742c1cd0f243df184eecc607df3b2fefc5012496c4a35152335043c5057f59588ebb6fe65854307ae62ff5cbe84270a560cb36a5bc1eecf82ed9bccb80c673309a2ed75908fe63b2e76708c712450449ded77ab0d66ac23b71abdf097d34bdda56135d17ba5287d46accb9bbd5da74eee9608599b88985b6c8cadedfcd1111f3b359763c20b59204c5b6d6618ccf5de071c2fa9b50a58361f458aa7a28bdcd0758b11b16e4e03588e817a372b9b2b711f79eca3c8049d5643915468a27adb00883bd4ff61cb76dbf22ba07c8adc13d1c7900c2e1c112fffbc41abc95982220210f9fc655f6485f4182240005629b616d6a6c4b76612986aab21122241095b777e6d7f7b124cfd62fd0bd05fa9a7c71dbb801a52cac6f6a941c6f6317909db9d78639f1a89deca0dcf419613b723dd72b78e5804b1d1a292e16a5c64965a35d25ed18a889e79b9ae8d930dd438ec1ecfaecd7638e469d814aca39a21d77c0e83759ff5a681b6c546be84b21860d5db3121a472fe2a96e7e072644aa6a1270230c081b6b50f066281e6d925b1de878d0dfbe708919f8ef7c262102422d2e68a3c0b56a210a320997b959dc5ae558b71fc3a19d3b77af242b87629729cb3ce32c4441ffda82a09c91b0e05059f4d28dafb10b0117921f4b5f634e1102f59659a0d2141ed41302ac87d34b2b76d480254ae9f215fb164e3a7c683aad6755d2d39cad5d345dc13954a3f6114f403ee28e6de26adffe79a69900782a0f4c295fca4a520ef33c9dd3e66f0b959a8b13b02018a2149ab4623380aff1f7e5dac33c8ec5fb128722d130229a29a89191a6ad69d63eb11019004542c15dacadfaf07cc0e26e71752d1570198c8931f05178f100c748d48f9bf036e6e801bc545b6557c9edc46fa46880461b78df3e5188e2208c2c27a31803041464fcc740eb0029a0e9570a7baa279ba8225e7c748c0ea6539420c949af77ef37133094fb84021f7b6232a564e194d95becfaa170110a012ff20bf24f9a0febb6f77b9ddb2bf6a6ba2064df85b8773911e0199b6d83dc7c62b50664eae16893c41a27b028a8cbe3ec15550d8ab732c90a8bcaa3ce485152b80434823b8a31c5461416c8d2338182e015998dbad0372146796d9917c6d729a1636365adc2c0b8ad750f88307a2b568b97fe3ce8e7e39e4d8585b900cdbae8f8a1076a79a8589facbe5ccf268645361ba8819521be89f0e50379b136a307e3a6f7e1be72c762f4011cb6f900334a81db827b16176d0d9d9814b11e05721402100602f927dc61c1e46a42057bab6000930362591661ddfcf35ec4ff472f4d2060214822d5cc99b8d188201071209c53132b3fd765eb45495353e876490dffda6e8a0acc2a82d6a34ec89b1e7fec6fd0c8bf09ddd15028485225608b31c93d3f97649d1a6a1b3c71864b0498414a26ae448016a9552d063fc261bc2140d72e5365059e2eb270c9096659883debbe639f0271ed79d5d0439334392bbcf04dbdf6499acfd528f1deee94ca9f6edb8eef769d974d9ee62b74d992bb1748a981f9aab5b12c1231e2a1efa4e73c732b99a39eeddf4bf384f6737b076c36b19bf6b2c1ddb4829bb2e67edc25ba5dc656448dea0585c5336d93da6eb7dd0930760632b88778fa34a38319687d952cfe9ae9d880e6ab73a65abaac14090500c4973a5ecbc8d02e8acf0a4485798fb690b1693651b2e04add646773d60b8e1baf791653cda641fecf714391a3321cbb78d40c690f46c8d6318d77297c49a038802b7d36703e8f3e3a3fc907f09018a9c73a8f0b048abfa8c019708f85e19fe6c570b5dc492257737b251ab0a1a91d9772b101996208f36a1c2755a698331a8dc58adcd51ecad69c4ec5d0c0ad822122899fe61ba92c41efbb5cf5b88e6f03df08e2178f770caccfb3c05ffea91a76cc9629eedb9746e0e86e56033ceed9fac6e50a229d7b33a4071402023c1ebe2e93bb1f7a3a5b588644d50ade01cc2ce8e04ee0012fec3146a0fff754999efa50f04db57988919ce662a543be220de91ef38dbc131db11371555f7dead36a8dd476e35bae1af63a4f949274d8f5eab416666efcb7cb377f9a993e32a36eb101153fb65dbf2571816b82de6404899264d5be864e82d76dcf7fcc64a30374d0b9129f255dc3d093e3158ef2e96d5dde7296c8f1ef9825691e2bd08eb2a7581929d725caad943312048d56a4d92564c24d31a3ce2feb1ee0baa7cefccc688f8c7e617a0ff524ff7f3c51091196903d9737f0c2771ad07e664d743511d91deb4965622a8d1ca72a735cdc94ba3fff338a45ad75f7dd41da643a18d4fd7776a67f34b1dfc63be516567a1db7ba62b258ab4c436f33c4fcfbfbab5784f44555b9e4fb439ee4125b503dc67f0e5572b1f70787be6cf7ecde16c623fffa27fcdd4edaaeb41e2eb52c7e55e337a638f6d197f48c593aad6f29ee5a6e7963545c76592e7f85f1d19fd5535481f18aa6bcb312a29c57d47226820ac858c1955365588485f6dfe9bc57dcf36e2ee4155cf324990fb36388fc5b2b9b66e2b50c0cdd0d06ec94b2bc96ea74428b45e1c751d6fbca20d3bcbe139a86485d20d0142a7ba16a92642b1970e4a7426d9f7e99d5a17d0b678ca822c9d6eea1e0b3eccd66c26957fb8c7a341b93bc7c1d0cead8c6711ff6646ec1faac6bba2fde939d233b0b7c766ce141a1180c0737b8d23d2f311d4c4c6ef53ec7d691da156ae83009788ed51dc1e48818405543278b970da5a2278c3ba62a0376c00c05302405e3f4b3e837fe170442e0a6c7b463126e5d6b3ceda461c8816cd48e5d2b61832289a00041220199b9dcc020420997f014494c02a943d09568ebe7d75c00bb7c56028947208a4c938da7088aaa7aa4b897c3f33bb1bc7f83a858252428ba6c553436c729cd9802291f1219ad83e644b936288a4bec164cebd28078a6a6ce026788edb74ff233c3ee280d83e2d2d7e76e31c803c82d2a92036e42e6e0e0df02a7123d164b58f8f79b957ede515e763304626fb088e8fed2879975c4bf4997820865dc431342ddf0f2eb860e6e74ee0375448872018cfabe5d0d095bf7b058b6ad38213cf0e6098edca6ee0bc3ef11f437ea3efb0b2fbadf4f8b0238bffb40ccc9a2f6eca4d46eb81ff9de7cfd303f6e6b049f3aca20409e6e11c48da17591baa7b1b6d686bcb57875d4437df9973383a5e0827e024d5a814781198ab18a7149b82b5232a2c09cd4492800e189870d7bd5f9695eec682e9512005c4834be449e2b95fee9d6764ac30ec96f061c930c47a26a0a99f26b054a6e87e233d3ee2c0e23f2d053ff77fba4143e97cc2de8c5597ff9d510de0ae3ed0939b1bb7351bb5de9330dff17104d59ea4c22591199d6013279ecec89a96342fe023008f58118f718c4dda76a1352f0751b1fccd54eeb1ff5aad67cb828f8edfb1dda6ecfe57787cd811b17d5a064eecd8da9b432ad56f7f1166d2cec199c59a8ea6f726fcffa2636f61d8e5726cc08fd154c5a23f39e0af374a1aa55b6dc3809eaaea1941a956100b5a116d899dfbf89a43ab472be35add5dd5675f3250cd4ada41b0992ad2dafa0b550d6cc93c027fd88d9b8c617158fd7ecf90e772cc058dee01cb0aea1007b3beeede04f28f6e14db9414e7e3fb1d456d351207401c1cb50d7649748c7b68a2e80755e4aac79e2f63bcb5980686a17e08d744b7eefd862c3c63eb16825a875c029b3bba08e08dbe51cca0b081ce9cc0473ca68dbea1305767592cf3ee3aca281174fd754062f3ed6eed65c66aa543b67a55b600e732448f255f5fb033627d9d9cdd5a068ee15964db39b0975276a8baf42f92bec7579e88714ec0edf96b3be35eba4f8079554399543c1668710894846307d60538ea20e6c033256902eb5c8cab2435a8dff7b641eb881248001e019ba64d1bf86c3b5b991329af236255eb03a5c55447a0cbba5fac936640c8cc9c252b0580a9c9629419b528e9f8890933036829b62e19c78104a5df7a0482a7135bb668a611899b19e6ef44f865f267875ae7329bb8ad4e5ac8959a1f1dbe65f2e47fb86d57f343d70458ba3c533c2e629ffa7f9cc6fae3f1d5c89064eaed3932e481f9fb2bd639289a2146f5129181ac6a7afd1e52f075f60c1d83f368b05ee92564cff2d4300d0159b05a9995c003755590d3930ed0472f5560d0eff60eb9c96e991a930ea14b4ced604c196e3b1265a9f088a69b5a3ca4cfb54816e4dd5fbd0680cc234f3543889083491a0964d7a5b21dedd848ac5b367691d2428c77a763eb518cab026a9cbf0c02350eb5a1bdbe1848e529ab2de75d33b41700acf364205cd4a058ccc566e0d0402ba6028c0330038261fff6e1ca2d5209306f1f534fbe638fcc60fb69ea08f6be4be6cc58e3a075d166d4e82cd3bd5ac845f62dcefe1e7d0ff2e6c446f3c800b1ddf6a36bc1e8122cb62b965b26ba48411d7409b48204cedac447dcb82ee0df2c1ea0a3060a70fc8b84fc68d3f1907fae24e249dbd64871904a8eeaa4604670d51a5c2b3633b36d5a49c4a27cb15fad448a48465b961ac533e2884851d4b0b2027e8059e0ec26f465e740d7b3d62960d36639adeca3e51fb733c969a37b915ec11a12819b7bba2f071292f5db9f854114b510dced3189e493ff0bb1791915fb5acf5ef89b9aa2a7ad4d2971527c534dfa84b27bf7eee9409d9e870504efbe3bfd2b04bdbfc17fa3ccf85e5015edee6c44569dbf6bfb9f28e64f80cdea133bdc6d769e68476cdae68b04c6003876ae986ea2310f34f5e39a904aa5eb5aaf451f6bff8749929efcb97bcdaa8fdd2cc9d54abbf5294d3e340a630a09b3597b3a91d4cf3e16329078aa81f404c3ec444fea6857228f19f61ed79dec9efb3b024cf8af8ca4712b0b1ade33f250ebaf7a590966d518c5201df75bb377e6d598a7d38725ff3a454359a8e4c21b11a9471e552e7c73542e811a3414f1e39a142c797f460109a6548221a2a7d3098817632ef8c82058618c138a071947f2e27117cbd87516cbabba2f6710db05a15dd795be3077f148abb9ebe8cbb2ba235f50518fc14161c45ed92c1e0f94e6fc9ab2e4e45fe19666ab62a4c1c6a7734607a357a7fb3b3447ba0e7b9b66972f678e5fbc557d64ffc9583e28907ace9d32e9af04af9a8af9ccf1e1bb393bf6afc9369644ee91cde2924059cdadc896339ba50cb3ed092e41bc97593b166bc62240ce51fe649f5d37b94f54b2cbf0bcf4324a808e0ba855fbffcecab626ff5bb548902d91d28e6ea6e0254b3cb9fff7db405b0afbede1b2bafb867aa309974e291743e33673df121f553caf30afe60020cbc43ac159540975d748ed0d7e9d44b7a0da39de769acedef315e4cf6b2f0cbaa82937ebfebfe4f02840ee86e246f8ef6dfebe2d8b241f45dc4b0778c586461bfe78bb94507c23aebd4965968b4af1614af6dfedf8df907e9057f4bf0002699bd0dfec27e3da8ec6511444fe5582d9e084774d66ef04452e4155991256e49345daa9227da2af3c2a65dc2ac96c8461b0170d060fd6dcd3912bc4f156573cf38894f84949fec4efdbcfee342273a6a70b7e78bad0ad305343a28c6be7638b9d8410f75efa31fe57348e50a44e897ea3130cdeae80a30523d107475cf3337cbbac574b53f34f4756e848887d1039a82a52acf1b8db9fe56e03a6163e7465f33d0936d5c8c8939dd727a6deb32c9903fadca99d79ddafc4aac9253526adbbd57866e570874e636484da9d3b1bbab892a562076d5df91454208a2ae896fef498ece4c137f6e36483e9e617d700b8bc726dd57f28627ef3c52cc8d0fba867676ecf3dc2af0187cf3a9d7e0fe6ed43bcf25eaf7f9e734bb73fd1795e5efba5bf6f004c5b989851f9a2ccf040b5c5fa6d46fb07559c65afb7b89d4aefa4058285f3bd927f528166a3d6494fa1c8284a5ce2d450106e15ed8e46ec7353291412e1919cc8c1ca4a6f89caded98061678db1bbc889540c69eab6cd89005a601d24b9e5e9f9fcdf6d86a2c90ad2cab0b59fbb25b7fe2478924cc2ad9716180798f8e7fadbec0e701b01a068b998735c8eb435a689db8e383dab764fc7fd89b620104548462ab31093400f9f44be9f09b1f7fc91375b265a89a64ff921462d494c5e55f9d6bda9cbc658b809a7d09415b8db464963d028f4a69a53038e2f1464f37a9548382b959bd83499fa21d7829ac9b126bb72eac0743bad2a7c26f261c302715bf5e3d6fe9317ead283174d1285876541bb7fd043bd47fff30f1dba0312b69f1a880a898aeeca5f9c365e35d9fec44260d1e62fe02090d396d1e51f85980d050abfbecd0d897cfe0d86bd4ab25674e33cfdb937ebcb234af35afffc19deda380a00c27c39002c91f6cfbfb2e0d941eabf72cae14e7af5c98ffd30c9abf48bf390415877948e1fbfe1ec9c89bcae1fae145a1fe7dcd7d5be3dbf7e9d8cb94a3469c2fba2b4cbbd5a32a642a769bff9ef8ef5447d6f1c9c4b660f0dc8fae9d65080b25f7c0703d13d573d7eeac65657d775f54dcb2845d7479cfb3adb27fad6a998ab22c6537c5f34744b796fa4f75952af0574c6604f74f4c6deb964f1d0c09414425bad7831fa2489168965975095346a257761632a5384e996eb74c1c9d6f2c3acda23bc5deacad587cd935280ec6c84d44b355dfd130e4975716d44ca05d9207a64e23b2eabec596d645e83931f49783e3a5869950af3c7150e0eea8ba72c76dd7933aedf147779652a152e557aa7eab456651688efa64cb6223d0a49e4aa15a14c9e196a1ac5794017d572c95d43f52ac58a9046a340ac3592bae091a952a60843823c152a346a697b94fe33617d953ef365cc0ae99d15d839fea3e75f9ab14ced6ec24c1b556bc1c76feca0f64e6bec885d933eec9033690952d180ce818e398e501e129df1c24e977d72da015fddbbe9bf6f65db8ec6dedaa57a3efc7845f61664b5132278b6852b268f2bcdfef2e06acdf7b7b56a0c3b413ca9a61d62ebcc52826964e7adafe97e1493f43267b3fb7c06906fe4c90c59bad47c51f624c8980e8923a72ea8bf76c353c4fdcd65841af9837d280e311ce0b62e5878842477b06793fcbe7204b809413372138a6ed34d18a903374166dedf84338972238159e2bf8000404b45ab4cb906950ae4c957cdea998ad3dcc89598879caa95a19692c12562389629ac93ac51ad2693ff1c2b55a9d8c518ab957f462faedf23790ad87e5233b9c87aaf974ce83365af5a2c47ee4ae93955dd6a56a28df6691395c9d3582ce375bf940bc969bc07493cbcd38ff7bce770de7ef5e43bb24adc1aa49702112b5691df78b4c4afbba1edc39cdcd9ff3b81d463f7f4fff42db00b00';
  function loadFont() {
    if (loadFont.face || !window.FontFace || !document.fonts) return;
    const bytes = new Uint8Array(FONT.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(FONT.substr(i * 2, 2), 16);
    loadFont.face = new FontFace('AnnotHand', bytes.buffer, { weight: '400 700' });
    document.fonts.add(loadFont.face);
  }
  function bezier(x1, y1, x2, y2) {
    const ax = 1 + 3 * (x1 - x2),
      bx = 3 * (x2 - 2 * x1),
      cx = 3 * x1,
      ay = 1 + 3 * (y1 - y2),
      by = 3 * (y2 - 2 * y1),
      cy = 3 * y1;
    const xAt = (s) => ((ax * s + bx) * s + cx) * s,
      yAt = (s) => ((ay * s + by) * s + cy) * s;
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      let lo = 0,
        hi = 1,
        s = t;
      for (let k = 0; k < 20; k++) {
        const x = xAt(s);
        if (Math.abs(x - t) < 1e-5) break;
        if (x < t) lo = s;
        else hi = s;
        s = (lo + hi) / 2;
      }
      return yAt(s);
    };
  }
  const PACE = {
    noteLag: 120,
    ruleBack: 0.5,
    panelAfter: 0.75,
    turnBack: 0.75,
    nib: 0.09,
  };
  const CURVE = {
    pen: bezier(0.28, 0.8, 0.12, 1),
    grow: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    note: bezier(0.33, 0.55, 0.2, 1),
    lift: (t) => 1 - Math.pow(1 - t, 3),
    pull: (t) => 1 - Math.pow(1 - t, 4),
    wipe: (t) => 1 - (1 - t) * (1 - t),
  };
  const NOTE = { hidden: 140, shown: 50, gone: -40 };
  function loopPts() {
    const p = [],
      n = 26,
      turn = 1.13,
      c0 = 3.55;
    for (let i = 0; i <= n; i++) {
      const t = i / n,
        a = c0 + t * turn * Math.PI * 2,
        r = 1 + 0.05 * Math.sin(i * 1.7) + 0.03 * Math.cos(i * 3.1) - t * 0.06;
      p.push([220 + Math.cos(a) * 206 * r, 92 + Math.sin(a) * 78 * r + t * 8]);
    }
    return p;
  }
  const MARKS = [
    {
      vb: [420, 64],
      ax: -4,
      aw: 108,
      ay: 56,
      w: [3, 8, 10, 9, 8, 7, 4],
      pts: [
        [10, 35],
        [70, 34],
        [150, 33],
        [240, 32],
        [320, 31],
        [384, 30],
        [408, 28],
        [398, 33],
        [374, 36],
      ],
    },
    { vb: [440, 190], ax: -11, aw: 124, ay: 52, w: [2, 6, 8, 8, 7, 6, 5, 3], pts: loopPts() },
    {
      vb: [420, 60],
      ax: -2,
      aw: 104,
      ay: 102,
      w: [3, 8, 10, 9, 8, 7, 5, 3],
      pts: [
        [6, 32],
        [80, 29],
        [170, 27],
        [260, 26],
        [340, 27],
        [392, 29],
        [412, 22],
      ],
    },
    {
      vb: [440, 60],
      ax: -3,
      aw: 108,
      ay: 104,
      w: [3, 8, 10, 9, 9, 8, 6, 3],
      pts: [
        [8, 30],
        [64, 24],
        [124, 34],
        [184, 25],
        [244, 35],
        [304, 26],
        [364, 34],
        [412, 26],
        [432, 20],
      ],
    },
  ];
  function splineThrough(pts, steps) {
    const table = [];
    for (let s = 0; s < steps; s++) {
      const u = s / steps,
        u2 = u * u,
        u3 = u2 * u;
      table.push([(2 * u2 - u - u3) / 2, (2 - 5 * u2 + 3 * u3) / 2, (u + 4 * u2 - 3 * u3) / 2, (u3 - u2) / 2]);
    }
    const last = pts.length - 1,
      line = [];
    for (let i = 0; i < last; i++) {
      const a = pts[i ? i - 1 : 0],
        b = pts[i],
        c = pts[i + 1],
        d = pts[i + 2 > last ? last : i + 2];
      for (const [wa, wb, wc, wd] of table)
        line.push([wa * a[0] + wb * b[0] + wc * c[0] + wd * d[0], wa * a[1] + wb * b[1] + wc * c[1] + wd * d[1]]);
    }
    line.push(pts[last]);
    return line;
  }
  const f2 = (v) => v.toFixed(2);
  function markGeometry(m) {
    const c = splineThrough(m.pts, 10),
      n = c.length,
      len = [0];
    for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]));
    const L = len[n - 1],
      W = m.w,
      wAt = (t) => {
        const u = t * (W.length - 1),
          i = Math.min(W.length - 2, Math.floor(u)),
          q = u - i;
        return W[i] * (1 - q) + W[i + 1] * q;
      };
    const A = [],
      B = [];
    let maxW = 0;
    for (let i = 0; i < n; i++) {
      const a = c[Math.max(0, i - 1)],
        b = c[Math.min(n - 1, i + 1)],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        h = Math.hypot(dx, dy) || 1,
        nx = -dy / h,
        ny = dx / h;
      const t = len[i] / L,
        w = wAt(t) * (1 + 0.12 * Math.sin(t * 23.0) + 0.06 * Math.sin(t * 61.0)),
        r = w / 2;
      maxW = Math.max(maxW, w);
      A.push([c[i][0] + nx * r, c[i][1] + ny * r]);
      B.push([c[i][0] - nx * r, c[i][1] - ny * r]);
    }
    const cap = (p, q, ctr) => {
      const r = Math.hypot(p[0] - q[0], p[1] - q[1]) / 2;
      return 'A' + f2(r) + ' ' + f2(r) + ' 0 0 1 ' + f2(q[0]) + ' ' + f2(q[1]);
    };
    const outline =
      'M' +
      A.map((p) => f2(p[0]) + ' ' + f2(p[1])).join('L') +
      cap(A[n - 1], B[n - 1]) +
      'L' +
      B.reverse()
        .map((p) => f2(p[0]) + ' ' + f2(p[1]))
        .join('L') +
      cap(B[n - 1], A[0]) +
      'Z';
    const center = 'M' + c.map((p) => f2(p[0]) + ' ' + f2(p[1])).join('L');
    return { outline, center, width: maxW + 4 };
  }
  let uid = 0;
  function markSvg(m) {
    const [w, h] = m.vb,
      k = ++uid;
    let inner = '';
    if (m.thin) {
      inner = m.thin
        .map(
          (s) =>
            '<path class="an-ink an-thin" pathLength="1" stroke-width="' +
            m.sw +
            '" d="M' +
            s[0].join(' ') +
            'L' +
            s[1].join(' ') +
            '"/>',
        )
        .join('');
    } else {
      const g = markGeometry(m);
      inner =
        '<mask id="an-m' +
        k +
        '" maskUnits="userSpaceOnUse" x="0" y="0" width="' +
        w +
        '" height="' +
        h +
        '"><path fill="#fff" d="' +
        g.outline +
        '"/></mask>' +
        '<path class="an-ink" pathLength="1" stroke-width="' +
        f2(g.width) +
        '" mask="url(#an-m' +
        k +
        ')" d="' +
        g.center +
        '"/>';
    }
    return (
      '<svg class="an-mark" viewBox="0 0 ' +
      w +
      ' ' +
      h +
      '" aria-hidden="true" style="--ax:' +
      m.ax +
      '%;--aw:' +
      m.aw +
      '%;--ay:' +
      m.ay +
      '%">' +
      inner +
      '</svg>'
    );
  }
  function sceneMarkup() {
    const items = ITEMS.map(
      (it, i) =>
        '<li class="an-item"><span class="an-rule" aria-hidden="true"></span>' +
        '<a href="#" class="an-link"><span class="an-word">' +
        it[0] +
        markSvg(MARKS[i % MARKS.length]) +
        '</span></a>' +
        '<span class="an-note" aria-hidden="true" data-i="' +
        i +
        '" style="--nx:' +
        it[2][0] +
        'em;--ny:' +
        it[2][1] +
        'em;--nr:' +
        it[2][2] +
        'deg">' +
        it[1] +
        '</span></li>',
    ).join('');
    return (
      '<div class="an-root"><div class="an-bar">' +
      '<button type="button" class="an-btn ck-pill ck-solid" data-size="sm" aria-expanded="true"><span class="an-btn-label">Close</span></button></div>' +
      '<nav class="an-menu ck-panel" data-size="lg" aria-label="Menu"><ul class="an-list">' +
      items +
      '</ul></nav></div>'
    );
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    loadFont();
    element.classList.add('an-host');
    if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
    const cardOpt = options.card || null;
    element.innerHTML = sceneMarkup() + '';
    const q = (s) => element.querySelector(s),
      qa = (s) => [...element.querySelectorAll(s)];
    const menu = q('.an-menu'),
      btn = q('.an-btn'),
      label = q('.an-btn-label');
    const items = qa('.an-link');
    const G = qa('.an-item').map((li) => ({
      inks: [...li.querySelectorAll('.an-ink')],
      rules: [...li.querySelectorAll('.an-rule')],
      note: li.querySelector('.an-note'),
    }));
    const ms = (k) => api.params[k];
    let notesReady = false;
    const noteText = () =>
      G.forEach((g, i) => {
        const v = api.params['note' + (i + 1)],
          t = (typeof v === 'string' ? v : ITEMS[i][1]).slice(0, 16);
        if (g.note.textContent === t) return;
        g.note.textContent = t;
        if (notesReady && st.open) {
          src.touch = i;
          sync();
        }
      });
    const st = { open: true, shown: -1 };
    let openedAt = -1e9;
    const src = { hover: -1, focus: -1, touch: -1 };
    const inFlight = new WeakMap();
    const moving = (a) => a.playState !== 'finished' && a.playState !== 'idle';
    const begun = (a) => (a.currentTime || 0) > (a.effect.getTiming().delay || 0);
    function turnable(el, way) {
      const prev = inFlight.get(el);
      return (
        !!prev &&
        prev.way !== way &&
        moving(prev.anim) &&
        begun(prev.anim) &&
        prev.anim.effect.getComputedTiming().progress < PACE.turnBack
      );
    }
    function drive(el, way, keys, timing, turn) {
      const prev = inFlight.get(el);
      let blank = false;
      if (prev && prev.way !== way && moving(prev.anim)) {
        if (!begun(prev.anim)) blank = way === 'off';
        else if (turn) {
          prev.anim.reverse();
          prev.way = way;
          return;
        }
      }
      if (prev) prev.anim.cancel();
      const anim = api.animate(el, keys, Object.assign({ fill: 'both', easing: 'linear' }, timing));
      if (blank) anim.finish();
      inFlight.set(el, { way, anim });
    }
    const steps = (n, at) => Array.from({ length: n + 1 }, (_, k) => Object.assign({ offset: k / n }, at(k / n)));
    const nibOpacity = (v) => R.smooth((1 - Math.abs(v)) / PACE.nib);
    const inkKeys = (from, to, ease) =>
      steps(36, (u) => {
        const v = R.mix(from, to, ease(u));
        return { strokeDashoffset: v, opacity: nibOpacity(v), visibility: Math.abs(v) < 1 ? 'visible' : 'hidden' };
      });
    const ruleKeys = (from, to, ease, origin) =>
      steps(20, (u) => ({ transform: 'scaleX(' + R.mix(from, to, ease(u)).toFixed(4) + ')', transformOrigin: origin }));
    const wipeAt = (p) => {
      const s = p.toFixed(2) + '% ' + p.toFixed(2) + '%';
      return { maskPosition: s, webkitMaskPosition: s };
    };
    const noteKeys = (from, to, ease) =>
      steps(20, (u) => {
        const p = R.mix(from, to, ease(u));
        return Object.assign(wipeAt(p), { visibility: p >= NOTE.hidden || p <= NOTE.gone ? 'hidden' : 'visible' });
      });
    function settle(i, on) {
      const g = G[i];
      for (const el of [...g.inks, ...g.rules, g.note]) {
        const prev = inFlight.get(el);
        if (prev) prev.anim.cancel();
        inFlight.delete(el);
      }
      g.inks.forEach((el) =>
        Object.assign(el.style, {
          strokeDashoffset: on ? '0' : '1',
          opacity: on ? '1' : '0',
          visibility: on ? 'visible' : 'hidden',
        }),
      );
      g.rules.forEach((el) => {
        el.style.transform = on ? 'scaleX(1)' : 'scaleX(0)';
      });
      Object.assign(g.note.style, wipeAt(on ? NOTE.shown : NOTE.hidden), { visibility: on ? 'visible' : 'hidden' });
    }
    function write(i) {
      const g = G[i];
      if (api.reduced) {
        settle(i, true);
        return;
      }
      const dur = ms('drawIn'),
        wait = Math.max(0, openedAt + ms('delay') - performance.now()),
        turn = wait <= 0 && turnable(g.inks[0], 'on');
      g.rules.forEach((el) =>
        drive(el, 'on', ruleKeys(0, 1, CURVE.grow, 'left center'), { duration: dur, delay: wait }, turn),
      );
      g.inks.forEach((el) => drive(el, 'on', inkKeys(1, 0, CURVE.pen), { duration: dur, delay: wait }, turn));
      drive(
        g.note,
        'on',
        noteKeys(NOTE.hidden, NOTE.shown, CURVE.note),
        { duration: dur, delay: wait + PACE.noteLag },
        turn,
      );
    }
    function erase(i) {
      const g = G[i];
      if (api.reduced) {
        settle(i, false);
        return;
      }
      const dur = ms('drawOut'),
        turn = turnable(g.inks[0], 'off');
      const now = (el, read, done) => {
        const v = parseFloat(read(getComputedStyle(el)));
        return Number.isFinite(v) ? v : done;
      };
      g.inks.forEach((el) => {
        const v = now(el, (c) => c.strokeDashoffset, 0);
        drive(el, 'off', inkKeys(v >= 1 ? -1 : R.clamp(v, 0, 1), -1, CURVE.lift), { duration: dur }, turn);
      });
      g.rules.forEach((el) =>
        drive(
          el,
          'off',
          ruleKeys(
            R.clamp(
              now(el, (c) => new DOMMatrixReadOnly(c.transform).a, 1),
              0,
              1,
            ),
            0,
            CURVE.pull,
            'right center',
          ),
          { duration: dur * PACE.ruleBack },
          turn,
        ),
      );
      const p = now(g.note, (c) => c.maskPosition || c.webkitMaskPosition, NOTE.shown);
      drive(
        g.note,
        'off',
        noteKeys(p >= NOTE.hidden ? NOTE.gone : Math.max(p, NOTE.shown), NOTE.gone, CURVE.wipe),
        { duration: dur },
        turn,
      );
    }
    function want() {
      if (!st.open) return -1;
      for (const k of ['hover', 'focus', 'touch']) if (src[k] >= 0) return src[k];
      return -1;
    }
    function sync() {
      const w = want();
      if (w === st.shown) return;
      if (st.shown >= 0) erase(st.shown);
      st.shown = w;
      if (w >= 0) write(w);
    }
    function panel(open, delay) {
      const a = menu._an;
      if (a) a.cancel();
      const shut = 'inset(0 0 100% 0 round 24px)',
        full = 'inset(0 0 0% 0 round 24px)';
      menu._an = api.animate(
        menu,
        open
          ? [
              { clipPath: shut, opacity: 0, transform: 'translateY(-8px)' },
              { clipPath: full, opacity: 1, transform: 'none' },
            ]
          : [
              { clipPath: full, opacity: 1, transform: 'none' },
              { clipPath: shut, opacity: 0, transform: 'translateY(-8px)' },
            ],
        { duration: open ? 700 : 500, delay: delay || 0, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
      );
      menu.inert = !open;
    }
    function setLabel() {
      label.textContent = st.open ? 'Close' : 'Menu';
      btn.setAttribute('aria-expanded', String(st.open));
    }
    function toggleMenu() {
      if (st.open) {
        const erasing = st.shown >= 0 && !api.reduced;
        st.open = false;
        src.touch = -1;
        sync();
        panel(false, erasing ? ms('drawOut') * PACE.panelAfter : 0);
      } else {
        st.open = true;
        openedAt = performance.now();
        panel(true, 0);
        sync();
      }
      setLabel();
    }
    menu.style.clipPath = 'inset(0 0 0% 0 round 24px)';
    G.forEach((g, i) => settle(i, false));
    openedAt = performance.now();
    setLabel();
    noteText();
    notesReady = true;
    api.on('params', noteText);
    let touched = () => {
      if (cardOpt.touched) cardOpt.touched();
    };
    api.listen(btn, 'click', () => {
      if (api.paused) return;
      toggleMenu();
      touched();
    });
    let lastType = 'mouse';
    items.forEach((a, i) => {
      api.listen(a, 'pointerdown', (e) => {
        lastType = e.pointerType;
      });
      api.listen(a, 'pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        src.hover = i;
        sync();
      });
      api.listen(a, 'pointerleave', (e) => {
        if (e.pointerType === 'touch') return;
        if (src.hover === i) {
          src.hover = -1;
          sync();
        }
      });
      api.listen(a, 'focus', () => {
        src.focus = i;
        sync();
      });
      api.listen(a, 'blur', () => {
        if (src.focus === i) {
          src.focus = -1;
          sync();
        }
      });
      api.listen(a, 'click', (e) => {
        e.preventDefault();
        if (api.paused) return;
        const touch = lastType === 'touch';
        lastType = 'mouse';
        if (touch && st.shown !== i && st.open) {
          src.touch = i;
          sync();
          return;
        }
        if (st.open) {
          toggleMenu();
          touched();
        }
      });
    });
    api.listen(element, 'keydown', (e) => {
      if (e.key === 'Escape' && st.open && true && !api.paused) {
        toggleMenu();
        touched();
        btn.focus();
      }
    });
    {
    }
    api.restore = () => {
      if (!st.open) {
        st.open = true;
        panel(true, 0);
      }
      openedAt = -1e9;
      src.hover = src.focus = -1;
      src.touch = 0;
      sync();
      setLabel();
    };
    api.frame(({ time, reduced }) => {
      return false;
    });
    const status = api.status;
    api.status = () => ({ ...(status ? status() : {}), open: st.open, shown: st.shown });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountAnnotatedMenu(element, options) {
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
    element.classList.add('annotated-menu');
    element.innerHTML = '<div class="fx-board"><div class="an-ep" data-an></div></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      host = stage.querySelector('[data-an]');
    const place = () => {
      const z = panelZone(stage, 7);
      host.style.setProperty('--an-left', (z.right ? z.right + 24 : 24) + 'px');
    };
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(host, { params: options.params, card: { start: 'draw', loop: 8, interactive: true } });

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
  global.mountAnnotatedMenu = mountAnnotatedMenu;
  if (typeof module === 'object' && module.exports) module.exports = mountAnnotatedMenu;
})(typeof window !== 'undefined' ? window : this);
