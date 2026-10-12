import { describe, expect, test } from 'bun:test';
import { BLUE, E, GOLD, GREEN, ICE, isGray, RED, STATIC } from '../../src/content/pixels';
import { BRUSH, PRISM } from '../../src/content/tools';
import { updateDeadPixel } from '../../src/sim/hunt';
import { transSource, updateTransmuter } from '../../src/sim/machines';
import { breakCell, damageCell, updateShatter } from '../../src/sim/mechanics';
import { newProfile } from '../../src/sim/sim';
import { SRC } from '../../src/sim/types';
import { cluster, quietSim } from './helpers';

const unlockedTo = (n: number) => {
  const p = newProfile();
  const ids = ['sunset', 'galaxy', 'lake'];
  for (let k = 0; k < n; k++) p.pictures[ids[k]] = { restored: true, caught: true, best: 100, defrags: 0, runs: 1 };
  return p;
};

describe('Dead Pixel hunt', () => {
  test('opening its wall by hand exposes it for a few seconds', () => {
    const s = quietSim();
    const dp = s.dp as NonNullable<typeof s.dp>;
    breakCell(s, dp.i - 1, SRC.PICK);
    expect(dp.state).toBe('exposed');
    expect(dp.t).toBeCloseTo(s.S.freezeT, 6);
    // it dives back in when the timer runs out
    const at = dp.i;
    updateDeadPixel(s, s.S.freezeT + 0.1);
    expect(dp.state).toBe('hidden');
    expect(dp.i).not.toBe(at);
    expect(s.world.isBuried(dp.i)).toBe(true);
  });

  test('blasts and machines make it flee instead', () => {
    for (const src of [SRC.BLAST, SRC.CRITTER, SRC.RIG]) {
      const s = quietSim();
      const dp = s.dp as NonNullable<typeof s.dp>;
      const at = dp.i;
      breakCell(s, at + s.world.w, src);
      expect(dp.state).toBe('hidden');
      expect(dp.i).not.toBe(at);
    }
  });

  test('flowing blue does not disturb it', () => {
    const s = quietSim();
    const dp = s.dp as NonNullable<typeof s.dp>;
    const at = dp.i;
    s.cause = SRC.LIQUID;
    s.world.setCell(at + 1, E);
    expect(dp.state).toBe('hidden');
    expect(dp.i).toBe(at);
  });

  test('nothing damages it', () => {
    const s = quietSim();
    const i = (s.dp as NonNullable<typeof s.dp>).i;
    expect(damageCell(s, i, 1e12, SRC.BLAST)).toBe(false);
    expect(s.world.cells[i]).not.toBe(E);
  });
});

describe('special pixels', () => {
  test('static jumps away from a hit that does not delete it', () => {
    const s = quietSim('galaxy', unlockedTo(1));
    const w = s.world;
    const i = w.statics.items[0];
    const count = w.statics.size;
    expect(damageCell(s, i, w.hp[i] * 0.5, SRC.PICK)).toBe(false);
    expect(w.statics.size).toBe(count);
    // it either swapped places with a solid pixel or healed in place
    if (w.cells[i] === STATIC) expect(w.hp[i]).toBeCloseTo(w.maxHp(STATIC, i), 4);
    else expect(w.cells[i]).not.toBe(E);
  });

  test('one killing hit deletes static and pays shards', () => {
    const s = quietSim('galaxy', unlockedTo(1));
    const w = s.world;
    const i = w.statics.items[0];
    expect(damageCell(s, i, w.hp[i], SRC.PICK)).toBe(true);
    expect(w.cells[i]).toBe(E);
    expect(s.run.inks.shard).toBeGreaterThan(0);
  });

  test('breaking one ice pixel shatters its whole cluster', () => {
    const s = quietSim('lake', unlockedTo(2));
    const w = s.world;
    let start = -1;
    for (let i = 0; i < w.n && start < 0; i++) if (w.cells[i] === ICE && cluster(s, i, ICE).length >= 6) start = i;
    expect(start).toBeGreaterThanOrEqual(0);
    const cells = cluster(s, start, ICE);
    breakCell(s, start, SRC.PICK);
    updateShatter(s, 30);
    for (const i of cells) expect(w.cells[i]).toBe(E);
  });
});

describe('Alchemy', () => {
  test('the Prism colors gray rock, cracks it and banks its gray ink', () => {
    const s = quietSim();
    const w = s.world;
    s.profile.tools.push('prism', 'brush');
    s.run.levels.a_prism = 1;
    s.run.levels.a_sear = 2;
    s.recompute();
    s.run.tool = PRISM;
    // aim at the nearest gray rock to the right of the player
    const y = Math.floor(s.player.y);
    let x = Math.floor(s.player.x);
    while (!isGray(w.cells[y * w.w + x])) x++;
    s.input.aimX = x + 0.5;
    s.input.aimY = y + 0.5;
    s.input.held = true;
    const before = w.cells.slice();
    s.step(1 / 60);
    let colored = 0;
    for (let i = 0; i < w.n; i++) {
      if (!isGray(before[i]) || w.cells[i] === before[i] || !w.cells[i]) continue;
      expect([RED, BLUE, GREEN, GOLD, 9]).toContain(w.cells[i]);
      expect(w.hp[i]).toBeLessThanOrEqual(w.maxHp(w.cells[i], i) * s.S.prismSoft + 1e-6);
      colored++;
    }
    expect(colored).toBeGreaterThan(0);
    expect(s.run.inks.gray).toBeGreaterThan(0);
    expect(s.prismCd).toBeGreaterThan(0);
    expect(s.S.prismSoft).toBeCloseTo(0.5 * 0.72 ** 2, 6);
    expect(s.toolUnlocked(BRUSH)).toBe(true);
  });

  test('the transmuter draws from whichever ink there is most of', () => {
    const s = quietSim();
    s.run.levels.a_trans = 1;
    s.recompute();
    s.run.transOn = true;
    s.run.transTarget = 'gray';
    s.run.inks.red = 1000;
    s.run.inks.blue = 300;
    expect(transSource(s)).toBe('red');
    updateTransmuter(s, 1);
    expect(s.run.inks.red).toBeLessThan(1000);
    expect(s.run.inks.blue).toBe(300);
    expect(s.run.inks.gray).toBeGreaterThan(0);
    // never from the ink it makes
    s.run.transTarget = 'red';
    expect(transSource(s)).toBe('blue');
  });
});
