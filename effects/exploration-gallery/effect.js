/*
 * Wave Gallery
 *
 * Use your own HTML content and host CSS. The component owns motion only.
 * Mount: mountExplorationGallery(element, options). See index.html for editable content, shape and motion options.
 * The demo images and fonts are intentionally excluded.
 * Destroy the instance when removing its host. No framework or build step is required.
 *
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 */
(function (global) {
  "use strict";
  const mounts = new WeakMap();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    damp = (v, t, k, dt) => v + (t - v) * (1 - Math.exp(-k * dt));
  const vertex =
    "attribute vec3 aClip;attribute vec2 aLocal;varying vec2 vLocal;void main(){vLocal=aLocal;gl_Position=vec4(aClip.xy,0.,aClip.z);}";
  const fragment = `precision highp float;uniform sampler2D uPhoto;uniform vec2 uSize,uCover;uniform vec3 uBackground,uAccent;uniform float uColour,uChroma,uGlow,uPass,uPx,uContain,uRadius;varying vec2 vLocal;
  const vec3 LUMA=vec3(.2126,.7152,.0722);const vec3 COOL=vec3(.8,.94,1.);
  vec3 picture(vec2 uv){vec2 c=(uv-.5)*uCover+.5;vec4 tex=texture2D(uPhoto,c);return mix(uBackground,tex.rgb,tex.a);}
  void main(){vec2 q=abs(vLocal-.5*uSize)-.5*uSize+uRadius;float d=length(max(q,0.))+min(max(q.x,q.y),0.)-uRadius;if(uPass<.5){if(d<=0.)discard;float g=uGlow*.18*exp(-d/10.);if(g<.002)discard;gl_FragColor=vec4(uAccent*g,g);return;}float aa=uPx;
#ifdef EA_DERIVATIVES
  aa=max(aa,fwidth(d));
#endif
  float a=clamp(.5-d/aa,0.,1.);if(a<=0.)discard;vec2 uv=vLocal/uSize;vec3 col=picture(uv);float l=dot(col,LUMA);col=mix(vec3(l),col,uColour);if(abs(uChroma)>.001){vec2 e=abs(uv-.5)*2.,o=vec2(uChroma/uSize.x,0.)*mix(.3,1.,smoothstep(0.,1.,max(e.x,e.y)));float lp=dot(picture(uv-o),LUMA),lc=dot(picture(uv+o),LUMA);vec3 p=uAccent*(clamp((lp-l)*2.2,0.,1.)*.7),c=COOL*(clamp((lc-l)*2.2,0.,1.)*.35);col=1.-(1.-col)*(1.-p);col=1.-(1.-col)*(1.-c);}gl_FragColor=vec4(col*a,a);}`;
  function mountExplorationGallery(el, options = {}) {
    if (!(el instanceof Element))
      throw new TypeError("mountExplorationGallery expects an element.");
    if (mounts.has(el)) throw new Error("This gallery is already mounted.");
    let opts = {
      width: 220,
      height: 300,
      ratio: null,
      gap: 24,
      padding: 32,
      captionHeight: 72,
      colour: "focus",
      fit: "cover",
      bend: 1,
      chroma: 1,
      highlightColor: "#4559ff",
      inertia: 1,
      loop: false,
      motion: "auto",
      imageBackground: "#eee9dd",
      selectedId: null,
      ...options,
    };
    const originalNodes = [...el.childNodes],
      originalClass = el.getAttribute("class"),
      rootStyles = new Map(
        ["--ea-eg-photo-height", "--ea-eg-fit", "--ea-eg-accent"].map((k) => [
          k,
          el.style.getPropertyValue(k),
        ]),
      ),
      originalDragging = el.getAttribute("data-dragging");
    const sourceAttrs = new Map(),
      origins = new Map(),
      stash = document.createDocumentFragment(),
      ownedClasses = new Map(),
      imageStyles = new Map(),
      listeners = [],
      media = matchMedia("(prefers-reduced-motion: reduce)");
    let records = [],
      destroyed = false,
      width = 1,
      height = 1,
      itemWidth = 220,
      imageHeight = 300,
      gap = 24,
      padding = 32,
      top = 30,
      total = 0,
      max = 0,
      dpr = 1;
    let position = 0,
      velocity = 0,
      bend = 0,
      rpm = 0,
      phase = 0,
      snap = null,
      pointer = null,
      drag = null,
      raf = 0,
      last = 0,
      intersecting = true,
      suppressUntil = 0,
      loadGeneration = 0;
    let focusedId = null,
      currentId = null,
      selectedId = opts.selectedId == null ? null : String(opts.selectedId),
      gl = null,
      program = null,
      buffer = null,
      locations = {},
      shaders = [],
      contextLost = false;
    const canvas = document.createElement("canvas"),
      track = document.createElement("div"),
      status = document.createElement("span"),
      empty = document.createElement("p");
    canvas.className = "ea-eg-canvas";
    canvas.setAttribute("aria-hidden", "true");
    track.className = "ea-eg-track";
    track.tabIndex = 0;
    track.setAttribute("role", "group");
    track.setAttribute("aria-label", opts.label || "Browse images");
    status.className = "ea-eg-status";
    status.setAttribute("aria-live", "polite");
    empty.className = "ea-eg-empty";
    empty.textContent = "No items";
    empty.hidden = true;
    el.append(canvas, track, empty, status);
    el.classList.add("ea-eg");
    function remember(node) {
      if (!sourceAttrs.has(node)) sourceAttrs.set(node, new Map());
      return sourceAttrs.get(node);
    }
    function attribute(node, name, value) {
      const snapshot = remember(node);
      if (!snapshot.has(name)) snapshot.set(name, node.getAttribute(name));
      if (value == null) node.removeAttribute(name);
      else node.setAttribute(name, value);
    }
    function mark(node, name) {
      if (!node.classList.contains(name)) {
        if (!ownedClasses.has(node)) ownedClasses.set(node, new Set());
        ownedClasses.get(node).add(name);
        node.classList.add(name);
      }
    }
    function on(target, type, fn, config) {
      target.addEventListener(type, fn, config);
      listeners.push(() => target.removeEventListener(type, fn, config));
    }
    function reduced() {
      return (
        opts.motion === "reduced" ||
        (opts.motion !== "full" && opts.motion !== "reduced" && media.matches)
      );
    }
    function looping() {
      return opts.loop && records.length > 1 && total > width;
    }
    function resolve(value) {
      if (typeof value === "number")
        return records[clamp(Math.round(value), 0, records.length - 1)] || null;
      return records.find((r) => r.id === String(value)) || null;
    }
    function state() {
      return {
        position,
        currentId,
        focusedId,
        selectedId,
        count: records.length,
        dragging: !!drag,
      };
    }
    function notify(name, record, event) {
      if (destroyed) return;
      const detail = {
        ...state(),
        item: record
          ? { id: record.id, index: record.index, node: record.node }
          : null,
      };
      const result =
        typeof opts[name] === "function"
          ? opts[name](detail, event)
          : undefined;
      el.dispatchEvent(
        new CustomEvent("ea:" + name.slice(2).toLowerCase(), { detail }),
      );
      return result;
    }
    function attention(id) {
      id = id == null ? null : String(id);
      if (focusedId !== id) {
        focusedId = id;
        notify("onFocus", resolve(id));
      }
    }
    function select(value) {
      if (destroyed) return api;
      const item = value == null ? null : resolve(value),
        next = item?.id || null;
      if (next !== selectedId) {
        selectedId = next;
        records.forEach((r) => {
          r.wrapper.dataset.selected = String(r.id === selectedId);
          r.node
            .querySelectorAll("[data-gallery-select]")
            .forEach((b) =>
              attribute(b, "aria-pressed", String(r.id === selectedId)),
            );
        });
        status.textContent = item ? "Selected " + item.title : "Selection cleared";
        notify("onSelect", item);
      }
      wake();
      return api;
    }
    function focus(value) {
      if (destroyed) return api;
      const r = resolve(value);
      if (!r) return api;
      attention(r.id);
      pointer = null;
      const target = r.start + padding + r.width / 2 - width / 2;
      snap = looping()
        ? position + cyclic(target - position, total)
        : clamp(target, 0, max);
      if (reduced()) {
        position = snap;
        snap = null;
      }
      wake();
      return api;
    }
    function cyclic(value, range) {
      return ((((value + range / 2) % range) + range) % range) - range / 2;
    }
    function build(value, index) {
      let node = value instanceof Element ? value : null;
      if (!node) {
        node = document.createElement(value.href ? "a" : "article");
        if (value.href) node.href = value.href;
        node.dataset.id = String(value.id ?? index);
        if (value.title) node.dataset.title = value.title;
        const image = new Image();
        image.alt = value.alt || value.title || "";
        if (value.image || value.src) image.src = value.image || value.src;
        node.append(image);
        const title = document.createElement("h3");
        title.className = "ea-eg-default-title";
        title.textContent = value.title || "";
        node.append(title);
        if (value.description) {
          const p = document.createElement("p");
          p.className = "ea-eg-default-description";
          p.textContent = value.description;
          node.append(p);
        }
      } else if (!origins.has(node)) {
        const marker = document.createComment("exploration-item");
        node.parentNode?.insertBefore(marker, node);
        origins.set(node, { marker });
      }
      const image = node.querySelector("img");
      if (!image)
        throw new Error("Each exploration item needs an img element.");
      const id = String(node.dataset.id || node.id || index);
      const wrapper = document.createElement("div");
      wrapper.className = "ea-eg-item";
      wrapper.dataset.selected = String(id === selectedId);
      mark(node, "ea-eg-source");
      mark(image, "ea-eg-media");
      if (!imageStyles.has(image))
        imageStyles.set(image, {
          opacity: image.style.opacity,
          filter: image.style.filter,
        });
      attribute(image, "draggable", "false");
      wrapper.append(node);
      track.append(wrapper);
      return {
        id,
        index,
        node,
        wrapper,
        image,
        title:
          node.dataset.title ||
          node.querySelector("h2,h3,h4")?.textContent ||
          image.alt ||
          id,
        texture: null,
        lift: 0,
        colour: opts.colour === "all" ? 1 : 0,
        x: 0,
        y: 0,
        angle: 0,
        z: 0,
        loaded: false,
      };
    }
    function clearGraphics() {
      if (!gl) return;
      for (const r of records) if (r.texture) gl.deleteTexture(r.texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      shaders.forEach((s) => gl.deleteShader(s));
      buffer = program = null;
      shaders = [];
    }
    function initGL() {
      try {
        gl = canvas.getContext("webgl", {
          alpha: true,
          antialias: true,
          premultipliedAlpha: true,
          powerPreference: "low-power",
        });
        if (!gl) return;
        const compile = (type, source) => {
          const shader = gl.createShader(type);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw Error(gl.getShaderInfoLog(shader));
          shaders.push(shader);
          return shader;
        };
        program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(
          program,
          compile(
            gl.FRAGMENT_SHADER,
            (gl.getExtension("OES_standard_derivatives")
              ? "#extension GL_OES_standard_derivatives : enable\n#define EA_DERIVATIVES\n"
              : "") + fragment,
          ),
        );
        gl.bindAttribLocation(program, 0, "aClip");
        gl.bindAttribLocation(program, 1, "aLocal");
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
        [
          "uPhoto",
          "uSize",
          "uCover",
          "uColour",
          "uChroma",
          "uGlow",
          "uPass",
          "uPx",
          "uContain",
          "uRadius",
          "uBackground",
          "uAccent",
        ].forEach((k) => (locations[k] = gl.getUniformLocation(program, k)));
        gl.uniform1i(locations.uPhoto, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);
        records.forEach(upload);
      } catch (error) {
        clearGraphics();
        gl = null;
        console.warn(
          "Wave Gallery: using images because WebGL is unavailable.",
          error.message,
        );
      }
    }
    function upload(r) {
      if (!gl || contextLost || !r.image.naturalWidth) return;
      try {
        if (r.texture) gl.deleteTexture(r.texture);
        r.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, r.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          r.image,
        );
        r.loaded = true;
      } catch (error) {
        if (r.texture) gl.deleteTexture(r.texture);
        r.texture = null;
        console.warn(
          "Image cannot be sampled by WebGL; keeping its DOM image.",
          r.id,
        );
      }
      wake();
    }
    function setItems(items) {
      if (destroyed) return api;
      const values = Array.from(items || []),
        seen = new Set();
      for (const [i, item] of values.entries()) {
        if (!(item instanceof Element) && (!item || typeof item !== "object"))
          throw new TypeError("items must be elements or item objects.");
        const id = String(
          item instanceof Element
            ? item.dataset.id || item.id || i
            : (item.id ?? i),
        );
        if (seen.has(id)) throw new Error("Duplicate item id: " + id);
        seen.add(id);
        if (item instanceof Element && !item.querySelector("img"))
          throw new Error("Each exploration item needs an img element.");
      }
      loadGeneration++;
      const generation = loadGeneration;
      if (gl) records.forEach((r) => r.texture && gl.deleteTexture(r.texture));
      records.forEach((r) => {
        const origin = origins.get(r.node);
        if (origin) stash.append(r.node);
        const styles = imageStyles.get(r.image);
        if (styles) {
          r.image.style.opacity = styles.opacity;
          r.image.style.filter = styles.filter;
        }
        if (!origin) {
          for (const node of [r.node, ...r.node.querySelectorAll("*")]) {
            sourceAttrs.delete(node);
            ownedClasses.delete(node);
            imageStyles.delete(node);
          }
        }
      });
      track.replaceChildren();
      if (selectedId && !seen.has(selectedId)) selectedId = null;
      records = values.map(build);
      empty.hidden = records.length > 0;
      track.hidden = !records.length;
      canvas.hidden = !records.length;
      position = 0;
      velocity = 0;
      bend = 0;
      rpm = 0;
      pointer = null;
      snap = null;
      if (drag && track.hasPointerCapture(drag.id))
        track.releasePointerCapture(drag.id);
      drag = null;
      el.dataset.dragging = "false";
      focusedId = null;
      currentId = null;
      records.forEach((r) => {
        const ready = () => {
          if (destroyed || generation !== loadGeneration) return;
          upload(r);
          layout();
        };
        // A source-less img is an intentional CSS placeholder, not a failed request.
        if (r.image.complete && r.image.naturalWidth) ready();
        else if (r.image.getAttribute("src") || r.image.getAttribute("srcset"))
          r.image.decode().then(ready, () => {
            if (!destroyed && generation === loadGeneration) wake();
          });
        r.node
          .querySelectorAll("[data-gallery-select]")
          .forEach((b) =>
            attribute(b, "aria-pressed", String(r.id === selectedId)),
          );
      });
      layout();
      notify("onChange", records[0]);
      return api;
    }
    function layout() {
      if (destroyed) return;
      const anchor = total ? position / total : 0;
      width = Math.max(1, el.clientWidth);
      height = Math.max(1, el.clientHeight);
      itemWidth = clamp(
        Number(opts.width) || 220,
        72,
        Math.max(72, width * 0.85),
      );
      const captionHeight = Math.max(0, Number(opts.captionHeight) || 0);
      // Budget for the 12% focus lift, 34px scroll wave, 30px glow and
      // perspective rounding above the card, plus 24px below its caption.
      imageHeight = clamp(
        Number(opts.height) || 300,
        80,
        Math.max(80, (height - captionHeight - 92) / 1.12),
      );
      // An explicit aspect ratio stays intact when either available dimension shrinks.
      if (Number(opts.ratio) > 0) {
        itemWidth = Math.min(itemWidth, imageHeight * Number(opts.ratio));
        imageHeight = itemWidth / Number(opts.ratio);
      }
      const radius =
        getComputedStyle(el).getPropertyValue("--ea-eg-radius").trim() || "0";
      gap = Math.max(0, Number(opts.gap) || 0);
      padding = Math.max(0, Number(opts.padding) || 0);
      top = Math.max(
        68 + Math.min(50, imageHeight * 0.12),
        (height - imageHeight - captionHeight) / 2,
      );
      total = 0;
      records.forEach((r) => {
        const aspect =
          r.image.naturalWidth / r.image.naturalHeight ||
          itemWidth / imageHeight;
        // A contained image is its own plane, not a rectangle with painted gutters.
        r.width =
          opts.fit === "contain"
            ? Math.min(itemWidth, imageHeight * aspect)
            : itemWidth;
        r.height = opts.fit === "contain" ? r.width / aspect : imageHeight;
        const radiusValue = parseFloat(radius) || 0;
        r.radius = clamp(
          radius.endsWith("%")
            ? (Math.min(r.width, r.height) * radiusValue) / 100
            : radiusValue,
          0,
          Math.min(r.width, r.height) / 2,
        );
        r.start = total;
        r.mediaTop = (imageHeight - r.height) / 2;
        total += r.width + gap;
        r.wrapper.style.width = r.width + "px";
        r.wrapper.style.setProperty("--ea-eg-photo-height", r.height + "px");
        r.wrapper.style.setProperty("--ea-eg-resolved-radius", r.radius + "px");
        r.wrapper.style.setProperty(
          "--ea-eg-outline-radius",
          r.radius ? r.radius + 5 + "px" : "0px",
        );
      });
      max = Math.max(0, total - gap + padding * 2 - width);
      position = looping() ? anchor * total : clamp(anchor * total, 0, max);
      velocity = 0;
      snap = null;
      dpr = Math.min(Math.max(devicePixelRatio || 1, 1), 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      el.style.setProperty("--ea-eg-photo-height", imageHeight + "px");
      el.style.setProperty("--ea-eg-accent", /^#[\da-f]{6}$/i.test(opts.highlightColor) ? opts.highlightColor : "#4559ff");
      el.style.setProperty(
        "--ea-eg-fit",
        opts.fit === "contain" ? "contain" : "cover",
      );
      wake();
    }
    function project(r, x, y) {
      const pivot = r.height * 0.5,
        dy = y - pivot,
        ratio = clamp(y / r.height, 0, 1);
      const z =
          dy * Math.sin(r.angle) +
          r.z -
          28 * Math.min(1, Math.abs(bend) / 110) * Math.sin(Math.PI * ratio),
        w = (1200 - Math.min(z, 600)) / 1200;
      const edge = (clamp(y, 0, r.height) - pivot) / Math.max(1, pivot);
      return {
        x: width / 2 + (r.x + x + bend * edge * edge - width / 2) / w,
        y: height / 2 + (r.y + pivot + dy * Math.cos(r.angle) - height / 2) / w,
        w,
      };
    }
    function mesh(r, bleed) {
      const vertices = new Float32Array(250);
      let at = 0;
      for (let row = 0; row <= 24; row++) {
        const y = ((r.height + 2 * bleed) * row) / 24 - bleed;
        for (const x of [-bleed, r.width + bleed]) {
          const p = project(r, x, y);
          vertices[at++] = ((2 * p.x) / width - 1) * p.w;
          vertices[at++] = (1 - (2 * p.y) / height) * p.w;
          vertices[at++] = p.w;
          vertices[at++] = x;
          vertices[at++] = y;
        }
      }
      return vertices;
    }
    function render() {
      if (destroyed) return;
      const useGL = gl && !contextLost,
        dir = Math.sign(velocity) || Math.sign(bend) || 1,
        magnitude = Math.min(1, Math.abs(bend) / 110);
      let nearest = null,
        nearestDist = Infinity;
      if (useGL) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.uniform1f(locations.uPx, 1 / dpr);
        gl.uniform1f(
          locations.uChroma,
          reduced()
            ? 0
            : 3 *
                Math.pow(rpm, 1.4) *
                dir *
                clamp(Number(opts.chroma) || 0, 0, 3),
        );
        gl.uniform1f(locations.uContain, opts.fit === "contain" ? 1 : 0);
        const hex =
          /^#([\da-f]{6})$/i.exec(opts.imageBackground)?.[1] || "eee9dd";
        gl.uniform3f(
          locations.uBackground,
          parseInt(hex.slice(0, 2), 16) / 255,
          parseInt(hex.slice(2, 4), 16) / 255,
          parseInt(hex.slice(4, 6), 16) / 255,
        );
        const accent = /^#([\da-f]{6})$/i.exec(opts.highlightColor)?.[1] || "4559ff";
        gl.uniform3f(locations.uAccent, parseInt(accent.slice(0, 2), 16) / 255, parseInt(accent.slice(2, 4), 16) / 255, parseInt(accent.slice(4, 6), 16) / 255);
      }
      for (const r of records) {
        r.x = padding + r.start - position;
        if (looping())
          r.x =
            ((((r.x + r.width + gap) % total) + total) % total) - r.width - gap;
        const wave = reduced()
            ? 0
            : Math.sin(phase + ((r.index * 2 * Math.PI) / 6.5) * dir) * rpm,
          lift = wave < 0 ? wave * 0.4 : wave;
        r.y = top + r.mediaTop - r.lift - lift * 34;
        r.angle = reduced()
          ? 0
          : (((r.lift / 50) * 7 + lift * 7) * Math.PI) / 180;
        const pos = clamp(
          (r.x + r.width / 2 - width / 2) / (width / 2),
          -1.5,
          1.5,
        );
        r.z = -85 * magnitude * pos * pos;
        r.wrapper.style.transform = `translate3d(${r.x}px,${top + r.mediaTop - r.lift}px,0)`;
        const onScreen = r.x + r.width + 140 >= 0 && r.x - 140 <= width;
        r.wrapper.style.visibility = onScreen ? "visible" : "hidden";
        const dist = Math.abs(r.x + r.width / 2 - width / 2);
        if (dist < nearestDist) {
          nearest = r;
          nearestDist = dist;
        }
        r.image.style.opacity = useGL && r.texture ? "0" : "";
        r.image.style.filter =
          useGL && r.texture ? "" : `grayscale(${1 - r.colour})`;
        if (!useGL || !r.texture || !onScreen) continue;
        gl.uniform2f(locations.uSize, r.width, r.height);
        gl.uniform1f(locations.uRadius, r.radius);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, r.texture);
        const aspect = r.image.naturalWidth / r.image.naturalHeight,
          target = r.width / r.height,
          contain = opts.fit === "contain";
        gl.uniform2f(
          locations.uCover,
          contain
            ? aspect > target
              ? 1
              : target / aspect
            : aspect > target
              ? target / aspect
              : 1,
          contain
            ? aspect > target
              ? aspect / target
              : 1
            : aspect > target
              ? 1
              : aspect / target,
        );
        gl.uniform1f(
          locations.uColour,
          clamp(r.colour + Math.max(0, lift) * 0.55, 0, 1),
        );
        gl.uniform1f(locations.uGlow, focusedId === r.id ? r.colour : 0);
        if (focusedId === r.id && r.colour > 0.002) {
          gl.uniform1f(locations.uPass, 0);
          gl.bufferData(gl.ARRAY_BUFFER, mesh(r, 30), gl.DYNAMIC_DRAW);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 50);
        }
        gl.uniform1f(locations.uPass, 1);
        gl.bufferData(gl.ARRAY_BUFFER, mesh(r, 1), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 50);
      }
      if (nearest && currentId !== nearest.id) {
        currentId = nearest.id;
        notify("onChange", nearest);
      }
    }
    // Match the shader's rounded silhouette for hover; captions retain their own links.
    function containsMedia(r, x, y) {
      const localX = x - r.x,
        localY = y - (top + r.mediaTop - r.lift);
      const qx = Math.abs(localX - r.width / 2) - r.width / 2 + r.radius;
      const qy = Math.abs(localY - r.height / 2) - r.height / 2 + r.radius;
      return (
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
          Math.min(Math.max(qx, qy), 0) <=
        r.radius
      );
    }
    function frame(now) {
      raf = 0;
      if (destroyed || document.hidden || !intersecting) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60);
      last = now;
      const reduce = reduced();
      if (!drag) {
        if (snap !== null) {
          const old = position;
          position = reduce ? snap : damp(position, snap, 8, dt);
          velocity = (position - old) / dt;
          if (Math.abs(snap - position) < 0.08) {
            position = snap;
            snap = null;
            velocity = 0;
          }
        } else {
          position += velocity * dt;
          velocity *= Math.exp(
            (-5.3 / clamp(Number(opts.inertia) || 0.01, 0.1, 3)) * dt,
          );
          if (Math.abs(velocity) < 1) velocity = 0;
          if (!looping() && (position < 0 || position > max)) {
            const target = clamp(position, 0, max);
            position = reduce ? target : damp(position, target, 14, dt);
            velocity *= Math.exp(-12 * dt);
            if (Math.abs(position - target) < 0.08) position = target;
          }
        }
      }
      const desired = reduce
        ? 0
        : clamp(
            velocity * 0.036 * clamp(Number(opts.bend) || 0, 0, 3),
            -132,
            132,
          );
      bend = damp(
        bend,
        desired,
        Math.abs(desired) > Math.abs(bend) ? 10 : 1 / 0.32,
        dt,
      );
      if (Math.abs(bend) < 0.015) bend = 0;
      const desiredRpm = reduce ? 0 : clamp(Math.abs(velocity) / 1900, 0, 1);
      rpm = damp(rpm, desiredRpm, desiredRpm > rpm ? 10 : 4, dt);
      if (rpm < 0.001) rpm = 0;
      phase += 2 * Math.PI * 1.8 * Math.sqrt(rpm) * dt;
      if (pointer && !drag) {
        const item = records.find((r) =>
          containsMedia(r, pointer.x, pointer.y),
        );
        attention(item?.id || null);
      }
      let moving = false;
      for (const r of records) {
        const active = focusedId === r.id,
          targetColour = opts.colour === "all" || active ? 1 : 0,
          targetLift = active ? Math.min(50, imageHeight * 0.12) : 0;
        r.colour = reduce
          ? targetColour
          : damp(r.colour, targetColour, targetColour ? 7 : 4, dt);
        r.lift = reduce ? targetLift : damp(r.lift, targetLift, 9, dt);
        if (
          Math.abs(r.colour - targetColour) > 0.001 ||
          Math.abs(r.lift - targetLift) > 0.05
        )
          moving = true;
        else {
          r.colour = targetColour;
          r.lift = targetLift;
        }
      }
      render();
      if (
        drag ||
        velocity ||
        bend ||
        rpm ||
        moving ||
        snap !== null ||
        (!looping() && (position < 0 || position > max))
      )
        wake(false);
    }
    function wake(reset = true) {
      if (!raf && !destroyed && !document.hidden && intersecting) {
        if (reset) last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }
    function itemAt(event) {
      const wrapper = event.target.closest(".ea-eg-item");
      return records.find((r) => r.wrapper === wrapper) || null;
    }
    on(track, "dragstart", (event) => event.preventDefault());
    on(track, "pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("input,textarea,select"))
        return;
      const item = itemAt(event);
      drag = {
        id: event.pointerId,
        x: event.clientX,
        lastX: event.clientX,
        lastT: performance.now(),
        moved: false,
        item,
      };
      velocity = 0;
      snap = null;
    });
    on(track, "pointermove", (event) => {
      const rect = el.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (drag && drag.id === event.pointerId) {
        const delta = event.clientX - drag.lastX,
          now = performance.now();
        if (!drag.moved && Math.abs(event.clientX - drag.x) > 5) {
          drag.moved = true;
          snap = null;
          track.setPointerCapture(event.pointerId);
          el.dataset.dragging = "true";
          attention(null);
        }
        if (drag.moved) {
          const next = position - delta;
          position -=
            delta * (looping() || (next >= 0 && next <= max) ? 1 : 0.32);
          velocity = reduced()
            ? 0
            : damp(
                velocity,
                -delta / Math.max(0.008, (now - drag.lastT) / 1000),
                30,
                0.016,
              );
        }
        drag.lastX = event.clientX;
        drag.lastT = now;
      }
      wake();
    });
    function release(event) {
      if (!drag || event.pointerId !== drag.id) return;
      const previous = drag;
      drag = null;
      if (previous.moved) suppressUntil = performance.now() + 400;
      if (performance.now() - previous.lastT > 90) velocity = 0;
      el.dataset.dragging = "false";
      if (track.hasPointerCapture(event.pointerId))
        track.releasePointerCapture(event.pointerId);
      wake();
    }
    on(window, "pointerup", release);
    on(track, "pointercancel", (event) => {
      release(event);
      velocity = 0;
    });
    on(track, "lostpointercapture", () => {
      drag = null;
      el.dataset.dragging = "false";
      wake();
    });
    on(track, "pointerleave", () => {
      pointer = null;
      if (!track.contains(document.activeElement)) attention(null);
      wake();
    });
    on(
      track,
      "click",
      (event) => {
        if (performance.now() < suppressUntil) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        const r = itemAt(event);
        if (!r) return;
        if (event.detail && r.radius) {
          const rect = el.getBoundingClientRect();
          const x = event.clientX - rect.left,
            y = event.clientY - rect.top;
          const mediaTop = top + r.mediaTop - r.lift;
          if (
            y >= mediaTop &&
            y <= mediaTop + r.height &&
            !containsMedia(r, x, y)
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
        }
        if (event.target.closest("[data-gallery-select]")) {
          select(r.id);
          if (notify("onActivate", r, event) === false) event.preventDefault();
        } else if (notify("onActivate", r, event) === false)
          event.preventDefault();
      },
      true,
    );
    on(track, "focusin", (event) => {
      const r = itemAt(event);
      if (r) {
        focus(r.id);
        pointer = null;
      }
    });
    on(track, "focusout", (event) => {
      if (!track.contains(event.relatedTarget)) {
        attention(null);
        wake();
      }
    });
    on(track, "keydown", (event) => {
      if (event.target.closest("input,textarea,select")) return;
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const index = resolve(focusedId || currentId)?.index || 0;
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? records.length - 1
              : index + (event.key === "ArrowRight" ? 1 : -1);
        focus(
          looping()
            ? ((next % records.length) + records.length) % records.length
            : next,
        );
      } else if (
        (event.key === "Enter" || event.key === " ") &&
        event.target === track
      ) {
        const r = resolve(focusedId || currentId);
        if (r) {
          event.preventDefault();
          const action = r.node.matches("a,button")
            ? r.node
            : r.node.querySelector("a,button");
          if (action) action.click();
          else notify("onActivate", r, event);
        }
      }
    });
    on(
      track,
      "wheel",
      (event) => {
        if (
          event.ctrlKey ||
          event.metaKey ||
          !records.length ||
          (max === 0 && !looping())
        )
          return;
        const direction =
          Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;
        if (
          !looping() &&
          ((position <= 0.1 && direction < 0) ||
            (position >= max - 0.1 && direction > 0))
        )
          return;
        event.preventDefault();
        pointer = null;
        snap = null;
        const delta =
          (Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY) *
          (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
        if (reduced())
          position = looping()
            ? position + delta
            : clamp(position + delta, 0, max);
        else velocity = clamp(velocity + delta * 7, -5200, 5200);
        wake();
      },
      { passive: false },
    );
    on(media, "change", () => {
      velocity = 0;
      bend = 0;
      rpm = 0;
      wake();
    });
    on(document, "visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        drag = null;
        velocity = 0;
      } else wake();
    });
    on(canvas, "webglcontextlost", (event) => {
      event.preventDefault();
      contextLost = true;
      wake();
    });
    on(canvas, "webglcontextrestored", () => {
      contextLost = false;
      initGL();
      wake();
    });
    const resize = new ResizeObserver(layout),
      intersection = new IntersectionObserver((entries) => {
        intersecting = entries[0]?.isIntersecting !== false;
        if (!intersecting) {
          cancelAnimationFrame(raf);
          raf = 0;
          drag = null;
          velocity = 0;
        } else wake();
      });
    resize.observe(el);
    intersection.observe(el);
    const api = {
      getState: state,
      focus,
      select,
      setItems,
      refresh: () => {
        layout();
        return api;
      },
      updateOptions: (patch) => {
        if (destroyed) return api;
        opts = { ...opts, ...patch };
        if (Object.hasOwn(patch, "selectedId")) select(patch.selectedId);
        if (patch.items) setItems(patch.items);
        else layout();
        return api;
      },
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        loadGeneration++;
        cancelAnimationFrame(raf);
        listeners.forEach((off) => off());
        resize.disconnect();
        intersection.disconnect();
        clearGraphics();
        for (const [node, attrs] of sourceAttrs)
          for (const [name, value] of attrs) {
            if (value == null) node.removeAttribute(name);
            else node.setAttribute(name, value);
          }
        for (const [node, origin] of origins) {
          if (origin.marker.parentNode)
            origin.marker.parentNode.insertBefore(node, origin.marker);
          origin.marker.remove();
        }
        for (const [node, classes] of ownedClasses)
          classes.forEach((name) => node.classList.remove(name));
        for (const [image, styles] of imageStyles) {
          image.style.opacity = styles.opacity;
          image.style.filter = styles.filter;
        }
        canvas.remove();
        track.remove();
        empty.remove();
        status.remove();
        if (!(originalClass || "").split(/\s+/).includes("ea-eg"))
          el.classList.remove("ea-eg");
        for (const [k, v] of rootStyles) {
          if (v) el.style.setProperty(k, v);
          else el.style.removeProperty(k);
        }
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
        if (originalDragging == null) el.removeAttribute("data-dragging");
        else el.setAttribute("data-dragging", originalDragging);
        mounts.delete(el);
      },
    };
    mounts.set(el, api);
    initGL();
    setItems(
      options.items ||
        originalNodes.filter(
          (n) => n instanceof Element && n.querySelector("img"),
        ),
    );
    return api;
  }
  global.mountExplorationGallery = mountExplorationGallery;
})(window);
