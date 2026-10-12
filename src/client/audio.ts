import { BLUE, GLITCH, GOLD, GREEN, ICE, STATIC } from '../content/pixels';
import type { Settings } from '../sim/save';

/** Sound effects are synthesized with Web Audio; the soundtrack is one of four ElevenLabs loops. */

let actx: AudioContext | null = null;
let sfxGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let laserOsc: OscillatorNode | null = null;
let laserGain: GainNode | null = null;
const last: Record<string, number> = {};
let settings: Settings;
let started = false;

const music = new Audio();
music.loop = true;
music.preload = 'none';
let loadedTrack = 0;

export function bindSettings(s: Settings): void {
  settings = s;
}

/** Browsers only allow audio after a user gesture; call this from one. */
export function audioInit(): void {
  if (actx) {
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    actx = new AC();
    sfxGain = actx.createGain();
    sfxGain.gain.value = settings.sfx ? settings.sfxVol * 0.6 : 0;
    sfxGain.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.7), actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    actx = null;
  }
}

export function setStarted(): void {
  started = true;
}

function ok(key: string, gap: number): boolean {
  if (!actx || !settings.sfx) return false;
  const t = performance.now();
  if ((last[key] || 0) + gap > t) return false;
  last[key] = t;
  return true;
}

function blip(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.03, slide = 0, delay = 0): void {
  if (!actx || !sfxGain) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sfxGain);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur: number, vol: number, f0: number, f1: number): void {
  if (!actx || !sfxGain || !noiseBuf) return;
  const t = actx.currentTime;
  const s = actx.createBufferSource();
  const f = actx.createBiquadFilter();
  const g = actx.createGain();
  s.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(sfxGain);
  s.start(t);
  s.stop(t + dur + 0.05);
}

/** Notes one after another, `gap` seconds apart. */
function arp(freqs: number[], dur: number, type: OscillatorType, vol: number, slide: number, gap: number): void {
  for (let k = 0; k < freqs.length; k++) blip(freqs[k], dur, type, vol, slide, k * gap);
}

const r = Math.random;

export const SFX = {
  dig(): void {
    if (ok('dig', 85)) blip(170 + r() * 70, 0.035, 'square', 0.028);
  },
  brk(t: number, quiet: boolean): void {
    if (!ok(quiet ? 'brkq' : 'brk', quiet ? 110 : 38)) return;
    const v = quiet ? 0.012 : 0.04;
    if (t === GOLD) {
      blip(1320, 0.07, 'square', v, 1.2);
      blip(1760, 0.09, 'square', v * 0.8, 1, 0.05);
    } else if (t === BLUE) blip(640 + r() * 120, 0.06, 'sine', v * 1.4, 1.6);
    else if (t === ICE) blip(1900 + r() * 400, 0.05, 'triangle', v, 0.8);
    else if (t === GREEN) blip(520 + r() * 80, 0.06, 'triangle', v * 1.3, 0.7);
    else if (t === GLITCH || t === STATIC) blip(200 + r() * 900, 0.12, 'sawtooth', v, 3);
    else blip(300 + r() * 90, 0.05, 'triangle', v * 1.2, 0.6);
  },
  boom(R: number): void {
    if (!ok('boom', 55)) return;
    noise(0.5, Math.min(0.42, 0.1 + R * 0.04), 1400 + R * 160, 70);
    blip(95, 0.28, 'sine', 0.16, 0.45);
  },
  buy(): void {
    if (ok('buy', 60)) arp([523, 659, 784, 1046], 0.09, 'square', 0.04, 1, 0.055);
  },
  bit(): void {
    if (ok('bit', 60)) arp([392, 587, 784, 1175], 0.11, 'triangle', 0.05, 1, 0.05);
  },
  deny(): void {
    if (ok('deny', 150)) blip(150, 0.14, 'square', 0.035, 0.7);
  },
  throw(): void {
    if (ok('throw', 60)) blip(380, 0.16, 'triangle', 0.045, 2.2);
  },
  prism(): void {
    if (ok('prism', 100)) arp([880, 1108, 1318, 1760], 0.22, 'sine', 0.035, 1.02, 0.03);
  },
  goal(): void {
    if (ok('goal', 200)) arp([392, 523, 659, 784, 1046], 0.12, 'square', 0.035, 1, 0.07);
  },
  poof(): void {
    if (ok('poof', 140)) blip(900, 0.08, 'sine', 0.018, 0.5);
  },
  static(): void {
    if (!ok('static', 70)) return;
    noise(0.09, 0.05, 5000, 2200);
    blip(2400 + r() * 1200, 0.05, 'square', 0.012, 0.5);
  },
  shatter(): void {
    if (!ok('shatter', 90)) return;
    arp([2637, 3136, 3520, 2093], 0.08, 'triangle', 0.02, 0.9, 0.035);
    noise(0.25, 0.06, 7000, 1500);
  },
  smudge(): void {
    if (ok('smudge', 160)) blip(240 + r() * 40, 0.14, 'sine', 0.02, 0.8);
  },
  select(): void {
    if (ok('select', 300)) arp([262, 330, 392, 523, 659, 784], 0.16, 'square', 0.03, 1, 0.06);
  },
  dpExposed(): void {
    if (ok('dpx', 500)) arp([1568, 1046, 1568, 1046], 0.07, 'square', 0.035, 1, 0.09);
  },
  dpFled(): void {
    if (ok('dpf', 400)) blip(880, 0.3, 'sawtooth', 0.03, 0.25);
  },
  caught(): void {
    if (ok('caught', 400)) arp([523, 784, 1046, 1568, 2093], 0.16, 'square', 0.04, 1, 0.07);
  },
  restored(): void {
    if (ok('restored', 1000)) arp([262, 392, 523, 659, 784, 1046, 1318], 0.3, 'triangle', 0.045, 1, 0.11);
  },
  defrag(): void {
    if (!ok('defrag', 1000)) return;
    for (let k = 0; k < 12; k++) blip(180 + k * 60 + r() * 30, 0.05, 'square', 0.02, 1, k * 0.06);
  },
};

/** The laser hums while it fires. */
export function laserSound(on: boolean): void {
  if (!actx || !sfxGain || !settings.sfx) on = false;
  if (on && !laserOsc && actx && sfxGain) {
    laserOsc = actx.createOscillator();
    laserGain = actx.createGain();
    laserOsc.type = 'sawtooth';
    laserOsc.frequency.value = 196;
    laserGain.gain.setValueAtTime(0.0001, actx.currentTime);
    laserGain.gain.exponentialRampToValueAtTime(0.02, actx.currentTime + 0.05);
    laserOsc.connect(laserGain);
    laserGain.connect(sfxGain);
    laserOsc.start();
  } else if (!on && laserOsc && actx && laserGain) {
    const o = laserOsc;
    const g = laserGain;
    laserOsc = null;
    laserGain = null;
    try {
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.06);
      o.stop(actx.currentTime + 0.08);
    } catch {}
  }
  if (laserOsc) laserOsc.frequency.value = 190 + Math.sin(performance.now() / 60) * 12;
}

export function applyMusic(): void {
  music.volume = settings.musicVol;
  if (!started || !settings.music) {
    music.pause();
    return;
  }
  if (loadedTrack !== settings.track) {
    music.src = `music/track${settings.track}.mp3`;
    loadedTrack = settings.track;
  }
  const p = music.play();
  if (p?.catch) p.catch(() => {});
}

export function applySfx(): void {
  if (sfxGain) sfxGain.gain.value = settings.sfx ? settings.sfxVol * 0.6 : 0;
}

export function pauseAll(): void {
  laserSound(false);
}
