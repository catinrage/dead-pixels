import { E } from '../content/pixels';
import type { Sim } from './sim';
import { isHand, SRC } from './types';

/**
 * The Dead Pixel hunt. One pixel per picture cannot be damaged. Opening the rock next to it by hand
 * leaves it exposed for a few seconds; machines and blasts make it flee deeper. Only your own hand deletes it.
 */

const xy = (s: Sim, i: number): [number, number] => [(i % s.world.w) + 0.5, ((i / s.world.w) | 0) + 0.5];

/** Hooked to `World.onEmpty`: a neighbor of the Dead Pixel just opened up. */
export function onCellEmptied(s: Sim, i: number): void {
  const dp = s.dp;
  if (!dp || !s.world.isNeighbor(i, dp.i)) return;
  const cause = s.cause;
  if (cause === SRC.LIQUID || cause === SRC.SELECT) return;
  if (isHand(cause) || cause === SRC.OTHER) {
    if (dp.state === 'hidden') {
      dp.state = 'exposed';
      dp.t = s.S.freezeT;
      const [x, y] = xy(s, dp.i);
      s.emit({ k: 'dp', what: 'exposed', x, y, x0: x, y0: y });
      s.emit({ k: 'note', id: 'dpExposed' });
    }
  } else flee(s, 'fled');
}

export function updateDeadPixel(s: Sim, dt: number): void {
  const dp = s.dp;
  if (dp?.state !== 'exposed' || dp.t === Number.POSITIVE_INFINITY) return;
  dp.t -= dt;
  if (dp.t <= 0) flee(s, 'dove');
}

function flee(s: Sim, what: 'fled' | 'dove'): void {
  const dp = s.dp;
  if (!dp) return;
  const from = dp.i;
  const to = what === 'dove' ? hideSpot(s, from, 5, 14) : hideSpot(s, from, 12, 30);
  if (to < 0) {
    if (dp.state !== 'exposed' || dp.t !== Number.POSITIVE_INFINITY) {
      dp.state = 'exposed';
      dp.t = Number.POSITIVE_INFINITY;
      s.emit({ k: 'note', id: 'dpCornered' });
    }
    return;
  }
  dp.i = to;
  dp.state = 'hidden';
  dp.t = 0;
  s.world.dirty.add(from);
  s.world.dirty.add(to);
  const [x0, y0] = xy(s, from);
  const [x, y] = xy(s, to);
  s.emit({ k: 'dp', what, x, y, x0, y0 });
  s.emit({ k: 'note', id: what === 'fled' ? 'dpFled' : 'dpDove' });
}

/** A buried cell some distance away, else any buried cell, else -1 (nowhere left to hide). */
export function hideSpot(s: Sim, from: number, dmin: number, dmax: number): number {
  const w = s.world;
  const x0 = from % w.w;
  const y0 = (from / w.w) | 0;
  for (let k = 0; k < 400; k++) {
    const a = s.rand() * Math.PI * 2;
    const d = dmin + s.rand() * (dmax - dmin);
    const x = Math.floor(x0 + Math.cos(a) * d);
    const y = Math.floor(y0 + Math.sin(a) * d);
    if (x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) continue;
    const i = y * w.w + x;
    if (i !== from && w.isBuried(i)) return i;
  }
  for (let k = 0; k < 3000; k++) {
    const i = s.rng.int(w.n);
    if (i !== from && w.isBuried(i)) return i;
  }
  for (let i = 0; i < w.n; i++) if (i !== from && w.isBuried(i)) return i;
  return -1;
}

export function catchDeadPixel(s: Sim): void {
  const dp = s.dp;
  if (!dp) return;
  const i = dp.i;
  s.dp = null;
  const pid = s.pic.id;
  s.progress(pid).caught = true;
  s.profile.stats.caught++;
  const bits = Math.round(25 * s.pic.bitMult * s.S.bitGain * s.S.bounty);
  s.addBits(bits);
  if (!s.profile.fragments.includes(pid)) s.profile.fragments.push(pid);
  s.cause = SRC.PICK;
  if (s.world.cells[i] !== E) {
    s.world.setCell(i, E);
    s.run.deleted++;
    s.profile.stats.deleted++;
  }
  const [x, y] = xy(s, i);
  s.emit({ k: 'dp', what: 'caught', x, y, x0: x, y0: y, bits });
}
