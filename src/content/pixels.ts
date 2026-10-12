/** Pixel types and their numbers. Everything hardens and pays more with depth; rings only set the look and the mix. */

export type Cur = 'gray' | 'red' | 'blue' | 'green' | 'gold' | 'shard';
export const CURS: readonly Cur[] = ['gray', 'red', 'blue', 'green', 'gold', 'shard'];
export const CUR_LABEL: Record<Cur, string> = {
  gray: 'Gray ink',
  red: 'Red ink',
  blue: 'Blue ink',
  green: 'Green ink',
  gold: 'Gold',
  shard: 'Shards',
};
export const CUR_COLOR: Record<Cur, string> = {
  gray: '#b4b7cc',
  red: '#ff4d5e',
  blue: '#3ab8ff',
  green: '#4fe07a',
  gold: '#ffcc33',
  shard: '#c86bff',
};
/** Inks the transmuter can make and draw from. */
export const TRANS_CURS: readonly Cur[] = ['gray', 'red', 'blue', 'green', 'gold'];
export const DIET_LABEL: Record<Cur, string> = { gray: 'Gray', red: 'Red', blue: 'Blue', green: 'Green', gold: 'Gold', shard: 'Glitch' };

export const E = 0;
export const DUST = 1;
export const STONE = 2;
export const DENSE = 3;
export const CORE = 4;
export const RED = 5;
export const BLUE = 6;
export const GREEN = 7;
export const GOLD = 8;
export const GLITCH = 9;
export const STATIC = 10;
export const ICE = 11;
export const NTYPES = 12;

export const GRAY_OF_RING = [DUST, STONE, DENSE, CORE];
export const isGray = (t: number): boolean => t >= DUST && t <= CORE;

export const TYPE_NAME = ['Empty', 'Dust', 'Stone', 'Dense rock', 'Core rock', 'Red', 'Blue', 'Green', 'Gold', 'Glitch', 'Static', 'Ice'];
export const TYPE_CUR: (Cur | null)[] = [null, 'gray', 'gray', 'gray', 'gray', 'red', 'blue', 'green', 'gold', 'shard', 'shard', 'blue'];
/** Health at the center, before depth and picture multipliers. Gray types differ only in look. */
export const BASE_HP = [0, 1, 1, 1, 1, 2, 0.6, 1.5, 20, 10, 3, 12];
/** Ink per pixel at the center, before depth and upgrades. Static and glitch pay shards their own way. */
export const BASE_YIELD = [0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1.2];
/**
 * Rock hardens smoothly with distance from the center (in cells on the 192-pixel map), and deeper pixels pay more,
 * but slower than they harden, so every run eventually hits a wall. Kept in one object so the balance simulator can try other values.
 */
export const DEPTH = { hpStep: 2.1, yieldStep: 1.25 };
export const hpAt = (d: number): number => (d <= 12 ? 1 : DEPTH.hpStep ** ((d - 12) / 10));
export const yieldAt = (d: number): number => (d <= 12 ? 1 : DEPTH.yieldStep ** ((d - 12) / 10));
/** Red blasts grow with depth too, slower than the rock. */
export const redAt = (d: number): number => hpAt(d) ** 0.6;
/** How much machines with Tracker Bugs want each type. */
export const VALUE = [0, 0, 0.1, 0.2, 0.3, 1, 0.8, 0.8, 3, 2.5, 1.2, 1];
export const TYPE_RGB: ([number, number, number] | null)[] = [
  null,
  [138, 142, 163],
  [98, 101, 124],
  [66, 67, 92],
  [43, 40, 63],
  [255, 77, 94],
  [58, 184, 255],
  [79, 224, 122],
  [255, 204, 51],
  [255, 61, 242],
  [200, 204, 222],
  [168, 226, 255],
];
export const TYPE_HEX = TYPE_RGB.map(c => (c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#000'));
