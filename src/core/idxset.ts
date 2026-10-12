/** A set of cell indices with O(1) add, remove and random pick. */
export class IdxSet {
  items: Int32Array;
  pos: Int32Array;
  size = 0;
  constructor(n: number) {
    this.items = new Int32Array(n);
    this.pos = new Int32Array(n).fill(-1);
  }
  has(i: number): boolean {
    return this.pos[i] !== -1;
  }
  add(i: number): void {
    if (this.pos[i] !== -1) return;
    this.pos[i] = this.size;
    this.items[this.size++] = i;
  }
  remove(i: number): void {
    const p = this.pos[i];
    if (p === -1) return;
    const last = this.items[--this.size];
    this.items[p] = last;
    this.pos[last] = p;
    this.pos[i] = -1;
  }
  pick(r: number): number {
    return this.items[(r * this.size) | 0];
  }
  clear(): void {
    for (let k = 0; k < this.size; k++) this.pos[this.items[k]] = -1;
    this.size = 0;
  }
}
