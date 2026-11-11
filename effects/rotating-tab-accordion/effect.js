/*
 * Rotating Tab Accordion — service directory
 *
 * Mount: const fx = mountRotatingTabAccordion(element, {items, params});
 * items: 3 to 6 objects. title is required. links is an optional array of {label, href}; omit href for a plain text row.
 * Optional legacy image (URL), alt, description, href and linkLabel remain supported. Images are not required.
 * Default HTML: four numbered service directories. Example content, images and page layout belong to index.html.
 *
 * Desktop: bottom-anchored vertical labels, fixed-width panels revealed by horizontal translation and clipping, then a separate top heading and link directory. The closed label does not rotate into the heading.
 * Hover opens a column, clicking its heading keeps it open, pointer leave closes it. Keyboard Enter/Space toggles; Escape closes; arrows and Home/End navigate. Content focus and keyboard focus are protected from pointer-leave collapse. Ordinary links remain ordinary links.
 * Containers below 600px use vertical rows. Wider containers also use rows if the narrowest closed column cannot fit all rotated labels. On mobile, tap a heading to open, switch or close.
 * The host supplies width. Horizontal height fits the largest item; vertical height uses measured content. No fixed list-height limit or silent truncation.
 *
 * Parameters: spread 52..64 (default 59.5), duration 240..600 milliseconds (default 600).
 * spread is the expanded column's share of available width AFTER column padding, not a percentage of the whole viewport. Four default columns produce an actual expanded width near 51.8% of the window. Other columns divide the remainder equally.
 * Default movement is 600ms cubic-bezier(.4,0,.12,1), closed-label fade 250ms, top content fade 450ms after 150ms. These timings scale with duration.
 *
 * API: params (copy), setParams(object), setItems(array), setActive(index or null), refresh(), status(), destroy().
 * setReduced(true/false/null) overrides or follows live system motion preference. setPaused pauses only module-owned CSS transitions, and resumes only transitions it paused. Host animation state remains independent.
 * refresh remeasures after content/font/layout edits. setItems creates new generated item nodes. Destroy releases listeners/observers and restores original host nodes by identity, including their edits and events. Sibling nodes added by the host are retained. No innerHTML rollback or scroll reset.
 * CSS variables: --rta-ink, --rta-surface, --rta-active-surface, --rta-border, --rta-muted, --rta-accent, --rta-title-size, --rta-heading-size, --rta-number-size, --rta-body-size, --rta-row-padding, --rta-image-height.
 * No demo pointer, automatic playback, framework, remote library or build step in effect.js/effect.css. HTTP and file URLs are supported.
 * Physical phone and Safari hardware testing is not claimed. See the candidate report for measured scope and limits.
 *
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 */
(function (global) {
  'use strict';
  if (global.EffectAtlasRuntime) return;
  let serial = 0;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function scope(element, definitions, options = {}, className) {
    if (!(element instanceof Element)) throw new TypeError('A DOM element is required.');
    const hooks = new Map(),
      cleanups = [],
      owned = new Map();
    let params = {},
      destroyed = false,
      paused = false,
      visible = true,
      raf = 0,
      frames = 0,
      last = 0;
    let draw = () => false,
      reducedOverride = options.reducedMotion ?? null;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let systemReduced = media.matches;
    const reduced = () => (reducedOverride === null ? systemReduced : !!reducedOverride);
    const defaults = Object.fromEntries(Object.entries(definitions).map(([key, rule]) => [key, rule.default]));
    const emit = (type, value) => (hooks.get(type) || []).forEach((fn) => fn(value));
    const allowed = () => !destroyed && !paused && visible && !document.hidden;
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
    function wake() {
      if (allowed() && !raf) raf = requestAnimationFrame(tick);
    }
    function tick(time) {
      raf = 0;
      if (!allowed()) return;
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
      last = time;
      frames++;
      const more = draw({ dt, time });
      if (more) wake();
      else last = 0;
    }
    function listen(target, type, fn, opt) {
      target.addEventListener(type, fn, opt);
      cleanups.push(() => target.removeEventListener(type, fn, opt));
      return fn;
    }
    function style(node, property, value) {
      let props = owned.get(node);
      if (!props) owned.set(node, (props = new Map()));
      if (!props.has(property))
        props.set(property, {
          old: node.style.getPropertyValue(property),
          priority: node.style.getPropertyPriority(property),
        });
      props.get(property).value = String(value);
      node.style.setProperty(property, String(value));
    }
    const hadClass = element.classList.contains(className);
    element.classList.add(className);
    const api = {
      element,
      uid: 'ea-' + ++serial,
      defaults: { ...defaults },
      clamp,
      listen,
      style,
      get params() {
        return { ...params };
      },
      get destroyed() {
        return destroyed;
      },
      get reduced() {
        return reduced();
      },
      get paused() {
        return paused;
      },
      on(type, fn) {
        if (!hooks.has(type)) hooks.set(type, []);
        hooks.get(type).push(fn);
        return fn;
      },
      cleanup(fn) {
        cleanups.push(fn);
        return fn;
      },
      setParams(next = {}) {
        if (destroyed) return;
        for (const [key, rule] of Object.entries(definitions)) {
          if (!(key in next) && key in params) continue;
          let value = key in next ? next[key] : rule.default;
          if (rule.type === 'number')
            value = Number.isFinite(+value) ? clamp(+value, rule.min, rule.max) : rule.default;
          if (rule.type === 'color') value = /^#[\da-f]{6}$/i.test(String(value)) ? value : rule.default;
          if (rule.type === 'boolean') value = !!value;
          params[key] = value;
        }
        emit('params', { ...params });
      },
      setReduced(value) {
        if (destroyed) return;
        reducedOverride = value == null ? null : !!value;
        emit('motion', reduced());
        wake();
      },
      setPaused(value) {
        if (destroyed) return;
        paused = !!value;
        stop();
        emit('pause', paused);
        if (!paused) wake();
      },
      frame(fn) {
        draw = fn;
      },
      wake,
      status() {
        return { destroyed, paused, visible, reduced: reduced(), raf, frameCount: frames, params: { ...params } };
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        stop();
        emit('destroy');
        cleanups
          .splice(0)
          .reverse()
          .forEach((fn) => {
            try {
              fn();
            } catch (e) {
              console.error(e);
            }
          });
        for (const [node, props] of owned)
          for (const [name, state] of props) {
            if (node.style.getPropertyValue(name) === state.value) {
              if (state.old) node.style.setProperty(name, state.old, state.priority);
              else node.style.removeProperty(name);
            }
          }
        if (!hadClass) element.classList.remove(className);
        hooks.clear();
        owned.clear();
      },
    };
    listen(media, 'change', (event) => {
      systemReduced = event.matches;
      emit('motion', reduced());
      wake();
    });
    listen(document, 'visibilitychange', () => {
      stop();
      emit('visibility', !document.hidden && visible);
      if (!document.hidden) wake();
    });
    listen(window, 'pageshow', () => {
      emit('resize');
      wake();
    });
    listen(window, 'pagehide', (event) => {
      if (event.persisted) stop();
      else api.destroy();
    });
    const resize = new ResizeObserver(() => emit('resize'));
    resize.observe(element);
    api.cleanup(() => resize.disconnect());
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      stop();
      emit('visibility', visible && !document.hidden);
      if (visible) wake();
    });
    intersection.observe(element);
    api.cleanup(() => intersection.disconnect());
    api.setParams(options.params);
    return api;
  }
  global.EffectAtlasRuntime = { scope, clamp };
})(window);

(function (global) {
  'use strict';
  const mounts = new WeakMap();
  function validate(items) {
    if (!Array.isArray(items) || items.length < 3 || items.length > 6)
      throw new RangeError('items must contain 3 to 6 entries');
    return items.map((item) => {
      if (!item || typeof item.title !== 'string') throw new TypeError('Each item needs a title');
      if (item.image != null && typeof item.image !== 'string') throw new TypeError('image must be a URL string');
      if (item.links != null && !Array.isArray(item.links)) throw new TypeError('links must be an array');
      const links = (item.links || []).map((link) => {
        if (!link || typeof link.label !== 'string' || (link.href != null && typeof link.href !== 'string'))
          throw new TypeError('Each link needs a label and an optional href');
        return { ...link };
      });
      return { ...item, alt: String(item.alt || ''), description: String(item.description || ''), links };
    });
  }
  function mountRotatingTabAccordion(element, options = {}) {
    let items = validate(options.items);
    if (mounts.has(element)) mounts.get(element).destroy();
    const api = global.EffectAtlasRuntime.scope(
      element,
      {
        spread: { type: 'number', min: 52, max: 64, default: 59.5 },
        duration: { type: 'number', min: 240, max: 600, default: 600 },
      },
      options,
      'rta-root',
    );
    const original = document.createDocumentFragment(),
      anchor = document.createComment('accordion original content');
    while (element.firstChild) original.append(element.firstChild);
    element.append(anchor);
    const object = document.createElement('div');
    object.className = 'rta-object';
    element.append(object);
    let entries = [],
      active = -1,
      vertical = false,
      hover = false,
      hoverIndex = -1,
      pointerDown = -1,
      pointerSelection = -1,
      layoutCount = 0,
      settingActive = false,
      keyboardFocus = false,
      lastPointer = null;
    const compact = element.dataset.accordionCompact === 'true';
    function layout() {
      if (api.destroyed) return;
      const width = object.clientWidth;
      if (!width) return;
      const n = entries.length,
        padding = compact ? Math.max(9, Math.min(12, width * 0.036)) : Math.max(16, Math.min(36, width * 0.0275)),
        baseHeight = compact ? 236 : 360;
      // Keep a constant-width open panel behind each clipped column. This is the
      // reference's motion: content never reflows while its neighbours give way.
      const base = 2 * padding + 1,
        free = Math.max(0, width - n * base),
        openWidth = base + (free * api.params.spread) / 100;
      const minimumClosedWidth = (width - openWidth) / (n - 1);
      object.style.setProperty('--rta-padding', padding + 'px');
      object.style.setProperty('--rta-duration', (api.reduced ? 0 : api.params.duration) + 'ms');
      entries.forEach((entry) => {
        entry.rotTitle.style.maxHeight = Math.max(64, baseHeight - 2.5 * padding - 46) + 'px';
      });
      const requiredClosedWidth =
        Math.max(0, ...entries.map((entry) => entry.rotInner.scrollWidth)) + (compact ? 12 : 20);
      // Measure all labels, independent of the selected item, so a long label
      // cannot make the orientation oscillate during an open/close operation.
      vertical = (!compact && width < 600) || requiredClosedWidth > minimumClosedWidth;
      object.dataset.layout = vertical ? 'vertical' : 'horizontal';
      let left = 0,
        objectHeight = baseHeight;
      entries.forEach((entry, i) => {
        const on = i === active,
          visible = active < 0 ? width / n : on ? openWidth : minimumClosedWidth,
          full = vertical ? width : openWidth;
        entry.panel.style.width = full + 'px';
        entry.panel.style.transform = vertical ? 'none' : 'translateX(' + left + 'px)';
        entry.panel.style.clipPath = vertical ? 'none' : 'inset(0 ' + Math.max(0, full - visible) + 'px 0 0)';
        entry.divider.style.transform = 'translateX(' + Math.max(0, visible - 1) + 'px)';
        entry.rotInner.style.transform = 'translateX(' + visible / 2 + 'px) translateX(-50%) rotate(180deg)';
        entry.heading.style.width = Math.max(20, full - 2 * padding - (vertical ? 24 : 0)) + 'px';
        const header = 2 * padding + entry.heading.scrollHeight;
        entry.button.style.height = vertical ? header + 'px' : '100%';
        entry.body.style.width = Math.max(20, full - 2 * padding) + 'px';
        entry.body.style.top = header + 'px';
        const contentHeight = entry.body.scrollHeight;
        entry.panel.style.height = vertical ? header + (on ? contentHeight + 8 : 0) + 'px' : '100%';
        objectHeight = Math.max(objectHeight, header + contentHeight + padding);
        left += visible;
      });
      object.style.height = vertical ? 'auto' : objectHeight + 'px';
      layoutCount++;
      if (!object.hasAttribute('data-layout-ready')) {
        // Commit the first complete arrangement before enabling transitions. A
        // parent may pause this card immediately while it waits below the fold.
        void object.offsetHeight;
        object.setAttribute('data-layout-ready', '');
      }
    }
    function setActive(index) {
      if (api.destroyed) return;
      index = index == null ? -1 : Number(index);
      if (!Number.isInteger(index) || index < -1 || index >= entries.length)
        throw new RangeError('active index is outside items');
      active = index;
      settingActive = true;
      entries.forEach((entry, i) => {
        const on = i === index;
        if (!on && entry.body.contains(document.activeElement)) entry.button.focus({ preventScroll: true });
        entry.panel.dataset.open = String(on);
        entry.button.setAttribute('aria-expanded', String(on));
        entry.body.inert = !on;
        entry.body.setAttribute('aria-hidden', String(!on));
      });
      settingActive = false;
      layout();
    }
    function build(next) {
      items = next;
      object.removeAttribute('data-layout-ready');
      object.replaceChildren();
      entries = [];
      hoverIndex = -1;
      pointerDown = -1;
      items.forEach((item, i) => {
        const panel = document.createElement('section');
        panel.className = 'rta-panel';
        panel.dataset.index = i;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rta-toggle';
        button.id = api.uid + '-tab-' + i;
        button.setAttribute('aria-controls', api.uid + '-body-' + i);
        button.setAttribute('aria-label', item.title);
        const number = String(i + 1).padStart(2, '0'),
          rot = document.createElement('span');
        rot.className = 'rta-rot';
        rot.setAttribute('aria-hidden', 'true');
        const rotInner = document.createElement('span');
        rotInner.className = 'rta-rot-inner';
        const rotNumber = document.createElement('span');
        rotNumber.className = 'rta-rot-number';
        rotNumber.textContent = number;
        const rotTitle = document.createElement('span');
        rotTitle.className = 'rta-rot-title';
        rotTitle.textContent = item.title;
        rotInner.append(rotNumber, rotTitle);
        rot.append(rotInner);
        const heading = document.createElement('span');
        heading.className = 'rta-heading';
        const num = document.createElement('span');
        num.className = 'rta-number';
        num.textContent = number;
        num.setAttribute('aria-hidden', 'true');
        const title = document.createElement('span');
        title.className = 'rta-label';
        title.textContent = item.title;
        heading.append(num, title);
        const chevron = document.createElement('span');
        chevron.className = 'rta-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        button.append(rot, heading, chevron);
        const body = document.createElement('div');
        body.className = 'rta-body';
        body.id = api.uid + '-body-' + i;
        body.setAttribute('role', 'region');
        body.setAttribute('aria-labelledby', button.id);
        if (item.links.length) {
          const list = document.createElement('ul');
          list.className = 'rta-list';
          item.links.forEach((link) => {
            const li = document.createElement('li'),
              a = document.createElement(link.href ? 'a' : 'span');
            a.className = 'rta-list-entry';
            if (link.href) a.href = link.href;
            const label = document.createElement('span');
            label.textContent = link.label;
            a.append(label);
            if (link.href) {
              const arrow = document.createElement('span');
              arrow.className = 'rta-arrow';
              arrow.textContent = '↗';
              arrow.setAttribute('aria-hidden', 'true');
              a.append(arrow);
            }
            li.append(a);
            list.append(li);
          });
          body.append(list);
        }
        if (item.image) {
          const image = document.createElement('img');
          image.className = 'rta-image';
          image.src = item.image;
          image.alt = item.alt;
          image.decoding = 'async';
          image.draggable = false;
          body.append(image);
        }
        if (item.description) {
          const description = document.createElement('p');
          description.className = 'rta-description';
          description.textContent = item.description;
          body.append(description);
        }
        if (item.href) {
          const a = document.createElement('a');
          a.className = 'rta-link';
          a.href = item.href;
          a.textContent = item.linkLabel || 'View project';
          body.append(a);
        }
        const divider = document.createElement('span');
        divider.className = 'rta-divider';
        divider.setAttribute('aria-hidden', 'true');
        panel.append(button, body, divider);
        object.append(panel);
        entries.push({ panel, button, title, heading, rot, rotInner, rotTitle, body, divider, chevron });
      });
      setActive(null);
    }
    const entryFrom = (target) => {
      const panel = target.closest('.rta-panel');
      return panel && panel.parentNode === object ? entries[Number(panel.dataset.index)] : null;
    };
    api.listen(object, 'pointermove', (event) => {
      if (event.pointerType === 'touch' || vertical) return;
      const point = [event.clientX, event.clientY];
      if (lastPointer && point[0] === lastPointer[0] && point[1] === lastPointer[1]) return;
      lastPointer = point;
      const entry = entryFrom(event.target);
      if (!entry) return;
      hover = true;
      if (hoverIndex !== entries.indexOf(entry)) {
        hoverIndex = entries.indexOf(entry);
        pointerSelection = active;
        setActive(hoverIndex);
      }
    });
    api.listen(object, 'pointerleave', () => {
      hover = false;
      hoverIndex = -1;
      lastPointer = null;
      const focus = document.activeElement,
        protectedFocus =
          entries.some((entry) => entry.body.contains(focus)) || (keyboardFocus && object.contains(focus));
      if (!vertical && !protectedFocus) setActive(null);
    });
    api.listen(object, 'pointerdown', (event) => {
      keyboardFocus = false;
      const entry = entryFrom(event.target);
      if (entry && event.target.closest('.rta-toggle')) {
        pointerDown = entries.indexOf(entry);
        pointerSelection = active;
      }
    });
    api.listen(object, 'pointercancel', () => {
      pointerDown = -1;
    });
    api.listen(object, 'click', (event) => {
      const entry = entryFrom(event.target);
      if (!entry || !event.target.closest('.rta-toggle')) return;
      const i = entries.indexOf(entry),
        previous = pointerDown === i ? pointerSelection : active;
      pointerDown = -1;
      pointerSelection = -1;
      setActive(!vertical && event.detail > 0 ? i : previous === i ? null : i);
    });
    api.listen(object, 'focusin', (event) => {
      const entry = entryFrom(event.target);
      if (entry && event.target === entry.button && pointerDown < 0 && !settingActive) {
        keyboardFocus = true;
        if (!vertical) setActive(entries.indexOf(entry));
      }
    });
    api.listen(object, 'focusout', (event) => {
      if (!vertical && !hover && !object.contains(event.relatedTarget)) setActive(null);
    });
    api.listen(object, 'keydown', (event) => {
      const entry = entryFrom(event.target);
      if (!entry) return;
      keyboardFocus = true;
      if (event.key === 'Escape') {
        event.preventDefault();
        entry.button.focus({ preventScroll: true });
        setActive(null);
        return;
      }
      if (event.target !== entry.button) return;
      const i = entries.indexOf(entry),
        keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      pointerDown = -1;
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? entries.length - 1
            : (i + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : entries.length - 1)) % entries.length;
      entries[next].button.focus();
    });
    api.frame(() => {
      layout();
      return false;
    });
    api.listen(object, 'load', () => api.wake(), true);
    api.on('resize', () => api.wake());
    api.on('params', layout);
    api.on('motion', layout);
    const contents = new ResizeObserver(() => api.wake());
    function observeContent() {
      contents.disconnect();
      entries.forEach((e) => {
        contents.observe(e.heading);
        contents.observe(e.body);
        contents.observe(e.rotInner);
      });
    }
    api.setItems = (next) => {
      if (api.destroyed) return;
      next = validate(next);
      const focused = object.contains(document.activeElement);
      build(next);
      observeContent();
      if (focused) entries[0].button.focus({ preventScroll: true });
    };
    api.setActive = setActive;
    api.refresh = layout;
    const pausedTransitions = new Set();
    function ownsTransition(animation) {
      const property = animation.transitionProperty,
        target = animation.effect && animation.effect.target;
      if (!property) return false;
      if (target === object) return property === 'height';
      return entries.some(
        (entry) =>
          (target === entry.panel && ['transform', 'clip-path', 'height', 'background-color'].includes(property)) ||
          ([entry.rotInner, entry.divider, entry.chevron].includes(target) && property === 'transform') ||
          ([entry.rot, entry.heading, entry.body].includes(target) && property === 'opacity'),
      );
    }
    function pauseTransitions() {
      for (const animation of object.getAnimations({ subtree: true }))
        if (ownsTransition(animation) && animation.playState === 'running') {
          pausedTransitions.add(animation);
          animation.pause();
        }
    }
    api.on('pause', (value) => {
      if (value) pauseTransitions();
      else {
        for (const animation of pausedTransitions)
          if (ownsTransition(animation) && animation.playState === 'paused') animation.play();
        pausedTransitions.clear();
      }
    });
    api.listen(object, 'transitionrun', () => {
      if (api.paused) pauseTransitions();
    });
    const status = api.status;
    api.status = () => ({
      ...status(),
      activeIndex: active,
      itemCount: entries.length,
      layout: vertical ? 'vertical' : 'horizontal',
      layoutCount,
    });
    api.cleanup(() => {
      pausedTransitions.clear();
      contents.disconnect();
      object.remove();
      if (anchor.parentNode) anchor.replaceWith(original);
      else element.prepend(original);
      if (mounts.get(element) === api) mounts.delete(element);
    });
    build(items);
    observeContent();
    mounts.set(element, api);
    return api;
  }
  global.mountRotatingTabAccordion = mountRotatingTabAccordion;
})(window);
