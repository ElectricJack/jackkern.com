# Task 16 verification: bootstrap the scene in `src/main.ts`

Evidence for the six-point manual browser checklist in
`docs/superpowers/plans/2026-09-15-greybox-promenade.md` (Task 16, Step 3),
re-run after `eager-meadow` fixed the two layout defects it exposed.

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

`occlusion.mjs` needs no browser. It exits non-zero if any marker is blocked, any
viewpoint stands too close to what it looks at, or any object swamps the frame;
`occlusion.txt` is its output at the commit that fixed this. Both scripts and
`tests/layout/sightlines.test.ts` share the geometry in `tools/sightlines.mjs`,
whose stand-in shapes mirror `src/kit/greybox.ts` and whose frustum mirrors the
`PerspectiveCamera(55, ...)` in `src/main.ts`.

## Results (2026-09-15, node v24.15.0, vite 7.3.6, three 0.180.0)

| # | Checklist item | Result |
|---|----------------|--------|
| 1 | Entry court renders: floor, columns, blue pool + fountain, warm sky | pass |
| 2 | Wheel scrolls forward; "Matter Engine" panel appears at the pool hall | pass |
| 3 | Translucent sphere at the doorway; clicking it glides and swaps the panel | pass |
| 4 | Arrow keys step viewpoints; the terrace shows no panel | pass |
| 5 | `?vp=5&capture=1` starts at the Outrider focal; `__villaReady === 5` | pass |
| 6 | `prefers-reduced-motion: reduce` drops the canvas for the static list | pass |

`entry-court.png` is item 1 as rendered: the fountain reads across the left of the
frame at 24% of the 3D window, the hotspot marker is the pale sphere in front of
the pool hall doorway, and the way on is clear. `pool-hall-vp1.png` is `?vp=1`.

## What the first run found, and what changed

The first run of this checklist (items 1 and 3) failed on two defects in
`layout/layout.js` — not in Task 16's `src/main.ts`. They were filed and fixed as
`eager-meadow`:

- `railFor` put every court/courtyard viewpoint at `d / 2 - 1.5`, exactly 1.5 m
  short of the stop centre, where `fill` stands a 3 m `fountain-tiered`. The entry
  camera was **1.51 m from the fountain, which covered 63%** of the 3D window.
  Viewpoints now stand back far enough to see the whole centrepiece, stepping into
  the side aisle where a shallow stop cannot give that distance head-on.
- Every hotspot anchor sat *at* the feature it named — a focal anchor inside the
  focal piece, a threshold anchor on the exit cell behind a wall or fountain — so
  **13 of 13 markers were occluded**. `Raycaster` only tests `markers.children`, so
  they stayed clickable through solid geometry, which is what made it easy to miss.
  Anchors now float in open air short of what they name, and all 13 are visible.

Two measurement bugs in this directory were fixed at the same time, both of which
had masked or overstated what the render showed:

- `discVsRing` in `checklist.mjs` compared a fixed 10 px disc against a ring 20–30 px
  out. A 0.35 m marker sphere is 36–86 px in radius at these anchor distances, so
  the ring always landed *on the sphere itself* and item 3 could never report a
  visible marker, whatever the layout did. It now scales both radii to the sphere's
  own projected size.
- `occlusion.mjs` modelled every part as a square in plan (`max(hx, hz)` on both
  axes), which turned a 0.3 m-thick wall into a 3 m-deep block reaching 1.35 m into
  the room. It now rotates the real extents by the placement's quarter-turn yaw.

Both fixes were checked against the pre-fix layout: they still report the original
failures there (63% of the frame, `NOT VISIBLE`, 13/13 blocked), so they sharpen
the measurement without softening the bar.

## How "swamps the frame" is measured

`#panels` is 420 px wide against the right edge (`src/styles.css`), so the 3D is seen
through x < 860 of 1280, and coverage is measured over that window — which reproduces
the 63% originally reported for the entry fountain. The bar is per *part*, as
`eager-meadow` states it: **no single part over ~25%**. Two things are excluded, and
both are visible in the report so the judgement can be checked:

- **The enclosure.** Walls, columns, entablature and floor slabs are the room itself,
  not obstacles in it.
- **The subject.** A room's own focal piece is what the room is for. `agent-queue` is
  a 6×6 exedra holding a 3 m × 3 m `relief-a`: it covers 48% of the window from the
  entry viewpoint and 65% from the focal viewpoint, and no camera position in a room
  that size gets it below that. It was 98% before this change.

Counting every blue pixel instead — pool basin and fountain together, as this
checklist first did — is not a workable bar: a 3 m × 3 m pool in a 9 × 6 courtyard
never falls under 25% from anywhere a visitor can stand. Item 1 therefore tests the
largest single part and reports the blue share alongside it as context.

## Note on item 6

The plan says the static images "404 until Task 17". Under `vite dev` they do not:
the SPA fallback answers `/static/entry-view.jpg` with `200 text/html` (index.html),
and the browser fails to decode it as an image. The visible result is the same --
broken images over a working static list -- and a built `dist` has no such
fallback.
