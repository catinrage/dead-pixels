import { CUR_COLOR, CURS, type Cur, DIET_LABEL, TRANS_CURS } from '../../content/pixels';
import { fmt, fmtTime } from '../../core/num';
import { transRatio, transSource } from '../../sim/machines';
import { applyMusic, applySfx, audioInit, SFX, setStarted } from '../audio';
import { $, closeModal, costHTML, esc, showModal, toast } from '../dom';
import { G } from '../state';
import { closePanels, isOpen, onPanelOpen } from './panels';

/** The Automation and Settings drawers. The Field guide is static text. */

const dietBtns = new Map<Cur, HTMLButtonElement>();
const transBtns = new Map<Cur, HTMLButtonElement>();

function dchip(c: Cur, label: string, onClick: () => void): HTMLButtonElement {
  const col = c === 'shard' ? '#ff3df2' : CUR_COLOR[c];
  const b = document.createElement('button');
  b.className = 'dchip px';
  b.style.setProperty('--c', col);
  b.innerHTML = `<i style="--c:${col}"></i>${label}`;
  b.addEventListener('click', onClick);
  return b;
}

export function bindAuto(): void {
  const diet = $('#diet');
  for (const c of CURS) {
    const b = dchip(c, DIET_LABEL[c], () => {
      if (!G.sim.toggleDiet(c)) {
        SFX.deny();
        toast('Unlock Hive Mind in the green Swarm branch to set diet rules.');
        return;
      }
      refreshAuto();
    });
    diet.appendChild(b);
    dietBtns.set(c, b);
  }
  const tt = $('#trans-targets');
  for (const c of TRANS_CURS) {
    const b = dchip(c, DIET_LABEL[c], () => {
      G.sim.run.transTarget = c;
      refreshAuto();
    });
    tt.appendChild(b);
    transBtns.set(c, b);
  }
  $('#crit-buy').addEventListener('click', () => {
    if (G.sim.hatch()) SFX.buy();
    else SFX.deny();
    refreshAuto();
  });
  $('#rig-buy').addEventListener('click', () => {
    if (G.sim.buildRig() === true) SFX.buy();
    else SFX.deny();
    refreshAuto();
  });
  $('#rig-gather').addEventListener('click', () => {
    if (!G.sim.rigs.length) return;
    G.sim.gatherRigs();
    toast('Rigs moved next to you.');
  });
  $('#trans-toggle').addEventListener('click', () => {
    G.sim.run.transOn = !G.sim.run.transOn;
    refreshAuto();
  });
  onPanelOpen('auto', refreshAuto);
}

export function refreshAuto(): void {
  if (!isOpen('auto')) return;
  const s = G.sim;
  const S = s.S;
  const run = s.run;
  $('#sec-crit').classList.toggle('is-locked', !S.hatch);
  $('#sec-rig').classList.toggle('is-locked', !S.rigs);
  $('#sec-mine').classList.toggle('is-locked', !S.mineLayer);
  $('#sec-trans').classList.toggle('is-locked', !S.trans);
  const extra = s.critters.length - run.critterOwned;
  $('#crit-n').textContent = String(run.critterOwned) + (extra > 0 ? ` + ${extra} free` : '');
  $('#crit-dmg').textContent = fmt(S.critDmg);
  $('#crit-rate').textContent = S.critBiteRate.toFixed(1);
  const cc = s.critterCost();
  $('#crit-cost').innerHTML = costHTML(cc, run.inks);
  ($('#crit-buy') as HTMLButtonElement).disabled = !S.hatch || !s.canAfford(cc);
  $('#rig-n').textContent = String(s.rigs.length);
  $('#rig-dps').textContent = fmt(S.rigDps);
  $('#rig-r').textContent = String(S.rigR);
  const rc = s.rigCost();
  $('#rig-cost').innerHTML = costHTML(rc, run.inks);
  ($('#rig-buy') as HTMLButtonElement).disabled = !S.rigs || !s.canAfford(rc);
  ($('#rig-gather') as HTMLButtonElement).disabled = !s.rigs.length;
  $('#mine-int').textContent = `${S.mineInterval.toFixed(1)}s`;
  for (const [c, b] of dietBtns) b.setAttribute('aria-pressed', String(run.diet[c]));
  $('#diet-note').innerHTML = S.hive
    ? 'Tap a color to switch it on or off. Keep red off so your machines do not set off explosions, or switch it on for chain reactions.'
    : 'Bugs and rigs eat gray, blue and green. Unlock <b>Hive Mind</b> in the Swarm branch to choose for yourself.';
  for (const [c, b] of transBtns) b.setAttribute('aria-pressed', String(run.transTarget === c));
  const tog = $('#trans-toggle');
  tog.setAttribute('aria-pressed', String(run.transOn));
  (tog.firstElementChild as HTMLElement).textContent = run.transOn ? 'Stop transmuting' : 'Start transmuting';
  const src = transSource(G.sim);
  $('#trans-rate').textContent =
    `${(S.transPct * 100).toFixed(1)}% of your ${DIET_LABEL[src].toLowerCase()} a second at ${fmt(transRatio(G.sim))}:1`;
}

/* ---------- settings ---------- */

export interface SaveActions {
  save(): void;
  exportCode(): string;
  importCode(code: string): boolean;
  reset(): void;
}

const tracks: HTMLButtonElement[] = [];

export function bindSettingsDrawer(act: SaveActions): void {
  const box = $('#tracks');
  for (let k = 1; k <= 4; k++) {
    const b = document.createElement('button');
    b.textContent = String(k);
    b.className = 'px';
    b.setAttribute('aria-label', `Track ${k}`);
    b.addEventListener('click', () => {
      G.settings.track = k;
      G.settings.music = true;
      setStarted();
      audioInit();
      applyMusic();
      refreshSettings();
    });
    box.appendChild(b);
    tracks.push(b);
  }
  $('#music-tog').addEventListener('click', () => {
    G.settings.music = !G.settings.music;
    audioInit();
    applyMusic();
    refreshSettings();
  });
  $('#music-vol').addEventListener('input', e => {
    G.settings.musicVol = +(e.target as HTMLInputElement).value;
    applyMusic();
  });
  $('#sfx-tog').addEventListener('click', () => {
    G.settings.sfx = !G.settings.sfx;
    audioInit();
    applySfx();
    refreshSettings();
  });
  $('#sfx-vol').addEventListener('input', e => {
    G.settings.sfxVol = +(e.target as HTMLInputElement).value;
    applySfx();
  });
  $('#walk-tog').addEventListener('click', () => {
    G.settings.autoWalk = !G.settings.autoWalk;
    G.sim.autoWalk = G.settings.autoWalk;
    refreshSettings();
  });
  $('#shake-tog').addEventListener('click', () => {
    G.settings.shake = !G.settings.shake;
    refreshSettings();
  });
  $('#zoom-in').addEventListener('click', () => G.r.stepZoom(1));
  $('#zoom-out').addEventListener('click', () => G.r.stepZoom(-1));
  $('#save-now').addEventListener('click', () => {
    act.save();
    toast('Saved in this browser.');
  });
  $('#save-export').addEventListener('click', () => {
    act.save();
    const code = act.exportCode();
    const fallback = (): void =>
      showModal(
        'Your save code',
        `<p>Copy all of it. Paste it into Load a save code in any browser.</p><textarea class="code" readonly rows="6">${esc(code)}</textarea>`,
        [{ label: 'Done', hot: true, fn: closeModal }],
      );
    try {
      navigator.clipboard.writeText(code).then(() => toast('Save code copied. Paste it somewhere safe.', '#2bf0ff'), fallback);
    } catch {
      fallback();
    }
  });
  $('#save-import').addEventListener('click', () => {
    showModal(
      'Load a save code',
      '<p>Paste a save code. It replaces the game in this browser.</p><textarea class="code" id="import-code" rows="6" placeholder="DP2:..."></textarea>',
      [
        { label: 'Cancel', fn: closeModal },
        {
          label: 'Load',
          hot: true,
          fn: () => {
            const code = ($('#import-code') as HTMLTextAreaElement).value.trim();
            if (!code || !act.importCode(code)) {
              SFX.deny();
              toast('That save code did not load. Check that you copied all of it.', '#ff4d5e');
              return;
            }
            closeModal();
            closePanels();
            toast('Save loaded.', '#2bf0ff');
          },
        },
      ],
    );
  });
  let armed = 0;
  $('#reset').addEventListener('click', e => {
    const b = e.currentTarget as HTMLButtonElement;
    if (performance.now() - armed > 3000) {
      armed = performance.now();
      b.textContent = 'Tap again to erase everything';
      setTimeout(() => {
        b.textContent = 'Start over';
      }, 3000);
      return;
    }
    armed = 0;
    b.textContent = 'Start over';
    act.reset();
    closePanels();
    toast('Fresh start. Everything was erased.');
  });
  $('#version').textContent = 'Dead Pixels v0.2 · saves in this browser';
  onPanelOpen('settings', refreshSettings);
}

const onOff = (v: boolean): string => (v ? 'On' : 'Off');

export function refreshSettings(): void {
  if (!isOpen('settings')) return;
  const st = G.settings;
  const tog = (id: string, v: boolean): void => {
    const b = $(id);
    b.setAttribute('aria-pressed', String(v));
    b.textContent = onOff(v);
  };
  tog('#music-tog', st.music);
  tog('#sfx-tog', st.sfx);
  tog('#walk-tog', st.autoWalk);
  tog('#shake-tog', st.shake);
  ($('#music-vol') as HTMLInputElement).value = String(st.musicVol);
  ($('#sfx-vol') as HTMLInputElement).value = String(st.sfxVol);
  for (let k = 0; k < tracks.length; k++) tracks[k].setAttribute('aria-pressed', String(st.track === k + 1));
  const p = G.sim.profile;
  $('#st-del').textContent = fmt(p.stats.deleted);
  $('#st-exp').textContent = fmt(p.stats.explosions);
  $('#st-time').textContent = fmtTime(p.stats.playTime);
  $('#st-def').textContent = String(p.defrags);
  $('#st-res').textContent = String(p.restores);
  $('#st-dp').textContent = String(p.stats.caught);
  $('#st-bits').textContent = fmt(p.bitsEarned);
}
