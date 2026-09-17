# Project reading pauses and scroll pace — 2026-09-16

The default cruise speed is **1.44 m/s**, up 20% from 1.2 m/s. Normal travel now arrives at rest at the focal viewing position of each project. Courtyards remain part of the continuous route. Each reading stop waits indefinitely for a fresh scroll, a swipe, Continue, or a keyboard command. Selecting a project in the index uses the same reading position.

The touchpad gesture that scrolls a normal page upward moves forward through the villa; the opposite gesture moves backward. A downward touch swipe also moves forward. Arrow-key directions stay unchanged.

Wheel and swipe gestures set a sustained speed for the current leg. Gentle gestures choose a slower pace; quicker gestures choose a faster pace, bounded to 0.72–2.592 m/s. A 160 ms input window measures gesture strength. Its peak is retained so a trackpad's momentum tail does not inadvertently slow the camera. After a 240 ms input gap, a new gentler gesture can lower the selected speed. Arrival discards the old pace; Continue uses the new default. Residual wheel events cannot skip the reading pause.

Speed changes reuse the analytic travel clock. Position, velocity, acceleration and jerk stay continuous during pace changes, manual pauses, reversals and arrivals. A reversal first comes to rest before starting toward the preceding reading stop. Explicit project selection follows the same rail to the selected project. Very short remaining distances reduce peak speed automatically. Camera position/look-target curves are unchanged.

## Verification

- 133 tests across 35 files pass, including forward and reverse project stops, stationary reading pauses, input momentum handling, changes in speed, frame-rate independence, and readable cards with Continue controls.
- TypeScript checking passes.
- [Browser checks](browser-report.json) exercise real wheel/touch events and buttons on the LAN production website. These input checks use greybox geometry and half-resolution SwiftShader rendering; the full Matter scene was reviewed separately in all 14 static captures.

```sh
npm run typecheck
npm test
npm run build
node tools/verify-project-motion.mjs http://127.0.0.1:4321 docs/verification/project-pauses
```

## LAN preview

The current build is available at **http://192.168.1.69:8000/** from the LAN, and at http://localhost:4321/ on this machine. Both serve the same `dist` directory.

The LAN preview listens on `0.0.0.0:8000` in WSL. This machine already has a Windows TCP forwarding rule from port 8000 to WSL, plus an enabled inbound firewall allowance. Port 8000 was unused when this preview was started; existing forwarding/firewall settings were reused without modification. HTTP 200 with the site's HTML was verified through the Windows LAN address from both Windows and WSL.

To restart the preview after rebuilding:

```sh
npm run preview:lan
```

The host LAN address and WSL forwarding destination are machine-specific and can change when the network or WSL restarts. No router forwarding is required for computers on the same LAN.
