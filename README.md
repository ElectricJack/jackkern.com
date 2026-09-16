# jackkern.com

A single-page personal site: a sunlit Greek villa you scroll through, one room per project.
Design: `docs/superpowers/specs/2026-09-15-jackkern-3d-site-design.md`.

## Develop

    npm ci
    npm run dev
    npm run validate     # schema + cross-reference checks on kit/ and content/
    npm run typecheck

## Build and check

    npm run build                       # dist/
    npx playwright install chromium     # once
    npm run render:static               # dist/static/*.jpg and tmp/visual/*.png
    npm run check:visual                # compare tmp/visual to tests/visual/refs
    node tools/check-visual.mjs tmp/visual tests/visual/refs --update   # accept new references
    npm run budgets                     # byte budgets (spec section 8)
    npm run check:links:external

## Add a project

1. Add a stop to `content/manifest.json` (kind `project`, an archetype, a focal part id from `kit/contract.json`, and a panel path).
2. Write `content/<id>.md`.
3. `npm run validate && npm test`, then `npm run render:static` and accept the new references.

The layout is generated from the manifest; nothing else needs editing.

## Deploy

Pushes to `main` build and publish to GitHub Pages through `.github/workflows/deploy.yml`.
`public/CNAME` carries the custom domain.

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
- `tools/` validate, content, capture, visual check, budgets, link check
- `tests/` Vitest suites and visual references
