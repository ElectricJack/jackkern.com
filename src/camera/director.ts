import { Vector3, type Object3D } from 'three';
import type { Rail } from './rail';
import { Travel } from './travel';

export type Mode = 'travel' | 'glide';

/**
 * A glide lands once it is this close to its viewpoint, in metres along the walk. Landing sets
 * the camera on the viewpoint exactly, so that last step has to be too small to see: at the
 * rail's sharpest turn a tenth of a millimetre swings the view 0.003°, a twentieth of a pixel.
 */
export const LAND_M = 0.0001;

/**
 * Sole owner of the camera. Wheel and touch push it along the rail through a velocity that
 * coasts to rest (travel.ts); a glide eases to a viewpoint and then hands back to travel there.
 * Either way the camera is posed from the rail at one parameter, `u`, so nothing turns it but
 * the rail itself: a glide lands on the pose it was already easing into, not a fresh lookAt.
 */
export class Director {
  mode: Mode = 'travel';
  u = 0;
  readonly travel = new Travel();
  private target = 0;
  private current = -1;
  private listeners: ((index: number, stopId: string) => void)[] = [];
  private pose = { position: new Vector3(), target: new Vector3() };

  constructor(private rail: Rail, private camera: Object3D, private speed = 6) {}

  /**
   * Wheel or swipe input, in pixels, positive onward. A glide owns the camera until it lands, so
   * input during one is dropped rather than stored: the landing is not fought by the wheel that
   * happened to be turning when the visitor clicked.
   */
  push(pixels: number): void {
    if (this.mode === 'glide') return;
    this.travel.push(pixels);
  }

  glideTo(index: number): void {
    const i = Math.min(this.rail.u.length - 1, Math.max(0, index));
    this.mode = 'glide';
    this.target = this.rail.u[i];
    this.travel.stop();
  }

  step(delta: number): void { this.glideTo(this.nearest() + delta); }

  /** Immediate placement, used at boot and by the static capture. */
  jump(index: number): void {
    this.glideTo(index);
    this.u = this.target;
    this.mode = 'travel';
    this.apply();
  }

  nearest(): number { return this.rail.nearest(this.u); }

  onViewpoint(cb: (index: number, stopId: string) => void): void { this.listeners.push(cb); }

  update(dt: number): void {
    if (this.mode === 'glide') {
      // Framerate-independent exponential ease: the per-frame fraction is derived
      // from dt so a 144 Hz monitor and a 60 Hz one take the same wall time.
      const k = 1 - Math.exp(-dt * this.speed);
      this.u += (this.target - this.u) * k;
      if (Math.abs(this.target - this.u) * this.rail.length < LAND_M) {
        this.u = this.target;
        this.mode = 'travel';
      }
    } else {
      const metres = this.travel.advance(dt);
      if (metres !== 0) {
        this.u = Math.min(1, Math.max(0, this.u + metres / this.rail.length));
        // The ends of the walk are walls, not springs: arriving at one spends the momentum.
        if (this.u === 0 || this.u === 1) this.travel.stop();
      }
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
