import { BASE_YIELD, BLUE, E, isGray, STATIC, TYPE_CUR, yieldAt } from '../content/pixels';
import { BOMB, BRUSH, ERASER, LASER, PRISM, SMUDGE } from '../content/tools';
import { catchDeadPixel } from './hunt';
import { breakCell, damageCell, explode, gain, newChain, randomColored, yieldMult } from './mechanics';
import type { Sim } from './sim';
import { SRC } from './types';
import type { World } from './world';

/** Eraser and Brush hit this many times a second. */
export const STRIKES = 8;
/** Player half-size in cells. */
export const PR = 0.36;

/** Grid ray traversal (Amanatides and Woo). The callback returns true to stop. */
export function traverse(
  w: World,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  maxT: number,
  cb: (i: number, cx: number, cy: number, t: number) => boolean,
): { t: number; hit: boolean; out?: boolean; cx?: number; cy?: number } {
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Number.POSITIVE_INFINITY;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Number.POSITIVE_INFINITY;
  let tmx = dx > 0 ? (cx + 1 - x0) / dx : dx < 0 ? (x0 - cx) / -dx : Number.POSITIVE_INFINITY;
  let tmy = dy > 0 ? (cy + 1 - y0) / dy : dy < 0 ? (y0 - cy) / -dy : Number.POSITIVE_INFINITY;
  let t = 0;
  for (let guard = 0; guard < 600; guard++) {
    if (t > maxT) return { t: maxT, hit: false };
    if (cx < 0 || cy < 0 || cx >= w.w || cy >= w.h) return { t, hit: false, out: true };
    if (cb(cy * w.w + cx, cx, cy, t)) return { t, hit: true, cx, cy };
    if (tmx < tmy) {
      t = tmx;
      tmx += tdx;
      cx += sx;
    } else {
      t = tmy;
      tmy += tdy;
      cy += sy;
    }
  }
  return { t: maxT, hit: false };
}

/* ---------- movement ---------- */

function moveX(s: Sim, dx: number): void {
  const p = s.player;
  const w = s.world;
  const nx = p.x + dx;
  const y0 = Math.floor(p.y - PR + 0.001);
  const y1 = Math.floor(p.y + PR - 0.001);
  const cx = Math.floor(dx > 0 ? nx + PR : nx - PR);
  let hit = -1;
  for (let y = y0; y <= y1; y++)
    if (w.solidAt(cx, y)) {
      hit = y;
      break;
    }
  if (hit < 0) {
    p.x = nx;
    return;
  }
  if (cx >= 0 && cx < w.w && hit >= 0 && hit < w.h) s.blockedCell = hit * w.w + cx;
  p.x = dx > 0 ? Math.min(p.x, cx - PR - 0.001) : Math.max(p.x, cx + 1 + PR + 0.001);
  if (y0 !== y1) {
    const s0 = w.solidAt(cx, y0);
    const s1 = w.solidAt(cx, y1);
    if (s0 && !s1) {
      const ov = y0 + 1 - (p.y - PR);
      if (ov < 0.45) p.y += Math.min(ov + 0.002, Math.abs(dx));
    } else if (s1 && !s0) {
      const ov = p.y + PR - y1;
      if (ov < 0.45) p.y -= Math.min(ov + 0.002, Math.abs(dx));
    }
  }
}

function moveY(s: Sim, dy: number): void {
  const p = s.player;
  const w = s.world;
  const ny = p.y + dy;
  const x0 = Math.floor(p.x - PR + 0.001);
  const x1 = Math.floor(p.x + PR - 0.001);
  const cy = Math.floor(dy > 0 ? ny + PR : ny - PR);
  let hit = -1;
  for (let x = x0; x <= x1; x++)
    if (w.solidAt(x, cy)) {
      hit = x;
      break;
    }
  if (hit < 0) {
    p.y = ny;
    return;
  }
  if (cy >= 0 && cy < w.h && hit >= 0 && hit < w.w) s.blockedCell = cy * w.w + hit;
  p.y = dy > 0 ? Math.min(p.y, cy - PR - 0.001) : Math.max(p.y, cy + 1 + PR + 0.001);
  if (x0 !== x1) {
    const s0 = w.solidAt(x0, cy);
    const s1 = w.solidAt(x1, cy);
    if (s0 && !s1) {
      const ov = x0 + 1 - (p.x - PR);
      if (ov < 0.45) p.x += Math.min(ov + 0.002, Math.abs(dy));
    } else if (s1 && !s0) {
      const ov = p.x + PR - x1;
      if (ov < 0.45) p.x -= Math.min(ov + 0.002, Math.abs(dy));
    }
  }
}

export function movePlayer(s: Sim, dt: number): void {
  const inp = s.input;
  let mx = inp.moveX;
  let my = inp.moveY;
  s.autoWalking = false;
  if (mx || my) {
    const l = Math.hypot(mx, my);
    mx /= l;
    my /= l;
  } else if (inp.held && s.autoWalk && (s.run.tool <= BRUSH || s.run.tool === PRISM) && !s.sel) {
    const dx = inp.aimX - s.player.x;
    const dy = inp.aimY - s.player.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.9) {
      mx = dx / d;
      my = dy / d;
      s.autoWalking = true;
    }
  }
  s.blockedCell = -1;
  if (!mx && !my) return;
  const sp = s.S.speed * dt;
  moveX(s, mx * sp);
  moveY(s, my * sp);
}

export function occupiesPlayer(s: Sim, x: number, y: number): boolean {
  const p = s.player;
  return x + 1 > p.x - PR && x < p.x + PR && y + 1 > p.y - PR && y < p.y + PR;
}

/* ---------- tools ---------- */

/** First solid cell along the aim, within reach. */
function handTarget(s: Sim): number {
  const w = s.world;
  const p = s.player;
  const dx = s.input.aimX - p.x;
  const dy = s.input.aimY - p.y;
  const dAim = Math.hypot(dx, dy);
  if (s.autoWalking && s.blockedCell >= 0 && w.cells[s.blockedCell]) return s.blockedCell;
  if (dAim <= 0.05) return -1;
  const res = traverse(w, p.x, p.y, dx / dAim, dy / dAim, Math.min(s.S.reach, dAim), i => w.cells[i] !== E);
  return res.hit ? (res.cy as number) * w.w + (res.cx as number) : -1;
}

function mine(s: Sim, dt: number): void {
  const w = s.world;
  const S = s.S;
  const target = handTarget(s);
  if (target < 0) {
    s.strikeT = 0;
    return;
  }
  if (s.dp && target === s.dp.i) {
    catchDeadPixel(s);
    return;
  }
  const brush = s.run.tool === BRUSH || (s.run.tool === PRISM && s.toolUnlocked(BRUSH));
  const cells = s.targets;
  if (brush) {
    const tx = target % w.w;
    const ty = (target / w.w) | 0;
    const R = S.brushR + 0.01;
    const ri = Math.ceil(R);
    for (let oy = -ri; oy <= ri; oy++)
      for (let ox = -ri; ox <= ri; ox++) {
        if (ox * ox + oy * oy > R * R) continue;
        const x = tx + ox;
        const y = ty + oy;
        if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
        const i = y * w.w + x;
        if (!w.cells[i]) continue;
        if (s.dp && i === s.dp.i && w.isOpen(i)) {
          catchDeadPixel(s);
          return;
        }
        cells.push(i);
      }
  } else cells.push(target);
  s.strikeT -= dt;
  if (s.strikeT > 0) return;
  s.strikeT = Math.max(0, s.strikeT + 1 / STRIKES);
  const crit = S.crit > 0 && s.rand() < S.crit;
  const hit = (brush ? S.brushHit : S.pickHit) * (crit ? 5 : 1);
  const src = brush ? SRC.BRUSH : SRC.PICK;
  for (const i of cells) damageCell(s, i, hit, src, crit);
  s.emit({ k: 'strike', i: target, tool: s.run.tool, crit });
}

export function tuneMatch(s: Sim, t: number): boolean {
  return s.run.tune === 'any' || TYPE_CUR[t] === s.run.tune;
}

function fireLaser(s: Sim, dt: number): void {
  const w = s.world;
  const S = s.S;
  const p = s.player;
  const dx = s.input.aimX - p.x;
  const dy = s.input.aimY - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  let hits = 0;
  let endT = S.laserRange;
  let blocked = false;
  let caught = false;
  const res = traverse(w, p.x, p.y, ux, uy, S.laserRange, (i, _cx, _cy, t) => {
    const ty = w.cells[i];
    if (!ty) return false;
    if (s.dp && i === s.dp.i) {
      // A Dead Pixel swallows the beam. Out in the open, the beam catches it.
      if (w.isOpen(i)) caught = true;
      blocked = true;
      endT = t + 0.5;
      return true;
    }
    if (S.detonator && ty === 5) {
      breakCell(s, i, SRC.LASER);
      return false;
    }
    if (!tuneMatch(s, ty)) return false;
    s.targets.push(i);
    damageCell(s, i, S.laserDps * dt, SRC.LASER);
    if (++hits >= S.pierce) {
      endT = t + 0.5;
      return true;
    }
    return false;
  });
  if (res.out) endT = Math.min(endT, res.t);
  s.beam = { x1: p.x + ux * endT, y1: p.y + uy * endT, blocked };
  if (caught) catchDeadPixel(s);
}

export function landingPoint(s: Sim, range: number): { x: number; y: number } {
  const p = s.player;
  const dx = s.input.aimX - p.x;
  const dy = s.input.aimY - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) return { x: p.x, y: p.y };
  const ux = dx / d;
  const uy = dy / d;
  const maxT = Math.min(range, d);
  let lx = p.x;
  let ly = p.y;
  for (let t = 0; t <= maxT; t += 0.2) {
    const px = p.x + ux * t;
    const py = p.y + uy * t;
    if (s.world.solidAt(Math.floor(px), Math.floor(py))) break;
    lx = px;
    ly = py;
  }
  return { x: lx, y: ly };
}

function throwBomb(s: Sim): void {
  if (s.run.bombCharges < 1) {
    s.emit({ k: 'sfx', id: 'deny' });
    return;
  }
  s.run.bombCharges -= 1;
  const pt = landingPoint(s, s.S.reach + 5);
  s.bombs.push({ sx: s.player.x, sy: s.player.y, x: pt.x, y: pt.y, t: 0, fuse: 1.1, auto: false });
  s.emit({ k: 'sfx', id: 'throw' });
}

export function prismTarget(s: Sim): { x: number; y: number } {
  const p = s.player;
  const w = s.world;
  const dx = s.input.aimX - p.x;
  const dy = s.input.aimY - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const range = Math.min(s.S.reach * 1.6, d);
  const res = traverse(w, p.x, p.y, dx / d, dy / d, range, i => w.cells[i] !== E);
  if (res.hit) return { x: (res.cx as number) + 0.5, y: (res.cy as number) + 0.5 };
  return { x: p.x + (dx / d) * range, y: p.y + (dy / d) * range };
}

function usePrism(s: Sim): void {
  if (s.prismCd > 0) return;
  const w = s.world;
  const pt = prismTarget(s);
  const R = s.S.prismR;
  const R2 = R * R;
  const ri = Math.ceil(R);
  let n = 0;
  let bank = 0;
  for (let oy = -ri; oy <= ri; oy++)
    for (let ox = -ri; ox <= ri; ox++) {
      const x = Math.floor(pt.x) + ox;
      const y = Math.floor(pt.y) + oy;
      if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      const ddx = x + 0.5 - pt.x;
      const ddy = y + 0.5 - pt.y;
      if (ddx * ddx + ddy * ddy > R2) continue;
      const i = y * w.w + x;
      const t = w.cells[i];
      if (!t || t === STATIC || (s.dp && s.dp.i === i)) continue;
      if (isGray(t)) {
        // gray turns to color, and the light keeps the gray ink it held
        bank += BASE_YIELD[t] * yieldAt(w.depth[i]) * yieldMult(s, t);
        w.setCell(i, randomColored(s, false, w.ring[i]));
        n++;
      }
      // everything it touches is left cracked
      const cap = w.maxHp(w.cells[i], i) * s.S.prismSoft;
      if (w.hp[i] > cap) {
        w.hp[i] = cap;
        w.dmg.add(i);
      }
    }
  gain(s, 'gray', bank, false);
  s.prismCd = s.S.prismCd;
  s.emit({ k: 'fx', kind: 'prism', x: pt.x, y: pt.y, R: R + 0.4 });
  s.emit({ k: 'sfx', id: 'prism' });
  if (!n) s.emit({ k: 'text', x: pt.x, y: pt.y - 0.6, txt: 'no gray rock', c: '#a39bc2' });
}

/** Where the Smudge zone sits for the current aim. */
export function smudgeCenter(s: Sim): { x: number; y: number } {
  const p = s.player;
  const dx = s.input.aimX - p.x;
  const dy = s.input.aimY - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const t = Math.min(d, s.S.reach + 1);
  return { x: p.x + (dx / d) * t, y: p.y + (dy / d) * t };
}

/** Push blue away from you. Blue that cannot move wears away whatever blocks it. */
function smudge(s: Sim, dt: number): void {
  s.smudgeT -= dt;
  if (s.smudgeT > 0) return;
  s.smudgeT = 0.08;
  const w = s.world;
  const p = s.player;
  const S = s.S;
  const dx = s.input.aimX - p.x;
  const dy = s.input.aimY - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const c = smudgeCenter(s);
  const R = S.smudgeR;
  const ri = Math.ceil(R);
  const list: { i: number; proj: number }[] = [];
  for (let oy = -ri; oy <= ri; oy++)
    for (let ox = -ri; ox <= ri; ox++) {
      const x = Math.floor(c.x) + ox;
      const y = Math.floor(c.y) + oy;
      if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      const ddx = x + 0.5 - c.x;
      const ddy = y + 0.5 - c.y;
      if (ddx * ddx + ddy * ddy > R * R) continue;
      const i = y * w.w + x;
      if (w.cells[i] === BLUE) list.push({ i, proj: (x + 0.5 - p.x) * ux + (y + 0.5 - p.y) * uy });
    }
  list.sort((a, b) => b.proj - a.proj);
  const ax = Math.abs(ux);
  const ay = Math.abs(uy);
  for (const { i } of list) {
    if (w.cells[i] !== BLUE) continue;
    const horiz = s.rand() < ax / (ax + ay);
    const sx = horiz ? Math.sign(ux) : 0;
    const sy = horiz ? 0 : Math.sign(uy);
    const x = (i % w.w) + sx;
    const y = ((i / w.w) | 0) + sy;
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
    const n = y * w.w + x;
    if (s.dp && n === s.dp.i) {
      catchDeadPixel(s);
      return;
    }
    const nt = w.cells[n];
    if (nt === E) {
      if (occupiesPlayer(s, x, y)) continue;
      w.setCell(n, BLUE);
      s.cause = SRC.SMUDGE;
      w.setCell(i, E);
    } else if (nt !== BLUE) damageCell(s, n, S.smudgeHit, SRC.SMUDGE);
  }
  s.emit({ k: 'fx', kind: 'smudge', x: c.x, y: c.y, R });
}

/** A fresh press on the world: catch an exposed Dead Pixel under the cursor, or fire a one-shot tool. */
export function onPress(s: Sim): void {
  const dp = s.dp;
  const w = s.world;
  if (dp && w.isOpen(dp.i)) {
    const x = (dp.i % w.w) + 0.5;
    const y = ((dp.i / w.w) | 0) + 0.5;
    if (Math.hypot(s.input.aimX - x, s.input.aimY - y) < 1.3) {
      catchDeadPixel(s);
      return;
    }
  }
  if (s.run.tool === BOMB) {
    throwBomb(s);
    s.bombHold = 0.35;
  } else if (s.run.tool === PRISM) usePrism(s);
}

export function useTool(s: Sim, dt: number): void {
  const tool = s.run.tool;
  if (tool === ERASER || tool === BRUSH) mine(s, dt);
  else if (tool === BOMB) {
    s.bombHold -= dt;
    if (s.bombHold <= 0) {
      throwBomb(s);
      s.bombHold = 0.35;
    }
  } else if (tool === LASER) fireLaser(s, dt);
  else if (tool === PRISM) {
    // the Prism digs like your Brush and fires its light whenever it is ready
    if (s.prismCd <= 0) usePrism(s);
    mine(s, dt);
  } else if (tool === SMUDGE) smudge(s, dt);
}

export function updateBombs(s: Sim, dt: number): void {
  for (let k = s.bombs.length - 1; k >= 0; k--) {
    const b = s.bombs[k];
    if (b.t < 1) {
      b.t = Math.min(1, b.t + dt / 0.28);
      continue;
    }
    b.fuse -= dt;
    if (b.fuse <= 0) {
      s.bombs.splice(k, 1);
      explode(s, { x: b.x, y: b.y, R: s.S.bombR, dmg: s.S.bombDmg, chain: newChain(s) });
    }
  }
}
