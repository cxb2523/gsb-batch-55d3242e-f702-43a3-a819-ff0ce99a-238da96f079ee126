/*
 * Torn Cursor Ink
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A white sheet that the pointer tears through: a ragged blob of dark ink made of tiny monospace characters follows
 * the cursor and leaves a short shrinking trail. Good as a cursor treatment on a hero, a notes / archive section or
 * any calm surface that should feel tactile.
 *
 * How it moves
 * - Head: a point chases the pointer by half-life: every params.lag ms the remaining gap halves, so each frame it
 *   closes 1 - 2^(-dt / lag) of it, independent of frame rate (40 = tight, 200 = floaty).
 * - Trail: a new mark is dropped at the head when it has moved at least traceStep x size and 25 ms have passed since
 *   the last mark. Each mark keeps its direction of travel. Marks live params.traceLife ms; with age a = 0..1 they
 *   weigh w = cos(a x PI / 2) (full when laid, falling fastest at the end) and their radius is
 *   size x 0.64 x (0.5 + 0.5 w). At most params.traceMarks marks (cap 21, plus the head).
 * - Shape: every mark is a ragged disc: a ring of 3 to 6 random knots (eased between them) pushes its radius by up
 *   to 21%, and it is stretched 18% along its direction of travel. Marks are welded with a smooth maximum (weld radius
 *   0.4 head radii), so the trail reads as one torn strip. Radii are in units of the sheet height: size 8 = 8% of
 *   the sheet height (drawn 6% fuller).
 * - Tear: gradient noise (4 rotated octaves plus a ridged crease layer, frequency params.tearScale, flowing diagonally
 *   at params.drift per second) is added to the merged shape near its outline, with amplitude 0.11 x tear / 100. That
 *   noise is fixed to the sheet and is what rips the edge and throws off loose scraps.
 * - Texture: the ink is drawn on a grid of params.cell px cells (times devicePixelRatio, capped at 2). Each cell shows
 *   one of " .:-=+*#%@" in white on ink #17181a; which character depends on a second noise field (drifting slowly, a little denser towards the bottom and
 *   the centre), so the inside looks like ASCII shading. Characters get a little per-pixel grain and dim close to the
 *   rim, like the shadow of the paper lip.
 * - Fade: cells switch off by a per-cell random threshold against weight x alpha, rim cells first, so old marks and
 *   the whole blob crumble from the edge inwards rather than fading. alpha eases to 1 when the pointer is over the sheet and to 0 when
 *   it leaves, half-life 0.18 s.
 * - Rendering: one WebGL fragment shader over the sheet (one quad). Without WebGL a canvas 2D fallback draws the same shape in
 *   3 px solid ink squares (no characters).
 * - Touch: the ink appears only while a finger is pressed and dragging (pointer capture); lifting fades it.
 *
 * Options
 *   params.size        2..20, default 8        head radius in % of sheet height
 *   params.lag         5..200 ms, default 40   head follow half-life
 *   params.tear        0..200, default 70      how ragged the edge is; 0 = clean blobs
 *   params.tearScale   1..12, default 3.4      noise frequency; higher = finer rips
 *   params.drift       0..2, default 0.35      how fast the rip pattern crawls (per second)
 *   params.traceLife   100..2000 ms, default 450   trail lifetime
 *   params.traceMarks  0..21, default 20       trail length cap; 0 = head only
 *   params.traceStep   0.05..1, default 0.3    spacing between marks, in head radii
 *   params.cell        3..12 px, default 4     character cell size
 *   reducedMotion      true / false / null     force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountTornCursorInk(element, {params: {...}, reducedMotion: null});
 *   fx.params                 copy of current params
 *   fx.setParams({tear: 120}) change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)  freeze / resume
 *   fx.reset()                params back to defaults, ink fades out quickly (0.08 s half-life)
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()              removes listeners, observers and releases the WebGL context
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountTornCursorInk(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The sheet box: place() in mountTornCursorInk insets it 40 px from every edge of the element (20 px under 600 px
 *   wide), so it is centred.
 * - The sheet label ("Field notes"), its colours, radius and shadow in effect.css.
 * - Ink and character colours: the BASE and TINT constants (0..1 RGB). The character ramp INK.chars (dark to dense), but
 *   keep the first one a space.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The noise-added-to-the-field approach for the tear. A blurred circle or a CSS mask looks soft, not torn.
 * - The dithered per-cell fade; replacing it with opacity makes the trail look like smoke.
 * - The 25 ms / traceStep spacing rule and the quarter-cosine weight on mark age; they keep the trail evenly spaced at
 *   any speed and let old marks crumble late and fast.
 * - SLOTS = 22 (head plus 21 marks) is baked into the shader loop; raising it costs fill rate on large sheets.
 * - Do not let a framework re-render the sheet or the canvas; the effect owns them.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the rAF loop, listeners and the WebGL context leak. In React StrictMode the mount runs
 *   twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountTornCursorInk on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The canvas are aria-hidden; nothing is focusable and there is no keyboard control. The effect is
 *   decorative; keep real content outside it.
 * - With reduced motion: and no animation loop. the ink sits exactly under the pointer with no trail, no lag and no fade, and disappears
 *   when the pointer leaves.
 * - The loop sleeps once the ink has fully faded, and stops when the tab is hidden, the element is off screen or it is
 *   paused.
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
    { key: 'size', type: 'range', default: 8, min: 2, max: 20, step: 0.5 },
    { key: 'lag', type: 'range', default: 40, min: 5, max: 200, step: 5 },
    { key: 'tear', type: 'range', default: 70, min: 0, max: 200, step: 5 },
    { key: 'tearScale', type: 'range', default: 3.4, min: 1, max: 12, step: 0.1 },
    { key: 'drift', type: 'range', default: 0.35, min: 0, max: 2, step: 0.05 },
    { key: 'traceLife', type: 'range', default: 450, min: 100, max: 2000, step: 50 },
    { key: 'traceMarks', type: 'range', default: 20, min: 0, max: 21, step: 1 },
    { key: 'traceStep', type: 'range', default: 0.3, min: 0.05, max: 1, step: 0.01 },
    { key: 'cell', type: 'range', default: 4, min: 3, max: 12, step: 1 },
  ];

  // ---- the effect ----
  const SLOTS = 22;
  const PACE = { presence: 0.18, restore: 0.08, minGap: 25, markScale: 0.64, smallest: 0.5 };
  const INK = { chars: ' .:-=+*#%@', weight: 600 };
  const LOOK = {
    rip: 0.11,
    jag: 0.21,
    lengthen: 1.18,
    body: 1.06,
    weld: 0.4,
    lip: 0.2,
    speck: 0.26,
    headSeed: 0.37,
    headKnots: 5,
  };
  const BASE = [23 / 255, 24 / 255, 26 / 255],
    TINT = [0.96, 0.96, 0.95];
  const VERT =
    'attribute vec2 aCorner;varying vec2 vSheet;void main(){vSheet=aCorner*.5+.5;gl_Position=vec4(aCorner,0.,1.);}';
  const FRAG = `precision highp float;
varying vec2 vSheet;
uniform vec4 uMark[${SLOTS}];  // x, y (sheet uv, y up), radius (sheet heights), life 0..1
uniform vec4 uHead[${SLOTS}];  // cos, sin of the heading, seed 0..1, knot count
uniform vec3 uView;          // aspect, one device pixel in sheet heights, seconds
uniform vec4 uRip;           // amplitude, frequency, flow speed, radius jitter
uniform vec3 uShape;         // lengthwise squeeze, weld radius, rim-shadow width
uniform vec3 uGrid;          // cell px, glyph count, overall strength
uniform vec2 uRes;
uniform vec3 uBase,uTint;
uniform float uSpeck;
uniform sampler2D uGlyphs;
float h12(vec2 p){vec3 q=fract(p.xyx*vec3(.1239,.1587,.1871));q+=dot(q,q.zyx+41.27);return fract((q.x+q.z)*q.y);}
vec2 spoke(vec2 c){float a=h12(c)*6.2831853;return vec2(cos(a),sin(a));}
// gradient noise: the four corner ramps go into one vec4, then two eased blends
float gnoise(vec2 p){
 vec2 c=floor(p),f=p-c,u=f*f*f*(f*(f*6.-15.)+10.);const vec2 X=vec2(1.,0.);
 vec4 r=vec4(dot(spoke(c),f),dot(spoke(c+X),f-X),dot(spoke(c+X.yx),f-X.yx),dot(spoke(c+X.xx),f-X.xx));
 vec2 row=mix(r.xz,r.yw,u.x);return mix(row.x,row.y,u.y);}
const mat2 TURN=mat2(.8,.6,-.6,.8);
// up to four octaves, each turned and roughly doubled; octaves past n are weighted to zero
float layered(vec2 p,float n){float s=0.;vec2 q=p;for(int i=0;i<4;i++){s+=gnoise(q)*.55*exp2(-float(i))*step(float(i)+.5,n);q=TURN*q*2.13+vec2(5.2,1.3);}return s;}
float rip(vec2 p){
 float crease=1.-abs(gnoise(p*2.9+vec2(17.,-3.)));
 return layered(p,4.)*1.6+(crease*crease-.6)*.35;}
float smax(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return max(a,b)+h*h*k*.25;}
float ragged(vec2 q,vec4 m,vec4 o){
 vec2 d=q-vec2(m.x*uView.x,m.y);
 float far=m.z*(1.+uRip.w)+uShape.y*m.z+uRip.x*1.3;
 if(dot(d,d)>far*far)return -far;
 vec2 e=vec2(o.x*d.x+o.y*d.y,o.x*d.y-o.y*d.x);e.x*=uShape.x;
 float a=(atan(e.y,e.x)/6.2831853+.5)*o.w,k=floor(a),t=fract(a);t=t*t*(3.-2.*t);
 float s=o.z*97.31,j=mix(h12(vec2(mod(k,o.w)*17.17+3.3,s)),h12(vec2(mod(k+1.,o.w)*17.17+3.3,s)),t);
 return m.z*(1.+uRip.w*(j*2.-1.))-length(e);}
float ground(vec2 uv){
 vec2 p=vec2(uv.x*uView.x,uv.y);float t=uView.z;
 float d=.6+layered(p*2.4+vec2(t*.55,-t*.3),3.)*.55+(.5-uv.y)*.3;
 d+=.1*(.45-length(p-vec2(.5*uView.x,.5)));
 return clamp(d,0.,.999);}
void main(){
 vec2 q=vec2(vSheet.x*uView.x,vSheet.y);
 float f=-1.,w=0.,r0=uMark[0].z;
 for(int i=0;i<${SLOTS};i++){
  vec4 m=uMark[i];if(m.z<=0.)continue;
  float fi=ragged(q,m,uHead[i]);
  f=i==0?fi:smax(f,fi,uShape.y*r0);
  w=max(w,m.w*clamp(fi/(m.z*.5)+1.,0.,1.));
 }
 float px=uView.y;
 if(f<-uRip.x*1.3-px){gl_FragColor=vec4(0.);return;}
 if(f<uRip.x*1.3)f+=rip(q*uRip.y+vec2(.6,.8)*uView.z*uRip.z)*uRip.x;
 float cover=clamp(f/px*.5+.5,0.,1.);
 vec2 cell=floor(gl_FragCoord.xy/uGrid.x);
 float live=w*uGrid.z,lipW=uShape.z*r0;
 float gate=live-(1.-live)*.5*(1.-clamp(f/(lipW*2.),0.,1.));
 if(h12(cell+vec2(3.7,8.1))>=gate)cover=0.;
 if(cover<=.002){gl_FragColor=vec4(0.);return;}
 float dens=ground((cell+.5)*uGrid.x/uRes);
 float gi=min(floor(dens*uGrid.y),uGrid.y-1.);
 vec2 inCell=fract(gl_FragCoord.xy/uGrid.x);
 float g=texture2D(uGlyphs,vec2((gi+inCell.x)/uGrid.y,1.-inCell.y)).a;
 float shade=mix(.35,1.,smoothstep(0.,lipW,f));
 float sp=h12(gl_FragCoord.xy+floor(uView.z*30.)*vec2(7.31,3.17))-.5;
 vec3 tint=clamp(uTint*shade+sp*uSpeck,0.,1.);
 gl_FragColor=vec4(mix(uBase,tint,g),cover);}`;
  const fr = (x) => x - Math.floor(x),
    TAU = Math.PI * 2;
  function h12(x, y) {
    let a = fr(x * 0.1239),
      b = fr(y * 0.1587),
      c = fr(x * 0.1871);
    const s = a * (c + 41.27) + b * (b + 41.27) + c * (a + 41.27);
    a += s;
    b += s;
    c += s;
    return fr((a + c) * b);
  }
  function gnoise(x, y) {
    const cx = Math.floor(x),
      cy = Math.floor(y),
      fx = x - cx,
      fy = y - cy,
      ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10),
      uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const g = (i, j, dx, dy) => {
      const a = h12(cx + i, cy + j) * TAU;
      return Math.cos(a) * dx + Math.sin(a) * dy;
    };
    const a = g(0, 0, fx, fy),
      b = g(1, 0, fx - 1, fy),
      d = g(0, 1, fx, fy - 1),
      e = g(1, 1, fx - 1, fy - 1),
      lo = a + (b - a) * ux,
      hi = d + (e - d) * ux;
    return lo + (hi - lo) * uy;
  }
  function layered(x, y, n) {
    let s = 0,
      g = 0.55;
    for (let i = 0; i < n; i++) {
      s += g * gnoise(x, y);
      const nx = (0.8 * x - 0.6 * y) * 2.13 + 5.2,
        ny = (0.6 * x + 0.8 * y) * 2.13 + 1.3;
      x = nx;
      y = ny;
      g *= 0.5;
    }
    return s;
  }
  function rip(x, y) {
    const c = 1 - Math.abs(gnoise(x * 2.9 + 17, y * 2.9 - 3));
    return layered(x, y, 4) * 1.6 + (c * c - 0.6) * 0.35;
  }
  function smax(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  }
  function ragged(dx, dy, r, c, s, seed, knots, rip0) {
    const far = r * (1 + LOOK.jag) + LOOK.weld * r + rip0 * 1.3;
    if (dx * dx + dy * dy > far * far) return -far;
    const ex = (c * dx + s * dy) / LOOK.lengthen,
      ey = c * dy - s * dx,
      a = (Math.atan2(ey, ex) / TAU + 0.5) * knots,
      k = Math.floor(a);
    let t = a - k;
    t = t * t * (3 - 2 * t);
    const sd = seed * 97.31,
      j0 = h12((((k % knots) + knots) % knots) * 17.17 + 3.3, sd),
      j1 = h12(((((k + 1) % knots) + knots) % knots) * 17.17 + 3.3, sd);
    return r * (1 + LOOK.jag * ((j0 + (j1 - j0) * t) * 2 - 1)) - Math.hypot(ex, ey);
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const cardOpt = options.card || null;
    element.classList.add('ink-stage');
    element.innerHTML =
      '<div class="ck-panel ink-sheet ink-fill" data-size="lg"><div class="ink-face"><span class="ck-text" data-strong>Field notes</span><span class="ck-dot" data-accent aria-hidden="true"></span></div><canvas class="ink-gl" aria-hidden="true"></canvas></div>';
    const sheet = element.querySelector('.ink-sheet');
    let canvas = element.querySelector('.ink-gl');
    const phased = !!cardOpt.startup;
    const glyphs = INK.chars.length;
    let gl = null,
      loc = null,
      ctx = null,
      lose = null,
      tex = null,
      atlasPx = 0;
    let program = null,
      parts = [],
      quad = null,
      parallel = null,
      rendererReady = false,
      contextLost = false;
    if (document.fonts)
      document.fonts.load(INK.weight + ' 16px "Geist"').then(
        () => {
          atlasPx = 0;
          if (!api.destroyed) {
            api.invalidatePreparation();
            api.paint();
          }
        },
        () => {},
      );
    function glyphStrip(G) {
      if (G === atlasPx) return;
      atlasPx = G;
      const c = document.createElement('canvas');
      c.width = G * glyphs;
      c.height = G;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = INK.weight + ' ' + Math.max(3, Math.round(G * 0.78)) + 'px "Geist", "Inter", system-ui, sans-serif';
      for (let i = 0; i < glyphs; i++) x.fillText(INK.chars[i], (i + 0.5) * G, G * 0.54);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      for (const [k, v] of [
        [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
        [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
        [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      ])
        gl.texParameteri(gl.TEXTURE_2D, k, v);
    }
    function acquireGL() {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
      if (gl) {
        lose = gl.getExtension('WEBGL_lose_context');
        parallel = phased ? gl.getExtension('KHR_parallel_shader_compile') : null;
        const ownCanvas = canvas;
        api.listen(ownCanvas, 'webglcontextlost', (event) => {
          if (ownCanvas !== canvas || api.destroyed) return;
          event.preventDefault();
          contextLost = true;
          api.invalidatePreparation();
          if (!api.preparing) {
            try {
              fallback2D();
              api.paint();
              api.wake();
            } catch (error) {
              api.destroy();
            }
          }
        });
      }
    }
    function submitProgram() {
      if (contextLost) throw new Error('Ink WebGL context lost during preparation');
      program = gl.createProgram();
      parts = [
        [gl.VERTEX_SHADER, VERT],
        [gl.FRAGMENT_SHADER, FRAG],
      ].map(([kind, text]) => {
        const sh = gl.createShader(kind);
        gl.shaderSource(sh, text);
        gl.compileShader(sh);
        gl.attachShader(program, sh);
        return sh;
      });
      gl.linkProgram(program);
    }
    function linkReady() {
      if (contextLost) throw new Error('Ink WebGL context lost during preparation');
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(parts.map((sh) => gl.getShaderInfoLog(sh)).join('\n') + gl.getProgramInfoLog(program));
    }
    function bindRenderer() {
      if (contextLost) throw new Error('Ink WebGL context lost during preparation');
      gl.useProgram(program);
      loc = {};
      for (const n of [
        'uMark',
        'uHead',
        'uView',
        'uRip',
        'uShape',
        'uGrid',
        'uRes',
        'uBase',
        'uTint',
        'uSpeck',
        'uGlyphs',
      ])
        loc[n] = gl.getUniformLocation(program, n);
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, Float32Array.of(-1, -1, 1, -1, -1, 1, 1, 1), gl.STATIC_DRAW);
      const corner = gl.getAttribLocation(program, 'aCorner');
      gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 8, 0);
      gl.enableVertexAttribArray(corner);
      tex = gl.createTexture();
      if (!quad || !tex) throw new Error('Ink WebGL allocation failed');
      gl.disable(gl.BLEND);
      rendererReady = true;
    }
    function releaseGL() {
      const old = gl;
      gl = null;
      rendererReady = false;
      if (old)
        try {
          if (tex) old.deleteTexture(tex);
          if (quad) old.deleteBuffer(quad);
          parts.forEach((sh) => old.deleteShader(sh));
          if (program) old.deleteProgram(program);
          if (lose) lose.loseContext();
        } catch (_) {}
      tex = quad = program = loc = lose = parallel = null;
      parts = [];
      atlasPx = 0;
    }
    function fallback2D() {
      releaseGL();
      const replacement = document.createElement('canvas');
      replacement.className = 'ink-gl';
      replacement.setAttribute('aria-hidden', 'true');
      canvas.replaceWith(replacement);
      canvas = replacement;
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Ink renderer unavailable');
      contextLost = false;
      rendererReady = true;
    }
    if (!phased) {
      try {
        acquireGL();
        if (gl) {
          submitProgram();
          linkReady();
          bindRenderer();
        } else fallback2D();
      } catch (error) {
        fallback2D();
      }
    }
    async function prepareRenderer(phase) {
      if (rendererReady) return;
      try {
        await phase(acquireGL, 'ink-context');
        if (!gl) {
          await phase(fallback2D, 'ink-fallback');
          return;
        }
        await phase(submitProgram, 'ink-shader-submit');
        if (parallel) {
          let done = false;
          while (!done)
            done = await phase(() => {
              if (contextLost) throw new Error('Ink WebGL context lost during preparation');
              return gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR);
            }, 'ink-shader-poll');
        }
        await phase(linkReady, 'ink-shader-status');
        await phase(bindRenderer, 'ink-bind-renderer');
      } catch (error) {
        if (api.destroyed || cardOpt.startup.signal.aborted || error.name === 'AbortError') throw error;
        await phase(fallback2D, 'ink-fallback');
      }
    }
    api.cleanup(releaseGL);
    let dpr = 1;
    function fit() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = (v) => Math.max(2, Math.round(v * dpr)),
        cw = px(sheet.clientWidth),
        ch = px(sheet.clientHeight);
      if (cw !== canvas.width) canvas.width = cw;
      if (ch !== canvas.height) canvas.height = ch;
    }
    const fresh = () => ({
      pointer: { x: 0.5, y: 0.5 },
      head: { x: 0.5, y: 0.5 },
      placed: false,
      show: 0,
      want: 0,
      half: PACE.presence,
      dir: 0,
      marks: [],
      clock: 0,
      dropped: -1e9,
      restoring: false,
      touch: false,
    });
    const S = fresh();
    const toward = (dt, h) => 1 - Math.pow(2, -dt / Math.max(h, 0.001));
    const trailCap = (p) => Math.round(Math.min(SLOTS - 1, Math.max(0, p.traceMarks)));
    function dropMark(now) {
      const last = S.marks[0];
      if (last) S.dir = Math.atan2(S.head.y - last.y, S.head.x - last.x);
      S.marks.unshift({ x: S.head.x, y: S.head.y, born: now, dir: S.dir, seed: Math.random() });
      S.dropped = now;
    }
    function advance(dt) {
      const p = api.params;
      S.clock += dt;
      const now = S.clock * 1000,
        f = toward(dt, p.lag / 1000);
      S.head.x += (S.pointer.x - S.head.x) * f;
      S.head.y += (S.pointer.y - S.head.y) * f;
      S.show += (S.want - S.show) * toward(dt, S.half);
      const cap = trailCap(p);
      if (cap && S.show > 0.01) {
        const last = S.marks[0],
          spacing = (p.size / 100) * Math.max(0.02, p.traceStep);
        const travelled = !last || Math.hypot(S.head.x - last.x, S.head.y - last.y) >= spacing;
        if (travelled && now - S.dropped >= PACE.minGap) dropMark(now);
      }
      const life = Math.max(50, p.traceLife);
      while (S.marks.length > cap || (S.marks.length && now - S.marks[S.marks.length - 1].born >= life)) S.marks.pop();
    }
    const weightAt = (age) => Math.cos((Math.min(1, Math.max(0, age)) * Math.PI) / 2);
    const slotMark = new Float32Array(SLOTS * 4),
      slotHead = new Float32Array(SLOTS * 4);
    function upload(st) {
      const p = api.params,
        r = (p.size / 100) * LOOK.body,
        life = Math.max(50, p.traceLife),
        now = st.clock * 1000;
      slotMark.fill(0);
      slotHead.fill(0);
      slotMark.set([st.head.x, st.head.y, r, 1], 0);
      slotHead.set([Math.cos(st.dir), Math.sin(st.dir), LOOK.headSeed, LOOK.headKnots], 0);
      st.marks.slice(0, SLOTS - 1).forEach((m, i) => {
        const w = weightAt((now - m.born) / life),
          scale = PACE.markScale * (PACE.smallest + (1 - PACE.smallest) * w),
          at = (i + 1) * 4;
        slotMark.set([m.x, m.y, r * scale, w], at);
        slotHead.set([Math.cos(m.dir), Math.sin(m.dir), m.seed, 3 + Math.floor(m.seed * 3.999)], at);
      });
    }
    function render(st) {
      if (!rendererReady || contextLost) throw new Error('Ink renderer is not ready');
      fit();
      const p = api.params,
        W = canvas.width,
        H = canvas.height,
        asp = W / H,
        amp = (LOOK.rip * p.tear) / 100,
        size = (p.size / 100) * LOOK.body;
      upload(st);
      if (gl) {
        const cpx = Math.max(3, Math.round(p.cell * dpr));
        glyphStrip(cpx);
        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (st.show <= 0.002) return;
        gl.uniform4fv(loc.uMark, slotMark);
        gl.uniform4fv(loc.uHead, slotHead);
        gl.uniform3f(loc.uView, asp, 1 / H, st.clock);
        gl.uniform4f(loc.uRip, amp, p.tearScale, p.drift, LOOK.jag);
        gl.uniform3f(loc.uShape, 1 / LOOK.lengthen, LOOK.weld, LOOK.lip);
        gl.uniform3f(loc.uGrid, cpx, glyphs, st.show);
        gl.uniform2f(loc.uRes, W, H);
        gl.uniform3fv(loc.uBase, BASE);
        gl.uniform3fv(loc.uTint, TINT);
        gl.uniform1f(loc.uSpeck, LOOK.speck);
        gl.uniform1i(loc.uGlyphs, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return;
      }
      ctx.clearRect(0, 0, W, H);
      if (st.show <= 0.002) return;
      ctx.fillStyle = 'rgb(23,24,26)';
      const cs = Math.max(2, Math.round(3 * dpr)),
        cc = Math.max(3, p.cell * dpr),
        n = Math.min(SLOTS, st.marks.length + 1),
        flow = st.clock * p.drift,
        lipW = LOOK.lip * size;
      for (let y = 0; y < H; y += cs)
        for (let x = 0; x < W; x += cs) {
          const qx = (x + cs / 2) / H,
            qy = 1 - (y + cs / 2) / H;
          let f = -1,
            w = 0;
          for (let i = 0; i < n; i++) {
            const o = i * 4;
            if (slotMark[o + 2] <= 0) continue;
            const fi = ragged(
              qx - slotMark[o] * asp,
              qy - slotMark[o + 1],
              slotMark[o + 2],
              slotHead[o],
              slotHead[o + 1],
              slotHead[o + 2],
              slotHead[o + 3],
              amp,
            );
            f = i === 0 ? fi : smax(f, fi, LOOK.weld * size);
            w = Math.max(w, slotMark[o + 3] * Math.max(0, Math.min(1, fi / (slotMark[o + 2] * 0.5) + 1)));
          }
          if (f < -amp * 1.3) continue;
          if (f < amp * 1.3) f += rip(qx * p.tearScale + 0.6 * flow, qy * p.tearScale + 0.8 * flow) * amp;
          if (f <= 0) continue;
          const lv = w * st.show,
            gate = lv - (1 - lv) * 0.5 * (1 - Math.max(0, Math.min(1, f / (lipW * 2))));
          if (h12(Math.floor(x / cc) + 3.7, Math.floor((H - y) / cc) + 8.1) >= gate) continue;
          ctx.fillRect(x, y, cs, cs);
        }
    }
    function begin() {
      const touch = S.touch;
      Object.assign(S, fresh(), { touch });
      return;
    }
    function feed(e) {
      const r = sheet.getBoundingClientRect(),
        x = (e.clientX - r.left) / r.width,
        y = 1 - (e.clientY - r.top) / r.height,
        inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (e.pointerType !== 'mouse' && !S.touch) return;
      S.pointer.x = x;
      S.pointer.y = y;
      S.want = inside ? 1 : 0;
      S.half = PACE.presence;
      if (inside && !S.placed) {
        S.head.x = x;
        S.head.y = y;
        S.placed = true;
      }
      if (api.reduced) {
        S.head.x = x;
        S.head.y = y;
        S.marks = [];
        S.show = inside ? 1 : 0;
        api.paint();
      } else api.wake();
    }
    api.listen(element, 'pointermove', (e) => {
      feed(e);
    });
    api.listen(element, 'pointerdown', (e) => {
      if (e.pointerType !== 'mouse') {
        S.touch = true;
        S.placed = false;
        try {
          element.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
      feed(e);
    });
    const lift = (e) => {
      if (e.pointerType === 'mouse') return;
      S.touch = false;
      S.want = 0;
      if (api.reduced) {
        S.show = 0;
        api.paint();
      } else api.wake();
    };
    api.listen(element, 'pointerup', lift);
    api.listen(element, 'pointercancel', lift);
    api.listen(element, 'pointerleave', (e) => {
      if (e.pointerType !== 'mouse' && S.touch) return;
      S.want = 0;
      if (api.reduced && true) {
        S.show = 0;
        api.paint();
      } else api.wake();
    });
    api.restore = () => {
      S.want = 0;
      S.touch = false;
      S.half = PACE.restore;
      S.restoring = true;
      if (api.reduced) {
        S.show = 0;
        S.marks = [];
        api.paint();
      } else api.wake();
    };
    api.on('replay', () => {
      begin();
    });
    api.on('resize', () => {
      fit();
    });
    api.frame(({ dt, reduced }) => {
      if (reduced) {
        render(S);
        return false;
      }
      advance(dt);
      if (S.restoring && S.show < 0.02) {
        S.show = 0;
        S.restoring = false;
        S.half = PACE.presence;
      }
      if (S.want === 0 && S.show < 0.002) {
        S.show = 0;
        S.marks = [];
        S.placed = false;
        render(S);
        return false;
      }
      render(S);
      return true;
    });
    if (phased)
      api.prepare(async (phase) => {
        await prepareRenderer(phase);
        await phase(() => {
          if (contextLost) fallback2D();
          fit();
          if (gl) glyphStrip(Math.max(3, Math.round(api.params.cell * dpr)));
        }, 'ink-texture');
        await phase(() => {
          begin();
        }, 'ink-rehearse');
      });
    else {
      begin();
      api.paint();
    }
    const status = api.status;
    api.status = () =>
      Object.assign(status(), {
        marks: S.marks.length,
        alpha: +S.show.toFixed(3),
        renderer: gl ? 'webgl' : 'canvas2d',
      });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountTornCursorInk(element, options) {
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
    element.classList.add('torn-cursor-ink');
    element.innerHTML = '<div class="fx-board"><div class="ink-box" data-ink></div></div>';
    const stage = element,
      box = stage.querySelector('[data-ink]');
    let inst = null;
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        m = W < 600 ? 20 : 40,
        x0 = m;
      box.style.left = x0 + 'px';
      box.style.top = m + 'px';
      box.style.width = W - m - x0 + 'px';
      box.style.height = H - 2 * m + 'px';
    }

    place();
    inst = mount(box, { params: options.params, card: { interactive: true } });
    const observer0 = new ResizeObserver(place);
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
  global.mountTornCursorInk = mountTornCursorInk;
  if (typeof module === 'object' && module.exports) module.exports = mountTornCursorInk;
})(typeof window !== 'undefined' ? window : this);
