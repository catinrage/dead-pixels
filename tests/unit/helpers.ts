import { E } from '../../src/content/pixels';
import { Sim } from '../../src/sim/sim';
import type { Profile } from '../../src/sim/types';

/** A headless simulation with fixed dice, so every test sees the same world. */
export function quietSim(picture = 'sunset', profile?: Profile): Sim {
  return new Sim({ seed: 11, runSeed: 4242, record: false, picture, profile });
}

/** Empty every cell except the Dead Pixel's, as if the whole picture had been dug out. */
export function clearAll(s: Sim): void {
  const w = s.world;
  for (let i = 0; i < w.n; i++) if (w.cells[i] && !(s.dp && s.dp.i === i)) w.setCell(i, E);
}

export function stepFor(s: Sim, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) s.step(dt);
}

/** Cells of one connected cluster of type `t` around `start`, by flood fill. */
export function cluster(s: Sim, start: number, t: number): number[] {
  const w = s.world;
  const seen = new Set([start]);
  const out: number[] = [];
  const q = [start];
  while (q.length) {
    const i = q.pop() as number;
    out.push(i);
    const x = i % w.w;
    const y = (i / w.w) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
      const n = ny * w.w + nx;
      if (!seen.has(n) && w.cells[n] === t) {
        seen.add(n);
        q.push(n);
      }
    }
  }
  return out;
}
