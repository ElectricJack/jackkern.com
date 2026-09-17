# Villa improvement goal — draft

2026-09-16. Prepared from the current local build, user feedback, and the existing villa spec.
The visual direction was approved. The grey-box interface, route, and content pass is implemented locally; see [verification](../verification/design-pass/README.md). The Matter asset-production and delivery plan below remains proposed, and the published site has not been updated.

## Proposed goal

Turn jackkern.com into a polished, sunlit villa portfolio: one uninterrupted camera journey, project information that appears in floating HTML panes, and a distinctive architectural environment made from a compact Matter Engine kit. Preserve crisp silhouettes and readable content on desktop and mobile, and prove the asset pipeline on one finished space before producing the whole villa.

## What the current build tells us

- The runtime already uses one Catmull–Rom position curve for the entire walk. Its 38 path points include two exact 180° reversals: `cy-2-in → cy-2-view → cy-2-turn` and `cy-4-in → cy-4-view → cy-4-turn`. These are plausible sources of the reported stalls; continuity of the curve alone does not prevent a direction reversal.
- Wheel travel decays quickly and wheel input is discarded during a keyboard/hotspot glide. Both need review alongside the route geometry.
- Project panels switch using `hidden` when the nearest viewpoint changes. The container remains a full-height 420 px sidebar, including in courtyards with no active project. On mobile it occupies 45vh.
- The Matter Engine focal view fills much of the mobile canvas with the stand-in object. Responsive camera composition needs attention as well as the overlay.
- The generated scene has 335 placements using 15 distinct part IDs. The contract lists 17 parts; `pool-edge-straight` and `bench-3m` are currently unused. Reuse and instancing already exist and should be preserved.
- There is no `assets/` directory or `tools/pack.mjs` in this checkout. The runtime uses `GreyboxSource`; the real export/texture/lightmap pipeline described in the original spec is not implemented here.
- Content has explicit placeholders. The Matter Engine text already says the villa is baked by that engine, although this build still renders procedural stand-ins with live lights. Make that claim accurate during the editorial pass.

## Art direction

A quiet Mediterranean atelier: warm limestone, chalk plaster, pale travertine, deep blue-green water, olive foliage, and restrained bronze accents. Sunlight, shadow, depth, and a few strong silhouettes provide the visual character.

Use fine bevels where light catches an edge. Put subtle surface detail in shared textures; reserve geometry for contours, openings, column profiles, and close foreground features. Avoid uniform visual noise and damage on every surface.

The entry should establish identity and orientation immediately: Jack Kern, a concise portfolio introduction based on approved copy, a subtle scroll cue, and a direct project index. Carry a small name/link and compact progress indicator through the walk. Replace the large translucent hotspot spheres with discreet, legible navigation affordances.

Typography: a restrained serif for project titles and a clean sans-serif for body copy and controls. Start with system fonts; assess a small, licensed, subsetted WOFF2 only if it materially improves the result. Use generous spacing and one warm accent for interactive elements. All text stays HTML.

Room identity should come from a small number of composed features:

| Space | Visual purpose | Proposed treatment |
|---|---|---|
| Entry court | Introduce the author and the interaction | Open sky, clear route, a low pool, an unobstructed first view |
| Matter Engine | Show material, geometry, and light | Pool hall, sculpted wall fountain, sun across stone and water |
| Outrider IDE | Express reading and inspecting structure | A quieter gallery, carved layered sculpture, a real product screenshot in the pane |
| Agent Queue | Express coordinated independent work | An exedra with a relief of connected forms; keep the project's actual description literal |
| Quilt Trader | Give the project a distinct exhibit | Ceramic or woven geometric motif; copy now grounded in the local Quilt Trader repository |
| Terrace | End with a clear next action | Open horizon, brief closing text, contact and project links |

## Movement and camera

Treat project viewpoints as landmarks along a route, rather than positions the route must visit and backtrack from. Redesign the two reversing courtyard segments as broad through-curves. If space is insufficient, move a landmark or adjust the layout instead of forcing a turn in place.

Keep arc-length travel, continuous tangents at joins, and continuous viewing direction. At constant input, movement must not pause at a project boundary. Smooth speed changes and camera rotation separately; increasing input smoothing alone will not fix a cusp. The only natural endpoints are the entry and terrace, with a gentle finish.

Wheel or touch input should take over an in-progress keyboard/hotspot glide from its current pose and velocity. No ignored input and no snap to a landmark. Stopping input should allow a short, controlled coast; this is not an autoplay tour. Reverse travel should follow the same route predictably.

Keep the existing clearance and stair-footing checks. Add or adapt checks for route reversals, minimum displacement during constant travel, and position/view direction continuity. Review the full journey with a mouse wheel, trackpad, touch, keyboard, and forward/backward transitions. Camera framing must be evaluated at desktop and portrait aspect ratios.

## Floating project panes

Replace the sidebar with one compact pane inside viewport margins. Place it in a compositionally quiet corner, with the sculpture/water/doorway visible beside it. Use warm paper, a fine border, and a soft shadow; translucency is optional and text contrast must hold without expensive full-screen blur.

Each collapsed pane contains a project number, title, short factual summary, and one or two links. Longer descriptions and screenshots open on explicit request. Desktop width should be approximately 320–400 px, constrained on smaller screens. Mobile uses a compact floating card above the safe area; its expanded details are separately scrollable.

Drive reveal/hold/fade from continuous distance along the route, initially testing roughly 1.5–2 m fade zones. Project changes must not move the camera. Courtyards should expose the whole scene. Avoid overlapping readable text during transitions.

Handle interaction deliberately: invisible panes cannot intercept clicks or receive focus; controls remain usable during fades; user focus is not silently removed when passing a boundary. Scrolling inside expanded details scrolls the details. Clicks on HTML links must not also trigger a hotspot raycast. Reduced-motion and no-WebGL modes retain a complete, usable document and project index.

## Matter Engine production list

See [the asset list](2026-09-16-matter-asset-list.csv) for individual parts, current instance counts, materials, and production order. Existing contract IDs should remain stable; new pieces need explicit contract additions.

Build a finished entry court and Matter Engine pool hall first. That slice must prove columns, wall/doorway details, floor, pool/fountain, one plant, material reuse, baked light, compression, and loading on a narrow screen. Rework the kit from that evidence before authoring the remaining project pieces.

Shared texture families:

| Family | Proposed use | Initial authoring and delivery approach |
|---|---|---|
| Limestone/travertine | Columns, floors, wall bases | Tileable base color and normal; roughness map only where it adds visible variation |
| Chalk plaster | Broad wall surfaces | Subtle tiled detail; constant color/roughness where a map is unnecessary |
| Architectural trim sheet | Cornices, plinths, carved bands | One reusable strip atlas; bake fine relief and preserve important silhouette edges |
| Pale marble | Selected focal objects | Shared subtle material, with unique maps only for visibly unique details |
| Aged bronze | Small fittings and accents | Reuse a material and scalar metallic/roughness values before adding texture maps |
| Terracotta | Urns and pots | One shared material with small per-instance color variation |
| Foliage atlas | Olive and ground planting | A small shared atlas with tested alpha edges, mip padding, and limited overdraw |
| Water | Pools and fountains | Small tileable normal maps; restrained animation; no large animated texture sequence |
| Lighting | Architectural shading | Prototype a lightmap atlas per room/chunk, with carefully padded UV islands |

Start most tileable sources at 2K and small decorative maps at 1K, then choose delivery sizes from actual screen coverage. These are trial sizes, not requirements to allocate every map. Shared repetition preserves close-range detail without creating a unique 4K image for every wall. Test mipmaps and anisotropic filtering on grazing floors. Use a small amount of roughness/color variation to disguise repetition without duplicating texture files.

## Export and delivery

Matter Engine remains the source for geometry, material authoring, and lighting. Confirm the engine checkout, runnable export/bake tooling, and sample output before scheduling production; these were not located in this site's checkout. The existing spec names an OBJ/MTL/PBR export contract, which is an intermediate option rather than a required browser format.

Proposed delivery pipeline:

1. Author a canonical kit part once, in metres, with stable origin, orientation, named material slots, and matching collision/footprint metadata. Keep editable masters outside the browser payload.
2. Export high-quality mesh/material data from Matter Engine using the exporter it actually supports. Verify UVs, handedness, normals, texture color spaces, and scale with a small fixture. If OBJ/MTL is the intermediate, explicitly carry roughness/metalness and bake metadata through the conversion; do not assume MTL preserves all PBR data.
3. Convert to glTF/GLB, deduplicate, remove unused data, and optimize geometry. Benchmark Meshopt first and Draco where a particularly large mesh warrants comparison. The installed three.js r180 loader supports `EXT_meshopt_compression` and KTX2; pin the packer output accordingly instead of assuming the newer `KHR_meshopt_compression` is supported. [three.js loader](https://threejs.org/docs/pages/GLTFLoader.html), [gltfpack](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md).
4. Use KTX2/Basis for GPU textures. Trial ETC1S for forgiving color maps, and UASTC for detailed normals, packed material maps, and other surfaces where artifacts are visible. Test both size and appearance rather than applying one codec everywhere. KTX2 can preserve GPU compression, but is not guaranteed to be the smallest download. [Khronos artist guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md).
5. Package shared materials/textures once and stream geometry/lightmaps by sensible room groups. Keep a small shared kit plus independently cacheable content; avoid a single archive that must download before the first frame. Preserve stable part identities through optimization and honor any quantization transforms.
6. Bake against the exact deterministic placement output and layout hash. Change the original per-instance-file proposal to a measured atlas/chunk approach if the prototype confirms the benefit. **Instancing plus unique baked lighting needs implementation:** stock shared materials do not select a different lightmap for each instance. Prototype per-instance atlas scale/offset attributes, or an equivalent tested batching scheme, before committing to the bake format. Coordinate material sampling, mip padding, and disposal.
7. Write an asset manifest with version, hashes, compressed transfer bytes, decoded geometry and estimated texture memory, part bounds, LODs, and bake provenance. Validate it in the build.
8. Serve compressible responses with Brotli or gzip when the host negotiates it. Browsers decompress an HTTP `Content-Encoding` response automatically; merely uploading a `.gz` file does not establish that behavior. Verify actual production headers for JS, JSON, WASM and GLB. [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Compression).

Keep one shared decoded mesh/material per repeated part, and instance placements in the browser. Author secondary placement rules with a fixed seed and consistent clearance constraints. If placed objects affect baked lighting, include them in the bake layout. Scatter small optional dressing only within defined zones and keep the same composition across device tiers.

Quality should adapt to measured capability: texture/geometry tiers, bounded device pixel ratio, controlled transparent effects, and a smaller resident room window. Budget decoder downloads and initialization as part of first load. Audit loader cache disposal: unloading instance meshes alone does not evict retained textures and geometry. The normal fallback remains available when rendering is unsupported or inappropriate.

## Proposed success criteria

These are draft targets to validate with the first finished space, not performance claims about the current build.

| Area | Target/evidence |
|---|---|
| Travel | Continuous traversal through every room in both directions; no route cusps, forced room stops, or lost input during handoff |
| Composition | Full scene visible between projects; floating panes readable and useful at 1440×900 and 390×844, with responsive intermediate sizes |
| Asset quality | Side-by-side uncompressed/compressed captures from the closest allowed camera positions; no visibly damaged silhouettes, normal-map blocks, atlas seams, or floor shimmer |
| Initial transfer | Aim for ≤3 MB desktop and ≤1.5 MB mobile for a usable entry/first project, including runtime and decoders; revise explicitly after the first real asset slice |
| Complete walk transfer | Initial target ≤12 MB desktop / ≤6 MB mobile, loaded progressively; record actual cold-cache bytes |
| Resident texture memory | Initial target ≤128 MiB desktop / ≤64 MiB mobile; also report geometry and render-target allocations |
| Frame pacing | Aim for stable 60 fps on a representative integrated-GPU desktop and at least 30 fps on the agreed mobile baseline; report p95 frame time and upload hitches |
| Accessibility | All project content and links usable with keyboard, reduced motion, and static fallback; invisible content cannot trap focus |
| Verification | Unit/geometry checks, browser console/network checks, real captures, and an honest report of tested desktop/mobile devices |

Measure actual transfer separately from file size and GPU memory. Do not treat gzip size as a memory estimate. Preserve the existing upper safety budgets until the new targets have been tested and intentionally adopted.

The current Lighthouse settings predate automatic 3D launch and already fail canvas/LCP and transfer assumptions. Keep those failures explicit during the redesign. Evaluate the document experience separately from 3D readiness, then set meaningful budgets for both; do not just raise thresholds to obtain a passing report.

## Work sequence

1. Confirm this goal and visual direction. Prepare desktop/mobile compositions with real project content before producing the full environment.
2. Fix route geometry and input handoffs; review continuous movement in the stand-in villa.
3. Implement floating panes, responsive framing, project navigation, and the accessible document presentation.
4. Build and benchmark one finished entry/pool-hall slice through Matter Engine and the browser packer. Record quality/size comparisons and lock the export/bake contract.
5. Produce remaining kit/project assets; place them deterministically, bake the final layout, and stream the finished rooms.
6. Tune materials, lighting, water, typography and transitions together; run device/quality checks and refresh the local preview.

Before the asset-production phase, obtain the engine checkout/export location and the intended mobile test device. The Outrider placeholder has been replaced using existing project facts, and Quilt Trader copy now comes from its local repository. Remaining asset dependencies do not prevent review of the implemented navigation and interface.
