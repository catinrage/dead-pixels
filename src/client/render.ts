import type { PictureDef } from '../content/pictures';
import {
  BLUE,
  CORE,
  CUR_COLOR,
  type Cur,
  DENSE,
  DUST,
  GLITCH,
  GOLD,
  GREEN,
  ICE,
  NTYPES,
  RED,
  STATIC,
  STONE,
  TYPE_HEX,
  TYPE_RGB,
} from '../content/pixels';
import { BOMB, BRUSH, LASER, PRISM, SMUDGE } from '../content/tools';
import { clamp, lerp } from '../core/num';
import { hash2, mulberry32 } from '../core/rng';
import { paint } from '../images/procedural';
import { landingPoint, prismTarget, smudgeCenter } from '../sim/hand';
import type { Sim } from '../sim/sim';
import { isAuto, type SimEvent, SRC } from '../sim/types';
import type { World } from '../sim/world';
import { makeSprites, type Sprites } from './icons';

/** Pixels per cell in the world canvas. */
const T = 8;
const VARIANTS = 8;
const MM_RGB = TYPE_RGB.map(c => c && ([(c[0] * 0.42) | 0, (c[1] * 0.42) | 0, (c[2] * 0.48) | 0] as const));
const CRACKS = [
  [
    [3, 3],
    [4, 4],
    [4, 2],
    [2, 4],
  ],
  [
    [3, 3],
    [4, 4],
    [4, 2],
    [2, 4],
    [5, 5],
    [1, 5],
    [5, 1],
    [6, 6],
    [2, 1],
  ],
  [
    [3, 3],
    [4, 4],
    [4, 2],
    [2, 4],
    [5, 5],
    [1, 5],
    [5, 1],
    [6, 6],
    [2, 1],
    [1, 2],
    [6, 3],
    [3, 6],
    [5, 3],
    [2, 6],
    [6, 1],
    [1, 1],
  ],
];
export const ZOOMS = [4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 32];

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  s: number;
}
interface Flash {
  kind: 'boom' | 'prism' | 'glitch' | 'melt' | 'shatter' | 'smudge' | 'caught' | 'exposed';
  x: number;
  y: number;
  R: number;
  life: number;
  max: number;
}
interface FloatText {
  x: number;
  y: number;
  txt: string;
  c: string;
  life: number;
  big?: boolean;
}
interface Flyer {
  sx: number;
  sy: number;
  t: number;
  dur: number;
  c: string;
  cur: Cur;
  wob: number;
}
interface Zap {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  c: string;
  life: number;
  max: number;
}

/** Where the scanner circle sits: it always contains the Dead Pixel but is not centered on it. */
export function scannerCircle(s: Sim): { x: number; y: number; r: number } | null {
  if (!s.dp || s.S.scannerR <= 0) return null;
  const w = s.world;
  const r = s.S.scannerR;
  const a = hash2(s.dp.i, 7, s.run.seed) * Math.PI * 2;
  const off = r * 0.55 * hash2(s.dp.i, 11, s.run.seed);
  return { x: (s.dp.i % w.w) + 0.5 + Math.cos(a) * off, y: ((s.dp.i / w.w) | 0) + 0.5 + Math.sin(a) * off, r };
}

export interface ViewState {
  /** The pointer in screen pixels, and whether it is a mouse over the canvas. */
  px: number;
  py: number;
  mouseInside: boolean;
  held: boolean;
  showReticle: boolean;
  shakeOn: boolean;
}

export class Renderer {
  readonly cv: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly mm: HTMLCanvasElement;
  readonly mmCtx: CanvasRenderingContext2D;
  vw = innerWidth;
  vh = innerHeight;
  dpr = 1;
  zoom = 14;
  camX = 96;
  camY = 96;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private atlas = document.createElement('canvas');
  private atlasData!: ImageData;
  private picCv = document.createElement('canvas');
  private worldCv = document.createElement('canvas');
  private wctx!: CanvasRenderingContext2D;
  private mmImg!: ImageData;
  private picData: Uint8ClampedArray = new Uint8ClampedArray(0);
  private vignette = document.createElement('canvas');
  private world: World | null = null;
  private sprites: Sprites;
  private glitchT = 0;
  private dpFlickerT = 2;
  private dpFlickerOn = 0;
  parts: Part[] = [];
  flashes: Flash[] = [];
  texts: FloatText[] = [];
  flyers: Flyer[] = [];
  zaps: Zap[] = [];
  /** Screen positions of the ink chips, where collected ink flies to. */
  chipPos: Partial<Record<Cur, { x: number; y: number }>> = {};
  onFlyerLanded: (cur: Cur) => void = () => {};

  constructor(cv: HTMLCanvasElement, mm: HTMLCanvasElement) {
    this.cv = cv;
    this.ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    this.mm = mm;
    this.mmCtx = mm.getContext('2d') as CanvasRenderingContext2D;
    this.sprites = makeSprites();
    this.buildAtlas();
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = innerWidth;
    this.vh = innerHeight;
    this.cv.width = Math.round(this.vw * this.dpr);
    this.cv.height = Math.round(this.vh * this.dpr);
    this.vignette.width = 256;
    this.vignette.height = 256;
    const g = this.vignette.getContext('2d') as CanvasRenderingContext2D;
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 182);
    gr.addColorStop(0, 'rgba(8,7,14,0)');
    gr.addColorStop(1, 'rgba(8,7,14,0.62)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }

  /* ---------------- tiles ---------------- */

  private buildAtlas(): void {
    this.atlas.width = T * VARIANTS;
    this.atlas.height = T * NTYPES;
    const g = this.atlas.getContext('2d') as CanvasRenderingContext2D;
    const id = g.createImageData(this.atlas.width, this.atlas.height);
    for (let t = 1; t < NTYPES; t++) for (let v = 0; v < VARIANTS; v++) paintTile(id, t, v);
    g.putImageData(id, 0, 0);
    this.atlasData = id;
  }

  /** Point the renderer at a world. A new world object means a new run: rebuild everything. */
  attach(s: Sim): void {
    if (s.world === this.world) return;
    const w = s.world;
    this.world = w;
    this.picData = pictureData(s.pic);
    this.picCv.width = w.w;
    this.picCv.height = w.h;
    (this.picCv.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(this.picData.slice(), w.w, w.h), 0, 0);
    this.worldCv.width = w.w * T;
    this.worldCv.height = w.h * T;
    this.wctx = this.worldCv.getContext('2d') as CanvasRenderingContext2D;
    this.mm.width = w.w;
    this.mm.height = w.h;
    this.mmImg = this.mmCtx.createImageData(w.w, w.h);
    this.buildWorldCanvas();
    w.dirty.clear();
    this.parts.length = 0;
    this.flashes.length = 0;
    this.texts.length = 0;
    this.zaps.length = 0;
    this.camX = s.player.x;
    this.camY = s.player.y;
  }

  private buildWorldCanvas(): void {
    const w = this.world as World;
    const id = this.wctx.createImageData(w.w * T, w.h * T);
    const d = id.data;
    const ad = this.atlasData.data;
    const aw = this.atlasData.width;
    const row = w.w * T * 4;
    for (let i = 0; i < w.n; i++) {
      const t = w.cells[i];
      if (!t) continue;
      const x = i % w.w;
      const y = (i / w.w) | 0;
      const v = w.vari[i] % VARIANTS;
      for (let ty = 0; ty < T; ty++) {
        const so = ((t * T + ty) * aw + v * T) * 4;
        d.set(ad.subarray(so, so + T * 4), (y * T + ty) * row + x * T * 4);
      }
    }
    this.wctx.putImageData(id, 0, 0);
    for (let i = 0; i < w.n; i++) {
      if (!w.cells[i]) this.drawShadow(i);
      this.mmSet(i);
    }
  }

  private drawShadow(i: number): void {
    const w = this.world as World;
    const x = i % w.w;
    const y = (i / w.w) | 0;
    const px = x * T;
    const py = y * T;
    const c = w.cells;
    const g = this.wctx;
    if (y > 0 && c[i - w.w]) {
      g.fillStyle = 'rgba(6,4,12,0.55)';
      g.fillRect(px, py, T, 2);
    }
    if (x > 0 && c[i - 1]) {
      g.fillStyle = 'rgba(6,4,12,0.45)';
      g.fillRect(px, py, 2, T);
    }
    if (y < w.h - 1 && c[i + w.w]) {
      g.fillStyle = 'rgba(6,4,12,0.25)';
      g.fillRect(px, py + T - 1, T, 1);
    }
    if (x < w.w - 1 && c[i + 1]) {
      g.fillStyle = 'rgba(6,4,12,0.25)';
      g.fillRect(px + T - 1, py, 1, T);
    }
  }

  private drawTile(i: number): void {
    const w = this.world as World;
    const x = i % w.w;
    const y = (i / w.w) | 0;
    const t = w.cells[i];
    this.wctx.clearRect(x * T, y * T, T, T);
    if (t) this.wctx.drawImage(this.atlas, (w.vari[i] % VARIANTS) * T, t * T, T, T, x * T, y * T, T, T);
    else this.drawShadow(i);
    this.mmSet(i);
  }

  private mmSet(i: number): void {
    const w = this.world as World;
    const o = i * 4;
    const t = w.cells[i];
    const d = this.mmImg.data;
    if (t) {
      const c = MM_RGB[t] as readonly number[];
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
    } else {
      d[o] = this.picData[o];
      d[o + 1] = this.picData[o + 1];
      d[o + 2] = this.picData[o + 2];
    }
    d[o + 3] = 255;
  }

  /** Redraw the cells the simulation changed, plus the shadows of their empty neighbors. */
  drainDirty(): void {
    const w = this.world;
    if (!w?.dirty.size) return;
    const items = w.dirty.items;
    const n = w.dirty.size;
    const shadows = new Set<number>();
    for (let k = 0; k < n; k++) {
      const i = items[k];
      this.drawTile(i);
      const x = i % w.w;
      const y = (i / w.w) | 0;
      if (x > 0) shadows.add(i - 1);
      if (x < w.w - 1) shadows.add(i + 1);
      if (y > 0) shadows.add(i - w.w);
      if (y < w.h - 1) shadows.add(i + w.w);
    }
    // empty neighbors redraw their shadows; solid ones did not change
    for (const i of shadows) if (!w.cells[i] && !w.dirty.has(i)) this.drawTile(i);
    w.dirty.clear();
  }

  /** Glitch and static pixels shimmer: their tile variant changes every few frames while on screen. */
  private shimmer(s: Sim, dt: number): void {
    this.glitchT -= dt;
    if (this.glitchT > 0) return;
    this.glitchT = 0.12;
    const w = s.world;
    const [x0, x1, y0, y1] = this.viewCells();
    for (const set of [w.glitch, w.statics]) {
      for (let k = 0; k < set.size; k++) {
        const i = set.items[k];
        const x = i % w.w;
        const y = (i / w.w) | 0;
        if (x < x0 || x >= x1 || y < y0 || y >= y1 || Math.random() < 0.5) continue;
        w.vari[i] = (Math.random() * VARIANTS) | 0;
        this.drawTile(i);
      }
    }
  }

  private viewCells(): [number, number, number, number] {
    const w = this.world as World;
    const hw = this.vw / 2 / this.zoom;
    const hh = this.vh / 2 / this.zoom;
    return [
      Math.max(0, Math.floor(this.camX - hw) - 1),
      Math.min(w.w, Math.ceil(this.camX + hw) + 1),
      Math.max(0, Math.floor(this.camY - hh) - 1),
      Math.min(w.h, Math.ceil(this.camY + hh) + 1),
    ];
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.camX + (sx - this.vw / 2) / this.zoom, y: this.camY + (sy - this.vh / 2) / this.zoom };
  }
  toScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.camX) * this.zoom + this.vw / 2, y: (wy - this.camY) * this.zoom + this.vh / 2 };
  }

  stepZoom(dir: number): void {
    let k = 0;
    let bd = Number.POSITIVE_INFINITY;
    ZOOMS.forEach((z, j) => {
      const d = Math.abs(z - this.zoom);
      if (d < bd) {
        bd = d;
        k = j;
      }
    });
    this.zoom = ZOOMS[clamp(k + dir, 0, ZOOMS.length - 1)];
  }

  /* ---------------- effects ---------------- */

  private debris(x: number, y: number, t: number, n: number): void {
    if (this.parts.length > 900) return;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 6;
      const c = t === GLITCH ? (Math.random() < 0.5 ? '#ff3df2' : '#2bf0ff') : TYPE_HEX[t];
      this.parts.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.4,
        max: 0.75,
        c,
        s: 0.14 + Math.random() * 0.14,
      });
    }
  }
  sparks(x: number, y: number, c: string, n: number): void {
    for (let k = 0; k < n && this.parts.length < 1000; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 7;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.15 + Math.random() * 0.2, max: 0.35, c, s: 0.1 });
    }
  }
  floatText(x: number, y: number, txt: string, c: string, big = false): void {
    if (this.texts.length < 40) this.texts.push({ x, y, txt, c, life: big ? 2 : 1.1, big });
  }
  private flyer(wx: number, wy: number, cur: Cur): void {
    const tg = this.chipPos[cur];
    if (this.flyers.length > 150 || !tg) return;
    const p = this.toScreen(wx, wy);
    if (p.x < -20 || p.y < -20 || p.x > this.vw + 20 || p.y > this.vh + 20) return;
    this.flyers.push({ sx: p.x, sy: p.y, t: 0, dur: 0.5 + Math.random() * 0.3, c: CUR_COLOR[cur], cur, wob: (Math.random() - 0.5) * 160 });
  }
  addShake(v: number): void {
    this.shake = Math.min(14, this.shake + v);
  }

  /** Turn one simulation event into something visible. Sounds and toasts are the UI's job. */
  onEvent(s: Sim, e: SimEvent): void {
    const w = s.world;
    switch (e.k) {
      case 'break': {
        const x = e.i % w.w;
        const y = (e.i / w.w) | 0;
        const auto = isAuto(e.src);
        this.debris(x, y, e.t, e.src === SRC.BLAST || e.src === SRC.SELECT ? 1 : auto ? 1 : 4);
        if (!auto && e.src !== SRC.BLAST && e.src !== SRC.SELECT) this.flyer(x + 0.5, y + 0.5, e.cur as Cur);
        else if (Math.random() < (e.src === SRC.BLAST ? 0.18 : e.src === SRC.SELECT ? 0.02 : 0.3))
          this.flyer(x + 0.5, y + 0.5, e.cur as Cur);
        if (e.crit) this.floatText(x + 0.5, y, '5×', '#ffffff');
        if (e.t === GOLD && !auto && e.src !== SRC.SELECT) this.floatText(x + 0.5, y, 'gold', '#ffcc33');
        break;
      }
      case 'boom':
        this.flashes.push({ kind: 'boom', x: e.x, y: e.y, R: e.R, life: 0.32, max: 0.32 });
        this.addShake(Math.min(9, 2 + e.R * (e.nova ? 1.6 : 0.8)));
        if (e.nova) this.floatText(e.x, e.y - e.R * 0.4, 'SUPERNOVA', '#ff4d5e', true);
        break;
      case 'fx':
        this.flashes.push({
          kind: e.kind,
          x: e.x,
          y: e.y,
          R: e.R,
          life: e.kind === 'shatter' ? 0.5 : 0.4,
          max: e.kind === 'shatter' ? 0.5 : 0.4,
        });
        if (e.kind === 'shatter') this.addShake(1.5);
        break;
      case 'zap':
        this.zaps.push({ x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, c: e.c, life: 0.22, max: 0.22 });
        break;
      case 'text':
        this.floatText(e.x, e.y, e.txt, e.c);
        break;
      case 'spark':
        this.sparks(e.x, e.y, e.c, e.n);
        break;
      case 'dp':
        if (e.what === 'exposed') this.flashes.push({ kind: 'exposed', x: e.x, y: e.y, R: 3, life: 0.6, max: 0.6 });
        else if (e.what === 'fled') {
          this.zaps.push({ x0: e.x0, y0: e.y0, x1: e.x, y1: e.y, c: '#ff3df2', life: 0.5, max: 0.5 });
          this.sparks(e.x0, e.y0, '#ff3df2', 12);
        } else if (e.what === 'dove') this.sparks(e.x0, e.y0, '#2bf0ff', 8);
        else if (e.what === 'caught') {
          this.flashes.push({ kind: 'caught', x: e.x, y: e.y, R: 6, life: 0.9, max: 0.9 });
          this.sparks(e.x, e.y, '#ffffff', 30);
          this.sparks(e.x, e.y, '#ff3df2', 20);
          this.floatText(e.x, e.y - 1, `+${e.bits} Bits`, '#2bf0ff', true);
          this.addShake(4);
        }
        break;
      default:
        break;
    }
  }

  update(s: Sim, dt: number, shakeOn: boolean): void {
    const ps = this.parts;
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      p.life -= dt;
      if (p.life <= 0) {
        ps[k] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
    }
    for (const arr of [this.flashes, this.texts, this.zaps] as { life: number }[][])
      for (let k = arr.length - 1; k >= 0; k--) {
        arr[k].life -= dt;
        if (arr[k].life <= 0) arr.splice(k, 1);
      }
    for (let k = this.flyers.length - 1; k >= 0; k--) {
      const f = this.flyers[k];
      f.t += dt / f.dur;
      if (f.t >= 1) {
        this.flyers.splice(k, 1);
        this.onFlyerLanded(f.cur);
      }
    }
    const follow = Math.min(1, dt * 7);
    this.camX += (s.player.x - this.camX) * follow;
    this.camY += (s.player.y - this.camY) * follow;
    if (this.shake > 0.05 && shakeOn) {
      this.shake *= 0.0015 ** dt;
      this.shakeX = (Math.random() - 0.5) * this.shake;
      this.shakeY = (Math.random() - 0.5) * this.shake;
    } else {
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
    this.shimmer(s, dt);
    // a buried Dead Pixel gives itself away now and then with a one-frame flicker
    this.dpFlickerT -= dt;
    if (this.dpFlickerOn > 0) this.dpFlickerOn -= dt;
    if (this.dpFlickerT <= 0) {
      this.dpFlickerT = 2.5 + Math.random() * 3.5;
      this.dpFlickerOn = 0.14;
    }
  }

  /* ---------------- drawing ---------------- */

  render(s: Sim, alpha: number, view: ViewState): void {
    const ctx = this.ctx;
    const w = s.world;
    const S = s.S;
    const zoom = this.zoom;
    const z = zoom * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#060509';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    const ox = Math.round((this.vw / 2 - this.camX * zoom + this.shakeX) * this.dpr);
    const oy = Math.round((this.vh / 2 - this.camY * zoom + this.shakeY) * this.dpr);
    ctx.setTransform(z, 0, 0, z, ox, oy);
    const [vx0, vx1, vy0, vy1] = this.viewCells();
    ctx.fillStyle = '#1a1328';
    ctx.fillRect(-0.5, -0.5, w.w + 1, w.h + 1);
    if (vx1 > vx0 && vy1 > vy0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.picCv, vx0, vy0, vx1 - vx0, vy1 - vy0, vx0, vy0, vx1 - vx0, vy1 - vy0);
      ctx.imageSmoothingEnabled = zoom < T;
      ctx.drawImage(this.worldCv, vx0 * T, vy0 * T, (vx1 - vx0) * T, (vy1 - vy0) * T, vx0, vy0, vx1 - vx0, vy1 - vy0);
      ctx.imageSmoothingEnabled = false;
    }
    // cracks on damaged pixels
    ctx.fillStyle = 'rgba(8,4,16,0.6)';
    const tex = 1 / T;
    for (let k = 0; k < w.dmg.size; k++) {
      const i = w.dmg.items[k];
      const x = i % w.w;
      const y = (i / w.w) | 0;
      if (x < vx0 || x >= vx1 || y < vy0 || y >= vy1) continue;
      const t = w.cells[i];
      if (!t) continue;
      const f = 1 - w.hp[i] / w.maxHp(t, i);
      const pts = CRACKS[f < 0.34 ? 0 : f < 0.67 ? 1 : 2];
      for (const [px, py] of pts) ctx.fillRect(x + px * tex, y + py * tex, tex, tex);
    }
    const now = performance.now() / 1000;
    this.drawDeadPixel(s, now);
    // what the hand tool is touching
    if (s.targets.length && s.run.tool !== LASER) {
      ctx.strokeStyle = s.run.tool === BRUSH ? 'rgba(43,240,255,0.75)' : 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5 / zoom;
      for (const i of s.targets) ctx.strokeRect((i % w.w) + 0.06, ((i / w.w) | 0) + 0.06, 0.88, 0.88);
    }
    // lit red fuses
    for (const b of s.blasts) {
      if (b.kind !== 'red') continue;
      ctx.fillStyle = Math.floor(now * 14) % 2 === 0 ? '#fff3e0' : '#ff4d5e';
      ctx.fillRect(b.x - 0.42, b.y - 0.42, 0.84, 0.84);
    }
    // tool previews for the mouse
    if (view.mouseInside && !view.held && view.showReticle) {
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([0.4, 0.3]);
      if (s.run.tool === BOMB && s.toolUnlocked(BOMB)) {
        const p = landingPoint(s, S.reach + 5);
        ctx.strokeStyle = 'rgba(255,77,94,0.55)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, S.bombR, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.run.tool === PRISM && s.toolUnlocked(PRISM)) {
        const p = prismTarget(s);
        ctx.strokeStyle = s.prismCd > 0 ? 'rgba(160,150,190,0.35)' : 'rgba(58,184,255,0.7)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, S.prismR, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.run.tool === SMUDGE && s.toolUnlocked(SMUDGE)) {
        const p = smudgeCenter(s);
        ctx.strokeStyle = 'rgba(58,184,255,0.55)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, S.smudgeR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (s.run.tool === SMUDGE && view.held) {
      const p = smudgeCenter(s);
      ctx.strokeStyle = `rgba(58,184,255,${0.35 + 0.2 * Math.sin(now * 20)})`;
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, S.smudgeR, 0, Math.PI * 2);
      ctx.stroke();
    }
    // rigs and their beams
    for (const r of s.rigs) {
      if (r.x < vx0 - 2 || r.x > vx1 + 2 || r.y < vy0 - 2 || r.y > vy1 + 2) continue;
      if (r.target >= 0) {
        const tx = (r.target % w.w) + 0.5;
        const ty = ((r.target / w.w) | 0) + 0.5;
        ctx.strokeStyle = `rgba(43,240,255,${0.45 + 0.35 * Math.sin(now * 40 + r.x)})`;
        ctx.lineWidth = 0.14;
        ctx.beginPath();
        ctx.moveTo(r.x + 0.5, r.y + 0.5);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = '#e8fdff';
        ctx.fillRect(tx - 0.12, ty - 0.12, 0.24, 0.24);
      }
      ctx.fillStyle = '#0b0912';
      ctx.fillRect(r.x - 0.04, r.y - 0.04, 1.08, 1.08);
      ctx.fillStyle = '#8f88b0';
      ctx.fillRect(r.x + 0.04, r.y + 0.04, 0.92, 0.92);
      ctx.fillStyle = '#1b1630';
      ctx.fillRect(r.x + 0.16, r.y + 0.16, 0.68, 0.68);
      const a = r.spin;
      const cx = r.x + 0.5;
      const cy = r.y + 0.5;
      ctx.fillStyle = r.target >= 0 ? '#2bf0ff' : '#3c6f80';
      ctx.fillRect(cx + Math.cos(a) * 0.22 - 0.09, cy + Math.sin(a) * 0.22 - 0.09, 0.18, 0.18);
      ctx.fillRect(cx - Math.cos(a) * 0.22 - 0.09, cy - Math.sin(a) * 0.22 - 0.09, 0.18, 0.18);
      ctx.fillStyle = '#efe9ff';
      ctx.fillRect(cx - 0.07, cy - 0.07, 0.14, 0.14);
    }
    // bombs in flight and on the ground
    for (const b of s.bombs) {
      const t = b.t;
      const x = lerp(b.sx, b.x, t);
      const y = lerp(b.sy, b.y, t) - Math.sin(t * Math.PI) * 1.2;
      const sz = 0.32 + Math.sin(t * Math.PI) * 0.12;
      ctx.fillStyle = '#0b0912';
      ctx.beginPath();
      ctx.arc(x, y, sz + 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = b.auto ? '#3a2a4a' : '#2a2340';
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = Math.floor(now * (t >= 1 ? 16 : 6)) % 2 ? '#ffcc33' : '#ff4d5e';
      ctx.fillRect(x + sz * 0.4, y - sz - 0.12, 0.16, 0.16);
    }
    // bugs
    for (const c of s.critters) {
      if (c.x < vx0 - 1 || c.x > vx1 + 1 || c.y < vy0 - 1 || c.y > vy1 + 1) continue;
      const f = Math.floor(c.anim) % 2;
      const jx = c.bite >= 0 ? Math.sin(c.anim * 3) * 0.05 : 0;
      ctx.globalAlpha = c.stun > 0 ? 0.45 : 1;
      ctx.drawImage(this.sprites.bug[f], c.x - 0.45 + jx, c.y - 0.45, 0.9, 0.9);
      ctx.globalAlpha = 1;
    }
    // the laser beam
    const px = lerp(s.player.px, s.player.x, alpha);
    const py = lerp(s.player.py, s.player.y, alpha);
    if (s.beam) {
      const col = s.run.tune === 'any' ? '#ff3df2' : CUR_COLOR[s.run.tune as Cur];
      ctx.lineCap = 'butt';
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(s.beam.x1, s.beam.y1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.16;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(s.beam.x1, s.beam.y1);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(s.beam.x1, s.beam.y1);
      ctx.stroke();
    }
    // Select All: marching ants around the swept square
    if (s.sel) {
      const d = s.sel.done + 0.5;
      ctx.lineWidth = 3 / zoom;
      ctx.strokeStyle = '#0b0912';
      ctx.strokeRect(s.sel.x + 0.5 - d, s.sel.y + 0.5 - d, d * 2, d * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([6 / zoom, 6 / zoom]);
      ctx.lineDashOffset = (-now * 30) / zoom;
      ctx.strokeRect(s.sel.x + 0.5 - d, s.sel.y + 0.5 - d, d * 2, d * 2);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    // the player: a mouse cursor with a chromatic split
    const aw = 0.98;
    const ah = 1.6;
    const ax = px - 0.36;
    const ay = py - 0.72;
    const wob = Math.sin(now * 2.4) * 0.05;
    ctx.globalAlpha = 0.75;
    ctx.drawImage(this.sprites.arrowM, ax - 0.08 - wob, ay, aw, ah);
    ctx.drawImage(this.sprites.arrowC, ax + 0.08 + wob, ay, aw, ah);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.sprites.arrow, ax, ay, aw, ah);
    this.drawSense(s, px, py, now);
    // particles
    for (const p of this.parts) {
      ctx.globalAlpha = clamp((p.life / p.max) * 1.4, 0, 1);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    for (const zp of this.zaps) {
      const k = zp.life / zp.max;
      ctx.strokeStyle = zp.c;
      ctx.globalAlpha = k;
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.moveTo(zp.x0, zp.y0);
      const mx = (zp.x0 + zp.x1) / 2 + (Math.random() - 0.5) * 1.2;
      const my = (zp.y0 + zp.y1) / 2 + (Math.random() - 0.5) * 1.2;
      ctx.lineTo(mx, my);
      ctx.lineTo(zp.x1, zp.y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.drawFlashes(ctx);
    // screen space
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(this.vignette, 0, 0, this.vw, this.vh);
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const p = this.toScreen(t.x, t.y);
      const sy = p.y - ((t.big ? 2 : 1.1) - t.life) * 30;
      ctx.globalAlpha = clamp(t.life * 2, 0, 1);
      ctx.font = t.big ? '34px VT323, monospace' : '22px VT323, monospace';
      ctx.fillStyle = '#0b0912';
      ctx.fillText(t.txt, p.x + 1, sy + 1);
      ctx.fillStyle = t.c;
      ctx.fillText(t.txt, p.x, sy);
    }
    ctx.globalAlpha = 1;
    for (const f of this.flyers) {
      const tg = this.chipPos[f.cur];
      if (!tg) continue;
      const mx = (f.sx + tg.x) / 2 + f.wob;
      const my = (f.sy + tg.y) / 2 - 60;
      const e = f.t * f.t * (3 - 2 * f.t);
      const x = (1 - e) * (1 - e) * f.sx + 2 * (1 - e) * e * mx + e * e * tg.x;
      const y = (1 - e) * (1 - e) * f.sy + 2 * (1 - e) * e * my + e * e * tg.y;
      ctx.fillStyle = '#0b0912';
      ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.fillStyle = f.c;
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    if (view.mouseInside && view.showReticle) {
      const x = Math.round(view.px);
      const y = Math.round(view.py);
      const inReach = s.targets.length > 0;
      ctx.fillStyle = '#0b0912';
      ctx.fillRect(x - 9, y - 2, 6, 4);
      ctx.fillRect(x + 3, y - 2, 6, 4);
      ctx.fillRect(x - 2, y - 9, 4, 6);
      ctx.fillRect(x - 2, y + 3, 4, 6);
      ctx.fillStyle = inReach ? '#2bf0ff' : '#f0eaff';
      ctx.fillRect(x - 8, y - 1, 4, 2);
      ctx.fillRect(x + 4, y - 1, 4, 2);
      ctx.fillRect(x - 1, y - 8, 2, 4);
      ctx.fillRect(x - 1, y + 4, 2, 4);
    }
  }

  private drawFlashes(ctx: CanvasRenderingContext2D): void {
    for (const f of this.flashes) {
      const k = f.life / f.max;
      if (f.kind === 'boom') {
        ctx.fillStyle = `rgba(255,236,200,${0.55 * k})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.R * (1.1 - 0.4 * k), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,110,80,${k})`;
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.R * (1.3 - 0.6 * k), 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === 'prism') {
        const cols = ['#ff4d5e', '#ffcc33', '#4fe07a', '#3ab8ff', '#c86bff'];
        ctx.lineWidth = 0.18;
        cols.forEach((c, j) => {
          ctx.strokeStyle = c;
          ctx.globalAlpha = k;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.R * (1.2 - 0.7 * k) + j * 0.18, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } else if (f.kind === 'glitch') {
        for (let j = 0; j < 6; j++) {
          ctx.fillStyle = j % 2 ? `rgba(255,61,242,${k})` : `rgba(43,240,255,${k})`;
          ctx.fillRect(f.x - f.R + Math.random() * f.R * 2, f.y - f.R + Math.random() * f.R * 2, 0.3 + Math.random() * f.R, 0.18);
        }
      } else if (f.kind === 'melt') {
        ctx.fillStyle = `rgba(120,210,255,${0.35 * k})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.R, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === 'shatter') {
        ctx.strokeStyle = `rgba(220,245,255,${k})`;
        ctx.lineWidth = 0.08;
        for (let j = 0; j < 8; j++) {
          const a = (j / 8) * Math.PI * 2 + f.x;
          const r0 = f.R * (1 - k) * 0.4;
          const r1 = f.R * (1.2 - k * 0.6);
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0);
          ctx.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
          ctx.stroke();
        }
      } else if (f.kind === 'smudge') {
        ctx.fillStyle = `rgba(58,184,255,${0.12 * k})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.R, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === 'exposed' || f.kind === 'caught') {
        const col = f.kind === 'caught' ? '255,255,255' : '255,61,242';
        ctx.strokeStyle = `rgba(${col},${k})`;
        ctx.lineWidth = 0.2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.R * (1.4 - k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(43,240,255,${k * 0.8})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.R * (1.8 - k * 1.2), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /** The Dead Pixel: a flicker while buried, a blinking black pixel with a countdown once exposed. */
  private drawDeadPixel(s: Sim, now: number): void {
    const dp = s.dp;
    if (!dp) return;
    const ctx = this.ctx;
    const w = s.world;
    const x = dp.i % w.w;
    const y = (dp.i / w.w) | 0;
    const open = w.isOpen(dp.i);
    const showBlack = dp.state === 'exposed' || open ? Math.floor(now * 4) % 4 !== 3 : this.dpFlickerOn > 0;
    if (showBlack) {
      ctx.fillStyle = '#ff3df2';
      ctx.fillRect(x - 0.08, y, 1, 1);
      ctx.fillStyle = '#2bf0ff';
      ctx.fillRect(x + 0.08, y, 1, 1);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, 1, 1);
    }
    if (dp.state === 'exposed') {
      const lw = 2 / this.zoom;
      ctx.lineWidth = lw;
      ctx.strokeStyle = Math.floor(now * 8) % 2 ? '#ffffff' : '#ff3df2';
      ctx.strokeRect(x - 0.25, y - 0.25, 1.5, 1.5);
      if (Number.isFinite(dp.t)) {
        const k = clamp(dp.t / s.S.freezeT, 0, 1);
        ctx.strokeStyle = '#2bf0ff';
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, 1.6, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
        ctx.stroke();
      }
    }
    const sc = scannerCircle(s);
    if (sc) {
      ctx.strokeStyle = 'rgba(255,61,242,0.28)';
      ctx.lineWidth = 2 / this.zoom;
      ctx.setLineDash([0.6, 0.6]);
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Pixel Sense: an arrow next to the cursor that points at a Dead Pixel within 24 pixels. */
  private drawSense(s: Sim, px: number, py: number, now: number): void {
    if (!s.dp || !s.S.sense) return;
    const w = s.world;
    const dx = (s.dp.i % w.w) + 0.5 - px;
    const dy = ((s.dp.i / w.w) | 0) + 0.5 - py;
    const d = Math.hypot(dx, dy);
    if (d > 24 || d < 1.5) return;
    const ux = dx / d;
    const uy = dy / d;
    const r = 1.6 + Math.sin(now * 6) * 0.12;
    const tx = px + ux * r;
    const ty = py + uy * r;
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(255,61,242,${0.5 + 0.5 * (1 - d / 24)})`;
    ctx.beginPath();
    ctx.moveTo(tx + ux * 0.45, ty + uy * 0.45);
    ctx.lineTo(tx - uy * 0.3, ty + ux * 0.3);
    ctx.lineTo(tx + uy * 0.3, ty - ux * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  renderMinimap(s: Sim): void {
    const g = this.mmCtx;
    g.putImageData(this.mmImg, 0, 0);
    const hw = this.vw / 2 / this.zoom;
    const hh = this.vh / 2 / this.zoom;
    g.strokeStyle = 'rgba(240,234,255,0.55)';
    g.lineWidth = 1;
    g.strokeRect(Math.round(this.camX - hw) + 0.5, Math.round(this.camY - hh) + 0.5, Math.round(hw * 2), Math.round(hh * 2));
    g.fillStyle = '#2bf0ff';
    for (const r of s.rigs) g.fillRect(r.x - 1, r.y - 1, 3, 3);
    g.fillStyle = '#4fe07a';
    for (const c of s.critters) g.fillRect(Math.floor(c.x), Math.floor(c.y), 2, 2);
    const sc = scannerCircle(s);
    if (sc) {
      g.strokeStyle = 'rgba(255,61,242,0.8)';
      g.setLineDash([3, 3]);
      g.beginPath();
      g.arc(sc.x, sc.y, sc.r, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    if (s.dp?.state === 'exposed') {
      const w = s.world;
      g.fillStyle = Math.floor(performance.now() / 200) % 2 ? '#ff3df2' : '#ffffff';
      g.fillRect((s.dp.i % w.w) - 2, ((s.dp.i / w.w) | 0) - 2, 5, 5);
    }
    const blink = Math.floor(performance.now() / 300) % 2;
    g.fillStyle = blink ? '#ffffff' : '#ff3df2';
    g.fillRect(Math.floor(s.player.x) - 2, Math.floor(s.player.y) - 2, 5, 5);
  }
}

/** The picture under the rock, as RGBA. Generated pictures would be decoded and pixelated here. */
const picCache = new Map<string, Uint8ClampedArray>();
export function pictureData(p: PictureDef): Uint8ClampedArray {
  const hit = picCache.get(p.id);
  if (hit) return hit;
  const data = p.source.kind === 'procedural' ? paint(p.source.gen, p.size) : new Uint8ClampedArray(p.size * p.size * 4);
  picCache.set(p.id, data);
  return data;
}

/** A small canvas of a picture, for the gallery. */
export function pictureCanvas(p: PictureDef): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = p.size;
  c.height = p.size;
  (c.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(pictureData(p).slice(), p.size, p.size), 0, 0);
  return c;
}

/* ---------------- tile painting ---------------- */

function paintTile(id: ImageData, t: number, v: number): void {
  const R = mulberry32(t * 131 + v * 17 + 3);
  const base = TYPE_RGB[t] as [number, number, number];
  const vs = 1 + ((v % 4) - 1.5) * 0.035;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const top = y === 0;
      const left = x === 0;
      const bot = y === T - 1;
      const right = x === T - 1;
      const edge = top || left || bot || right;
      let k = vs;
      if (t === DUST) k *= top || left ? 1.1 : bot || right ? 0.84 : 1;
      else k *= top || left ? 1.24 : bot || right ? 0.66 : 1;
      if ((top && right) || (bot && left)) k = vs * 0.94;
      let r = base[0] * k;
      let g = base[1] * k;
      let b = base[2] * k;
      const n = R();
      switch (t) {
        case DUST:
          if (!edge && n < 0.14) {
            r *= 0.88;
            g *= 0.88;
            b *= 0.9;
          }
          break;
        case STONE:
          if (!edge && n < 0.18) {
            r *= 0.8;
            g *= 0.8;
            b *= 0.83;
          } else if (!edge && n > 0.95) {
            r *= 1.18;
            g *= 1.18;
            b *= 1.18;
          }
          break;
        case DENSE:
          if (!edge && (x + y + v) % 4 === 0) {
            r *= 0.8;
            g *= 0.8;
            b *= 0.86;
          }
          break;
        case CORE:
          if (!edge && n < 0.08) {
            r = 112;
            g = 64;
            b = 190;
          } else if (!edge && n > 0.982) {
            r = 60;
            g = 230;
            b = 255;
          }
          break;
        case RED:
          if (!edge && x >= 3 && x <= 4 && y >= 3 && y <= 4) {
            r = 255;
            g = 196;
            b = 168;
          } else if (!edge && n < 0.16) {
            r *= 0.84;
            g *= 0.66;
            b *= 0.68;
          }
          break;
        case BLUE:
          if (!edge && y === 2 + (v % 4) && x >= 2 && x <= 5) {
            r = 196;
            g = 242;
            b = 255;
          } else if (!edge && n < 0.1) {
            r *= 0.85;
            g *= 0.9;
            b *= 0.95;
          }
          break;
        case GREEN:
          if (!edge && n < 0.22) {
            r *= 0.66;
            g *= 0.76;
            b *= 0.6;
          } else if (!edge && n > 0.9) {
            r = 196;
            g = 255;
            b = 176;
          }
          break;
        case GOLD:
          if (!edge && x - y === (v % 3) - 1) {
            r = 255;
            g = 246;
            b = 196;
          }
          if (!edge && x === 5 && y === 2 && v % 2 === 0) {
            r = 255;
            g = 255;
            b = 255;
          }
          break;
        case GLITCH: {
          const band = (y + v * 3 + ((x + v) >> 2)) % 8;
          const cc =
            band < 2 ? [255, 61, 242] : band < 4 ? [43, 240, 255] : band < 5 ? [24, 14, 36] : band < 7 ? [255, 61, 242] : [250, 250, 255];
          const kk = top || left ? 1 : bot || right ? 0.7 : 0.92;
          r = cc[0] * kk;
          g = cc[1] * kk;
          b = cc[2] * kk;
          if (R() < 0.12) {
            r = 255;
            g = 255;
            b = 255;
          }
          break;
        }
        case STATIC: {
          // television snow: every variant is a fresh frame of noise
          const s = R();
          const l = s < 0.3 ? 40 : s < 0.6 ? 120 : s < 0.85 ? 200 : 250;
          const kk = top || left ? 1.1 : bot || right ? 0.7 : 1;
          r = l * kk;
          g = l * kk;
          b = (l + 12) * kk;
          break;
        }
        case ICE:
          if (!edge && (x + v) % 5 === y % 5 && n < 0.8) {
            r = 240;
            g = 252;
            b = 255;
          } else if (!edge && n < 0.12) {
            r *= 0.82;
            g *= 0.9;
            b *= 0.96;
          }
          break;
      }
      const o = ((t * T + y) * id.width + (v * T + x)) * 4;
      id.data[o] = clamp(r, 0, 255);
      id.data[o + 1] = clamp(g, 0, 255);
      id.data[o + 2] = clamp(b, 0, 255);
      id.data[o + 3] = 255;
    }
}
