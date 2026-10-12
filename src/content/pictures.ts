import { hash2 } from '../core/rng';
import { ICE, STATIC } from './pixels';

/**
 * Pictures are files in a lost photo folder. Each one adds a pixel type with its own rule,
 * hides one Dead Pixel, and leaves a permanent perk once restored.
 */

export interface Fragment {
  stamp: string;
  text: string;
}

export interface PictureDef {
  id: string;
  num: number;
  name: string;
  file: string;
  size: number;
  /** Pixel type this picture adds, if any. */
  special: number | null;
  rule: string;
  favors: string;
  hpMult: number;
  yieldMult: number;
  bitMult: number;
  perk: string;
  /** Where the Dead Pixel may hide, as a distance from the center. */
  dpMin: number;
  dpMax: number;
  fragment: Fragment;
  /** How the image under the rock is made: drawn by code, or a generated image turned into pixel art. */
  source: { kind: 'procedural'; gen: 'sunset' | 'galaxy' | 'lake' } | { kind: 'image'; url: string };
}

export const PICTURES: readonly PictureDef[] = [
  {
    id: 'sunset',
    num: 1,
    name: 'Neon Sunset',
    file: 'sunset.png',
    size: 192,
    special: null,
    rule: 'The basics: gray hardens toward the edge, red explodes, blue flows, green regrows, gold pays, glitch scrambles.',
    favors: 'Any branch',
    hpMult: 1,
    yieldMult: 1,
    bitMult: 1,
    perk: 'Red blasts +1 radius',
    dpMin: 40,
    dpMax: 78,
    fragment: {
      stamp: 'sunset.png · corrupted 03:12 AM',
      text: 'first trip with the new camera. she made me pull over twice for this one. said the sky looked like a cassette cover.',
    },
    source: { kind: 'procedural', gen: 'sunset' },
  },
  {
    id: 'galaxy',
    num: 2,
    name: 'Spiral Galaxy',
    file: 'galaxy.png',
    size: 192,
    special: STATIC,
    rule: 'Static teleports away when hit, unless one hit deletes it. It pays shards.',
    favors: 'Bombs, crits and strong bites',
    hpMult: 8,
    yieldMult: 4,
    bitMult: 1.5,
    perk: '+5% crit chance',
    dpMin: 44,
    dpMax: 82,
    fragment: {
      stamp: 'galaxy.png · corrupted 03:16 AM',
      text: 'she printed this one and taped it over the bed. said every star is just a pixel somebody forgot to turn off.',
    },
    source: { kind: 'procedural', gen: 'galaxy' },
  },
  {
    id: 'lake',
    num: 3,
    name: 'Moon Lake',
    file: 'lake.png',
    size: 192,
    special: ICE,
    rule: 'Breaking one ice pixel shatters its whole cluster. Explosions melt ice into blue instead.',
    favors: 'Precision and Demolition',
    hpMult: 60,
    yieldMult: 18,
    bitMult: 2.25,
    perk: 'Unlocks the Smudge tool',
    dpMin: 48,
    dpMax: 86,
    fragment: {
      stamp: 'lake.png · corrupted 03:21 AM',
      text: 'the last weekend at the lake. I keep opening this one and closing it again. I tried to delete it twice. my hand would not do it.',
    },
    source: { kind: 'procedural', gen: 'lake' },
  },
];

export const PICTURE: Record<string, PictureDef> = Object.fromEntries(PICTURES.map(p => [p.id, p]));

/** Files the gallery shows as still unrecovered: later versions add them. */
export const LOCKED_FILES = ['IMG_04#2.p?g', 'IMG_0%5.png', 'I#G_06.p?g', 'IMG_?7.%ng', 'IM#_08.p?g', 'IMG_0#9.png', '?????.???'];

const GLYPHS = '#?%&@!*$0123456789';

/** Each letter of the file name resolves at its own reveal threshold, so the name un-garbles as you dig. */
export function fileName(p: PictureDef, reveal: number, restored: boolean, tick = 0): string {
  if (restored) return p.file;
  let out = '';
  for (let k = 0; k < p.file.length; k++) {
    const ch = p.file[k];
    const th = 6 + hash2(k, p.num, 77) * 88;
    if (ch === '.' || reveal >= th) out += ch;
    else out += GLYPHS[(hash2(k, p.num + tick, 91) * GLYPHS.length) | 0];
  }
  return out;
}
