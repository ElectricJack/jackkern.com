# Task 16 verification: bootstrap the scene in `src/main.ts`

Evidence for the six-point manual browser checklist in
`docs/superpowers/plans/2026-09-15-greybox-promenade.md` (Task 16, Step 3).

## How to reproduce

```bash
npm install
npm run typecheck && npm test
npm run dev -- --port 5177 --strictPort      # in one shell
node docs/verification/task-16/checklist.mjs # in another; drives headless Chromium
node docs/verification/task-16/occlusion.mjs # pure geometry, no browser needed
```

`checklist.mjs` drives Playwright's bundled Chromium with
`--use-angle=swiftshader --enable-unsafe-swiftshader` (WebGL 2.0 over SwiftShader;
no GPU required) at 1280x720 and writes its screenshots to `tmp/verify/shots/`.
It reads the composited frames rather than the canvas: three.js leaves
`preserveDrawingBuffer` off, so an in-page `drawImage(canvas)` readback comes back
blank.

## Results (2026-09-15, node v24.15.0, vite 7.3.6, three 0.180.0)

| # | Checklist item | Result |
|---|----------------|--------|
| 1 | Entry court renders: floor, columns, blue pool + fountain, warm sky | all four render, **composition blocked** |
| 2 | Wheel scrolls forward; "Matter Engine" panel appears at the pool hall | pass |
| 3 | Translucent sphere at the doorway; clicking it glides and swaps the panel | glide + panel pass, **sphere not visible** |
| 4 | Arrow keys step viewpoints; the terrace shows no panel | pass |
| 5 | `?vp=5&capture=1` starts at the Outrider focal; `__villaReady === 5` | pass |
| 6 | `prefers-reduced-motion: reduce` drops the canvas for the static list | pass |

`entry-court.png` is item 1 as rendered. `pool-hall-vp1.png` is `?vp=1`, which
shows the same bootstrap composing correctly: colonnade, floor slabs, the blue
pool, the orange `fountain-wall` focal, warm sky, and the Matter Engine panel.

## The two shortfalls are in the layout, not the bootstrap

Both come from `layout/layout.js`, which Task 6 and Task 7 implemented verbatim
from the plan. `occlusion.mjs` reports them:

- `railFor` puts every court/courtyard viewpoint at `d / 2 - 1.5`, exactly 1.5 m
  short of the stop centre, and `fill` puts a 3 m `fountain-tiered` on that
  centre. The entry viewpoint therefore stands 1.51 m from a 3 m fountain, which
  covers 63% of the 3D viewport.
- Every hotspot anchor is placed *at* the feature it marks: a focal anchor at
  `worldPoint(stop, 0, d - 1.5, 1.0)` is inside the focal part, and a threshold
  anchor is on the exit cell, behind a wall, column or fountain. The marker
  material sets `depthWrite: false` but leaves `depthTest` on, so all 13 of 13
  markers are occluded. `Raycaster` only tests `markers.children`, so they stay
  clickable through the geometry -- which is why item 3's glide passes while the
  sphere itself cannot be seen.

## Note on item 6

The plan says the static images "404 until Task 17". Under `vite dev` they do not:
the SPA fallback answers `/static/entry-view.jpg` with `200 text/html` (index.html),
and the browser fails to decode it as an image. The visible result is the same --
broken images over a working static list -- and a built `dist` has no such
fallback.
