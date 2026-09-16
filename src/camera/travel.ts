/**
 * Every constant that sets how wheel and touch input move the camera along the rail.
 *
 * Input is a push: it adds to a velocity that decays exponentially, so the camera eases into
 * motion and coasts to a stop instead of jumping by each event's delta. A push that starts from
 * rest covers `metresPerPixel` for each of its pixels in total, whichever device sent it. The
 * keyboard and the hotspots glide to a viewpoint instead, with their own easing in director.ts.
 */
export const TRAVEL = {
  /**
   * Metres along the rail per pixel of wheel or swipe. Chrome, Edge and Safari report a mouse-wheel
   * notch as 100 px, so one notch walks half a metre.
   */
  metresPerPixel: 0.005,
  /**
   * Pixels per line, for WheelEvent.deltaMode 1. Firefox reports a notch as 3 lines, which this
   * makes the same 100 px the other browsers send.
   */
  lineHeightPx: 100 / 3,
  /** Pixels per page, for WheelEvent.deltaMode 2; maxEventPx clamps it anyway. */
  pageHeightPx: 800,
  /**
   * The most a single event may contribute, in pixels: two notches. A page-mode delta, or a
   * driver that batches a fast spin into one event, cannot throw the camera down the walk.
   */
  maxEventPx: 200,
  /**
   * Seconds for the velocity to fall to 1/e. A push covers velocity × decaySeconds in all, and
   * from top speed the camera is below stopSpeed in decaySeconds × ln(maxSpeed / stopSpeed),
   * 0.88 s, so a trackpad flick coasts to rest within a second of the last event.
   */
  decaySeconds: 0.2,
  /**
   * Top speed along the rail in metres per second, a brisk walk. Input past it is dropped rather
   * than banked, so the camera never jumps and never runs on after the wheel stops.
   */
  maxSpeed: 4,
  /** Below this speed, in metres per second, the camera stops instead of creeping for seconds. */
  stopSpeed: 0.05,
};

/** WheelEvent.deltaY in pixels, whatever unit the browser reported it in. */
export function wheelPixels(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  // 1 and 2 are WheelEvent.DOM_DELTA_LINE and DOM_DELTA_PAGE, spelled out for Node.
  const scale = event.deltaMode === 1 ? TRAVEL.lineHeightPx : event.deltaMode === 2 ? TRAVEL.pageHeightPx : 1;
  return event.deltaY * scale;
}

const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));

/** The velocity model: pushes in, metres out, frame by frame. */
export class Travel {
  /** Metres per second along the rail; positive is onward. */
  velocity = 0;

  /** Adds `pixels` of wheel or swipe (positive is onward) to the velocity. */
  push(pixels: number): void {
    // A velocity v decaying with time constant τ covers v·τ before it stops, so this is the
    // velocity that covers metresPerPixel for each pixel.
    const impulse = (clamp(pixels, TRAVEL.maxEventPx) * TRAVEL.metresPerPixel) / TRAVEL.decaySeconds;
    this.velocity = clamp(this.velocity + impulse, TRAVEL.maxSpeed);
  }

  /** Metres covered over the next `dt` seconds. Exact for any frame rate, not an Euler step. */
  advance(dt: number): number {
    if (this.velocity === 0) return 0;
    const decay = Math.exp(-dt / TRAVEL.decaySeconds);
    const metres = this.velocity * TRAVEL.decaySeconds * (1 - decay);
    this.velocity *= decay;
    if (Math.abs(this.velocity) < TRAVEL.stopSpeed) this.velocity = 0;
    return metres;
  }

  stop(): void {
    this.velocity = 0;
  }
}
