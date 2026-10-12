import { BIT_NODE, BIT_NODES, type BitNode, bitCost, SCANNER_R } from '../content/bitTree';
import { PICTURE, PICTURES, type PictureDef } from '../content/pictures';
import { CURS, type Cur } from '../content/pixels';
import { nodeCost, PER, RUN_NODE, RUN_NODES, type RunNode, TOOL_NODES } from '../content/runTree';
import { ERASER, LASER, TOOLS, TUNES } from '../content/tools';
import { freshSeed, Rng } from '../core/rng';
import { checkGoals } from './goals';
import { movePlayer, onPress, updateBombs, useTool } from './hand';
import { onCellEmptied, updateDeadPixel } from './hunt';
import {
  critterCost,
  freeSpot,
  gatherRigs,
  liquidTick,
  makeRig,
  nearestEmpty,
  rigAt,
  rigCost,
  rigSpot,
  syncCritters,
  updateCritter,
  updateMineLayer,
  updateRig,
  updateTransmuter,
} from './machines';
import { breakCell, gain, updateBlasts, updateShatter } from './mechanics';
import {
  type Blast,
  type Bomb,
  type Critter,
  type DeadPixel,
  type Inks,
  type PicProgress,
  type Profile,
  type Rig,
  type RunState,
  type SelectAllRun,
  type SimEvent,
  type SimInput,
  SRC,
  type Stats,
  zeroInks,
} from './types';
import { World } from './world';
import { genWorld, placeDeadPixel } from './worldgen';

/** The simulation runs on a fixed tick, separate from drawing. */
export const TICK = 1 / 60;

export const DEFAULT_DIET: Record<Cur, boolean> = { gray: true, red: false, blue: true, green: true, gold: false, shard: false };

export function newProfile(): Profile {
  return {
    bits: 0,
    bitsEarned: 0,
    bitLevels: { b_boot: 1 },
    defrags: 0,
    restores: 0,
    pictures: {},
    tools: ['eraser'],
    selectAll: false,
    fragments: [],
    goalIdx: 0,
    flags: { redBlast: false },
    lifetime: zeroInks(),
    autoRates: zeroInks(),
    stats: { playTime: 0, deleted: 0, explosions: 0, caught: 0 },
  };
}

export type NodeState = 'max' | 'locked' | 'afford' | 'part' | 'open';

export interface SimOptions {
  profile?: Profile;
  seed?: number;
  picture?: string;
  runSeed?: number;
  record?: boolean;
}

export class Sim {
  readonly rng: Rng;
  profile: Profile;
  run!: RunState;
  world!: World;
  pic!: PictureDef;
  readonly S = {} as Stats;
  events: SimEvent[] = [];
  /** Off for headless runs: nothing is drawn, so effects are not recorded. */
  record: boolean;
  readonly input: SimInput = { aimX: 0, aimY: 0, held: false, pressed: false, moveX: 0, moveY: 0 };
  autoWalk = true;
  player = { x: 0, y: 0, px: 0, py: 0 };
  critters: Critter[] = [];
  rigs: Rig[] = [];
  bombs: Bomb[] = [];
  blasts: Blast[] = [];
  shatterQ: { i: number; t: number; src: number }[] = [];
  dp: DeadPixel | null = null;
  sel: SelectAllRun | null = null;
  /** After Defrag or Restore, the run waits here until a picture is chosen. */
  choosing = false;
  carry: Inks | null = null;
  /** Cells the hand tool is touching this tick, for outlines. */
  targets: number[] = [];
  beam: { x1: number; y1: number; blocked: boolean } | null = null;
  /** Source of the change being applied, read when the Dead Pixel's neighbor opens. */
  cause: number = SRC.OTHER;
  /** Reds each live chain reaction may still set off, and the chain of the blast going off right now. */
  chainLeft = new Map<number, number>();
  chainSeq = 0;
  blastChain = -1;
  strikeT = 0;
  bombHold = 0;
  prismCd = 0;
  mineT = 6;
  smudgeT = 0;
  staticCd = 0;
  explosionCount = 0;
  growAcc = 0;
  transShown = 0;
  blockedCell = -1;
  autoWalking = false;
  rates = zeroInks();
  rateAcc = zeroInks();
  autoAcc = zeroInks();
  bfsMark = new Int32Array(0);
  bfsPrev = new Int32Array(0);
  bfsQ = new Int32Array(0);
  bfsStamp = 0;
  private liqAcc = 0;
  private slowT = 0;
  private rateT = 0;

  constructor(opts: SimOptions = {}) {
    this.rng = new Rng(opts.seed ?? freshSeed());
    this.record = opts.record ?? true;
    this.profile = opts.profile ?? newProfile();
    this.startRun(opts.picture ?? 'sunset', opts.runSeed);
  }

  rand(): number {
    return this.rng.next();
  }
  emit(e: SimEvent): void {
    if (this.record) this.events.push(e);
  }
  L(id: string): number {
    return this.run.levels[id] || 0;
  }
  B(id: string): number {
    return this.profile.bitLevels[id] || 0;
  }
  progress(pid: string): PicProgress {
    let p = this.profile.pictures[pid];
    if (!p) {
      p = { restored: false, caught: false, best: 0, defrags: 0, runs: 0 };
      this.profile.pictures[pid] = p;
    }
    return p;
  }
  reveal(): number {
    return this.world.reveal();
  }
  addBits(n: number): void {
    if (n <= 0) return;
    this.profile.bits += n;
    this.profile.bitsEarned += n;
    this.recompute();
  }

  /* ============================== runs ============================== */

  startRun(pid: string, seed?: number, carry?: Inks | null): void {
    const pic = PICTURE[pid] ?? PICTURES[0];
    this.pic = pic;
    const p = this.profile;
    const prog = this.progress(pic.id);
    prog.runs++;
    const runSeed = seed ?? this.rng.int(2147483647);
    const world = new World(pic.size, pic.size);
    world.hpMult = pic.hpMult;
    genWorld(world, runSeed, pic);
    world.initDerived();
    world.onEmpty = i => onCellEmptied(this, i);
    this.world = world;
    if (this.bfsMark.length !== world.n) {
      this.bfsMark = new Int32Array(world.n);
      this.bfsPrev = new Int32Array(world.n);
      this.bfsQ = new Int32Array(world.n);
    }
    const levels: Record<string, number> = { core: 1 };
    for (const node in TOOL_NODES) if (p.tools.includes(TOOL_NODES[node])) levels[node] = 1;
    const fw = this.B('b_firmware');
    if (fw) {
      levels.pick = 2 * fw;
      levels.press = 2 * fw;
    }
    const inc = this.B('b_incubator');
    if (inc) levels.s_hatch = 1;
    const pre = this.B('b_prefab');
    if (pre) levels.p_rig = 1;
    const inks = carry ? { ...carry } : zeroInks();
    const warm = this.B('b_warm');
    if (warm) inks.gray += 50 * 4 ** (warm - 1);
    this.run = {
      picture: pic.id,
      seed: runSeed,
      inks,
      totals: zeroInks(),
      levels,
      tool: ERASER,
      tune: 'any',
      diet: { ...DEFAULT_DIET },
      critterOwned: inc,
      transOn: false,
      transTarget: 'gray',
      bombCharges: 0,
      deleted: 0,
      explosions: 0,
      time: 0,
    };
    this.critters = [];
    this.rigs = [];
    this.bombs = [];
    this.blasts = [];
    this.chainLeft.clear();
    this.shatterQ = [];
    this.sel = null;
    this.choosing = false;
    this.carry = null;
    this.dp = null;
    if (!prog.caught) {
      const i = placeDeadPixel(world, runSeed, pic);
      if (i >= 0) this.dp = { i, state: 'hidden', t: 0 };
    }
    const c = world.w / 2;
    this.player = { x: c, y: c, px: c, py: c };
    this.strikeT = 0;
    this.bombHold = 0;
    this.prismCd = 0;
    this.mineT = 6;
    this.smudgeT = 0;
    this.explosionCount = 0;
    this.growAcc = 0;
    this.recompute();
    this.run.bombCharges = this.S.bombMax;
    syncCritters(this);
    for (let k = 0; k < pre; k++) {
      const i = rigSpot(this, 4, c, c);
      const j = i >= 0 ? i : freeSpot(this);
      if (j >= 0) this.rigs.push(makeRig(j % world.w, (j / world.w) | 0));
    }
    // a world from a fresh seed should never place the player in rock
    const pi = nearestEmpty(this, Math.floor(c), Math.floor(c));
    if (world.cells[Math.floor(c) * world.w + Math.floor(c)]) {
      this.player.x = this.player.px = (pi % world.w) + 0.5;
      this.player.y = this.player.py = ((pi / world.w) | 0) + 0.5;
    }
  }

  /** Pictures you can open: every restored one plus the next one in the folder. */
  choices(): PictureDef[] {
    const out: PictureDef[] = [];
    for (const p of PICTURES) {
      out.push(p);
      if (!this.profile.pictures[p.id]?.restored) break;
    }
    return out;
  }

  /** Every reset pauses on the gallery: spend Bits first (some apply when a run starts), then pick the next picture. */
  private endRun(): void {
    const carry = zeroInks();
    if (this.S.keep > 0) for (const c of CURS) carry[c] = Math.floor(this.run.inks[c] * this.S.keep);
    this.choosing = true;
    this.carry = carry;
    this.input.held = false;
  }

  /** Leave this run for nothing, to open another picture. */
  abandon(): boolean {
    if (this.choosing) return false;
    this.choosing = true;
    this.carry = zeroInks();
    this.input.held = false;
    return true;
  }

  choose(pid: string): boolean {
    if (!this.choosing || !this.choices().some(p => p.id === pid)) return false;
    this.startRun(pid, undefined, this.carry);
    return true;
  }

  defragGain(): number {
    return Math.floor(Math.max(0, this.reveal() - 10) * this.pic.bitMult * this.S.bitGain);
  }
  canDefrag(): boolean {
    return !this.choosing && !this.sel && this.reveal() >= this.S.defragAt;
  }
  /** Wipe the run for Bits. Returns the Bits gained, or -1 when Defrag is not open yet. */
  defrag(): number {
    if (!this.canDefrag()) return -1;
    const g = this.defragGain();
    this.profile.defrags++;
    this.progress(this.pic.id).defrags++;
    this.addBits(g);
    this.endRun();
    return g;
  }

  restoreGain(): number {
    return Math.floor(90 * this.pic.bitMult * this.S.bitGain);
  }
  canRestore(): boolean {
    return !this.choosing && !this.sel && !this.dp && this.world.emptyCount >= this.world.n && !this.progress(this.pic.id).restored;
  }
  /** Restore a fully revealed picture: full Bits and the picture's perk. Returns the Bits gained, or -1. */
  restore(): number {
    if (!this.canRestore()) return -1;
    const g = this.restoreGain();
    const prog = this.progress(this.pic.id);
    prog.restored = true;
    prog.best = 100;
    this.profile.restores++;
    if (this.pic.id === 'lake' && !this.profile.tools.includes('smudge')) this.profile.tools.push('smudge');
    this.addBits(g);
    this.emit({ k: 'note', id: 'restored', a: this.pic.id });
    this.endRun();
    return g;
  }

  selectAllBlock(): 'locked' | 'busy' | 'early' | 'dp' | null {
    if (!this.profile.selectAll) return 'locked';
    if (this.sel || this.choosing || this.world.emptyCount >= this.world.n) return 'busy';
    if (this.reveal() < this.S.selectAt) return 'early';
    if (this.dp) return 'dp';
    return null;
  }
  /** Start the finishing sweep. Returns why it cannot start, or null. */
  selectAll(): 'locked' | 'busy' | 'early' | 'dp' | null {
    const why = this.selectAllBlock();
    if (why) return why;
    const w = this.world;
    const x = Math.floor(this.player.x);
    const y = Math.floor(this.player.y);
    const max = Math.max(x, w.w - 1 - x, y, w.h - 1 - y);
    this.sel = { x, y, t: 0, dur: 1.6, done: -1, max };
    this.input.held = false;
    this.emit({ k: 'sfx', id: 'select' });
    return null;
  }

  private sweepRing(cx: number, cy: number, d: number): void {
    const w = this.world;
    const visit = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h) return;
      const i = y * w.w + x;
      if (w.cells[i]) breakCell(this, i, SRC.SELECT);
    };
    if (d === 0) {
      visit(cx, cy);
      return;
    }
    for (let x = cx - d; x <= cx + d; x++) {
      visit(x, cy - d);
      visit(x, cy + d);
    }
    for (let y = cy - d + 1; y <= cy + d - 1; y++) {
      visit(cx - d, y);
      visit(cx + d, y);
    }
  }

  private updateSelectAll(dt: number): void {
    const sel = this.sel as SelectAllRun;
    sel.t += dt;
    const r = Math.min(sel.max, Math.floor((sel.t / sel.dur) * sel.max));
    for (let d = sel.done + 1; d <= r; d++) this.sweepRing(sel.x, sel.y, d);
    sel.done = Math.max(sel.done, r);
    if (sel.t >= sel.dur) {
      const w = this.world;
      for (let i = 0; i < w.n; i++) if (w.cells[i]) breakCell(this, i, SRC.SELECT);
      this.sel = null;
      this.emit({ k: 'selectDone' });
    }
  }

  /* ============================== the tick ============================== */

  step(dt: number): void {
    if (this.choosing) return;
    const p = this.profile;
    const run = this.run;
    const S = this.S;
    p.stats.playTime += dt;
    run.time += dt;
    this.player.px = this.player.x;
    this.player.py = this.player.y;
    movePlayer(this, dt);
    this.targets.length = 0;
    this.beam = null;
    this.staticCd -= dt;
    if (this.sel) {
      this.updateSelectAll(dt);
      this.input.pressed = false;
    } else {
      if (this.input.pressed) onPress(this);
      this.input.pressed = false;
      if (this.input.held) useTool(this, dt);
      else this.strikeT = 0;
    }
    if (S.bombMax) run.bombCharges = Math.min(S.bombMax, run.bombCharges + dt / S.bombRegen);
    this.prismCd = Math.max(0, this.prismCd - dt);
    updateBlasts(this, dt);
    updateBombs(this, dt);
    updateShatter(this, dt);
    updateMineLayer(this, dt);
    updateTransmuter(this, dt);
    for (const c of this.critters) updateCritter(this, c, dt);
    for (const r of this.rigs) updateRig(this, r, dt);
    if (!this.sel) {
      this.liqAcc += dt;
      while (this.liqAcc >= 0.05) {
        this.liqAcc -= 0.05;
        liquidTick(this);
      }
    }
    updateDeadPixel(this, dt);
    this.rateT += dt;
    if (this.rateT >= 1) {
      for (const c of CURS) {
        this.rates[c] = this.rates[c] * 0.6 + (this.rateAcc[c] / this.rateT) * 0.4;
        p.autoRates[c] = p.autoRates[c] * 0.8 + (this.autoAcc[c] / this.rateT) * 0.2;
        this.rateAcc[c] = 0;
        this.autoAcc[c] = 0;
      }
      this.rateT = 0;
    }
    this.slowT += dt;
    if (this.slowT >= 0.5) {
      this.slowT = 0;
      this.slowTick();
    }
  }

  private slowTick(): void {
    const rv = this.reveal();
    const prog = this.progress(this.pic.id);
    if (rv > prog.best) prog.best = rv;
    if (!this.profile.selectAll && rv >= 90) {
      this.profile.selectAll = true;
      this.emit({ k: 'note', id: 'selectAllUnlocked' });
    }
    if (this.S.turbo && this.run.time >= this.B('b_turbo') * 180) {
      this.recompute();
      this.emit({ k: 'note', id: 'turboOver' });
    }
    checkGoals(this);
  }

  /* ============================== derived stats ============================== */

  recompute(): void {
    const L = (id: string): number => this.run.levels[id] || 0;
    const B = (id: string): number => this.profile.bitLevels[id] || 0;
    const S = this.S;
    const pics = this.profile.pictures;
    const turboT = B('b_turbo') * 180;
    const turbo = this.run.time < turboT ? 2 : 1;
    S.turbo = turbo > 1;
    S.turboLeft = Math.max(0, turboT - this.run.time);
    const bitInk = 1 + 0.02 * this.profile.bitsEarned;
    const over = PER.overclock ** L('overclock') * 1.25 ** B('b_clock') * turbo;
    S.pickDps = 3 * PER.pick ** L('pick') * over;
    S.pickHit = S.pickDps / 8;
    S.brushHit = S.pickHit * 0.45;
    S.brushR = 1 + 0.5 * L('widebit');
    S.reach = 3 + 0.75 * L('reach');
    S.speed = 6.5 * (1 + 0.15 * L('speed'));
    S.inkMult = PER.press ** L('press') * bitInk * 1.25 ** B('b_cache') * turbo * this.pic.yieldMult;
    S.lucky = 0.04 * L('lucky');
    S.echo = 0.06 * L('echo');
    S.crit = 0.03 * L('p_crit') + 0.03 * B('b_ecc') + (pics.galaxy?.restored ? 0.05 : 0);
    S.bombR = 3 + 0.5 * L('d_radius');
    S.bombDmg = 30 * PER.payload ** L('d_payload') * over;
    S.bombMax = L('d_bomb') ? 2 + L('d_bag') : 0;
    S.bombRegen = 9 * 0.85 ** L('d_fuse');
    S.redR = 2 + 0.25 * L('d_chain') + (pics.sunset?.restored ? 1 : 0);
    S.redDmg = 8 * 1.4 ** L('d_chain') * over;
    S.chainMax = 2 + 2 * L('d_chain');
    S.blastYield = 1 + 0.3 * L('d_yield');
    S.sympa = L('d_sympa') > 0;
    S.nova = L('d_nova') > 0;
    S.mineLayer = L('d_minelayer');
    S.mineInterval = 10 * 0.85 ** Math.max(0, S.mineLayer - 1);
    S.laserDps = S.pickDps * 0.8 * PER.focus ** L('p_focus');
    S.pierce = 2 + L('p_pierce');
    S.laserRange = S.reach + 6 + 3 * L('p_range');
    S.surgical = L('p_surgical') > 0;
    S.appraise = 1 + 0.5 * L('p_appraise');
    S.rigs = L('p_rig') > 0;
    S.machine = 1.25 ** B('b_daemon');
    S.rigDps = 2 * PER.rigpower ** L('p_rigpower') * over * S.machine;
    S.rigR = 3 + L('p_rigrange');
    S.righop = L('p_righop') > 0;
    S.midas = L('p_midas') > 0;
    S.hatch = L('s_hatch') > 0;
    S.critDmg = PER.jaws ** L('s_jaws') * over * S.machine;
    S.critSpeed = 3 * (1 + 0.2 * L('s_legs'));
    S.critBiteRate = 2 * (1 + 0.2 * L('s_legs'));
    S.hive = L('s_hive') > 0;
    S.symb = 0.015 * L('s_symb');
    S.growthMult = 1.6 ** L('s_growth');
    S.greenMult = 1 + 0.4 * L('s_growth');
    S.brood = 0.85 ** L('s_brood');
    S.queen = L('s_queen') > 0;
    S.prismR = 1.5 + 0.5 * L('a_refract');
    S.prismCd = 4 * 0.8 ** L('a_cool');
    S.prismSoft = 0.5 * PER.sear ** L('a_sear');
    S.purity = L('a_purity');
    S.blueMult = 1 + 0.5 * L('a_liquid');
    S.flowMult = 1 + 0.2 * L('a_liquid');
    S.trans = L('a_trans') > 0;
    S.transPct = 0.01 * 1.6 ** L('a_alembic');
    S.transRatio = 6 * 0.85 ** L('a_alembic');
    S.shardBonus = L('a_glitch');
    S.scrambleR = 2 + 0.5 * L('a_glitch');
    S.coloredMult = L('a_philo') > 0 ? 2 : 1;
    S.detonator = L('x_detonator') > 0;
    S.tracker = L('x_tracker') > 0;
    S.mutagen = L('x_mutagen') > 0;
    S.alchblast = L('x_alchblast') > 0;
    S.smudgeHit = S.pickHit * 0.25;
    S.smudgeR = 2.5;
    S.bitGain = 1 + 0.15 * B('b_compress');
    S.defragAt = 20 - 2.5 * B('b_quick');
    S.selectAt = 90 - 5 * B('b_marquee');
    S.scannerR = SCANNER_R[B('b_scanner')] ?? 0;
    S.sense = B('b_sense') > 0;
    S.freezeT = 10 + 4 * B('b_freeze');
    S.bounty = 1 + 0.5 * B('b_bounty');
    S.offlineEff = 0.5 + 0.1 * B('b_bgproc');
    S.offlineCap = (8 + 4 * B('b_sleep')) * 3600;
    S.keep = 0.05 * B('b_swap');
    if (!S.hive) this.run.diet = { ...DEFAULT_DIET };
    this.run.bombCharges = Math.min(this.run.bombCharges, S.bombMax);
  }

  /* ============================== tools ============================== */

  toolUnlocked(k: number): boolean {
    return k === ERASER || this.profile.tools.includes(TOOLS[k]?.id);
  }
  selectTool(k: number): 'locked' | 'retune' | null {
    if (!TOOLS[k] || !this.toolUnlocked(k)) return 'locked';
    if (k === LASER && this.run.tool === LASER) {
      this.cycleTune(1);
      return 'retune';
    }
    this.run.tool = k;
    this.strikeT = 0;
    return null;
  }
  cycleTune(dir: number): void {
    if (!this.toolUnlocked(LASER)) return;
    const i = TUNES.indexOf(this.run.tune);
    this.run.tune = TUNES[(i + dir + TUNES.length) % TUNES.length];
    this.run.tool = LASER;
  }

  /* ============================== economy ============================== */

  canAfford(cost: Partial<Record<Cur, number>>): boolean {
    for (const k in cost) if (this.run.inks[k as Cur] < (cost[k as Cur] as number) - 1e-9) return false;
    return true;
  }
  pay(cost: Partial<Record<Cur, number>>): void {
    for (const k in cost) this.run.inks[k as Cur] = Math.max(0, this.run.inks[k as Cur] - (cost[k as Cur] as number));
  }

  reqMet(n: RunNode): boolean {
    return n.req.every(([id, lv]) => this.L(id) >= lv);
  }
  nodeState(n: RunNode): NodeState {
    const l = this.L(n.id);
    if (l >= n.max) return 'max';
    if (!this.reqMet(n)) return 'locked';
    if (this.canAfford(nodeCost(n.cost, l))) return 'afford';
    return l > 0 ? 'part' : 'open';
  }
  countAffordable(): number {
    let k = 0;
    for (const n of RUN_NODES) if (this.nodeState(n) === 'afford') k++;
    return k;
  }
  buyNode(id: string): boolean {
    const n = RUN_NODE[id];
    if (!n || this.choosing) return false;
    const l = this.L(id);
    if (l >= n.max || !this.reqMet(n)) return false;
    const cost = nodeCost(n.cost, l);
    if (!this.canAfford(cost)) return false;
    this.pay(cost);
    this.run.levels[id] = l + 1;
    this.recompute();
    if (n.tool != null) {
      const tid = TOOLS[n.tool].id;
      if (!this.profile.tools.includes(tid)) this.profile.tools.push(tid);
      this.emit({ k: 'note', id: 'tool', a: n.tool });
      if (id === 'd_bomb') this.run.bombCharges = this.S.bombMax;
    }
    if (id === 's_hatch') {
      this.run.critterOwned = Math.max(1, this.run.critterOwned);
      syncCritters(this);
      this.emit({ k: 'note', id: 'firstBug' });
    }
    if (id === 's_queen') syncCritters(this);
    if (id === 'p_rig') this.emit({ k: 'note', id: 'rigs' });
    if (id === 'a_trans') this.emit({ k: 'note', id: 'trans' });
    if (id === 'd_minelayer' && l === 0) this.mineT = 2;
    return true;
  }

  bitReqMet(n: BitNode): boolean {
    if (n.needs === 'selectAll' && !this.profile.selectAll) return false;
    return n.req.every(([id, lv]) => this.B(id) >= lv);
  }
  bitNodeState(n: BitNode): NodeState {
    const l = this.B(n.id);
    if (l >= n.max) return 'max';
    if (!this.bitReqMet(n)) return 'locked';
    if (this.profile.bits >= bitCost(n, l)) return 'afford';
    return l > 0 ? 'part' : 'open';
  }
  countBitAffordable(): number {
    let k = 0;
    for (const n of BIT_NODES) if (this.bitNodeState(n) === 'afford') k++;
    return k;
  }
  buyBitNode(id: string): boolean {
    const n = BIT_NODE[id];
    if (!n) return false;
    const l = this.B(id);
    if (l >= n.max || !this.bitReqMet(n)) return false;
    const cost = bitCost(n, l);
    if (this.profile.bits < cost) return false;
    this.profile.bits -= cost;
    this.profile.bitLevels[id] = l + 1;
    this.recompute();
    return true;
  }

  /* ============================== machines ============================== */

  critterCost(): { green: number; gray: number } {
    return critterCost(this);
  }
  hatch(): boolean {
    const cost = critterCost(this);
    if (!this.S.hatch || !this.canAfford(cost)) return false;
    this.pay(cost);
    this.run.critterOwned++;
    syncCritters(this);
    return true;
  }
  rigCost(): { gold: number; gray: number } {
    return rigCost(this);
  }
  /** Build a rig where you stand. Returns false if you cannot pay, or 'room' if there is no space. */
  buildRig(): boolean | 'room' {
    const cost = rigCost(this);
    if (!this.S.rigs || !this.canAfford(cost)) return false;
    const w = this.world;
    let j = nearestEmpty(this, Math.floor(this.player.x), Math.floor(this.player.y));
    if (w.cells[j] || rigAt(this, j % w.w, (j / w.w) | 0, 1)) j = rigSpot(this, 6);
    if (j < 0) j = freeSpot(this);
    if (j < 0) {
      this.emit({ k: 'note', id: 'noRigRoom' });
      return 'room';
    }
    const x = j % w.w;
    const y = (j / w.w) | 0;
    this.pay(cost);
    this.rigs.push(makeRig(x, y));
    this.emit({ k: 'spark', x: x + 0.5, y: y + 0.5, c: '#2bf0ff', n: 10 });
    return true;
  }
  gatherRigs(): void {
    if (this.rigs.length) gatherRigs(this);
  }
  toggleDiet(c: Cur): boolean {
    if (!this.S.hive) return false;
    this.run.diet[c] = !this.run.diet[c];
    for (const cr of this.critters) {
      cr.bite = -1;
      cr.path.length = 0;
    }
    for (const r of this.rigs) r.target = -1;
    return true;
  }

  /* ============================== offline ============================== */

  /** Machines kept working while the game was closed. Returns what they earned. */
  grantOffline(sec: number): { t: number; got: Partial<Record<Cur, number>> } {
    const t = Math.min(sec, this.S.offlineCap);
    const got: Partial<Record<Cur, number>> = {};
    for (const c of CURS) {
      const g = this.profile.autoRates[c] * t * this.S.offlineEff;
      if (g >= 1) {
        gain(this, c, g, false);
        got[c] = g;
      }
    }
    return { t, got };
  }
}
