import { clamp } from '../core/num';
import { cycleTool, cycleTune, doSelectAll, selectTool } from './actions';
import { applyMusic, audioInit, laserSound } from './audio';
import { closeModal, modalOpen, toast } from './dom';
import type { ViewState } from './render';
import { G } from './state';
import { refreshSettings } from './ui/drawers';
import { closePanels, togglePanel, worldCovered } from './ui/panels';

/** Mouse, touch and keyboard. The simulation reads `sim.input`; this module writes it once a frame. */

const pointer = { x: innerWidth / 2, y: innerHeight / 2, held: false, inside: false, type: 'mouse' };
const keys = { up: false, down: false, left: false, right: false };
const ptrs = new Map<number, { x: number; y: number }>();
let pinch: { d: number; z: number } | null = null;

const MOVE: Record<string, keyof typeof keys> = {
  w: 'up',
  arrowup: 'up',
  s: 'down',
  arrowdown: 'down',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
};

export interface InputHooks {
  start(): void;
}

function aimNow(): void {
  const w = G.r.toWorld(pointer.x, pointer.y);
  G.sim.input.aimX = w.x;
  G.sim.input.aimY = w.y;
}

export function bindInput(cv: HTMLCanvasElement, hooks: InputHooks): void {
  cv.addEventListener('pointerdown', e => {
    audioInit();
    if (G.started) applyMusic();
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {}
    pointer.type = e.pointerType;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.inside = true;
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: G.r.zoom };
      pointer.held = false;
      laserSound(false);
      return;
    }
    if (e.button === 2) {
      cycleTune(1);
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointer.held = true;
    if (!worldCovered()) {
      aimNow();
      G.sim.input.pressed = true;
    }
  });
  cv.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      G.r.zoom = clamp((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, 3, 40);
      return;
    }
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.type = e.pointerType;
    pointer.inside = true;
  });
  const end = (e: PointerEvent): void => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      pointer.held = false;
      laserSound(false);
    }
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse') pointer.inside = false;
  });
  cv.addEventListener('pointerenter', e => {
    if (e.pointerType === 'mouse') pointer.inside = true;
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      G.r.stepZoom(e.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );

  window.addEventListener('keydown', e => {
    const tgt = e.target as HTMLElement | null;
    if (tgt?.matches?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'a') {
      e.preventDefault();
      if (G.started && !worldCovered()) doSelectAll();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (MOVE[k]) {
      keys[MOVE[k]] = true;
      e.preventDefault();
      return;
    }
    if (!G.started) {
      if (k === 'enter' || k === ' ') {
        e.preventDefault();
        hooks.start();
      }
      return;
    }
    if (G.moment) return;
    if (k === 'escape') {
      if (modalOpen()) closeModal();
      else closePanels();
      return;
    }
    if (modalOpen()) return;
    if (k >= '1' && k <= '6') selectTool(+k - 1);
    else if (k === 'u') togglePanel('tree', 'run');
    else if (k === 'b') togglePanel('tree', 'bits');
    else if (k === 'g') togglePanel('gallery');
    else if (k === 'c') togglePanel('auto');
    else if (k === 'h') togglePanel('help');
    else if (k === 'o') togglePanel('settings');
    else if (k === 't') cycleTune(1);
    else if (k === 'q') cycleTool(-1);
    else if (k === 'e') cycleTool(1);
    else if (k === 'm') {
      G.settings.music = !G.settings.music;
      applyMusic();
      refreshSettings();
      toast(G.settings.music ? 'Music on' : 'Music off');
    } else if (k === '+' || k === '=') G.r.stepZoom(1);
    else if (k === '-' || k === '_') G.r.stepZoom(-1);
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (MOVE[k]) keys[MOVE[k]] = false;
  });
  window.addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = false;
    pointer.held = false;
    laserSound(false);
  });
}

/** Copy the pointer and keys into the simulation, once a frame before it steps. */
export function applyInput(): void {
  const inp = G.sim.input;
  const covered = worldCovered();
  aimNow();
  inp.held = pointer.held && !pinch && !covered;
  inp.moveX = covered ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  inp.moveY = covered ? 0 : (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (covered) inp.pressed = false;
}

export function viewState(): ViewState {
  return {
    px: pointer.x,
    py: pointer.y,
    mouseInside: pointer.inside && pointer.type === 'mouse',
    held: pointer.held && !pinch,
    showReticle: !worldCovered(),
    shakeOn: G.settings.shake,
  };
}

/** For tests: put the pointer at a world position. */
export function setPointerWorld(x: number, y: number, held?: boolean): void {
  const p = G.r.toScreen(x, y);
  pointer.x = p.x;
  pointer.y = p.y;
  pointer.inside = true;
  pointer.type = 'mouse';
  if (held != null) pointer.held = held;
}
