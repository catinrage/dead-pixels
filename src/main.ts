import './client/styles.css';
import { askDefrag, choosePicture, doDefrag, doRestore, doSelectAll, selectTool } from './client/actions';
import { applyMusic, applySfx, audioInit, bindSettings, laserSound, SFX, setStarted } from './client/audio';
import { $, closeModal, esc, showModal, toast } from './client/dom';
import { hydrateIcons } from './client/icons';
import { applyInput, bindInput, setPointerWorld, viewState } from './client/input';
import { noteText } from './client/notes';
import { Renderer, ZOOMS } from './client/render';
import { G } from './client/state';
import { bindAuto, bindSettingsDrawer, refreshAuto, refreshSettings } from './client/ui/drawers';
import { bindGallery } from './client/ui/gallery';
import { buildHud, flashGoal, measureChips, pulseChip, refreshHud, refreshHudSlow, showToolTip } from './client/ui/hud';
import { bindPanels, closePanels, isOpen, openPanel, refreshMenu } from './client/ui/panels';
import { bindTree, refreshTree } from './client/ui/tree';
import { PICTURE } from './content/pictures';
import { CUR_LABEL, CURS, type Cur } from './content/pixels';
import { LASER } from './content/tools';
import { clamp, fmt, fmtTime } from './core/num';
import { GOALS } from './sim/goals';
import { catchDeadPixel } from './sim/hunt';
import { gain } from './sim/mechanics';
import { DEFAULT_SETTINGS, type Loaded, loadSave, MVP_SAVE_KEY, makeSave, SAVE_KEY } from './sim/save';
import { Sim, TICK } from './sim/sim';
import { isAuto, type SimEvent, SRC } from './sim/types';

/** Boot, the frame loop, saving, and turning simulation events into sound and messages. */

declare global {
  interface Window {
    claude?: { hot?: { ready?: (fn: (data: unknown) => void) => void; snapshot?: (fn: () => unknown) => void; data?: unknown } };
    __dp?: Record<string, unknown>;
  }
}

const cv = $<HTMLCanvasElement>('#game');
G.r = new Renderer(cv, $<HTMLCanvasElement>('#minimap'));
G.r.onFlyerLanded = (c: Cur) => pulseChip(c);
bindSettings(G.settings);

/* ============================== saving ============================== */

function save(): void {
  if (!G.sim) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave(G.sim, G.settings, G.r.zoom)));
  } catch {}
}
G.save = save;

function exportCode(): string {
  const bytes = new TextEncoder().encode(JSON.stringify(makeSave(G.sim, G.settings, G.r.zoom)));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `DP2:${btoa(bin)}`;
}

function importCode(code: string): boolean {
  try {
    const bin = atob(code.replace(/^DP\d:/, '').replace(/\s+/g, ''));
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    const loaded = loadSave(JSON.parse(new TextDecoder().decode(bytes)), G.settings);
    if (!loaded) return false;
    install(loaded);
    save();
    return true;
  } catch {
    return false;
  }
}

function install(l: Loaded): void {
  G.sim = l.sim;
  Object.assign(G.settings, l.settings);
  if (l.zoom) G.r.zoom = clamp(l.zoom, 3, 40);
  G.sim.autoWalk = G.settings.autoWalk;
  G.r.attach(G.sim);
  applyMusic();
  applySfx();
  G.refresh();
  if (G.started && G.sim.choosing) openPanel('gallery');
}

function hardReset(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(MVP_SAVE_KEY);
  } catch {}
  G.sim = new Sim({});
  G.sim.autoWalk = G.settings.autoWalk;
  G.r.attach(G.sim);
  G.refresh();
  save();
}

function welcomeBack(away: number): void {
  const s = G.sim;
  if (away < 30 || s.choosing) return;
  const r = s.grantOffline(away);
  const got = CURS.filter(c => (r.got[c] ?? 0) >= 1);
  if (!got.length) return;
  const items = got.map(c => `<li><b>${fmt(r.got[c] as number)}</b> ${CUR_LABEL[c].toLowerCase()}</li>`).join('');
  setTimeout(
    () =>
      showModal(
        'Welcome back',
        `<p>You were away for ${fmtTime(r.t)}. Your machines kept working at ${Math.round(s.S.offlineEff * 100)}% speed and collected:</p><ul>${items}</ul>`,
        [{ label: 'Collect', hot: true, fn: closeModal }],
      ),
    60,
  );
}

/* ============================== events ============================== */

function onGoal(idx: number): void {
  const g = GOALS[idx];
  flashGoal();
  if (!G.started) return;
  SFX.goal();
  const rw = g?.reward
    ? ` Reward: ${Object.entries(g.reward)
        .map(([c, v]) => `${v} ${CUR_LABEL[c as Cur].toLowerCase()}`)
        .join(', ')}.`
    : '';
  toast(`Goal complete.${rw}`, '#2bf0ff');
}

function onCaught(bits: number): void {
  SFX.caught();
  const s = G.sim;
  const p = s.pic;
  const note = s.profile.fragments.includes(p.id)
    ? `<div class="frag px"><span class="stamp">${esc(p.fragment.stamp)}</span><p>${esc(p.fragment.text)}</p></div>`
    : '';
  setTimeout(
    () =>
      showModal(
        'Dead Pixel deleted',
        `<p><b>+${bits} Bits.</b> A note was hiding under it.</p>${note}<p>${s.profile.selectAll ? 'Select All works on this picture now.' : 'With it gone, reveal 90% of the picture to unlock Select All and finish it off.'}</p>`,
        [{ label: 'Keep erasing', hot: true, fn: closeModal }],
      ),
    700,
  );
}

function handleEvents(): void {
  const s = G.sim;
  const ev = s.events;
  if (!ev.length) return;
  for (const e of ev as SimEvent[]) {
    G.r.onEvent(s, e);
    switch (e.k) {
      case 'break':
        SFX.brk(e.t, e.src === SRC.BLAST || e.src === SRC.SELECT || isAuto(e.src));
        break;
      case 'strike':
        SFX.dig();
        break;
      case 'boom':
        SFX.boom(e.R);
        break;
      case 'fx':
        if (e.kind === 'shatter') SFX.shatter();
        else if (e.kind === 'smudge') SFX.smudge();
        break;
      case 'sfx':
        SFX[e.id]();
        break;
      case 'note': {
        const n = noteText(e.id, e.a);
        if (n) toast(n[0], n[1]);
        break;
      }
      case 'goal':
        onGoal(e.idx);
        break;
      case 'dp':
        if (e.what === 'exposed') SFX.dpExposed();
        else if (e.what === 'fled') SFX.dpFled();
        else if (e.what === 'dove') SFX.poof();
        else if (e.what === 'caught') onCaught(e.bits ?? 0);
        break;
      case 'selectDone':
        SFX.goal();
        if (s.canRestore()) toast('Everything is selected and cleared. Restore the picture.', '#2bf0ff');
        break;
    }
  }
  ev.length = 0;
}

/* ============================== refresh ============================== */

G.refresh = () => {
  refreshHud(0);
  refreshHudSlow();
  refreshTree();
  refreshAuto();
  refreshSettings();
  refreshMenu();
  measureChips();
};

/** A run that cannot reach Defrag gets one hint about replaying an easier picture. */
const stuck = { run: null as unknown, t: 0, rv: 0, shown: false };
function checkStuck(dt: number): void {
  const s = G.sim;
  if (stuck.run !== s.run) {
    Object.assign(stuck, { run: s.run, t: 0, rv: s.reveal(), shown: false });
    return;
  }
  if (stuck.shown || !G.started || G.moment || s.choosing || s.canDefrag()) return;
  const rv = s.reveal();
  if (rv - stuck.rv > 0.5) {
    stuck.rv = rv;
    stuck.t = 0;
    return;
  }
  stuck.t += dt;
  if (stuck.t > 360 && Object.values(s.profile.pictures).some(p => p.restored)) {
    stuck.shown = true;
    toast('Stuck before Defrag? Switch to a picture you restored in the Gallery (G) and replay it for Bits.', '#ff3df2');
  }
}

function refreshSlow(): void {
  checkStuck(0.5);
  refreshHudSlow();
  if (isOpen('tree')) refreshTree();
  if (isOpen('auto')) refreshAuto();
  if (isOpen('settings')) refreshSettings();
}

/* ============================== the loop ============================== */

let last = performance.now();
let acc = 0;
let uiT = 0;
let slowT = 0;
let mmT = 0;
let saveT = 0;
let errN = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  try {
    const s = G.sim;
    G.r.attach(s);
    if (G.started && !G.moment && !s.choosing) {
      applyInput();
      s.autoWalk = G.settings.autoWalk;
      acc += dt;
      let n = 0;
      while (acc >= TICK && n < 6) {
        s.step(TICK);
        acc -= TICK;
        n++;
      }
      if (n >= 6) acc = 0;
    }
    handleEvents();
    laserSound(G.started && !G.moment && s.input.held && s.run.tool === LASER && !s.choosing);
    G.r.drainDirty();
    G.r.update(s, dt, G.settings.shake);
    G.r.render(s, acc / TICK, viewState());
    mmT -= dt;
    if (mmT <= 0) {
      mmT = 0.1;
      G.r.renderMinimap(s);
    }
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.12;
      refreshHud(0.12);
    }
    slowT -= dt;
    if (slowT <= 0) {
      slowT = 0.5;
      refreshSlow();
    }
    saveT += dt;
    if (saveT >= 20) {
      saveT = 0;
      save();
    }
  } catch (err) {
    if (errN++ < 5) console.error(err);
  }
}

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    save();
    laserSound(false);
  } else if (hiddenAt) {
    const away = (Date.now() - hiddenAt) / 1000;
    hiddenAt = 0;
    last = performance.now();
    if (G.started && away > 20) welcomeBack(away);
  }
});
window.addEventListener('pagehide', save);
window.addEventListener('resize', () => {
  G.r.resize();
  measureChips();
});
document.addEventListener('dp:open-bits', () => openPanel('tree', 'bits'));

/* ============================== boot ============================== */

function startGame(): void {
  if (G.started) return;
  G.started = true;
  $('#start').hidden = true;
  setStarted();
  audioInit();
  applyMusic();
  applySfx();
  showToolTip();
  if (G.sim.choosing) openPanel('gallery');
  cv.focus?.();
}

let booted = false;

function boot(hotData?: unknown): void {
  if (booted) return;
  booted = true;
  hydrateIcons();
  let loaded: Loaded | null = null;
  let fromHot = false;
  try {
    if (hotData && typeof hotData === 'object' && 'v' in hotData) {
      loaded = loadSave(hotData, DEFAULT_SETTINGS);
      fromHot = !!loaded;
    }
    if (!loaded) {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) loaded = loadSave(JSON.parse(raw), DEFAULT_SETTINGS);
    }
    if (!loaded) {
      const raw = localStorage.getItem(MVP_SAVE_KEY);
      if (raw) loaded = loadSave(JSON.parse(raw), DEFAULT_SETTINGS);
    }
  } catch (err) {
    console.error(err);
    loaded = null;
  }
  buildHud({ defrag: askDefrag, restore: doRestore, selectAll: doSelectAll, tool: selectTool });
  bindPanels();
  bindTree();
  bindGallery(choosePicture);
  bindAuto();
  bindSettingsDrawer({ save, exportCode, importCode, reset: hardReset });
  bindInput(cv, { start: startGame });
  $('#start-btn').addEventListener('click', startGame);

  if (loaded) {
    G.sim = loaded.sim;
    Object.assign(G.settings, loaded.settings);
    if (loaded.zoom) G.r.zoom = clamp(loaded.zoom, 3, 40);
  } else {
    G.sim = new Sim({});
    const z0 = clamp(Math.round(Math.min(innerWidth, innerHeight) / 40), 6, 16);
    G.r.zoom = ZOOMS.reduce((a, b) => (Math.abs(b - z0) < Math.abs(a - z0) ? b : a));
  }
  G.sim.autoWalk = G.settings.autoWalk;
  G.r.resize();
  G.r.attach(G.sim);
  G.refresh();

  if (loaded) {
    const s = G.sim;
    $('#start-btn').textContent = 'Continue';
    $('#start-note').textContent = loaded.migrated
      ? `Your MVP save carried over. Its ${fmt(s.profile.bits)} Bits are now yours to spend in the Bit tree.`
      : s.choosing
        ? 'Pick your next picture.'
        : `${s.pic.file} · ${s.reveal().toFixed(1)}% revealed`;
    welcomeBack(loaded.away);
  }
  if (fromHot) startGame();
  try {
    window.claude?.hot?.snapshot?.(() => makeSave(G.sim, G.settings, G.r.zoom));
  } catch {}
  document.fonts?.ready.then(() => measureChips()).catch(() => {});
  requestAnimationFrame(t => {
    last = t;
    requestAnimationFrame(frame);
  });
}

/* ============================== test hooks ============================== */

window.__dp = {
  sim: () => G.sim,
  state: () => {
    const s = G.sim;
    return {
      picture: s.pic.id,
      reveal: s.reveal(),
      inks: { ...s.run.inks },
      levels: { ...s.run.levels },
      bits: s.profile.bits,
      bitLevels: { ...s.profile.bitLevels },
      tool: s.run.tool,
      tools: [...s.profile.tools],
      choosing: s.choosing,
      dp: s.dp ? { ...s.dp } : null,
      critters: s.critters.length,
      rigs: s.rigs.length,
      deleted: s.profile.stats.deleted,
      zoom: G.r.zoom,
      started: G.started,
      moment: G.moment,
    };
  },
  gain: (c: Cur, n: number) => gain(G.sim, c, n, false),
  addBits: (n: number) => G.sim.addBits(n),
  buy: (id: string) => G.sim.buyNode(id),
  buyBit: (id: string) => G.sim.buyBitNode(id),
  tool: (k: number) => selectTool(k),
  step: (sec: number) => {
    for (let t = 0; t < sec; t += TICK) G.sim.step(TICK);
    handleEvents();
  },
  setPlayer: (x: number, y: number) => {
    const p = G.sim.player;
    p.x = p.px = x;
    p.y = p.py = y;
    G.r.camX = x;
    G.r.camY = y;
  },
  aim: (x: number, y: number, held?: boolean) => setPointerWorld(x, y, held),
  /** Empty the cells nearest the center until the picture is this far revealed, leaving the Dead Pixel buried. */
  clearTo: (pct: number) => {
    const s = G.sim;
    const w = s.world;
    const c = w.w / 2;
    const order = Array.from({ length: w.n }, (_, i) => i).sort(
      (a, b) => Math.hypot((a % w.w) - c, ((a / w.w) | 0) - c) - Math.hypot((b % w.w) - c, ((b / w.w) | 0) - c),
    );
    s.cause = SRC.SELECT;
    for (const i of order) {
      if (s.reveal() >= pct) break;
      if (w.cells[i] && !(s.dp && s.dp.i === i)) w.setCell(i, 0);
    }
  },
  /** Catch the Dead Pixel wherever it hides. */
  catchDp: () => {
    catchDeadPixel(G.sim);
    handleEvents();
  },
  defrag: () => doDefrag(),
  restore: () => doRestore(),
  choose: (pid: string) => choosePicture(pid),
  save: () => makeSave(G.sim, G.settings, G.r.zoom),
  exportCode,
  importCode,
  closePanels,
  pictures: () => Object.keys(PICTURE),
};

const hot = window.claude?.hot;
if (hot && typeof hot.ready === 'function') {
  try {
    hot.ready(boot);
  } catch {
    boot(hot.data ?? {});
  }
} else boot(hot?.data ?? {});
setTimeout(() => {
  if (!booted) boot({});
}, 1500);
