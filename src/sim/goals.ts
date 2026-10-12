import { CURS, type Cur } from '../content/pixels';
import { BRANCH_TOOL_NODES } from '../content/runTree';
import { gain } from './mechanics';
import type { Sim } from './sim';

/** The guided path through v0.2. Each goal pays a small reward and points at the next idea. */
export interface Goal {
  id: string;
  text: string;
  done: (s: Sim) => boolean;
  reward?: Partial<Record<Cur, number>>;
}

const restored = (s: Sim, id: string): boolean => !!s.profile.pictures[id]?.restored;

export const GOALS: readonly Goal[] = [
  {
    id: 'dig',
    text: 'Hold the mouse (or a finger) on the world to erase toward it.',
    done: s => s.profile.stats.deleted >= 15,
    reward: { gray: 15 },
  },
  { id: 'pick', text: 'Open Upgrades (U) and buy Sharp Edge.', done: s => s.L('pick') >= 1 || s.profile.defrags > 0, reward: { gray: 25 } },
  { id: 'red', text: 'Break a red pixel. Stand back, it explodes.', done: s => s.profile.flags.redBlast, reward: { red: 8 } },
  {
    id: 'branch',
    text: 'Choose a strategy: unlock Bombs, Laser, Hatchery or Prism.',
    done: s => BRANCH_TOOL_NODES.some(id => s.L(id) > 0) || s.profile.tools.length > 1,
    reward: { gray: 150 },
  },
  {
    id: 'r10',
    text: 'Erase outward and reveal 10% of the picture.',
    done: s => s.reveal() >= 10 || s.profile.defrags > 0,
    reward: { shard: 3 },
  },
  { id: 'r25', text: 'Reveal 20% of the picture to unlock Defrag.', done: s => s.reveal() >= s.S.defragAt || s.profile.defrags > 0 },
  {
    id: 'defrag',
    text: 'Defrag: wipe this run for Bits that you keep forever.',
    done: s => s.profile.defrags > 0 || s.profile.restores > 0,
  },
  {
    id: 'bits',
    text: 'Spend Bits in the Bit tree (B). Its upgrades last through every Defrag.',
    done: s => Object.keys(s.profile.bitLevels).length > 1,
  },
  {
    id: 'hunt',
    text: 'A Dead Pixel hides in this picture: a black pixel that blinks. Erase next to it by hand, then click it. Machines and blasts scare it away.',
    done: s => s.profile.stats.caught > 0,
  },
  { id: 'r90', text: 'Reveal 90% of a picture to unlock Select All.', done: s => s.profile.selectAll },
  { id: 'restore', text: 'Use Select All (Ctrl+A) to clear the rest, then Restore the picture.', done: s => s.profile.restores > 0 },
  {
    id: 'galaxy',
    text: 'Restore Spiral Galaxy. Static jumps away from weak hits, so hit it hard: bombs, crits or big bites.',
    done: s => restored(s, 'galaxy'),
  },
  {
    id: 'lake',
    text: 'Restore Moon Lake. Break one ice pixel and its whole cluster shatters. Blasts melt ice into blue.',
    done: s => restored(s, 'lake'),
  },
];

export const FREE_TEXT =
  'Every picture in v0.2 is restored. Replay any of them from the Gallery (G) for Bits. More pictures come in later versions.';

export function goalText(s: Sim): string {
  const g = GOALS[s.profile.goalIdx];
  return g ? g.text : FREE_TEXT;
}

export function checkGoals(s: Sim): void {
  const p = s.profile;
  while (p.goalIdx < GOALS.length && GOALS[p.goalIdx].done(s)) {
    const g = GOALS[p.goalIdx];
    if (g.reward) for (const c of CURS) if (g.reward[c]) gain(s, c, g.reward[c] as number, false);
    s.emit({ k: 'goal', idx: p.goalIdx });
    p.goalIdx++;
  }
}
