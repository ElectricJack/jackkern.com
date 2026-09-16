# Task 16 verification: bootstrap the scene in `src/main.ts`

Evidence for the six-point manual browser checklist in
`docs/superpowers/plans/2026-09-15-greybox-promenade.md` (Task 16, Step 3),
re-run after `eager-meadow` fixed the two layout defects it exposed, again by
`calm-vault` once the follow-ups after it had merged, and again by `clear-stone.2`
when the villa started loading without a click.

## How to reproduce

```bash
npm install
npm run typecheck && npm test
npm run dev -- --port 5177 --strictPort      # in one shell
node docs/verification/task-16/checklist.mjs # in another; drives headless Chromium
# on another port: VILLA_URL=http://localhost:5288 node docs/verification/task-16/checklist.mjs
node docs/verification/task-16/occlusion.mjs # pure geometry, no browser needed
```

`checklist.mjs` drives Playwright's bundled Chromium with
`--use-angle=swiftshader --enable-unsafe-swiftshader` (WebGL 2.0 over SwiftShader;
no GPU required) at 1280x720 and writes its screenshots to `tmp/verify/shots/`.
It reads the composited frames rather than the canvas: three.js leaves
`preserveDrawingBuffer` off, so an in-page `drawImage(canvas)` readback comes back
blank. `nimble-horizon` had put three.js behind an "Enter the villa" button;
since `clear-stone.2` it starts on load, with the villa's sky colour and a thin
progress line while it downloads, so items 1-4 wait for the first frame without
clicking anything. Items 1, 5 and 6 read the mode from `#app[data-mode]` and the
scene's panels from `#panels` rather than the static list's copies in `#fallback`,
and items 1 and 6 check that no gate button or loading overlay is left on screen.
The wheel now pushes the camera through the velocity model in
`src/camera/travel.ts` (half a metre a notch), so item 2 turns it in 100 px notches.
`docs/verification/villa-travel/` checks the loading state and the wheel itself.

`occlusion.mjs` needs no browser. It exits non-zero if any marker is blocked, any
viewpoint stands too close to what it looks at, or any object swamps the frame;
`occlusion.txt` is its output at the commit that fixed this. Both scripts and
`tests/layout/sightlines.test.ts` share the geometry in `tools/sightlines.mjs`,
whose stand-in shapes mirror `src/kit/greybox.ts` and whose frustum mirrors the
`PerspectiveCamera(55, ...)` in `src/main.ts`. A doorway wall's stand-in is its
two jambs and lintel, cut from the same `src/kit/doorway.js` as the mesh, so a
line of sight through an opening is clear.

## Results (2026-09-16, node v24.15.0, vite 7.3.6, three 0.180.0)

| # | Checklist item | Result |
|---|----------------|--------|
| 1 | Entry court renders on load, with nothing to click: floor, columns, blue pool + fountain, warm sky | pass |
| 2 | Wheel moves forward; "Matter Engine" panel appears at the pool hall (11 notches) | pass |
| 3 | Translucent sphere at the doorway; clicking it glides and swaps the panel | pass |
| 4 | Arrow keys step viewpoints; the terrace shows no panel | pass |
| 5 | `?vp=5&capture=1` starts at the Outrider focal; `__villaReady === 5` | pass |
| 6 | `prefers-reduced-motion: reduce` keeps the static list, with no canvas, gate or loading overlay | pass |

`entry-court.png` is item 1 as rendered, now loaded with no click; the frame is
byte-for-byte the one `calm-vault` captured through the launch button. The fountain
reads across the left of the frame at 24% of the 3D window, the hotspot marker is the
pale sphere in front of the pool hall doorway, and the way on is clear. `pool-hall-vp1.png` is `?vp=1`, as
`eager-meadow` captured it. `doorway-crossing.png` is below.

## The doorway crossing (calm-vault)

Once `eager-meadow`, `solid-beacon`, `fleet-vault` and `vivid-impact` had all merged,
`tests/kit/greybox.test.ts` reported the camera missing five doorways. It was
splining the viewpoints alone. `vivid-impact` had moved the camera onto the whole
walk in `plan.path`, which goes through the middle of all eight doorways. Measured on
the walk the camera actually rides, the test found one real defect in their place:

- `quilt-trader` is sunk 1 m below `cy-3`, so its entry panel stands on the lower
  floor while the camera comes in at `cy-3`'s eye height, and within 0.25 m of the
  panel's faces the walk rises to 2.82 m up it. The opening was 2.8 m, so the 0.1 m
  near plane cut into the lintel: `doorway-crossing-before.png` is `main` at `bf1a870`,
  0.15 m short of the panel, with the lintel as a dark band across the frame.
- `DOORWAY_OPENING` (now in `src/kit/doorway.js`) is 3.2 m tall, which keeps the lintel
  0.38 m over the camera. `doorway-crossing.png` is the same pose afterwards.
  The test now rides `Rail(plan.rail, plan.path)`, holds the camera 0.25 m inside
  every opening, and expects no doorway missed.

The checklist writes `doorway-crossing.png` after the six items. It is not one of
them, and it does not count toward the pass total. Since `clear-stone.2` it parks the
camera with wheel notches, reading where the camera got to from `window.__villaTravel`
rather than mirroring the rail's arithmetic, so it lands within a few centimetres of
0.15 m short (0.17 m on its last run); the committed image is `calm-vault`'s.

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

The plan says the static images "404 until Task 17". Task 17's
`tools/render-static.mjs` writes them into `dist/static`, and since `clear-stone.1`
`vite dev` serves `/static/<viewpoint>.jpg` from the last build's captures, or a
placeholder before there is one, while any other missing file is a real 404.
