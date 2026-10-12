import { PICTURE } from '../src/content/pictures';
import { DEPTH } from '../src/content/pixels';
import { runBot, type Strategy, TARGETS } from './bot';

/**
 * Balance simulator: plays the game headless with each strategy and compares the time to each
 * milestone with the design doc's pacing targets.
 *
 *   bun scripts/balance.ts [hours=6] [runsPerStrategy=1] [--log] [--only=demo,prec] [--hp=1.7] [--yield=1.25]
 */

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const hours = Number(args[0] ?? 6);
const runs = Number(args[1] ?? 1);
const showLog = process.argv.includes('--log');
const strategies: Strategy[] = (process.argv
  .find(a => a.startsWith('--only='))
  ?.slice(7)
  .split(',') as Strategy[]) ?? ['demo', 'prec', 'swarm', 'alch'];

const flag = (k: string): string | undefined => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
if (flag('hp')) DEPTH.hpStep = Number(flag('hp'));
if (flag('yield')) DEPTH.yieldStep = Number(flag('yield'));
// --galaxy=hp,yield,bits and --lake=hp,yield,bits override a picture's multipliers
for (const id of ['galaxy', 'lake']) {
  const v = flag(id)?.split(',').map(Number);
  if (!v) continue;
  const p = PICTURE[id] as { hpMult: number; yieldMult: number; bitMult: number };
  [p.hpMult, p.yieldMult, p.bitMult] = [v[0] ?? p.hpMult, v[1] ?? p.yieldMult, v[2] ?? p.bitMult];
}

const results: Record<string, number[]> = {};
for (const st of strategies) {
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    const { ms, log, sim } = runBot({
      seed: 1000 + r * 17 + strategies.indexOf(st) * 101,
      tick: 1 / 20,
      hours,
      strategy: st,
      spot: 0.03,
      log: showLog,
    });
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(
      `\n${st} run ${r + 1}: simulated ${hours} h in ${secs} s; bits earned ${sim.profile.bitsEarned}, restores ${sim.profile.restores}, defrags ${sim.profile.defrags}`,
    );
    if (showLog) console.log(log.join('\n'));
    for (const [k] of TARGETS) (results[`${st}:${k}`] ??= []).push(ms[k] ?? Number.NaN);
  }
}

const fmtMin = (s: number): string => (Number.isNaN(s) ? '   never' : `${(s / 60).toFixed(0).padStart(5)} min`);
console.log('\nMilestone                         target   ' + strategies.map(s => s.padStart(9)).join(' '));
for (const [k, label, target] of TARGETS) {
  const cols = strategies.map(st => {
    const v = results[`${st}:${k}`] ?? [];
    const ok = v.filter(x => !Number.isNaN(x)).sort((a, b) => a - b);
    // the median run, so one lucky or unlucky seed does not swing the table
    return ok.length * 2 > v.length ? fmtMin(ok[Math.floor(v.length / 2)]) : '   never';
  });
  console.log(`${label.padEnd(32)} ${String(target).padStart(5)} min ${cols.join(' ')}`);
}
