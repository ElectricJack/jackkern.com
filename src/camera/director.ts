import { Vector3, type Object3D } from 'three';
import type { Rail } from './rail';

export type Mode = 'scroll' | 'glide';

/**
 * Sole owner of the camera. Scroll maps a 0..1 fraction onto the rail; a glide
 * animates to a viewpoint and then hands control back to scroll at that point.
 */
export class Director {
  mode: Mode = 'scroll';
  u = 0;
  private target = 0;
  private scroll = 0;
  private current = -1;
  private listeners: ((index: number, stopId: string) => void)[] = [];
  private pose = { position: new Vector3(), target: new Vector3() };

  constructor(private rail: Rail, private camera: Object3D, private speed = 6) {}

  setScroll(fraction: number): void {
    this.scroll = Math.min(1, Math.max(0, fraction));
    // A glide owns the camera until it lands, so scroll only writes the target
    // in scroll mode. The wheel still moves `scroll`, but the landing discards
    // it, which is what keeps a click from fighting the page it scrolled past.
    if (this.mode === 'scroll') this.target = this.scroll;
  }

  scrollBy(delta: number): void { this.setScroll(this.scroll + delta); }

  glideTo(index: number): void {
    const i = Math.min(this.rail.u.length - 1, Math.max(0, index));
    this.mode = 'glide';
    this.target = this.rail.u[i];
  }

  step(delta: number): void { this.glideTo(this.nearest() + delta); }

  /** Immediate placement, used at boot and by the static capture. */
  jump(index: number): void {
    this.glideTo(index);
    this.u = this.target;
    this.scroll = this.target;
    this.mode = 'scroll';
    this.apply();
  }

  nearest(): number { return this.rail.nearest(this.u); }

  onViewpoint(cb: (index: number, stopId: string) => void): void { this.listeners.push(cb); }

  update(dt: number): void {
    // Framerate-independent exponential ease: the per-frame fraction is derived
    // from dt so a 144 Hz monitor and a 60 Hz one take the same wall time.
    const k = 1 - Math.exp(-dt * this.speed);
    this.u += (this.target - this.u) * k;
    if (Math.abs(this.target - this.u) < 1e-4) {
      this.u = this.target;
      if (this.mode === 'glide') { this.mode = 'scroll'; this.scroll = this.u; }
    }
    this.apply();
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
