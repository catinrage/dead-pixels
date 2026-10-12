import { describe, expect, test } from 'bun:test';
import { PICTURES } from '../../src/content/pictures';
import { pixelate } from '../../src/images/pixelate';
import { paint } from '../../src/images/procedural';

/** A photo-like test card: smooth gradients plus a hard-edged disc. */
function testCard(w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const inDisc = (x - w * 0.6) ** 2 + (y - h * 0.4) ** 2 < (h * 0.2) ** 2;
      out[o] = inDisc ? 250 : (x / w) * 255;
      out[o + 1] = inDisc ? 210 : (y / h) * 180;
      out[o + 2] = inDisc ? 40 : 255 - (x / w) * 200;
      out[o + 3] = 255;
    }
  return out;
}

const colorsIn = (px: Uint8ClampedArray): Set<number> => {
  const set = new Set<number>();
  for (let i = 0; i < px.length; i += 4) set.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
  return set;
};

describe('pictures', () => {
  test('pixelate crops to a square, shrinks and keeps to its palette', () => {
    const src = testCard(640, 400);
    const out = pixelate(src, 640, 400, { size: 96, colors: 12 });
    expect(out.length).toBe(96 * 96 * 4);
    expect(colorsIn(out).size).toBeLessThanOrEqual(12);
    expect(colorsIn(out).size).toBeGreaterThan(4);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });

  test('pixelate is deterministic', () => {
    const src = testCard(300, 300);
    expect(pixelate(src, 300, 300, { size: 64 })).toEqual(pixelate(src, 300, 300, { size: 64 }));
  });

  test('every procedural picture paints a full, colorful square', () => {
    for (const p of PICTURES) {
      if (p.source.kind !== 'procedural') continue;
      const px = paint(p.source.gen, p.size);
      expect(px.length).toBe(p.size * p.size * 4);
      expect(colorsIn(px).size).toBeGreaterThan(8);
    }
  });

  test('later pictures are tougher and pay more', () => {
    for (let k = 1; k < PICTURES.length; k++) {
      expect(PICTURES[k].hpMult).toBeGreaterThan(PICTURES[k - 1].hpMult);
      expect(PICTURES[k].bitMult).toBeGreaterThan(PICTURES[k - 1].bitMult);
      expect(PICTURES[k].yieldMult).toBeLessThan(PICTURES[k].hpMult);
    }
  });
});
