import type { PictureDef } from '../../content/pictures';
import { CUR_COLOR, CURS, type Cur } from '../../content/pixels';
import { fmt } from '../../core/num';
import { bayer } from '../../images/procedural';
import type { Inks } from '../../sim/types';
import { SFX } from '../audio';
import { $, esc } from '../dom';
import { pictureData } from '../render';
import { G } from '../state';

/** Full-screen beats for Defrag and Restore. The world waits while one plays. */

const reduced = ((): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();

function show(html: string): HTMLElement {
  const m = $('#moment');
  m.innerHTML = html;
  m.hidden = false;
  G.moment = true;
  return m;
}

function hide(): void {
  const m = $('#moment');
  m.hidden = true;
  m.innerHTML = '';
  G.moment = false;
}

function animate(dur: number, frame: (t: number) => void, end: () => void): void {
  if (reduced) {
    frame(1);
    end();
    return;
  }
  const t0 = performance.now();
  const tick = (now: number): void => {
    const t = Math.min(1, (now - t0) / dur);
    frame(t);
    if (t < 1) requestAnimationFrame(tick);
    else end();
  };
  requestAnimationFrame(tick);
}

/** A disk defragmenter: the run's pixels, scattered, slide into order block by block. */
export function playDefrag(o: { gain: number; bits: number; file: string; totals: Inks }, done: () => void): void {
  const W = 64;
  const H = 26;
  const N = W * H;
  const m = show(`<div class="moment-card">
    <canvas class="defrag-cv" width="${W}" height="${H}" aria-hidden="true"></canvas>
    <p class="mono" id="mo-status">Defragmenting ${esc(o.file)}</p>
    <div class="progress"><i id="mo-bar"></i></div>
    <h2 id="mo-title" hidden></h2>
    <p id="mo-sub" hidden></p>
    <div class="start-actions" id="mo-actions" hidden><button class="btn px" id="mo-bits">Spend Bits</button><button class="btn px btn-primary" id="mo-go">Continue</button></div>
  </div>`);
  const cv = m.querySelector('canvas') as HTMLCanvasElement;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  // blocks by color, in proportion to the ink this run collected; a fifth are free space
  const total = CURS.reduce((a, c) => a + o.totals[c], 0) || 1;
  const order: (Cur | null)[] = [];
  for (const c of CURS) {
    const share = c === 'gray' ? Math.max(0.35, o.totals[c] / total) : o.totals[c] / total;
    const k = Math.round(share * N * 0.8);
    for (let j = 0; j < k && order.length < N * 0.8; j++) order.push(c);
  }
  while (order.length < N) order.push(null);
  const scrambled = order.slice();
  for (let i = N - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
  }
  const color = (c: Cur | null): string => (c ? CUR_COLOR[c] : '#120f1d');
  const bar = $('#mo-bar');
  const status = $('#mo-status');
  SFX.defrag();
  animate(
    2200,
    t => {
      const k = Math.floor(t * N);
      for (let i = 0; i < N; i++) {
        g.fillStyle = color(i < k ? order[i] : scrambled[i]);
        g.fillRect(i % W, (i / W) | 0, 1, 1);
      }
      if (k < N) {
        g.fillStyle = '#ffffff';
        g.fillRect(k % W, (k / W) | 0, 1, 1);
        for (let j = 0; j < 6; j++) {
          const a = k + ((Math.random() * (N - k)) | 0);
          const b = k + ((Math.random() * (N - k)) | 0);
          [scrambled[a], scrambled[b]] = [scrambled[b], scrambled[a]];
        }
      }
      bar.style.width = `calc(${(t * 100).toFixed(1)}% - 4px)`;
      status.textContent = t < 1 ? `Defragmenting ${o.file} · ${Math.floor(t * 100)}%` : `${o.file} · defragmented`;
    },
    () => {
      SFX.bit();
      const title = $('#mo-title');
      title.textContent = `+${fmt(o.gain)} Bits`;
      title.hidden = false;
      const sub = $('#mo-sub');
      sub.textContent = `You have ${fmt(o.bits)} Bits. Every Bit adds 2% ink for good, and the Bit tree turns them into upgrades that last through every reset.`;
      sub.hidden = false;
      $('#mo-actions').hidden = false;
      const finish = (bits: boolean): void => {
        hide();
        done();
        if (bits) document.dispatchEvent(new CustomEvent('dp:open-bits'));
      };
      $('#mo-go').addEventListener('click', () => finish(false));
      $('#mo-bits').addEventListener('click', () => finish(true));
      ($('#mo-go') as HTMLButtonElement).focus();
    },
  );
}

/** The whole picture, revealed one dither step at a time from the middle out. */
export function playRestore(o: { pic: PictureDef; gain: number; bits: number; fragment: boolean }, done: () => void): void {
  const p = o.pic;
  const n = p.size;
  const frag = o.fragment
    ? `<div class="frag px"><span class="stamp">${esc(p.fragment.stamp)}</span><p>${esc(p.fragment.text)}</p></div>`
    : '';
  const m = show(`<div class="moment-card">
    <canvas width="${n}" height="${n}" aria-label="${esc(p.name)}, restored"></canvas>
    <h2>Restored</h2>
    <p class="mono">${esc(p.file)}</p>
    <p>+${fmt(o.gain)} Bits. Perk kept for good: <b>${esc(p.perk)}</b>.</p>
    ${frag}
    <div class="start-actions" id="mo-actions" hidden><button class="btn px btn-primary" id="mo-go">Continue</button></div>
  </div>`);
  const cv = m.querySelector('canvas') as HTMLCanvasElement;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  const src = pictureData(p);
  const img = new ImageData(n, n);
  const d = img.data;
  const half = n / 2;
  const maxD = Math.hypot(half, half);
  SFX.restored();
  animate(
    1800,
    t => {
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const o4 = (y * n + x) * 4;
          const th = (Math.hypot(x - half, y - half) / maxD) * 0.75 + bayer(x, y) * 0.25;
          const on = th < t * 1.02;
          d[o4] = on ? src[o4] : 10;
          d[o4 + 1] = on ? src[o4 + 1] : 8;
          d[o4 + 2] = on ? src[o4 + 2] : 16;
          d[o4 + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    },
    () => {
      $('#mo-actions').hidden = false;
      $('#mo-go').addEventListener('click', () => {
        hide();
        done();
      });
      ($('#mo-go') as HTMLButtonElement).focus();
    },
  );
}
