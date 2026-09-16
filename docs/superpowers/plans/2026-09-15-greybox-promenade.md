# Grey-box Promenade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship milestone 1 of the villa site: a scrollable, clickable 3D promenade through grey-box stand-in rooms, one per project, with HTML panels, streaming, a static fallback, and CI budgets, so the real kit and bakes can drop in later without runtime changes.

**Architecture:** A pure JavaScript layout module turns `content/manifest.json` and `kit/contract.json` into a placement list, a camera rail, hotspots, and per-stop bounds, hashed for later bake stamping. A small TypeScript runtime on three.js renders that list from a procedural grey-box kit, drives the camera along the rail in scroll and node modes, streams stops in and out, and shows plain-HTML project panels. Node tools validate schemas, build content, render static fallback images with headless Chromium, and enforce byte budgets.

**Tech Stack:** Node 24, Vite 7, TypeScript 5, three.js r180, Vitest 3, Ajv 8, marked 16, quickjs-emscripten, Playwright (Chromium), pixelmatch + pngjs. GitHub Pages via the existing Actions deploy.

**Spec:** `docs/superpowers/specs/2026-09-15-jackkern-3d-site-design.md`

## Global Constraints

- Layout module (`layout/*.js`) is pure ES modules with **no imports** outside `layout/`, no `Date`, no `Math.random`, no floating-point shortcuts; it must run unchanged under QuickJS.
- Layout hash: 64-bit FNV-1a over canonical JSON (sorted keys, no whitespace, numbers as `toFixed(6)`), implemented inside the module.
- Grid module 1 m; column bay 3 m; every stop footprint is a multiple of 3 m.
- Instance ids are `<stop>.<part>.<n>` and viewpoint ids are `<stop>-<name>`; both must be safe Windows filenames (no `:`).
- Scroll order equals manifest order; the chain is entry court, room, courtyard, room, ..., courtyard, terrace.
- Text is HTML, never texture. Every project panel is present in the served HTML.
- Budgets (fail CI): first load 12 MB; any single stop 6 MB; any single texture 1.5 MB; whole `assets/` folder 80 MB.
- Vite `build.assetsDir` is `bundle` so the JavaScript bundle never collides with `assets/kit` and `assets/bake`.
- No UI framework. three.js is the only runtime dependency of size.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Before you start

1. Merge pull request #1 (`aq/steady-torrent`, the scaffold) into `main`. This plan modifies its files.
2. `git checkout main && git pull && git checkout -b feat/greybox-promenade`.
3. Node 24 (`.nvmrc`). Run `node --version` and confirm `v24`.

## File structure

| Path | Responsibility |
|---|---|
| `index.html` | Vite entry: canvas, panels container, script tag. |
| `src/styles.css` | Layout of canvas and panel column; static mode. |
| `src/main.ts` | Bootstrap: capability check, scene, director, streamer, panels, capture hook. |
| `src/types.ts` | Shared TypeScript types for manifest, contract, layout output. |
| `src/kit/greybox.ts` | Procedural stand-in geometry and material per part. |
| `src/kit/loader.ts` | `KitLoader` cache over a `KitSource`; bake stamp check. |
| `src/scene/builder.ts` | `StopHandle` (instanced meshes per stop) and `buildScene`. |
| `src/scene/streamer.ts` | Load/unload window over stop order. |
| `src/camera/rail.ts` | Catmull-Rom curves through viewpoints; arc-length fractions. |
| `src/camera/director.ts` | Scroll/glide state machine that owns the camera. |
| `src/input/bindings.ts` | Wheel, touch, keyboard, hotspot click; hotspot markers. |
| `src/panels/panels.ts` | Panel markup and show/hide. |
| `src/fallback/static.ts` | WebGL and reduced-motion detection; static markup. |
| `layout/hash.js` | `canonical`, `fnv1a64`. |
| `layout/rng.js` | `mulberry32`, `int`, `pick`. |
| `layout/layout.js` | `sequence`, `fill`, `railFor`, `boundsFor`, `layout`, `LayoutError`. |
| `layout/layout.d.ts` | Types for the JS module. |
| `kit/contract.json`, `kit/contract.schema.json` | Part vocabulary and its schema. |
| `content/manifest.json`, `content/manifest.schema.json`, `content/*.md` | Rail stops, schema, panel Markdown. |
| `tools/validate.mjs` | Schema plus cross-reference validation. |
| `tools/content.mjs` | Markdown to panel content. |
| `tools/render-static.mjs` | Headless capture of every viewpoint. |
| `tools/check-visual.mjs` | Pixel comparison against committed references. |
| `tools/budgets.mjs` | Byte budgets over `dist/`. |
| `tests/**` | Vitest suites mirroring the modules above. |
| `.github/workflows/ci.yml`, `deploy.yml` | Updated pipelines. |

---

### Task 1: Toolchain: Vite, TypeScript, three.js, Vitest on top of the scaffold

**Files:**
- Modify: `package.json`
- Create: `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`, `src/vite-env.d.ts`
- Delete: `src/index.html`, `src/site.js`, `tools/build.mjs`, `tools/dev.mjs`
- Modify: `.gitignore` (add `tmp/`)
- Test: `tests/smoke/build.test.ts`

**Interfaces:**
- Produces: `npm run build` writes `dist/index.html`, `dist/bundle/*.js`, `dist/CNAME`. `npm test` runs Vitest over `tests/**/*.test.ts`.

- [ ] **Step 1: Replace package.json**

```json
{
  "name": "jackkern.com",
  "version": "2.0.0",
  "private": true,
  "description": "Jack Kern's projects as rooms of a sunlit villa",
  "license": "MIT",
  "author": "Jack Kern",
  "homepage": "https://jackkern.com",
  "repository": { "type": "git", "url": "git+https://github.com/ElectricJack/jackkern.com.git" },
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "validate": "node tools/validate.mjs",
    "test": "vitest run",
    "render:static": "node tools/render-static.mjs --png tmp/visual",
    "check:visual": "node tools/check-visual.mjs tmp/visual tests/visual/refs",
    "check:links": "node tools/link-check.mjs dist",
    "check:links:external": "node tools/link-check.mjs dist --external",
    "budgets": "node tools/budgets.mjs",
    "lighthouse": "npx -y @lhci/cli@0.15.1 autorun"
  },
  "dependencies": {
    "three": "^0.180.0"
  },
  "devDependencies": {
    "@types/three": "^0.180.0",
    "ajv": "^8.17.1",
    "jsdom": "^26.1.0",
    "marked": "^16.1.0",
    "pixelmatch": "^7.1.0",
    "playwright": "^1.55.0",
    "pngjs": "^7.0.0",
    "quickjs-emscripten": "^0.31.0",
    "typescript": "^5.9.2",
    "vite": "^7.1.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create tsconfig.json** (tests are excluded from `tsc` on purpose: Vitest transpiles them, and they pass raw JSON fixtures into typed functions)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "allowJs": true,
    "checkJs": false,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src", "layout", "tools", "vite.config.ts"]
}
```

- [ ] **Step 3: Create vite.config.ts (content plugin arrives in Task 3; start minimal)**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { assetsDir: 'bundle', target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], globals: true },
});
```

- [ ] **Step 4: Create index.html at the repo root**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jack Kern</title>
    <meta name="description" content="Jack Kern's projects, laid out as the rooms of a sunlit villa." />
    <link rel="icon" href="/favicon.svg" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <main id="app">
      <canvas id="villa" aria-hidden="true"></canvas>
      <aside id="panels" aria-live="polite"><!-- panels --></aside>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/main.ts as a placeholder bootstrap and src/vite-env.d.ts**

`src/main.ts` (replaced fully in Task 16):

```ts
console.log('villa: bootstrap pending');
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: Delete the scaffold page and build tools; keep styles, link check, public/**

```bash
git rm src/index.html src/site.js tools/build.mjs tools/dev.mjs
```

Replace `src/styles.css` contents with:

```css
:root { color-scheme: light; --ink: #2a2622; --paper: #f4f1ea; --accent: #b8742a; }
html, body { margin: 0; height: 100%; background: var(--paper); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
#app { position: fixed; inset: 0; overflow: hidden; }
#villa { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
#panels { position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 90vw); overflow: auto; padding: 24px; box-sizing: border-box;
  background: rgba(244, 241, 234, 0.92); backdrop-filter: blur(6px); }
#panels[data-mode="static"] { position: static; width: auto; max-width: 900px; margin: 0 auto; background: none; backdrop-filter: none; }
.panel[hidden] { display: none; }
.panel h2 { margin: 0 0 8px; font-size: 1.5rem; }
.panel img { max-width: 100%; display: block; margin: 12px 0; }
.static-view img { width: 100%; display: block; margin: 24px 0 8px; }
.is-placeholder { outline: 2px dashed var(--accent); outline-offset: 2px; }
@media (max-width: 720px) { #panels { top: auto; left: 0; right: 0; height: 45vh; width: auto; } }
```

Add `tmp/` to `.gitignore` under "Build output".

- [ ] **Step 7: Write the failing smoke test**

`tests/smoke/build.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');

test('vite build emits index.html, a bundle, and the CNAME', () => {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' });
  expect(existsSync(join(root, 'dist/index.html'))).toBe(true);
  expect(existsSync(join(root, 'dist/CNAME'))).toBe(true);
  expect(readdirSync(join(root, 'dist/bundle')).some((f) => f.endsWith('.js'))).toBe(true);
}, 120_000);
```

- [ ] **Step 8: Install and run the test to verify it fails**

Run: `npm install && npx vitest run tests/smoke/build.test.ts`
Expected: FAIL because `vite build` cannot find `src/main.ts` referenced from `index.html`? No: main.ts exists. If the build succeeds the test passes already; the point of this step is to confirm the toolchain resolves. Note the outcome.

- [ ] **Step 9: Run the test again and typecheck**

Run: `npx vitest run tests/smoke/build.test.ts && npm run typecheck`
Expected: PASS, and `tsc` reports no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "build: move to Vite, TypeScript, three.js and Vitest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Kit contract, content manifest, schemas, and validator

**Files:**
- Create: `kit/contract.json`, `kit/contract.schema.json`, `content/manifest.json`, `content/manifest.schema.json`, `tools/validate.mjs`
- Test: `tests/tools/validate.test.ts`

**Interfaces:**
- Produces: `validateAll(root: string): Promise<string[]>` in `tools/validate.mjs` (empty array means valid). Part ids and manifest stop ids used by every later task.

- [ ] **Step 1: Create kit/contract.json**

```json
{
  "version": 1,
  "module_m": 1,
  "parts": [
    { "id": "column-doric", "category": "structure", "footprint": [1, 1], "height": 4, "sockets": [{ "name": "top", "at": [0.5, 4, 0.5], "dir": "+y" }], "tier": "full" },
    { "id": "wall-3m", "category": "structure", "footprint": [3, 1], "height": 4, "sockets": [], "tier": "full" },
    { "id": "wall-3m-doorway", "category": "structure", "footprint": [3, 1], "height": 4, "sockets": [{ "name": "threshold", "at": [1.5, 0, 0.5], "dir": "+z" }], "tier": "full" },
    { "id": "entablature-3m", "category": "structure", "footprint": [3, 1], "height": 1, "sockets": [{ "name": "bottom", "at": [1.5, 0, 0.5], "dir": "-y" }], "tier": "full" },
    { "id": "stair-run-3m", "category": "structure", "footprint": [3, 3], "height": 1, "sockets": [], "tier": "full" },
    { "id": "floor-slab-3x3", "category": "floor", "footprint": [3, 3], "height": 0, "sockets": [], "tier": "full" },
    { "id": "pool-basin-3x3", "category": "water", "footprint": [3, 3], "height": 0, "sockets": [], "tier": "half" },
    { "id": "pool-edge-straight", "category": "water", "footprint": [3, 1], "height": 0, "sockets": [], "tier": "half" },
    { "id": "fountain-tiered", "category": "water", "footprint": [1, 1], "height": 3, "sockets": [], "tier": "half" },
    { "id": "urn-small", "category": "dressing", "footprint": [1, 1], "height": 1, "sockets": [], "tier": "skip" },
    { "id": "planter-square", "category": "dressing", "footprint": [1, 1], "height": 1, "sockets": [], "tier": "skip" },
    { "id": "statue-a", "category": "dressing", "footprint": [1, 1], "height": 3, "sockets": [], "tier": "skip" },
    { "id": "bench-3m", "category": "dressing", "footprint": [3, 1], "height": 1, "sockets": [], "tier": "skip" },
    { "id": "relief-a", "category": "focal", "footprint": [3, 1], "height": 3, "sockets": [], "tier": "full" },
    { "id": "urn-large", "category": "focal", "footprint": [1, 1], "height": 2, "sockets": [], "tier": "full" },
    { "id": "statue-b", "category": "focal", "footprint": [1, 1], "height": 3, "sockets": [], "tier": "full" },
    { "id": "fountain-wall", "category": "focal", "footprint": [3, 1], "height": 3, "sockets": [], "tier": "full" }
  ]
}
```

- [ ] **Step 2: Create kit/contract.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "module_m", "parts"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": 1 },
    "module_m": { "type": "number", "minimum": 0.1 },
    "parts": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "category", "footprint", "height", "sockets", "tier"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
          "category": { "enum": ["structure", "floor", "water", "dressing", "focal"] },
          "footprint": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "integer", "minimum": 1 } },
          "height": { "type": "number", "minimum": 0 },
          "sockets": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name", "at", "dir"],
              "additionalProperties": false,
              "properties": {
                "name": { "type": "string" },
                "at": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "number" } },
                "dir": { "enum": ["+x", "-x", "+y", "-y", "+z", "-z"] }
              }
            }
          },
          "tier": { "enum": ["full", "half", "skip"] }
        }
      }
    }
  }
}
```

- [ ] **Step 3: Create content/manifest.json**

```json
{
  "version": 1,
  "seed": 20260915,
  "stops": [
    { "id": "entry", "kind": "court" },
    { "id": "matter-engine", "kind": "project", "title": "Matter Engine", "archetype": "pool-hall", "focal": "fountain-wall", "panel": "content/matter-engine.md", "screenshots": [] },
    { "id": "outrider-ide", "kind": "project", "title": "Outrider IDE", "archetype": "gallery", "focal": "statue-b", "panel": "content/outrider-ide.md", "screenshots": [] },
    { "id": "agent-queue", "kind": "project", "title": "Agent Queue", "archetype": "exedra", "focal": "relief-a", "panel": "content/agent-queue.md", "screenshots": [] },
    { "id": "quilt-trader", "kind": "project", "title": "Quilt Trader", "archetype": "gallery", "focal": "urn-large", "panel": "content/quilt-trader.md", "screenshots": [] },
    { "id": "terrace", "kind": "terrace" }
  ]
}
```

- [ ] **Step 4: Create content/manifest.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "seed", "stops"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": 1 },
    "seed": { "type": "integer", "minimum": 0 },
    "stops": {
      "type": "array",
      "minItems": 3,
      "items": {
        "type": "object",
        "required": ["id", "kind"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
          "kind": { "enum": ["court", "project", "terrace"] },
          "title": { "type": "string", "minLength": 1 },
          "archetype": { "enum": ["gallery", "pool-hall", "exedra"] },
          "focal": { "type": "string" },
          "panel": { "type": "string", "pattern": "^content/.+\\.md$" },
          "screenshots": { "type": "array", "items": { "type": "string" } }
        },
        "if": { "properties": { "kind": { "const": "project" } } },
        "then": { "required": ["title", "archetype", "focal", "panel"] }
      }
    }
  }
}
```

- [ ] **Step 5: Write the failing validator test**

`tests/tools/validate.test.ts`:

```ts
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAll } from '../../tools/validate.mjs';

const root = join(__dirname, '..', '..');

async function copyRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'villa-'));
  for (const p of ['kit', 'content']) await cp(join(root, p), join(dir, p), { recursive: true });
  return dir;
}

async function mutate(dir: string, file: string, fn: (doc: any) => void) {
  const doc = JSON.parse(await readFile(join(dir, file), 'utf8'));
  fn(doc);
  await writeFile(join(dir, file), JSON.stringify(doc));
}

test('the committed contract and manifest validate', async () => {
  expect(await validateAll(root)).toEqual([]);
});

test('a project stop without a panel is a named schema error', async () => {
  const dir = await copyRepo();
  await mutate(dir, 'content/manifest.json', (m) => delete m.stops[1].panel);
  const errors = await validateAll(dir);
  expect(errors.some((e) => e.startsWith('manifest') && e.includes('panel'))).toBe(true);
  await rm(dir, { recursive: true, force: true });
});

test('a focal that is not a focal part is reported', async () => {
  const dir = await copyRepo();
  await mutate(dir, 'content/manifest.json', (m) => (m.stops[1].focal = 'column-doric'));
  const errors = await validateAll(dir);
  expect(errors).toContain('manifest matter-engine: focal column-doric is not a focal part');
  await rm(dir, { recursive: true, force: true });
});

test('a missing panel file is reported', async () => {
  const dir = await copyRepo();
  await rm(join(dir, 'content/agent-queue.md'));
  const errors = await validateAll(dir);
  expect(errors).toContain('manifest agent-queue: panel file content/agent-queue.md missing');
  await rm(dir, { recursive: true, force: true });
});

test('duplicate part ids are reported', async () => {
  const dir = await copyRepo();
  await mutate(dir, 'kit/contract.json', (c) => c.parts.push({ ...c.parts[0] }));
  expect(await validateAll(dir)).toContain('contract: duplicate part ids');
  await rm(dir, { recursive: true, force: true });
});
```

Create the four Markdown files now so the first test can pass; Task 3 fills them in:

```bash
for f in matter-engine outrider-ide agent-queue quilt-trader; do printf '# %s\n\nTODO content.\n' "$f" > content/$f.md; done
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/tools/validate.test.ts`
Expected: FAIL with "Cannot find module '../../tools/validate.mjs'".

- [ ] **Step 7: Create tools/validate.mjs**

```js
/**
 * Validate kit/contract.json and content/manifest.json against their schemas
 * and against each other. Exits non-zero on any error when run as a CLI.
 *
 *   node tools/validate.mjs
 */
import Ajv from 'ajv';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function validateAll(root) {
  const errors = [];
  const ajv = new Ajv({ allErrors: true });
  const load = async (p) => JSON.parse(await readFile(join(root, p), 'utf8'));

  const contract = await load('kit/contract.json');
  const manifest = await load('content/manifest.json');

  const validContract = ajv.compile(await load('kit/contract.schema.json'));
  if (!validContract(contract)) errors.push(...validContract.errors.map((e) => `contract ${e.instancePath} ${e.message}`));

  const validManifest = ajv.compile(await load('content/manifest.schema.json'));
  if (!validManifest(manifest)) errors.push(...validManifest.errors.map((e) => `manifest ${e.instancePath} ${e.message}`));

  const ids = new Set(contract.parts.map((p) => p.id));
  if (ids.size !== contract.parts.length) errors.push('contract: duplicate part ids');

  const category = new Map(contract.parts.map((p) => [p.id, p.category]));
  const stopIds = new Set();
  for (const stop of manifest.stops) {
    if (stopIds.has(stop.id)) errors.push(`manifest: duplicate stop id ${stop.id}`);
    stopIds.add(stop.id);
    if (stop.kind !== 'project') continue;
    if (category.get(stop.focal) !== 'focal') errors.push(`manifest ${stop.id}: focal ${stop.focal} is not a focal part`);
    if (stop.panel) {
      try { await access(join(root, stop.panel)); }
      catch { errors.push(`manifest ${stop.id}: panel file ${stop.panel} missing`); }
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await validateAll(process.cwd());
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('validate: ok');
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/tools/validate.test.ts && npm run validate`
Expected: 5 PASS; CLI prints `validate: ok`.

- [ ] **Step 9: Commit**

```bash
git add kit content tools/validate.mjs tests/tools
git commit -m "feat: kit contract, content manifest, schemas and validator

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Panel content from Markdown, injected at build time

**Files:**
- Modify: `content/matter-engine.md`, `content/outrider-ide.md`, `content/agent-queue.md`, `content/quilt-trader.md`
- Create: `tools/content.mjs`, `src/panels/panels.ts`, `src/virtual-content.d.ts`
- Modify: `vite.config.ts`
- Test: `tests/tools/content.test.ts`, `tests/dom/panels.test.ts`

**Interfaces:**
- Produces: `buildContent(root): Promise<PanelContent[]>`; `PanelContent = { id, title, html, screenshots }`; `panelMarkup(content): string`; `escapeHtml(s): string`; `class Panels { constructor(root: HTMLElement, content: PanelContent[]); show(stopId: string | null) }`; the virtual module `virtual:content` (default export `PanelContent[]`); `<!-- panels -->` in `index.html` replaced by panel sections at build.

- [ ] **Step 1: Write the panel Markdown from public sources only**

Facts come from each repository's README on GitHub. Anything unknown stays a marked placeholder line `<span class="is-placeholder" data-todo="...">...</span>` so it is visible, never a guess.

`content/matter-engine.md`:

```markdown
A prototype C and C++ engine for procedural generation and ray-traced rendering of voxel and particle "matter". The long-term target is real-time rendering of billions of meshed static particles with level of detail, plus a dynamic particle-physics layer for thermal, electrical, chemical and bonding interactions.

It is a monorepo of independently buildable sub-projects: memory managers, spatial queries and BVH structures, a canonical math library, particle flow simulation, the marching-cubes cluster and cell meshing that feeds the ray tracer, UV charting, a content-addressed asset store, an always-on profiler, the MatterEngine3 kernel with its QuickJS script host and Vulkan renderer, and the MatterEditor.

The stone, water and light in this villa are baked by it.

[Source on GitHub](https://github.com/ElectricJack/matter-engine)
```

`content/outrider-ide.md`:

```markdown
A code editor built around reading change in context: a churn map of a repository, a full-bleed navigable view of real source, and a palette-driven workflow.

<span class="is-placeholder" data-todo="outrider-summary">One paragraph in Jack's words about why Outrider exists.</span>

[Site](https://electricjack.github.io/outrider-ide/) · [Source on GitHub](https://github.com/ElectricJack/outrider-ide)
```

`content/agent-queue.md`:

```markdown
A daemon and CLI that runs fleets of coding agents against real repositories: durable tasks and task graphs, worker pools across providers, playbooks with human decision gates, isolated git worktrees, and a dashboard for watching it all.

This site's tickets were filed and worked through it.

[Source on GitHub](https://github.com/ElectricJack/agent-queue)
```

`content/quilt-trader.md`:

```markdown
<span class="is-placeholder" data-todo="quilt-trader-summary">Two sentences about Quilt Trader from the README once it is public.</span>

[Source on GitHub](https://github.com/ElectricJack/quilt-trader)
```

- [ ] **Step 2: Write the failing content builder test**

`tests/tools/content.test.ts`:

```ts
import { join } from 'node:path';
import { buildContent } from '../../tools/content.mjs';

const root = join(__dirname, '..', '..');

test('buildContent renders one entry per project stop in manifest order', async () => {
  const content = await buildContent(root);
  expect(content.map((c) => c.id)).toEqual(['matter-engine', 'outrider-ide', 'agent-queue', 'quilt-trader']);
  expect(content[0].title).toBe('Matter Engine');
  expect(content[0].html).toContain('<p>');
  expect(content[0].html).toContain('href="https://github.com/ElectricJack/matter-engine"');
  expect(Array.isArray(content[0].screenshots)).toBe(true);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/tools/content.test.ts`
Expected: FAIL, module `tools/content.mjs` not found.

- [ ] **Step 4: Create tools/content.mjs**

```js
/** Panel content: manifest project stops plus their Markdown, rendered to HTML. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { marked } from 'marked';

export async function buildContent(root) {
  const manifest = JSON.parse(await readFile(join(root, 'content/manifest.json'), 'utf8'));
  const out = [];
  for (const stop of manifest.stops) {
    if (stop.kind !== 'project') continue;
    const markdown = await readFile(join(root, stop.panel), 'utf8');
    out.push({ id: stop.id, title: stop.title, html: await marked.parse(markdown), screenshots: stop.screenshots ?? [] });
  }
  return out;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/tools/content.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing panels test**

`tests/dom/panels.test.ts`:

```ts
// @vitest-environment jsdom
import { Panels, escapeHtml, panelMarkup } from '../../src/panels/panels';

const content = [
  { id: 'a', title: 'A & B', html: '<p>alpha</p>', screenshots: ['/img/a.jpg'] },
  { id: 'b', title: 'B', html: '<p>beta</p>', screenshots: [] },
];

test('escapeHtml escapes the four HTML specials', () => {
  expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('panelMarkup renders hidden sections with escaped titles and screenshots', () => {
  const html = panelMarkup(content);
  expect(html).toContain('<section class="panel" data-stop="a" hidden>');
  expect(html).toContain('<h2>A &amp; B</h2>');
  expect(html).toContain('<img src="/img/a.jpg"');
  expect(html).toContain('<p>alpha</p>');
});

test('Panels shows one section at a time and reuses injected markup', () => {
  const root = document.createElement('aside');
  root.innerHTML = panelMarkup(content);
  const panels = new Panels(root, content);
  panels.show('b');
  expect(root.querySelector<HTMLElement>('[data-stop="a"]')!.hidden).toBe(true);
  expect(root.querySelector<HTMLElement>('[data-stop="b"]')!.hidden).toBe(false);
  panels.show(null);
  expect(root.querySelector<HTMLElement>('[data-stop="b"]')!.hidden).toBe(true);
});

test('Panels renders markup itself when the root is empty', () => {
  const root = document.createElement('aside');
  new Panels(root, content);
  expect(root.querySelectorAll('section.panel').length).toBe(2);
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run tests/dom/panels.test.ts`
Expected: FAIL, module `src/panels/panels` not found.

- [ ] **Step 8: Create src/panels/panels.ts**

```ts
export type PanelContent = { id: string; title: string; html: string; screenshots: string[] };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Build-time and runtime share this so the served HTML already contains every panel. */
export function panelMarkup(content: PanelContent[]): string {
  return content
    .map((c) => {
      const shots = c.screenshots
        .map((s) => `<img src="${escapeHtml(s)}" alt="${escapeHtml(c.title)} screenshot" loading="lazy">`)
        .join('');
      return `<section class="panel" data-stop="${escapeHtml(c.id)}" hidden><h2>${escapeHtml(c.title)}</h2>${shots}<div class="panel-body">${c.html}</div></section>`;
    })
    .join('\n');
}

export class Panels {
  private sections: Map<string, HTMLElement>;

  constructor(root: HTMLElement, content: PanelContent[]) {
    if (!root.querySelector('section.panel')) root.innerHTML = panelMarkup(content);
    this.sections = new Map(
      [...root.querySelectorAll<HTMLElement>('section.panel')].map((s) => [s.dataset.stop!, s]),
    );
  }

  show(stopId: string | null): void {
    for (const [id, section] of this.sections) section.hidden = id !== stopId;
  }
}
```

- [ ] **Step 9: Run the panels test to verify it passes**

Run: `npx vitest run tests/dom/panels.test.ts`
Expected: 4 PASS.

- [ ] **Step 10: Wire the Vite plugin and the virtual module type**

`src/virtual-content.d.ts`:

```ts
declare module 'virtual:content' {
  const content: import('./panels/panels').PanelContent[];
  export default content;
}
```

Replace `vite.config.ts`:

```ts
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import { buildContent } from './tools/content.mjs';
import { panelMarkup } from './src/panels/panels';

const root = dirname(fileURLToPath(import.meta.url));

/** Serves `virtual:content` and injects the panel sections into index.html. */
function villaContent(): Plugin {
  const id = 'virtual:content';
  const resolved = '\0' + id;
  return {
    name: 'villa-content',
    resolveId(source) { return source === id ? resolved : null; },
    async load(file) {
      if (file !== resolved) return null;
      return `export default ${JSON.stringify(await buildContent(root))};`;
    },
    async transformIndexHtml(html) {
      return html.replace('<!-- panels -->', panelMarkup(await buildContent(root)));
    },
  };
}

export default defineConfig({
  plugins: [villaContent()],
  build: { assetsDir: 'bundle', target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], globals: true },
});
```

- [ ] **Step 11: Verify the build injects panels and commit**

Run: `npm run build && grep -c 'class="panel"' dist/index.html && npm run typecheck`
Expected: prints `4`; typecheck clean.

```bash
git add content tools/content.mjs src/panels src/virtual-content.d.ts vite.config.ts tests
git commit -m "feat: panel content from Markdown, injected at build

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Layout foundations: canonical JSON, FNV-1a hash, seeded RNG

**Files:**
- Create: `layout/hash.js`, `layout/rng.js`
- Test: `tests/layout/hash.test.ts`, `tests/layout/rng.test.ts`

**Interfaces:**
- Produces: `canonical(value): string`; `fnv1a64(text): string` (16 lowercase hex chars); `mulberry32(seed): () => number`; `int(rng, lo, hi): number` (inclusive); `pick(rng, list)`.

- [ ] **Step 1: Write the failing hash tests**

`tests/layout/hash.test.ts`:

```ts
import { canonical, fnv1a64 } from '../../layout/hash.js';

test('fnv1a64 matches the reference vectors', () => {
  expect(fnv1a64('')).toBe('cbf29ce484222325');
  expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
  expect(fnv1a64('foobar')).toBe('85944171f73967e8');
});

test('canonical sorts keys, drops whitespace and fixes numbers to six decimals', () => {
  expect(canonical({ b: 1, a: [true, null, 'x'] })).toBe('{"a":[true,null,"x"],"b":1.000000}');
  expect(canonical(0.1 + 0.2)).toBe('0.300000');
  expect(canonical({ z: { y: 2, x: 1 } })).toBe('{"z":{"x":1.000000,"y":2.000000}}');
});

test('canonical rejects non-finite numbers and undefined', () => {
  expect(() => canonical(NaN)).toThrow('non-finite');
  expect(() => canonical(undefined)).toThrow('unsupported');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/layout/hash.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Create layout/hash.js**

```js
// Canonical JSON and FNV-1a 64. Pure; runs unchanged under QuickJS.

export function canonical(value) {
  if (value === null || typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical: non-finite number');
    return value.toFixed(6);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  throw new Error('canonical: unsupported type ' + typeof value);
}

export function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/layout/hash.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Write the failing RNG test**

`tests/layout/rng.test.ts`:

```ts
import { int, mulberry32, pick } from '../../layout/rng.js';

test('mulberry32 is deterministic and in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  expect(seqA).toEqual(seqB);
  for (const v of seqA) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  expect(mulberry32(43)()).not.toBe(seqA[0]);
});

test('int is inclusive on both ends and pick returns members', () => {
  const rng = mulberry32(7);
  const seen = new Set<number>();
  for (let i = 0; i < 500; i++) seen.add(int(rng, 1, 3));
  expect([...seen].sort()).toEqual([1, 2, 3]);
  expect(['x', 'y']).toContain(pick(rng, ['x', 'y']));
});
```

- [ ] **Step 6: Run to verify it fails, then create layout/rng.js**

Run: `npx vitest run tests/layout/rng.test.ts` (expected FAIL, module not found)

```js
// Seeded random. Pure; runs unchanged under QuickJS.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function int(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}
```

- [ ] **Step 7: Run to verify it passes and commit**

Run: `npx vitest run tests/layout`
Expected: all PASS.

```bash
git add layout tests/layout
git commit -m "feat(layout): canonical JSON, FNV-1a 64 hash and seeded RNG

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Layout sequence pass

**Files:**
- Create: `layout/layout.js` (first half; Tasks 6 and 7 extend it)
- Test: `tests/layout/sequence.test.ts`

**Interfaces:**
- Produces: `sequence(manifest, parts: Map<string, Part>): Stop[]`, `footprintCells(x, z, h, w, d): string[]`, `exitFor(x, z, h, w, d, turn)`, `HEADINGS`, `SIZES`, `LEVEL_HEIGHT`, `EYE_HEIGHT`, `LayoutError`. A `Stop` is `{ id, kind: 'court'|'room'|'courtyard'|'terrace', archetype, focal?, title?, x, z, h, w, d, level, turn: -1|0|1, drop: boolean, hasEntry, hasExit, exit: { x, z, h } }`. `x, z` is the entry-threshold centre on the grid; `h` is the heading index into `HEADINGS`; local `u` is across (right), local `v` is along the heading.

- [ ] **Step 1: Write the failing sequence tests**

`tests/layout/sequence.test.ts`:

```ts
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { LayoutError, footprintCells, sequence } from '../../layout/layout.js';

const parts = new Map(contract.parts.map((p) => [p.id, p]));

test('the chain alternates rooms and courtyards between the court and the terrace', () => {
  const ids = sequence(manifest, parts).map((s) => s.id);
  expect(ids).toEqual(['entry', 'matter-engine', 'cy-1', 'outrider-ide', 'cy-2', 'agent-queue', 'cy-3', 'quilt-trader', 'cy-4', 'terrace']);
});

test('every second courtyard turns, alternating, and every third drops a level', () => {
  const stops = sequence(manifest, parts);
  const cy = (id: string) => stops.find((s) => s.id === id)!;
  expect(cy('cy-1').turn).toBe(0);
  expect(cy('cy-2').turn).not.toBe(0);
  expect(cy('cy-4').turn).toBe(-cy('cy-2').turn);
  expect(cy('cy-3').drop).toBe(true);
  expect(cy('cy-1').drop).toBe(false);
  expect(stops.map((s) => s.level)).toEqual([0, 0, 0, 0, 0, 0, 0, -1, -1, -1]);
});

test('no two stops share a grid cell', () => {
  const stops = sequence(manifest, parts);
  const all = stops.flatMap((s) => footprintCells(s.x, s.z, s.h, s.w, s.d));
  expect(new Set(all).size).toBe(all.length);
});

test('each stop starts where the previous one exits', () => {
  const stops = sequence(manifest, parts);
  for (let i = 1; i < stops.length; i++) {
    expect([stops[i].x, stops[i].z, stops[i].h]).toEqual([stops[i - 1].exit.x, stops[i - 1].exit.z, stops[i - 1].exit.h]);
  }
  expect(stops[0].hasEntry).toBe(false);
  expect(stops[stops.length - 1].hasExit).toBe(false);
});

test('an unknown archetype or focal is a LayoutError with a code', () => {
  const bad = structuredClone(manifest) as any;
  bad.stops[1].archetype = 'ballroom';
  expect(() => sequence(bad, parts)).toThrow(LayoutError);
  try { sequence(bad, parts); } catch (e: any) { expect(e.code).toBe('unknown_archetype'); }
  const bad2 = structuredClone(manifest) as any;
  bad2.stops[1].focal = 'column-doric';
  try { sequence(bad2, parts); } catch (e: any) { expect(e.code).toBe('unknown_focal'); }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/layout/sequence.test.ts`
Expected: FAIL, `layout/layout.js` not found.

- [ ] **Step 3: Create layout/layout.js with the sequence pass**

```js
// layout/layout.js — pure and deterministic. Imports only from ./hash.js and ./rng.js.
import { canonical, fnv1a64 } from './hash.js';
import { mulberry32, int, pick } from './rng.js';

export const LAYOUT_VERSION = 1;
export const LEVEL_HEIGHT = 1;   // metres dropped per stair run
export const EYE_HEIGHT = 1.7;
export const SIZES = { court: [9, 9], gallery: [9, 12], 'pool-hall': [9, 9], exedra: [6, 6], courtyard: [9, 6], terrace: [9, 6] };
export const HEADINGS = [[0, 1], [1, 0], [0, -1], [-1, 0]];   // dx, dz for heading 0:+z 1:+x 2:-z 3:-x

export class LayoutError extends Error {
  constructor(code, message) { super(message); this.name = 'LayoutError'; this.code = code; }
}

const fix = (n) => Number(n.toFixed(6));
const fwdOf = (h) => HEADINGS[h];
const rightOf = (h) => HEADINGS[(h + 1) % 4];

/** Grid cell keys covered by a stop footprint (2D; levels overlap in plan). */
export function footprintCells(x, z, h, w, d) {
  const fwd = fwdOf(h), right = rightOf(h);
  const cells = [];
  for (let u = -w / 2; u < w / 2; u++) {
    for (let v = 0; v < d; v++) {
      const cx = x + right[0] * (u + 0.5) + fwd[0] * (v + 0.5);
      const cz = z + right[1] * (u + 0.5) + fwd[1] * (v + 0.5);
      cells.push(Math.floor(cx) + ',' + Math.floor(cz));
    }
  }
  return cells;
}

/** Where the next stop begins for a stop at (x, z, h) of size (w, d) exiting straight (0), right (1) or left (-1). */
export function exitFor(x, z, h, w, d, turn) {
  const fwd = fwdOf(h), right = rightOf(h);
  if (turn === 0) return { x: x + fwd[0] * d, z: z + fwd[1] * d, h };
  const side = turn === 1 ? right : [-right[0], -right[1]];
  return { x: x + fwd[0] * (d / 2) + side[0] * (w / 2), z: z + fwd[1] * (d / 2) + side[1] * (w / 2), h: (h + turn + 4) % 4 };
}

function expand(manifest, parts) {
  const entries = [];
  let courtyards = 0;
  for (const m of manifest.stops) {
    if (m.kind === 'court') {
      entries.push({ id: m.id, kind: 'court', archetype: 'court' });
    } else if (m.kind === 'project') {
      if (!SIZES[m.archetype]) throw new LayoutError('unknown_archetype', m.id + ': unknown archetype ' + m.archetype);
      const focal = parts.get(m.focal);
      if (!focal || focal.category !== 'focal') throw new LayoutError('unknown_focal', m.id + ': ' + m.focal + ' is not a focal part');
      const last = entries[entries.length - 1];
      if (last && last.kind === 'room') entries.push({ id: 'cy-' + (++courtyards), kind: 'courtyard', archetype: 'courtyard' });
      entries.push({ id: m.id, kind: 'room', archetype: m.archetype, focal: m.focal, title: m.title });
    } else if (m.kind === 'terrace') {
      entries.push({ id: 'cy-' + (++courtyards), kind: 'courtyard', archetype: 'courtyard' });
      entries.push({ id: m.id, kind: 'terrace', archetype: 'terrace' });
    } else {
      throw new LayoutError('unknown_kind', m.id + ': unknown stop kind ' + m.kind);
    }
  }
  return entries;
}

export function sequence(manifest, parts) {
  const entries = expand(manifest, parts);
  const stops = [];
  const occupied = new Set();
  let x = 0, z = 0, h = 0, level = 0, courtyardIndex = 0, turnCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const [w, d] = SIZES[e.archetype];
    const isLast = i === entries.length - 1;
    let preferredTurn = 0, drop = false;
    if (e.kind === 'courtyard') {
      courtyardIndex++;
      if (courtyardIndex % 2 === 0) { turnCount++; preferredTurn = turnCount % 2 === 1 ? -1 : 1; }
      drop = courtyardIndex % 3 === 0;
    }
    const cells = footprintCells(x, z, h, w, d);
    if (cells.some((c) => occupied.has(c))) throw new LayoutError('no_placement', e.id + ': overlaps an earlier stop');

    const candidates = e.kind === 'courtyard' ? [preferredTurn, -preferredTurn, 0] : [0];
    let chosen = null;
    for (const turn of candidates.filter((t, k, arr) => arr.indexOf(t) === k)) {
      const exit = exitFor(x, z, h, w, d, turn);
      if (!isLast) {
        const [nw, nd] = SIZES[entries[i + 1].archetype];
        const next = footprintCells(exit.x, exit.z, exit.h, nw, nd);
        if (next.some((c) => occupied.has(c) || cells.includes(c))) continue;
      }
      chosen = { turn, exit };
      break;
    }
    if (!chosen) throw new LayoutError('no_placement', e.id + ': no non-overlapping exit');

    for (const c of cells) occupied.add(c);
    stops.push({ ...e, x, z, h, w, d, level, turn: chosen.turn, drop, hasEntry: i > 0, hasExit: !isLast, exit: chosen.exit });
    x = chosen.exit.x; z = chosen.exit.z; h = chosen.exit.h;
    if (drop) level -= 1;
  }
  return stops;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/layout/sequence.test.ts`
Expected: 5 PASS. Courtyards are 9 m wide on purpose: a 9 m wide stop leaving a courtyard sideways must not reach back over the room before it. If a future manifest still collides, the `no_placement` error names the stop; widen or reorder rather than weakening the overlap test.

- [ ] **Step 5: Commit**

```bash
git add layout/layout.js tests/layout/sequence.test.ts
git commit -m "feat(layout): sequence pass with folds, drops and overlap avoidance

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Layout fill pass

**Files:**
- Modify: `layout/layout.js`
- Test: `tests/layout/fill.test.ts`

**Interfaces:**
- Produces: `fill(stop, parts, rng): Placement[]`, `worldTransform(stop, u, v, y, localQ): number[16]`, `worldPoint(stop, u, v, y): [x, y, z]`, `exitLocal(stop): [u, v]`. `Placement = { instance: '<stop>.<part>.<n>', part, stop, transform }`.

- [ ] **Step 1: Write the failing fill tests**

`tests/layout/fill.test.ts`:

```ts
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { fill, sequence, worldTransform } from '../../layout/layout.js';
import { mulberry32 } from '../../layout/rng.js';

const parts = new Map(contract.parts.map((p) => [p.id, p]));
const stops = sequence(manifest, parts);
const byId = (id: string) => stops.find((s) => s.id === id)!;
const placementsOf = (id: string) => fill(byId(id), parts, mulberry32(1));

test('worldTransform is column-major with quarter-turn yaw', () => {
  const stop = { x: 10, z: 20, h: 0, level: -1 } as any;
  expect(worldTransform(stop, 1, 2, 0.5, 0)).toEqual([1, 0, -0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 11, -0.5, 22, 1]);
  // heading 1 (+x): local u maps to -z, local v maps to +x
  expect(worldTransform({ x: 0, z: 0, h: 1, level: 0 } as any, 1, 2, 0, 0).slice(12, 15)).toEqual([2, 0, -1]);
});

test('every placement names a contract part and instance ids are unique and filename-safe', () => {
  const all = stops.flatMap((s) => fill(s, parts, mulberry32(1)));
  expect(all.length).toBeGreaterThan(50);
  for (const p of all) expect(parts.has(p.part)).toBe(true);
  expect(new Set(all.map((p) => p.instance)).size).toBe(all.length);
  for (const p of all) expect(p.instance).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+\.\d+$/);
});

test('a room gets floor slabs, a doorway on each threshold side, walls elsewhere, and one focal at the far wall', () => {
  const p = placementsOf('outrider-ide');
  const stop = byId('outrider-ide');
  const of = (part: string) => p.filter((x) => x.part === part);
  expect(of('floor-slab-3x3').length).toBe((stop.w / 3) * (stop.d / 3));
  expect(of('wall-3m-doorway').length).toBe(2);
  expect(of('wall-3m').length).toBeGreaterThan(0);
  const focal = of('statue-b');
  expect(focal.length).toBe(1);
  expect(focal[0].transform.slice(12, 15)).toEqual(worldTransform(stop, 0, stop.d - 1.5, 0, 0).slice(12, 15));
});

test('an open stop gets columns and entablature, no walls, and a courtyard gets a pool and fountain', () => {
  const p = placementsOf('cy-1');
  const of = (part: string) => p.filter((x) => x.part === part);
  expect(of('wall-3m').length).toBe(0);
  expect(of('column-doric').length).toBeGreaterThan(4);
  expect(of('entablature-3m').length).toBeGreaterThan(0);
  expect(of('pool-basin-3x3').length).toBe(1);
  expect(of('fountain-tiered').length).toBe(1);
});

test('a dropping courtyard places a stair run at its exit', () => {
  expect(placementsOf('cy-3').filter((x) => x.part === 'stair-run-3m').length).toBe(1);
  expect(placementsOf('cy-1').filter((x) => x.part === 'stair-run-3m').length).toBe(0);
});

test('fill is deterministic for the same seed', () => {
  expect(placementsOf('entry')).toEqual(placementsOf('entry'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/layout/fill.test.ts`
Expected: FAIL, `fill` is not exported.

- [ ] **Step 3: Append the fill pass to layout/layout.js**

```js
const DRESSING_BUDGET = { court: 6, gallery: 4, 'pool-hall': 4, exedra: 2, courtyard: 4, terrace: 4 };
const DRESSING_PARTS = ['urn-small', 'planter-square', 'statue-a'];
const COS = [1, 0, -1, 0], SIN = [0, 1, 0, -1];

export function worldPoint(stop, u, v, y) {
  const fwd = fwdOf(stop.h), right = rightOf(stop.h);
  return [fix(stop.x + right[0] * u + fwd[0] * v), fix(stop.level * LEVEL_HEIGHT + y), fix(stop.z + right[1] * u + fwd[1] * v)];
}

/** Column-major 4x4: yaw of (stop.h + localQ) quarter turns about +y, then translate. */
export function worldTransform(stop, u, v, y, localQ) {
  const [x, wy, z] = worldPoint(stop, u, v, y);
  const q = (stop.h + localQ) % 4;
  const c = COS[q], s = SIN[q];
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, wy, z, 1];
}

/** Local (u, v) of the exit threshold centre. */
export function exitLocal(stop) {
  if (stop.turn === 0) return [0, stop.d];
  return [stop.turn === 1 ? stop.w / 2 : -stop.w / 2, stop.d / 2];
}

function sideSegments(stop, side) {
  // Each side yields 3 m segments as { u, v, localQ, axisIndex } in local coords.
  const { w, d } = stop;
  const out = [];
  if (side === 'back' || side === 'front') {
    const v = side === 'back' ? 0 : d;
    for (let i = 0; i < w / 3; i++) out.push({ u: -w / 2 + 1.5 + 3 * i, v, localQ: 0, index: i });
  } else {
    const u = side === 'left' ? -w / 2 : w / 2;
    for (let i = 0; i < d / 3; i++) out.push({ u, v: 1.5 + 3 * i, localQ: 1, index: i });
  }
  return out;
}

function sideStatus(stop) {
  const open = stop.kind !== 'room';
  const exitSide = !stop.hasExit ? null : stop.turn === 0 ? 'front' : stop.turn === 1 ? 'right' : 'left';
  const status = {};
  for (const side of ['back', 'front', 'left', 'right']) {
    const threshold = (side === 'back' && stop.hasEntry) || side === exitSide;
    status[side] = threshold ? 'door' : open ? 'open' : 'wall';
  }
  return status;
}

export function fill(stop, parts, rng) {
  const out = [];
  const counters = new Map();
  const place = (partId, u, v, localQ = 0, y = 0) => {
    if (!parts.has(partId)) throw new LayoutError('unknown_part', stop.id + ': part ' + partId + ' is not in the contract');
    const n = (counters.get(partId) || 0) + 1;
    counters.set(partId, n);
    out.push({ instance: stop.id + '.' + partId + '.' + n, part: partId, stop: stop.id, transform: worldTransform(stop, u, v, y, localQ) });
  };
  const { w, d, archetype } = stop;
  const columnHeight = parts.get('column-doric').height;
  const columns = new Set();
  const column = (u, v) => { const key = u + ',' + v; if (columns.has(key)) return; columns.add(key); place('column-doric', u, v, 0, 0); };
  const open = stop.kind !== 'room';

  // Floors.
  for (let i = 0; i < w / 3; i++) for (let j = 0; j < d / 3; j++) place('floor-slab-3x3', -w / 2 + 1.5 + 3 * i, 1.5 + 3 * j, 0, 0);

  // Perimeter.
  const status = sideStatus(stop);
  for (const side of ['back', 'front', 'left', 'right']) {
    const segments = sideSegments(stop, side);
    const middle = Math.floor(segments.length / 2);
    for (const seg of segments) {
      if (open) {
        // Column run with entablature; the doorway is simply the gap between columns.
        const along = seg.localQ === 0 ? [seg.u - 1.5, seg.u + 1.5] : [seg.v - 1.5, seg.v + 1.5];
        if (seg.localQ === 0) { column(along[0], seg.v); column(along[1], seg.v); }
        else { column(seg.u, along[0]); column(seg.u, along[1]); }
        place('entablature-3m', seg.u, seg.v, seg.localQ, columnHeight);
      } else if (status[side] === 'door' && seg.index === middle) {
        place('wall-3m-doorway', seg.u, seg.v, seg.localQ, 0);
      } else {
        place('wall-3m', seg.u, seg.v, seg.localQ, 0);
      }
    }
  }

  // Interior column rows for the long rooms.
  if (archetype === 'gallery' || archetype === 'pool-hall') {
    for (const u of [-3, 3]) {
      const rows = d / 3;
      for (let j = 0; j < rows; j++) column(u, 1.5 + 3 * j);
      for (let j = 0; j + 1 < rows; j++) place('entablature-3m', u, 3 + 3 * j, 1, columnHeight);
    }
  }

  // Water.
  if (archetype === 'pool-hall' || archetype === 'courtyard' || archetype === 'court') {
    place('pool-basin-3x3', 0, d / 2, 0, 0);
    if (archetype !== 'pool-hall') place('fountain-tiered', 0, d / 2, 0, 0);
  }

  // Stairs at the exit of a dropping courtyard.
  if (stop.drop) {
    const [eu, ev] = exitLocal(stop);
    const q = stop.turn === 0 ? 0 : 1;
    const along = stop.turn === 0 ? [0, 1.5] : [stop.turn * 1.5, 0];
    place('stair-run-3m', eu + along[0], ev + along[1], q, 0);
  }

  // Focal object at the far wall on the rail axis.
  if (stop.kind === 'room') place(stop.focal, 0, d - 1.5, 0, 0);

  // Dressing along the side walls, away from thresholds.
  const slots = [];
  for (const u of [-(w / 2 - 0.75), w / 2 - 0.75]) {
    for (let v = 1.5; v <= d - 1.5; v += 1.5) {
      const sideIsDoor = (u < 0 && status.left === 'door') || (u > 0 && status.right === 'door');
      if (sideIsDoor && Math.abs(v - d / 2) < 2) continue;
      slots.push([u, v]);
    }
  }
  for (let n = 0; n < DRESSING_BUDGET[archetype] && slots.length; n++) {
    const [uu, vv] = slots.splice(int(rng, 0, slots.length - 1), 1)[0];
    place(pick(rng, DRESSING_PARTS), uu, vv, 0, 0);
  }

  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/layout/fill.test.ts`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add layout/layout.js tests/layout/fill.test.ts
git commit -m "feat(layout): fill pass placing floors, walls, colonnades, water, stairs, focal and dressing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Rail, hotspots, bounds, and the public layout() entry point

**Files:**
- Modify: `layout/layout.js`
- Create: `layout/layout.d.ts`, `src/types.ts`
- Test: `tests/layout/layout.test.ts`

**Interfaces:**
- Produces: `railFor(stops): { rail: Viewpoint[]; hotspots: Hotspot[] }`, `boundsFor(stops): Record<string, Bounds>`, `layout(manifest, contract, seed?): Layout`. Viewpoint ids are `<stop>-enter`, `<stop>-focal` for rooms and `<stop>-view` otherwise. `Layout = { version: 1; hash: string; placements; rail; hotspots; bounds }`.

- [ ] **Step 1: Write the failing tests**

`tests/layout/layout.test.ts`:

```ts
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';

test('layout produces a hashed, complete document', () => {
  const plan = layout(manifest, contract);
  expect(plan.version).toBe(1);
  expect(plan.hash).toMatch(/^[0-9a-f]{16}$/);
  expect(plan.rail.map((v) => v.id)).toEqual([
    'entry-view', 'matter-engine-enter', 'matter-engine-focal', 'cy-1-view', 'outrider-ide-enter', 'outrider-ide-focal',
    'cy-2-view', 'agent-queue-enter', 'agent-queue-focal', 'cy-3-view', 'quilt-trader-enter', 'quilt-trader-focal', 'cy-4-view', 'terrace-view',
  ]);
  expect(plan.hotspots.length).toBe(plan.rail.length - 1);
  for (let i = 0; i < plan.hotspots.length; i++) {
    expect(plan.hotspots[i].from).toBe(plan.rail[i].id);
    expect(plan.hotspots[i].to).toBe(plan.rail[i + 1].id);
  }
  expect(Object.keys(plan.bounds).sort()).toEqual([...new Set(plan.placements.map((p) => p.stop))].sort());
});

test('the hash is stable across calls and sensitive to the seed', () => {
  expect(layout(manifest, contract).hash).toBe(layout(manifest, contract).hash);
  expect(layout(manifest, contract, 1).hash).not.toBe(layout(manifest, contract, 2).hash);
});

test('every viewpoint sits at eye height above its stop floor and inside its bounds', () => {
  const plan = layout(manifest, contract);
  for (const v of plan.rail) {
    const b = plan.bounds[v.stop];
    expect(v.position[1]).toBeCloseTo(b.min[1] + 0.2 + 1.7, 5);
    expect(v.position[0]).toBeGreaterThanOrEqual(b.min[0] - 1e-6);
    expect(v.position[0]).toBeLessThanOrEqual(b.max[0] + 1e-6);
    expect(v.position[2]).toBeGreaterThanOrEqual(b.min[2] - 1e-6);
    expect(v.position[2]).toBeLessThanOrEqual(b.max[2] + 1e-6);
  }
});

test('unsupported versions are rejected by code', () => {
  expect(() => layout({ ...manifest, version: 2 } as any, contract)).toThrow(/manifest version/);
  expect(() => layout(manifest, { ...contract, version: 9 } as any)).toThrow(/contract version/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/layout/layout.test.ts`
Expected: FAIL, `layout` is not exported.

- [ ] **Step 3: Append rail, bounds and layout() to layout/layout.js**

```js
function lookFor(stop) {
  const { w, d } = stop;
  if (!stop.hasExit) return worldPoint(stop, 0, d + 6, 1.5);
  if (stop.turn === 0) return worldPoint(stop, 0, d + 3, 1.5);
  return worldPoint(stop, stop.turn * (w / 2 + 3), d / 2, 1.5);
}

export function railFor(stops) {
  const rail = [];
  for (const stop of stops) {
    if (stop.kind === 'room') {
      rail.push({ id: stop.id + '-enter', stop: stop.id, position: worldPoint(stop, 0, 1.5, EYE_HEIGHT), target: worldPoint(stop, 0, stop.d - 1.5, 1.2) });
      rail.push({ id: stop.id + '-focal', stop: stop.id, position: worldPoint(stop, 0, stop.d * 0.55, EYE_HEIGHT), target: worldPoint(stop, 0, stop.d - 1.5, 1.0) });
    } else {
      rail.push({ id: stop.id + '-view', stop: stop.id, position: worldPoint(stop, 0, Math.max(1.5, stop.d / 2 - 1.5), EYE_HEIGHT), target: lookFor(stop) });
    }
  }
  const hotspots = [];
  for (let i = 0; i + 1 < rail.length; i++) {
    const a = rail[i], b = rail[i + 1];
    const stop = stops.find((s) => s.id === a.stop);
    if (a.stop === b.stop) {
      hotspots.push({ from: a.id, to: b.id, anchor: worldPoint(stop, 0, stop.d - 1.5, 1.0), label: 'focal' });
    } else {
      const [eu, ev] = exitLocal(stop);
      hotspots.push({ from: a.id, to: b.id, anchor: worldPoint(stop, eu, ev, 1.0), label: 'threshold' });
    }
  }
  return { rail, hotspots };
}

export function boundsFor(stops) {
  const bounds = {};
  for (const stop of stops) {
    const corners = [[-stop.w / 2, 0], [stop.w / 2, 0], [-stop.w / 2, stop.d], [stop.w / 2, stop.d]].map(([u, v]) => worldPoint(stop, u, v, 0));
    const xs = corners.map((c) => c[0]), zs = corners.map((c) => c[2]);
    const y0 = stop.level * LEVEL_HEIGHT;
    bounds[stop.id] = { min: [fix(Math.min(...xs)), fix(y0 - 0.2), fix(Math.min(...zs))], max: [fix(Math.max(...xs)), fix(y0 + 4.6), fix(Math.max(...zs))] };
  }
  return bounds;
}

export function layout(manifest, contract, seed) {
  if (manifest.version !== 1) throw new LayoutError('manifest_version', 'unsupported manifest version ' + manifest.version);
  if (contract.version !== 1) throw new LayoutError('contract_version', 'unsupported contract version ' + contract.version);
  const parts = new Map(contract.parts.map((p) => [p.id, p]));
  const rng = mulberry32(seed === undefined ? manifest.seed : seed);
  const stops = sequence(manifest, parts);
  const placements = [];
  for (const stop of stops) placements.push(...fill(stop, parts, rng));
  const { rail, hotspots } = railFor(stops);
  const bounds = boundsFor(stops);
  const body = { version: LAYOUT_VERSION, placements, rail, hotspots, bounds };
  return { ...body, hash: fnv1a64(canonical(body)) };
}
```

- [ ] **Step 4: Create src/types.ts and layout/layout.d.ts**

`src/types.ts`:

```ts
export type Vec3 = [number, number, number];
export type ManifestStop = {
  id: string; kind: 'court' | 'project' | 'terrace'; title?: string;
  archetype?: 'gallery' | 'pool-hall' | 'exedra'; focal?: string; panel?: string; screenshots?: string[];
};
export type Manifest = { version: 1; seed: number; stops: ManifestStop[] };
export type Socket = { name: string; at: Vec3; dir: '+x' | '-x' | '+y' | '-y' | '+z' | '-z' };
export type Part = {
  id: string; category: 'structure' | 'floor' | 'water' | 'dressing' | 'focal';
  footprint: [number, number]; height: number; sockets: Socket[]; tier: 'full' | 'half' | 'skip';
};
export type Contract = { version: 1; module_m: number; parts: Part[] };
export type Placement = { instance: string; part: string; stop: string; transform: number[] };
export type Viewpoint = { id: string; stop: string; position: Vec3; target: Vec3 };
export type Hotspot = { from: string; to: string; anchor: Vec3; label: 'focal' | 'threshold' };
export type Bounds = { min: Vec3; max: Vec3 };
export type Layout = { version: 1; hash: string; placements: Placement[]; rail: Viewpoint[]; hotspots: Hotspot[]; bounds: Record<string, Bounds> };
```

`layout/layout.d.ts`:

```ts
import type { Contract, Layout, Manifest, Part, Placement, Viewpoint, Hotspot, Bounds, Vec3 } from '../src/types';
export const LAYOUT_VERSION: 1;
export const LEVEL_HEIGHT: number;
export const EYE_HEIGHT: number;
export const SIZES: Record<string, [number, number]>;
export const HEADINGS: [number, number][];
export class LayoutError extends Error { code: string; constructor(code: string, message: string); }
export type Stop = {
  id: string; kind: 'court' | 'room' | 'courtyard' | 'terrace'; archetype: string; focal?: string; title?: string;
  x: number; z: number; h: number; w: number; d: number; level: number; turn: -1 | 0 | 1; drop: boolean;
  hasEntry: boolean; hasExit: boolean; exit: { x: number; z: number; h: number };
};
export function footprintCells(x: number, z: number, h: number, w: number, d: number): string[];
export function exitFor(x: number, z: number, h: number, w: number, d: number, turn: -1 | 0 | 1): { x: number; z: number; h: number };
export function sequence(manifest: Manifest, parts: Map<string, Part>): Stop[];
export function worldPoint(stop: Pick<Stop, 'x' | 'z' | 'h' | 'level'>, u: number, v: number, y: number): Vec3;
export function worldTransform(stop: Pick<Stop, 'x' | 'z' | 'h' | 'level'>, u: number, v: number, y: number, localQ: number): number[];
export function exitLocal(stop: Stop): [number, number];
export function fill(stop: Stop, parts: Map<string, Part>, rng: () => number): Placement[];
export function railFor(stops: Stop[]): { rail: Viewpoint[]; hotspots: Hotspot[] };
export function boundsFor(stops: Stop[]): Record<string, Bounds>;
export function layout(manifest: Manifest, contract: Contract, seed?: number): Layout;
```

- [ ] **Step 5: Run all layout tests and typecheck**

Run: `npx vitest run tests/layout && npm run typecheck`
Expected: all PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add layout src/types.ts tests/layout/layout.test.ts
git commit -m "feat(layout): rail, hotspots, bounds and hashed layout() entry point

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Layout determinism under QuickJS

**Files:**
- Test: `tests/layout/quickjs.test.ts`

**Interfaces:**
- Consumes: `layout()` and the `layout/*.js` files as plain text.

- [ ] **Step 1: Write the failing test**

`tests/layout/quickjs.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getQuickJS } from 'quickjs-emscripten';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';

const layoutDir = join(__dirname, '..', '..', 'layout');

test('layout.js produces the identical hash inside QuickJS', async () => {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setModuleLoader((name) => readFileSync(join(layoutDir, name.replace(/^\.\//, '')), 'utf8'));
  const vm = runtime.newContext();
  vm.unwrapResult(vm.evalCode(`globalThis.manifest = ${JSON.stringify(manifest)}; globalThis.contract = ${JSON.stringify(contract)};`)).dispose();
  const result = vm.evalCode(
    `import { layout } from './layout.js'; globalThis.out = JSON.stringify(layout(globalThis.manifest, globalThis.contract));`,
    'main.mjs',
    { type: 'module' },
  );
  if (result.error) { const err = vm.dump(result.error); result.error.dispose(); throw new Error('QuickJS: ' + JSON.stringify(err)); }
  result.value.dispose();
  const outHandle = vm.getProp(vm.global, 'out');
  const out = JSON.parse(vm.getString(outHandle));
  outHandle.dispose();
  vm.dispose();
  runtime.dispose();

  const native = layout(manifest, contract);
  expect(out.hash).toBe(native.hash);
  expect(out.placements.length).toBe(native.placements.length);
});
```

- [ ] **Step 2: Run to verify the outcome**

Run: `npx vitest run tests/layout/quickjs.test.ts`
Expected: PASS. If it FAILS with a hash mismatch, the difference is a number-formatting or `Math` divergence: print both `canonical(body)` strings, diff them, and replace the offending operation in `layout.js` with integer arithmetic. If the module loader throws for `./hash.js`, the normaliser passed a path with a `layout/` prefix: strip everything up to the last `/` in the loader.

- [ ] **Step 3: Commit**

```bash
git add tests/layout/quickjs.test.ts
git commit -m "test(layout): assert identical hash under QuickJS

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Grey-box kit and the kit loader

**Files:**
- Create: `src/kit/greybox.ts`, `src/kit/loader.ts`
- Test: `tests/kit/greybox.test.ts`, `tests/kit/loader.test.ts`

**Interfaces:**
- Produces: `greyboxGeometry(part: Part): BufferGeometry`, `greyboxMaterial(part: Part): MeshStandardMaterial`; `interface PartAsset { geometry: BufferGeometry; material: Material }`; `interface KitSource { load(part: Part): Promise<PartAsset> }`; `class GreyboxSource implements KitSource`; `class KitLoader { constructor(contract: Contract, source: KitSource); part(id): Part; get(id): Promise<PartAsset> }`; `type AssetsManifest`; `bakeStampMatches(assets, instance, layoutHash): boolean`.

- [ ] **Step 1: Write the failing grey-box tests**

`tests/kit/greybox.test.ts`:

```ts
import { Box3 } from 'three';
import contract from '../../kit/contract.json';
import type { Part } from '../../src/types';
import { greyboxGeometry, greyboxMaterial } from '../../src/kit/greybox';

const part = (id: string) => contract.parts.find((p) => p.id === id) as Part;

test('a column is a vertical cylinder standing on y=0 with the contract height', () => {
  const geo = greyboxGeometry(part('column-doric'));
  const box = new Box3().setFromBufferAttribute(geo.getAttribute('position') as any);
  expect(box.min.y).toBeCloseTo(0, 5);
  expect(box.max.y).toBeCloseTo(4, 5);
  expect(box.max.x - box.min.x).toBeLessThan(1);
});

test('a wall spans its footprint width and a floor slab hangs just below y=0', () => {
  const wall = new Box3().setFromBufferAttribute(greyboxGeometry(part('wall-3m')).getAttribute('position') as any);
  expect(wall.max.x - wall.min.x).toBeCloseTo(3, 5);
  expect(wall.max.y).toBeCloseTo(4, 5);
  const floor = new Box3().setFromBufferAttribute(greyboxGeometry(part('floor-slab-3x3')).getAttribute('position') as any);
  expect(floor.max.y).toBeCloseTo(0, 5);
  expect(floor.max.z - floor.min.z).toBeCloseTo(3, 5);
});

test('materials differ by category', () => {
  expect(greyboxMaterial(part('pool-basin-3x3')).color.getHex()).not.toBe(greyboxMaterial(part('wall-3m')).color.getHex());
  expect(greyboxMaterial(part('relief-a')).color.getHex()).toBe(0xd08a3c);
});
```

- [ ] **Step 2: Run to verify it fails, then create src/kit/greybox.ts**

Run: `npx vitest run tests/kit/greybox.test.ts` (expected FAIL, module not found)

```ts
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, MeshStandardMaterial } from 'three';
import type { Part } from '../types';

const COLORS: Record<Part['category'], number> = {
  structure: 0xd9d2c5, floor: 0xbdb5a6, water: 0x5d9bd1, dressing: 0x8f9a7a, focal: 0xd08a3c,
};

/** Stand-in shapes: enough silhouette to judge the layout, nothing more. All stand on y=0 at their local origin. */
export function greyboxGeometry(part: Part): BufferGeometry {
  const [fw, fd] = part.footprint;
  const h = Math.max(part.height, 0.1);
  if (part.id.startsWith('column')) return new CylinderGeometry(0.4, 0.45, h, 16).translate(0, h / 2, 0);
  if (part.id.startsWith('entablature')) return new BoxGeometry(fw, 0.6, 0.6).translate(0, 0.3, 0);
  if (part.id.startsWith('stair')) return new BoxGeometry(fw, 1, fd).translate(0, -0.5, 0);
  if (part.category === 'floor') return new BoxGeometry(fw, 0.1, fd).translate(0, -0.05, 0);
  if (part.category === 'water') {
    return part.id.startsWith('pool')
      ? new BoxGeometry(fw, 0.3, fd).translate(0, 0.15, 0)
      : new CylinderGeometry(0.5, 0.8, h, 12).translate(0, h / 2, 0);
  }
  if (part.category === 'structure') return new BoxGeometry(fw, h, 0.3).translate(0, h / 2, 0);
  return new BoxGeometry(fw * 0.7, h, fd * 0.7).translate(0, h / 2, 0);
}

export function greyboxMaterial(part: Part): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(COLORS[part.category]), roughness: 0.9, metalness: 0 });
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `npx vitest run tests/kit/greybox.test.ts`
Expected: 3 PASS.

- [ ] **Step 4: Write the failing loader tests**

`tests/kit/loader.test.ts`:

```ts
import contract from '../../kit/contract.json';
import type { Contract, Part } from '../../src/types';
import { GreyboxSource, KitLoader, bakeStampMatches, type AssetsManifest, type KitSource } from '../../src/kit/loader';

test('KitLoader loads each part once and shares the asset', async () => {
  let calls = 0;
  const counting: KitSource = { load: async (p: Part) => { calls++; return new GreyboxSource().load(p); } };
  const loader = new KitLoader(contract as Contract, counting);
  const [a, b] = await Promise.all([loader.get('column-doric'), loader.get('column-doric')]);
  expect(a).toBe(b);
  expect(calls).toBe(1);
  expect(loader.part('wall-3m').footprint).toEqual([3, 1]);
  expect(() => loader.part('nope')).toThrow('unknown part nope');
});

test('bakeStampMatches requires a matching layout hash on the bake file', () => {
  const assets: AssetsManifest = { version: 1, files: {
    'bake/entry.column-doric.1.lightmap.ktx2': { bytes: 10, hash: 'x', layout_hash: 'abc' },
    'kit/column-doric.obj': { bytes: 10, hash: 'y' },
  } };
  expect(bakeStampMatches(assets, 'entry.column-doric.1', 'abc')).toBe(true);
  expect(bakeStampMatches(assets, 'entry.column-doric.1', 'def')).toBe(false);
  expect(bakeStampMatches(assets, 'entry.column-doric.2', 'abc')).toBe(false);
});
```

- [ ] **Step 5: Run to verify it fails, then create src/kit/loader.ts**

Run: `npx vitest run tests/kit/loader.test.ts` (expected FAIL, module not found)

```ts
import type { BufferGeometry, Material } from 'three';
import type { Contract, Part } from '../types';
import { greyboxGeometry, greyboxMaterial } from './greybox';

export interface PartAsset { geometry: BufferGeometry; material: Material }
export interface KitSource { load(part: Part): Promise<PartAsset> }

/** Milestone 1 source: procedural stand-ins. The real OBJ+KTX2 source replaces this class without touching callers. */
export class GreyboxSource implements KitSource {
  async load(part: Part): Promise<PartAsset> {
    return { geometry: greyboxGeometry(part), material: greyboxMaterial(part) };
  }
}

export class KitLoader {
  private parts: Map<string, Part>;
  private cache = new Map<string, Promise<PartAsset>>();

  constructor(contract: Contract, private source: KitSource) {
    this.parts = new Map(contract.parts.map((p) => [p.id, p]));
  }

  part(id: string): Part {
    const p = this.parts.get(id);
    if (!p) throw new Error(`unknown part ${id}`);
    return p;
  }

  get(id: string): Promise<PartAsset> {
    let pending = this.cache.get(id);
    if (!pending) {
      pending = this.source.load(this.part(id));
      this.cache.set(id, pending);
    }
    return pending;
  }
}

export type AssetsManifest = {
  version: 1;
  files: Record<string, { bytes: number; hash: string; layout_hash?: string }>;
};

/** A bake is usable only if it was produced from the layout the runtime is showing. */
export function bakeStampMatches(assets: AssetsManifest, instance: string, layoutHash: string): boolean {
  const entry = assets.files[`bake/${instance}.lightmap.ktx2`];
  return !!entry && entry.layout_hash === layoutHash;
}
```

- [ ] **Step 6: Run to verify it passes and commit**

Run: `npx vitest run tests/kit && npm run typecheck`
Expected: all PASS.

```bash
git add src/kit tests/kit
git commit -m "feat(kit): grey-box stand-in kit, cached loader and bake stamp check

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Scene builder

**Files:**
- Create: `src/scene/builder.ts`
- Test: `tests/scene/builder.test.ts`

**Interfaces:**
- Produces: `class StopHandle { readonly id; readonly group: Group; readonly placements: Placement[]; loaded: boolean; load(): Promise<void>; unload(): void }`; `buildScene(layout: Layout, loader: KitLoader): { root: Group; stops: Map<string, StopHandle>; order: string[] }`.

- [ ] **Step 1: Write the failing test**

`tests/scene/builder.test.ts`:

```ts
import { InstancedMesh, Matrix4, Vector3 } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import type { Contract } from '../../src/types';
import { GreyboxSource, KitLoader } from '../../src/kit/loader';
import { buildScene } from '../../src/scene/builder';

const plan = layout(manifest, contract);
const loader = () => new KitLoader(contract as Contract, new GreyboxSource());

test('buildScene makes one handle per stop in rail order and nothing is loaded yet', () => {
  const { root, stops, order } = buildScene(plan, loader());
  expect(order).toEqual(['entry', 'matter-engine', 'cy-1', 'outrider-ide', 'cy-2', 'agent-queue', 'cy-3', 'quilt-trader', 'cy-4', 'terrace']);
  expect(root.children.length).toBe(order.length);
  for (const h of stops.values()) { expect(h.loaded).toBe(false); expect(h.group.children.length).toBe(0); }
});

test('loading a stop creates one InstancedMesh per part with the placement transforms', async () => {
  const { stops } = buildScene(plan, loader());
  const entry = stops.get('entry')!;
  await entry.load();
  expect(entry.loaded).toBe(true);
  const meshes = entry.group.children as InstancedMesh[];
  const byPart = new Map(meshes.map((m) => [m.name, m]));
  const floors = entry.placements.filter((p) => p.part === 'floor-slab-3x3');
  expect(byPart.get('floor-slab-3x3')!.count).toBe(floors.length);
  const m = new Matrix4();
  byPart.get('floor-slab-3x3')!.getMatrixAt(0, m);
  expect(new Vector3().setFromMatrixPosition(m).toArray()).toEqual(floors[0].transform.slice(12, 15));
  entry.unload();
  expect(entry.loaded).toBe(false);
  expect(entry.group.children.length).toBe(0);
});

test('concurrent load calls share one build', async () => {
  const { stops } = buildScene(plan, loader());
  const h = stops.get('cy-1')!;
  await Promise.all([h.load(), h.load()]);
  const names = h.group.children.map((c) => c.name);
  expect(new Set(names).size).toBe(names.length);
});
```

- [ ] **Step 2: Run to verify it fails, then create src/scene/builder.ts**

Run: `npx vitest run tests/scene/builder.test.ts` (expected FAIL, module not found)

```ts
import { Group, InstancedMesh, Matrix4 } from 'three';
import type { KitLoader } from '../kit/loader';
import type { Layout, Placement } from '../types';

/** One stop's meshes. Geometry and material are shared through the loader; only instance buffers are owned here. */
export class StopHandle {
  readonly group = new Group();
  readonly placements: Placement[] = [];
  loaded = false;
  private meshes: InstancedMesh[] = [];
  private pending: Promise<void> | null = null;

  constructor(readonly id: string, private loader: KitLoader) {
    this.group.name = id;
  }

  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.pending) this.pending = this.build();
    return this.pending;
  }

  private async build(): Promise<void> {
    const byPart = new Map<string, Placement[]>();
    for (const p of this.placements) {
      if (!byPart.has(p.part)) byPart.set(p.part, []);
      byPart.get(p.part)!.push(p);
    }
    const m = new Matrix4();
    for (const [partId, list] of byPart) {
      const asset = await this.loader.get(partId);
      const mesh = new InstancedMesh(asset.geometry, asset.material, list.length);
      mesh.name = partId;
      list.forEach((p, i) => { m.fromArray(p.transform); mesh.setMatrixAt(i, m); });
      mesh.instanceMatrix.needsUpdate = true;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.loaded = true;
    this.pending = null;
  }

  unload(): void {
    for (const mesh of this.meshes) { this.group.remove(mesh); mesh.dispose(); }
    this.meshes = [];
    this.loaded = false;
    this.pending = null;
  }
}

export function buildScene(layout: Layout, loader: KitLoader): { root: Group; stops: Map<string, StopHandle>; order: string[] } {
  const root = new Group();
  root.name = 'villa';
  const stops = new Map<string, StopHandle>();
  const order: string[] = [];
  for (const p of layout.placements) {
    let handle = stops.get(p.stop);
    if (!handle) {
      handle = new StopHandle(p.stop, loader);
      stops.set(p.stop, handle);
      order.push(p.stop);
      root.add(handle.group);
    }
    handle.placements.push(p);
  }
  return { root, stops, order };
}
```

- [ ] **Step 3: Run to verify it passes and commit**

Run: `npx vitest run tests/scene/builder.test.ts`
Expected: 3 PASS.

```bash
git add src/scene/builder.ts tests/scene/builder.test.ts
git commit -m "feat(scene): instanced per-stop scene builder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Streamer

**Files:**
- Create: `src/scene/streamer.ts`
- Test: `tests/scene/streamer.test.ts`

**Interfaces:**
- Produces: `streamWindow(order: string[], current: number, ahead = 2, behind = 3): Set<string>`; `class Streamer { constructor(stops: Map<string, StopHandle>, order: string[], ahead?, behind?); update(currentStop: string): Promise<void> }`.

- [ ] **Step 1: Write the failing test**

`tests/scene/streamer.test.ts`:

```ts
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import type { Contract } from '../../src/types';
import { GreyboxSource, KitLoader } from '../../src/kit/loader';
import { buildScene } from '../../src/scene/builder';
import { Streamer, streamWindow } from '../../src/scene/streamer';

const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

test('streamWindow keeps two ahead and three behind, clamped at the ends', () => {
  expect([...streamWindow(order, 0)]).toEqual(['a', 'b', 'c']);
  expect([...streamWindow(order, 4)]).toEqual(['b', 'c', 'd', 'e', 'f']);
  expect([...streamWindow(order, 6)]).toEqual(['d', 'e', 'f', 'g']);
});

test('Streamer loads the window and unloads what fell out of it', async () => {
  const plan = layout(manifest, contract);
  const { stops, order } = buildScene(plan, new KitLoader(contract as Contract, new GreyboxSource()));
  const streamer = new Streamer(stops, order);
  await streamer.update('entry');
  expect(order.filter((id) => stops.get(id)!.loaded)).toEqual(['entry', 'matter-engine', 'cy-1']);
  await streamer.update('agent-queue');
  expect(order.filter((id) => stops.get(id)!.loaded)).toEqual(['cy-1', 'outrider-ide', 'cy-2', 'agent-queue', 'cy-3', 'quilt-trader']);
  expect(stops.get('entry')!.loaded).toBe(false);
  await streamer.update('not-a-stop');
  expect(stops.get('agent-queue')!.loaded).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails, then create src/scene/streamer.ts**

Run: `npx vitest run tests/scene/streamer.test.ts` (expected FAIL, module not found)

```ts
import type { StopHandle } from './builder';

export function streamWindow(order: string[], current: number, ahead = 2, behind = 3): Set<string> {
  const keep = new Set<string>();
  for (let i = Math.max(0, current - behind); i <= Math.min(order.length - 1, current + ahead); i++) keep.add(order[i]);
  return keep;
}

/** Keeps memory flat: only the stops near the camera are resident, nearest loaded first. */
export class Streamer {
  constructor(private stops: Map<string, StopHandle>, private order: string[], private ahead = 2, private behind = 3) {}

  async update(currentStop: string): Promise<void> {
    const index = this.order.indexOf(currentStop);
    if (index < 0) return;
    const keep = streamWindow(this.order, index, this.ahead, this.behind);
    for (const [id, handle] of this.stops) if (!keep.has(id) && handle.loaded) handle.unload();
    const nearestFirst = [...keep].sort((a, b) => Math.abs(this.order.indexOf(a) - index) - Math.abs(this.order.indexOf(b) - index));
    for (const id of nearestFirst) await this.stops.get(id)!.load();
  }
}
```

- [ ] **Step 3: Run to verify it passes and commit**

Run: `npx vitest run tests/scene`
Expected: all PASS.

```bash
git add src/scene/streamer.ts tests/scene/streamer.test.ts
git commit -m "feat(scene): streaming window over stop order

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Rail curve

**Files:**
- Create: `src/camera/rail.ts`
- Test: `tests/camera/rail.test.ts`

**Interfaces:**
- Produces: `class Rail { constructor(viewpoints: Viewpoint[]); readonly viewpoints; readonly u: number[]; pose(u: number, out?): { position: Vector3; target: Vector3 }; nearest(u: number): number }`. `u` is the arc-length fraction along the curve at which viewpoint `i` sits.

- [ ] **Step 1: Write the failing test**

`tests/camera/rail.test.ts`:

```ts
import { Vector3 } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Rail } from '../../src/camera/rail';

const plan = layout(manifest, contract);

test('u fractions are monotonic from 0 to 1 and the curve passes through every viewpoint', () => {
  const rail = new Rail(plan.rail);
  expect(rail.u[0]).toBe(0);
  expect(rail.u[rail.u.length - 1]).toBe(1);
  for (let i = 1; i < rail.u.length; i++) expect(rail.u[i]).toBeGreaterThan(rail.u[i - 1]);
  for (let i = 0; i < plan.rail.length; i++) {
    const pose = rail.pose(rail.u[i]);
    expect(pose.position.distanceTo(new Vector3(...plan.rail[i].position))).toBeLessThan(0.15);
    expect(pose.target.distanceTo(new Vector3(...plan.rail[i].target))).toBeLessThan(0.5);
  }
});

test('nearest returns the closest viewpoint index and pose clamps u', () => {
  const rail = new Rail(plan.rail);
  expect(rail.nearest(rail.u[3] + 0.001)).toBe(3);
  expect(rail.nearest(-1)).toBe(0);
  expect(rail.pose(2).position.distanceTo(rail.pose(1).position)).toBe(0);
});

test('a rail needs at least two viewpoints', () => {
  expect(() => new Rail([plan.rail[0]])).toThrow('at least two');
});
```

- [ ] **Step 2: Run to verify it fails, then create src/camera/rail.ts**

Run: `npx vitest run tests/camera/rail.test.ts` (expected FAIL, module not found)

```ts
import { CatmullRomCurve3, Vector3 } from 'three';
import type { Viewpoint } from '../types';

const DIVISIONS = 400;

/** Smooth path through the viewpoints, parametrised by arc length so scrolling feels even. */
export class Rail {
  readonly curve: CatmullRomCurve3;
  readonly targets: CatmullRomCurve3;
  readonly u: number[];

  constructor(readonly viewpoints: Viewpoint[]) {
    if (viewpoints.length < 2) throw new Error('rail needs at least two viewpoints');
    this.curve = new CatmullRomCurve3(viewpoints.map((v) => new Vector3(...v.position)), false, 'centripetal');
    this.targets = new CatmullRomCurve3(viewpoints.map((v) => new Vector3(...v.target)), false, 'centripetal');
    this.curve.arcLengthDivisions = DIVISIONS;
    this.targets.arcLengthDivisions = DIVISIONS;
    const lengths = this.curve.getLengths(DIVISIONS);
    const total = lengths[lengths.length - 1];
    const n = viewpoints.length;
    this.u = viewpoints.map((_, i) => lengths[Math.round((i / (n - 1)) * DIVISIONS)] / total);
    this.u[n - 1] = 1;
  }

  pose(u: number, out = { position: new Vector3(), target: new Vector3() }): { position: Vector3; target: Vector3 } {
    const c = Math.min(1, Math.max(0, u));
    this.curve.getPointAt(c, out.position);
    this.targets.getPointAt(c, out.target);
    return out;
  }

  nearest(u: number): number {
    let best = 0;
    for (let i = 1; i < this.u.length; i++) if (Math.abs(this.u[i] - u) < Math.abs(this.u[best] - u)) best = i;
    return best;
  }
}
```

- [ ] **Step 3: Run to verify it passes and commit**

Run: `npx vitest run tests/camera/rail.test.ts`
Expected: 3 PASS. If the "passes through every viewpoint" tolerance fails, raise `DIVISIONS` to 1000 and rerun; the mapping error shrinks with divisions.

```bash
git add src/camera/rail.ts tests/camera/rail.test.ts
git commit -m "feat(camera): arc-length rail through the viewpoints

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Camera director

**Files:**
- Create: `src/camera/director.ts`
- Test: `tests/camera/director.test.ts`

**Interfaces:**
- Produces: `type Mode = 'scroll' | 'glide'`; `class Director { mode; u; constructor(rail: Rail, camera: Object3D, speed = 6); setScroll(fraction); scrollBy(delta); glideTo(index); step(delta); jump(index); nearest(): number; onViewpoint(cb: (index, stopId) => void); update(dt) }`.

- [ ] **Step 1: Write the failing test**

`tests/camera/director.test.ts`:

```ts
import { PerspectiveCamera, Vector3 } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Director } from '../../src/camera/director';
import { Rail } from '../../src/camera/rail';

const plan = layout(manifest, contract);
const make = () => { const rail = new Rail(plan.rail); const camera = new PerspectiveCamera(); return { rail, camera, director: new Director(rail, camera) }; };
const settle = (d: Director, frames = 400) => { for (let i = 0; i < frames; i++) d.update(1 / 60); };

test('scroll mode eases the camera to the scroll fraction', () => {
  const { director, camera, rail } = make();
  director.setScroll(0.5);
  settle(director);
  expect(director.u).toBeCloseTo(0.5, 3);
  expect(camera.position.distanceTo(rail.pose(0.5).position)).toBeLessThan(0.01);
});

test('glideTo lands exactly on a viewpoint and returns to scroll mode there', () => {
  const { director, rail } = make();
  director.glideTo(4);
  expect(director.mode).toBe('glide');
  settle(director);
  expect(director.u).toBe(rail.u[4]);
  expect(director.mode).toBe('scroll');
  director.scrollBy(0.01);
  settle(director);
  expect(director.u).toBeCloseTo(rail.u[4] + 0.01, 3);
});

test('scroll input is ignored while a glide is in flight', () => {
  const { director, rail } = make();
  director.glideTo(2);
  director.setScroll(0.9);
  settle(director);
  expect(director.u).toBe(rail.u[2]);
});

test('step moves between neighbouring viewpoints and clamps', () => {
  const { director, rail } = make();
  director.step(-1);
  settle(director);
  expect(director.u).toBe(0);
  director.step(1);
  settle(director);
  expect(director.u).toBe(rail.u[1]);
});

test('onViewpoint fires with the stop id when the nearest viewpoint changes, and jump is immediate', () => {
  const { director } = make();
  const seen: [number, string][] = [];
  director.onViewpoint((i, stop) => seen.push([i, stop]));
  director.jump(1);
  expect(seen).toEqual([[1, 'matter-engine']]);
  expect(director.u).toBe(director['rail'].u[1]);
  director.glideTo(3);
  settle(director);
  expect(seen[seen.length - 1]).toEqual([3, 'cy-1']);
});
```

- [ ] **Step 2: Run to verify it fails, then create src/camera/director.ts**

Run: `npx vitest run tests/camera/director.test.ts` (expected FAIL, module not found)

```ts
import { Vector3, type Object3D } from 'three';
import type { Rail } from './rail';

export type Mode = 'scroll' | 'glide';

/**
 * Sole owner of the camera. Scroll maps a 0..1 fraction onto the rail; a glide
 * animates to a viewpoint and then hands control back to scroll at that point.
 */
export class Director {
  mode: Mode = 'scroll';
  u = 0;
  private target = 0;
  private scroll = 0;
  private current = -1;
  private listeners: ((index: number, stopId: string) => void)[] = [];
  private pose = { position: new Vector3(), target: new Vector3() };

  constructor(private rail: Rail, private camera: Object3D, private speed = 6) {}

  setScroll(fraction: number): void {
    this.scroll = Math.min(1, Math.max(0, fraction));
    if (this.mode === 'scroll') this.target = this.scroll;
  }

  scrollBy(delta: number): void { this.setScroll(this.scroll + delta); }

  glideTo(index: number): void {
    const i = Math.min(this.rail.u.length - 1, Math.max(0, index));
    this.mode = 'glide';
    this.target = this.rail.u[i];
  }

  step(delta: number): void { this.glideTo(this.nearest() + delta); }

  /** Immediate placement, used at boot and by the static capture. */
  jump(index: number): void {
    this.glideTo(index);
    this.u = this.target;
    this.scroll = this.target;
    this.mode = 'scroll';
    this.apply();
  }

  nearest(): number { return this.rail.nearest(this.u); }

  onViewpoint(cb: (index: number, stopId: string) => void): void { this.listeners.push(cb); }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * this.speed);
    this.u += (this.target - this.u) * k;
    if (Math.abs(this.target - this.u) < 1e-4) {
      this.u = this.target;
      if (this.mode === 'glide') { this.mode = 'scroll'; this.scroll = this.u; }
    }
    this.apply();
  }

  private apply(): void {
    this.rail.pose(this.u, this.pose);
    this.camera.position.copy(this.pose.position);
    this.camera.lookAt(this.pose.target);
    const n = this.nearest();
    if (n !== this.current) {
      this.current = n;
      for (const cb of this.listeners) cb(n, this.rail.viewpoints[n].stop);
    }
  }
}
```

- [ ] **Step 3: Run to verify it passes and commit**

Run: `npx vitest run tests/camera && npm run typecheck`
Expected: all PASS.

```bash
git add src/camera/director.ts tests/camera/director.test.ts
git commit -m "feat(camera): scroll/glide director owning the camera

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Hotspot markers and input bindings

**Files:**
- Create: `src/input/bindings.ts`
- Test: `tests/dom/bindings.test.ts`

**Interfaces:**
- Produces: `SCROLL_PIXELS_PER_VIEWPOINT = 900`; `hotspotMarkers(hotspots, viewpoints): Group` (children carry `userData = { from, to, label }`, all hidden); `setActiveHotspots(group, fromIndex)`; `bindInputs(el: HTMLElement, director: Director, camera: Camera, markers: Group, viewpointCount: number): () => void`.

- [ ] **Step 1: Write the failing test**

`tests/dom/bindings.test.ts`:

```ts
// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Director } from '../../src/camera/director';
import { Rail } from '../../src/camera/rail';
import { SCROLL_PIXELS_PER_VIEWPOINT, bindInputs, hotspotMarkers, setActiveHotspots } from '../../src/input/bindings';

const plan = layout(manifest, contract);

test('hotspotMarkers creates one hidden marker per hotspot with viewpoint indices', () => {
  const group = hotspotMarkers(plan.hotspots, plan.rail);
  expect(group.children.length).toBe(plan.hotspots.length);
  expect(group.children.every((c) => c.visible === false)).toBe(true);
  expect(group.children[0].userData).toEqual({ from: 0, to: 1, label: 'threshold' });
  setActiveHotspots(group, 1);
  expect(group.children.filter((c) => c.visible).map((c) => c.userData.from)).toEqual([1]);
});

test('wheel scrolls by pixels over the whole rail and arrow keys step', () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const rail = new Rail(plan.rail);
  const director = new Director(rail, new PerspectiveCamera());
  const scrollBy = vi.spyOn(director, 'scrollBy');
  const step = vi.spyOn(director, 'step');
  const dispose = bindInputs(el, director, new PerspectiveCamera(), hotspotMarkers(plan.hotspots, plan.rail), plan.rail.length);
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 450, cancelable: true }));
  expect(scrollBy).toHaveBeenCalledWith(450 / (SCROLL_PIXELS_PER_VIEWPOINT * (plan.rail.length - 1)));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
  expect(step.mock.calls).toEqual([[1], [-1]]);
  dispose();
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
  expect(scrollBy).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify it fails, then create src/input/bindings.ts**

Run: `npx vitest run tests/dom/bindings.test.ts` (expected FAIL, module not found)

```ts
import { Group, Mesh, MeshBasicMaterial, Raycaster, SphereGeometry, Vector2, type Camera } from 'three';
import type { Director } from '../camera/director';
import type { Hotspot, Viewpoint } from '../types';

export const SCROLL_PIXELS_PER_VIEWPOINT = 900;

/** Clickable spheres at hotspot anchors. Only markers leaving the current viewpoint are visible. */
export function hotspotMarkers(hotspots: Hotspot[], viewpoints: Viewpoint[]): Group {
  const group = new Group();
  group.name = 'hotspots';
  const index = new Map(viewpoints.map((v, i) => [v.id, i]));
  const geometry = new SphereGeometry(0.35, 12, 8);
  const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
  for (const h of hotspots) {
    const marker = new Mesh(geometry, material);
    marker.position.set(...h.anchor);
    marker.userData = { from: index.get(h.from), to: index.get(h.to), label: h.label };
    marker.visible = false;
    group.add(marker);
  }
  return group;
}

export function setActiveHotspots(group: Group, fromIndex: number): void {
  for (const child of group.children) child.visible = child.userData.from === fromIndex;
}

export function bindInputs(el: HTMLElement, director: Director, camera: Camera, markers: Group, viewpointCount: number): () => void {
  const total = SCROLL_PIXELS_PER_VIEWPOINT * Math.max(1, viewpointCount - 1);
  const ray = new Raycaster();
  const ndc = new Vector2();
  let touchY: number | null = null;

  const onWheel = (e: WheelEvent) => { e.preventDefault(); director.scrollBy(e.deltaY / total); };
  const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY; };
  const onTouchMove = (e: TouchEvent) => {
    if (touchY === null) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    director.scrollBy((touchY - y) / total);
    touchY = y;
  };
  const onTouchEnd = () => { touchY = null; };
  const onKey = (e: KeyboardEvent) => {
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); director.step(1); }
    else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); director.step(-1); }
  };
  const onClick = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(markers.children.filter((c) => c.visible), false)[0];
    if (hit) director.glideTo(hit.object.userData.to);
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  return () => {
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKey);
  };
}
```

- [ ] **Step 3: Run to verify it passes and commit**

Run: `npx vitest run tests/dom/bindings.test.ts && npm run typecheck`
Expected: 2 PASS.

```bash
git add src/input tests/dom/bindings.test.ts
git commit -m "feat(input): hotspot markers and wheel, touch, keyboard, click bindings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Static fallback and mode selection

**Files:**
- Create: `src/fallback/static.ts`, `src/boot.ts`
- Test: `tests/dom/static.test.ts`, `tests/boot.test.ts`

**Interfaces:**
- Produces: `supportsWebGL(): boolean`; `prefersReducedMotion(): boolean`; `staticMarkup(content: PanelContent[], viewpoints: Viewpoint[]): string`; `renderStatic(root: HTMLElement, content, viewpoints): void`; `chooseMode(env: { webgl: boolean; reducedMotion: boolean; capture: boolean }): 'scene' | 'static'`.

- [ ] **Step 1: Write the failing tests**

`tests/boot.test.ts`:

```ts
import { chooseMode } from '../src/boot';

test('the scene runs only with WebGL and without a reduced-motion preference, except during capture', () => {
  expect(chooseMode({ webgl: true, reducedMotion: false, capture: false })).toBe('scene');
  expect(chooseMode({ webgl: false, reducedMotion: false, capture: false })).toBe('static');
  expect(chooseMode({ webgl: true, reducedMotion: true, capture: false })).toBe('static');
  expect(chooseMode({ webgl: true, reducedMotion: true, capture: true })).toBe('scene');
  expect(chooseMode({ webgl: false, reducedMotion: false, capture: true })).toBe('static');
});
```

`tests/dom/static.test.ts`:

```ts
// @vitest-environment jsdom
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { renderStatic, staticMarkup, supportsWebGL } from '../../src/fallback/static';

const plan = layout(manifest, contract);
const content = [
  { id: 'matter-engine', title: 'Matter <Engine>', html: '<p>m</p>', screenshots: [] },
  { id: 'agent-queue', title: 'Agent Queue', html: '<p>a</p>', screenshots: [] },
];

test('staticMarkup emits one image per viewpoint, in rail order, and each project panel once', () => {
  const html = staticMarkup(content, plan.rail);
  expect(html.match(/<figure class="static-view">/g)!.length).toBe(plan.rail.length);
  expect(html.indexOf('/static/entry-view.jpg')).toBeLessThan(html.indexOf('/static/matter-engine-enter.jpg'));
  expect(html.match(/data-stop="matter-engine"/g)!.length).toBe(1);
  expect(html).toContain('<h2>Matter &lt;Engine&gt;</h2>');
  expect(html.indexOf('/static/matter-engine-enter.jpg')).toBeLessThan(html.indexOf('data-stop="matter-engine"'));
});

test('renderStatic replaces the root and marks static mode', () => {
  const root = document.createElement('aside');
  root.innerHTML = '<section class="panel" data-stop="x" hidden></section>';
  renderStatic(root, content, plan.rail);
  expect(root.dataset.mode).toBe('static');
  expect(root.querySelector('[data-stop="x"]')).toBeNull();
  expect(root.querySelectorAll('img').length).toBe(plan.rail.length);
});

test('supportsWebGL is false in jsdom, which has no GL context', () => {
  expect(supportsWebGL()).toBe(false);
});
```

- [ ] **Step 2: Run to verify they fail, then create the modules**

Run: `npx vitest run tests/boot.test.ts tests/dom/static.test.ts` (expected FAIL, modules not found)

`src/boot.ts`:

```ts
export type Mode = 'scene' | 'static';

/** Reduced motion is honoured for visitors but not for the capture run that produces the static images themselves. */
export function chooseMode(env: { webgl: boolean; reducedMotion: boolean; capture: boolean }): Mode {
  if (!env.webgl) return 'static';
  if (env.reducedMotion && !env.capture) return 'static';
  return 'scene';
}
```

`src/fallback/static.ts`:

```ts
import { escapeHtml, type PanelContent } from '../panels/panels';
import type { Viewpoint } from '../types';

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The no-WebGL version: every viewpoint as an image, every project panel once, in rail order. */
export function staticMarkup(content: PanelContent[], viewpoints: Viewpoint[]): string {
  const byStop = new Map(content.map((c) => [c.id, c]));
  const shown = new Set<string>();
  let html = '';
  for (const v of viewpoints) {
    html += `<figure class="static-view"><img src="/static/${escapeHtml(v.id)}.jpg" alt="View of ${escapeHtml(v.stop)}" loading="lazy" width="1280" height="720"></figure>`;
    const c = byStop.get(v.stop);
    if (c && !shown.has(v.stop)) {
      shown.add(v.stop);
      html += `<section class="panel static" data-stop="${escapeHtml(c.id)}"><h2>${escapeHtml(c.title)}</h2><div class="panel-body">${c.html}</div></section>`;
    }
  }
  return html;
}

export function renderStatic(root: HTMLElement, content: PanelContent[], viewpoints: Viewpoint[]): void {
  root.innerHTML = staticMarkup(content, viewpoints);
  root.dataset.mode = 'static';
}
```

- [ ] **Step 3: Run to verify they pass and commit**

Run: `npx vitest run tests/boot.test.ts tests/dom/static.test.ts && npm run typecheck`
Expected: all PASS.

```bash
git add src/boot.ts src/fallback tests/boot.test.ts tests/dom/static.test.ts
git commit -m "feat(fallback): static markup and scene/static mode choice

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Bootstrap the scene in main.ts and verify in a browser

**Files:**
- Modify: `src/main.ts`
- Test: `tests/smoke/build.test.ts` (already exists) plus a manual check

**Interfaces:**
- Consumes: everything above. Produces: `window.__villaReady` (viewpoint index) once the requested viewpoint has rendered, used by the capture tool; URL params `vp=<index>` and `capture=1`.

- [ ] **Step 1: Replace src/main.ts**

```ts
import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import content from 'virtual:content';
import contract from '../kit/contract.json';
import manifest from '../content/manifest.json';
import { layout } from '../layout/layout.js';
import { chooseMode } from './boot';
import { Director } from './camera/director';
import { Rail } from './camera/rail';
import { prefersReducedMotion, renderStatic, supportsWebGL } from './fallback/static';
import { bindInputs, hotspotMarkers, setActiveHotspots } from './input/bindings';
import { GreyboxSource, KitLoader } from './kit/loader';
import { Panels } from './panels/panels';
import { buildScene } from './scene/builder';
import { Streamer } from './scene/streamer';
import type { Contract, Manifest } from './types';

declare global {
  interface Window { __villaReady?: number }
}

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('villa') as HTMLCanvasElement;
const panelsRoot = document.getElementById('panels') as HTMLElement;

const plan = layout(manifest as Manifest, contract as Contract);
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const startAt = Math.min(plan.rail.length - 1, Math.max(0, Number(params.get('vp') ?? '0') || 0));

const projectIds = new Set(content.map((c) => c.id));

function fallback(): void {
  canvas.remove();
  renderStatic(panelsRoot, content, plan.rail);
}

async function boot(): Promise<void> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new Scene();
  scene.background = new Color(0xe8e4dc);
  scene.fog = new Fog(0xe8e4dc, 25, 90);
  scene.add(new HemisphereLight(0xfff4e0, 0x8a7f6a, 0.9));
  scene.add(new AmbientLight(0xffffff, 0.15));
  const sun = new DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(12, 30, 8);
  scene.add(sun);

  const camera = new PerspectiveCamera(55, 1, 0.1, 200);
  const loader = new KitLoader(contract as Contract, new GreyboxSource());
  const { root, stops, order } = buildScene(plan, loader);
  scene.add(root);

  const streamer = new Streamer(stops, order);
  const rail = new Rail(plan.rail);
  const director = new Director(rail, camera);
  const markers = hotspotMarkers(plan.hotspots, plan.rail);
  scene.add(markers);
  const panels = new Panels(panelsRoot, content);

  director.onViewpoint((index, stop) => {
    setActiveHotspots(markers, index);
    panels.show(projectIds.has(stop) ? stop : null);
    void streamer.update(stop);
  });

  bindInputs(app, director, camera, markers, plan.rail.length);

  const resize = () => {
    const w = app.clientWidth, h = app.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  await streamer.update(plan.rail[startAt].stop);
  director.jump(startAt);

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    director.update(dt);
    renderer.render(scene, camera);
    if (capture && window.__villaReady === undefined) window.__villaReady = startAt;
  });
}

if (chooseMode({ webgl: supportsWebGL(), reducedMotion: prefersReducedMotion(), capture }) === 'static') {
  fallback();
} else {
  boot().catch((err) => { console.error('villa: falling back to static', err); fallback(); });
}
```

- [ ] **Step 2: Build, typecheck, and run the whole suite**

Run: `npm run typecheck && npm test`
Expected: all PASS, including the build smoke test.

- [ ] **Step 3: Manual check in a browser**

Run: `npm run dev` and open the printed URL. Confirm each of these, and fix before moving on:

1. The entry court renders: grey floor, columns, a blue pool with a fountain cylinder, warm sky colour.
2. Scrolling the wheel moves forward along the rail; the first project panel ("Matter Engine") slides in on the right when the camera reaches the pool hall.
3. A translucent sphere sits at the doorway ahead; clicking it glides to the next viewpoint and the panel changes accordingly.
4. Arrow keys step between viewpoints. Reaching the terrace shows no panel.
5. `?vp=5&capture=1` loads directly at the Outrider focal viewpoint and `window.__villaReady` is `5` in the console.
6. In devtools, emulate `prefers-reduced-motion: reduce` and reload: the canvas is gone and the static list of images and panels shows (images 404 until Task 17).

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: bootstrap the grey-box promenade scene

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Static images and visual regression with headless Chromium

**Files:**
- Create: `tools/render-static.mjs`, `tools/check-visual.mjs`, `tests/visual/refs/*.png` (generated once)
- Test: `tests/tools/check-visual.test.ts`

**Interfaces:**
- Produces: `npm run render:static` writes `dist/static/<viewpoint-id>.jpg` and `tmp/visual/<viewpoint-id>.png`; `npm run check:visual` compares `tmp/visual` to `tests/visual/refs`; `compare(actualDir, refDir, { update }): Promise<{ failures: string[]; compared: number }>` exported from `tools/check-visual.mjs`.

- [ ] **Step 1: Write the failing comparison test**

`tests/tools/check-visual.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { compare } from '../../tools/check-visual.mjs';

function png(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): Buffer {
  const img = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fill(x, y); const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  return PNG.sync.write(img);
}

test('compare passes identical images, fails a changed one, and update writes references', async () => {
  const actual = await mkdtemp(join(tmpdir(), 'vis-a-'));
  const refs = await mkdtemp(join(tmpdir(), 'vis-r-'));
  const grey = png(40, 30, () => [128, 128, 128]);
  await writeFile(join(actual, 'a.png'), grey);
  await writeFile(join(actual, 'b.png'), grey);

  const first = await compare(actual, refs, { update: true });
  expect(first.failures).toEqual([]);
  expect(first.compared).toBe(2);

  await writeFile(join(actual, 'b.png'), png(40, 30, (x) => (x < 20 ? [255, 0, 0] : [128, 128, 128])));
  const second = await compare(actual, refs, { update: false });
  expect(second.failures.length).toBe(1);
  expect(second.failures[0]).toMatch(/^b\.png: /);

  await writeFile(join(actual, 'c.png'), grey);
  const third = await compare(actual, refs, { update: false });
  expect(third.failures.some((f) => f.startsWith('c.png: no reference'))).toBe(true);

  await rm(actual, { recursive: true, force: true });
  await rm(refs, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify it fails, then create tools/check-visual.mjs**

Run: `npx vitest run tests/tools/check-visual.test.ts` (expected FAIL, module not found)

```js
/**
 * Compare captured viewpoint PNGs against committed references.
 *
 *   node tools/check-visual.mjs <actualDir> <refDir> [--update]
 *
 * A capture fails when more than 0.5% of pixels differ (pixelmatch threshold 0.1)
 * or when it has no reference. --update (re)writes every reference.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const MAX_DIFF_RATIO = 0.005;

export async function compare(actualDir, refDir, { update = false } = {}) {
  await mkdir(refDir, { recursive: true });
  const files = (await readdir(actualDir)).filter((f) => f.endsWith('.png')).sort();
  const failures = [];
  for (const file of files) {
    const actualBytes = await readFile(join(actualDir, file));
    const refPath = join(refDir, file);
    let refBytes = null;
    try { refBytes = await readFile(refPath); } catch { refBytes = null; }
    if (update || !refBytes) {
      if (!update) { failures.push(`${file}: no reference; run with --update to accept`); continue; }
      await writeFile(refPath, actualBytes);
      continue;
    }
    const a = PNG.sync.read(actualBytes), b = PNG.sync.read(refBytes);
    if (a.width !== b.width || a.height !== b.height) { failures.push(`${file}: size ${a.width}x${a.height} vs reference ${b.width}x${b.height}`); continue; }
    const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
    const ratio = diff / (a.width * a.height);
    if (ratio > MAX_DIFF_RATIO) failures.push(`${file}: ${(ratio * 100).toFixed(2)}% of pixels differ`);
  }
  return { failures, compared: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const [actualDir = 'tmp/visual', refDir = 'tests/visual/refs'] = args.filter((a) => !a.startsWith('--'));
  const { failures, compared } = await compare(resolve(actualDir), resolve(refDir), { update });
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
  console.log(`visual: ${compared} capture(s) ${update ? 'accepted' : 'match'}`);
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `npx vitest run tests/tools/check-visual.test.ts`
Expected: PASS.

- [ ] **Step 4: Create tools/render-static.mjs**

```js
/**
 * Capture every rail viewpoint from the built site with headless Chromium.
 *
 *   node tools/render-static.mjs [--png <dir>]
 *
 * Writes dist/static/<viewpoint>.jpg (served as the static fallback) and, with
 * --png, lossless copies for the visual check. Requires `npm run build` first.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { layout } from '../layout/layout.js';

const root = process.cwd();
const args = process.argv.slice(2);
const pngIdx = args.indexOf('--png');
const pngDir = pngIdx === -1 ? null : resolve(args[pngIdx + 1]);
const outDir = join(root, 'dist/static');

const manifest = JSON.parse(await readFile(join(root, 'content/manifest.json'), 'utf8'));
const contract = JSON.parse(await readFile(join(root, 'kit/contract.json'), 'utf8'));
const plan = layout(manifest, contract);

const server = await preview({ root, preview: { port: 4173, strictPort: true }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

await mkdir(outDir, { recursive: true });
if (pngDir) await mkdir(pngDir, { recursive: true });

try {
  for (let i = 0; i < plan.rail.length; i++) {
    const vp = plan.rail[i];
    await page.goto(`${base}?vp=${i}&capture=1`, { waitUntil: 'load' });
    await page.waitForFunction((n) => window.__villaReady === n, i, { timeout: 60_000 });
    await page.waitForTimeout(100);
    await page.screenshot({ path: join(outDir, `${vp.id}.jpg`), type: 'jpeg', quality: 80 });
    if (pngDir) await page.screenshot({ path: join(pngDir, `${vp.id}.png`), type: 'png' });
    console.log(`static ${vp.id}`);
  }
} finally {
  await browser.close();
  await server.close();
}
```

- [ ] **Step 5: Install Chromium, capture, accept references, and re-run the check**

Run:

```bash
npx playwright install --with-deps chromium
npm run build && npm run render:static
ls dist/static | wc -l
node tools/check-visual.mjs tmp/visual tests/visual/refs --update
npm run check:visual
```

Expected: `14` images; `visual: 14 capture(s) accepted`; then `visual: 14 capture(s) match`. Open two of the JPEGs and confirm they show the grey-box rooms, not a blank page. If a capture is blank, Chromium lacked GL: confirm the launch args are present and that `chooseMode` returned `scene` (the `capture` param must bypass reduced motion).

- [ ] **Step 6: Commit the tools and references**

```bash
git add tools/render-static.mjs tools/check-visual.mjs tests/tools/check-visual.test.ts tests/visual/refs
git commit -m "feat(tools): static viewpoint capture and visual regression check

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Byte budgets, CI and deploy workflows, README

**Files:**
- Create: `tools/budgets.mjs`
- Modify: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `README.md`
- Test: `tests/tools/budgets.test.ts`

**Interfaces:**
- Produces: `LIMITS`, `measure(root, dist?): Promise<Measurement>`, `violations(m: Measurement): string[]` from `tools/budgets.mjs`; `npm run budgets` exits 1 on any violation.

- [ ] **Step 1: Write the failing budgets test**

`tests/tools/budgets.test.ts`:

```ts
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIMITS, measure, violations } from '../../tools/budgets.mjs';

const root = join(__dirname, '..', '..');

async function fakeSite(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'budget-'));
  for (const p of ['kit', 'content']) await cp(join(root, p), join(dir, p), { recursive: true });
  await mkdir(join(dir, 'dist/bundle'), { recursive: true });
  await mkdir(join(dir, 'dist/assets/kit'), { recursive: true });
  await mkdir(join(dir, 'dist/assets/bake'), { recursive: true });
  await writeFile(join(dir, 'dist/index.html'), 'x'.repeat(1000));
  await writeFile(join(dir, 'dist/bundle/index.js'), 'x'.repeat(4000));
  return dir;
}

test('measure attributes kit and bake files to the stops that use them', async () => {
  const dir = await fakeSite();
  await writeFile(join(dir, 'dist/assets/kit/column-doric.obj'), 'x'.repeat(300));
  await writeFile(join(dir, 'dist/assets/kit/column-doric.albedo.ktx2'), 'x'.repeat(700));
  await writeFile(join(dir, 'dist/assets/bake/entry.column-doric.1.lightmap.ktx2'), 'x'.repeat(50));
  const m = await measure(dir);
  expect(m.shell).toBe(5000);
  expect(m.stopBytes['entry']).toBe(1050);
  expect(m.stopBytes['matter-engine']).toBe(1000);
  expect(m.stopBytes['cy-1']).toBe(1000);
  expect(m.firstLoad).toBe(5000 + 1050 + 1000);
  expect(m.largestTexture).toBe(700);
  expect(m.assets).toBe(1050);
  expect(violations(m)).toEqual([]);
  await rm(dir, { recursive: true, force: true });
});

test('violations name the budget that was exceeded', () => {
  const m = { shell: 0, firstLoad: LIMITS.firstLoad + 1, stopBytes: { entry: LIMITS.stop + 1 }, largestTexture: LIMITS.texture + 1, assets: LIMITS.assets + 1, total: 0 };
  const v = violations(m);
  expect(v.some((s) => s.startsWith('first load'))).toBe(true);
  expect(v.some((s) => s.startsWith('stop entry'))).toBe(true);
  expect(v.some((s) => s.startsWith('texture'))).toBe(true);
  expect(v.some((s) => s.startsWith('assets folder'))).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails, then create tools/budgets.mjs**

Run: `npx vitest run tests/tools/budgets.test.ts` (expected FAIL, module not found)

```js
/**
 * Byte budgets over the built site (spec section 8). Fails when any is exceeded.
 *
 *   node tools/budgets.mjs [dist]
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../layout/layout.js';

const MB = 1024 * 1024;
export const LIMITS = { firstLoad: 12 * MB, stop: 6 * MB, texture: 1.5 * MB, assets: 80 * MB };

async function walk(dir, base = dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch (err) { if (err.code === 'ENOENT') return []; throw err; }
  const out = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else out.push({ rel: relative(base, full).split('\\').join('/'), bytes: (await stat(full)).size });
  }
  return out;
}

export async function measure(root, dist = 'dist') {
  const files = await walk(join(root, dist));
  const sum = (pred) => files.filter(pred).reduce((n, f) => n + f.bytes, 0);
  const manifest = JSON.parse(await readFile(join(root, 'content/manifest.json'), 'utf8'));
  const contract = JSON.parse(await readFile(join(root, 'kit/contract.json'), 'utf8'));
  const plan = layout(manifest, contract);

  const partsByStop = new Map();
  const instancesByStop = new Map();
  const order = [];
  for (const p of plan.placements) {
    if (!partsByStop.has(p.stop)) { partsByStop.set(p.stop, new Set()); instancesByStop.set(p.stop, new Set()); order.push(p.stop); }
    partsByStop.get(p.stop).add(p.part);
    instancesByStop.get(p.stop).add(p.instance);
  }

  const stopBytes = {};
  for (const stop of order) {
    const parts = [...partsByStop.get(stop)], instances = [...instancesByStop.get(stop)];
    stopBytes[stop] = sum((f) => parts.some((part) => f.rel.startsWith(`assets/kit/${part}.`)) || instances.some((inst) => f.rel.startsWith(`assets/bake/${inst}.`)));
  }
  const shell = sum((f) => f.rel === 'index.html' || f.rel.startsWith('bundle/'));
  const firstLoad = shell + (stopBytes[order[0]] ?? 0) + (stopBytes[order[1]] ?? 0);
  const textures = files.filter((f) => f.rel.startsWith('assets/') && /\.(ktx2|png|jpg|jpeg|webp)$/i.test(f.rel));
  return {
    shell, firstLoad, stopBytes,
    largestTexture: textures.reduce((m, t) => Math.max(m, t.bytes), 0),
    assets: sum((f) => f.rel.startsWith('assets/')),
    total: sum(() => true),
  };
}

export function violations(m) {
  const fmt = (b) => (b / MB).toFixed(2) + ' MB';
  const v = [];
  if (m.firstLoad > LIMITS.firstLoad) v.push(`first load ${fmt(m.firstLoad)} exceeds ${fmt(LIMITS.firstLoad)}`);
  for (const [stop, bytes] of Object.entries(m.stopBytes)) if (bytes > LIMITS.stop) v.push(`stop ${stop} ${fmt(bytes)} exceeds ${fmt(LIMITS.stop)}`);
  if (m.largestTexture > LIMITS.texture) v.push(`texture ${fmt(m.largestTexture)} exceeds ${fmt(LIMITS.texture)}`);
  if (m.assets > LIMITS.assets) v.push(`assets folder ${fmt(m.assets)} exceeds ${fmt(LIMITS.assets)}`);
  return v;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const m = await measure(process.cwd(), process.argv[2] ?? 'dist');
  const fmt = (b) => (b / MB).toFixed(2) + ' MB';
  console.log(`shell ${fmt(m.shell)}  first load ${fmt(m.firstLoad)}  assets ${fmt(m.assets)}  largest texture ${fmt(m.largestTexture)}  total ${fmt(m.total)}`);
  for (const [stop, bytes] of Object.entries(m.stopBytes)) console.log(`  ${stop.padEnd(16)} ${fmt(bytes)}`);
  const v = violations(m);
  if (v.length) { console.error(v.join('\n')); process.exit(1); }
  console.log('budgets: ok');
}
```

- [ ] **Step 3: Run to verify it passes and run it on the real build**

Run: `npx vitest run tests/tools/budgets.test.ts && npm run build && npm run budgets`
Expected: tests PASS; CLI prints the table and `budgets: ok` (assets are all zero in milestone 1).

- [ ] **Step 4: Rewrite .github/workflows/ci.yml**

```yaml
# Every push and pull request: validate the data files, run the unit tests,
# build, capture the static views, compare them to the references, enforce
# byte budgets, check links, and hold the page to its Lighthouse budget.
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  build:
    name: Test, build, capture, budgets, links
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci
      - run: npm run validate
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

      - name: Install Chromium for the static capture
        run: npx playwright install --with-deps chromium

      - run: npm run render:static
      - run: npm run check:visual
      - run: npm run budgets

      # --external is on here and off in the deploy workflow: a pull request is
      # the right place to learn that a project link rotted.
      - name: Link check (including external URLs)
        run: node tools/link-check.mjs dist --external

      - name: Upload built site
        uses: actions/upload-artifact@v7
        with:
          name: dist
          path: dist
          retention-days: 7

      - name: Upload captures on failure
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: visual
          path: tmp/visual
          retention-days: 7

  lighthouse:
    name: Lighthouse budget
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci
      - run: npm run build

      # lhci serves dist/ itself (staticDistDir) and uses the runner's Chrome.
      # Thresholds live in lighthouserc.json.
      - name: Lighthouse
        run: npx -y @lhci/cli@0.15.1 autorun

      - name: Upload Lighthouse reports
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: lighthouse
          path: .lighthouseci
          retention-days: 7
```

- [ ] **Step 5: Update the build steps in .github/workflows/deploy.yml**

Replace the `build` job's steps between `actions/setup-node` and `The custom domain this deploy will publish` with:

```yaml
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci
      - run: npm run build

      - name: Install Chromium for the static capture
        run: npx playwright install --with-deps chromium

      - run: npm run render:static

      # External URLs are skipped: a rate-limited runner must not block a deploy.
      - name: Link check
        run: node tools/link-check.mjs dist
```

Remove the old `# No npm ci` comment and the `node tools/build.mjs` step. Leave everything else in the file untouched.

- [ ] **Step 6: Check the Lighthouse config still points at dist/ and relax nothing silently**

Open `lighthouserc.json`. It must still use `staticDistDir: "dist"`. Run `npm run lighthouse` locally once. If the performance score drops under the configured threshold because of the three.js bundle, do not lower the threshold: note the score in the pull request description and file a follow-up for code-splitting the bundle. Accessibility and best-practices thresholds must pass.

- [ ] **Step 7: Rewrite README.md**

```markdown
# jackkern.com

A single-page personal site: a sunlit Greek villa you scroll through, one room per project.
Design: `docs/superpowers/specs/2026-09-15-jackkern-3d-site-design.md`.

## Develop

    npm ci
    npm run dev          # Vite dev server
    npm test             # unit tests (Vitest)
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
```

- [ ] **Step 8: Full local run, then commit and open the pull request**

Run:

```bash
npm run validate && npm run typecheck && npm test && npm run build && npm run render:static && npm run check:visual && npm run budgets && npm run check:links:external
```

Expected: every command exits 0.

```bash
git add tools/budgets.mjs tests/tools/budgets.test.ts .github/workflows README.md
git commit -m "ci: budgets, static capture and visual check in CI and deploy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/greybox-promenade
gh pr create --title "Grey-box promenade (milestone 1)" --body "$(cat <<'EOF'
Milestone 1 of docs/superpowers/specs/2026-09-15-jackkern-3d-site-design.md, per docs/superpowers/plans/2026-09-15-greybox-promenade.md.

- Layout module (pure JS, QuickJS-verified hash) from manifest + kit contract
- three.js runtime: grey-box kit, instanced per-stop scene, streaming, rail, scroll/glide director, hotspots, HTML panels
- Static fallback with captured viewpoint images; visual regression references
- Byte budgets, validation and capture wired into CI and deploy

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope for this plan

Real kit loading (OBJ, MTL, KTX2), lightmap application, phone tier textures, water and fountain effects, and the Matter Engine bake-site script belong to milestones 2 through 4 and get their own plans once prime-flare and eager-bridge land.
