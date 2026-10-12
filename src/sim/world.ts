import { BASE_HP, BLUE, E, GLITCH, GREEN, hpAt, redAt, STATIC } from '../content/pixels';
import { IdxSet } from '../core/idxset';

/** The pixel grid of one run. The renderer drains `dirty` each frame; the simulation never draws. */
export class World {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  readonly cells: Uint8Array;
  readonly hp: Float32Array;
  readonly ring: Uint8Array;
  /** Distance from the center with a little noise, in cells on the 192-pixel scale. Drives health and yield. */
  readonly depth: Float32Array;
  /** Tile variant per cell, used only for drawing. */
  readonly vari: Uint8Array;
  readonly blue: IdxSet;
  readonly green: IdxSet;
  readonly glitch: IdxSet;
  readonly statics: IdxSet;
  readonly dmg: IdxSet;
  readonly dirty: IdxSet;
  emptyCount = 0;
  hpMult = 1;
  /** Called whenever a solid cell becomes empty. */
  onEmpty: ((i: number) => void) | null = null;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    const n = this.n;
    this.cells = new Uint8Array(n);
    this.hp = new Float32Array(n);
    this.ring = new Uint8Array(n);
    this.depth = new Float32Array(n);
    this.vari = new Uint8Array(n);
    this.blue = new IdxSet(n);
    this.green = new IdxSet(n);
    this.glitch = new IdxSet(n);
    this.statics = new IdxSet(n);
    this.dmg = new IdxSet(n);
    this.dirty = new IdxSet(n);
  }

  maxHp(t: number, i: number): number {
    // static has to die to one hit, so it toughens with depth only as fast as red blasts grow
    return BASE_HP[t] * (t === STATIC ? redAt(this.depth[i]) : hpAt(this.depth[i])) * this.hpMult;
  }

  setCell(i: number, t: number): void {
    const old = this.cells[i];
    if (old === BLUE) this.blue.remove(i);
    else if (old === GREEN) this.green.remove(i);
    else if (old === GLITCH) this.glitch.remove(i);
    else if (old === STATIC) this.statics.remove(i);
    if (old === E && t !== E) this.emptyCount--;
    else if (old !== E && t === E) this.emptyCount++;
    this.cells[i] = t;
    this.hp[i] = t ? this.maxHp(t, i) : 0;
    this.dmg.remove(i);
    if (t === BLUE) this.blue.add(i);
    else if (t === GREEN) this.green.add(i);
    else if (t === GLITCH) this.glitch.add(i);
    else if (t === STATIC) this.statics.add(i);
    if (t !== E && t !== GLITCH && t !== STATIC && this.vari[i] > 3) this.vari[i] &= 3;
    this.dirty.add(i);
    if (t === E && old !== E && this.onEmpty) this.onEmpty(i);
  }

  /** Rebuild health, counts and type sets from `cells`. */
  initDerived(): void {
    this.blue.clear();
    this.green.clear();
    this.glitch.clear();
    this.statics.clear();
    this.dmg.clear();
    this.emptyCount = 0;
    for (let i = 0; i < this.n; i++) {
      const t = this.cells[i];
      this.hp[i] = t ? this.maxHp(t, i) : 0;
      if (!t) this.emptyCount++;
      else if (t === BLUE) this.blue.add(i);
      else if (t === GREEN) this.green.add(i);
      else if (t === GLITCH) this.glitch.add(i);
      else if (t === STATIC) this.statics.add(i);
    }
  }

  reveal(): number {
    return (this.emptyCount / this.n) * 100;
  }

  solidAt(x: number, y: number): boolean {
    return x < 0 || y < 0 || x >= this.w || y >= this.h || this.cells[y * this.w + x] !== E;
  }

  /** True when any of the four neighbors is empty. */
  isOpen(i: number): boolean {
    const x = i % this.w;
    const y = (i / this.w) | 0;
    const c = this.cells;
    return (x > 0 && !c[i - 1]) || (x < this.w - 1 && !c[i + 1]) || (y > 0 && !c[i - this.w]) || (y < this.h - 1 && !c[i + this.w]);
  }

  /** True when every neighbor inside the picture is solid. */
  isBuried(i: number): boolean {
    const x = i % this.w;
    const y = (i / this.w) | 0;
    if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) return false;
    const c = this.cells;
    return !!(c[i] && c[i - 1] && c[i + 1] && c[i - this.w] && c[i + this.w]);
  }

  isNeighbor(a: number, b: number): boolean {
    const d = a - b;
    if (d === this.w || d === -this.w) return true;
    if (d === 1 || d === -1) return ((a / this.w) | 0) === ((b / this.w) | 0);
    return false;
  }
}
