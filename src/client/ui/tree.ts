import { ARM, ARM_COLOR, BIT_NODE, BIT_NODES, type BitArm, bitCost } from '../../content/bitTree';
import { BR, BR_COLOR, type Branch, nodeCost, RUN_NODE, RUN_NODES } from '../../content/runTree';
import { clamp, fmt } from '../../core/num';
import type { NodeState } from '../../sim/sim';
import { audioInit, SFX } from '../audio';
import { $, bitsHTML, costHTML, toast } from '../dom';
import { iconURL } from '../icons';
import { G } from '../state';
import { isOpen, onPanelOpen, openPanel, type TreeTab } from './panels';

/** One pannable, zoomable view that shows either the run tree (ink) or the Bit tree (Bits). */

interface VNode {
  id: string;
  x: number;
  y: number;
  max: number;
  name: string;
  icon: string;
  key?: boolean;
  about: string;
  eff?: (l: number) => string;
  req: readonly (readonly [string, number, boolean?])[];
  color: string;
  cls: string;
}

interface Mode {
  nodes: VNode[];
  level(id: string): number;
  state(id: string): NodeState;
  label(id: string): string;
  cost(id: string, l: number): string;
  missing(id: string): string[];
  nextRun(id: string): boolean;
  buy(id: string): boolean;
  legend: [string, string][];
  sub(): string;
  pan: { x: number; y: number; s: number };
  centered: boolean;
  sel: string;
}

const UNIT = 100;

const MODES: Record<TreeTab, Mode> = {
  run: {
    nodes: RUN_NODES.map(n => ({ ...n, color: BR_COLOR[n.br], cls: `br-${n.br}` })),
    level: id => G.sim.L(id),
    state: id => G.sim.nodeState(RUN_NODE[id]),
    label: id => {
      const n = RUN_NODE[id];
      return BR[n.br] + (n.key ? ' keystone' : n.auto ? ' automation' : n.tool != null ? ' tool' : '');
    },
    cost: (id, l) => costHTML(nodeCost(RUN_NODE[id].cost, l), G.sim.run.inks),
    missing: id =>
      RUN_NODE[id].req.filter(([r, lv]) => G.sim.L(r) < lv).map(([r, lv]) => `${RUN_NODE[r].name}${lv > 1 ? ` level ${lv}` : ''}`),
    nextRun: () => false,
    buy: id => G.sim.buyNode(id),
    legend: (Object.keys(BR) as Branch[]).map(b => [BR[b], BR_COLOR[b]]),
    sub: () => 'Bought with ink, wiped by Defrag and Restore. Tools you unlock stay yours.',
    pan: { x: 0, y: 0, s: 1 },
    centered: false,
    sel: 'pick',
  },
  bits: {
    nodes: BIT_NODES.map(n => ({ ...n, color: ARM_COLOR[n.arm], cls: `arm-${n.arm}` })),
    level: id => G.sim.B(id),
    state: id => G.sim.bitNodeState(BIT_NODE[id]),
    label: id => `${ARM[BIT_NODE[id].arm]} · kept forever`,
    cost: (id, l) => bitsHTML(bitCost(BIT_NODE[id], l), G.sim.profile.bits),
    missing: id => {
      const n = BIT_NODE[id];
      const out = n.req.filter(([r, lv]) => G.sim.B(r) < lv).map(([r, lv]) => `${BIT_NODE[r].name}${lv > 1 ? ` level ${lv}` : ''}`);
      if (n.needs === 'selectAll' && !G.sim.profile.selectAll) out.push('Select All, which unlocks at 90% revealed');
      return out;
    },
    nextRun: id => !!BIT_NODE[id].nextRun,
    buy: id => G.sim.buyBitNode(id),
    legend: (Object.keys(ARM) as BitArm[]).map(a => [ARM[a], ARM_COLOR[a]]),
    sub: () => `<b>${fmt(G.sim.profile.bits)}</b> Bits to spend. Bit upgrades last through every Defrag and Restore.`,
    pan: { x: 0, y: 0, s: 1 },
    centered: false,
    sel: 'b_cache',
  },
};

let tab: TreeTab | null = null;
let mode: Mode = MODES.run;
let cardId: string | null = null;
let origin = { x: 0, y: 0 };
const nodeEls = new Map<string, { b: HTMLButtonElement; lv: HTMLElement }>();
const linkEls: { ln: SVGLineElement; from: string; to: string }[] = [];

const view = (): HTMLElement => $('#tree-view');
const worldEl = (): HTMLElement => $('#tree-world');

function build(): void {
  const nodes = mode.nodes;
  const minX = Math.min(...nodes.map(n => n.x));
  const maxX = Math.max(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxY = Math.max(...nodes.map(n => n.y));
  origin = { x: (-minX + 1) * UNIT, y: (-minY + 1) * UNIT };
  const pos = (n: VNode): { x: number; y: number } => ({ x: origin.x + n.x * UNIT, y: origin.y + n.y * UNIT });
  const wpx = (maxX - minX + 2) * UNIT;
  const hpx = (maxY - minY + 2) * UNIT;
  const world = worldEl();
  world.style.width = `${wpx}px`;
  world.style.height = `${hpx}px`;
  const links = $('#tree-links') as unknown as SVGSVGElement;
  links.setAttribute('width', String(wpx));
  links.setAttribute('height', String(hpx));
  links.innerHTML = '';
  linkEls.length = 0;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const ns = 'http://www.w3.org/2000/svg';
  for (const n of nodes)
    for (const [rid, , hide] of n.req) {
      const from = byId.get(rid);
      if (hide || !from) continue;
      const a = pos(from);
      const b = pos(n);
      const ln = document.createElementNS(ns, 'line');
      ln.setAttribute('x1', String(a.x));
      ln.setAttribute('y1', String(a.y));
      ln.setAttribute('x2', String(b.x));
      ln.setAttribute('y2', String(b.y));
      ln.style.setProperty('--lc', n.color);
      links.appendChild(ln);
      linkEls.push({ ln, from: rid, to: n.id });
    }
  const box = $('#tree-nodes');
  box.innerHTML = '';
  nodeEls.clear();
  for (const n of nodes) {
    const b = document.createElement('button');
    const size = n.key ? 70 : 56;
    const p = pos(n);
    b.className = `node px ${n.cls}${n.key ? ' key' : ''}`;
    b.style.left = `${p.x - size / 2}px`;
    b.style.top = `${p.y - size / 2}px`;
    b.dataset.id = n.id;
    b.setAttribute('aria-label', n.name);
    b.innerHTML = `<img src="${iconURL(n.icon, n.color)}" alt=""><span class="lv"></span>`;
    b.addEventListener('pointerenter', e => {
      if (e.pointerType === 'mouse') showCard(n.id);
    });
    b.addEventListener('pointerleave', e => {
      if (e.pointerType === 'mouse') showCard(mode.sel);
    });
    b.addEventListener('focus', () => showCard(n.id));
    b.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tapNode(n.id, true);
      }
    });
    box.appendChild(b);
    nodeEls.set(n.id, { b, lv: b.querySelector('.lv') as HTMLElement });
  }
  $('#tree-legend').innerHTML = mode.legend.map(([l, c]) => `<span><i style="--c:${c}"></i>${l}</span>`).join('');
}

function applyPan(): void {
  const p = mode.pan;
  worldEl().style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.s})`;
}

export function centerTree(): void {
  const r = view().getBoundingClientRect();
  const narrow = r.width < 720;
  const p = mode.pan;
  p.s = narrow ? 0.72 : r.height < 700 ? 0.85 : 1;
  p.x = r.width / 2 - origin.x * p.s;
  p.y = (narrow ? r.height * 0.36 : r.height / 2) - origin.y * p.s;
  applyPan();
}

/** Switch tabs, rebuilding the nodes when the tree changes. */
function setTab(t: TreeTab): void {
  if (t !== tab) {
    tab = t;
    mode = MODES[t];
    build();
    for (const k of ['run', 'bits'] as TreeTab[]) $(`#tab-${k}`).setAttribute('aria-selected', String(k === t));
  }
  if (!mode.centered) {
    centerTree();
    mode.centered = true;
  } else applyPan();
  refreshTree();
  showCard(mode.sel);
}

function tapNode(id: string, direct: boolean): void {
  audioInit();
  if (mode.sel === id || direct) buy(id);
  mode.sel = id;
  showCard(id);
  refreshTree();
}

function buy(id: string): void {
  if (id === 'core' || id === 'b_boot') return;
  if (!mode.buy(id)) {
    SFX.deny();
    return;
  }
  if (tab === 'bits') {
    SFX.bit();
    if (mode.nextRun(id)) toast('Bought. It takes effect when your next run starts.', '#2bf0ff');
    G.save();
  } else SFX.buy();
}

function showCard(id: string): void {
  const n = mode.nodes.find(v => v.id === id);
  if (!n) return;
  cardId = id;
  const l = mode.level(id);
  const st = mode.state(id);
  const card = $('#node-card');
  card.className = `node-card px ${n.cls}`;
  ($('#nc-icon') as HTMLImageElement).src = iconURL(n.icon, n.color);
  $('#nc-br').textContent = mode.label(id);
  $('#nc-name').textContent = n.name;
  $('#nc-lv').textContent = n.max > 1 ? `${l}/${n.max}` : l ? 'Owned' : '';
  $('#nc-about').textContent = n.about;
  const eff = $('#nc-eff');
  eff.hidden = !n.eff;
  if (n.eff)
    eff.innerHTML =
      l >= n.max ? `Now <b>${n.eff(l)}</b>` : l > 0 ? `Now ${n.eff(l)}<br>Next <b>${n.eff(l + 1)}</b>` : `First level <b>${n.eff(1)}</b>`;
  $('#nc-next').hidden = !mode.nextRun(id) || l >= n.max;
  const missing = mode.missing(id);
  const req = $('#nc-req');
  req.textContent = missing.length ? `Needs ${missing.join(' and ')}` : '';
  req.hidden = !missing.length;
  const cost = $('#nc-cost');
  cost.hidden = l >= n.max;
  cost.innerHTML = l < n.max ? mode.cost(id, l) : '';
  const btn = $('#nc-buy') as HTMLButtonElement;
  btn.hidden = l >= n.max || id === 'core' || id === 'b_boot';
  btn.disabled = st !== 'afford';
  btn.textContent =
    st === 'locked'
      ? 'Locked'
      : st === 'afford'
        ? l > 0
          ? `Upgrade to level ${l + 1}`
          : 'Buy'
        : tab === 'bits'
          ? 'Not enough Bits'
          : 'Not enough ink';
}

export function refreshTree(): void {
  if (!tab) return;
  for (const n of mode.nodes) {
    const e = nodeEls.get(n.id);
    if (!e) continue;
    const st = mode.state(n.id);
    const l = mode.level(n.id);
    e.b.classList.remove('locked', 'open', 'afford', 'part', 'max');
    e.b.classList.add(st);
    e.b.classList.toggle('sel', mode.sel === n.id);
    e.lv.textContent = n.id === 'core' || n.id === 'b_boot' ? '' : n.max > 1 ? `${l}/${n.max}` : l ? 'owned' : '';
  }
  for (const k of linkEls) {
    const on = mode.level(k.to) > 0;
    const open = !on && mode.state(k.to) !== 'locked';
    k.ln.setAttribute('class', on ? 'on' : open || mode.level(k.from) > 0 ? 'open' : '');
  }
  $('#tree-sub').innerHTML = mode.sub();
  if (cardId) showCard(cardId);
  setBadge($('#tab-badge-run'), G.sim.countAffordable());
  setBadge($('#tab-badge-bits'), G.sim.countBitAffordable());
}

function setBadge(el: HTMLElement, k: number): void {
  el.hidden = !k;
  el.textContent = String(k);
}

/* ---------- pan and zoom ---------- */

interface Drag {
  pinch?: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  d?: number;
  s?: number;
  moved: boolean;
  node?: string | null;
  mouse?: boolean;
}

export function bindTree(): void {
  onPanelOpen('tree', t => setTab(t ?? 'run'));
  for (const k of ['run', 'bits'] as TreeTab[]) $(`#tab-${k}`).addEventListener('click', () => openPanel('tree', k));
  $('#tree-center').addEventListener('click', centerTree);
  ($('#nc-buy') as HTMLButtonElement).addEventListener('click', () => {
    if (!cardId) return;
    buy(cardId);
    refreshTree();
  });
  const v = view();
  const ptrs = new Map<number, { x: number; y: number }>();
  let drag: Drag | null = null;
  v.addEventListener('pointerdown', e => {
    if ((e.target as HTMLElement).closest('.node-card')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      v.setPointerCapture(e.pointerId);
    } catch {}
    const p = mode.pan;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      drag = {
        pinch: true,
        d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        s: p.s,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        px: p.x,
        py: p.y,
        moved: true,
      };
      return;
    }
    const nodeEl = (e.target as HTMLElement).closest<HTMLElement>('.node');
    drag = {
      x: e.clientX,
      y: e.clientY,
      px: p.x,
      py: p.y,
      moved: false,
      node: nodeEl ? (nodeEl.dataset.id as string) : null,
      mouse: e.pointerType === 'mouse',
    };
  });
  v.addEventListener('pointermove', e => {
    if (!drag || !ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = mode.pan;
    if (drag.pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const s0 = drag.s as number;
      const ns = clamp((s0 * Math.hypot(a.x - b.x, a.y - b.y)) / (drag.d as number), 0.4, 1.8);
      const rect = v.getBoundingClientRect();
      const mx = drag.x - rect.left;
      const my = drag.y - rect.top;
      p.x = mx - ((mx - drag.px) * ns) / s0;
      p.y = my - ((my - drag.py) * ns) / s0;
      p.s = ns;
      applyPan();
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 6) {
      drag.moved = true;
      v.classList.add('drag');
    }
    if (drag.moved) {
      p.x = drag.px + dx;
      p.y = drag.py + dy;
      applyPan();
    }
  });
  const up = (e: PointerEvent): void => {
    ptrs.delete(e.pointerId);
    if (!drag || ptrs.size) return;
    if (!drag.moved && drag.node && e.type === 'pointerup') tapNode(drag.node, !!drag.mouse);
    drag = null;
    v.classList.remove('drag');
  };
  v.addEventListener('pointerup', up);
  v.addEventListener('pointercancel', up);
  v.addEventListener(
    'wheel',
    e => {
      if ((e.target as HTMLElement).closest('.node-card')) return;
      e.preventDefault();
      const p = mode.pan;
      const rect = v.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ns = clamp(p.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.4, 1.8);
      p.x = mx - ((mx - p.x) * ns) / p.s;
      p.y = my - ((my - p.y) * ns) / p.s;
      p.s = ns;
      applyPan();
    },
    { passive: false },
  );
  window.addEventListener('resize', () => {
    if (isOpen('tree')) centerTree();
    MODES.run.centered = MODES.bits.centered = false;
  });
}
