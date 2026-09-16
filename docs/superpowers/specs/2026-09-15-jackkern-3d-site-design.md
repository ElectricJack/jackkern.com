# jackkern.com: a scrollable Greek villa of projects

Design spec, 2026-09-15. Status: approved in brainstorming, awaiting written review.

## 1. Goal

A single-page personal site at https://jackkern.com whose main page is a stylised
3D house in the manner of Myst: Greek architecture, pools and fountains, lit by
sunlight from openings above. Scrolling walks the visitor through the house; each
room is one project. A click mode lets the visitor move between fixed viewpoints
and explore. The house is expandable: adding a project is a manifest edit, not a
rebuild.

Meshes are authored and baked in Matter Engine (the maintainer's own engine) and
exported as simple shapes with PBR textures. Room layouts are generated in the web
app. Lighting is fully baked in the engine; the web renderer does no global
illumination of its own.

## 2. Decisions

| Topic | Decision |
|---|---|
| Asset strategy | Hybrid: architecture from a kit of parts, organic pieces from the same kit. Matter Engine bakes the parts; the web app assembles rooms. |
| Kit scope | Full architectural kit: columns, walls, floors, stairs, entablature, pool sections, fountains, statues, urns, planters, foliage. |
| Topology | Linear promenade with courtyards as connectors: entry court, room, courtyard, room, ..., terrace. Scroll order equals project order. |
| Walk mode | Myst-style fixed viewpoints. Clicking a hotspot glides to the next viewpoint on the same rail scroll uses. Free first-person walking is a non-goal. |
| Project presentation | Physical focal object per room plus an HTML panel that slides in at the room's viewpoint. Text is HTML, never texture. |
| Device tiers | Desktop first (60 fps on integrated graphics, first load under 12 MB). Phones get half-resolution textures and no dressing parts. No WebGL or reduced motion gets a static version. |
| Lighting | Fully baked GI from Matter Engine (sun, sky, bounce, occlusion) as per-instance lightmaps. Water is the only live effect. |
| Asset storage | Plain git commits. Keep files small; budgets enforced in CI. No LFS, no release downloads, no external bucket. |
| Bake/layout consistency | One pure JavaScript layout module runs in both the browser and Matter Engine's QuickJS host, so the engine bakes exactly the scene the browser assembles. Bakes are stamped with the layout hash. |
| Initial rooms | Entry court, Matter Engine (pool hall), Outrider IDE, Agent Queue, Quilt Trader, terrace. |
| Build order | Web runtime first against a grey-box stand-in kit; real kit and bakes drop in later without runtime changes. |

## 3. Architecture

Two repositories, one contract.

**jackkern.com** owns the site: content manifest, kit contract, layout module,
three.js runtime, grey-box stand-in kit, committed real kit and bakes, pack
script, deploy. Vanilla TypeScript bundled with Vite; three.js is the only
runtime dependency of size. No UI framework.

**matter-engine-cpp** owns asset production: the Greek kit authored as engine
Parts, the OBJ+MTL+PBR exporter (task prime-flare), the full-scene GI bake (task
eager-bridge), and a bake-site script that loads the site's manifest, contract
and layout module, assembles the house in QuickJS, bakes it, and writes results
into the site repo's assets folder.

Shared files, all living in the site repo and read by both sides:

1. `content/manifest.json`: one entry per rail stop.
2. `kit/contract.json`: the part vocabulary.
3. `layout/layout.js`: the pure layout module.

Data flows one way: manifest + contract -> layout module -> placement list ->
(browser renders it from the kit) and (engine bakes it and writes lightmaps
named by instance id, stamped with the layout hash). The runtime checks the
stamp before using a bake.

## 4. Kit contract

Grid module 1 m; column bay 3 m. Each part in `kit/contract.json` declares:

```json
{
  "version": 1,
  "module_m": 1,
  "parts": [
    {
      "id": "column-doric",
      "category": "structure",
      "footprint": [1, 1],
      "height": 4,
      "sockets": [{ "name": "top", "at": [0.5, 4, 0.5], "dir": "+y" }],
      "tier": "full"
    }
  ]
}
```

- `id`: stable `family-variant` form (`wall-3m-doorway`, `floor-slab-3x3`,
  `pool-edge-straight`, `fountain-tiered`, `statue-a`).
- `footprint` in grid cells and `height` in modules, so layout never needs the mesh.
- `sockets`: named attachment points with a direction, so entablature snaps onto
  column tops and a doorway lines up with the neighbouring threshold.
- `category`: `structure`, `floor`, `water`, `dressing`, `focal`.
- `tier`: `full`, `half`, or `skip` on the phone tier.

Starting kit: about 24 structure and floor parts, 4 water parts, 8 dressing
parts, one focal part per project; around 40 files. A part on disk is
`assets/kit/<id>.obj`, `<id>.mtl`, and `<id>.<map>.ktx2` for albedo, normal,
roughness, metallic, and occlusion. After bake, each instance that uses the part
has `assets/bake/<instance-id>.lightmap.ktx2`.

## 5. Content manifest

`content/manifest.json` lists rail stops in order. Entry court and terrace are
fixed entries in the same list.

```json
{
  "version": 1,
  "seed": 20260915,
  "stops": [
    { "id": "entry", "kind": "court" },
    {
      "id": "matter-engine",
      "kind": "project",
      "title": "Matter Engine",
      "archetype": "pool-hall",
      "focal": "fountain-tiered",
      "panel": "content/matter-engine.md",
      "screenshots": ["content/img/matter-engine-1.jpg"]
    },
    { "id": "outrider-ide", "kind": "project", "archetype": "gallery", "focal": "statue-a", "panel": "content/outrider-ide.md" },
    { "id": "agent-queue", "kind": "project", "archetype": "exedra", "focal": "relief-a", "panel": "content/agent-queue.md" },
    { "id": "quilt-trader", "kind": "project", "archetype": "gallery", "focal": "urn-large", "panel": "content/quilt-trader.md" },
    { "id": "terrace", "kind": "terrace" }
  ]
}
```

Archetypes: `gallery`, `pool-hall`, `exedra`. Adding a project is one entry and
one Markdown file. Both JSON files are validated by schema in CI; the engine's
bake-site script refuses a version it does not know.

## 6. Layout module

`layout/layout.js` is a pure ES module with no imports: `layout(manifest,
contract, seed) -> Layout`. It carries its own seeded random generator and uses
only integer grid arithmetic and fixed-decimal transforms so results are
identical in V8 and QuickJS.

Three passes:

1. **Sequence.** Walk stops in order and emit the chain: entry court, room,
   courtyard, room, courtyard, ..., terrace. Every second joint turns 90 degrees,
   alternating left and right; every third courtyard drops one level with a
   stair run. The fold pattern continues as projects are added.
2. **Fill.** Per-archetype rules lay floor slabs, place column bays on open
   sides, close the others with wall segments, cut thresholds on connecting
   sides, drop entablature over every column run. Courtyards get a central pool,
   a fountain at one end, and open sky. The focal part sits at the far wall on
   the rail axis. Dressing parts fill from a per-archetype list until the room's
   dressing budget is spent.
3. **Rail and nodes.** Two viewpoints per project room; one each for the
   entry court, every courtyard, and the terrace; each with position, look
   target, and stop id. Between them, the walk: the doorway bays the camera
   goes out through and the steps aside that keep it clear of the centrepieces
   and the focal pieces, so the curve stays inside the rooms that hold its
   viewpoints. Hotspots per viewpoint: visible thresholds and the focal object.

Output, JSON-serialisable:

```ts
type Layout = {
  version: 1;
  hash: string;                       // FNV-1a 64-bit over the canonical JSON of everything below, implemented inside the module (no crypto dependency in QuickJS)
  placements: { instance: string; part: string; stop: string; transform: number[16] }[];
  rail: { id: string; stop: string; position: number[3]; target: number[3] }[];
  path: { id: string; stop: string; position: number[3]; target: number[3] }[];   // the whole walk the camera rides; `rail` is the subsequence it stops at
  hotspots: { from: string; to: string; anchor: number[3]; label: string }[];
  bounds: Record<string, { min: number[3]; max: number[3] }>;   // per stop, for streaming
};
```

`hash` is the layout version that bakes are stamped with. Canonical JSON means
sorted keys, no whitespace, and numbers printed with fixed six-decimal precision.

## 7. Runtime

Five modules with one-way dependencies.

- **Kit loader.** Reads the contract; loads a part on demand (OBJ+MTL, KTX2 via
  the Basis transcoder); caches one geometry and material per part id; instances
  share them. If `assets/bake/<instance>.lightmap.ktx2` exists and its stamp
  matches `layout.hash`, the material gets it as `lightMap` on the second UV
  set. Otherwise the part gets an unlit-plus-single-sun material and a console
  warning names the stale bake.
- **Scene builder.** Turns placements into instanced meshes per part id, grouped
  by stop; registers each stop's bounds with the streamer.
- **Streamer.** Loads the entry court immediately, then stops in rail order two
  ahead of the camera; disposes stops more than three behind.
- **Camera director.** Sole owner of the camera. Scroll mode maps scroll
  position to distance along a Catmull-Rom curve through the walk with easing
  and look-ahead; splining the viewpoints alone would bow the curve out through
  the walls between them. Node mode animates between viewpoints on the same curve. One
  state machine: scrolling from a node resumes the rail there; a hotspot click
  pauses scroll mapping until the glide lands. Touch swipe drives scroll;
  keyboard arrows step nodes.
- **Panel layer.** Plain HTML. Entering a project's viewpoint slides in its
  panel: Markdown rendered at build time, screenshots, links. The same DOM is the
  static fallback, so assistive tech and search engines see every project.

Water: one plane per pool with animated normals, cube-map sky reflection, and a
caustic texture projected on the basin floor. Fountains: sprite particles. Both
skipped on the phone tier.

## 8. Asset pipeline and budgets

Production runs on the maintainer's Windows machine; the site repo receives only
finished, small files.

1. **Author** the Greek kit as engine Parts in a kit scene in Matter Engine, one
   Part per contract id, built to be baked down. (New engine ticket.)
2. **Export** each Part with the prime-flare exporter: simplified mesh, one xatlas
   UV set, PBR maps.
3. **Bake** with the eager-bridge GI bake against the assembled house. The
   bake-site script loads manifest, contract and `layout.js`, runs the layout in
   QuickJS, assembles placements, bakes, and writes one lightmap per instance
   stamped with `layout.hash`.
4. **Pack** with `tools/pack.mjs` in the site repo: PNG to KTX2 (ETC1S) at 1024
   px, 512 px for dressing and small parts; quantise OBJ precision; write
   `assets/manifest.json` with sizes and hashes; render static fallback images
   and phone-tier textures.
5. **Commit.** Files named by part id and instance id, overwritten in place.

Budgets, checked in CI and failing the pull request when exceeded:

| Budget | Limit |
|---|---|
| First load (entry court + first room) | 12 MB |
| Any single stop including bakes | 6 MB |
| Any single texture file | 1.5 MB |
| Whole `assets/` folder | 80 MB |

## 9. Error handling and fallbacks

- **No WebGL, reduced motion, or runtime failure before first frame:** remove
  the canvas and show the static version (one rendered image per viewpoint with
  the same panels in rail order). This is also what the link check runs against.
- **Part fails to load:** substitute a flat grey placeholder of the part's
  footprint; log the id; continue.
- **Stale or missing bake:** render unlit plus live sun; the pack script's CI
  check lists every instance whose stamp mismatches `layout.hash` and fails.
- **Manifest and layout disagree** (unknown archetype, unknown part): layout
  throws a named error; the build fails; the runtime never sees a partial layout.
- **Slow network:** entry court renders as soon as it lands; the rail scrolls
  while later stops load; a threshold shimmer marks non-resident stops; panels
  show regardless.
- **Engine/browser hash mismatch:** both write the hash they computed; CI
  compares and fails on difference.

## 10. Testing

- **Layout:** Node unit tests with fixed seeds: chain shape, every room connects
  through a matching threshold, no overlapping placements, focal parts on the
  rail axis, stable hash. A determinism test runs `layout.js` inside a QuickJS
  instance under Node and compares hashes with V8.
- **Schemas:** manifest, contract and assets manifest validated in CI; fixtures
  per error class assert the named failure.
- **Runtime:** Vitest with a WebGL stub for the director state machine,
  scroll-to-rail mapping, node glides, streamer windows, bake stamp check.
- **Visual:** headless Chromium renders each rail viewpoint and compares to
  committed references with tolerance; the same step produces the static images.
- **Budgets and links:** existing link check plus the Section 8 budgets on built output.
- **Engine side:** prime-flare and eager-bridge carry their own tests; the
  bake-site script checks its layout hash equals the committed one.

## 11. Milestones

1. **Grey-box promenade.** Contract, manifest, layout module with tests, runtime
   with a procedural stand-in kit (boxes, cylinders, flat colours), scroll and
   node modes, panels, streaming, static fallback, budgets in CI. Shippable as an
   interim site.
2. **Real kit.** Greek kit authored in Matter Engine; exported through
   prime-flare; packed and committed. Runtime unchanged.
3. **Baked light.** eager-bridge bake through the bake-site script; lightmaps
   committed; stamp check green.
4. **Polish.** Water, fountains, phone tier tuning, visual references.

Engine-side tickets: prime-flare (OBJ export) and eager-bridge (GI bake) exist;
kit authoring and the bake-site script are to be filed after this spec is
approved.

## 12. Non-goals

Free first-person walking; text rendered into textures; time of day; real-time
reflections or refraction; glTF export (kept possible by a format-agnostic
extraction layer in the engine); any CMS or server component.
