/**
 * Sons d'ambiance (§7, Phase 7) synthétisés avec Web Audio : aucun fichier,
 * aucun réseau. Bips de situation, clameur de but, coups de sifflet, carton.
 * Tout est silencieux si l'AudioContext n'existe pas ou si le réglage est coupé.
 */
export type SoundCue = 'situation' | 'but' | 'but_adverse' | 'sifflet' | 'fin' | 'carton' | 'timer';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundsEnabled(v: boolean): void {
  enabled = v;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(a: AudioContext, freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.06, vibrato = 0): void {
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (vibrato > 0) {
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.frequency.value = 18;
    lfoGain.gain.value = vibrato;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(start);
    lfo.stop(start + duration);
  }
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0005, start + duration);
  osc.connect(g).connect(a.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Souffle de foule : bruit blanc filtré, enveloppe lente. */
function crowd(a: AudioContext, start: number, duration: number, gain: number, cutoff: number): void {
  const length = Math.floor(a.sampleRate * duration);
  const buffer = a.createBuffer(1, length, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const g = a.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + duration * 0.25);
  g.gain.linearRampToValueAtTime(0, start + duration);
  src.connect(filter).connect(g).connect(a.destination);
  src.start(start);
  src.stop(start + duration);
}

export function playCue(cue: SoundCue): void {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  switch (cue) {
    case 'situation':
      tone(a, 660, t, 0.09, 'sine', 0.05);
      tone(a, 880, t + 0.1, 0.12, 'sine', 0.05);
      break;
    case 'timer':
      tone(a, 990, t, 0.06, 'square', 0.025);
      break;
    case 'but':
      crowd(a, t, 1.8, 0.12, 1200);
      tone(a, 523, t, 0.12, 'triangle', 0.05);
      tone(a, 659, t + 0.12, 0.12, 'triangle', 0.05);
      tone(a, 784, t + 0.24, 0.3, 'triangle', 0.06);
      break;
    case 'but_adverse':
      crowd(a, t, 1.2, 0.05, 500);
      tone(a, 392, t, 0.18, 'triangle', 0.04);
      tone(a, 330, t + 0.2, 0.35, 'triangle', 0.04);
      break;
    case 'sifflet':
      tone(a, 2100, t, 0.32, 'triangle', 0.05, 40);
      break;
    case 'fin':
      tone(a, 2100, t, 0.28, 'triangle', 0.05, 40);
      tone(a, 2100, t + 0.34, 0.28, 'triangle', 0.05, 40);
      tone(a, 2100, t + 0.68, 0.6, 'triangle', 0.05, 40);
      crowd(a, t + 0.7, 2, 0.08, 900);
      break;
    case 'carton':
      tone(a, 440, t, 0.14, 'square', 0.03);
      break;
  }
}
