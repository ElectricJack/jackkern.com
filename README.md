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
Explicit Pause, opening project details or opening the project index cancels automatic departure
until the visitor continues. Hidden tabs and the reading view do not advance the tour or its timer.

Reduced-motion visitors also land in 3D, with automatic flight and ambient animation disabled.
They can move using the normal controls. Without WebGL or scripts, or with `?view=list`, the site
shows the reading version instead. `?capture=1` keeps the camera stationary for static captures.

Page-up wheel gestures and downward touch swipes move forward; the opposite gestures reverse.
Scroll intensity sets a sustained speed until the next project, from 0.72 to 2.592 m/s; automatic
flight uses 1.44 m/s. Arrow keys choose direction and Space pauses or resumes. Each leg follows
the continuous camera and look-target curves with smooth acceleration and jerk at its endpoints.
Tuning lives in `src/camera/travel.ts`; the ten-second tour waits live in `src/camera/director.ts`.

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
