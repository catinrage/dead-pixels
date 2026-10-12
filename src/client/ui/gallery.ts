import { fileName, LOCKED_FILES, PICTURES, type PictureDef } from '../../content/pictures';
import { CUR_LABEL, CURS, TYPE_NAME, TYPE_RGB } from '../../content/pixels';
import { fmt } from '../../core/num';
import { hash2 } from '../../core/rng';
import { $, closeModal, esc, showModal } from '../dom';
import { pictureData } from '../render';
import { G } from '../state';
import { onPanelOpen } from './panels';

/** The lost photo folder: every picture, its perk and progress, and the notes recovered from Dead Pixels. */

let onChoose: (pid: string) => void = () => {};

export function bindGallery(choose: (pid: string) => void): void {
  onChoose = choose;
  onPanelOpen('gallery', refreshGallery);
}

type ThumbMode = 'full' | 'live' | 'corrupt';

function thumb(p: PictureDef, mode: ThumbMode): HTMLCanvasElement {
  const n = p.size;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const d = pictureData(p).slice();
  if (mode === 'live') {
    // what this run has uncovered so far; the rest is the rock, dimmed
    const w = G.sim.world;
    for (let i = 0; i < w.n; i++) {
      const rgb = TYPE_RGB[w.cells[i]];
      if (!rgb) continue;
      d[i * 4] = rgb[0] * 0.3;
      d[i * 4 + 1] = rgb[1] * 0.3;
      d[i * 4 + 2] = rgb[2] * 0.36;
    }
  } else if (mode === 'corrupt') {
    // a damaged file: a few blocks show through, the rest is noise
    const B = 6;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const h = hash2((x / B) | 0, (y / B) | 0, p.num * 31);
        const o = (y * n + x) * 4;
        if (h < 0.22) {
          d[o] *= 0.55;
          d[o + 1] *= 0.55;
          d[o + 2] *= 0.6;
        } else if (h > 0.965) {
          const m = hash2(x, y, p.num) < 0.5;
          d[o] = m ? 255 : 43;
          d[o + 1] = m ? 61 : 240;
          d[o + 2] = m ? 242 : 255;
        } else {
          const v = 18 + hash2(x >> 1, y >> 1, p.num * 7) * 26;
          d[o] = v;
          d[o + 1] = v * 0.9;
          d[o + 2] = v * 1.35;
        }
      }
  }
  (c.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(d, n, n), 0, 0);
  return c;
}

type CardAction = 'choose' | 'switch' | null;

function card(p: PictureDef, action: CardAction, reachable: boolean): HTMLElement {
  const s = G.sim;
  const prog = s.profile.pictures[p.id];
  const restored = !!prog?.restored;
  const current = s.pic.id === p.id;
  const el = document.createElement(action ? 'button' : 'div');
  el.className = `pic px${current && !s.choosing ? ' current' : ''}`;
  if (reachable) el.appendChild(thumb(p, restored ? 'full' : current ? 'live' : 'corrupt'));
  else {
    const ph = document.createElement('div');
    ph.className = 'ph';
    ph.textContent = '?';
    el.appendChild(ph);
  }
  const pills: string[] = [];
  if (restored) pills.push('<span class="pill ok">Restored</span>');
  if (current && !s.choosing) pills.push('<span class="pill hot">Open now</span>');
  if (prog?.caught) pills.push('<span class="pill ok">Dead Pixel caught</span>');
  const name = reachable ? p.name : 'Locked file';
  const file = restored ? p.file : fileName(p, prog?.best ?? 0, false, 0);
  const meta: string[] = [];
  if (reachable) {
    meta.push(`<span>${p.special != null ? `New pixel: <b>${TYPE_NAME[p.special]}</b>. ` : ''}${esc(p.rule)}</span>`);
    meta.push(`<span>Good for: <b>${esc(p.favors)}</b></span>`);
    meta.push(`<span>Perk: <b>${esc(p.perk)}</b>${restored ? ', yours for good' : ' once restored'}</span>`);
    if (p.hpMult > 1) meta.push(`<span>Rock ×${fmt(p.hpMult)} tougher, ink ×${fmt(p.yieldMult)}, Bits ×${p.bitMult}</span>`);
    if (prog?.runs)
      meta.push(
        `<span>Best <b>${prog.best.toFixed(1)}%</b> · ${prog.runs} run${prog.runs === 1 ? '' : 's'} · ${prog.defrags} defrag${prog.defrags === 1 ? '' : 's'}</span>`,
      );
  } else {
    const prev = PICTURES[p.num - 2];
    meta.push(`<span>Restore <b>${esc(prev?.name ?? 'the previous picture')}</b> to open this file.</span>`);
  }
  if (action === 'choose') meta.push(`<span><b>${restored ? 'Replay it for Bits' : 'Open it'}</b></span>`);
  if (action === 'switch') meta.push('<span><b>Switch to this picture</b></span>');
  const info = document.createElement('div');
  info.style.display = 'grid';
  info.style.gap = '8px';
  info.innerHTML = `<div><h3>${esc(name)}</h3><span class="fname">${esc(file)}</span></div>${pills.length ? `<div class="tagline">${pills.join('')}</div>` : ''}<div class="meta">${meta.join('')}</div>`;
  el.appendChild(info);
  if (action === 'choose') el.addEventListener('click', () => onChoose(p.id));
  if (action === 'switch') el.addEventListener('click', () => onSwitch(p.id));
  return el;
}

/** Leaving a run early pays nothing, so it asks first. It is the way out of a picture that is still too hard. */
function onSwitch(pid: string): void {
  const s = G.sim;
  const to = PICTURES.find(p => p.id === pid);
  if (!to) return;
  showModal(
    `Open ${to.name}?`,
    `<p>This run on ${esc(s.pic.name)} ends without Bits. You lose its ink, upgrades, bugs and rigs. Tools and Bits stay yours.</p>`,
    [
      { label: 'Stay', fn: closeModal },
      {
        label: `Open ${to.file}`,
        hot: true,
        fn: () => {
          closeModal();
          if (s.abandon()) onChoose(pid);
        },
      },
    ],
  );
}

export function refreshGallery(): void {
  const s = G.sim;
  const choices = new Set(s.choices().map(p => p.id));
  const choosing = s.choosing;
  $('#gal-title').textContent = choosing ? 'Choose the next picture' : 'Gallery';
  $('#gal-sub').textContent = choosing
    ? 'Open any file you have reached. Pictures you restored replay without their Dead Pixel, for Bits.'
    : 'Your lost photo folder. Restore a picture to keep its perk for good.';
  $('#gal-close').hidden = choosing;
  const note = $('#gal-note');
  const kept = choosing && s.carry ? CURS.filter(c => (s.carry?.[c] ?? 0) >= 1) : [];
  const parts: string[] = [];
  if (choosing && s.profile.bits > 0)
    parts.push(
      `You have ${fmt(s.profile.bits)} Bits. Spend them in the Bit tree (B) before you pick, so upgrades that start a run apply to this one.`,
    );
  if (kept.length)
    parts.push(`Swap File kept ${kept.map(c => `${fmt(s.carry?.[c] ?? 0)} ${CUR_LABEL[c].toLowerCase()}`).join(', ')} for the next run.`);
  note.textContent = parts.join(' ');
  note.hidden = !parts.length;
  const grid = $('#gal-grid');
  grid.innerHTML = '';
  for (const p of PICTURES) {
    const reachable = choices.has(p.id) || !!s.profile.pictures[p.id]?.runs;
    const action: CardAction = !choices.has(p.id) ? null : choosing ? 'choose' : p.id !== s.pic.id ? 'switch' : null;
    grid.appendChild(card(p, action, reachable));
  }
  if (!choosing)
    for (const f of LOCKED_FILES.slice(0, 3)) {
      const el = document.createElement('div');
      el.className = 'pic px';
      el.innerHTML = `<div class="ph">?</div><div><h3>Unrecovered</h3><span class="fname">${esc(f)}</span></div><div class="meta"><span>Still too corrupted to open.</span></div>`;
      grid.appendChild(el);
    }
  const frags = $('#frags');
  frags.innerHTML = '';
  for (const p of PICTURES) {
    const got = s.profile.fragments.includes(p.id);
    const el = document.createElement('div');
    el.className = `frag px${got ? '' : ' locked'}`;
    el.innerHTML = got
      ? `<span class="stamp">${esc(p.fragment.stamp)}</span><p>${esc(p.fragment.text)}</p>`
      : `<span class="stamp">${esc(fileName(p, 0, false, 3))} · ??:?? AM</span><p>Catch the Dead Pixel in ${choices.has(p.id) ? esc(p.name) : 'a later picture'} to recover this note.</p>`;
    frags.appendChild(el);
  }
  $('#journal').hidden = choosing;
}
