# jackkern.com

A single-page personal site: a sunlit Greek villa you scroll through, one room per project.
Design: `docs/superpowers/specs/2026-09-15-jackkern-3d-site-design.md`.

## Develop

    npm ci
    npm run dev          # /static/*.jpg: the last build's captures, or a placeholder before one
    npm run validate     # schema + cross-reference checks on kit/ and content/
    npm run typecheck

## Loading and moving through the villa

With WebGL, the page opens straight into the 3D villa. The camera starts after ten seconds of
inactivity at the entrance, measured from the first visible scene frame. It stops at each project's
reading view for ten seconds, then continues, coming to rest at the terrace. A countdown in the
footer shows when the next flight begins. Begin, Continue, scrolling and swiping can start it sooner.
Explicit Pause, interacting with a project card or opening the project index cancels automatic departure
until the visitor continues. Hidden tabs and the reading view do not advance the tour or its timer.

Reduced-motion visitors also land in 3D, with automatic flight and ambient animation disabled.
They can move using the normal controls. Without WebGL or scripts, or with `?view=list`, the site
shows the reading version instead. `?capture=1` keeps the camera stationary for static captures.

Page-up wheel gestures and downward touch swipes move forward; the opposite gestures reverse.
Scroll intensity sets a sustained speed until the next project, from 2.1 to 7.56 m/s; automatic
flight uses 4.2 m/s. Up/Right arrows go forward, Down/Left go backward, and Space pauses or resumes. Each leg follows
the continuous camera and look-target curves with smooth acceleration and jerk at its endpoints.
Tuning lives in `src/camera/travel.ts`; the ten-second tour waits live in `src/camera/director.ts`.

The full-width route map links the four projects, entrance and terrace. Courtyards remain
part of the tour, without quick-link buttons. Quick links and the header project index animate
the camera for 1.8 seconds: adjacent destinations follow the connecting rail, while distant
destinations visibly depart, fade to white while moving, cut forward/back along the rail,
then fade in while approaching and settling at the destination. Slow rendering extends the
animation rather than skipping its visible motion. Both ends are preloaded
and retained through the transition. Manual navigation animates even with the OS reduced-motion
preference; that preference still disables autoplay and ambient motion. The forward button
always goes forward, except the explicitly labelled return at the terrace. Explicit visits stay paused. Each project automatically reveals a
screenshot and a short explanation beside its sculpture, with a persistent link to the full
project site. Cards own their scrolling. The reading version is a separate editorial scroll
experience, with all project text and screenshots visible without expansion controls.

Every hanging has its own deterministic abstract painting, with each room using a coordinated palette:
Matter uses domain-warped mineral strata in verdigris; Outrider uses angular palette-knife
gestures in petrol blue; Agent Queue uses flow-field pigment ribbons in aubergine/clay;
Quilt uses interlaced warp/weft paint bands in oxide/umber. These are separate composition
algorithms, not recolorings. Shared canvas grain, scratches and splatters surround one
individually positioned gold gesture. All 36 paintings
are unique, including opposite faces of a wall. Packed height/roughness/metalness maps
make the gold catch the environment light while the pigment stays matte. Paintings are
generated only as rooms load, reuse their textures on return visits, and use half-resolution
maps on mobile. No additional image downloads are required.

Only the starting room and its visible neighbour block the first frame; shared assets warm
serially during idle time afterward. Nearby rooms stream in a bounded window. Mobile uses
simplified Meshopt models, smaller WebP textures, a 1.25 pixel-ratio cap, lower-detail sculptures,
and water waves without a second scene-rendering reflection pass. Rebuild the four optimized
mobile assets with `node tools/assets/optimize-mobile.mjs` (asset-tool dependencies required).
Matter's and Outrider's sculptures are lightweight three.js geometry. Agent Queue uses its
original Matter-exported connected-node relief; the surrounding architecture and materials
are also Matter Engine exports. Courtyards 2–4 have distinct water gardens: a potted olive island,
twin planted rills with a small spring, and a raised planted basin cascading into a lower pool.
All trees and ground plants in these courts are rooted in containers with visible soil.
Embedded project screenshots fill the card width at their natural aspect ratio.

`node tools/verify-feedback.mjs http://localhost:5173/` checks direct navigation, initial loading,
desktop/mobile project views, scrolling images, reduced motion, and the no-JavaScript page.

## Build and check

    npx playwright install chromium     # once
    npm run build                       # dist/, including dist/static/*.jpg and tmp/visual/*.png
    npm run preview                     # serve dist/; a missing file is a 404
    npm run probe                       # console errors, failed requests, broken images
    npm run render:static               # recapture the static views on their own
    npm run check:visual                # compare tmp/visual to tests/visual/refs
    node tools/check-visual.mjs tmp/visual tests/visual/refs --update   # accept new references
    npm run budgets                     # byte budgets (spec section 8)
    npm run check:links:external
    node tools/verify-auto-tour.mjs      # desktop/mobile landing, idle start, timed stops, manual pause

`npm run build` is `vite build` followed by the static capture: headless Chromium loads every
viewpoint of the built site and writes the fallback images the page links. Without Chromium the
capture is skipped with a warning and `dist/` has no fallback images; under CI a missing Chromium
fails the build instead. A capture that logs a console error, throws, or has a request fail or
answer 400 or more fails the build too.

`npm run probe` (`tools/console-probe.mjs`) serves `dist/`, loads `/` and `/?vp=5` under three GL
setups (`--modes swiftshader,gl,no-gpu`), waits for the villa to start, scrolls, presses ArrowDown,
simulates a lost WebGL context, clicks a hotspot, and fails on any console error, uncaught
exception, failed request, response of 400 or more, or broken image. It lists warnings without failing on them
(`--strict` fails on those too). Headless Chromium has no GPU, so every mode renders through
SwiftShader there; `--headed` opens real windows, which reach the GPU on a desktop or under WSLg.
`--url` probes a running server instead, such as `npm run dev`.

## Debugging in a browser

Add `?debug=1` to any URL: `http://localhost:5173/?debug=1`, `https://jackkern.com/?debug=1`,
`/?vp=5&debug=1`. A panel in the bottom-left corner lists everything the page reports as going
wrong, as it happens: uncaught errors, unhandled promise rejections, `console.error` and
`console.warn` calls (three.js reports shader and context problems this way), and images, scripts or
stylesheets that failed to load. **Copy** puts the list on the clipboard with the URL, browser, WebGL
renderer, viewport and page mode at the top, ready to paste into an issue; where the clipboard is not
available it shows the text selected instead. **Hide** folds the list away. Without the parameter
nothing is collected and the panel's code is never downloaded.

If the WebGL context is lost (a GPU reset, a driver update), the page shows the static version and
returns to the villa when the browser restores the context.

## Add a project

1. Add a stop to `content/manifest.json` (kind `project`, an archetype, a focal part id from `kit/contract.json`, and a panel path).
2. Write `content/<id>.md`.
3. `npm run validate && npm test`, then `npm run build` and accept the new references.

The layout is generated from the manifest; nothing else needs editing.

## Deploy

### Site icons

`public/favicon.svg` is the editable olive/ivory JK mark. The ICO (16/32px),
Apple touch icon (180px), and home-screen icons (192/512px) are generated from it:

```sh
node tools/assets/generate-icons.mjs .
```

The generator uses the existing `tools/assets` Sharp dependency. It also accepts
another website directory with `public/favicon.svg` and `public/site.webmanifest`.
`node tools/verify-icons.mjs <site-url>` checks browser discovery and icon formats,
sizes, opacity and deployment-relative paths. Bump the icon URL query versions in
`index.html` when changing a mark to refresh cached browser favicons.

### Publishing

The primary site is **https://electricjack.github.io/**. Its deployment workflow lives in
[ElectricJack/electricjack.github.io](https://github.com/ElectricJack/electricjack.github.io)
and builds this repository's source. After pushing the tested source to `main`, publish it with:

```sh
gh workflow run deploy.yml --repo ElectricJack/electricjack.github.io -f source_ref=main
```

Use a commit SHA instead of `main` to publish a specific tested revision. The root site's
`deployment.json` records the source and deployment revisions.

Pushes to `main` also publish the project preview at **https://electricjack.github.io/jackkern.com/**
through this repository's `.github/workflows/deploy.yml`. Both addresses use the same relative-URL
build. Custom domains are controlled by repository Pages settings;
[GitHub ignores `CNAME` files for Actions deployments](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
`jackkern.com` still points to its existing host; its DNS has not been changed.

### DNS for jackkern.com

At the registrar, point the apex at GitHub Pages with four A records
(185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) and `www` as a
CNAME to `electricjack.github.io`. After propagation, enable "Enforce HTTPS" in the
repository's Pages settings.

## Layout of the repo

- `content/` project manifest and panel Markdown
- `kit/` part vocabulary the layout and the Matter Engine kit both follow
- `layout/` pure JavaScript layout module, also run inside Matter Engine at bake time
- `src/` three.js runtime
- `tools/` validate, content, capture, console probe, visual check, budgets, link check
- `tests/` Vitest suites and visual references
