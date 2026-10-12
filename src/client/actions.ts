import { BR, RUN_NODE } from '../content/runTree';
import { LASER, TOOLS } from '../content/tools';
import { laserSound, SFX } from './audio';
import { $, closeModal, showModal, toast } from './dom';
import { G } from './state';
import { refreshHotbar, showToolTip } from './ui/hud';
import { playDefrag, playRestore } from './ui/moments';
import { closePanels, openPanel } from './ui/panels';

/** Player actions that touch both the simulation and the screen. */

export function selectTool(k: number): void {
  const s = G.sim;
  if (s.selectTool(k) === 'locked') {
    SFX.deny();
    const t = TOOLS[k];
    const n = t.node ? RUN_NODE[t.node] : null;
    toast(
      n ? `${t.name} is locked. Unlock ${n.name} in the ${BR[n.br]} branch.` : `${t.name} unlocks for good when you restore Moon Lake.`,
    );
    return;
  }
  laserSound(false);
  showToolTip();
  refreshHotbar();
}

export function cycleTool(dir: number): void {
  const s = G.sim;
  const n = TOOLS.length;
  for (let k = 1; k < n; k++) {
    const t = (s.run.tool + dir * k + n * 2) % n;
    if (s.toolUnlocked(t)) {
      selectTool(t);
      return;
    }
  }
}

export function cycleTune(dir: number): void {
  if (!G.sim.toolUnlocked(LASER)) return;
  G.sim.cycleTune(dir);
  showToolTip();
  refreshHotbar();
}

export function doSelectAll(): void {
  const s = G.sim;
  const why = s.selectAll();
  if (!why) {
    closePanels();
    return;
  }
  SFX.deny();
  const msg = {
    locked: 'Select All unlocks the first time you reveal 90% of a picture.',
    busy: 'Nothing left to select.',
    early: `Select All opens at ${s.S.selectAt}% revealed.`,
    dp: 'This picture’s Dead Pixel is still out there. Catch it first.',
  }[why];
  toast(msg);
}

function hideAll(): void {
  for (const id of ['tree', 'gallery', 'auto', 'help', 'settings']) $(`#${id}`).hidden = true;
}

/** After a moment: pick the next picture. */
function afterReset(): void {
  if (G.sim.choosing) openPanel('gallery');
  else closePanels();
  G.refresh();
}

export function askDefrag(): void {
  const s = G.sim;
  if (!s.canDefrag()) return;
  const g = s.defragGain();
  showModal(
    'Defrag?',
    `<p>Wipe this run and keep what matters.</p><ul><li>You gain <b>${g} Bits</b>. Each one adds 2% ink for good, and the Bit tree turns them into upgrades that never reset.</li><li>You lose this run’s ink, upgrades, bugs and rigs.</li><li>Tools you unlocked stay yours.</li></ul>`,
    [
      { label: 'Not yet', fn: closeModal },
      {
        label: `Defrag for ${g} Bits`,
        hot: true,
        fn: () => {
          closeModal();
          doDefrag();
        },
      },
    ],
  );
}

export function doDefrag(): void {
  const s = G.sim;
  const totals = { ...s.run.totals };
  const file = s.pic.file;
  const g = s.defrag();
  if (g < 0) return;
  laserSound(false);
  hideAll();
  G.save();
  playDefrag({ gain: g, bits: s.profile.bits, file, totals }, afterReset);
}

export function doRestore(): void {
  const s = G.sim;
  const pic = s.pic;
  const g = s.restore();
  if (g < 0) return;
  laserSound(false);
  hideAll();
  G.save();
  playRestore({ pic, gain: g, bits: s.profile.bits, fragment: s.profile.fragments.includes(pic.id) }, afterReset);
}

export function choosePicture(pid: string): void {
  const s = G.sim;
  if (!s.choose(pid)) return;
  closePanels();
  G.r.attach(s);
  G.refresh();
  G.save();
  SFX.select();
  toast(
    `Opened ${s.pic.file}. ${s.progress(pid).caught ? 'Its Dead Pixel is already gone.' : 'Its Dead Pixel is in there somewhere.'}`,
    '#2bf0ff',
  );
}
