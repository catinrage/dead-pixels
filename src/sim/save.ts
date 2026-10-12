import { BIT_NODE } from '../content/bitTree';
import { PICTURE } from '../content/pictures';
import { CURS, NTYPES, TRANS_CURS } from '../content/pixels';
import { RUN_NODE, TOOL_NODES } from '../content/runTree';
import { TOOLS, TUNES, type Tune } from '../content/tools';
import { clamp, num } from '../core/num';
import { GOALS } from './goals';
import { makeRig, syncCritters } from './machines';
import { newProfile, Sim } from './sim';
import { type Inks, type Profile, zeroInks } from './types';

/** Saves are versioned JSON. Version 1 was the single-file MVP; it migrates into a v0.2 profile. */

export const SAVE_KEY = 'deadpixels.save.v2';
export const MVP_SAVE_KEY = 'deadpixels.save.v1';

export interface Settings {
  music: boolean;
  musicVol: number;
  track: number;
  sfx: boolean;
  sfxVol: number;
  autoWalk: boolean;
  shake: boolean;
}

export interface SaveV2 {
  v: 2;
  t: number;
  profile: Profile;
  run: Sim['run'];
  cells: string;
  player: [number, number];
  rigs: [number, number][];
  dp: { i: number; state: 'hidden' | 'exposed'; t: number } | null;
  choosing: boolean;
  carry: Inks | null;
  settings: Settings;
  zoom: number;
}

function b64FromBytes(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.slice(i, i + 0x8000));
  return btoa(s);
}

export function rleEncode(arr: Uint8Array): string {
  const out: number[] = [];
  for (let i = 0; i < arr.length; ) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 255) n++;
    out.push(v, n);
    i += n;
  }
  return b64FromBytes(out);
}

export function rleDecode(b64: string, n: number, maxType = NTYPES - 1): Uint8Array | null {
  let s: string;
  try {
    s = atob(b64);
  } catch {
    return null;
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i + 1 < s.length && o < n; i += 2) {
    const v = s.charCodeAt(i);
    const k = s.charCodeAt(i + 1);
    out.fill(v > maxType ? 0 : v, o, Math.min(n, o + k));
    o += k;
  }
  return o === n ? out : null;
}

export function makeSave(s: Sim, settings: Settings, zoom: number): SaveV2 {
  return {
    v: 2,
    t: Date.now(),
    profile: structuredClone(s.profile),
    run: structuredClone(s.run),
    cells: rleEncode(s.world.cells),
    player: [s.player.x, s.player.y],
    rigs: s.rigs.map(r => [r.x, r.y]),
    dp: s.dp ? { ...s.dp, t: Number.isFinite(s.dp.t) ? s.dp.t : -1 } : null,
    choosing: s.choosing,
    carry: s.carry ? { ...s.carry } : null,
    settings: { ...settings },
    zoom,
  };
}

const inks = (v: unknown): Inks => {
  const out = zeroInks();
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  for (const c of CURS) out[c] = Math.max(0, num(o[c], 0));
  return out;
};

function cleanProfile(d: unknown): Profile {
  const p = newProfile();
  const o = (d && typeof d === 'object' ? d : {}) as Record<string, any>;
  p.bits = Math.max(0, num(o.bits, 0));
  p.bitsEarned = Math.max(p.bits, num(o.bitsEarned, p.bits));
  if (o.bitLevels && typeof o.bitLevels === 'object')
    for (const id in o.bitLevels) if (BIT_NODE[id]) p.bitLevels[id] = clamp(num(o.bitLevels[id], 0) | 0, 0, BIT_NODE[id].max);
  p.bitLevels.b_boot = 1;
  p.defrags = Math.max(0, num(o.defrags, 0) | 0);
  p.restores = Math.max(0, num(o.restores, 0) | 0);
  if (o.pictures && typeof o.pictures === 'object')
    for (const id in o.pictures) {
      if (!PICTURE[id]) continue;
      const q = o.pictures[id] || {};
      p.pictures[id] = {
        restored: !!q.restored,
        caught: !!q.caught,
        best: clamp(num(q.best, 0), 0, 100),
        defrags: num(q.defrags, 0) | 0,
        runs: num(q.runs, 0) | 0,
      };
    }
  const ids = new Set(TOOLS.map(t => t.id));
  p.tools = Array.isArray(o.tools)
    ? ['eraser', ...o.tools.filter((t: unknown) => typeof t === 'string' && ids.has(t) && t !== 'eraser')]
    : ['eraser'];
  p.selectAll = !!o.selectAll;
  p.fragments = Array.isArray(o.fragments) ? o.fragments.filter((f: unknown) => typeof f === 'string' && PICTURE[f as string]) : [];
  p.goalIdx = clamp(num(o.goalIdx, 0) | 0, 0, GOALS.length);
  p.flags.redBlast = !!o.flags?.redBlast;
  p.lifetime = inks(o.lifetime);
  p.autoRates = inks(o.autoRates);
  const st = o.stats || {};
  p.stats = { playTime: num(st.playTime, 0), deleted: num(st.deleted, 0), explosions: num(st.explosions, 0), caught: num(st.caught, 0) };
  return p;
}

export const DEFAULT_SETTINGS: Settings = { music: true, musicVol: 0.45, track: 1, sfx: true, sfxVol: 0.6, autoWalk: true, shake: true };

function cleanSettings(d: unknown, base: Settings): Settings {
  const out = { ...base };
  if (d && typeof d === 'object')
    for (const k in out) {
      const v = (d as Record<string, unknown>)[k];
      if (typeof v === typeof out[k as keyof Settings]) (out as Record<string, unknown>)[k] = v;
    }
  out.track = clamp(out.track | 0, 1, 4);
  return out;
}

export interface Loaded {
  sim: Sim;
  settings: Settings;
  zoom: number | null;
  /** Seconds since the save was written. */
  away: number;
  migrated: boolean;
}

/** Rebuild a simulation from a v2 save. Returns null if the data is unusable. */
export function loadSave(raw: unknown, base: Settings = DEFAULT_SETTINGS): Loaded | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, any>;
  if (d.v === 1) return migrateV1(d, base);
  if (d.v !== 2 || typeof d.cells !== 'string' || !d.run) return null;
  const profile = cleanProfile(d.profile);
  const r = d.run as Record<string, any>;
  const pid = PICTURE[r.picture] ? r.picture : 'sunset';
  const seed = num(r.seed, 1) | 0;
  const sim = new Sim({ profile, picture: pid, runSeed: seed });
  // startRun counted a run; this one was already counted when it began
  sim.progress(pid).runs = Math.max(1, sim.progress(pid).runs - 1);
  const run = sim.run;
  run.inks = inks(r.inks);
  run.totals = inks(r.totals);
  run.levels = { core: 1 };
  if (r.levels && typeof r.levels === 'object')
    for (const id in r.levels) if (RUN_NODE[id]) run.levels[id] = clamp(num(r.levels[id], 0) | 0, 0, RUN_NODE[id].max);
  run.levels.core = 1;
  for (const node in TOOL_NODES) if (profile.tools.includes(TOOL_NODES[node])) run.levels[node] = Math.max(1, run.levels[node] || 0);
  run.time = num(r.time, 0);
  run.deleted = num(r.deleted, 0);
  run.explosions = num(r.explosions, 0);
  sim.recompute();
  run.tool = clamp(num(r.tool, 0) | 0, 0, TOOLS.length - 1);
  if (!sim.toolUnlocked(run.tool)) run.tool = 0;
  run.tune = (TUNES as readonly string[]).includes(r.tune) ? (r.tune as Tune) : 'any';
  if (sim.S.hive && r.diet) for (const c of CURS) run.diet[c] = !!r.diet[c];
  run.critterOwned = Math.max(0, num(r.critterOwned, 0) | 0);
  run.transOn = !!r.transOn;
  run.transTarget = TRANS_CURS.includes(r.transTarget) ? r.transTarget : 'gray';
  const w = sim.world;
  const decoded = rleDecode(d.cells, w.n);
  if (decoded) {
    w.cells.set(decoded);
    w.initDerived();
  }
  sim.dp = null;
  if (d.dp && !sim.progress(pid).caught) {
    const i = num(d.dp.i, -1) | 0;
    if (i >= 0 && i < w.n && w.cells[i])
      sim.dp = {
        i,
        state: d.dp.state === 'exposed' ? 'exposed' : 'hidden',
        t: num(d.dp.t, 0) < 0 ? Number.POSITIVE_INFINITY : num(d.dp.t, 0),
      };
  }
  placePlayer(sim, d.player);
  sim.critters.length = 0;
  syncCritters(sim);
  sim.rigs.length = 0;
  if (Array.isArray(d.rigs) && sim.S.rigs)
    for (const rg of d.rigs.slice(0, 200))
      if (Array.isArray(rg)) sim.rigs.push(makeRig(clamp(rg[0] | 0, 0, w.w - 1), clamp(rg[1] | 0, 0, w.h - 1)));
  run.bombCharges = clamp(num(r.bombCharges, sim.S.bombMax), 0, sim.S.bombMax);
  if (d.choosing) {
    sim.choosing = true;
    sim.carry = d.carry ? inks(d.carry) : zeroInks();
  }
  return {
    sim,
    settings: cleanSettings(d.settings, base),
    zoom: typeof d.zoom === 'number' ? d.zoom : null,
    away: (Date.now() - num(d.t, Date.now())) / 1000,
    migrated: false,
  };
}

function placePlayer(sim: Sim, pp: unknown): void {
  const w = sim.world;
  const arr = Array.isArray(pp) ? pp : [w.w / 2, w.h / 2];
  const x = clamp(num(arr[0], w.w / 2), 1, w.w - 1);
  const y = clamp(num(arr[1], w.h / 2), 1, w.h - 1);
  sim.player.x = sim.player.px = x;
  sim.player.y = sim.player.py = y;
  if (w.cells[Math.floor(y) * w.w + Math.floor(x)]) {
    // standing inside rock: step out to the nearest open cell
    for (let r = 1; r < 40; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.floor(x) + dx;
          const yy = Math.floor(y) + dy;
          if (xx < 0 || yy < 0 || xx >= w.w || yy >= w.h || w.cells[yy * w.w + xx]) continue;
          sim.player.x = sim.player.px = xx + 0.5;
          sim.player.y = sim.player.py = yy + 0.5;
          return;
        }
  }
}

/**
 * The MVP saved one run with flat Bits. Bits carry over and become spendable, and the run carries over too
 * when it was on the first picture (the MVP's world format is the same).
 */
export function migrateV1(d: Record<string, any>, base: Settings): Loaded | null {
  if (typeof d.cells !== 'string') return null;
  const profile = newProfile();
  profile.bits = Math.max(0, num(d.bits, 0) | 0);
  profile.bitsEarned = profile.bits;
  profile.defrags = Math.max(0, num(d.defrags, 0) | 0);
  profile.lifetime = inks(d.lifetime);
  profile.autoRates = inks(d.autoRates);
  profile.flags.redBlast = !!d.goalFlags?.redBlast;
  const st = d.stats || {};
  profile.stats.playTime = num(st.playTime, 0);
  profile.stats.deleted = num(st.deleted, 0);
  profile.stats.explosions = num(st.explosions, 0);
  const lv = (d.levels || {}) as Record<string, unknown>;
  for (const node in TOOL_NODES) if (num(lv[node], 0) > 0) profile.tools.push(TOOL_NODES[node]);
  if (profile.defrags > 0) profile.goalIdx = GOALS.findIndex(g => g.id === 'bits');
  else profile.goalIdx = clamp(num(d.goalIdx, 0) | 0, 0, 6);
  const sameRun = (num(d.imageIdx, 0) | 0) === 0;
  const v2: Record<string, unknown> = {
    v: 2,
    t: num(d.t, Date.now()),
    profile,
    run: sameRun
      ? {
          picture: 'sunset',
          seed: num(d.seed, 1) | 0,
          inks: d.inks,
          totals: d.totals,
          levels: d.levels,
          tool: d.tool,
          tune: d.laserTune,
          diet: d.diet,
          critterOwned: d.critterOwned,
          transOn: d.transOn,
          transTarget: d.transTarget,
          bombCharges: d.bombCharges,
        }
      : { picture: 'sunset', seed: (Math.random() * 2147483647) | 0 },
    cells: sameRun ? d.cells : '',
    player: sameRun ? d.player : null,
    rigs: sameRun ? d.rigs : [],
    dp: null,
    settings: d.settings,
    zoom: d.zoom,
  };
  if (!sameRun) {
    const fresh = new Sim({ profile, picture: 'sunset' });
    v2.cells = rleEncode(fresh.world.cells);
    (v2.run as Record<string, unknown>).seed = fresh.run.seed;
  }
  const out = loadSave(v2, base);
  if (!out) return null;
  // the fresh Dead Pixel for this layout
  if (!out.sim.dp && !out.sim.progress('sunset').caught) {
    const fresh = new Sim({ profile: structuredClone(out.sim.profile), picture: 'sunset', runSeed: out.sim.run.seed });
    if (fresh.dp && out.sim.world.isBuried(fresh.dp.i)) out.sim.dp = { ...fresh.dp };
  }
  out.migrated = true;
  return out;
}
