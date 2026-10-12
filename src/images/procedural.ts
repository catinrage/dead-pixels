import { clamp } from '../core/num';
import { fbm, hash2, mulberry32 } from '../core/rng';

/**
 * The pictures under the rock, drawn by code in a 16-bit style: ordered dithering between palette steps,
 * no smooth gradients. Each painter fills an RGBA buffer of size × size.
 */

export type RGB = [number, number, number];
export type Painter = (seed: number, out: Uint8ClampedArray, size: number) => void;

export const hex = (h: string): RGB => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4×4 Bayer threshold in (0, 1). */
export const bayer = (x: number, y: number): number => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/** Pick between neighboring palette steps with ordered dithering. */
export function gradPick(pal: RGB[], t: number, x: number, y: number): RGB {
  t = clamp(t, 0, 1) * (pal.length - 1);
  const k = Math.min(pal.length - 2, Math.floor(t));
  return t - k > bayer(x, y) ? pal[k + 1] : pal[k];
}

function put(out: Uint8ClampedArray, W: number, x: number, y: number, c: RGB): void {
  const o = (y * W + x) * 4;
  out[o] = c[0];
  out[o + 1] = c[1];
  out[o + 2] = c[2];
  out[o + 3] = 255;
}

const brighten = (c: RGB, a: number): RGB => [Math.min(255, c[0] + a), Math.min(255, c[1] + a * 0.7), Math.min(255, c[2] + a)];

export const paintSunset: Painter = (sd, out, W) => {
  const H = W;
  const hz = Math.floor(H * 0.62);
  const sky = ['#120a2c', '#24104a', '#451767', '#76207f', '#b1307f', '#e5506f', '#ff8160', '#ffb867'].map(hex);
  const sunPal = ['#ff3f8e', '#ff5f7a', '#ff8a5c', '#ffb54f', '#ffdc5e', '#fff3a0'].map(hex);
  const mBack = ['#3b1660', '#2a0f4a'].map(hex);
  const mFront = hex('#1b0a30');
  const rim = hex('#ff5fb0');
  const ground = ['#2a0c46', '#170629', '#0d0418'].map(hex);
  const gridNear = hex('#ff3df2');
  const gridFar = hex('#8a2be2');
  const sunX = W / 2;
  const sunR = W * 0.21;
  const sunY = hz - sunR * 0.3;
  const back = new Float32Array(W);
  const front = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const side = Math.abs(x + 0.5 - W / 2) / (W / 2);
    back[x] = hz - 6 - fbm(x / 22, 1.7, sd + 5, 4) * 46 * (0.5 + 0.5 * side);
    front[x] = hz - 1 - fbm(x / 11, 4.2, sd + 9, 4) * 34 * side ** 1.4;
  }
  const rows = new Set<number>();
  for (let k = 1; k < 14; k++) {
    const t = k / 13;
    rows.add(hz + Math.round((H - hz) * t * t));
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c: RGB;
      if (y < hz) {
        c = gradPick(sky, y / hz, x, y);
        if (y < hz * 0.6 && hash2(x, y, sd) > 0.988) c = hash2(x, y, sd + 1) > 0.5 ? [255, 255, 255] : [210, 190, 255];
        const dx = x + 0.5 - sunX;
        const dy = y + 0.5 - sunY;
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < sunR) {
          const rel = (y + 0.5 - (sunY - sunR)) / (2 * sunR);
          const below = y - Math.floor(sunY);
          const cut = below > 0 && below % 7 < 1 + Math.floor(below / (sunR / 2.6));
          if (!cut) c = gradPick(sunPal, 1 - rel, x, y);
        } else if (dd < sunR + 9 && bayer(x, y) < 0.6 * (1 - (dd - sunR) / 9)) c = brighten(c, 34);
        if (y >= back[x]) c = gradPick(mBack, (y - back[x]) / 26, x, y);
        if (y >= front[x]) c = y < front[x] + 1 ? rim : mFront;
      } else {
        const gy = (y - hz) / (H - hz);
        c = gradPick(ground, gy, x, y);
        const rw = sunR * (1 - gy * 0.55);
        if (Math.abs(x + 0.5 - sunX) < rw && y % 3 === 0 && hash2(x >> 1, y, sd + 7) > 0.3 + gy * 0.55)
          c = gy < 0.3 ? [255, 120, 170] : [190, 60, 150];
        const gc = gy < 0.4 ? (bayer(x, y) < gy / 0.4 ? gridNear : gridFar) : gridNear;
        if (rows.has(y)) c = gc;
        if (gy > 0.015) {
          const sp = (gy * W) / 8;
          const off = x + 0.5 - W / 2;
          const fu = off - Math.round(off / sp) * sp;
          if (Math.abs(fu) < 0.55) c = gc;
        }
      }
      put(out, W, x, y, c);
    }
};

export const paintGalaxy: Painter = (sd, out, W) => {
  const H = W;
  const bg = ['#04030a', '#090619', '#120b2c'].map(hex);
  const neb1 = ['#1c0f3a', '#2f1a5c', '#4a2584'].map(hex);
  const neb2 = ['#0a2433', '#0f3d52'].map(hex);
  const gPal = ['#1d1450', '#3a2a8a', '#6a4fd0', '#a77cff', '#f0b5ff', '#fff3d6'].map(hex);
  const ringCol = ['#a8823f', '#e8c27a'].map(hex);
  const planet = ['#1a0f2e', '#3d1f5c', '#6f3a96', '#b363c4', '#e9a6e6'].map(hex);
  const gx = W * 0.57;
  const gy = H * 0.4;
  const ang = -0.45;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const pX = W * 0.22;
  const pY = H * 0.78;
  const pR = 22 * (W / 192);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c = gradPick(bg, fbm(x / 50, y / 50, sd, 3), x, y);
      const n1 = fbm(x / 34, y / 34, sd + 3, 4);
      if (n1 > 0.56) c = gradPick(neb1, (n1 - 0.56) / 0.2, x, y);
      const n2 = fbm(x / 24, y / 24, sd + 8, 4);
      if (n2 > 0.63) c = gradPick(neb2, (n2 - 0.63) / 0.15, x, y);
      const hs = hash2(x, y, sd + 11);
      if (hs > 0.993) c = [255, 255, 255];
      else if (hs > 0.984) c = [150, 140, 210];
      const dx = x + 0.5 - gx;
      const dy = y + 0.5 - gy;
      const u = dx * ca - dy * sa;
      const v = (dx * sa + dy * ca) / 0.5;
      const r = Math.sqrt(u * u + v * v);
      const th = Math.atan2(v, u);
      let s = (th - Math.log(r + 1) / 0.36) / Math.PI;
      s -= Math.floor(s);
      const ad = Math.min(s, 1 - s) * 2;
      let I = Math.exp(-ad * ad * 14) * Math.exp(-r / 36) * 1.15 + Math.exp(-r / 6) * 1.35;
      I *= 0.75 + 0.5 * fbm(x / 6, y / 6, sd + 21, 2);
      if (I > 0.16) c = gradPick(gPal, Math.min(1, (I - 0.16) / 0.95), x, y);
      const px = x + 0.5 - pX;
      const py = y + 0.5 - pY;
      const pd = Math.sqrt(px * px + py * py);
      const re = (px / (pR * 1.95)) ** 2 + (py / (pR * 0.42)) ** 2;
      const onRing = re > 0.74 && re < 1;
      if (onRing && py < 0) c = gradPick(ringCol, (px / (pR * 1.95) + 1) / 2, x, y);
      if (pd < pR) {
        const nx = px / pR;
        const ny = py / pR;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lam = Math.max(0, -0.55 * nx - 0.5 * ny + 0.67 * nz);
        const band = 0.12 * Math.sin(ny * 9 + fbm(x / 8, y / 8, sd + 30, 2) * 3);
        c = gradPick(planet, clamp(lam + band, 0, 1), x, y);
      }
      if (onRing && py >= 0) c = gradPick(ringCol, (px / (pR * 1.95) + 1) / 2, x, y);
      put(out, W, x, y, c);
    }
  const R = mulberry32(sd + 99);
  for (let k = 0; k < 7; k++) {
    const x = (4 + R() * (W - 8)) | 0;
    const y = (4 + R() * (H - 8)) | 0;
    put(out, W, x, y, [255, 255, 255]);
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      put(out, W, x + ox, y + oy, [190, 200, 255]);
  }
};

export const paintLake: Painter = (sd, out, W) => {
  const H = W;
  const hz = Math.floor(H * 0.56);
  const sky = ['#05081a', '#0a1130', '#13204f', '#22386f', '#3a5690', '#5a77a8'].map(hex);
  const moonPal = ['#cfc6a0', '#efe8c6', '#fffbe8'].map(hex);
  const far = hex('#1b2650');
  const mid = hex('#111a3a');
  const treeC = hex('#050815');
  const water = ['#0d1838', '#081130', '#050b22'].map(hex);
  const mX = W * 0.68;
  const mY = H * 0.2;
  const mR = 15 * (W / 192);
  const farH = new Float32Array(W);
  const midH = new Float32Array(W);
  const treeTop = new Float32Array(W).fill(1e9);
  for (let x = 0; x < W; x++) {
    farH[x] = hz - 6 - fbm(x / 28, 2.2, sd + 4, 4) * 34;
    midH[x] = hz - 1 - fbm(x / 14, 6.1, sd + 6, 3) * 14;
  }
  const Rr = mulberry32(sd + 77);
  for (let x = 2; x < W; x += 3 + Math.floor(Rr() * 4)) {
    const edge = Math.abs(x - W / 2) / (W / 2);
    if (Rr() > 0.2 + edge * 0.9) continue;
    const th = 8 + Rr() * 24 * (0.4 + edge);
    for (let dy = 0; dy < th; dy++) {
      const rel = dy / th;
      let hw = (1 - rel) * th * 0.3 * (0.72 + 0.28 * ((dy % 4) / 3));
      hw = Math.max(0.5, hw);
      for (let xx = Math.round(x - hw); xx <= Math.round(x + hw); xx++) if (xx >= 0 && xx < W) treeTop[xx] = Math.min(treeTop[xx], hz - dy);
    }
  }
  for (let y = 0; y < hz; y++)
    for (let x = 0; x < W; x++) {
      let c = gradPick(sky, y / hz, x, y);
      if (y < hz * 0.75 && hash2(x, y, sd) > 0.99) c = [230, 236, 255];
      const dx = x + 0.5 - mX;
      const dy = y + 0.5 - mY;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd >= mR && dd < mR + 9 && bayer(x, y) < 0.55 * (1 - (dd - mR) / 9)) c = brighten(c, 40);
      if (dd < mR) {
        c = gradPick(moonPal, clamp(0.55 + ((-dx * 0.5 - dy * 0.45) / mR) * 0.6, 0, 1), x, y);
        if (fbm(x / 4, y / 4, sd + 12, 2) > 0.62) c = moonPal[0];
      }
      if (y >= farH[x]) c = far;
      if (y >= midH[x]) c = mid;
      if (y >= treeTop[x]) c = treeC;
      put(out, W, x, y, c);
    }
  const Rf = mulberry32(sd + 5);
  for (let k = 0; k < 22; k++) {
    const x = (Rf() * W) | 0;
    const y = (hz - 3 - Rf() * 24) | 0;
    if (y > 0 && y >= treeTop[x] - 3) put(out, W, x, y, [255, 236, 120]);
  }
  for (let y = hz; y < H; y++) {
    const gy = (y - hz) / (H - hz);
    for (let x = 0; x < W; x++) {
      let c = gradPick(water, gy, x, y);
      const ry = hz - 1 - Math.floor((y - hz) * 0.9);
      const sx = clamp(x + Math.round(Math.sin(y * 0.8 + sd) * (1 + gy * 2)), 0, W - 1);
      if (ry >= 0 && bayer(x, y) < 0.62 - gy * 0.35) {
        const o = (ry * W + sx) * 4;
        c = [(out[o] * 0.55) | 0, (out[o + 1] * 0.6) | 0, (out[o + 2] * 0.75) | 0];
      }
      if (Math.abs(x + 0.5 - mX) < mR * (0.5 + gy * 0.9) && (y + (x >> 2)) % 3 === 0 && hash2(x >> 1, y, sd + 3) > 0.45)
        c = gy < 0.5 ? [240, 232, 196] : [170, 180, 205];
      put(out, W, x, y, c);
    }
  }
};

export const PAINTERS: Record<'sunset' | 'galaxy' | 'lake', Painter> = { sunset: paintSunset, galaxy: paintGalaxy, lake: paintLake };

/** Every picture looks the same each time it is opened, so its seed is fixed. */
export const PICTURE_SEED: Record<string, number> = { sunset: 1001, galaxy: 2002, lake: 3003 };

export function paint(gen: keyof typeof PAINTERS, size: number, seed = PICTURE_SEED[gen] ?? 1): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  PAINTERS[gen](seed, out, size);
  return out;
}
