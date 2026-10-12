import { describe, expect, test } from 'bun:test';
import { E, NTYPES } from '../../src/content/pixels';
import { DEFAULT_SETTINGS, loadSave, makeSave, rleDecode, rleEncode } from '../../src/sim/save';
import { Sim } from '../../src/sim/sim';
import { quietSim, stepFor } from './helpers';

const viaJson = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

describe('saves', () => {
  test('run-length encoding round-trips a world', () => {
    const s = quietSim('galaxy');
    const enc = rleEncode(s.world.cells);
    expect(rleDecode(enc, s.world.n)).toEqual(s.world.cells);
    // wrong length or garbage is refused
    expect(rleDecode(enc, s.world.n + 1)).toBeNull();
    expect(rleDecode('%%%', 10)).toBeNull();
  });

  test('unknown pixel types decode as empty', () => {
    const cells = new Uint8Array([1, 1, 200, 3]);
    expect(Array.from(rleDecode(rleEncode(cells), 4, NTYPES - 1) as Uint8Array)).toEqual([1, 1, E, 3]);
  });

  test('a save restores the profile, the run and the world', () => {
    const s = quietSim();
    s.input.held = true;
    s.input.aimX = s.player.x + 3;
    s.input.aimY = s.player.y;
    stepFor(s, 3);
    s.run.inks.gray = 1234;
    s.run.levels.pick = 4;
    s.profile.bits = 77;
    s.profile.bitsEarned = 90;
    s.profile.bitLevels.b_cache = 2;
    s.recompute();
    const settings = { ...DEFAULT_SETTINGS, track: 3, sfxVol: 0.2 };
    const out = loadSave(viaJson(makeSave(s, settings, 12)));
    expect(out).not.toBeNull();
    const t = (out as NonNullable<typeof out>).sim;
    expect(Buffer.from(t.world.cells).equals(Buffer.from(s.world.cells))).toBe(true);
    expect(t.run.inks.gray).toBe(1234);
    expect(t.L('pick')).toBe(4);
    expect(t.profile.bits).toBe(77);
    expect(t.B('b_cache')).toBe(2);
    expect(t.S.inkMult).toBeCloseTo(s.S.inkMult, 9);
    expect(t.dp?.i).toBe(s.dp?.i);
    expect(t.progress('sunset').runs).toBe(1);
    expect(out?.settings.track).toBe(3);
    expect(out?.zoom).toBe(12);
    expect(out?.migrated).toBe(false);
  });

  test('a save made on the gallery chooser comes back on the chooser', () => {
    const s = quietSim();
    s.abandon();
    const t = loadSave(viaJson(makeSave(s, DEFAULT_SETTINGS, 8)))?.sim as Sim;
    expect(t.choosing).toBe(true);
    expect(t.choose('sunset')).toBe(true);
  });

  test('broken data is refused rather than half-loaded', () => {
    expect(loadSave(null)).toBeNull();
    expect(loadSave({ v: 9 })).toBeNull();
    expect(loadSave({ v: 2, cells: 42 })).toBeNull();
  });

  test('hostile numbers are clamped', () => {
    const s = quietSim();
    const raw = viaJson(makeSave(s, DEFAULT_SETTINGS, 8)) as Record<string, any>;
    raw.profile.bits = -50;
    raw.run.levels.pick = 9999;
    raw.run.levels.nope = 3;
    raw.run.inks.gray = 'lots';
    const t = loadSave(raw)?.sim as Sim;
    expect(t.profile.bits).toBe(0);
    expect(t.L('pick')).toBe(20);
    expect(t.L('nope')).toBe(0);
    expect(t.run.inks.gray).toBe(0);
  });

  test('an MVP save becomes a v0.2 profile and keeps its run', () => {
    const mvp = new Sim({ seed: 3, runSeed: 777, record: false });
    // dig a little so the carried-over world differs from a fresh one
    for (let i = 0; i < 40; i++) mvp.world.setCell((mvp.world.h >> 1) * mvp.world.w + (mvp.world.w >> 1) + i, E);
    const v1 = {
      v: 1,
      t: Date.now() - 60_000,
      seed: 777,
      imageIdx: 0,
      defrags: 2,
      bits: 42,
      inks: { gray: 500, red: 20, blue: 0, green: 0, gold: 3, shard: 0 },
      totals: {},
      lifetime: { gray: 9000 },
      autoRates: {},
      levels: { core: 1, pick: 3, drill: 1, d_bomb: 1 },
      tool: 2,
      laserTune: 'any',
      diet: {},
      critterOwned: 0,
      transOn: false,
      transTarget: 'blue',
      bombCharges: 2,
      goalIdx: 3,
      goalFlags: { redBlast: true },
      stats: { playTime: 1800, deleted: 4000, explosions: 12 },
      settings: { music: false, track: 2 },
      zoom: 10,
      cells: rleEncode(mvp.world.cells),
      player: [96, 96],
      rigs: [],
    };
    const out = loadSave(viaJson(v1));
    expect(out).not.toBeNull();
    const o = out as NonNullable<typeof out>;
    expect(o.migrated).toBe(true);
    const t = o.sim;
    expect(t.profile.bits).toBe(42);
    expect(t.profile.defrags).toBe(2);
    expect(t.profile.tools).toEqual(expect.arrayContaining(['eraser', 'brush', 'bomb']));
    expect(t.L('pick')).toBe(3);
    expect(t.run.inks.gray).toBe(500);
    expect(t.run.transTarget).toBe('blue');
    expect(Buffer.from(t.world.cells).equals(Buffer.from(mvp.world.cells))).toBe(true);
    expect(t.profile.stats.playTime).toBe(1800);
    expect(o.settings.music).toBe(false);
    expect(o.settings.track).toBe(2);
  });

  test('an MVP save from a later picture starts fresh on the first one', () => {
    const v1 = { v: 1, t: Date.now(), seed: 5, imageIdx: 2, bits: 10, cells: 'AAAA', levels: { pick: 5 } };
    const t = loadSave(viaJson(v1))?.sim as Sim;
    expect(t.pic.id).toBe('sunset');
    expect(t.profile.bits).toBe(10);
    expect(t.L('pick')).toBe(0);
    expect(t.world.emptyCount).toBeLessThan(t.world.n * 0.05);
  });
});
