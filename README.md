# Mona Lisa, painted in pure JavaScript

One HTML file that paints the Mona Lisa in front of you: 62,430 brush strokes, biggest brush first, laid down by code.

There is no image in it. No assets, no libraries, no network requests. Download `index.html`, turn off your wifi, open it.

```
open index.html
```

## What is on screen

The page is composed for a 16:9 frame (1920 × 1080) and scales to any window. A tall or narrow window gets just the panel and the controls.

- **The panel.** A bare gessoed panel that gets painted in about 41 seconds. It starts slowly enough to watch single strokes land and speeds up as the brushes get smaller.
- **The brush.** Drawn hair by hair every frame: tuft, nickel ferrule, varnished handle with its grain and the brush size stamped on it. Flats have a square end, filberts a rounded one, rounds a point. It lifts between strokes, lands, splays under pressure, drags its hairs behind the stroke, and carries the colour it is laying down.
- **The loupe.** Follows the brush tip at ×4. Hover the panel to look anywhere; scroll to zoom from ×3 to ×60. When the panel is still (paused or finished) the loupe repaints that spot from the stroke list at its own scale, instead of enlarging pixels.
- **The palette.** Nine pigments, found by clustering the colours the strokes actually use. The pile nearest the colour on the brush is ringed, and each new colour leaves a smear in the mixing area.
- **The brushes.** Seven passes from a No. 40 flat down to a No. 000 liner, each with its stroke count, ticked off as it finishes. The brush in use shows the colour it is carrying.
- **Under the brush.** The 12 bytes of the stroke being painted right now, in hex, and what they decode to.
- **Raking light.** Press `L` to light the paint's relief from the upper left. The colours underneath do not change; turn it off and the panel is the plain painting again. (The loupe always shows plain colour.)
- **Sound.** Press `M` for a bristle swish per stroke, synthesised from noise in the page. Off by default.
- **The ledger.** Images, network requests and external files, counted live from the document while it runs. All three read 0.
- **The last stroke.** When it lands, the brush leaves and the picture light warms up.

| Key | |
|---|---|
| `space` | pause / play |
| `R` | replay |
| `S` | speed: 1× → 2× → 4× → ½× |
| `E` | jump to the finished painting |
| `L` | raking light |
| `M` | sound |

You can also drag the timeline at the bottom.

## No image. Check it yourself.

```
node tools/verify.js
```

It needs Node and nothing else. It runs 34 checks and exits non-zero if any fail:

1. **`index.html` is exactly the build of `src/`.** Nothing was added by hand after the build.
2. **The page contains nothing that is, loads or fetches an image.** No `<img>`, `<svg>`, `<video>`, `<link>`; no `src`, `href` or `url()`; no `data:`, `blob:` or `http:` text anywhere; no `drawImage`, `Image`, `createImageBitmap`; no `fetch`, XHR, WebSocket; no `eval`, `import`, Worker; no `innerHTML`; no storage. It also rules out the usual ways of hiding those names: computed property names, aliases, template literals, a second encoded payload, pixel data written out as a list of numbers. Without the stroke list the page is about 70 KB of markup, CSS and code.
3. **The browser is told to refuse.** The page carries a Content-Security-Policy of `default-src 'none'` (only its own inline script and style are allowed). An image, font, media file, frame or network connection would be blocked by the browser even if the code asked for one.
4. **The stroke list is a stroke list.** It is a whole number of 12-byte records; it does not start with a PNG, JPEG, GIF, WebP, gzip, zip or any other image or archive signature; every record decodes to a legal stroke; brush width shrinks as the list goes on; positions are not in raster order.
5. **What gets published is all text.** Every file git tracks is checked: no image, font, media or binary file, and no encoded payload outside the stroke list.

The verifier is a list of patterns, so it can show the absence of the things it names, not prove a negative. The policy in point 3 is the part the browser enforces. You can also check by hand: open DevTools → Network and reload (the document is the only request the page makes; a browser may ask a web server for `favicon.ico` on its own), or search `index.html` for `<img`, `data:` and `http`.

The page uses your system's fonts for its text. Everything else you see — panel, brush, palette, wood grain, loupe, wall grain — is drawn by the JavaScript in the file.

## How the painting was made

This part matters for the "no cheating" claim, so plainly:

**A painter program looked at a reference photo of the painting while it worked, the way a copyist sits in front of the original.** The photo is not in this repository and not in the page. What ships is the list of brush strokes the painter decided on.

The reference was small: 300 × 447 pixels. `painter/prepare.py` enlarges it to the 600 × 894 working size, and the accuracy figures below are measured against that enlarged target.

The painter (`painter/optimize.js`) repeats one question: *where is the canvas most wrong, and which single brush stroke would fix the most of it?*

1. It keeps an error map between the canvas and the reference, weighted so the face and hands matter most.
2. It picks a spot where the error is high.
3. It proposes 28 strokes there, with different headings, lengths, widths, bends and opacities. Most start along the local edge direction of the reference.
4. For each one it solves for the best paint colour and measures how much total error the stroke would remove.
5. It refines the best candidate with 44 small mutations and keeps the winner.
6. It does this in seven passes, from 118-unit brushes down to 0.8.

The painter uses the same brush code as the page (`src/brush.js`) and snaps every candidate to what the 12-byte record can hold before judging it, so the page lays down exactly the strokes the painter evaluated.

The run is deterministic (a fixed seed, no clock, no threads): an independent re-run from the same reference reproduced this stroke list byte for byte. It takes roughly half a minute on a laptop. The result differs from the reference by an RMSE of 1.24 out of 255.

### Is a stroke list just an image in disguise?

A faithful copy of a painting has to carry a painting's worth of information, and this one does: 749,160 bytes of strokes. That is not a compressed photo and not smaller than one — it is about 1.9 times the 402,300 raw RGB bytes of the 300 × 447 reference, and more than half the strokes (57%) are no wider than one reference pixel. The fine passes are doing a copyist's work at the limit of what the reference shows.

What makes it a painting and not a bitmap:

- Each record is a brush mark — centre, heading, length, width, bend, colour, opacity. There are no pixels in it.
- Order matters. Stop the replay anywhere and you get an earlier state of the painting, from rough blocking-in onward. Replay the same strokes in shuffled order and the RMSE goes from 1.24 to 16.5; in reverse order, 33.1.
- It is not tied to a pixel grid. `node tools/render.js 3` replays it at 1800 × 2682; the page renders at your screen's pixel density, and the loupe re-renders small areas at up to ×60. Enlarging adds no detail the reference did not have — it shows the strokes more closely.
- The strokes are visible as strokes: bristle streaks, dry-brush tails, round landings and pointed lifts.

## The brush

A stroke is rasterised from seven numbers and a seed (`src/brush.js`):

- **Spine.** A parabola across the stroke, like a wrist turning.
- **Body.** Lands round, bellies out under pressure, lifts to a point.
- **Hairs.** Clumps and single hairs, each a little lighter or darker than its neighbour, wandering across the stroke as it is dragged.
- **Paint load.** The brush runs dry toward the lift: hairs drop out and the ground shows through the tail. How dry depends on the seed.
- **Relief.** How thick the paint sits — ridges along the hairs, a lip at the edges. Colour never depends on it; raking light reads it.

Everything is defined in work units (the panel is 600 × 894), so a stroke can be rasterised at any scale or into any window of the panel.

Record layout, 12 bytes: `x u16, y u16, heading u8, length u8 (log), width u8 (log), bend i8, r, g, b, opacity u8 (2-bit code)`.

## Repository

```
index.html            the painting — open this
src/brush.js          the brush engine (shared by painter and page)
src/tool.js           the visible brush, drawn with canvas paths
src/app.js            the studio: pacing, loupe, palette, rack, timeline, sound
src/page.html         markup and CSS
src/strokes.js        the stroke list (base64 text), written by the painter
painter/optimize.js   the painter
painter/prepare.py    turns your own reference photo into what the painter reads
tools/build.js        folds src/ into index.html
tools/verify.js       the audit above
tools/render.js       replays the strokes offline to a PPM at any scale
tools/strokes.js      reads src/strokes.js for the other tools
tools/compare.py      side-by-side board: reference vs painting
```

No dependencies. `tools/` and `painter/optimize.js` need Node; the two Python helpers need Pillow (and numpy for `compare.py`).

## Paint it again

To re-run the painter you need your own reference photo; none is included.

```
python3 painter/prepare.py path/to/reference.jpg   # writes work/target.rgb (git-ignored)
node painter/optimize.js                           # writes src/strokes.js
node tools/build.js                                # writes index.html
node tools/verify.js
```

The importance weights in `painter/optimize.js` (face, eyes, mouth, hands) and the crop boxes in `tools/compare.py` are placed for this composition. For a different picture, move them.

Useful while tuning:

```
node tools/render.js 2 work/render.ppm 1830        # the first 1,830 strokes at 2×
python3 tools/compare.py work/render.ppm work/board.png
```

## Hooks for testing

`index.html?end` opens on the finished painting, `?at=N` seeks to stroke N and pauses, `?light` starts with raking light on, and `?sync` makes seeks and loupe re-renders finish within one frame. `window.__mona` exposes `seek(n)`, `replay()`, `light(on)`, `hover(x, y, zoom)`, `state()` and `checksum()` for automated captures. None of them loads anything.

`checksum()` sums the panel's pixels. `node tools/render.js <S>` prints the same sum for the same scale (`state().S`), which is how the page was confirmed to paint pixel-for-pixel what the offline replay paints.

## Numbers

| | |
|---|---|
| Strokes | 62,430 |
| Stroke data | 749,160 bytes (12 per stroke) |
| `index.html` | 1.07 MB |
| Reference | 300 × 447 photo, enlarged to 600 × 894 for painting |
| RMSE vs the enlarged reference, at 600 × 894 | 1.24 / 255 |
| RMSE vs the enlarged reference, replayed at 3× and scaled back | 1.30 / 255 |
| Painter run | roughly half a minute, one thread |
| Full replay at 3× (Node) | 1–2 s |

| Pass | Brush | Width (work units) | Strokes |
|---|---|---|---|
| Blocking in | No. 40 flat | 60 – 118 | 110 |
| Big shapes | No. 24 flat | 26 – 60 | 420 |
| Form | No. 14 filbert | 12 – 26 | 1,300 |
| Modelling | No. 8 filbert | 6 – 12 | 3,600 |
| Drawing | No. 4 round | 3 – 6 | 9,000 |
| Detail | No. 1 round | 1.6 – 3 | 18,000 |
| Finishing | No. 000 liner | 0.8 – 1.6 | 30,000 |

The brush names are labels for the passes. The widths are the range each pass proposes from; refining a stroke may stretch it up to 25% wider or 30% narrower.

## Credits

- The painting is Leonardo da Vinci's, c. 1503–19, in the public domain.
- The approach — give a program a photo to look at, let it paint with a coded brush, and use a model's eyes as the critic — follows [a post by Kevin T. Ngo](https://x.com/kevin_t_ngo/status/2095892143424655581) describing a Mona Lisa painted this way.
- The code was written by Claude in Claude Code, which also acted as the critic: it rendered the canvas, put the face and hands next to the reference, and revised the painter and the brush. A second round of independent Claude reviewers audited the no-image claim, the code and the layout before release.

MIT licensed. See `LICENSE`.
