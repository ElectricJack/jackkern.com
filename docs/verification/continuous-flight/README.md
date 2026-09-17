# Continuous flight and camera composition — 2026-09-16

This supersedes the gesture-driven motion in [the earlier motion pass](../smooth-motion/README.md).

The page starts still. A scroll, swipe, arrow key, or Begin click starts an uninterrupted flight. Cruise speed is 1.2 m/s through all fourteen viewpoints; only takeoff and final arrival change that speed. Room boundaries update the floating content without changing the motion. Space and the visible Pause/Resume button smoothly stop or resume the flight. Opposite-direction input reverses smoothly. Opening the project index or project details pauses for reading; choosing a project explicitly makes a smooth visit that stops there.

The motion uses one analytic route profile and quintic velocity ramps. Explicit pause/reverse controls smoothly change its clock rate, preserving velocity, acceleration and jerk even during endpoint ramps. Repeated input does not restart a ramp or add speed. Rapid contradictory commands queue until the current control transition has zero acceleration and jerk.

Both the position and look-target curves have seventh-degree C3 joins, preserving all three derivatives. Arc-length quadrature with Newton refinement avoids the small speed discontinuities of a linearly interpolated distance table. Polynomial patches evaluate from their nearer endpoint to retain derivative precision.

The camera now looks across courtyard fountains and at project sculptures, frames the opening before looking through it, and uses equal-length gaze rays to avoid abrupt turns between near and far targets. Intermediate viewing points alongside the fountains keep the subject in view longer. Courtyards are 9 × 9 m, with broader routes, aligned side exits, and dressing kept clear of complete path segments. The Matter asset list's instance counts were refreshed.

## Verification

- Type checking and all 113 tests in 30 files pass.
- Tests cover continuous derivatives through every spline join and motion phase, constant speed through every room, pause/reversal, refresh-rate independence, and arc-length table boundaries.
- Geometry checks retain doorway, solid-object, headroom, floor and stair clearance. Desktop and mobile composition checks cast occluded view rays every 25 cm, rejecting blank-wall-dominated frames and views whose centre is blocked by walls with no substantial subject visible.
- Final route: 125.11 m; maximum viewing-direction turn about 22.55°/m. These are geometric measurements, not device frame-rate claims.
- Production build and all fourteen static captures complete. Landmark views and the previously problematic in-between courtyard views were visually reviewed; references were refreshed.
- Chromium checks exercise complete forward and reverse flights from one start each, all viewpoints in order, constant interior speed, mobile swipe, pause/resume/Space, project navigation, and stationary reading. No browser exceptions or failed requests were recorded. Final sightline refinements also receive the dense geometry checks and production-browser captures above.
- Manifest validation, local links and project byte budgets pass. No production 3D models or textures were added.

Run `node docs/verification/continuous-flight/browser.mjs` against the preview at `http://localhost:4321/?view=scene`; `VILLA_URL` overrides the base URL. Results and screenshots go to `tmp/flythrough-review/`. The script takes roughly four minutes to traverse both directions and check the controls. `?view=scene&capture&u=0.25` also renders a stationary intermediate pose for composition review.

These browser checks use Chromium with SwiftShader and emulated mobile input; physical-device performance and feel remain separate from the geometric and control checks.
