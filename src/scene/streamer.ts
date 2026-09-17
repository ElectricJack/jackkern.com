import type { StopHandle } from './builder';

/** Returns the stops that should stay resident around the current stop. */
export function streamWindow(order: string[], current: number, ahead = 2, behind = 3): Set<string> {
  const keep = new Set<string>();

  for (let index = Math.max(0, current - behind); index <= Math.min(order.length - 1, current + ahead); index++) {
    keep.add(order[index]!);
  }

  return keep;
}

/** Keeps memory flat: only the stops near the camera are resident, nearest loaded first. */
export class Streamer {
  private revision = 0;
  private keep = new Set<string>();
  constructor(
    private stops: Map<string, StopHandle>,
    private order: string[],
    private ahead = 2,
    private behind = 3,
  ) {}

  async update(currentStop: string, ahead = this.ahead, behind = this.behind): Promise<void> {
    const current = this.order.indexOf(currentStop);
    if (current < 0) return;
    await this.loadWindow(streamWindow(this.order, current, ahead, behind), current);
  }

  /** Retain both ends while the camera leaves one room and approaches the other. */
  async prepare(from: string, to: string): Promise<void> {
    const start = this.order.indexOf(from), end = this.order.indexOf(to);
    if (start < 0 || end < 0) return;
    const keep = new Set([...streamWindow(this.order, start, 1, 1), ...streamWindow(this.order, end, 1, 1)]);
    await this.loadWindow(keep, end);
  }

  private async loadWindow(keep: Set<string>, current: number): Promise<void> {
    const revision = ++this.revision;
    this.keep = keep;

    for (const [id, handle] of this.stops) {
      if (!keep.has(id)) handle.unload();
    }

    const nearestFirst = [...keep].sort(
      (a, b) => Math.abs(this.order.indexOf(a) - current) - Math.abs(this.order.indexOf(b) - current),
    );
    for (const id of nearestFirst) {
      if (revision !== this.revision) return;
      await this.stops.get(id)!.load();
      if (!this.keep.has(id)) this.stops.get(id)!.unload();
    }
  }
}
