# Integrate an effect with your AI

[简体中文](ai-integration.zh-CN.md) · [Repository home](../README.md) · [Effect directory](../effects/README.md)

## Choose the files to hand over

Browse the [effect directory](../effects/README.md), then copy the selected folder into your project. Include its JavaScript, CSS, demo and any bundled dependencies or licenses. You can also give your AI the repository and the effect's folder path.

For an agent searching the repository, [catalog.json](../catalog.json) is the starting point. Each entry includes English and Chinese descriptions, categories, a live preview URL, the folder, the exact mount function and its file dependencies. Read the chosen effect's files after selecting it; the whole collection does not need to enter the context window.

The first category is the effect's primary group. Other categories are additional discovery tags. Folder paths remain `effects/<slug>/` even when an effect belongs to several categories.

## Give the AI the page and the intended change

```text
Integrate effects/orbit-cursor/ into the header of this project.

Read the instructions at the top of effect.js and the mount call in index.html.
Use the project's existing layout and colors. Keep the effect's motion behavior.
Load the required CSS and scripts, and clean up the instance when the view unmounts.
Preserve the copyright notice and bundled licenses.

Explain any changes to the interaction and check the result at desktop and mobile widths.
```

Include the component or page where it belongs, your framework, and the content or colors you want to use. The selected effect's header is the authority for its options, DOM requirements and public API.

## Read the example before mounting

The `index.html` beside an effect shows its script load order, required markup and mount arguments. For Orbit Cursor, the basic setup is:

```html
<link rel="stylesheet" href="./effects/orbit-cursor/effect.css">
<div id="orbit" style="height: 240px"></div>
<script src="./effects/orbit-cursor/effect.js"></script>
<script>
  const fx = mountOrbitCursor(document.getElementById('orbit'));
</script>
```

Check the selected effect rather than applying this markup to every folder:

- Some effects render into an empty container; others enhance existing content. Reading Word Highlight takes an existing article. Edge Refraction Dispersion takes a viewport and its existing content child.
- Give the host a stable size when required. Some effects need an explicit height; Rotating Tab Accordion measures its content height.
- Curved Gallery, Disc Carousel and Hold to Burst load the bundled `three.min.js` before `effect.js`.
- Demo text, images and page layout may live in `index.html`. Copying only `effect.js` does not copy that example content.

## Fit the effect into your framework

Mount after the host element exists in the browser. Keep a reference to the returned instance and call its documented cleanup method when the view unmounts. In a framework with development remounts, perform cleanup between mounts.

Let the effect own only the DOM described by its contract. Avoid having the framework replace those same nodes while the effect is active. Effects that enhance existing nodes may have different ownership rules from effects that generate their own children.

Use the instance's documented parameter or content setters when available. Read the effect's header for the supported names: methods such as `setReducedMotion` and `setReduced` vary between effects. Do not assume every effect exposes the same API.

## If the result looks wrong

| Symptom | Check |
| --- | --- |
| The effect is blank | Host size, required markup, CSS load and script order. |
| A mount function is undefined | The entry point in `catalog.json`, then the matching demo's script tags. |
| A gallery is missing its images | Where the demo supplies the image content and whether those assets were copied. |
| It behaves differently after navigation | Cleanup on unmount, duplicate mounts and ownership of generated nodes. |
| Motion is reduced or absent | The effect's documented reduced-motion behavior and the device preference. |

The standalone demos need no build step. If your target app or hosting environment has different loading rules, adapt the paths in the application. Keep the copyright notice and the [Effect Atlas License](../LICENSE) with copied code.
