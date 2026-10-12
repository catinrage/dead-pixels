import { audioInit } from '../audio';
import { $ } from '../dom';
import { G } from '../state';

/** The two full-screen overlays (trees, gallery) and the three drawers. One is open at a time. */
export type PanelId = 'tree' | 'gallery' | 'auto' | 'help' | 'settings';
export type TreeTab = 'run' | 'bits';

const IDS: PanelId[] = ['tree', 'gallery', 'auto', 'help', 'settings'];
const hooks: Partial<Record<PanelId, (tab?: TreeTab) => void>> = {};
let treeTab: TreeTab = 'run';

const el = (id: PanelId): HTMLElement => $(`#${id}`);
export const isOpen = (id: PanelId): boolean => !el(id).hidden;
export const currentTab = (): TreeTab => treeTab;

/** Run when a panel opens (and when the tree switches tabs), to fill it in. */
export function onPanelOpen(id: PanelId, fn: (tab?: TreeTab) => void): void {
  hooks[id] = fn;
}

export function openPanel(id: PanelId, tab?: TreeTab): void {
  if (id === 'tree' && tab) treeTab = tab;
  for (const k of IDS) el(k).hidden = k !== id;
  hooks[id]?.(treeTab);
  refreshMenu();
}

/** Closing everything while a new picture must be chosen lands back on the gallery. */
export function closePanels(): void {
  if (G.sim.choosing && !G.moment) {
    if (!isOpen('gallery')) openPanel('gallery');
    else for (const k of IDS) el(k).hidden = k !== 'gallery';
    refreshMenu();
    return;
  }
  for (const k of IDS) el(k).hidden = true;
  refreshMenu();
}

/** Keys and menu buttons toggle; for the tree, a different tab switches instead of closing. */
export function togglePanel(id: PanelId, tab?: TreeTab): void {
  if (isOpen(id) && (id !== 'tree' || !tab || tab === treeTab)) closePanels();
  else openPanel(id, tab);
}

export function refreshMenu(): void {
  for (const b of document.querySelectorAll<HTMLElement>('.mbtn')) {
    const p = b.dataset.panel as string;
    const on =
      p === 'bits' ? isOpen('tree') && treeTab === 'bits' : p === 'tree' ? isOpen('tree') && treeTab === 'run' : isOpen(p as PanelId);
    b.classList.toggle('on', on);
  }
}

/** Something covers the world, so the pointer should not dig. */
export const worldCovered = (): boolean => isOpen('tree') || isOpen('gallery') || !$('#modal').hidden || !$('#start').hidden || G.moment;

export function bindPanels(): void {
  for (const b of document.querySelectorAll<HTMLElement>('.mbtn'))
    b.addEventListener('click', () => {
      audioInit();
      const p = b.dataset.panel as string;
      if (p === 'bits') togglePanel('tree', 'bits');
      else if (p === 'tree') togglePanel('tree', 'run');
      else togglePanel(p as PanelId);
    });
  for (const b of document.querySelectorAll<HTMLElement>('[data-close]')) b.addEventListener('click', closePanels);
}
