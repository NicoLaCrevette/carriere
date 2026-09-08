/**
 * Synthèse vocale du navigateur (`speechSynthesis`) : gratuite, voix
 * françaises du système, résolution déterministe par PNJ. Gère les fins
 * d'énoncé manquantes (Chrome) par un délai de sécurité et découpe les
 * longs textes en phrases.
 */
import type { SpeechHandle, SpeechRequest, SpeakOptions, TTSProvider } from '../types';
import { resolveWebSpeechVoice, splitForSpeech } from '../voiceRegistry';

export class WebSpeechTTS implements TTSProvider {
  readonly name = 'webspeech' as const;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.voices = window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => {
        this.voices = window.speechSynthesis.getVoices();
      });
    }
  }

  async available(): Promise<boolean> {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  async preload(): Promise<void> {
    // La synthèse système est instantanée : rien à précharger.
  }

  cancelAll(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  speak(req: SpeechRequest, opts: SpeakOptions): SpeechHandle {
    let resolve!: (r: { interrupted: boolean }) => void;
    const done = new Promise<{ interrupted: boolean }>((r) => { resolve = r; });
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve({ interrupted: false });
      return { id: req.id, done, cancel: () => undefined };
    }
    const synth = window.speechSynthesis;
    if (this.voices.length === 0) this.voices = synth.getVoices();
    const voice = resolveWebSpeechVoice(req.voice, req.npcId, this.voices);
    const parts = splitForSpeech(req.text);
    let cancelled = false;
    let finished = 0;
    let offset = 0;
    const utterances: SpeechSynthesisUtterance[] = parts.map((text) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR';
      if (voice) u.voice = voice;
      u.pitch = Math.min(2, Math.max(0.5, req.voice.pitch));
      u.rate = Math.min(2, Math.max(0.5, req.voice.rate * opts.rate));
      const base = offset;
      offset += text.length + 1;
      u.onboundary = (e) => opts.onBoundary?.(base + e.charIndex);
      return u;
    });
    let started = false;
    const safety = setTimeout(() => finish(false), Math.max(3000, req.text.length * 90 / Math.max(0.5, opts.rate)) + 2000);
    const finish = (interrupted: boolean): void => {
      clearTimeout(safety);
      resolve({ interrupted });
    };
    utterances.forEach((u, i) => {
      u.onstart = () => {
        if (!started) {
          started = true;
          opts.onStart?.();
        }
      };
      u.onend = () => {
        finished++;
        if (!cancelled && finished >= utterances.length) finish(false);
      };
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        finished++;
        if (i === utterances.length - 1 && !cancelled) finish(false);
      };
    });
    for (const u of utterances) synth.speak(u);
    return {
      id: req.id,
      done,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        synth.cancel();
        finish(true);
      },
    };
  }
}
