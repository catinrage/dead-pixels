import { describe, expect, test } from 'bun:test';
import { BIT_NODE, bitCost } from '../../src/content/bitTree';
import { E } from '../../src/content/pixels';
import { RUN_NODE } from '../../src/content/runTree';
import { catchDeadPixel } from '../../src/sim/hunt';
import { newChain } from '../../src/sim/mechanics';
import { newProfile, Sim } from '../../src/sim/sim';
import { clearAll, quietSim, stepFor } from './helpers';

/** Empty the cells closest to the center until the reveal reaches `pct`. */
function clearTo(s: Sim, pct: number): void {
  const w = s.world;
  const order = [...Array(w.n).keys()].sort((a, b) => w.depth[a] - w.depth[b]);
  for (const i of order) {
    if (s.reveal() >= pct) return;
    if (w.cells[i] && !(s.dp && s.dp.i === i)) w.setCell(i, E);
  }
}

function play(seed: number): Sim {
  const s = new Sim({ seed, runSeed: 99, record: false });
  s.input.held = true;
  for (let k = 0; k < 1800; k++) {
    // sweep the aim around the player so the eraser keeps finding rock
    const a = k * 0.01;
    s.input.aimX = s.player.x + Math.cos(a) * 3;
    s.input.aimY = s.player.y + Math.sin(a) * 3;
    s.step(1 / 60);
    if (k % 120 === 0) for (const id of ['pick', 'speed', 'press', 'reach']) s.buyNode(id);
  }
  return s;
}

describe('simulation', () => {
  test('the same seed and the same input replay exactly', () => {
    const a = play(5);
    const b = play(5);
    expect(a.run.deleted).toBeGreaterThan(20);
    expect(Buffer.from(a.world.cells).equals(Buffer.from(b.world.cells))).toBe(true);
    expect(a.run.inks).toEqual(b.run.inks);
    expect(a.run.levels).toEqual(b.run.levels);
    expect([a.player.x, a.player.y]).toEqual([b.player.x, b.player.y]);
  });

  test('a new run starts in an open pocket with the Dead Pixel buried', () => {
    const s = quietSim();
    const w = s.world;
    expect(w.cells[Math.floor(s.player.y) * w.w + Math.floor(s.player.x)]).toBe(E);
    expect(s.dp).not.toBeNull();
    expect(w.isBuried(s.dp?.i as number)).toBe(true);
  });

  test('Defrag opens at 20%, pays Bits and waits on the gallery', () => {
    const s = quietSim();
    clearTo(s, 15);
    expect(s.canDefrag()).toBe(false);
    expect(s.defrag()).toBe(-1);
    clearTo(s, 30);
    const expected = s.defragGain();
    expect(expected).toBeGreaterThan(0);
    expect(s.defrag()).toBe(expected);
    expect(s.profile.bits).toBe(expected);
    expect(s.choosing).toBe(true);
    // nothing moves while the player chooses
    const t = s.profile.stats.playTime;
    stepFor(s, 1);
    expect(s.profile.stats.playTime).toBe(t);
    // only reached pictures can be opened
    expect(s.choose('galaxy')).toBe(false);
    expect(s.choose('sunset')).toBe(true);
    expect(s.choosing).toBe(false);
    expect(s.reveal()).toBeLessThan(5);
  });

  test('Bits spent on the chooser apply to the next run', () => {
    const s = quietSim();
    clearTo(s, 60);
    s.profile.bits = 0;
    s.defrag();
    s.profile.bits += 1000;
    expect(s.buyBitNode('b_warm')).toBe(true);
    expect(s.buyBitNode('b_firmware')).toBe(true);
    s.choose('sunset');
    expect(s.run.inks.gray).toBe(50);
    expect(s.L('pick')).toBe(2);
    expect(s.L('press')).toBe(2);
  });

  test('a Bit node costs what its curve says and stops at its max', () => {
    const s = quietSim();
    const n = BIT_NODE.b_cache;
    s.profile.bits = 1e9;
    for (let l = 0; l < n.max; l++) {
      const before = s.profile.bits;
      expect(s.buyBitNode('b_cache')).toBe(true);
      expect(before - s.profile.bits).toBe(bitCost(n, l));
    }
    expect(s.buyBitNode('b_cache')).toBe(false);
  });

  test('Abandon leaves a run for nothing', () => {
    const s = quietSim();
    clearTo(s, 40);
    s.run.inks.gray = 500;
    expect(s.abandon()).toBe(true);
    expect(s.profile.bits).toBe(0);
    expect(s.abandon()).toBe(false);
    s.choose('sunset');
    expect(s.run.inks.gray).toBe(0);
    expect(s.profile.pictures.sunset.runs).toBe(2);
  });

  test('Restore needs every cell gone and the Dead Pixel caught', () => {
    const s = quietSim();
    clearAll(s);
    expect(s.canRestore()).toBe(false);
    catchDeadPixel(s);
    expect(s.profile.fragments).toContain('sunset');
    expect(s.world.emptyCount).toBe(s.world.n);
    expect(s.canRestore()).toBe(true);
    const bits = s.profile.bits;
    const g = s.restore();
    expect(g).toBe(Math.floor(90 * s.S.bitGain));
    expect(s.profile.bits).toBe(bits + g);
    expect(s.progress('sunset').restored).toBe(true);
    expect(s.choosing).toBe(true);
    expect(s.choices().map(p => p.id)).toEqual(['sunset', 'galaxy']);
    // a restored picture replays without its Dead Pixel and cannot be restored twice
    s.choose('sunset');
    expect(s.dp).toBeNull();
    clearAll(s);
    expect(s.canRestore()).toBe(false);
  });

  test('restoring Moon Lake gives the Smudge for good', () => {
    const p = newProfile();
    p.pictures.sunset = { restored: true, caught: true, best: 100, defrags: 0, runs: 1 };
    p.pictures.galaxy = { restored: true, caught: true, best: 100, defrags: 0, runs: 1 };
    const s = quietSim('lake', p);
    clearAll(s);
    catchDeadPixel(s);
    s.restore();
    expect(s.profile.tools).toContain('smudge');
    expect(s.toolUnlocked(5)).toBe(true);
  });

  test('a chain reaction may set off 2 reds plus 2 per Chain Reaction level', () => {
    const s = quietSim();
    expect(s.chainLeft.get(newChain(s))).toBe(2);
    s.run.levels.d_chain = 3;
    s.recompute();
    expect(s.chainLeft.get(newChain(s))).toBe(8);
  });

  test('buying a node pays its cost and tools stay unlocked through resets', () => {
    const s = quietSim();
    s.run.inks.gray = 1e6;
    s.run.inks.red = 1e6;
    expect(s.buyNode('d_bomb')).toBe(false); // needs the core first
    s.run.levels.pick = 1;
    s.recompute();
    const n = RUN_NODE.d_bomb;
    for (const [id, lv] of n.req) s.run.levels[id] = Math.max(s.L(id), lv);
    expect(s.buyNode('d_bomb')).toBe(true);
    expect(s.profile.tools).toContain('bomb');
    clearTo(s, 30);
    s.defrag();
    s.choose('sunset');
    expect(s.L('d_bomb')).toBe(1);
    expect(s.L('pick')).toBe(0);
  });
});
