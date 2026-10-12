import type { PictureDef } from '../content/pictures';
import { BLUE, E, GLITCH, GOLD, GRAY_OF_RING, GREEN, ICE, RED, STATIC } from '../content/pixels';
import { fbm, hash2, Rng } from '../core/rng';
import type { World } from './world';

/** Fill a world with rock for one picture. Rings harden outward; colored veins come from noise thresholds per ring. */
export function genWorld(world: World, seed: number, pic: PictureDef): void {
  const { w: W, h: H, n: N, cells, ring, depth, vari } = world;
  const R = new Rng(seed);
  const sA = seed + 11;
  const sB = seed + 23;
  const sG = seed + 37;
  const sR = seed + 53;
  const sV = seed + 71;
  const sS = seed + 89;
  const cx = W / 2;
  const cy = H / 2;
  const k = W / 192;
  const nBlue = new Float32Array(N);
  const nGreen = new Float32Array(N);
  const nRed = new Float32Array(N);
  const nGold = new Float32Array(N);
  const nSpec = new Float32Array(N);
  const counts = [0, 0, 0, 0];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = (Math.sqrt(dx * dx + dy * dy) + (fbm(x / 13, y / 13, sA, 3) - 0.5) * 16) / k;
      const r = d < 22 ? 0 : d < 46 ? 1 : d < 70 ? 2 : 3;
      ring[i] = r;
      depth[i] = Math.max(0, d);
      counts[r]++;
      vari[i] = (hash2(x, y, seed) * 4) | 0;
      nBlue[i] = fbm(x / 15, y / 15, sB, 3);
      nGreen[i] = fbm(x / 8, y / 8, sG, 3);
      nRed[i] = fbm(x / 4.5, y / 4.5, sR, 2);
      nGold[i] = 1 - Math.abs(fbm(x / 22, y / 22, sV, 3) - 0.5) * 2;
      if (pic.special === STATIC) nSpec[i] = fbm(x / 5, y / 5, sS, 2);
      else if (pic.special === ICE) nSpec[i] = fbm(x / 7, y / 7, sS, 3);
    }
  const thr = (arr: Float32Array, fr: number[]): number[] => {
    const out: number[] = [];
    for (let r = 0; r < 4; r++) {
      const vals = new Float32Array(counts[r]);
      let n = 0;
      for (let i = 0; i < N; i++) if (ring[i] === r) vals[n++] = arr[i];
      vals.sort();
      out.push(n ? vals[Math.min(n - 1, Math.floor(n * (1 - fr[r])))] : 2);
    }
    return out;
  };
  const ice = pic.special === ICE;
  const tB = thr(nBlue, ice ? [0.06, 0.08, 0.08, 0.08] : [0.05, 0.06, 0.06, 0.06]);
  const tG = thr(nGreen, [0.07, 0.06, 0.05, 0.045]);
  const tR = thr(nRed, [0.05, 0.07, 0.09, 0.1]);
  const tV = thr(nGold, [0.012, 0.022, 0.032, 0.042]);
  const tS = pic.special === STATIC ? thr(nSpec, [0.04, 0.06, 0.08, 0.09]) : ice ? thr(nSpec, [0.04, 0.08, 0.11, 0.13]) : null;
  const GP = [0.0022, 0.0045, 0.008, 0.013];
  for (let i = 0; i < N; i++) {
    const r = ring[i];
    let t = GRAY_OF_RING[r];
    if (nBlue[i] > tB[r]) t = BLUE;
    if (nGreen[i] > tG[r]) t = GREEN;
    if (tS && nSpec[i] > tS[r]) t = pic.special as number;
    if (nRed[i] > tR[r]) t = RED;
    if (nGold[i] > tV[r]) t = GOLD;
    if (R.next() < GP[r]) t = GLITCH;
    cells[i] = t;
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy < 3.3 * 3.3) cells[y * W + x] = E;
    }
}

/** A buried cell between the picture's two distances from the center, chosen from the seed. */
export function placeDeadPixel(world: World, seed: number, pic: PictureDef): number {
  const R = new Rng(seed ^ 0x5eed);
  const cx = world.w / 2;
  const cy = world.h / 2;
  const k = world.w / 192;
  for (let tries = 0; tries < 4000; tries++) {
    const a = R.next() * Math.PI * 2;
    const d = (pic.dpMin + R.next() * (pic.dpMax - pic.dpMin)) * k;
    const x = Math.floor(cx + Math.cos(a) * d);
    const y = Math.floor(cy + Math.sin(a) * d);
    if (x < 2 || y < 2 || x >= world.w - 2 || y >= world.h - 2) continue;
    const i = y * world.w + x;
    if (world.isBuried(i)) return i;
  }
  for (let i = 0; i < world.n; i++) if (world.isBuried(i)) return i;
  return -1;
}
