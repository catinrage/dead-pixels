import { describe, expect, test } from 'bun:test';
import { BASE_HP, DEPTH, GOLD, hpAt, redAt, STONE, yieldAt } from '../../src/content/pixels';
import { quietSim } from './helpers';

describe('depth', () => {
  test('the center is flat, then health grows one step every 10 cells', () => {
    expect(hpAt(0)).toBe(1);
    expect(hpAt(12)).toBe(1);
    expect(hpAt(22)).toBeCloseTo(DEPTH.hpStep, 6);
    expect(hpAt(42)).toBeCloseTo(DEPTH.hpStep ** 3, 6);
    expect(yieldAt(22)).toBeCloseTo(DEPTH.yieldStep, 6);
  });

  test('ink grows slower than health, so every run meets a wall', () => {
    for (const d of [30, 60, 90, 130]) expect(yieldAt(d)).toBeLessThan(hpAt(d));
    expect(hpAt(130) / yieldAt(130)).toBeGreaterThan(20);
  });

  test('red blasts grow with depth, but slower than the rock', () => {
    for (const d of [20, 60, 120]) {
      expect(redAt(d)).toBeCloseTo(hpAt(d) ** 0.6, 6);
      expect(redAt(d)).toBeLessThan(hpAt(d));
    }
  });

  test('a cell starts at its base health times depth and picture toughness', () => {
    const s = quietSim('galaxy');
    const w = s.world;
    for (const i of [0, w.n >> 1, w.n - 1]) {
      expect(w.maxHp(STONE, i)).toBeCloseTo(BASE_HP[STONE] * hpAt(w.depth[i]) * s.pic.hpMult, 4);
      expect(w.maxHp(GOLD, i)).toBeCloseTo(BASE_HP[GOLD] * hpAt(w.depth[i]) * s.pic.hpMult, 4);
    }
  });

  test('depth runs from the middle to the corners', () => {
    const w = quietSim().world;
    const mid = (w.h >> 1) * w.w + (w.w >> 1);
    expect(w.depth[mid]).toBeLessThan(6);
    expect(w.depth[0]).toBeGreaterThan(110);
    expect(w.depth[w.n - 1]).toBeGreaterThan(110);
  });
});
