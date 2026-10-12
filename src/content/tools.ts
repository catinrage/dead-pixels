/** Tools on the hotbar. A tool stays yours once unlocked, through every reset. */
export interface ToolDef {
  id: string;
  name: string;
  icon: string;
  /** Run tree node that unlocks it, if any. */
  node: string | null;
  hint: string;
}

export const ERASER = 0;
export const BRUSH = 1;
export const BOMB = 2;
export const LASER = 3;
export const PRISM = 4;
export const SMUDGE = 5;

export const TOOLS: readonly ToolDef[] = [
  { id: 'eraser', name: 'Eraser', icon: 'eraser', node: null, hint: 'hold to erase toward the cursor' },
  { id: 'brush', name: 'Brush', icon: 'brush', node: 'drill', hint: 'a wide head that grinds a cluster' },
  { id: 'bomb', name: 'Bombs', icon: 'bomb', node: 'd_bomb', hint: 'click to throw a bomb' },
  { id: 'laser', name: 'Laser', icon: 'laser', node: 'p_laser', hint: 'right-click or T to tune it to one color' },
  { id: 'prism', name: 'Prism', icon: 'prism', node: 'a_prism', hint: 'digs, and its light cracks rock and turns gray pixels into colors' },
  { id: 'smudge', name: 'Smudge', icon: 'smudge', node: null, hint: 'hold to push blue; it wears away the rock it hits' },
];

export const TUNES = ['any', 'gray', 'red', 'blue', 'green', 'gold', 'shard'] as const;
export type Tune = (typeof TUNES)[number];
