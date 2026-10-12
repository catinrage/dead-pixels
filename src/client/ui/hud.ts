import { fileName } from '../../content/pictures';
import { CUR_COLOR, CUR_LABEL, CURS, type Cur, DIET_LABEL } from '../../content/pixels';
import { BOMB, LASER, PRISM, TOOLS } from '../../content/tools';
import { fmt } from '../../core/num';
import { goalText } from '../../sim/goals';
import { audioInit } from '../audio';
import { $, esc } from '../dom';
import { iconURL } from '../icons';
import { G } from '../state';

/** The always-on HUD: ink counters, the picture panel, menu badges, the goal and the hotbar. */

export interface HudActions {
  defrag(): void;
  restore(): void;
  selectAll(): void;
  tool(k: number): void;
}

type Chip = { el: HTMLElement; i: HTMLElement; b: HTMLElement; s: HTMLElement; last: number };
const chips = new Map<Cur | 'bits', Chip>();
const slots: { b: HTMLButtonElement; n: HTMLElement; tune: HTMLElement; cd: HTMLElement; lock: HTMLElement }[] = [];
let nameTick = 0;
let nameT = 0;
let tipTimer = 0;

export const tuneColor = (): string => (G.sim.run.tune === 'any' ? '#ff3df2' : CUR_COLOR[G.sim.run.tune as Cur]);

export function buildHud(act: HudActions): void {
  const box = $('#inks');
  for (const c of [...CURS, 'bits'] as (Cur | 'bits')[]) {
    const el = document.createElement('div');
    el.className = c === 'bits' ? 'chip bits px' : 'chip px';
    el.hidden = c !== 'gray';
    el.title = c === 'bits' ? 'Bits: spend them in the Bit tree (B)' : CUR_LABEL[c];
    el.innerHTML = c === 'bits' ? '<i></i><b>0</b><small>Bits</small>' : `<i style="--c:${CUR_COLOR[c]}"></i><b>0</b><small>+0/s</small>`;
    box.appendChild(el);
    chips.set(c, {
      el,
      i: el.querySelector('i') as HTMLElement,
      b: el.querySelector('b') as HTMLElement,
      s: el.querySelector('small') as HTMLElement,
      last: 0,
    });
  }
  const bar = $('#hotbar');
  TOOLS.forEach((t, k) => {
    const b = document.createElement('button');
    b.className = 'slot px';
    b.setAttribute('aria-label', `${t.name} (${k + 1})`);
    b.innerHTML = `<img class="ic" src="${iconURL(t.icon)}" alt=""><span class="k">${k + 1}</span><span class="n"></span><span class="tune"></span><span class="cd"></span><img class="lock" src="${iconURL('lock')}" alt="">`;
    b.addEventListener('click', () => {
      audioInit();
      act.tool(k);
    });
    bar.appendChild(b);
    slots.push({
      b,
      n: b.querySelector('.n') as HTMLElement,
      tune: b.querySelector('.tune') as HTMLElement,
      cd: b.querySelector('.cd') as HTMLElement,
      lock: b.querySelector('.lock') as HTMLElement,
    });
  });
  $('#btn-defrag').addEventListener('click', act.defrag);
  $('#btn-restore').addEventListener('click', act.restore);
  $('#btn-select').addEventListener('click', act.selectAll);
}

/** Where collected ink flies to. Call after anything moves the chips. */
export function measureChips(): void {
  for (const c of CURS) {
    const ch = chips.get(c) as Chip;
    if (ch.el.hidden) {
      delete G.r.chipPos[c];
      continue;
    }
    const r = ch.i.getBoundingClientRect();
    G.r.chipPos[c] = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}

export function pulseChip(c: Cur | 'bits'): void {
  const ch = chips.get(c);
  const t = performance.now();
  if (!ch || t - ch.last < 120) return;
  ch.last = t;
  ch.el.classList.remove('pulse');
  void ch.el.offsetWidth;
  ch.el.classList.add('pulse');
}

/* ---------- fast refresh: counters, meter, hotbar ---------- */

export function refreshHud(dt: number): void {
  const s = G.sim;
  const p = s.profile;
  let moved = false;
  for (const c of CURS) {
    const ch = chips.get(c) as Chip;
    const show = c === 'gray' || p.lifetime[c] > 0;
    if (ch.el.hidden === show) {
      ch.el.hidden = !show;
      moved = true;
    }
    if (!show) continue;
    ch.b.textContent = fmt(s.run.inks[c]);
    ch.s.textContent = `+${fmt(s.rates[c])}/s`;
  }
  const bc = chips.get('bits') as Chip;
  const showBits = p.bitsEarned > 0 || p.bits > 0;
  if (bc.el.hidden === showBits) {
    bc.el.hidden = !showBits;
    moved = true;
  }
  bc.b.textContent = fmt(p.bits);
  if (moved) measureChips();

  const rv = s.reveal();
  $('#reveal-pct').textContent = `${rv.toFixed(1)}%`;
  $('#reveal-fill').style.width = `${Math.min(100, rv)}%`;
  nameT -= dt;
  if (nameT <= 0) {
    nameT = 0.25;
    nameTick++;
    const pic = s.pic;
    const out = fileName(pic, rv, s.progress(pic.id).restored, nameTick);
    let html = '';
    for (let k = 0; k < out.length; k++) html += out[k] === pic.file[k] ? esc(out[k]) : `<span class="garble">${esc(out[k])}</span>`;
    const el = $('#img-name');
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  refreshDp();
  refreshHotbar();
}

function refreshDp(): void {
  const s = G.sim;
  const line = $('#dp-line');
  const dp = s.dp;
  let text = '';
  let hot = false;
  let done = false;
  if (!dp) {
    if (s.progress(s.pic.id).caught) {
      text = 'Dead Pixel deleted';
      done = true;
    }
  } else if (dp.state === 'exposed') {
    hot = true;
    text = Number.isFinite(dp.t) ? `Exposed! Click it: ${Math.ceil(dp.t)}s` : 'Cornered! Click it';
  } else if (s.profile.selectAll && s.reveal() >= s.S.selectAt) text = 'Catch the Dead Pixel to Select All';
  else text = 'A Dead Pixel hides in here';
  line.hidden = !text;
  line.classList.toggle('hot', hot);
  line.classList.toggle('done', done);
  const t = $('#dp-text');
  if (t.textContent !== text) t.textContent = text;
}

export function refreshHotbar(): void {
  const s = G.sim;
  const run = s.run;
  slots.forEach((sl, k) => {
    const un = s.toolUnlocked(k);
    sl.b.classList.toggle('sel', run.tool === k);
    sl.b.classList.toggle('locked', !un);
    sl.lock.hidden = un;
    sl.n.textContent = k === BOMB && un ? String(Math.floor(run.bombCharges)) : '';
    sl.tune.style.setProperty('--tc', k === LASER && un ? tuneColor() : 'transparent');
    let cd = 0;
    if (k === PRISM && un && s.prismCd > 0) cd = s.prismCd / s.S.prismCd;
    if (k === BOMB && un && run.bombCharges < 1) cd = 1 - (run.bombCharges % 1);
    sl.cd.style.height = `${(cd * 100).toFixed(0)}%`;
  });
}

/* ---------- slow refresh: buttons, badges, goal ---------- */

export function refreshHudSlow(): void {
  const s = G.sim;
  const p = s.profile;
  const S = s.S;
  const def = $('#btn-defrag') as HTMLButtonElement;
  def.hidden = !s.canDefrag();
  if (!def.hidden) def.textContent = `Defrag +${fmt(s.defragGain())} Bits`;
  const res = $('#btn-restore') as HTMLButtonElement;
  res.hidden = !s.canRestore();
  if (!res.hidden) res.textContent = `Restore +${fmt(s.restoreGain())} Bits`;
  const sel = $('#btn-select') as HTMLButtonElement;
  const block = s.selectAllBlock();
  sel.hidden = !(block === null || block === 'dp');
  sel.disabled = block === 'dp';
  sel.title = block === 'dp' ? 'Catch this picture’s Dead Pixel first' : 'Clear every pixel left (Ctrl+A)';
  $('#mark-defrag').style.left = `calc(${S.defragAt}% - 1px)`;
  const ms = $('#mark-select');
  ms.hidden = !p.selectAll;
  ms.style.left = `calc(${S.selectAt}% - 1px)`;
  $('#mark-defrag').title = `Defrag opens at ${S.defragAt}%`;

  $('#menu-bits').hidden = !(p.bitsEarned > 0 || p.defrags > 0 || p.restores > 0);
  badge($('#badge-tree'), s.choosing ? 0 : s.countAffordable());
  badge($('#badge-bits'), s.countBitAffordable());
  const g = $('#goal-text');
  const txt = goalText(s);
  if (g.textContent !== txt) g.textContent = txt;
}

function badge(el: HTMLElement, k: number): void {
  el.hidden = !k;
  el.textContent = String(k);
}

export function flashGoal(): void {
  const g = $('#goal');
  g.classList.add('flash');
  setTimeout(() => g.classList.remove('flash'), 900);
}

export function showToolTip(): void {
  const s = G.sim;
  const k = s.run.tool;
  const t = TOOLS[k];
  let txt = `${t.name} · ${t.hint}`;
  if (k === LASER)
    txt = `Laser · tuned to ${s.run.tune === 'any' ? 'every color' : DIET_LABEL[s.run.tune as Cur].toLowerCase()} · right-click, T or tap again to retune`;
  if (k === BOMB) txt = `Bombs · click to throw · ${Math.floor(s.run.bombCharges)} of ${s.S.bombMax} ready`;
  const el = $('#tool-tip');
  el.textContent = txt;
  el.classList.add('show');
  clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => el.classList.remove('show'), 2600);
}
