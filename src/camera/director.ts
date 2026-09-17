import { Vector3, type Object3D } from 'three';
import type { Rail } from './rail';
import { TRAVEL, Travel } from './travel';
import { ScrollPace } from '../input/scroll-pace';

type Navigation = { index: number } | { direction: number; speed: number };
export type Mode = 'paused' | 'flight' | 'visit';
export const TOUR_WAIT_SECONDS = 10;
export const QUICK_VISIT_SECONDS = 1.8;
type QuickVisit = { from: number; to: number; index: number; elapsed: number; duration: number; shortcut: boolean };
const ease = (t: number) => t * t * t * (10 + t * (-15 + 6 * t));

/** Sole camera owner. Each leg follows the same continuous rail and arrives at
 * rest at the next project's reading view; courtyards remain part of the flight. */
export class Director {
  u = 0;
  travel: Travel;
  readonly readingViews: number[];
  private origin = 0;
  private sign = 1;
  private direction = 1;
  private visiting = false;
  private destination: number | null = null;
  private pending: Navigation | null = null;
  private automatic = false;
  private autoAfterArrival = false;
  private wait: 'start' | 'project' | null = null;
  private waited = 0;
  private scroll = new ScrollPace();
  private current = -1;
  private listeners: ((index: number, stopId: string) => void)[] = [];
  private pose = { position: new Vector3(), target: new Vector3() };
  private quick: QuickVisit | null = null;
  transitionOpacity = 1;

  constructor(private rail: Rail, private camera: Object3D, projects: string[]) {
    this.travel = new Travel(rail.length);
    const ids = new Set(projects);
    this.readingViews = rail.viewpoints.flatMap((v, i, all) =>
      ids.has(v.stop) && !all.slice(i + 1).some(next => next.stop === v.stop) ? [i] : []);
  }

  get mode(): Mode { return this.quick ? 'visit' : this.travel.idle && !this.pending ? 'paused' : this.visiting || this.pending ? 'visit' : 'flight'; }
  get playing(): boolean { return !!this.quick || this.travel.playing || !!this.pending; }
  get quickVisiting(): boolean { return this.quick !== null; }
  get velocity(): number { return this.sign * this.travel.velocity || 0; }
  get acceleration(): number { return this.sign * this.travel.acceleration || 0; }
  get jerk(): number { return this.sign * this.travel.jerk || 0; }
  get atProject(): boolean { return this.mode === 'paused' && this.readingViews.some(i => Math.abs(this.u - this.rail.u[i]) < 1e-9); }
  get destinationStop(): string | null { return this.destination === null ? null : this.rail.viewpoints[this.rail.nearest(this.destination)].stop; }
  get autoResumeIn(): number | null { return this.wait ? Math.max(0, TOUR_WAIT_SECONDS - this.waited) : null; }

  /** Arm only after the first visible frame. Capture and reduced-motion visits stay manual. */
  setAutoplay(enabled: boolean): void {
    this.automatic = enabled;
    this.wait = enabled && this.mode === 'paused' ? this.u === 0 ? 'start' : this.atProject ? 'project' : null : null;
    this.waited = 0;
  }

  /** Only the entrance waits for inactivity; each project gets a fixed reading pause. */
  activity(): void { if (this.wait === 'start') this.waited = 0; }

  projectView(id: string): number { return this.readingViews.find(i => this.rail.viewpoints[i].stop === id) ?? -1; }

  push(pixels: number, time = performance.now()): void {
    const pace = this.scroll.push(pixels, time);
    if (pace) this.fly(pace.direction, pace.speed);
  }
  step(direction: number): void { this.fly(Math.sign(direction)); }

  fly(direction = this.u >= 1 ? -1 : this.u <= 0 ? 1 : this.direction, speed = TRAVEL.cruiseSpeed): void {
    if (!Number.isFinite(direction) || !Number.isFinite(speed) || direction === 0) return;
    this.wait = null;
    this.autoAfterArrival = true;
    direction = Math.sign(direction);
    this.direction = direction;
    // Changing pace never replaces an in-progress profile or its derivatives.
    if (!this.visiting && this.destination !== null && this.sign === direction && this.travel.position < this.travel.length - 1e-8) {
      this.pending = null;
      this.travel.start(1, speed);
    } else if (this.travel.idle) {
      this.pending = null;
      this.beginFlight(direction, speed);
    } else {
      this.pending = { direction, speed };
      this.travel.pause();
    }
  }

  pause(): void {
    if (this.quick) this.finishQuick();
    this.wait = null;
    this.autoAfterArrival = false;
    this.pending = null;
    this.travel.pause();
  }
  toggle(): void { if (this.playing) this.pause(); else this.fly(); }

  /** Adjacent quick links fly the connecting rail; distant links hide a middle cut.
   * Both ends remain actual camera motion, normally lasting 1.8 seconds. */
  visit(index: number, duration = QUICK_VISIT_SECONDS): void {
    if (!Number.isFinite(index)) return;
    index = Math.min(this.rail.u.length - 1, Math.max(0, Math.round(index)));
    const to = this.rail.u[index];
    if (duration <= 0 || Math.abs(to - this.u) < 1e-9) { this.jump(index); return; }
    this.pause();
    this.pending = null;
    this.destination = to;
    this.autoAfterArrival = false;
    this.direction = Math.sign(to - this.u);
    const nodes = [0, ...this.readingViews, this.rail.u.length - 1];
    const nearestNode = (u: number) => nodes.reduce((best, n, i) => Math.abs(this.rail.u[n] - u) < Math.abs(this.rail.u[nodes[best]] - u) ? i : best, 0);
    this.quick = { from: this.u, to, index, elapsed: 0, duration, shortcut: Math.abs(nearestNode(to) - nearestNode(this.u)) > 1 };
    this.transitionOpacity = 1;
  }

  private finishQuick(): void {
    this.quick = null;
    this.transitionOpacity = 1;
    this.origin = 0; this.sign = 1;
    this.travel = new Travel(this.rail.length);
    this.travel.reset(this.u * this.rail.length);
    this.visiting = false;
    this.destination = null;
  }

  /** Explicit selection follows the rail straight to that chosen project. */
  glideTo(index: number): void {
    if (!Number.isFinite(index)) return;
    this.wait = null;
    this.autoAfterArrival = true;
    this.pending = { index: Math.min(this.rail.u.length - 1, Math.max(0, Math.round(index))) };
    this.travel.pause();
  }

  /** Immediate placement, used at boot and by static capture. */
  jump(index: number): void {
    this.quick = null;
    this.transitionOpacity = 1;
    this.wait = null;
    this.autoAfterArrival = false;
    this.pending = null;
    this.visiting = false;
    this.destination = null;
    this.scroll = new ScrollPace();
    this.origin = 0; this.sign = 1;
    this.travel = new Travel(this.rail.length);
    this.travel.reset(this.rail.u[Math.min(this.rail.u.length - 1, Math.max(0, index))] * this.rail.length);
    this.u = this.travel.position / this.rail.length;
    this.apply();
  }

  nearest(): number { return this.rail.nearest(this.u); }
  onViewpoint(cb: (index: number, stopId: string) => void): void { this.listeners.push(cb); }

  update(dt: number, elapsed = dt): void {
    if (this.quick) {
      const q = this.quick;
      // Count presented motion, not GPU/asset stalls. A slow frame must never
      // swallow the departure, the fully covered cut, or the visible approach.
      q.elapsed += Math.min(.05, Math.max(0, elapsed));
      const t = Math.min(1, (q.elapsed + 1e-9) / q.duration);
      if (q.shortcut) {
        const approach = Math.sign(q.to - q.from) * Math.min(5 / this.rail.length, Math.abs(q.to - q.from) * .2);
        // Accelerate into the white, cut along the rail, then decelerate out of
        // it. Unlike two stop/start tweens, motion continues throughout the fade.
        this.u = t < .5 ? q.from + approach * (t * 2) ** 2 : q.to - approach * (2 - t * 2) ** 2;
        this.transitionOpacity = t < .2 ? 1 : t < .46 ? 1 - ease((t - .2) / .26)
          : t <= .54 ? 0 : t < .8 ? ease((t - .54) / .26) : 1;
      } else this.u = q.from + (q.to - q.from) * ease(t);
      if (t >= 1) this.jump(q.index);
      else this.apply();
      return;
    }
    const waiting = this.wait !== null;
    const moving = !this.travel.idle;
    this.travel.advance(dt);
    this.u = Math.max(0, Math.min(1, (this.origin + this.sign * this.travel.position) / this.rail.length));
    if (this.pending && this.travel.idle) {
      const action = this.pending;
      this.pending = null;
      if ('index' in action) this.beginLeg(this.rail.u[action.index], TRAVEL.cruiseSpeed, true);
      else this.beginFlight(action.direction, action.speed);
    } else if (moving && this.travel.idle && this.travel.position === this.travel.length) {
      this.visiting = false;
      this.scroll.hold();
      this.waitAtProject();
    }
    // Begin counting on the frame after arrival. Real elapsed time keeps a ten-second
    // pause accurate even when rendering is slower than the motion integration limit.
    if (waiting && this.wait) {
      this.waited += Math.max(0, elapsed);
      if (this.waited >= TOUR_WAIT_SECONDS - 1e-9) this.fly();
    }
    this.apply();
  }

  private beginFlight(direction: number, speed: number): void {
    const stops = [0, ...this.readingViews.map(i => this.rail.u[i]), 1];
    const next = direction > 0 ? stops.find(u => u > this.u + 1e-9) : stops.slice().reverse().find(u => u < this.u - 1e-9);
    if (next !== undefined) this.beginLeg(next, speed, false);
  }

  private beginLeg(target: number, speed: number, visiting: boolean): void {
    const metres = this.u * this.rail.length;
    this.origin = metres; this.sign = Math.sign(target - this.u) || 1;
    this.destination = target;
    this.direction = this.sign;
    this.visiting = visiting;
    this.travel = new Travel(Math.abs(target * this.rail.length - metres));
    if (this.travel.length > 1e-8) this.travel.start(1, speed);
    else this.waitAtProject();
  }

  private waitAtProject(): void {
    if (this.automatic && this.autoAfterArrival && this.atProject) {
      this.wait = 'project';
      this.waited = 0;
    }
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
