# Portfolio feedback pass — 17 September 2026

The 3D portfolio now presents larger cards beside the art, with screenshots, an automatic
preview reveal and a persistent link to the full project. The original heading and villa
palette remain. Header navigation is larger and includes the public LinkedIn and Twitter
profiles. The reading view is a complete scrolling portfolio with lazy screenshots and
progressive reveals; it works without JavaScript and respects reduced motion.

The route map links projects, entrance and terrace; the intervening courtyards have no buttons.
Quick links normally animate for 1.8 seconds: adjacent destinations follow the rail; distant
destinations visibly depart, fade to pure white while moving, skip along the rail under full
white, then fade back in during the approach and settle visibly. Explicit visits remain paused. The
ordinary tour runs at 4.2 m/s (previously 1.44), with 1.1-second endpoint ramps and
0.45-second input ramps, and names its destination. Cards own wheel/touch scrolling.

Matter's armillary and Outrider's compass use small, texture-free three.js meshes.
Agent Queue was restored to its original Matter-exported bronze-and-white connected-node
relief at the user's request. Quilt retains its Matter-authored gold treasury and native simulation poses.
Courtyard 2 has a potted olive island and reflecting pool; courtyard 3 has twin planted rills
and a small spring; courtyard 4 has a raised planted basin and a spillway into a lower pool.
Trees and ground plants sit in stone containers with soil. Screenshots now use their natural
aspect ratio at full card width, without a height cap or letterbox background.
The Matter project includes landscape and editor screenshots, the engine credit, and the
suggested tagline. Quilt's screenshot is explicitly labeled as a synthetic-data example.

## Loading and rendering

Only the initial room and its visible neighbour block the first frame. Assets for later
rooms warm serially after paint using idle callbacks; only a bounded neighbourhood is
instanced. Parallel requests within the visible room remove the previous serial waterfall.
Changing destinations cancels obsolete streaming work, covered by a regression test.

Mobile rendering previously used the same maximum pixel ratio (2) and model triangle counts
as desktop, and an additional scene pass for water reflections. The new mobile ratio cap
of 1.25 reduces pixel work by 61% on high-DPI phones. Mobile uses animated water normals
without that reflection pass, lower-detail instrument meshes, smaller textures, and reduced
anisotropy. Hidden tabs and the reading view continue to suspend scene rendering.

Measured mobile asset changes, relative to the original checked-in exports:

| Asset | Original bytes | New bytes | Original triangles | New triangles |
| --- | ---: | ---: | ---: | ---: |
| Doric column | 298,944 | 125,928 | 8,680 | 6,580 |
| Olive | 94,748 | 76,624 | 2,422 | 2,382 |
| Fountain | 168,936 | 85,852 | 4,848 | 4,392 |
| Entablature | 60,284 | 39,868 | 1,980 | 1,980 |

Column texture memory falls from 9,437,195 to 2,359,307 bytes. Mobile GLBs retain Meshopt
compression and pass glTF validation and the existing kit-bound tolerance. Original desktop
exports are retained. The seven project screenshots total approximately 604 KB as WebP.

## Verification

Run `npm run validate`, `npm run typecheck`, `npm test`, `npm run build`, `npm run budgets`
and `npm run check:links`. `node tools/verify-feedback.mjs` starts a preview of the production
build and writes screenshots and results to `tmp/feedback/`. It checks all twelve directed
project shortcuts, visible project links, the two-room initial window, mobile reflections,
social links, image loading, background loading, reduced motion, and no-JavaScript content.

Browser tests use Chromium with SwiftShader. Their timings are useful for navigation and
loading regressions, but are not measurements of frame rates on a physical phone. Full
Matter-scene screenshots and card checks run on desktop and mobile. The twelve animated
shortcut checks use the built-in lightweight kit and the same production navigation path:
SwiftShader can spend several seconds compiling/rendering newly visible detailed geometry,
which exposed an animation clock bug in the earlier 1.6-second revision. The revised clock
resets after asset preparation and caps each quick-visit step at 50 ms, preserving visible
motion and the covered cut even after long render stalls. On slow renderers this extends the
wall-clock duration; hardware frame-rate validation remains separate.
`node tools/verify-timeline.mjs [base-url]` additionally checks the full Matter scene, including
actual camera position changes during both fades, a pure-white overlay around the cut,
unfaded adjacent travel, both travel directions, and reduced-motion navigation.
Puzzle mechanics remain a follow-up: this pass prioritizes content and navigation as requested.

The initial production browser pass completed with zero console, page or HTTP errors. Its
instant-cut timings were superseded by the 1.6-second animated navigation revision.
Initial residency was exactly entrance + Matter on both viewport sizes; the high-DPI mobile
canvas used 513,785 pixels and zero reflection passes. Background loading, reading images,
visible project links, header social links, reduced motion and no-JavaScript content passed.

The courtyard/navigation revision passes 149 tests, typechecking, layout validation, production
build/static captures, size budgets and local link checks. Its browser run completed with no
console, page or HTTP errors. All twelve lightweight-scene shortcuts moved the camera;
adjacent links remained visible and every non-adjacent link fully faded around its cut.
Full-scene desktop/mobile cards passed natural-aspect, full-width screenshot checks.

## Follow-up: motion, paintings, and header

The white-fade revision preserves visible departure and arrival motion even across slow
render frames. The full-scene browser check exercises forward/reverse shortcuts and verifies
that camera position changes during both fades, with the rail cut covered by opaque white.

All 36 wall hangings now have unique seeded paintings, including opposite wall faces.
Each room retains a coordinated palette; brush placement, scratches, splatter, gold position,
scale, rotation and foil texture vary per hanging. The gold uses a metallic, low-roughness
mask over matte pigment, with a shared packed height/roughness/metalness texture. Textures
are generated lazily and cached on room visits, at 384px desktop / 192px mobile resolution.
Regression checks compare all 36 pixel outputs for uniqueness and deterministic regeneration.

Agent Queue's task-graph screenshot is now primary in both the 3D card and reading page.
The header keeps its original position but its opaque backdrop extends to the top edge,
with a 28px fade beneath it; desktop and mobile reading-mode checks cover scrolled content.

The combined follow-up passes all 154 unit/regression tests and the full-scene browser
checks for timeline fades, reduced motion, header coverage, and screenshot ordering.

## Manual navigation correction

The timeline handler previously passed a zero duration when `prefers-reduced-motion: reduce`
was active. This reproduced an 83 ms navigation with zero animated frames (versus 93 sampled
frames with no preference). Explicit timeline/index clicks now always use the animated
director visit; reduced motion continues to disable autoplay and ambient effects. Browser
regressions now assert visible camera movement and fades for all six timeline buttons under
both preferences, rather than accepting instantaneous arrival in the reduced-motion test.

Up/Right move forward and Down/Left move backward. The visible forward button no longer
inherits the direction of a prior backward trip; only the labelled terrace return goes back.

Verified against the production build: all six timeline buttons animate under both motion
preferences, with moving fade-out/fade-in phases and fully covered cuts for distant visits.
All four arrow keys and the forward button after a backward trip pass browser checks.
All 161 unit/regression tests, typechecking, build/static captures, size budgets and link checks pass.

## Room-specific painting algorithms

Each room now dispatches to a different composition generator: Matter's warped mineral
strata, Outrider's angular dry palette-knife slabs, Agent Queue's flowing pigment ribbons,
and Quilt's alternating warp/weft impasto bands. Canvas grain, scratches, splatter and the
reflective gold layer tie them together. All 36 instance seeds remain distinct and stable;
mobile texture sizing and lazy caching are unchanged. Tests also hold palette and seed
constant across all four techniques to verify that their matte compositions differ—not
just their colors or gold accents. A visual contact sheet is at `tmp/art/room-algorithms.png`.
The revision passes 163 tests, typechecking, layout validation, production build with all
14 scene captures, size budgets, and local link checks. The contact sheet and in-scene
project captures were visually reviewed.

Courtyard 3's two entrance-wall paintings now use the upper courtyard floor as their
height reference, raising them by one metre. Quilt's interior paintings retain their
original height above its lower floor. The regression covers all room entry elevations
and checks that the raised paintings remain within the wall height.
