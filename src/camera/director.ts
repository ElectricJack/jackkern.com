import { Vector3, type Object3D } from 'three';
import type { Rail } from './rail';
import { TRAVEL, Travel } from './travel';
import { ScrollPace } from '../input/scroll-pace';

type Navigation = { index: number } | { direction: number; speed: number };
export type Mode = 'paused' | 'flight' | 'visit';

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
  private scroll = new ScrollPace();
  private current = -1;
  private listeners: ((index: number, stopId: string) => void)[] = [];
  private pose = { position: new Vector3(), target: new Vector3() };

  constructor(private rail: Rail, private camera: Object3D, projects: string[]) {
    this.travel = new Travel(rail.length);
    const ids = new Set(projects);
    this.readingViews = rail.viewpoints.flatMap((v, i, all) =>
      ids.has(v.stop) && !all.slice(i + 1).some(next => next.stop === v.stop) ? [i] : []);
  }

  get mode(): Mode { return this.travel.idle && !this.pending ? 'paused' : this.visiting || this.pending ? 'visit' : 'flight'; }
  get playing(): boolean { return this.travel.playing || !!this.pending; }
  get velocity(): number { return this.sign * this.travel.velocity; }
  get acceleration(): number { return this.sign * this.travel.acceleration; }
  get jerk(): number { return this.sign * this.travel.jerk; }
  get atProject(): boolean { return this.mode === 'paused' && this.readingViews.some(i => Math.abs(this.u - this.rail.u[i]) < 1e-9); }

  projectView(id: string): number { return this.readingViews.find(i => this.rail.viewpoints[i].stop === id) ?? -1; }

  push(pixels: number, time = performance.now()): void {
    const pace = this.scroll.push(pixels, time);
    if (pace) this.fly(pace.direction, pace.speed);
  }
  step(direction: number): void { this.fly(Math.sign(direction)); }

  fly(direction = this.u >= 1 ? -1 : this.u <= 0 ? 1 : this.direction, speed = TRAVEL.cruiseSpeed): void {
    if (!Number.isFinite(direction) || !Number.isFinite(speed) || direction === 0) return;
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

  pause(): void { this.pending = null; this.travel.pause(); }
  toggle(): void { if (this.playing) this.pause(); else this.fly(); }

  /** Explicit selection follows the rail straight to that chosen project. */
  glideTo(index: number): void {
    if (!Number.isFinite(index)) return;
    this.pending = { index: Math.min(this.rail.u.length - 1, Math.max(0, Math.round(index))) };
    this.travel.pause();
  }

  /** Immediate placement, used at boot and by static capture. */
  jump(index: number): void {
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

  update(dt: number): void {
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
