/** 9×9 pixel icons drawn from text maps. 'a' takes the accent color; '.' is transparent. */

const PAL: Record<string, string> = {
  w: '#efe9ff',
  g: '#8f88b0',
  d: '#2a2340',
  k: '#0b0912',
  r: '#ff4d5e',
  b: '#3ab8ff',
  n: '#4fe07a',
  y: '#ffcc33',
  p: '#c86bff',
  c: '#2bf0ff',
  m: '#ff3df2',
  o: '#c08a52',
  l: '#2d8a4a',
  s: '#ff9fc2',
};

export const ICONS: Record<string, string[]> = {
  eraser: ['.....ww..', '....wssw.', '...wssssw', '..wssssw.', '.wwwwsw..', 'wgggwww..', 'wggggw...', '.wwww....', '.........'],
  brush: ['.......oo', '......oo.', '.....oo..', '....gg...', '...gwg...', '..ccg....', '.cccc....', 'ccc......', 'c........'],
  bomb: ['......y..', '.....y.y.', '....w....', '..gggg...', '.gggggg..', '.gwgggg..', '.gggggg..', '.gggggg..', '..gggg...'],
  laser: ['........m', '.......m.', '......m..', '.....m...', 'gggg.m...', 'gwwgm....', 'gggg.....', '.g.......', '.g.......'],
  prism: ['....w....', '...w.w...', '...w.w..r', '..w...wyy', '..w...nn.', '.w...bw..', '.wwwwwww.', '.........', '.........'],
  smudge: ['.........', '.......ss', '......sss', '.....sss.', '..bbsss..', '.bbbbs...', 'bbbbbb...', '.bbbb....', '..bb.....'],
  critter: ['.l.....l.', '..l...l..', '..nnnnn..', '.nwnnnwn.', '.nknnnkn.', '.nnnnnnn.', '..nnnnn..', '.l.l.l.l.', '.........'],
  rig: ['...ccc...', '...cwc...', '..ggggg..', '..gdddg..', '..gdcdg..', '..gdddg..', '.ggggggg.', '.g.....g.', 'gg.....gg'],
  tree: ['....m....', '...mwm...', '....w....', '.c..w..y.', 'cwc.w.ywy', '.c.www.y.', '...w.w...', '..n...b..', '.nwn.bwb.'],
  gear: ['...w.w...', '..wwwww..', '.www.www.', 'wwg...gww', '.w.....w.', 'wwg...gww', '.www.www.', '..wwwww..', '...w.w...'],
  help: ['..wwwww..', '.ww...ww.', '.....ww..', '....ww...', '....w....', '....w....', '.........', '....w....', '.........'],
  lock: ['...ggg...', '..g...g..', '..g...g..', '.wwwwwww.', '.wgggggw.', '.wgg.ggw.', '.wgg.ggw.', '.wgggggw.', '.wwwwwww.'],
  arm: ['.........', '.........', '..a...a..', '.aa...aa.', 'aaaaaaaaa', '.aa...aa.', '..a...a..', '.........', '.........'],
  boot: ['.........', '..aaa....', '..aaa....', '..aaa....', '..aaa....', '..aaaaa..', '..aaaaaa.', '..wwwwww.', '.........'],
  drop: ['....a....', '....a....', '...aaa...', '..aaaaa..', '.aawaaaa.', '.awaaaaa.', '.aaaaaaa.', '..aaaaa..', '...aaa...'],
  bolt: ['.....aa..', '....aa...', '...aa....', '..aaaaa..', '....aa...', '...aa....', '..aa.....', '.aa......', '.........'],
  clover: ['..aa.aa..', '.aaaaaaa.', '.aaaaaaa.', '..aaaaa..', '.aaaaaaa.', '.aaaaaaa.', '..aa.aa..', '....w....', '....w....'],
  echo: ['....a....', '.a..a..a.', '..a.a.a..', '...www...', 'aaawwwaaa', '...www...', '..a.a.a..', '.a..a..a.', '....a....'],
  ring: ['...aaa...', '.aa...aa.', '.a.....a.', 'a...w...a', 'a..www..a', 'a...w...a', '.a.....a.', '.aa...aa.', '...aaa...'],
  clock: ['..aaaaa..', '.a..w..a.', 'a...w...a', 'a...w...a', 'a...www.a', 'a.......a', 'a.......a', '.a.....a.', '..aaaaa..'],
  chain: ['.........', 'aaa......', 'a.a......', 'aaaaa....', '..a.a....', '..aaaaa..', '....a.a..', '....aaa..', '.........'],
  bag: ['...aaa...', '....a....', '..aaaaa..', '.aaaaaaa.', '.aawwwaa.', '.aaawaaa.', '.aawwwaa.', '.aaaaaaa.', '..aaaaa..'],
  star: ['....a....', '....a....', '...aaa...', 'aaaawaaaa', '.aawwwaa.', '..aaaaa..', '..aa.aa..', '.aa...aa.', '.a.....a.'],
  eye: ['.........', '...aaa...', '.aa...aa.', 'a..www..a', 'a..wkw..a', 'a..www..a', '.aa...aa.', '...aaa...', '.........'],
  arrow: ['.........', '.....a...', '.....aa..', 'aaaaaaaa.', 'aaaaaaaaa', 'aaaaaaaa.', '.....aa..', '.....a...', '.........'],
  sparkle: ['....a....', '....a....', '...awa...', 'aaawwwaaa', '...awa...', '....a....', '....a....', '.a.....a.', '.........'],
  gem: ['.........', '..aaaaa..', '.awaaaaa.', 'awaaaaaaa', '.aaaaaaa.', '..aaaaa..', '...aaa...', '....a....', '.........'],
  shield: ['.aaaaaaa.', '.awwwwwa.', '.aw.a.wa.', '.aw.a.wa.', '.awaaawa.', '..awwwa..', '..aw.wa..', '...aaa...', '....a....'],
  leaf: ['......aaa', '....aaaaa', '...aaawaa', '..aaawaaa', '..aawaaa.', '..awaaa..', '.wwaa....', '.w.......', 'w........'],
  brain: ['..aa.aa..', '.aaaaaaa.', 'aawaawaaa', 'aaaaaaaaa', 'aaawaaawa', '.aaaaaaa.', '..aaaaa..', '....w....', '....w....'],
  heart: ['.........', '.aa...aa.', 'aaaa.aaaa', 'aawaaaaaa', 'aaaaaaaaa', '.aaaaaaa.', '..aaaaa..', '...aaa...', '....a....'],
  crown: ['.........', 'a...a...a', 'aa.aaa.aa', 'aaaaaaaaa', 'aawaaawaa', 'aaaaaaaaa', '.wwwwwww.', '.........', '.........'],
  flask: ['...www...', '....w....', '....w....', '...w.w...', '..w...w..', '.waaaaaw.', 'waaaaaaaw', 'waaaaaaaw', '.wwwwwww.'],
  glitch: ['mm..cc..m', 'mm..cc..m', '..mm..cc.', '..mm..cc.', 'cc..mm...', 'cc..mm..c', '..cc..mm.', '..cc..mm.', 'm...cc..m'],
  sun: ['a...a...a', '.a..a..a.', '...aaa...', '..aawaa..', 'aaawwwaaa', '..aawaa..', '...aaa...', '.a..a..a.', 'a...a...a'],
  cursor: ['w........', 'ww.......', 'waw......', 'waaw.....', 'waaaw....', 'waaaaw...', 'waaww....', 'ww.aw....', '....ww...'],
  chip: ['..a.a.a..', '.wwwwwww.', 'awgggggwa', '.wgaaagw.', 'awgaaagwa', '.wgaaagw.', 'awgggggwa', '.wwwwwww.', '..a.a.a..'],
  radar: ['..aaaaa..', '.a.....a.', 'a..aaa..a', 'a.a...a.a', 'a.a.w.a.a', 'a.a..wa.a', 'a..aaawwa', '.a.....a.', '..aaaaa..'],
  marquee: ['ww.ww.ww.', 'w.......w', '.........', 'w.......w', 'w.......w', '.........', 'w.......w', '.ww.ww.ww', '.........'],
  gallery: ['wwwwwwwww', 'w.......w', 'w.y.....w', 'w.....n.w', 'w....nnnw', 'w.n.nnnnw', 'wnnnnnnnw', 'wwwwwwwww', '.........'],
  restore: ['..aaaa...', '.a....a..', 'a......a.', 'a.....aaa', 'a......a.', 'a........', '.a....a..', '..aaaa...', '.........'],
  defrag: ['aaa.www..', 'aaa.www..', '.........', 'ww.aaa.ww', 'ww.aaa.ww', '.........', 'aaaaww.aa', 'aaaaww.aa', '.........'],
  deadpx: ['....m....', '.m.....m.', '..wwwww..', '..wkkkw..', 'm.wkkkw.m', '..wkkkw..', '..wwwww..', '.m.....m.', '....m....'],
  journal: ['.wwwwwww.', '.wgggggw.', '.wwwwwww.', '.wgggggw.', '.wwwwwww.', '.wgggw.w.', '.wwwwwww.', '.........', '.........'],
};

const ACCENT: Record<string, string> = {
  brain: '#4fe07a',
  flask: '#3ab8ff',
  cursor: '#ff3df2',
  chip: '#2bf0ff',
  radar: '#ff3df2',
  restore: '#2bf0ff',
  defrag: '#ff3df2',
};
const cache = new Map<string, string>();

function draw(map: string[], color: (ch: string) => string | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = map[0].length;
  c.height = map.length;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  for (let y = 0; y < map.length; y++)
    for (let x = 0; x < map[y].length; x++) {
      const col = color(map[y][x]);
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  return c;
}

/** A data URL for an icon, cached per accent. */
export function iconURL(name: string, accent?: string): string {
  const a = accent || ACCENT[name] || '#efe9ff';
  const key = name + a;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = draw(ICONS[name] || ICONS.help, ch => (ch === '.' ? null : ch === 'a' ? a : PAL[ch] || '#fff')).toDataURL();
  cache.set(key, url);
  return url;
}

export function spriteFrom(map: string[], pal: Record<string, string>): HTMLCanvasElement {
  return draw(map, ch => (ch === '.' ? null : pal[ch]));
}

const ARROW = [
  'k.......',
  'kk......',
  'kwk.....',
  'kwwk....',
  'kwwwk...',
  'kwwwwk..',
  'kwwwwwk.',
  'kwwwwwwk',
  'kwwwkkkk',
  'kwkwk...',
  'kk.kwk..',
  'k...kwk.',
  '.....kk.',
];
const BUG_A = ['.l....l.', '..l..l..', '.nnnnnn.', 'nnwnnwnn', 'nnknnknn', 'nnnnnnnn', '.nnnnnn.', 'l.l..l.l'];
const BUG_B = ['..l..l..', '.l....l.', '.nnnnnn.', 'nnwnnwnn', 'nnknnknn', 'nnnnnnnn', '.nnnnnn.', '.l.ll.l.'];

export interface Sprites {
  arrow: HTMLCanvasElement;
  arrowM: HTMLCanvasElement;
  arrowC: HTMLCanvasElement;
  bug: [HTMLCanvasElement, HTMLCanvasElement];
}

export function makeSprites(): Sprites {
  const bugPal = { l: '#2d8a4a', n: '#4fe07a', w: '#ffffff', k: '#0b0912' };
  return {
    arrow: spriteFrom(ARROW, { k: '#0b0912', w: '#ffffff' }),
    arrowM: spriteFrom(ARROW, { k: '#ff3df2', w: '#ff3df2' }),
    arrowC: spriteFrom(ARROW, { k: '#2bf0ff', w: '#2bf0ff' }),
    bug: [spriteFrom(BUG_A, bugPal), spriteFrom(BUG_B, bugPal)],
  };
}

/** Fill every <img data-icon> in a subtree. */
export function hydrateIcons(root: ParentNode = document): void {
  for (const im of root.querySelectorAll<HTMLImageElement>('img[data-icon]'))
    im.src = iconURL(im.dataset.icon as string, im.dataset.accent);
}
