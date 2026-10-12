import { BLUE, type Cur, E, GREEN, TRANS_CURS, TYPE_CUR, VALUE } from '../content/pixels';
import { clamp, lerp } from '../core/num';
import { occupiesPlayer } from './hand';
import { damageCell, gain } from './mechanics';
import type { Sim } from './sim';
import { type Critter, type Rig, SRC } from './types';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Machines eat what the diet allows, and never the Dead Pixel. */
export function edibleAt(s: Sim, i: number): boolean {
  const t = s.world.cells[i];
  if (t === E || (s.dp && s.dp.i === i)) return false;
  return s.run.diet[TYPE_CUR[t] as keyof typeof s.run.diet];
}

function edibleNeighborValue(s: Sim, i: number): number {
  const w = s.world;
  const W = w.w;
  const x = i % W;
  const y = (i / W) | 0;
  let best = -1;
  if (x > 0 && edibleAt(s, i - 1)) best = Math.max(best, VALUE[w.cells[i - 1]]);
  if (x < W - 1 && edibleAt(s, i + 1)) best = Math.max(best, VALUE[w.cells[i + 1]]);
  if (y > 0 && edibleAt(s, i - W)) best = Math.max(best, VALUE[w.cells[i - W]]);
  if (y < w.h - 1 && edibleAt(s, i + W)) best = Math.max(best, VALUE[w.cells[i + W]]);
  return best;
}

/** Breadth-first search through tunnels to the nearest (or, with Tracker Bugs, the best) spot next to food. */
function bfsFind(s: Sim, start: number, maxNodes: number): number {
  const w = s.world;
  const W = w.w;
  const cells = w.cells;
  const mark = s.bfsMark;
  const prev = s.bfsPrev;
  const q = s.bfsQ;
  const st = ++s.bfsStamp;
  let head = 0;
  let tail = 0;
  let best = -1;
  let bestS = Number.NEGATIVE_INFINITY;
  let found = 0;
  q[tail++] = start;
  mark[start] = st;
  prev[start] = -1;
  while (head < tail && head < maxNodes) {
    const i = q[head++];
    if (i !== start) {
      const v = edibleNeighborValue(s, i);
      if (v >= 0) {
        const sc = s.S.tracker ? v * 40 - head * 0.05 : -head;
        if (sc > bestS) {
          bestS = sc;
          best = i;
        }
        if (!s.S.tracker || ++found >= 14) break;
      }
    }
    const x = i % W;
    const y = (i / W) | 0;
    let n: number;
    if (x > 0 && mark[(n = i - 1)] !== st && cells[n] === E) {
      mark[n] = st;
      prev[n] = i;
      q[tail++] = n;
    }
    if (x < W - 1 && mark[(n = i + 1)] !== st && cells[n] === E) {
      mark[n] = st;
      prev[n] = i;
      q[tail++] = n;
    }
    if (y > 0 && mark[(n = i - W)] !== st && cells[n] === E) {
      mark[n] = st;
      prev[n] = i;
      q[tail++] = n;
    }
    if (y < w.h - 1 && mark[(n = i + W)] !== st && cells[n] === E) {
      mark[n] = st;
      prev[n] = i;
      q[tail++] = n;
    }
  }
  return best;
}

export function nearestEmpty(s: Sim, x: number, y: number): number {
  const w = s.world;
  x = clamp(x, 0, w.w - 1);
  y = clamp(y, 0, w.h - 1);
  if (!w.cells[y * w.w + x]) return y * w.w + x;
  for (let r = 1; r < 14; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w.w || yy >= w.h) continue;
        if (!w.cells[yy * w.w + xx]) return yy * w.w + xx;
      }
  return y * w.w + x;
}

/* ---------- bugs ---------- */

export function makeCritter(s: Sim, i: number): Critter {
  const W = s.world.w;
  const x = i % W;
  const y = (i / W) | 0;
  return {
    cx: x,
    cy: y,
    nx: x,
    ny: y,
    x: x + 0.5,
    y: y + 0.5,
    moving: false,
    prog: 0,
    bite: -1,
    biteT: 0,
    path: [],
    stun: 0,
    dx: 1,
    dy: 0,
    idle: 0,
    search: s.rand() * 0.5,
    anim: s.rand() * 10,
  };
}

export function syncCritters(s: Sim): void {
  const want = s.run.critterOwned + (s.S.queen ? Math.floor(s.run.critterOwned / 4) : 0);
  while (s.critters.length < want) s.critters.push(makeCritter(s, nearestEmpty(s, Math.floor(s.player.x), Math.floor(s.player.y))));
  while (s.critters.length > want) s.critters.pop();
}

export const critterCost = (s: Sim): { green: number; gray: number } => {
  const m = 1.55 ** s.run.critterOwned * s.S.brood;
  return { green: Math.ceil(10 * m), gray: Math.ceil(60 * m) };
};

function stepTo(s: Sim, c: Critter, n: number): void {
  const W = s.world.w;
  const nx = n % W;
  const ny = (n / W) | 0;
  c.dx = nx - c.cx;
  c.dy = ny - c.cy;
  c.nx = nx;
  c.ny = ny;
  c.moving = true;
  c.prog = 0;
}

function placeCritter(s: Sim, c: Critter, i: number): void {
  const W = s.world.w;
  s.emit({ k: 'spark', x: c.x, y: c.y, c: '#4fe07a', n: 5 });
  c.cx = c.nx = i % W;
  c.cy = c.ny = (i / W) | 0;
  c.x = c.cx + 0.5;
  c.y = c.cy + 0.5;
  c.moving = false;
  c.bite = -1;
  c.path.length = 0;
  c.idle = 0;
  s.emit({ k: 'spark', x: c.x, y: c.y, c: '#4fe07a', n: 5 });
  s.emit({ k: 'sfx', id: 'poof' });
}

function relocateCritter(s: Sim, c: Critter): boolean {
  const w = s.world;
  const px = Math.floor(s.player.x);
  const py = Math.floor(s.player.y);
  for (let k = 0; k < 140; k++) {
    const a = s.rand() * Math.PI * 2;
    const r = 3 + s.rand() * 24;
    const x = Math.floor(px + Math.cos(a) * r);
    const y = Math.floor(py + Math.sin(a) * r);
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
    const i = y * w.w + x;
    if (!w.cells[i] && edibleNeighborValue(s, i) >= 0) {
      placeCritter(s, c, i);
      return true;
    }
  }
  for (let k = 0; k < 400; k++) {
    const i = s.rng.int(w.n);
    if (!w.cells[i] && edibleNeighborValue(s, i) >= 0) {
      placeCritter(s, c, i);
      return true;
    }
  }
  return false;
}

export function updateCritter(s: Sim, c: Critter, dt: number): void {
  const w = s.world;
  const W = w.w;
  const S = s.S;
  c.anim += dt * (c.moving ? 14 : c.bite >= 0 ? 9 : 3);
  if (c.stun > 0) {
    c.stun -= dt;
    return;
  }
  if (c.moving) {
    c.prog += dt * S.critSpeed;
    if (c.prog >= 1) {
      c.cx = c.nx;
      c.cy = c.ny;
      c.moving = false;
      c.prog = 0;
    }
    c.x = lerp(c.cx, c.nx, c.prog) + 0.5;
    c.y = lerp(c.cy, c.ny, c.prog) + 0.5;
    return;
  }
  c.x = c.cx + 0.5;
  c.y = c.cy + 0.5;
  const here = c.cy * W + c.cx;
  if (w.cells[here] && c.bite < 0) {
    // green grew or blue flowed onto the bug: chew out, or hop away if it cannot eat this color
    if (edibleAt(s, here)) {
      c.bite = here;
      c.biteT = 0.5 / S.critBiteRate;
    } else if (relocateCritter(s, c)) return;
  }
  if (c.bite >= 0) {
    if (!edibleAt(s, c.bite)) c.bite = -1;
    else {
      c.biteT -= dt;
      if (c.biteT <= 0) {
        c.biteT += 1 / S.critBiteRate;
        const b = c.bite;
        if (damageCell(s, b, S.critDmg, SRC.CRITTER)) {
          c.bite = -1;
          if (!w.cells[b]) stepTo(s, c, b);
        }
      }
      return;
    }
  }
  let best = -1;
  let bestS = -1;
  for (let k = 0; k < 4; k++) {
    const d = DIRS[k];
    const x = c.cx + d[0];
    const y = c.cy + d[1];
    if (x < 0 || y < 0 || x >= W || y >= w.h) continue;
    const n = y * W + x;
    if (!edibleAt(s, n)) continue;
    const sc = s.rand() + (d[0] === c.dx && d[1] === c.dy ? 0.6 : 0) + (S.tracker ? VALUE[w.cells[n]] : 0);
    if (sc > bestS) {
      bestS = sc;
      best = n;
    }
  }
  if (best >= 0) {
    c.bite = best;
    c.biteT = 0.5 / S.critBiteRate;
    c.dx = (best % W) - c.cx;
    c.dy = ((best / W) | 0) - c.cy;
    c.idle = 0;
    c.path.length = 0;
    return;
  }
  if (c.path.length) {
    const n = c.path.pop() as number;
    if (!w.cells[n]) {
      stepTo(s, c, n);
      return;
    }
    c.path.length = 0;
  }
  c.search -= dt;
  if (c.search > 0) return;
  const goal = bfsFind(s, here, 900);
  if (goal >= 0) {
    c.path.length = 0;
    for (let p = goal; p !== here && p >= 0; p = s.bfsPrev[p]) c.path.push(p);
    c.idle = 0;
    return;
  }
  c.search = 0.5 + s.rand() * 0.5;
  c.idle += c.search;
  if (c.idle > 2.2 && relocateCritter(s, c)) c.idle = 0;
}

/* ---------- rigs ---------- */

export const rigCost = (s: Sim): { gold: number; gray: number } => {
  const m = 1.9 ** s.rigs.length;
  return { gold: Math.ceil(12 * m), gray: Math.ceil(500 * m) };
};

export function rigAt(s: Sim, x: number, y: number, minD: number): boolean {
  for (const r of s.rigs) if (Math.abs(r.x - x) < minD && Math.abs(r.y - y) < minD) return true;
  return false;
}

export const makeRig = (x: number, y: number): Rig => ({ x, y, target: -1, scan: 0, idle: 0, spin: 0 });

function rigScan(s: Sim, r: Rig): number {
  const w = s.world;
  const R = s.S.rigR;
  const R2 = R * R;
  let best = -1;
  let bs = Number.NEGATIVE_INFINITY;
  for (let dy = -R; dy <= R; dy++) {
    const y = r.y + dy;
    if (y < 0 || y >= w.h) continue;
    for (let dx = -R; dx <= R; dx++) {
      const x = r.x + dx;
      if (x < 0 || x >= w.w) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;
      const i = y * w.w + x;
      if (!edibleAt(s, i)) continue;
      const sc = -d2 + (s.S.tracker ? VALUE[w.cells[i]] * 30 : 0) + s.rand() * 0.5;
      if (sc > bs) {
        bs = sc;
        best = i;
      }
    }
  }
  return best;
}

export function rigSpot(s: Sim, radius: number, cx = s.player.x, cy = s.player.y): number {
  const w = s.world;
  const px = Math.floor(cx);
  const py = Math.floor(cy);
  for (let k = 0; k < 200; k++) {
    const a = s.rand() * Math.PI * 2;
    const r = 2 + s.rand() * radius;
    const x = Math.floor(px + Math.cos(a) * r);
    const y = Math.floor(py + Math.sin(a) * r);
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
    const i = y * w.w + x;
    if (w.cells[i] || rigAt(s, x, y, 2)) continue;
    if (edibleNeighborValue(s, i) >= 0) return i;
  }
  return -1;
}

export function updateRig(s: Sim, r: Rig, dt: number): void {
  const w = s.world;
  r.spin += dt * (r.target >= 0 ? 16 : 2);
  if (r.target >= 0 && !edibleAt(s, r.target)) r.target = -1;
  if (r.target < 0) {
    r.scan -= dt;
    if (r.scan > 0) return;
    r.scan = 0.3;
    r.target = rigScan(s, r);
    if (r.target < 0) {
      r.idle += 0.3;
      if (s.S.righop && r.idle > 2.4) {
        const i = rigSpot(s, 16);
        if (i >= 0) {
          s.emit({ k: 'spark', x: r.x + 0.5, y: r.y + 0.5, c: '#2bf0ff', n: 6 });
          r.x = i % w.w;
          r.y = (i / w.w) | 0;
          r.idle = 0;
          s.emit({ k: 'spark', x: r.x + 0.5, y: r.y + 0.5, c: '#2bf0ff', n: 6 });
          s.emit({ k: 'sfx', id: 'poof' });
        }
      }
      return;
    }
    r.idle = 0;
  }
  if (damageCell(s, r.target, s.S.rigDps * dt, SRC.RIG)) r.target = -1;
}

/** Nearest open cell without a rig, walking outward through the tunnels. */
export function freeSpot(s: Sim): number {
  const w = s.world;
  const start = nearestEmpty(s, Math.floor(s.player.x), Math.floor(s.player.y));
  if (w.cells[start]) return -1;
  const st = ++s.bfsStamp;
  const q = s.bfsQ;
  let head = 0;
  let tail = 0;
  q[tail++] = start;
  s.bfsMark[start] = st;
  while (head < tail && head < 400) {
    const i = q[head++];
    const x = i % w.w;
    const y = (i / w.w) | 0;
    if (!rigAt(s, x, y, 1)) return i;
    for (const [ox, oy] of DIRS) {
      const xx = x + ox;
      const yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= w.w || yy >= w.h) continue;
      const n = yy * w.w + xx;
      if (s.bfsMark[n] === st || w.cells[n]) continue;
      s.bfsMark[n] = st;
      q[tail++] = n;
    }
  }
  return -1;
}

export function gatherRigs(s: Sim): void {
  const w = s.world;
  const start = nearestEmpty(s, Math.floor(s.player.x), Math.floor(s.player.y));
  const st = ++s.bfsStamp;
  const q = s.bfsQ;
  let head = 0;
  let tail = 0;
  q[tail++] = start;
  s.bfsMark[start] = st;
  const spots: number[] = [];
  while (head < tail && spots.length < s.rigs.length && head < 4000) {
    const i = q[head++];
    const x = i % w.w;
    const y = (i / w.w) | 0;
    if (!spots.some(sp => Math.abs((sp % w.w) - x) < 2 && Math.abs(((sp / w.w) | 0) - y) < 2) && !occupiesPlayer(s, x, y)) spots.push(i);
    for (const [ox, oy] of DIRS) {
      const xx = x + ox;
      const yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= w.w || yy >= w.h) continue;
      const n = yy * w.w + xx;
      if (s.bfsMark[n] === st || w.cells[n]) continue;
      s.bfsMark[n] = st;
      q[tail++] = n;
    }
  }
  s.rigs.forEach((r, k) => {
    const i = spots[k % Math.max(1, spots.length)];
    if (i == null) return;
    r.x = i % w.w;
    r.y = (i / w.w) | 0;
    r.target = -1;
    r.idle = 0;
    s.emit({ k: 'spark', x: r.x + 0.5, y: r.y + 0.5, c: '#2bf0ff', n: 6 });
  });
  s.emit({ k: 'sfx', id: 'poof' });
}

/* ---------- mine layer and transmuter ---------- */

export function updateMineLayer(s: Sim, dt: number): void {
  if (!s.S.mineLayer) return;
  s.mineT -= dt;
  if (s.mineT > 0) return;
  s.mineT = s.S.mineInterval;
  const w = s.world;
  for (let k = 0; k < 60; k++) {
    const a = s.rand() * Math.PI * 2;
    const r = 4 + s.rand() * 12;
    const x = Math.floor(s.player.x + Math.cos(a) * r);
    const y = Math.floor(s.player.y + Math.sin(a) * r);
    if (x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) continue;
    const i = y * w.w + x;
    if (w.cells[i] !== E || occupiesPlayer(s, x, y)) continue;
    if (w.cells[i - 1] || w.cells[i + 1] || w.cells[i - w.w] || w.cells[i + w.w]) {
      s.bombs.push({ sx: x + 0.5, sy: y + 0.5, x: x + 0.5, y: y + 0.5, t: 1, fuse: 0.9, auto: true });
      return;
    }
  }
}

/** The transmuter draws from whichever ink you hold the most of, other than the one it makes. */
export function transSource(s: Sim): Cur {
  const inks = s.run.inks;
  let best: Cur = 'gray';
  let most = -1;
  for (const c of TRANS_CURS) {
    if (c === s.run.transTarget || inks[c] <= most) continue;
    most = inks[c];
    best = c;
  }
  return best;
}

/** Source ink spent per unit made. Gold costs four times as much. */
export function transRatio(s: Sim): number {
  return s.run.transTarget === 'gold' ? s.S.transRatio * 4 : s.S.transRatio;
}

export function updateTransmuter(s: Sim, dt: number): void {
  s.transShown = 0;
  const run = s.run;
  if (!s.S.trans || !run.transOn) return;
  const src = transSource(s);
  const ratio = transRatio(s);
  const rate = Math.max(2, run.inks[src] * s.S.transPct);
  const use = Math.min(run.inks[src], rate * dt);
  if (use <= 0) return;
  run.inks[src] -= use;
  gain(s, run.transTarget, use / ratio, true);
  s.transShown = rate / ratio;
}

/* ---------- liquid and growth, at 20 ticks a second ---------- */

export function liquidTick(s: Sim): void {
  const w = s.world;
  const W = w.w;
  const nb = w.blue.size;
  if (nb) {
    let tries = Math.ceil(Math.min(nb, 30 + nb * 0.02) * s.S.flowMult);
    while (tries-- > 0) {
      const i = w.blue.pick(s.rand());
      const d = DIRS[s.rng.int(4)];
      const x = (i % W) + d[0];
      const y = ((i / W) | 0) + d[1];
      if (x < 0 || y < 0 || x >= W || y >= w.h) continue;
      const n = y * W + x;
      if (w.cells[n] || occupiesPlayer(s, x, y)) continue;
      w.setCell(n, BLUE);
      s.cause = SRC.LIQUID;
      w.setCell(i, E);
    }
  }
  s.growAcc += w.green.size * 0.003 * s.S.growthMult * 0.05;
  let guard = 0;
  while (s.growAcc >= 1 && guard++ < 50) {
    s.growAcc -= 1;
    const i = w.green.pick(s.rand());
    const d = DIRS[s.rng.int(4)];
    const x = (i % W) + d[0];
    const y = ((i / W) | 0) + d[1];
    if (x < 0 || y < 0 || x >= W || y >= w.h) continue;
    const n = y * W + x;
    if (w.cells[n] || occupiesPlayer(s, x, y)) continue;
    w.setCell(n, GREEN);
  }
  if (s.growAcc > 50) s.growAcc = 0;
}
