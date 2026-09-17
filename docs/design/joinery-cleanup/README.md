# Villa joinery cleanup — 2026-09-16

[Local build](http://localhost:4321/) · [Supported columns and arrival stair](details/entry-platform.png) · [Beam proportions](details/column-beam.png) · [Door surround](details/door-front.png) · [Pool coping](details/pool-edge.png)

The white navigation spheres and their scene click targets are removed. The Begin button, project navigation, wheel, touch and keyboard controls remain available.

Exterior columns now stand on a continuous foundation with a 65 cm marble ledge outside the paving. The arrival stair moves forward to meet that ledge. A height-field union emits only exposed foundation faces, avoiding overlapping slabs at room boundaries. Tests raycast nine points across every column base to verify support at its actual floor height.

The lower beam band is broadened from approximately 65 cm to 96 cm against the 1 m column capital. Its upper cornice is approximately 116 cm wide, reducing the relative flare. This adjusts the shared Matter geometry after decoding; the exported GLBs stay unchanged. Perpendicular beams are shortened to butt against solid marble junction blocks, removing the overlapping horizontal faces at L/T/cross connections. Instancing is preserved.

Each doorway has one continuous marble vault meeting full-height piers. Shader joints suggest the individual stones without separate floating blocks or a duplicate mortar shell. Infill closes the corners between the curved arch and the original rectangular opening. Wall corners receive solid stone piers and connected masonry courses. Pool coping is raised 7 cm so its lower edge meets the basin wall's top instead of sharing the same inner vertical surface.

The fixes use geometry and placement changes rather than depth bias. The Matter kit remains 21 asset types and 457 placements, with additional architecture generated in shared procedural batches. No new texture downloads are needed. The camera path and continuous cruise behavior are unchanged.

## Verification

- All 124 tests and TypeScript checking pass. New geometry tests cover column support, unobstructed door apertures, arch connections, cornice intersections and basin/coping contact.
- [Desktop/mobile landmark views](browser-report.json) and [close-up inspection from nearby angles](detail-report.json).
- [Graphics recovery, cruise, missing-asset fallback and reading mode](behavior-report.json).
- [Build, byte budgets and check results](verification.json).

Browser evidence uses Chromium with SwiftShader and mobile viewport emulation. It verifies appearance and behavior, not performance on a physical phone. The close-up fixture loads the complete villa to inspect joins from outside the normal camera route; it is only served by the development server.

```sh
npm run typecheck
npm test
npm run build
node tools/assets/review-kit.mjs http://127.0.0.1:4321 docs/design/joinery-cleanup
node tools/assets/verify-kit.mjs http://127.0.0.1:4321 docs/design/joinery-cleanup
# Run a Vite development server on 4322 for the inspection fixture:
node tools/assets/inspect-joinery.mjs http://127.0.0.1:4322 docs/design/joinery-cleanup
```
