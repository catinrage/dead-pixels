import { bayer, type RGB } from './procedural';

/**
 * Turns any picture (a generated image, a photo) into pixel art that matches the procedural ones:
 * crop to a square, shrink with box filtering, reduce to a small palette by median cut, then map
 * every pixel to the palette with the same 4×4 ordered dithering.
 */

export interface PixelateOptions {
  /** Output width and height in pixels. */
  size: number;
  /** Palette size. */
  colors?: number;
  /** Dither strength in palette steps; 0 turns dithering off. */
  dither?: number;
  /** Saturation boost, 1 leaves colors alone. */
  saturation?: number;
}

/** Average the source over each output cell, after cropping the source to a centered square. */
export function downsample(src: Uint8ClampedArray, sw: number, sh: number, size: number): Float32Array {
  const side = Math.min(sw, sh);
  const ox = Math.floor((sw - side) / 2);
  const oy = Math.floor((sh - side) / 2);
  const out = new Float32Array(size * size * 3);
  const step = side / size;
  for (let y = 0; y < size; y++) {
    const y0 = oy + Math.floor(y * step);
    const y1 = Math.max(y0 + 1, oy + Math.floor((y + 1) * step));
    for (let x = 0; x < size; x++) {
      const x0 = ox + Math.floor(x * step);
      const x1 = Math.max(x0 + 1, ox + Math.floor((x + 1) * step));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const o = (yy * sw + xx) * 4;
          r += src[o];
          g += src[o + 1];
          b += src[o + 2];
          n++;
        }
      const o = (y * size + x) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return out;
}

function saturate(px: Float32Array, k: number): void {
  if (k === 1) return;
  for (let o = 0; o < px.length; o += 3) {
    const l = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
    for (let c = 0; c < 3; c++) px[o + c] = Math.min(255, Math.max(0, l + (px[o + c] - l) * k));
  }
}

/** Median cut: split the box with the widest channel range at its median until there are enough boxes. */
export function medianCut(px: Float32Array, colors: number): RGB[] {
  const n = px.length / 3;
  let boxes: number[][] = [Array.from({ length: n }, (_, i) => i)];
  const range = (idx: number[]): [number, number] => {
    let best = 0;
    let span = -1;
    for (let c = 0; c < 3; c++) {
      let lo = 255;
      let hi = 0;
      for (const i of idx) {
        const v = px[i * 3 + c];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > span) {
        span = hi - lo;
        best = c;
      }
    }
    return [best, span];
  };
  while (boxes.length < colors) {
    let pick = -1;
    let pickSpan = 0;
    let pickC = 0;
    for (let k = 0; k < boxes.length; k++) {
      if (boxes[k].length < 2) continue;
      const [c, span] = range(boxes[k]);
      if (span > pickSpan) {
        pickSpan = span;
        pick = k;
        pickC = c;
      }
    }
    if (pick < 0) break;
    const box = boxes[pick].sort((a, b) => px[a * 3 + pickC] - px[b * 3 + pickC]);
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, pick), box.slice(0, mid), box.slice(mid), ...boxes.slice(pick + 1)];
  }
  return boxes.map(idx => {
    const s = [0, 0, 0];
    for (const i of idx) for (let c = 0; c < 3; c++) s[c] += px[i * 3 + c];
    return s.map(v => Math.round(v / idx.length)) as RGB;
  });
}

function nearest(pal: RGB[], r: number, g: number, b: number): RGB {
  let best = pal[0];
  let bd = Number.POSITIVE_INFINITY;
  for (const c of pal) {
    const dr = c[0] - r;
    const dg = c[1] - g;
    const db = c[2] - b;
    // weighted toward green, the way eyes are
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** RGBA in, RGBA out (size × size). */
export function pixelate(src: Uint8ClampedArray, sw: number, sh: number, opts: PixelateOptions): Uint8ClampedArray {
  const { size } = opts;
  const colors = opts.colors ?? 24;
  const dither = opts.dither ?? 0.6;
  const px = downsample(src, sw, sh, size);
  saturate(px, opts.saturation ?? 1.15);
  const pal = medianCut(px, colors);
  // typical distance between palette colors, so dithering nudges about one step at most
  let spread = 0;
  for (let k = 1; k < pal.length; k++)
    spread += Math.hypot(pal[k][0] - pal[k - 1][0], pal[k][1] - pal[k - 1][1], pal[k][2] - pal[k - 1][2]);
  spread = pal.length > 1 ? spread / (pal.length - 1) / Math.sqrt(3) : 0;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const j = (bayer(x, y) - 0.5) * dither * spread;
      const c = nearest(pal, px[i * 3] + j, px[i * 3 + 1] + j, px[i * 3 + 2] + j);
      out[i * 4] = c[0];
      out[i * 4 + 1] = c[1];
      out[i * 4 + 2] = c[2];
      out[i * 4 + 3] = 255;
    }
  return out;
}
