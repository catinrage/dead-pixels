import { DEFAULT_SETTINGS, type Settings } from '../sim/save';
import type { Sim } from '../sim/sim';
import type { Renderer } from './render';

/**
 * What every screen module shares. main.ts fills it in at boot; a fresh start or an imported save swaps `sim`,
 * so modules read `G.sim` each time instead of keeping their own copy.
 */
export const G = {
  sim: null as unknown as Sim,
  r: null as unknown as Renderer,
  settings: { ...DEFAULT_SETTINGS } as Settings,
  /** The start screen was dismissed. */
  started: false,
  /** A full-screen moment (Defrag, Restore) is playing; the world waits for it. */
  moment: false,
  save: (): void => {},
  /** Redraw every panel from the simulation. */
  refresh: (): void => {},
};
