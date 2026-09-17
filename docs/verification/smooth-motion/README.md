# Smoother villa motion — 2026-09-16

Historical verification. The current behavior is documented in [Continuous flight and camera composition](../continuous-flight/README.md).

The camera keeps one continuous route through the grey-box villa. This pass smooths its spatial joins and its response to input.

- Short quintic patches join the position and look-target splines with matching velocity and acceleration (C2 continuity), while preserving their authored points. The arc-length table still drives both curves together.
- Courtyards 1 and 3 now continue around the fountain before aligning with the exit. Their viewing positions move 65 cm inward to leave clearance for the broader turns. The room/project viewpoints retain their authored composition.
- Look-ahead is gentler (35% blend over a 2.5 m fade). Overlapping fades have smooth derivatives even when the nearest viewpoint changes.
- Wheel and touch gestures feed a decaying drive with a 90 ms velocity response. Actual speed stays continuous on input and reversal. Integration is analytical, so refresh rate does not change gesture distance. Fine trackpad deltas use a proportionate rest cutoff.
- Navigation glides use a damped spring, easing into an 8 m/s maximum cruising speed. Retargeting and wheel takeover preserve actual velocity. A faster glide taken over by the wheel eases down toward the 4 m/s wheel range instead of abruptly clamping speed.

## Measurements

`before.json` and `after.json` sample the actual rail every centimetre. They compare the prior design build with this motion pass, including the wider courtyard routes.

| Measure | Before | After |
| --- | ---: | ---: |
| Route length | 109.72 m | 110.23 m |
| Maximum viewing-direction turn per metre | 29.78° | 27.08° |
| Maximum change in view-direction slope | 5.64 /m² | 1.67 /m² |
| Maximum path curvature | 8.67 /m | 6.50 /m |

These are geometric measurements, not device frame-rate claims. Clearance, doorway headroom, stair footing, arc-length displacement, and viewpoint framing remain tested.

## Verification

- All 116 tests in 29 files pass; type checking and manifest validation pass.
- New regression checks cover C2 joins, gradual wheel onset, fine deltas, smooth reversals, glide retargeting/takeover, and matching glide behavior at 30/60/144 Hz.
- The production build renders all 14 viewpoints without capture errors. Updated references were inspected, including changed courtyard framing and deterministic dressing placement. The visual comparison and byte budgets pass.
- The existing design browser check passes: project navigation, expanded cards, keyboard focus, wheel interruption, emulated touch, reduced motion, no JavaScript, and no idle WebGL draws.
- `node docs/verification/smooth-motion/browser.mjs` checks a complete forward and reverse wheel traversal, every viewpoint in order, monotonic progress, speed bounds, and browser exceptions. It writes results to `tmp/motion-review/browser-results.json`; `VILLA_URL` can target another preview.

Checks use Linux Chromium with SwiftShader; physical mobile and trackpad feel still require user review. The rebuilt preview is at `http://localhost:4321/?view=scene`.
