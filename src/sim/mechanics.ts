import {
  BASE_YIELD,
  BLUE,
  type Cur,
  E,
  GLITCH,
  GOLD,
  GRAY_OF_RING,
  GREEN,
  ICE,
  isGray,
  RED,
  redAt,
  STATIC,
  TYPE_CUR,
  yieldAt,
} from '../content/pixels';
import { fmt } from '../core/num';
import type { Sim } from './sim';
import { type Blast, isAuto, SRC } from './types';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function gain(s: Sim, cur: Cur, amt: number, auto: boolean): void {
  if (!(amt > 0)) return;
  s.run.inks[cur] += amt;
  s.run.totals[cur] += amt;
  s.profile.lifetime[cur] += amt;
  s.rateAcc[cur] += amt;
  if (auto) s.autoAcc[cur] += amt;
}

export function yieldMult(s: Sim, t: number): number {
  const S = s.S;
  let m = S.inkMult * (1 + S.symb * s.critters.length);
  if (t >= RED && t <= GOLD) m *= S.coloredMult;
  if (t === GOLD) m *= S.appraise;
  if (t === BLUE || t === ICE) m *= S.blueMult;
  if (t === GREEN) m *= S.greenMult;
  return m;
}

/** Laser beams and rigs deal damage every tick rather than in hits. */
const continuous = (src: number): boolean => src === SRC.LASER || src === SRC.RIG;

/** Returns true when the cell broke. Static survives anything less than one killing hit by jumping away. */
export function damageCell(s: Sim, i: number, amt: number, src: number, crit = false): boolean {
  const w = s.world;
  const t = w.cells[i];
  if (!t) return false;
  if (s.dp && s.dp.i === i) return false;
  if (t === STATIC) {
    if (amt >= w.hp[i]) {
      breakCell(s, i, src, crit);
      return true;
    }
    if (!continuous(src)) teleportStatic(s, i);
    else if (s.staticCd <= 0) {
      teleportStatic(s, i);
      s.staticCd = 0.12;
    }
    return false;
  }
  w.hp[i] -= amt;
  if (w.hp[i] <= 0) {
    breakCell(s, i, src, crit);
    return true;
  }
  w.dmg.add(i);
  return false;
}

export function breakCell(s: Sim, i: number, src: number, crit = false, fromShatter = false): void {
  const w = s.world;
  const t = w.cells[i];
  if (!t) return;
  if (s.dp && s.dp.i === i) return;
  const S = s.S;
  const r = w.ring[i];
  const yd = yieldAt(w.depth[i]);
  const x = i % w.w;
  const y = (i / w.w) | 0;
  s.cause = src;
  w.setCell(i, E);
  s.run.deleted++;
  s.profile.stats.deleted++;
  const auto = isAuto(src);
  let amt: number;
  if (t === GLITCH) amt = (1 + (r >> 1) + S.shardBonus) * S.appraise;
  else if (t === STATIC) amt = 0.05 * yd * S.appraise;
  else amt = BASE_YIELD[t] * yd * yieldMult(s, t);
  if (src === SRC.BLAST) amt *= S.blastYield;
  if (!crit && src === SRC.LASER && S.crit > 0 && s.rand() < S.crit) crit = true;
  if (crit) amt *= 5;
  if (S.lucky > 0 && s.rand() < S.lucky) amt *= 2;
  const hand = src === SRC.PICK || src === SRC.BRUSH || (src === SRC.LASER && !S.detonator);
  const safeRed = t === RED && (src === SRC.SELECT || (S.surgical && hand));
  if (safeRed && src !== SRC.SELECT) amt *= 2;
  const cur = TYPE_CUR[t] as Cur;
  gain(s, cur, amt, auto);
  if (S.midas && s.rand() < 0.02) {
    const g = yd * 3 * S.inkMult * S.appraise;
    gain(s, 'gold', g, auto);
    s.emit({ k: 'text', x: x + 0.5, y, txt: '+' + fmt(g) + ' gold', c: '#ffcc33' });
  }
  if (S.mutagen && src === SRC.CRITTER && s.rand() < 0.05) gain(s, s.rng.pick(['red', 'blue', 'green'] as const), yd * 3 * S.inkMult, true);
  s.emit({ k: 'break', i, t, src, cur, crit });
  if (src === SRC.SELECT) return;
  if (t === RED && !safeRed) {
    // A red set off by a blast spends that chain's budget; once it runs out, reds just pop.
    let chain = -1;
    if (src !== SRC.BLAST) chain = newChain(s);
    else if ((s.chainLeft.get(s.blastChain) ?? 0) > 0) {
      chain = s.blastChain;
      s.chainLeft.set(chain, (s.chainLeft.get(chain) as number) - 1);
    }
    if (chain >= 0) {
      const dmg = S.redDmg * redAt(w.depth[i]) * Math.sqrt(w.hpMult);
      queueBlast(s, x + 0.5, y + 0.5, S.redR, dmg, src === SRC.BLAST ? 0.05 + s.rand() * 0.1 : 0.3, 'red', chain);
    }
    s.profile.flags.redBlast = true;
  } else if (t === GLITCH) scramble(s, x, y);
  else if (t === ICE && !fromShatter) shatter(s, i, src);
  if (S.echo > 0 && (src === SRC.PICK || src === SRC.BRUSH) && s.rand() < S.echo) {
    const d = DIRS[s.rng.int(4)];
    const nx = x + d[0];
    const ny = y + d[1];
    if (nx >= 0 && ny >= 0 && nx < w.w && ny < w.h) {
      const n = ny * w.w + nx;
      const nt = w.cells[n];
      if (nt && nt !== GLITCH && nt !== STATIC && !(s.dp && s.dp.i === n)) {
        breakCell(s, n, SRC.OTHER);
        s.emit({ k: 'spark', x: nx + 0.5, y: ny + 0.5, c: '#efe9ff', n: 4 });
      }
    }
  }
}

/** Static hit without being deleted swaps places with a solid pixel a few cells away and heals. */
export function teleportStatic(s: Sim, i: number): void {
  const w = s.world;
  const x = i % w.w;
  const y = (i / w.w) | 0;
  for (let k = 0; k < 14; k++) {
    const dx = s.rng.int(15) - 7;
    const dy = s.rng.int(15) - 7;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 3) continue;
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
    const j = ny * w.w + nx;
    const t = w.cells[j];
    if (!t || t === STATIC || t === GLITCH || (s.dp && s.dp.i === j)) continue;
    w.setCell(j, STATIC);
    w.setCell(i, t);
    s.emit({ k: 'zap', x0: x + 0.5, y0: y + 0.5, x1: nx + 0.5, y1: ny + 0.5, c: '#e8ecff' });
    s.emit({ k: 'sfx', id: 'static' });
    return;
  }
  w.hp[i] = w.maxHp(STATIC, i);
}

/** Breaking one ice pixel cracks its whole connected cluster, a ring at a time. */
export function shatter(s: Sim, start: number, src: number): void {
  const w = s.world;
  const W = w.w;
  s.bfsStamp++;
  const mark = s.bfsMark;
  const q = s.bfsQ;
  const depth = s.bfsPrev;
  let head = 0;
  let tail = 0;
  q[tail++] = start;
  mark[start] = s.bfsStamp;
  depth[start] = 0;
  let found = 0;
  while (head < tail && found < 700) {
    const i = q[head++];
    const x = i % W;
    const y = (i / W) | 0;
    for (const [ox, oy] of DIRS) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= w.h) continue;
      const n = ny * W + nx;
      if (mark[n] === s.bfsStamp || w.cells[n] !== ICE || (s.dp && s.dp.i === n)) continue;
      mark[n] = s.bfsStamp;
      depth[n] = depth[i] + 1;
      q[tail++] = n;
      s.shatterQ.push({ i: n, t: 0.03 * depth[n], src });
      found++;
    }
  }
  if (found) {
    s.emit({ k: 'fx', kind: 'shatter', x: (start % W) + 0.5, y: ((start / W) | 0) + 0.5, R: Math.min(8, 1 + Math.sqrt(found)) });
    s.emit({ k: 'sfx', id: 'shatter' });
  }
}

export function updateShatter(s: Sim, dt: number): void {
  if (!s.shatterQ.length) return;
  const keep: typeof s.shatterQ = [];
  for (const q of s.shatterQ) {
    q.t -= dt;
    if (q.t > 0) keep.push(q);
    else if (s.world.cells[q.i] === ICE) breakCell(s, q.i, q.src, false, true);
  }
  s.shatterQ = keep;
}

export function randomColored(s: Sim, allowGray: boolean, r: number): number {
  const p = s.S.purity;
  const wR = 30;
  const wB = 22;
  const wG = 22;
  const wAu = 6 + 4 * p;
  const wX = 1 + 0.8 * p;
  const wGr = allowGray ? 20 : 0;
  let k = s.rand() * (wR + wB + wG + wAu + wX + wGr);
  if ((k -= wR) < 0) return RED;
  if ((k -= wB) < 0) return BLUE;
  if ((k -= wG) < 0) return GREEN;
  if ((k -= wAu) < 0) return GOLD;
  if ((k -= wX) < 0) return GLITCH;
  return GRAY_OF_RING[r];
}

export function scramble(s: Sim, x: number, y: number): void {
  const w = s.world;
  const R = s.S.scrambleR;
  const R2 = R * R;
  const ri = Math.ceil(R);
  for (let dy = -ri; dy <= ri; dy++)
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy > R2) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w.w || yy >= w.h) continue;
      const n = yy * w.w + xx;
      const t = w.cells[n];
      if (!t || t === GLITCH || (s.dp && s.dp.i === n) || s.rand() > 0.4) continue;
      w.setCell(n, randomColored(s, true, w.ring[n]));
    }
  s.emit({ k: 'fx', kind: 'glitch', x: x + 0.5, y: y + 0.5, R: R + 0.5 });
}

/** Start a chain reaction with a fresh budget of reds it may set off. */
export function newChain(s: Sim): number {
  const id = ++s.chainSeq;
  s.chainLeft.set(id, s.S.chainMax);
  return id;
}

export function queueBlast(s: Sim, x: number, y: number, R: number, dmg: number, delay: number, kind: Blast['kind'], chain: number): void {
  s.blasts.push({ x, y, R, dmg, t: delay, kind, chain });
}

export function explode(s: Sim, e: { x: number; y: number; R: number; dmg: number; chain: number }): void {
  const w = s.world;
  const S = s.S;
  let R = e.R;
  let dmg = e.dmg;
  s.blastChain = e.chain;
  s.explosionCount++;
  s.run.explosions++;
  s.profile.stats.explosions++;
  let nova = false;
  if (S.nova && s.explosionCount % 20 === 0) {
    R *= 2.5;
    dmg *= 2;
    nova = true;
  }
  const R2 = R * R;
  const x0 = Math.floor(e.x - R);
  const x1 = Math.floor(e.x + R);
  const y0 = Math.floor(e.y - R);
  const y1 = Math.floor(e.y + R);
  let melted = 0;
  for (let y = y0; y <= y1; y++) {
    if (y < 0 || y >= w.h) continue;
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= w.w) continue;
      const dx = x + 0.5 - e.x;
      const dy = y + 0.5 - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;
      const i = y * w.w + x;
      const t = w.cells[i];
      if (!t || (s.dp && s.dp.i === i)) continue;
      if (t === ICE) {
        w.setCell(i, BLUE);
        melted++;
        continue;
      }
      const broke = damageCell(s, i, dmg * (1 - (0.5 * Math.sqrt(d2)) / R), SRC.BLAST);
      if (!broke && S.alchblast && isGray(w.cells[i]) && s.rand() < 0.15) w.setCell(i, randomColored(s, false, w.ring[i]));
    }
  }
  if (melted) s.emit({ k: 'fx', kind: 'melt', x: e.x, y: e.y, R });
  if (S.sympa) {
    const Ro = R + 2;
    const Ro2 = Ro * Ro;
    const ri = Math.ceil(Ro);
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) {
        const x = Math.floor(e.x) + dx;
        const y = Math.floor(e.y) + dy;
        if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
        const ddx = x + 0.5 - e.x;
        const ddy = y + 0.5 - e.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 <= R2 || d2 > Ro2) continue;
        const i = y * w.w + x;
        if (w.cells[i] === RED && s.rand() < 0.5) breakCell(s, i, SRC.BLAST);
      }
  }
  for (const c of s.critters) {
    const dx = c.x - e.x;
    const dy = c.y - e.y;
    if (dx * dx + dy * dy < (R + 0.5) * (R + 0.5)) c.stun = Math.max(c.stun, 1.6);
  }
  s.emit({ k: 'boom', x: e.x, y: e.y, R, nova });
}

export function updateBlasts(s: Sim, dt: number): void {
  if (!s.blasts.length) {
    if (s.chainLeft.size) s.chainLeft.clear();
    return;
  }
  let fired = 0;
  for (let k = 0; k < s.blasts.length; k++) {
    const b = s.blasts[k];
    b.t -= dt;
    if (b.t <= 0 && fired < 8) {
      s.blasts.splice(k, 1);
      k--;
      fired++;
      explode(s, b);
    }
  }
}
