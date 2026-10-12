import type { Cur } from '../content/pixels';
import type { Tune } from '../content/tools';

export type Inks = Record<Cur, number>;
export const zeroInks = (): Inks => ({ gray: 0, red: 0, blue: 0, green: 0, gold: 0, shard: 0 });

/** Where a change to the world came from. Hand sources can catch the Dead Pixel; machines and blasts scare it off. */
export const SRC = { PICK: 0, BRUSH: 1, LASER: 2, BLAST: 3, CRITTER: 4, RIG: 5, OTHER: 6, LIQUID: 7, SELECT: 8, SMUDGE: 9 } as const;
export const isHand = (src: number): boolean => src === SRC.PICK || src === SRC.BRUSH || src === SRC.LASER || src === SRC.SMUDGE;
export const isAuto = (src: number): boolean => src === SRC.CRITTER || src === SRC.RIG;

export interface PicProgress {
  restored: boolean;
  caught: boolean;
  /** Best reveal percent reached in any run. */
  best: number;
  defrags: number;
  runs: number;
}

/** Everything that survives Defrag and Restore. */
export interface Profile {
  bits: number;
  /** Bits earned since the last Format; each adds 2% ink. */
  bitsEarned: number;
  bitLevels: Record<string, number>;
  defrags: number;
  restores: number;
  pictures: Record<string, PicProgress>;
  /** Tools unlocked for good, by id. */
  tools: string[];
  selectAll: boolean;
  /** Pictures whose story fragment has been recovered. */
  fragments: string[];
  goalIdx: number;
  flags: { redBlast: boolean };
  lifetime: Inks;
  /** Moving average of ink per second earned by machines, for offline progress. */
  autoRates: Inks;
  stats: { playTime: number; deleted: number; explosions: number; caught: number };
}

/** Everything that one run owns; Defrag and Restore wipe it. */
export interface RunState {
  picture: string;
  seed: number;
  inks: Inks;
  totals: Inks;
  levels: Record<string, number>;
  tool: number;
  tune: Tune;
  diet: Record<Cur, boolean>;
  critterOwned: number;
  transOn: boolean;
  transTarget: Cur;
  bombCharges: number;
  deleted: number;
  explosions: number;
  time: number;
}

export interface Critter {
  cx: number;
  cy: number;
  nx: number;
  ny: number;
  x: number;
  y: number;
  moving: boolean;
  prog: number;
  bite: number;
  biteT: number;
  path: number[];
  stun: number;
  dx: number;
  dy: number;
  idle: number;
  search: number;
  anim: number;
}

export interface Rig {
  x: number;
  y: number;
  target: number;
  scan: number;
  idle: number;
  spin: number;
}

export interface Bomb {
  sx: number;
  sy: number;
  x: number;
  y: number;
  t: number;
  fuse: number;
  auto: boolean;
}

export interface Blast {
  x: number;
  y: number;
  R: number;
  dmg: number;
  t: number;
  kind: 'red' | 'bomb';
  /** The chain reaction this blast belongs to. Reds it sets off spend that chain's budget. */
  chain: number;
}

export interface DeadPixel {
  i: number;
  state: 'hidden' | 'exposed';
  /** Seconds left before an exposed Dead Pixel dives back into the rock. */
  t: number;
}

export interface SelectAllRun {
  x: number;
  y: number;
  t: number;
  dur: number;
  /** Chebyshev radius already swept. */
  done: number;
  max: number;
}

export interface SimInput {
  aimX: number;
  aimY: number;
  /** The primary pointer is held on the world. */
  held: boolean;
  /** The pointer went down since the last step. */
  pressed: boolean;
  moveX: number;
  moveY: number;
}

export type NoteId =
  | 'tool'
  | 'firstBug'
  | 'rigs'
  | 'trans'
  | 'noRigRoom'
  | 'selectAllUnlocked'
  | 'dpExposed'
  | 'dpFled'
  | 'dpDove'
  | 'dpCornered'
  | 'turboOver'
  | 'restored';

export type SimEvent =
  | { k: 'break'; i: number; t: number; src: number; cur: string; crit: boolean }
  | { k: 'strike'; i: number; tool: number; crit: boolean }
  | { k: 'boom'; x: number; y: number; R: number; nova: boolean }
  | { k: 'fx'; kind: 'prism' | 'glitch' | 'melt' | 'shatter' | 'smudge'; x: number; y: number; R: number }
  | { k: 'zap'; x0: number; y0: number; x1: number; y1: number; c: string }
  | { k: 'text'; x: number; y: number; txt: string; c: string }
  | { k: 'spark'; x: number; y: number; c: string; n: number }
  | { k: 'sfx'; id: 'throw' | 'poof' | 'prism' | 'deny' | 'static' | 'shatter' | 'select' }
  | { k: 'note'; id: NoteId; a?: string | number }
  | { k: 'goal'; idx: number }
  | { k: 'dp'; what: 'exposed' | 'fled' | 'dove' | 'caught'; x: number; y: number; x0: number; y0: number; bits?: number }
  | { k: 'selectDone' };

export interface Stats {
  pickDps: number;
  pickHit: number;
  brushHit: number;
  brushR: number;
  reach: number;
  speed: number;
  inkMult: number;
  lucky: number;
  echo: number;
  crit: number;
  bombR: number;
  bombDmg: number;
  bombMax: number;
  bombRegen: number;
  redR: number;
  redDmg: number;
  /** How many more reds one chain reaction can set off. */
  chainMax: number;
  blastYield: number;
  sympa: boolean;
  nova: boolean;
  mineLayer: number;
  mineInterval: number;
  laserDps: number;
  pierce: number;
  laserRange: number;
  surgical: boolean;
  appraise: number;
  rigs: boolean;
  rigDps: number;
  rigR: number;
  righop: boolean;
  midas: boolean;
  hatch: boolean;
  critDmg: number;
  critSpeed: number;
  critBiteRate: number;
  hive: boolean;
  symb: number;
  growthMult: number;
  greenMult: number;
  brood: number;
  queen: boolean;
  prismR: number;
  prismCd: number;
  /** Share of health left on a pixel the Prism's light has just colored. */
  prismSoft: number;
  purity: number;
  blueMult: number;
  flowMult: number;
  trans: boolean;
  transPct: number;
  transRatio: number;
  shardBonus: number;
  scrambleR: number;
  coloredMult: number;
  detonator: boolean;
  tracker: boolean;
  mutagen: boolean;
  alchblast: boolean;
  smudgeHit: number;
  smudgeR: number;
  machine: number;
  bitGain: number;
  defragAt: number;
  selectAt: number;
  scannerR: number;
  sense: boolean;
  freezeT: number;
  bounty: number;
  offlineEff: number;
  offlineCap: number;
  keep: number;
  turbo: boolean;
  turboLeft: number;
}
