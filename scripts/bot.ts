import { BIT_NODES, bitCost } from '../src/content/bitTree';
import { PICTURES } from '../src/content/pictures';
import { type Cur, E, STATIC } from '../src/content/pixels';
import { BRANCH_TOOL_NODES, MACHINE_NODES, nodeCost, RUN_NODES, type RunNode } from '../src/content/runTree';
import { BOMB, BRUSH, ERASER, LASER, PRISM } from '../src/content/tools';
import { Rng } from '../src/core/rng';
import { Sim } from '../src/sim/sim';

/**
 * A headless player for the balance simulator. It plays like a reasonable, attentive person:
 * it erases the nearest walls, buys upgrades for one strategy, hunts the Dead Pixel by eye,
 * and Defrags when progress stalls. It reports the play time at which each milestone happened.
 */

export type Strategy = 'demo' | 'prec' | 'swarm' | 'alch';

export interface BotOptions {
  seed: number;
  tick: number;
  hours: number;
  strategy: Strategy;
  /** Chance per second of noticing a buried Dead Pixel's flicker when it is close (tripled while searching the scanner circle). */
  spot: number;
  log?: boolean;
}

export type Milestones = Record<string, number>;

const BRANCH_OF: Record<Strategy, string> = { demo: 'demo', prec: 'prec', swarm: 'swarm', alch: 'alch' };
const BIT_PRIORITY = [
  'b_cache',
  'b_clock',
  'b_scanner',
  'b_warm',
  'b_firmware',
  'b_compress',
  'b_daemon',
  'b_incubator',
  'b_bgproc',
  'b_ecc',
  'b_freeze',
  'b_bounty',
  'b_swap',
  'b_quick',
  'b_turbo',
  'b_marquee',
  'b_prefab',
  'b_sense',
  'b_sleep',
];

export function runBot(o: BotOptions): { ms: Milestones; sim: Sim; log: string[] } {
  const s = new Sim({ seed: o.seed, record: false });
  // the bot's own dice, so a run replays exactly from its seed
  const botRng = new Rng(o.seed * 7 + 1);
  const rnd = (): number => botRng.next();
  s.autoWalk = true;
  const ms: Milestones = {};
  const log: string[] = [];
  const mark = (k: string): void => {
    if (ms[k] == null) {
      ms[k] = s.profile.stats.playTime;
      if (o.log) log.push(`${(ms[k] / 60).toFixed(1).padStart(6)} min  ${k}`);
    }
  };
  const end = o.hours * 3600;
  let thinkT = 0;
  let buyT = 0;
  let goalX = s.player.x;
  let goalY = s.player.y;
  let goalT = 0;
  let known = -1;
  let revealHist: number[] = [];
  let histT = 0;
  let bombT = 0;
  let huntT = 0;
  let stuckT = 0;
  let farmNext = false;
  const branch = BRANCH_OF[o.strategy];
  // gold pays Precision's upgrades; everyone else only wants it for a few keystones
  const goldPull = o.strategy === 'prec' ? 3 : 0.5;

  /** The biggest single hit the bot's main tool lands, which is what static has to be deleted by. */
  const oneHit = (): number =>
    o.strategy === 'prec' && s.toolUnlocked(LASER) ? s.S.laserDps * o.tick : s.toolUnlocked(BRUSH) ? s.S.brushHit : s.S.pickHit;

  const frontier = (limit = 2500): number => {
    // nearest solid cell reachable through tunnels, preferring color
    const w = s.world;
    const W = w.w;
    const start = Math.floor(s.player.y) * W + Math.floor(s.player.x);
    const st = ++s.bfsStamp;
    const q = s.bfsQ;
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    s.bfsMark[start] = st;
    let best = -1;
    let bestS = Number.NEGATIVE_INFINITY;
    while (head < tail && head < limit) {
      const i = q[head++];
      const x = i % W;
      const y = (i / W) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= w.h) continue;
        const n = ny * W + nx;
        if (s.bfsMark[n] === st) continue;
        s.bfsMark[n] = st;
        if (w.cells[n] === E) q[tail++] = n;
        else if (!(s.dp && s.dp.i === n)) {
          const t = w.cells[n];
          // static only dies to one big hit; anything less makes it jump, so leave it for bombs and crits
          if (t === STATIC && w.hp[n] > oneHit()) continue;
          const dps = Math.max(1, o.strategy === 'prec' && s.toolUnlocked(LASER) ? s.S.laserDps : s.S.pickDps);
          const sc = -head * 0.02 - (w.hp[n] / dps) * 0.6 + (t === 8 ? goldPull : t === 5 ? 1 : 0);
          if (sc > bestS) {
            bestS = sc;
            best = n;
          }
        }
      }
      if (best >= 0 && head > 60) break;
    }
    if (best < 0 && limit < w.n) return frontier(w.n);
    return best;
  };

  const affordableFrac = (n: RunNode): number => {
    const c = nodeCost(n.cost, s.L(n.id));
    let worst = 0;
    for (const k in c) worst = Math.max(worst, (c[k as Cur] as number) / Math.max(1e-9, s.run.inks[k as Cur]));
    return worst;
  };

  const buy = (): void => {
    if (s.choosing) return;
    for (let guard = 0; guard < 30; guard++) {
      let best: RunNode | null = null;
      let bestS = Number.POSITIVE_INFINITY;
      for (const n of RUN_NODES) {
        if (s.nodeState(n) !== 'afford') continue;
        if (n.br !== 'core' && n.br !== branch && n.br !== 'cross') continue;
        if (n.id === 'speed' && s.L('speed') >= 3) continue;
        let sc = affordableFrac(n);
        if (n.br === branch) sc *= 0.7;
        if (n.tool != null || n.auto) sc *= 0.3;
        if (sc < bestS) {
          bestS = sc;
          best = n;
        }
      }
      if (!best) break;
      s.buyNode(best.id);
      if (s.L(best.id) === 1) {
        if (ms.firstUpgrade == null) mark('firstUpgrade');
        if (BRANCH_TOOL_NODES.includes(best.id)) mark('branchChosen');
        if (MACHINE_NODES.includes(best.id)) mark('firstMachine');
      }
    }
    if (o.strategy === 'swarm' || s.S.hatch) for (let k = 0; k < 5 && s.hatch(); k++);
    if (s.S.rigs) for (let k = 0; k < 3 && s.buildRig() === true; k++);
    if (s.S.trans) {
      // feed whichever of gray (the core) and the branch color is running lower
      s.run.transOn = true;
      const own = ({ demo: 'red', prec: 'gold', swarm: 'green', alch: 'blue' } as const)[o.strategy];
      s.run.transTarget = s.run.inks.gray <= s.run.inks[own] ? 'gray' : own;
    }
    // Bits
    for (let guard = 0; guard < 40; guard++) {
      let pick: string | null = null;
      let cheapest = Number.POSITIVE_INFINITY;
      for (const id of BIT_PRIORITY) {
        const n = BIT_NODES.find(b => b.id === id);
        if (!n || s.bitNodeState(n) !== 'afford') continue;
        const c = bitCost(n, s.B(id));
        if (c < cheapest) {
          cheapest = c;
          pick = id;
        }
      }
      if (!pick) break;
      s.buyBitNode(pick);
      mark('firstBitNode');
    }
  };

  while (s.profile.stats.playTime < end) {
    if (s.choosing) {
      const ch = s.choices();
      const restored = ch.filter(p => s.progress(p.id).restored);
      // after giving up on a picture that is still too hard, replay the newest restored one for Bits
      const next =
        farmNext && restored.length ? restored[restored.length - 1] : (ch.find(p => !s.progress(p.id).restored) ?? ch[ch.length - 1]);
      farmNext = false;
      stuckT = 0;
      s.choose(next.id);
      known = -1;
      revealHist = [];
      continue;
    }
    const dt = o.tick;
    thinkT -= dt;
    buyT -= dt;
    histT -= dt;
    goalT -= dt;
    bombT -= dt;
    if (buyT <= 0) {
      buyT = 1;
      buy();
    }
    if (histT <= 0) {
      histT = 30;
      revealHist.push(s.reveal());
      if (revealHist.length > 12) revealHist.shift();
    }
    if (thinkT <= 0) {
      thinkT = 0.25;
      const w = s.world;
      const dp = s.dp;
      // Notice the Dead Pixel. Buried, it only flickers now and then; out in the open it blinks on screen.
      if (dp && known !== dp.i) {
        const dx = (dp.i % w.w) - s.player.x;
        const dy = ((dp.i / w.w) | 0) - s.player.y;
        const d = Math.hypot(dx, dy);
        const searching = s.S.scannerR > 0 && goalT > 0;
        const perSec = w.isOpen(dp.i) ? (d < 14 ? 0.6 : 0) : d < 10 ? o.spot * (searching ? 3 : 1) : 0;
        if (perSec > 0 && rnd() < perSec * 0.25) known = dp.i;
      }
      if (dp && known === dp.i) {
        const x = (dp.i % w.w) + 0.5;
        const y = ((dp.i / w.w) | 0) + 0.5;
        s.input.aimX = x;
        s.input.aimY = y;
        if (w.isOpen(dp.i)) s.input.pressed = true;
        s.run.tool = ERASER;
      } else if (dp && s.S.scannerR > 0 && s.reveal() > 12 && goalT <= 0) {
        // wander inside the scanner circle
        const a = rnd() * Math.PI * 2;
        const r = rnd() * s.S.scannerR;
        goalX = (dp.i % w.w) + Math.cos(a) * r;
        goalY = ((dp.i / w.w) | 0) + Math.sin(a) * r;
        goalT = 25;
      } else {
        const f = frontier();
        if (f >= 0) {
          s.input.aimX = (f % w.w) + 0.5;
          s.input.aimY = ((f / w.w) | 0) + 0.5;
        }
      }
      if (dp && known !== dp.i && s.S.scannerR > 0 && goalT > 0) {
        s.input.aimX = goalX;
        s.input.aimY = goalY;
      }
      s.input.held = true;
      if (!(dp && known === dp.i))
        s.run.tool =
          o.strategy === 'prec' && s.toolUnlocked(LASER)
            ? LASER
            : o.strategy === 'alch' && s.toolUnlocked(PRISM)
              ? PRISM
              : s.toolUnlocked(BRUSH)
                ? BRUSH
                : ERASER;
      // tools that do not walk by themselves: step toward the target with the movement keys
      s.input.moveX = 0;
      s.input.moveY = 0;
      if (s.run.tool === LASER) {
        const dx = s.input.aimX - s.player.x;
        const dy = s.input.aimY - s.player.y;
        const d = Math.hypot(dx, dy);
        if (d > Math.min(4, s.S.laserRange - 1)) {
          s.input.moveX = dx / d;
          s.input.moveY = dy / d;
        }
      }
      if (s.toolUnlocked(BOMB) && s.run.bombCharges >= 1 && bombT <= 0 && !(dp && known === dp.i)) {
        const prev = s.run.tool;
        s.run.tool = BOMB;
        s.input.pressed = true;
        s.step(dt);
        s.run.tool = prev;
        bombT = o.strategy === 'demo' ? 0.5 : 3;
      }
    }
    s.step(dt);
    // a beam that stops dead on a black pixel gives the Dead Pixel away
    if (s.beam?.blocked && s.dp && known !== s.dp.i) known = s.dp.i;
    if (s.profile.stats.caught > 0) mark('firstCatch');
    if (s.canDefrag()) mark('defragOpen');
    if (s.profile.selectAll) mark('selectAllUnlocked');
    // resets
    const rv = s.reveal();
    if (s.selectAllBlock() === null) s.selectAll();
    if (s.canRestore()) {
      const pid = s.pic.id;
      s.restore();
      mark(`restored:${pid}`);
      continue;
    }
    // Defrag once the Bits this run adds per minute drop below the run's average so far
    const k = revealHist.length;
    const recent = k >= 7 ? (rv - revealHist[k - 7]) / 3 : Number.POSITIVE_INFINITY;
    const average = Math.max(0, rv - 10) / Math.max(1, s.run.time / 60);
    const done = s.progress(s.pic.id).restored;
    // farming a restored picture: leave once Bits come slower than the run's average. Otherwise keep
    // pushing toward the restore, and only give up on the run when it gains under 1% in six minutes.
    const stalled = done ? k >= 7 && recent < average * 0.6 : k >= 12 && rv - revealHist[0] < 1;
    // stuck below the Defrag line with nothing gained for minutes: leave for an easier picture
    const farmable = s.choices().some(p => p.id !== s.pic.id && s.progress(p.id).restored);
    if (farmable && !s.canDefrag() && k >= 12 && rv - revealHist[0] < 0.5) stuckT += dt;
    else stuckT = 0;
    if (stuckT > 300 && s.abandon()) {
      farmNext = true;
      mark('gaveUp');
      continue;
    }
    if (s.dp && rv >= 85) huntT += dt;
    else huntT = 0;
    const hunting = huntT > 0 && huntT < 600;
    // close to Select All, hold on unless the run has stopped moving altogether
    const nearSelect = s.profile.selectAll && !done && rv >= s.S.selectAt - 3 && !s.dp && !(k >= 12 && rv - revealHist[0] < 0.2);
    if (s.canDefrag() && stalled && !hunting && !nearSelect) {
      const g = s.defrag();
      mark('firstDefrag');
      if (o.log)
        log.push(
          `${(s.profile.stats.playTime / 60).toFixed(1).padStart(6)} min  defrag ${s.pic.id} at ${rv.toFixed(1)}% for ${g} Bits (bits ${s.profile.bits}, earned ${s.profile.bitsEarned})${done ? ' [replay]' : ''}`,
        );
      revealHist = [];
      known = -1;
      huntT = 0;
    }
  }
  return { ms, sim: s, log };
}

export const TARGETS: [string, string, number][] = [
  ['firstUpgrade', 'First upgrade bought', 1],
  ['branchChosen', 'Strategy branch chosen', 10],
  ['firstMachine', 'First machine digging for you', 15],
  ['defragOpen', 'Defrag opens', 25],
  ['firstDefrag', 'First Defrag', 30],
  ['firstCatch', 'First Dead Pixel caught', 60],
  ['restored:sunset', 'First picture restored', 90],
  ['restored:galaxy', 'Picture 2 restored', 180],
  ['restored:lake', 'Picture 3 restored', 270],
];

export const pictureIds = PICTURES.map(p => p.id);
