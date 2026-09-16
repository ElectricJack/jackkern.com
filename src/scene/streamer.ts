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
  constructor(
    private stops: Map<string, StopHandle>,
    private order: string[],
    private ahead = 2,
    private behind = 3,
  ) {}

  async update(currentStop: string): Promise<void> {
    const current = this.order.indexOf(currentStop);
    if (current < 0) return;

    const keep = streamWindow(this.order, current, this.ahead, this.behind);

    for (const [id, handle] of this.stops) {
      if (!keep.has(id) && handle.loaded) handle.unload();
    }

    const nearestFirst = [...keep].sort(
      (a, b) => Math.abs(this.order.indexOf(a) - current) - Math.abs(this.order.indexOf(b) - current),
    );
    for (const id of nearestFirst) await this.stops.get(id)!.load();
  }
}
