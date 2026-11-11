/*
 * Hold to Burst
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Press and hold an ink-metal hexagon: the stage darkens, the hexagon swells and trembles, then bursts with a white flash
 * into 600 small prisms that drift, regroup into the word BURST and get a passing highlight. Let go and every piece flies
 * back into the hexagon. Real 3D (Three.js); without WebGL a flat version (24 white triangles round an accent dot) takes
 * over.
 *
 * How it moves (3D version, default values)
 * - Geometry: a hexagon of circumradius 1.25 units cut into 24 triangles, each cut into 25 small triangular prisms
 *   (side 0.125, depth 0.2): 600 pieces drawn by one instanced mesh. Perspective camera, 38 degree field of view, z 7.
 * - Charging: while held, charge rises from 0 to 1 over params.holdSeconds (0.5 s). With charge c the background goes
 *   from #f0f0ef towards ink (c^1.4 x 0.88), the hexagon grows by up to 7 %, pieces shake by up to 0.045 units (c^2), the
 *   inner blue light and rays grow, the camera comes 1.2 units closer.
 * - Burst (charge full): a white flash over the element fading as e^(-4.2 t), a shock ring and rays; the 24 big
 *   triangles fly out along their own directions within 0.83 s, 0.8-1.9 units x spread / 2.2, spinning. From 0.7 s the
 *   small pieces separate and drift. From 1.45 s, middle letter first and 0.32 s later per letter outward (plus 0-0.18 s
 *   random), each piece flies 1.25 s along a curve to its point in the word BURST and grows to 1.42 x. A highlight
 *   sweeps across the word from 3.3 s for 0.9 s. The camera pulls back while the word forms.
 * - A press released before full charge also bursts, with power max(0.12, charge): shorter flight, weaker flash and
 *   light, no word; it hovers briefly and returns.
 * - Return: holding keeps the word. After release, once the word and the highlight are done (3.95 s after the burst),
 *   pieces wait 0.35 s, then fly back over params.returnSeconds (0.67 s), outer pieces slightly later. Pressing again
 *   while they return charges again once they are home.
 * - Framing: the finished word (8.3 x 3.2 units) fits the element with 20 px to spare, centred; it never comes closer than
 *   the full-screen framing. When the element is 760 px wide or narrower, the resting hexagon is enlarged to about 60 % of
 *   the width and the camera pulls back further while the word forms, so the word still fits.
 * - The word's shape is sampled from text drawn with "Arial Black" (fallback Arial, sans-serif), so it varies slightly
 *   with the fonts installed. Which piece goes to which point of the word is random per load.
 *
 * Flat version (no THREE, no WebGL, or the WebGL context is lost)
 * - 24 white SVG triangles over an accent dot, centred, fitted so the fully spread state stays inside the element with
 *   12 px to spare. Past holdSeconds the spread chases 1 at rate 5; on release the charge drains three times as fast as it
 *   built and the spread chases 0 at rate 4.4 / returnSeconds, so the pieces retrace their path.
 *
 * Input
 * - Press anywhere on the element (pointer, touch) or hold Space / Enter while it is focused (tabindex 0, role="button").
 *   Pointer capture keeps the press when the pointer leaves; the context menu is cancelled so a long touch press works.
 *   The press is released when the window loses focus or the tab is hidden.
 *
 * Options
 *   params.holdSeconds    0.3..1.5 s, default 0.5      charge time before the burst
 *   params.spread         1.2..3.6, default 2.2        how far the pieces fly (distance x spread / 2.2)
 *   params.returnSeconds  0.4..2 s, step 0.01, default 0.67   time to fly back after release
 *   params.metal          colour, unused by both versions here (kept for compatibility)
 *   reducedMotion         true / false / null          see "Reduced motion" below
 *
 * API
 *   const fx = mountHoldToBurst(element, {params: {...}, reducedMotion: null});
 *   fx.params                    copy of current params
 *   fx.setParams({spread: 3})    change params live
 *   fx.reset()                   params back to defaults; a press is let go, pieces return to the
 *                                hexagon in 0.5 s
 *   fx.setPaused(true|false)     flat version only; the 3D version pauses itself when the tab is hidden or the element is
 *                                off screen
 *   fx.setReducedMotion(bool)    flat version only; the 3D version follows prefers-reduced-motion
 *   fx.destroy()                 stops the loop, removes listeners and observers, releases the WebGL renderer, geometry,
 *                                textures and materials, removes
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="three.min.js"></script>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountHoldToBurst(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect replaces its children. Without three.min.js the flat version runs.
 * The 3D renderer is exposed as a global BurstWow (used by the mount function).
 *
 * Safe to change
 * - The word: WORD in the 3D code (letters are placed by measuring the text; very long words need a wider framing, see
 *   the A / B half-sizes of the word box).
 * - Colours: SURF (background), INK (pieces), ACC (glow, ring, emissive) in the 3D code; --accent and the card colours in
 *   effect.css for the flat version.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The order charge -> flash -> big triangles -> small pieces -> word -> highlight, and the rule that the pieces only
 *   return after the word and highlight are done. Returning on release mid-burst cuts the payoff.
 * - Power scaling of a short press (max(0.12, charge)); a short tap must still feel like it did something.
 * - One instanced mesh for the 600 pieces; separate meshes are far slower.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the WebGL context and listeners leak. In React StrictMode the mount runs twice; destroy
 *   in the cleanup handles that.
 * - Load three.min.js before effect.js (or expose THREE on window from your bundle). Load effect.css globally.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The element is role="button" with an aria-label explaining hold / release; the canvas and flash are aria-hidden.
 *   Phases are not announced.
 * - Reduced motion, 3D version: no loop and ; it rests on the finished word, and a click, Space or Enter
 *   toggles between the word and the hexagon. Flat version: it rests spread out and a click or key toggles closed /
 *   spread.
 *
 * Third-party: three.js r128 (three.min.js, MIT License, Copyright 2010-2021 Three.js Authors; see three.LICENSE.txt).
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const damp = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
  const R = { clamp, easeOut, smooth, damp };

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
    { key: 'holdSeconds', type: 'range', default: 0.5, min: 0.3, max: 1.5, step: 0.1 },
    { key: 'spread', type: 'range', default: 2.2, min: 1.2, max: 3.6, step: 0.1 },
    { key: 'returnSeconds', type: 'range', default: 0.9, min: 0.4, max: 2, step: 0.1 },
    { key: 'metal', type: 'color', default: '#ffffff' },
  ];

  // ---- the effect ----
  // ---- the effect, part: wow.js ----
  (function () {
    'use strict';
    const DEF = { holdSeconds: 0.5, spread: 2.2, returnSeconds: 0.67 };
    const OPEN = 0.83,
      FLY = 1.25,
      DONE = 3.45,
      RESTORE = 0.5;
    const A = 4.15,
      B = 1.6,
      DREF = 7.6,
      TAN = Math.tan((19 * Math.PI) / 180);
    function mount(el, opt) {
      opt = opt || {};
      const T = window.THREE;
      if (!T) return null;
      const canvas = document.createElement('canvas');
      canvas.className = 'burst-wow';
      canvas.setAttribute('aria-hidden', 'true');
      let R;
      try {
        R = new T.WebGLRenderer({ canvas, antialias: true });
        if (!R.getContext()) throw 0;
      } catch (e) {
        if (R) R.dispose();
        return null;
      }
      const flashEl = document.createElement('div');
      flashEl.className = 'burst-wow-flash';
      flashEl.setAttribute('aria-hidden', 'true');
      el.appendChild(canvas);
      el.appendChild(flashEl);
      const res = [],
        own = (x) => (res.push(x), x);
      const SURF = new T.Color('#f0f0ef'),
        INK = new T.Color('#17181a'),
        ACC = new T.Color('#4559ff');
      R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      const scene = new T.Scene(),
        cam = new T.PerspectiveCamera(38, 1, 0.1, 100);
      cam.position.set(0, 0, 7);
      scene.add(new T.AmbientLight(0xffffff, 0.35));
      const key = new T.DirectionalLight(0xffffff, 0.9);
      key.position.set(-3, 4, 6);
      scene.add(key);
      const core = new T.PointLight(0x8fa0ff, 0, 6, 1.6);
      core.position.set(0, 0, 0.05);
      scene.add(core);
      const front = new T.PointLight(0xffffff, 0, 20, 1);
      front.position.set(0, 0, 2.5);
      scene.add(front);
      const sweep = new T.PointLight(0xdfe4ff, 0, 3.2, 1.5);
      scene.add(sweep);
      const mat = own(
        new T.MeshStandardMaterial({
          color: INK,
          metalness: 0.6,
          roughness: 0.26,
          emissive: ACC,
          emissiveIntensity: 0,
        }),
      );
      const cv = document.createElement('canvas');
      cv.width = 1000;
      cv.height = 260;
      const x2 = cv.getContext('2d');
      x2.font = '900 230px "Arial Black",Arial,sans-serif';
      x2.textBaseline = 'middle';
      const WORD = 'BURST';
      let cx = 500 - x2.measureText(WORD).width / 2;
      const edges = [];
      for (const ch of WORD) {
        const w = x2.measureText(ch).width;
        edges.push(cx + w);
        x2.fillText(ch, cx, 140);
        cx += w;
      }
      const px = x2.getImageData(0, 0, 1000, 260).data,
        k = 7.8 / 1000,
        tg = [];
      for (let i = 0; i < 1000; i += 3)
        for (let j = 0; j < 260; j += 3)
          if (px[(j * 1000 + i) * 4 + 3] > 128) {
            let L = 0;
            while (L < 4 && i > edges[L]) L++;
            tg.push({ v: new T.Vector3((i - 500) * k, (130 - j) * k, 0), L });
          }
      tg.sort(() => Math.random() - 0.5);
      const NS = 5,
        TOTAL = 24 * NS * NS,
        SIDE = 1.25 / 2 / NS,
        rr = SIDE / Math.sqrt(3);
      const sh = new T.Shape(
        [0, 1, 2].map(
          (i) =>
            new T.Vector2(
              Math.cos(Math.PI / 2 + (i * 2 * Math.PI) / 3) * rr,
              Math.sin(Math.PI / 2 + (i * 2 * Math.PI) / 3) * rr,
            ),
        ),
      );
      const geo = own(
        new T.ExtrudeGeometry(sh, {
          depth: 0.2,
          bevelEnabled: true,
          bevelThickness: 0.01,
          bevelSize: 0.006,
          bevelSegments: 1,
        }),
      );
      geo.translate(0, 0, -0.1);
      const mesh = new T.InstancedMesh(geo, mat, TOTAL);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
      const big = [],
        pcs = [],
        Zax = new T.Vector3(0, 0, 1);
      function tri(a, b, c) {
        const cen = a
            .clone()
            .add(b)
            .add(c)
            .multiplyScalar(1 / 3),
          c3 = new T.Vector3(cen.x, cen.y, 0);
        const dir = c3
          .clone()
          .normalize()
          .multiplyScalar(0.6)
          .add(new T.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.15 + Math.random() * 0.25))
          .normalize();
        const Bg = {
          cen: c3,
          dir,
          dist: 0.8 + Math.random() * 1.1,
          spin: new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
          sp: 3 + Math.random() * 6,
          q: new T.Quaternion(),
        };
        big.push(Bg);
        const ab = b.clone().sub(a).divideScalar(NS),
          ac = c.clone().sub(a).divideScalar(NS);
        for (let i = 0; i < NS; i++)
          for (let j = 0; j < NS - i; j++) {
            const p0 = a.clone().addScaledVector(ab, i).addScaledVector(ac, j);
            const sets = [[p0, p0.clone().add(ab), p0.clone().add(ac)]];
            if (j < NS - i - 1) sets.push([p0.clone().add(ab), p0.clone().add(ab).add(ac), p0.clone().add(ac)]);
            for (const s of sets) {
              const pc = s[0]
                  .clone()
                  .add(s[1])
                  .add(s[2])
                  .multiplyScalar(1 / 3),
                t = tg[Math.floor((pcs.length * tg.length) / TOTAL)];
              const base = new T.Quaternion().setFromAxisAngle(
                Zax,
                Math.atan2(s[0].y - pc.y, s[0].x - pc.x) - Math.PI / 2,
              );
              pcs.push({
                B: Bg,
                base,
                pos: new T.Vector3(),
                quat: new T.Quaternion(),
                scl: 1,
                loc: new T.Vector3(pc.x - cen.x, pc.y - cen.y, 0),
                home: new T.Vector3(pc.x, pc.y, 0),
                T: t.v,
                L: t.L,
                drift: new T.Vector3(
                  Math.random() - 0.5,
                  Math.random() - 0.5,
                  (Math.random() - 0.5) * 0.6,
                ).multiplyScalar(0.35),
                ax: new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
                st: 1.45 + Math.abs(t.L - 2) * 0.32 + Math.random() * 0.18,
                sq: new T.Quaternion(),
                sp: new T.Vector3(),
              });
            }
          }
      }
      const V = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        V.push(new T.Vector2(Math.cos(a) * 1.25, Math.sin(a) * 1.25));
      }
      const O = new T.Vector2(0, 0);
      for (let i = 0; i < 6; i++) {
        const a = V[i],
          b = V[(i + 1) % 6],
          ab = a.clone().add(b).multiplyScalar(0.5),
          oa = a.clone().multiplyScalar(0.5),
          ob = b.clone().multiplyScalar(0.5);
        tri(O, oa, ob);
        tri(oa, a, ab);
        tri(ob, ab, b);
        tri(oa, ab, ob);
      }
      function tex(fn) {
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        fn(c.getContext('2d'));
        return own(new T.CanvasTexture(c));
      }
      const glowT = tex((x) => {
        const gr = x.createRadialGradient(256, 256, 0, 256, 256, 256);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.12, 'rgba(220,226,255,.95)');
        gr.addColorStop(0.35, 'rgba(69,89,255,.45)');
        gr.addColorStop(1, 'rgba(69,89,255,0)');
        x.fillStyle = gr;
        x.fillRect(0, 0, 512, 512);
      });
      const rayT = tex((x) => {
        x.translate(256, 256);
        for (let i = 0; i < 48; i++) {
          x.rotate((Math.PI * 2) / 48 + Math.random() * 0.05);
          const w = Math.random() * 5 + 1,
            l = 120 + Math.random() * 136;
          const gr = x.createLinearGradient(0, 0, l, 0);
          gr.addColorStop(0, 'rgba(255,255,255,.9)');
          gr.addColorStop(1, 'rgba(160,175,255,0)');
          x.fillStyle = gr;
          x.beginPath();
          x.moveTo(0, -w);
          x.lineTo(l, 0);
          x.lineTo(0, w);
          x.fill();
        }
      });
      const sprite = (t, s, z) => {
        const m = new T.Sprite(
          own(
            new T.SpriteMaterial({
              map: t,
              transparent: true,
              blending: T.AdditiveBlending,
              depthWrite: false,
              opacity: 0,
            }),
          ),
        );
        m.scale.setScalar(s);
        m.position.z = z;
        scene.add(m);
        return m;
      };
      const glow = sprite(glowT, 3, -0.4),
        rays = sprite(rayT, 6, -0.45),
        glow2 = sprite(glowT, 3, 1.2);
      const bandT = tex((x) => {
        const gr = x.createLinearGradient(0, 0, 512, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.5, 'rgba(235,240,255,.85)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr;
        x.fillRect(0, 0, 512, 512);
        x.globalCompositeOperation = 'destination-in';
        const v = x.createLinearGradient(0, 0, 0, 512);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(0.5, 'rgba(0,0,0,1)');
        v.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = v;
        x.fillRect(0, 0, 512, 512);
      });
      const band = new T.Mesh(
        own(new T.PlaneGeometry(1.4, 3.6)),
        own(
          new T.MeshBasicMaterial({
            map: bandT,
            transparent: true,
            opacity: 0,
            blending: T.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      band.rotation.z = -0.35;
      band.position.z = 0.2;
      scene.add(band);
      const ring = new T.Mesh(
        own(new T.RingGeometry(0.96, 1, 128)),
        own(
          new T.MeshBasicMaterial({ color: ACC, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }),
        ),
      );
      scene.add(ring);
      const ring2 = new T.Mesh(
        own(new T.RingGeometry(0.9, 1, 128)),
        own(
          new T.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            side: T.DoubleSide,
            depthWrite: false,
            blending: T.AdditiveBlending,
          }),
        ),
      );
      scene.add(ring2);
      const bg = new T.Color();
      const ease = (p) => 1 - Math.pow(1 - p, 3),
        soft = (x) => x * x * x * (x * (6 * x - 15) + 10),
        cl = (v) => Math.max(0, Math.min(1, v));
      const Qi = new T.Quaternion(),
        X = new T.Vector3(),
        C = new T.Vector3(),
        Q = new T.Quaternion(),
        Qs = new T.Quaternion(),
        P0 = new T.Vector3(),
        Q0 = new T.Quaternion(),
        M = new T.Matrix4(),
        Qm = new T.Quaternion(),
        S = new T.Vector3();
      const params = Object.assign({}, DEF);
      const st = { phase: 'idle', charge: 0, p: 0, tb: 0, wait: 0, back: params.returnSeconds, pw: 1 };
      const kp = (lo, g) => lo + (1 - lo) * Math.pow(st.pw, g || 1);
      let zoomOut = 1,
        wasBack = false,
        t = 0,
        userHeld = false,
        heldPointer = null,
        dirty = false,
        reduced = matchMedia('(prefers-reduced-motion: reduce)'),
        flat = 'word',
        view = { x: 0, y: 0, s: 1 },
        W = 1,
        H = 1;
      const held = () => userHeld || false;
      function hoverPose(q, tb) {
        const Bg = q.B,
          e = ease(cl(tb / 0.83)),
          kd = kp(0.22, 0.8),
          dist = ((Bg.dist * params.spread) / 2.2) * kd;
        Bg.q.setFromAxisAngle(Bg.spin, Bg.sp * e * kp(0.3));
        const hv = Math.max(0, tb - 0.7),
          sep = 1 + cl(hv / 0.6) * 1.1 * kp(0.15, 1.3);
        X.copy(Bg.cen)
          .multiplyScalar(1.14)
          .addScaledVector(Bg.dir, dist * e)
          .add(C.copy(q.loc).multiplyScalar(sep).applyQuaternion(Bg.q))
          .addScaledVector(q.drift, (1 - Math.exp(-hv * 2.2)) * kd);
        Qs.setFromAxisAngle(q.ax, hv * 1.4 * kd);
        Q.copy(Bg.q).multiply(Qs);
      }
      function fit() {
        const r = el.getBoundingClientRect();
        W = Math.max(1, Math.round(r.width));
        H = Math.max(1, Math.round(r.height));
        const pad = 20,
          cap = H / (2 * TAN * DREF),
          av = opt.avoid ? opt.avoid() : null;
        let x = W / 2,
          y = H / 2,
          s = Math.min((W - 2 * pad) / (2 * A), (H - 2 * pad) / (2 * B));
        if (av) {
          const s1 = Math.min((W - pad - av.w) / (2 * A), (H - 2 * pad) / (2 * B)),
            s2 = Math.min((W - 2 * pad) / (2 * A), (H - pad - av.h) / (2 * B));
          if (s1 >= s2) {
            s = Math.min(s1, cap);
            x = Math.min(W / 2, W - pad - A * s);
            x = Math.max(x, av.w + A * s);
          } else {
            s = Math.min(s2, cap);
            y = Math.max(H / 2, av.h + B * s);
            y = Math.min(y, H - pad - B * s);
          }
        }
        s = Math.max(1, Math.min(s, cap));
        zoomOut = 1;
        if (W <= 760) {
          const sh = Math.min((0.6 * W * 7) / (2.165 * DREF), ((H - 2 * pad) * 7) / (2.5 * DREF));
          if (sh > s) {
            zoomOut = sh / s;
            s = sh;
          }
        }
        view = { x, y, s };
        R.setSize(W, H, false);
        cam.aspect = W / H;
        cam.fov = (2 * Math.atan(H / (2 * s * DREF)) * 180) / Math.PI;
        cam.setViewOffset(W, H, W / 2 - x, H / 2 - y, W, H);
        cam.updateProjectionMatrix();
      }
      function draw() {
        const c = st.charge,
          open = st.phase === 'open',
          back = st.phase === 'back',
          opening = open || back,
          tb = open ? st.tb : 0;
        const fl = open ? Math.exp(-tb * 4.2) : 0,
          pw = st.pw;
        const dark = opening ? 0 : Math.pow(c, 1.4) * 0.88;
        bg.copy(SURF).lerp(INK, dark);
        R.setClearColor(bg);
        flashEl.style.opacity = Math.min(1, fl * 1.15 * kp(0.12, 1.6)).toFixed(3);
        const shake = opening ? 0 : c * c * 0.045;
        if (back && !wasBack)
          pcs.forEach((q) => {
            q.sp.copy(q.pos);
            q.sq.copy(q.quat);
          });
        wasBack = back;
        const bb = back ? 1 - st.p : 0;
        pcs.forEach((q, i) => {
          q.scl = 1;
          if (!opening) {
            q.pos.copy(q.home).multiplyScalar(1 + c * 0.07);
            q.pos.x += Math.sin(t * 70 + q.B.sp) * shake;
            q.pos.y += Math.cos(t * 83 + q.B.sp) * shake;
            q.quat.copy(Qi);
          } else if (back) {
            const e = soft(cl((bb - (1 - q.home.length() / 1.3) * 0.15) / 0.85));
            q.pos.lerpVectors(q.sp, q.home, e);
            q.quat.copy(q.sq).slerp(Qi, e);
          } else if (pw < 1 || tb < q.st) {
            hoverPose(q, tb);
            q.pos.copy(X);
            q.quat.copy(Q);
          } else {
            hoverPose(q, q.st);
            P0.copy(X);
            Q0.copy(Q);
            const x = cl((tb - q.st) / FLY),
              e = soft(x),
              u = 1 - e;
            C.copy(P0).add(q.T).multiplyScalar(0.5);
            C.z += 0.9;
            C.y += 0.25;
            q.pos
              .set(0, 0, 0)
              .addScaledVector(P0, u * u)
              .addScaledVector(C, 2 * u * e)
              .addScaledVector(q.T, e * e);
            if (x >= 1) q.pos.z += Math.sin(t * 2 + q.T.x * 1.2) * 0.02;
            q.quat.copy(Q0).slerp(Qi, e);
            q.scl = 1 + 0.42 * e;
          }
          Qm.copy(q.quat).multiply(q.base);
          M.compose(q.pos, Qm, S.setScalar(q.scl));
          mesh.setMatrixAt(i, M);
        });
        mesh.instanceMatrix.needsUpdate = true;
        core.intensity = opening ? (back ? st.p * 2 : 2 + fl * 20 * kp(0.25)) : c * c * 14;
        mat.emissiveIntensity = opening ? fl * 0.6 * kp(0.3) : c * c * 0.12;
        const after = open ? cl((tb - 1) / 1.5) : 0;
        glow.material.opacity = opening ? Math.max(fl, back ? st.p * 0.3 : 0.32) : c;
        glow.scale.setScalar(opening ? 2.8 + (1 - fl) * 1.8 + after * 2.5 : 1.4 + c * 2.4);
        glow2.material.opacity = opening ? fl * kp(0.15, 1.4) : Math.pow(c, 3) * 0.5;
        glow2.scale.setScalar(opening ? (4 + tb * 10) * kp(0.45) : 1);
        rays.material.opacity = opening ? fl * 0.9 * kp(0.25, 1.2) : Math.pow(c, 2) * 0.85;
        rays.material.rotation = t * 0.6 + c * 1.5;
        rays.scale.setScalar(opening ? (7 + tb * 14) * kp(0.5) : 3 + c * 4);
        const rt = open ? tb : 9;
        const kr = kp(0.4);
        ring.scale.setScalar(1 + rt * 9 * kr);
        ring.material.opacity = Math.max(0, 1 - rt * 1.4) * 0.9 * kp(0.5);
        ring2.scale.setScalar(0.6 + rt * 14 * kr);
        ring2.material.opacity = Math.max(0, 1 - rt * 2.2) * kp(0.3, 1.3);
        front.intensity = opening ? fl * 6 * kp(0.2) : 0;
        const sw = open ? cl((tb - DONE + 0.15) / 0.9) : 0,
          sx = -5 + sw * 10;
        band.position.x = sx;
        band.material.opacity = sw > 0 && sw < 1 ? Math.sin(sw * Math.PI) * 0.42 : 0;
        sweep.position.set(sx, 0.3, 0.9);
        sweep.intensity = band.material.opacity * 9;
        const wz = pw < 1 ? 0 : open ? soft(cl((tb - 1.2) / 1.6)) : back ? st.p : 0;
        cam.position.z =
          7 -
          c * 1.2 +
          (opening ? 1.2 * ease(cl(tb / 0.83)) * kp(0.25) + wz * 0.6 + Math.sin(Math.min(tb, 1) * Math.PI) * 0.6 : 0);
        cam.position.z *= 1 + (zoomOut - 1) * wz;
        cam.position.x = opening ? Math.sin(tb * 90) * fl * 0.15 * kp(0.2) : 0;
        cam.position.y = opening ? -0.25 * wz : 0;
        cam.lookAt(0, 0, 0);
        R.render(scene, cam);
      }
      function burst(pw) {
        st.pw = pw == null ? 1 : pw;
        st.phase = 'open';
        st.tb = 0;
        st.wait = 0;
        st.p = 0;
        if (userHeld) {
          dirty = true;
          if (opt.touched) opt.touched();
        }
      }
      function step(dt) {
        if (st.phase === 'idle' && held()) st.phase = 'charge';
        if (st.phase === 'charge') {
          if (!held()) {
            if (st.charge > 0) {
              burst(Math.max(0.12, st.charge));
              {
                dirty = true;
                if (opt.touched) opt.touched();
              }
            } else st.phase = 'idle';
          } else {
            st.charge = Math.min(1, st.charge + dt / params.holdSeconds);
            if (st.charge >= 1) burst();
          }
        }
        if (st.phase === 'idle') st.charge = Math.max(0, st.charge - dt / 0.25);
        else if (st.phase === 'open') {
          st.tb += dt;
          st.p = Math.min(1, st.p + dt / OPEN);
          if (st.pw >= 1 && st.tb < DONE + 0.5) st.wait = 0;
          if (st.p >= 1 && (st.pw < 1 || !held())) {
            st.wait += dt;
            if (st.wait > 0.35) {
              st.phase = 'back';
              st.back = params.returnSeconds;
            }
          }
        } else if (st.phase === 'back') {
          st.tb += dt;
          st.p = Math.max(0, st.p - dt / st.back);
          st.charge = Math.max(0, st.charge - dt / 0.3);
          if (st.p <= 0) {
            st.phase = 'idle';
            st.charge = 0;
            if (dirty) {
              dirty = false;
              if (opt.settled) opt.settled();
            }
          }
        }
      }
      function still() {
        if (flat === 'word') {
          st.phase = 'open';
          st.tb = DONE + 1.5;
          st.p = 1;
          st.charge = 1;
        } else {
          st.phase = 'idle';
          st.tb = 0;
          st.p = 0;
          st.charge = 0;
        }
        wasBack = false;
        t = 0;
        draw();
      }
      let raf = 0,
        last = 0,
        visible = true,
        dead = false;
      function frame(now) {
        raf = 0;
        if (dead) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        step(dt);
        draw();
        if (!held() && st.phase === 'idle' && st.charge === 0) return;
        wake();
      }
      function wake() {
        if (dead || raf || !visible || document.hidden || reduced.matches) return;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
      function sleep() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
      const on = (o, ev, f, p) => {
          o.addEventListener(ev, f, p);
          offs.push(() => o.removeEventListener(ev, f, p));
        },
        offs = [];
      function press(e) {
        if (reduced.matches) {
          flat = flat === 'word' ? 'hex' : 'word';
          if (flat === 'hex') {
            if (opt.touched) opt.touched();
          } else if (opt.settled) opt.settled();
          still();
          return;
        }
        userHeld = true;
        wake();
      }
      function lift() {
        if (!userHeld) return;
        userHeld = false;
        heldPointer = null;
        wake();
      }
      on(el, 'pointerdown', (e) => {
        if (e.button > 0) return;
        if (!reduced.matches) {
          heldPointer = e.pointerId;
          try {
            el.setPointerCapture(e.pointerId);
          } catch (_) {}
        }
        press(e);
      });
      on(el, 'pointerup', (e) => {
        if (e.pointerId === heldPointer) lift();
      });
      on(el, 'pointercancel', (e) => {
        if (e.pointerId === heldPointer) lift();
      });
      on(el, 'keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        if (!e.repeat) press(e);
      });
      on(el, 'keyup', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        if (heldPointer == null) lift();
      });
      on(el, 'contextmenu', (e) => e.preventDefault());
      on(window, 'blur', lift);
      on(document, 'visibilitychange', () => {
        if (document.hidden) {
          lift();
          sleep();
        } else wake();
      });
      const io = new IntersectionObserver((es) => {
        visible = es[es.length - 1].isIntersecting;
        if (visible) wake();
        else sleep();
      });
      io.observe(el);
      const ro = new ResizeObserver(() => {
        fit();
        if (reduced.matches || !raf) draw();
      });
      ro.observe(el);
      const onReduce = () => {
        if (reduced.matches) {
          userHeld = false;
          sleep();
          flat = 'word';
          still();
        } else {
          st.phase = 'idle';
          st.charge = 0;
          draw();
        }
      };
      on(reduced, 'change', onReduce);
      on(canvas, 'webglcontextlost', () => {
        destroy();
        if (opt.lost) opt.lost();
      });
      function destroy() {
        if (dead) return;
        dead = true;
        sleep();
        offs.forEach((f) => f());
        io.disconnect();
        ro.disconnect();
        res.forEach((r) => {
          try {
            r.dispose();
          } catch (e) {}
        });
        mesh.dispose && mesh.dispose();
        R.dispose();
        canvas.remove();
        flashEl.remove();
      }
      fit();
      if (reduced.matches) {
        still();
      } else {
        draw();
        wake();
      }
      return {
        setParams(p) {
          for (const k in DEF) if (p && typeof p[k] === 'number') params[k] = p[k];
          if (reduced.matches) still();
          else {
            if (!raf) draw();
          }
        },
        restore() {
          userHeld = false;
          heldPointer = null;
          dirty = false;
          if (reduced.matches) {
            flat = 'word';
            still();
            return;
          }
          if (st.phase === 'open' || st.phase === 'back') {
            const was = st.phase === 'back';
            if (was)
              pcs.forEach((q) => {
                q.sp.copy(q.pos);
                q.sq.copy(q.quat);
              });
            st.phase = 'back';
            st.p = 1;
            st.back = RESTORE;
            wasBack = was;
          } else st.phase = 'idle';
          wake();
        },
        status: () => ({
          phase: st.phase,
          charge: st.charge,
          p: st.p,
          tb: st.tb,
          held: held(),
          demo: false,
          running: !!raf,
          renderer: 'webgl',
          pieces: TOTAL,
          view: Object.assign({}, view),
        }),
        pose(o) {
          Object.assign(st, o);
          sleep();
          draw();
        },
        destroy,
      };
    }
    window.BurstWow = { mount, defaults: DEF };
  })();

  // Return time: the detail look uses 0.67 s (the WebGL version's own default), step 0.01.
  CONTROLS.forEach((c) => {
    if (c.key === 'returnSeconds') {
      c.default = 0.67;
      c.step = 0.01;
    }
  });
  function mountFlat(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('burst-stage');
    const cardOpt = options.card || null;
    let cardPieces = [],
      cardCore = null,
      cardCoreBase = 24,
      cardUnit = 1,
      cardCX = 0,
      cardCY = 0,
      cardDrawn = [];
    element.innerHTML =
      '<div class="burst-core" aria-hidden="true">' +
      (cardOpt.core ? cardOpt.core() : '') +
      '</div>' +
      (cardOpt.shards ? cardOpt.shards(24) : '');
    const interaction = element.querySelector('.burst-interaction');
    const board = element,
      chargeRing = element.querySelector('.burst-charge-ring'),
      chargeTrack = element.querySelector('.burst-charge-track'),
      PAD = 4;
    const facets = cardFacets();
    cardPieces = Array.from(board.querySelectorAll('polygon'));
    cardCore = board.querySelector('.burst-core');
    let held = false,
      heldPointer = null,
      charge = 0,
      spread = 0,
      flatToggle = false,
      lastPhase = '';
    api.on('resize', cardLayout);
    api.on('params', cardLayout);
    function release() {
      held = false;
      if (heldPointer != null && interaction && interaction.hasPointerCapture(heldPointer))
        interaction.releasePointerCapture(heldPointer);
      heldPointer = null;
      api.wake();
    }
    api.on('pause', (paused) => {
      if (paused) release();
    });
    api.on('replay', () => {
      release();
      charge = spread = 0;
      flatToggle = false;
      lastPhase = '';
    });
    {
      flatToggle = true;
      api.on('replay', () => {
        flatToggle = true;
      });
    }
    const RESTORE = 0.5;
    let back = null,
      dirty = false;
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
    function stepBack(dt) {
      back.t += dt;
      const e = outEase(Math.min(1, back.t / RESTORE));
      spread = back.spread * (1 - e);
      charge = back.charge * (1 - e);
      if (back.t >= RESTORE) {
        spread = charge = 0;
        back = null;
      }
    }
    {
      const hide = () => {};
      const toggle = () => {
        flatToggle = !flatToggle;
        if (cardOpt.settled && flatToggle) cardOpt.settled();
        else if (cardOpt.touched) cardOpt.touched();
        api.paint();
      };
      const press = (event) => {
        if (api.paused || api.destroyed || event.button > 0) return;
        hide();
        if (api.reduced) return;
        back = null;
        held = true;
        if (event.pointerId != null) {
          heldPointer = event.pointerId;
          element.setPointerCapture(event.pointerId);
        }
        api.wake();
      };
      const lift = (event) => {
        if (heldPointer != null && event.pointerId === heldPointer) release();
      };
      api.listen(element, 'pointerdown', press);
      api.listen(element, 'pointerup', lift);
      api.listen(element, 'pointercancel', lift);
      api.listen(element, 'click', () => {
        if (api.reduced) toggle();
      });
      api.listen(element, 'keydown', (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if (event.repeat) return;
        if (api.reduced) {
          hide();
          toggle();
        } else press(event);
      });
      api.listen(element, 'keyup', (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if (held && heldPointer == null) release();
      });
      api.listen(element, 'contextmenu', (event) => event.preventDefault());
      api.listen(window, 'blur', release);
      api.on('visibility', (visible) => {
        if (!visible) release();
      });
      api.restore = () => {
        hide();
        release();
        dirty = false;
        if (api.reduced) {
          back = null;
          flatToggle = true;
          api.paint();
          return;
        }
        back = spread || charge ? { t: 0, spread, charge } : null;
        api.paint();
        api.wake();
      };
    }
    function reach(f, amount, params) {
      return amount * params.spread * (0.82 + Math.sin(f.phase) * 0.12);
    }
    function turn(f, amount) {
      return [
        amount * Math.sin(f.phase) * 0.6,
        amount * Math.cos(f.phase) * 0.5,
        amount * 0.3 * Math.sin(f.phase * 0.8),
      ];
    }
    function squeeze(fraction, amount) {
      return 1 - fraction * 0.04 * (1 - amount);
    }
    function coreScale(amount) {
      return 1 - amount * 0.72;
    }
    function cardFacets() {
      const O = { x: 0, y: 0 },
        V = [0, 1, 2, 3, 4, 5].map((j) => ({
          x: 1.72 * Math.cos(Math.PI / 2 + (j * Math.PI) / 3),
          y: 1.72 * Math.sin(Math.PI / 2 + (j * Math.PI) / 3),
        })),
        mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
        tris = [];
      V.forEach((v, j) => {
        const w = V[(j + 1) % 6],
          a = mid(O, v),
          b = mid(v, w),
          c = mid(O, w);
        tris.push([O, a, c], [a, v, b], [a, b, c], [c, b, w]);
      });
      return tris.map((pts, k) => {
        const c = { x: (pts[0].x + pts[1].x + pts[2].x) / 3, y: (pts[0].y + pts[1].y + pts[2].y) / 3, z: 0 },
          z = Math.sqrt(Math.max(0, 1.72 * 1.72 - c.x * c.x - c.y * c.y));
        return { points: pts, center: c, normal: { x: c.x / 1.72, y: c.y / 1.72, z: z / 1.72 }, phase: k * 3 * 0.73 };
      });
    }
    function facing(r) {
      const a = Math.cos(r[0]),
        b = Math.sin(r[0]),
        c = Math.cos(r[1]),
        d = Math.sin(r[1]),
        e = Math.cos(r[2]),
        f = Math.sin(r[2]);
      return [c * e, -c * f, a * f + b * e * d, a * e - b * f * d];
    }
    const CARD_CORE = (1.58 * Math.sqrt(3)) / 2;
    const GL = {
      fov: 42,
      camZ: 6.08,
      rest: 0.42,
      reach: 1.55,
      depth: 0.46,
      inset: 0.955,
      push: 0.14,
      jitter: 0.027,
      rise: 1.2,
      spin: 0.252,
      tilt: 0.22,
      follow: 0.06,
      rx: 0.3,
      ry: 0.4,
      core: 0.66,
    };
    let gl = null,
      vib = 0;
    if (cardOpt.gl && window.THREE) gl = glMake();
    function glMake() {
      const T = window.THREE,
        canvas = document.createElement('canvas');
      canvas.className = 'burst-gl';
      canvas.setAttribute('aria-hidden', 'true');
      let renderer = null;
      const res = [];
      try {
        renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0, 0);
        const scene = new T.Scene(),
          camera = new T.PerspectiveCamera(GL.fov, 1, 0.1, 100);
        camera.position.set(0, 0, GL.camZ);
        scene.add(new T.HemisphereLight(0xffffff, 0x77766f, 0.9));
        const key = new T.DirectionalLight(0xffffff, 1.65);
        key.position.set(3, 4.5, 4);
        scene.add(key);
        const fill = new T.DirectionalLight(0xffffff, 0.35);
        fill.position.set(-4, -1.5, 2.5);
        scene.add(fill);
        const root = new T.Group(),
          pose = new T.Group();
        root.add(pose);
        scene.add(root);
        const ink = new T.MeshStandardMaterial({ color: 0x17181a, roughness: 0.46, metalness: 0.1 }),
          line = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 });
        res.push(ink, line);
        let seed = 261;
        const rnd = () => {
          seed = (seed + 0x6d2b79f5) | 0;
          let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const pieces = facets.map((f, k) => {
          const shape = new T.Shape(
            f.points.map((q) => new T.Vector2((q.x - f.center.x) * GL.inset, (q.y - f.center.y) * GL.inset)),
          );
          const geo = new T.ExtrudeGeometry(shape, {
            depth: GL.depth,
            bevelEnabled: true,
            bevelThickness: 0.03,
            bevelSize: 0.024,
            bevelSegments: 1,
          });
          geo.translate(0, 0, -GL.depth / 2);
          const edges = new T.EdgesGeometry(geo, 24);
          res.push(geo, edges);
          const mesh = new T.Mesh(geo, ink);
          mesh.add(new T.LineSegments(edges, line));
          pose.add(mesh);
          const len = Math.hypot(f.center.x, f.center.y) || 1,
            face = k % 3 === 2 ? -1 : 1;
          const dir = new T.Vector3((0.6 * f.center.x) / len, (0.6 * f.center.y) / len, 0.4 * face).normalize(),
            axis = new T.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
          return {
            mesh,
            cx: f.center.x,
            cy: f.center.y,
            dir,
            axis,
            speed: (rnd() - 0.5) * 0.8,
            delay: 0.25 * rnd(),
            shape: k % 3,
          };
        });
        const accent = (getComputedStyle(element).getPropertyValue('--accent') || '').trim() || '#4559ff';
        const coreGeo = new T.IcosahedronGeometry(GL.core, 0),
          coreMat = new T.MeshStandardMaterial({
            color: new T.Color(accent).multiplyScalar(0.5),
            emissive: accent,
            emissiveIntensity: 0.2,
            roughness: 0.7,
            metalness: 0,
            flatShading: true,
          });
        res.push(coreGeo, coreMat);
        const core = new T.Mesh(coreGeo, coreMat);
        core.scale.z = 0.34;
        pose.add(core);
        element.insertBefore(canvas, element.firstChild);
        const g = {
          on: true,
          T,
          renderer,
          scene,
          camera,
          root,
          pose,
          pieces,
          core,
          coreMat,
          canvas,
          res,
          rx: GL.rx,
          ry: GL.ry,
          spin: GL.ry,
          mx: 0,
          my: 0,
          phase: 0,
        };
        api.listen(element, 'pointermove', (e) => {
          const r = element.getBoundingClientRect();
          g.mx = R.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
          g.my = R.clamp(1 - ((e.clientY - r.top) / r.height) * 2, -1, 1);
        });
        api.listen(element, 'pointerleave', () => {
          g.mx = g.my = 0;
        });
        api.listen(canvas, 'webglcontextlost', (e) => {
          e.preventDefault();
          g.on = false;
          glShow();
          cardLayout();
          api.paint();
        });
        api.listen(canvas, 'webglcontextrestored', () => {
          g.on = true;
          glShow();
          cardLayout();
          api.paint();
          api.wake();
        });
        return g;
      } catch (error) {
        res.forEach((r) => {
          try {
            r.dispose();
          } catch (e) {}
        });
        if (renderer) {
          renderer.dispose();
          renderer.forceContextLoss();
        }
        if (canvas.parentNode) canvas.remove();
        return null;
      }
    }
    function glShow() {
      const on = !!(gl && gl.on),
        svg = board.querySelector('svg');
      gl.canvas.hidden = !on;
      if (svg) svg.style.visibility = on ? 'hidden' : '';
      if (cardCore) cardCore.style.visibility = on ? 'hidden' : '';
      element.dataset.renderer = on ? 'webgl' : 'svg';
    }
    if (gl) glShow();
    function glLayout(w, h, fx, fy, fr) {
      const g = gl;
      g.renderer.setSize(w, h, false);
      g.camera.aspect = w / h;
      g.camera.setViewOffset(w, h, w / 2 - fx, h / 2 - fy, w, h);
      g.camera.updateProjectionMatrix();
      const px = h / (2 * Math.tan(((GL.fov / 2) * Math.PI) / 180) * GL.camZ),
        rest = Math.max(1, fr) * GL.rest;
      g.root.scale.setScalar(rest / (1.72 * px));
      cardUnit = rest / 1.72;
    }
    function glDraw(fraction, params, reduced, dt) {
      const g = gl,
        a = 1 - Math.pow(1 - GL.follow, dt * 60);
      if (!reduced) {
        g.spin += GL.spin * dt;
        g.phase += 66 * dt;
        g.rx += (GL.rx + GL.tilt * g.my - g.rx) * a;
        g.ry += (g.spin + GL.tilt * g.mx - g.ry) * a;
      }
      g.pose.rotation.set(g.rx, g.ry, 0);
      const D = params.spread * GL.reach,
        hold = fraction * fraction * (1 - spread),
        pre = GL.push * hold,
        amp = GL.jitter * vib * (1 - spread) * (0.3 + 1.1 * fraction * fraction);
      g.pieces.forEach((p) => {
        const t = Math.max(0, spread - p.delay),
          n = D * t + pre,
          r = p.speed * t * Math.PI;
        p.mesh.position.set(
          p.cx + p.dir.x * n + Math.sin(g.phase + 20 * p.delay) * amp,
          p.cy + p.dir.y * n + Math.cos(1.3 * g.phase + 2 * p.shape) * amp,
          p.dir.z * n,
        );
        p.mesh.rotation.set(p.axis.x * r, p.axis.y * r, p.axis.z * r);
      });
      g.core.scale.set(1 + 0.2 * hold, 1 + 0.2 * hold, 0.34);
      g.coreMat.emissiveIntensity = 0.2 + 0.6 * Math.max(hold, spread * 0.5);
      g.renderer.render(g.scene, g.camera);
    }
    function cardLayout() {
      const w = board.clientWidth,
        h = board.clientHeight,
        p = api.params;
      cardCX = w / 2;
      cardCY = h / 2;
      let extent = 1.72;
      for (let k = 1; k <= 20; k++)
        facets.forEach((f) => {
          const s = k / 20,
            d = reach(f, s, p),
            m = facing(turn(f, s)),
            x = f.center.x + f.normal.x * d,
            y = f.center.y + f.normal.y * d;
          f.points.forEach((q) => {
            const u = q.x - f.center.x,
              v = q.y - f.center.y;
            extent = Math.max(extent, Math.hypot(x + m[0] * u + m[1] * v, y + m[2] * u + m[3] * v));
          });
        });
      cardUnit = Math.max(1, Math.min(w, h) / 2 - PAD) / extent;
      if (cardOpt.layout) {
        const f = cardOpt.layout(w, h);
        cardCX = f.x;
        cardCY = f.y;
        cardUnit = Math.max(1, f.r) / extent;
        if (cardCore) {
          cardCore.style.left = f.x.toFixed(2) + 'px';
          cardCore.style.top = f.y.toFixed(2) + 'px';
        }
        if (gl && gl.on) glLayout(w, h, f.x, f.y, f.r);
      }
      cardPieces.forEach((el, k) => {
        const f = facets[k];
        if (f)
          el.setAttribute(
            'points',
            f.points
              .map((q) => ((q.x - f.center.x) * cardUnit).toFixed(2) + ',' + ((f.center.y - q.y) * cardUnit).toFixed(2))
              .join(' '),
          );
      });
      const dot = cardCore && (cardCore.firstElementChild || cardCore);
      cardCoreBase = (dot && dot.offsetWidth) || 24;
      cardDrawn = [];
      if (chargeRing) {
        const r = (1.72 * 1.14 * cardUnit).toFixed(2);
        [chargeRing, chargeTrack].forEach((c) => {
          c.setAttribute('cx', cardCX.toFixed(2));
          c.setAttribute('cy', cardCY.toFixed(2));
          c.setAttribute('r', r);
        });
      }
    }
    function cardPressing(time) {
      return held;
    }
    function cardDraw(time, fraction, params, reduced) {
      const shrink = squeeze(fraction, spread),
        s = shrink * cardUnit;
      facets.forEach((f, k) => {
        const el = cardPieces[k];
        if (!el) return;
        const d = reach(f, spread, params),
          m = facing(turn(f, spread)),
          x = f.center.x + f.normal.x * d,
          y = f.center.y + f.normal.y * d;
        const t =
          'matrix(' +
          (shrink * m[0]).toFixed(4) +
          ' ' +
          (-shrink * m[2]).toFixed(4) +
          ' ' +
          (-shrink * m[1]).toFixed(4) +
          ' ' +
          (shrink * m[3]).toFixed(4) +
          ' ' +
          (cardCX + s * x).toFixed(2) +
          ' ' +
          (cardCY - s * y).toFixed(2) +
          ')';
        if (cardDrawn[k] !== t) {
          el.setAttribute('transform', t);
          cardDrawn[k] = t;
        }
      });
      if (cardCore) {
        const c = 'scale(' + ((2 * s * CARD_CORE * coreScale(spread)) / cardCoreBase).toFixed(4) + ')';
        if (cardDrawn.core !== c) {
          cardCore.style.transform = c;
          cardDrawn.core = c;
        }
      }
    }
    api.frame(({ dt, time, params, reduced }) => {
      const pressing = cardPressing(time);
      if (reduced) {
        spread = flatToggle ? 1 : 0;
        charge = flatToggle ? params.holdSeconds : 0;
      } else if (gl && gl.on) {
        if (pressing) {
          charge += dt;
          vib = charge < params.holdSeconds ? 1 : vib * Math.pow(0.88, dt * 60);
          if (charge >= params.holdSeconds) spread = Math.min(1, spread + GL.rise * dt);
        } else {
          charge = Math.max(0, charge - dt * 3);
          vib = Math.max(0, vib - 4.8 * dt);
          spread = Math.max(0, spread - dt / params.returnSeconds);
        }
      } else {
        charge = pressing ? charge + dt : Math.max(0, charge - dt * 3);
        const target = pressing && charge >= params.holdSeconds ? 1 : 0;
        spread = R.damp(spread, target, target ? 5 : 4.4 / params.returnSeconds, dt);
        if (spread < 0.0003) spread = 0;
      }
      if (back) stepBack(dt);
      if (held && cardOpt && true && cardOpt.touched && charge >= params.holdSeconds) {
        cardOpt.touched();
        dirty = true;
      }
      if (dirty && !held && !back && !spread && !charge) {
        dirty = false;
        if (cardOpt.settled) cardOpt.settled();
      }
      const fraction = R.clamp(charge / params.holdSeconds, 0, 1),
        phase = reduced
          ? flatToggle
            ? 'expanded'
            : 'idle'
          : pressing
            ? charge < params.holdSeconds
              ? 'charging'
              : spread < 0.96
                ? 'dispersing'
                : 'expanded'
            : spread > 0.002
              ? 'returning'
              : 'idle';
      element.dataset.phase = phase;
      element.dataset.spread = spread.toFixed(4);
      if (gl && gl.on) {
        lastPhase = phase;
        glDraw(fraction, params, reduced, dt);
        return !reduced;
      }
      {
        lastPhase = phase;
        cardDraw(time, fraction, params, reduced);
        return !(!held && !back && !spread && !charge);
      }
    });
    cardLayout();
    api.paint();
    api.on('destroy', () => {
      release();
      cardPieces = [];
      cardCore = null;
      cardDrawn = [];
      if (gl) {
        gl.res.forEach((r) => {
          try {
            r.dispose();
          } catch (e) {}
        });
        gl.renderer.dispose();
        gl.renderer.forceContextLoss();
        gl.res = [];
        gl.on = false;
      }
    });
    const status = api.status;
    api.status = () => ({
      ...status(),
      held,
      charge,
      spread,
      phase: lastPhase,
      fragments: facets.length,
      renderer: gl && gl.on ? 'webgl' : 'svg',
      resources: gl && !api.destroyed ? gl.res.length : 0,
    });
    return api;
  }

  // One effect, two renderers: the 3D WebGL version when it can start, otherwise (no THREE, no WebGL, or a lost
  // context later) the flat SVG hexagon. The returned api (params, setParams, restore, pause, reduced motion, destroy)
  // stays the same object whichever renderer runs.
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const shards = (n) =>
      '<svg class="ck-shards" aria-hidden="true">' + '<polygon class="ck-shard"/>'.repeat(n) + '</svg>';
    let engine = null;
    function flat() {
      element.textContent = '';
      const layout = (W, H) => {
        const r = Math.min(W, H) / 2 - 12;
        element.style.setProperty('--fx-k', (r / 126).toFixed(4));
        return { x: W / 2, y: H / 2, r };
      };
      const m = mountFlat(element, {
        params: api.params,
        card: {
          interactive: true,
          layout,
          shards,
          core: () => '<span class="ck-dot" data-size="lg" data-accent></span>',
        },
      });
      if (api.paused) m.setPaused(true);
      return m;
    }
    engine =
      window.BurstWow &&
      window.BurstWow.mount(element, {
        lost: () => {
          engine = flat();
        },
      });
    if (!engine) engine = flat();
    else engine.setParams(api.params);
    api.on('params', (p) => engine.setParams(p));
    api.on('pause', (paused) => {
      if (engine.setPaused) engine.setPaused(paused);
    });
    api.on('motion', (reduced) => {
      if (engine.setReduced) engine.setReduced(reduced);
    });
    api.restore = () => engine.restore();
    api.on('destroy', () => engine.destroy());
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountHoldToBurst(element, options) {
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
    element.classList.add('hold-to-burst');
    element.innerHTML =
      '<div class="fx-board" data-burst-board role="button" tabindex="0" aria-label="Hold to burst, release to reassemble. Space or Enter also works."></div>';
    const board = element.querySelector('[data-burst-board]');
    const inst = mount(board, { params: options.params });
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
  global.mountHoldToBurst = mountHoldToBurst;
  if (typeof module === 'object' && module.exports) module.exports = mountHoldToBurst;
})(typeof window !== 'undefined' ? window : this);
