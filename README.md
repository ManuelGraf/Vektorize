# Vektorize

Trace a raster image (photo, logo, sketch) into a vector SVG, in the spirit of Illustrator's
Image Trace. Everything runs in the browser — no server, no upload, no network request at all.

Sibling project to [Image Keyer](https://github.com/ManuelGraf/ImageKeyer); it shares that app's
typographic and color identity but not its dense pro-tool layout.

## How it traces

The engine runs entirely in a Web Worker so slider drags never block the UI:

1. **Blur** — a small separable box blur, sized from the Smoothness and Ignore-speckles
   sliders. Sensor noise would otherwise fragment flat regions into thousands of tiny shapes.
2. **Reduce colors** — median cut over a 5-bit RGB histogram, then a few Lloyd (k-means)
   refinement passes. Working on at most 32768 histogram buckets rather than every pixel keeps
   a 1MP image inside the interactive budget. Grayscale mode converts to luminance first;
   Black & White uses an Otsu threshold instead.
3. **Trace** — [vtracer](https://github.com/visioncortex/vtracer) (via the `wasm_vtracer` WASM
   build) fits polygons or Bézier splines to the flattened regions.
4. **Snap** — vtracer re-averages colors where it filters speckles, which can invent shades
   that were not in the palette. Every fill is snapped back to the nearest palette entry, so
   the output really does contain the number of colors the UI claims.

Step 2 is what makes the **Colors** slider exact. vtracer alone is steered by
`colorPrecision` (bits per channel) and `layerDifference`, neither of which corresponds to a
color count, so "6 Colors" would otherwise be a rough suggestion rather than a promise.

### Parameter mapping

| UI control | vtracer / pipeline |
| --- | --- |
| Colors (2–64) | palette size in the quantizer; vtracer set to `colorPrecision 8`, `layerDifference 0` so it preserves it |
| Ignore speckles (0–10) | `filterSpeckle` = value², plus blur radius |
| Smoothness (0–4) | `0` → polygon mode; above that spline mode with `cornerThreshold`, `spliceThreshold` and `lengthThreshold` scaled — centred so the default preset lands on vtracer's own defaults |
| Color / Black & White | vtracer `ColorMode::Color` vs `ColorMode::Binary` (fed an Otsu-thresholded image) |

## Privacy

The wasm module is inlined into the bundle as base64 at build time rather than fetched. That
lets the production CSP keep `connect-src 'none'`, so the app is provably incapable of making
any network request — which is the claim the empty state makes to the user.

## Development

```sh
npm install
npm run dev        # dev server
npm run typecheck  # tsc project references
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

Deployment is automatic: pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. `base` is `'./'`, so the app works from any path.

## Layout

Breakpoints are measured on the app root with a `ResizeObserver` (not media queries) because
the JS needs to branch on them too — Advanced is an inline panel on desktop and a bottom sheet
elsewhere, and Export moves from the header to a bottom bar on phones. The active breakpoint is
published as `data-layout` on `.app`, which the stylesheet keys off.

- phone `< 640px` · tablet `640–1023px` · desktop `≥ 1024px`
