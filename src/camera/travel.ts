/** Metres and seconds for each continuous leg between reading stops. */
export const TRAVEL = {
  cruiseSpeed: 1.44,
  minSpeed: .72,
  maxSpeed: 2.592,
  rampSeconds: 3,
  controlSeconds: 1.8,
  lineHeightPx: 100 / 3,
  pageHeightPx: 800,
};

/** Normalize physical wheel units before measuring the gesture's pace. */
export function wheelPixels(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  const scale = event.deltaMode === 1 ? TRAVEL.lineHeightPx : event.deltaMode === 2 ? TRAVEL.pageHeightPx : 1;
  return event.deltaY * scale;
}

// Quintic velocity ramp and its exact integral. Acceleration and jerk vanish at both ends.
const ease = (z: number) => z ** 3 * (10 + z * (-15 + 6 * z));
const slope = (z: number) => 30 * z ** 2 * (1 - z) ** 2;
const curvature = (z: number) => 60 * z * (1 - z) * (1 - 2 * z);
const integral = (z: number) => z ** 4 * (2.5 + z * (-3 + z));
type Transition = { from: number; to: number; elapsed: number };

/**
 * One analytic, rest-to-rest flight: take off, cruise at constant speed, then arrive.
 * Pausing, reversing and changing pace smoothly change the flight's clock rate. The chain rule keeps
 * physical velocity, acceleration and jerk continuous, including during the endpoint ramps.
 * Commands during a control transition are queued until its derivatives are zero; replacing
 * an unfinished easing curve would introduce a jerk discontinuity or overshoot.
 */
export class Travel {
  readonly peak: number;
  readonly duration: number;
  private clock = 0;
  private rate = 0;
  private wanted = 0;
  private transition: Transition | null = null;

  constructor(readonly length: number) {
    this.peak = Math.min(TRAVEL.cruiseSpeed, length / TRAVEL.rampSeconds);
    this.duration = length > 0 ? length / this.peak + TRAVEL.rampSeconds : 0;
  }

  get position(): number { return this.profile().position; }
  get playing(): boolean { return this.wanted !== 0; }
  get idle(): boolean { return this.rate === 0 && !this.transition && this.wanted === 0; }
  get velocity(): number { return this.profile().velocity * this.rate; }
  get acceleration(): number {
    const p = this.profile(), r = this.rates();
    return p.acceleration * this.rate ** 2 + p.velocity * r.first;
  }
  get jerk(): number {
    const p = this.profile(), r = this.rates();
    return p.jerk * this.rate ** 3 + 3 * p.acceleration * this.rate * r.first + p.velocity * r.second;
  }

  start(direction = 1, speed = TRAVEL.cruiseSpeed): void {
    if (!Number.isFinite(direction) || !Number.isFinite(speed)) return;
    this.wanted = Math.sign(direction) * Math.max(TRAVEL.minSpeed, Math.min(TRAVEL.maxSpeed, speed)) / TRAVEL.cruiseSpeed;
  }
  pause(): void { this.wanted = 0; }

  /** Immediate placement only for boot/capture or after a navigation transition is at rest. */
  reset(metres: number): void {
    let lo = 0, hi = this.duration;
    if (metres <= 0) this.clock = 0;
    else if (metres >= this.length) this.clock = this.duration;
    else {
      for (let i = 0; i < 50; i++) {
        this.clock = (lo + hi) / 2;
        if (this.position < metres) lo = this.clock; else hi = this.clock;
      }
    }
    this.rest();
  }

  /** Exact integration across control-phase boundaries; independent of display refresh rate. */
  advance(dt: number): number {
    const before = this.position;
    let remaining = Math.max(0, dt);
    while (remaining > 1e-10) {
      if (!this.transition && this.wanted !== this.rate) this.transition = { from: this.rate, to: this.wanted, elapsed: 0 };
      const ramp = this.transition;
      if (!ramp && this.rate === 0) break;
      const step = ramp ? Math.min(remaining, TRAVEL.controlSeconds - ramp.elapsed) : remaining;
      if (ramp) {
        const z0 = ramp.elapsed / TRAVEL.controlSeconds;
        ramp.elapsed = Math.min(TRAVEL.controlSeconds, ramp.elapsed + step);
        const z1 = ramp.elapsed / TRAVEL.controlSeconds;
        this.clock += ramp.from * step + (ramp.to - ramp.from) * TRAVEL.controlSeconds * (integral(z1) - integral(z0));
        this.rate = ramp.from + (ramp.to - ramp.from) * ease(z1);
        if (ramp.elapsed >= TRAVEL.controlSeconds - 1e-10) {
          this.rate = ramp.to;
          this.transition = null;
        }
      } else this.clock += this.rate * step;
      remaining -= step;
      // The endpoint profile already has zero velocity, acceleration and jerk here.
      if ((this.clock <= 0 && this.rate <= 0) || (this.clock >= this.duration && this.rate >= 0)) {
        this.clock = Math.max(0, Math.min(this.duration, this.clock));
        this.rest();
        break;
      }
    }
    return this.position - before;
  }

  private rest(): void { this.rate = this.wanted = 0; this.transition = null; }

  private rates(): { first: number; second: number } {
    if (!this.transition) return { first: 0, second: 0 };
    const z = this.transition.elapsed / TRAVEL.controlSeconds, change = this.transition.to - this.transition.from;
    return { first: change * slope(z) / TRAVEL.controlSeconds, second: change * curvature(z) / TRAVEL.controlSeconds ** 2 };
  }

  private profile(): { position: number; velocity: number; acceleration: number; jerk: number } {
    const t = Math.max(0, Math.min(this.duration, this.clock)), ramp = TRAVEL.rampSeconds;
    const ending = t > this.duration - ramp;
    if (t < ramp || ending) {
      const z = (ending ? this.duration - t : t) / ramp;
      const distance = this.peak * ramp * integral(z);
      return { position: ending ? this.length - distance : distance, velocity: this.peak * ease(z),
        acceleration: (ending ? -1 : 1) * this.peak * slope(z) / ramp, jerk: this.peak * curvature(z) / ramp ** 2 };
    }
    return { position: this.peak * (t - ramp / 2), velocity: this.peak, acceleration: 0, jerk: 0 };
  }
}
