import { TRAVEL } from '../camera/travel';

/** Measure a short gesture window, retaining its strongest pace so a trackpad's
 * decaying momentum doesn't brake the camera after the user's hand has stopped. */
export class ScrollPace {
  private samples: { time: number; pixels: number }[] = [];
  private last = -Infinity;
  private direction = 0;
  private peak = 0;
  private held = false;

  push(pixels: number, time: number): { direction: number; speed: number } | null {
    if (!Number.isFinite(pixels) || !Number.isFinite(time) || pixels === 0) return null;
    const direction = Math.sign(pixels);
    const fresh = time - this.last > 240 || time < this.last || direction !== this.direction;
    this.last = time;
    this.direction = direction;
    if (this.held && !fresh) return null;
    if (fresh) { this.samples = []; this.peak = 0; this.held = false; }
    if (Math.abs(pixels) < .5) return null;
    this.samples = this.samples.filter(s => time - s.time < 160);
    this.samples.push({ time, pixels: Math.abs(pixels) });
    this.peak = Math.max(this.peak, this.samples.reduce((sum, s) => sum + s.pixels, 0) / .16);
    return { direction, speed: Math.max(TRAVEL.minSpeed, Math.min(TRAVEL.maxSpeed, TRAVEL.cruiseSpeed * this.peak / 625)) };
  }

  /** A continuing gesture must settle before it can dismiss a reading stop. */
  hold(): void { this.held = true; this.samples = []; this.peak = 0; }
}
