# Grey-box design pass — 2026-09-16

Implements the approved villa direction with the existing procedural stand-ins. No Matter models, textures, external fonts, or decoder dependencies were added.

## What changed

- An editorial entry, small identity/navigation header, progress footer, project index dialog, and terrace contact section.
- Compact project panes with distance-based fades, expandable details, and keyboard focus retention. Courtyards expose the whole scene. Expanded panes own their scrolling; HTML controls do not trigger scene hotspots.
- A complete styled document at `/?view=list`, also used without JavaScript/WebGL or with reduced motion. The skip link can switch to it without reloading.
- One through-route around the far side of the two turning courtyard fountains, replacing their 180-degree reversals. Existing clearance, footing, headroom, pose, and viewing-direction checks remain; a minimum-displacement assertion catches stalls.
- Wheel/touch input takes over a glide without a position jump; distant project navigation has a bounded travel speed.
- Portrait camera framing preserves horizontal field of view. Small landscape layouts keep headings below the header.
- The static grey-box scene redraws for movement, streaming, resize, restored context, and focus changes, instead of continuously redrawing while idle.

Quilt Trader copy was derived from `~/dev/quilt-trader/README.md` and its implementation: locally owned Parquet data, options execution assumptions, an agent-friendly CLI, and coordinator/worker execution. Its private-alpha status is explicit; the card links to contact until the source is public. Other project copy was tightened from existing repository content. Matter Engine copy describes future villa assets accurately.

## Verification

- `npm run validate`, `npm run typecheck`, and all 111 tests in 28 files pass.
- `npm run build` generates all 14 viewpoint captures. Desktop entry, project, courtyard, index, and terrace compositions were visually inspected, along with 390×844, 390×667, 320×568, and 844×390 layouts.
- `node docs/verification/design-pass/check.mjs` checks expanded-card scrolling, dialog dismissal/focus, project navigation, wheel takeover, skip navigation, emulated mobile touch, document links, reduced motion, and disabled JavaScript. Set `VILLA_URL` to test another server.
- `npm run probe` checks both launch URLs across three Chromium graphics configurations, wheel/keyboard/hotspots, and context loss/restoration. No page errors, failed requests, HTTP errors, or broken images. SwiftShader reports its usual ReadPixels warnings in two configurations.
- `npm run budgets` and `npm run check:links:external` pass. The byte-budget report is an uncompressed file-size check, not a measurement of real production transfer or GPU memory.

Browser testing uses Linux Chromium and software rendering. Mobile sizes and touch are emulated; physical iOS/Android GPU performance remains unmeasured. Final Matter assets and their export/compression pipeline are a later phase, described in the design document and asset list.

## Lighthouse and idle rendering

Three final mobile Lighthouse runs with the repository's unchanged configuration:

| Metric | Result |
| --- | --- |
| Performance | 92, 92, 91 |
| Accessibility / best practices / SEO | 100 / 100 / 100, all runs |
| First contentful paint | 905–948 ms |
| Largest contentful paint | 2191–2229 ms |
| Total blocking time | 302–336 ms |
| Cumulative layout shift | 0 |
| Script / total transfer in Lighthouse's server | 144,729 / 152,975 bytes |

The HTML introduction gives this build a measurable LCP (the previous canvas-only build reported `NO_LCP`). Idle-render instrumentation confirms zero WebGL draw calls while still, with drawing resuming on movement. Before this optimization, the new design scored 69 with 5.0–5.7 seconds of blocking time under software rendering.

**Lighthouse CI still fails four unchanged assertions:** performance below 95, blocking time above 100 ms, scripts above 8 KB, and total transfer above 60 KB. The transfer budgets predate automatic loading of the Three.js scene. No thresholds were raised. Startup work remains an optimization opportunity; these measurements do not establish physical mobile frame rates or deployed compression behavior.

Local production preview: `http://localhost:4321`, built from the working changes on `feat/villa-design-pass`. Nothing was published.

## Follow-up: make the 3D route reachable from the reading version

A visitor reported seeing only project text. Reproduced the reduced-motion route, where the existing “Explore the villa” link pointed to `/` and selected the same reading view again. Added explicit `/?view=scene` entry and an “Explore in 3D” link that overrides the default motion preference on that visit. Unsupported WebGL still uses the document. The reading view now explains whether it was selected explicitly, by reduced motion, by unavailable graphics support, or after a scene error.

Verified in Chromium with reduced motion: default reading view → explicit 3D → wheel movement, and explicit list → 3D. Checked that disabled WebGL shows an explanation even when 3D was requested. Type checking and the seven targeted boot, fallback, and build tests pass.
