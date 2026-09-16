# Landing in the villa and wheel travel (clear-stone.2)

Evidence that `/` opens straight into the 3D villa and that the wheel moves the camera
gently: eased, coasting, and never faster than the speed cap. The six-point Task 16
checklist was re-run for the same change; its results are in `../task-16/README.md`.

## How to reproduce

```bash
npm run build && npx vite preview --port 5392 --strictPort   # or: npm run dev -- --port 5391
VILLA_URL=http://localhost:5392 node docs/verification/villa-travel/travel.mjs
npx vitest run tests/camera                                    # the velocity model and the rail
```

`travel.mjs` drives Playwright's Chromium over SwiftShader at 1280x720. Its screenshots
are composited frames, not canvas readbacks. It reads the camera's motion on every
animation frame from `window.__villaTravel`, which `src/main.ts` exposes for this, and
writes its screenshots to `tmp/verify/travel/`.

## What changed

- **No gate.** With WebGL, and without `prefers-reduced-motion: reduce`, `src/entry.ts`
  starts the three.js chunk as soon as it runs. `#app` starts as `data-mode="boot"`,
  and a `(scripting: enabled) and (prefers-reduced-motion: no-preference)` media query
  in `src/styles.css` hides the static list and shows the loading state before any
  script runs, so the static list never flashes up first. The loading state is the
  villa's sky colour `#e8e4dc` with a 2 px progress line, and no spinner. The line creeps
  toward 70% while the chunk downloads, jumps as the scene builds, and fades out on the
  first drawn frame. Without scripts, with reduced motion, or without WebGL, the static
  list shows as before.
- **Wheel travel.** `src/camera/travel.ts` holds every constant. A wheel or touch delta,
  with `deltaMode` lines and pages normalised to pixels and clamped to 200 px an
  event, adds to a velocity that decays with a 0.2 s time constant and is capped at
  4 m/s. A push covers 5 mm a pixel in all, so a 100 px notch walks half a metre.
  Keys and hotspots still glide with their exponential ease. A glide now lands within
  0.1 mm of its viewpoint rather than 11 mm, so the landing frame turns the view by
  under 0.01°.
- **Camera path.** `src/camera/rail.ts` keeps two centripetal Catmull-Rom curves,
  positions and look targets, through the same path points and read at one shared
  parameter. Between viewpoints the view now leans half-way toward the target 2 m
  further along the walk, so it turns into a doorway before the camera gets there. The
  lean fades out within 1.5 m of a viewpoint, so a camera at rest frames it exactly as
  the layout composed it. The arc-length table went from 1000 samples for the whole
  walk to 400 per path span. The coarse table let the camera cover a centimetre of `u`
  at up to 1.6 times the distance, and a millimetre at 2.5 times where the walk doubles
  back at cy-4, which the speed cap could not see. It also put viewpoints up to 8 cm off
  their marks, so three visual references moved by a pixel's worth of edges and were
  re-accepted after comparing old, new and the diff.
- The static list's first image is now `loading="lazy"` like the rest. The list is
  hidden while the villa loads, and a hidden lazy image is never fetched, which saves a
  villa visitor 23.7 kB.

## Results (2026-09-16, built site under `vite preview`; the same four pass under `vite dev`)

| Check | Result |
|-------|--------|
| `/` shows the loading state (99.9% sky colour, progress line, static list hidden), then the entry court, with no buttons on the page and no input | pass |
| One 100 px wheel notch from rest: 0.490 m along the rail, then at rest | pass |
| A trackpad-style flick (10 events, 464 px) peaks at 3.68 m/s and is at rest 0.77 s after its last event | pass |
| A 200 px touch swipe up pushes to 1.64 m/s, coasts, and rests 0.990 m on | pass |
| A steady wheel (100 px every 100 ms) from the entry court to the terrace: 1385 frames, viewpoints 0..13 in order with none skipped, no frame backwards, top speed 3.68 m/s, every frame's step within 4 m/s × its frame time, ends at the terrace with no panel | pass |

- `loading.png`: the loading state, with the three.js chunk held back 2.5 s.
- `entry-court-on-load.png`: the entry court as `/` draws it with nothing clicked. It is
  byte-for-byte `../task-16/entry-court.png`, which was captured through the old launch
  button.
- `walk-contact-sheet.png`: the wheel walk, one frame each time the nearest viewpoint
  changed, so each is half-way between two stops, in motion. The seventh, cy-2, is a
  wall close up. That comes from the path as laid out, not from the look-ahead: over
  the whole walk the largest single stand-in covers the same share of the frame with
  the lean as without it (mean 0.495 against 0.496).
- `terrace-at-rest.png`: where the wheel walk came to rest. It matches the static
  capture `tests/visual/refs/terrace-view.png` with 0 differing pixels.

## Unit tests

- `tests/camera/travel.test.ts`: a notch is about half a metre; a push is spread over
  frames; a flick, and top speed, come to rest within a second; the cap holds however
  fast events arrive, and the excess is dropped rather than banked; one event
  contributes at most 200 px; a reverse push brakes before it reverses; distance does
  not depend on frame rate (30, 60 and 144 Hz agree within 1 cm); `deltaMode`
  normalisation.
- `tests/camera/rail.test.ts`: sampled every centimetre (11,210 samples), the camera
  stays inside the union of the stops' bounds, the view turns at most 0.4° per cm (the
  walk's sharpest turn is 0.29°/cm), and the look target stays over 2 m away. A
  centimetre of `u` is a centimetre of walk to within 1%. At rest on a viewpoint the
  pose matches the layout to within 1 mm. Mutations that each of these catch: dropping
  the fade at viewpoints (0.81°/cm), a fade over 5 cm (2.5°/cm), pushing path points out
  of the stops, a 2 cm step in the position curve, and a table as coarse as the old one
  (1.26×).
- `tests/camera/director.test.ts`: a notch through the director; no frame of travel
  moves the camera further than top speed allows; travel stops at either end of the
  walk; glides land exactly and hand back to travel; the landing frame turns the view
  by under 0.01° and by under a hundredth of the glide's largest turn (the old 11 mm
  landing fails this at 0.022°); wheel input is dropped during a glide.

## Lighthouse

`npx -y @lhci/cli@0.15.1 autorun` (what `npm run lighthouse` runs) against a copy of each
build's `dist/`, with `lighthouserc.json` unchanged: 3 runs each, mobile. On this WSL machine
`CHROME_PATH` has to point at Playwright's Chromium, or LHCI launches the Windows Chrome and
cannot connect to it.

| | Before (static list, `main` + calm-vault + clear-stone.1) | After (the villa) |
|---|---|---|
| Performance | 1, 1, 1 | not scored (`NO_LCP`) |
| Accessibility, best practices, SEO | 1, 1, 1 | 1, 1, 1 |
| First contentful paint | 909, 907, 955 ms | 1371, 1371, 1369 ms |
| Largest contentful paint | 1059, 1057, 1058 ms | none (`NO_LCP`) |
| Total blocking time | 0 ms | none (`NO_LCP`) |
| Speed index | 909, 907, 955 ms | 1489, 1495, 1580 ms |
| Cumulative layout shift | 0 | 0 |
| Script transfer (budget 8000 B) | 2522 B | 142676 B |
| Total transfer (budget 60000 B) | 30073 B | 146694 B |

Lighthouse's Chromium renders WebGL through SwiftShader, so it now measures the villa. Five
assertions fail: `categories:performance`, `largest-contentful-paint`, `total-blocking-time`,
`resource-summary:script:size` and `resource-summary:total:size`. The villa paints nothing
but its canvas, and a canvas is not a largest-contentful-paint candidate, so Lighthouse
cannot score performance, LCP, TBT or time to interactive. The 140 kB three.js chunk is
the script and total overage. With the first static image still eager, the first run
after this change also downloaded the hidden 23.7 kB `entry-view.jpg` (total 170439 B).
