# jackkern.com

A single-page personal site: a sunlit Greek villa you scroll through, one room per project.
Design: `docs/superpowers/specs/2026-09-15-jackkern-3d-site-design.md`.

## Develop

    npm ci
    npm run dev          # /static/*.jpg: the last build's captures, or a placeholder before one
    npm run validate     # schema + cross-reference checks on kit/ and content/
    npm run typecheck

## Loading and moving through the villa

With WebGL, and without `prefers-reduced-motion: reduce`, the page opens straight into the villa:
its sky colour and a thin progress line while three.js downloads, then the entry court. Without
WebGL, with reduced motion, or without scripts, it shows the static version instead, an image of
every view and every panel.

The mouse wheel and touch swipes push the camera along its rail through a velocity that coasts to
rest: a wheel notch walks about half a metre, a trackpad flick coasts to a stop within a second, and
nothing moves it faster than 4 m/s. Every tuning constant is in `src/camera/travel.ts`. The arrow
keys, Page Up, Page Down, Space and the hotspot spheres glide to a viewpoint instead. The camera's
position and its look target follow two splines through the same points (`src/camera/rail.ts`),
with the view leaning a little ahead between viewpoints so it turns into a doorway before walking
through it.

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
