import { CUR_COLOR, CUR_LABEL, type Cur } from '../content/pixels';
import { fmt } from '../core/num';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string): string => s.replace(/[&<>"']/g, c => ESC[c]);

export const BITS_COLOR = '#2bf0ff';

/** Ink prices, red where you are short. */
export function costHTML(cost: Partial<Record<Cur, number>>, have: Record<Cur, number>): string {
  return Object.entries(cost)
    .map(
      ([c, v]) =>
        `<span class="cost${have[c as Cur] + 1e-9 >= (v as number) ? '' : ' no'}" title="${CUR_LABEL[c as Cur]}"><i style="--c:${CUR_COLOR[c as Cur]}"></i>${fmt(v as number)}</span>`,
    )
    .join('');
}

export function bitsHTML(n: number, have: number): string {
  return `<span class="cost${have >= n ? '' : ' no'}" title="Bits"><i style="--c:${BITS_COLOR}"></i>${fmt(n)} Bits</span>`;
}

/* ---------- toasts ---------- */

export function toast(msg: string, color?: string): void {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast px';
  if (color) el.style.setProperty('--tc', color);
  el.textContent = msg;
  box.prepend(el);
  while (box.children.length > 4) box.lastElementChild?.remove();
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

/* ---------- modal ---------- */

export interface ModalAction {
  label: string;
  hot?: boolean;
  fn: () => void;
}

let onModalClose: (() => void) | null = null;

/** A small dialog. `html` must already be escaped. The last action gets focus. */
export function showModal(title: string, html: string, actions: ModalAction[], onClose?: () => void): void {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  const box = $('#modal-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn px' + (a.hot ? ' btn-hot' : '');
    b.textContent = a.label;
    b.addEventListener('click', a.fn);
    box.appendChild(b);
  }
  onModalClose = onClose ?? null;
  $('#modal').hidden = false;
  (box.lastElementChild as HTMLElement | null)?.focus();
}

export function closeModal(): void {
  if ($('#modal').hidden) return;
  $('#modal').hidden = true;
  const f = onModalClose;
  onModalClose = null;
  f?.();
}

export const modalOpen = (): boolean => !$('#modal').hidden;
