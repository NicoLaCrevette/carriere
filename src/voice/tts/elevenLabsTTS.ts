/**
 * Voix ElevenLabs via le proxy local (`POST /api/tts`) : la clé reste sur la
 * machine de l'utilisateur (en-tête `x-elevenlabs-key`), jamais dans le
 * bundle. Précharge et cache des audios (40 entrées), lecture par
 * `HTMLAudioElement`.
 */
import type { SpeechHandle, SpeechRequest, SpeakOptions, TTSProvider } from '../types';
import { resolveElevenLabsVoice } from '../voiceRegistry';

export interface ElevenLabsOptions {
  getKey: () => string;
  baseUrl?: string;
  modelId?: string;
  cacheSize?: number;
}

export class ElevenLabsTTS implements TTSProvider {
  readonly name = 'elevenlabs' as const;
  private cache = new Map<string, Promise<string>>();
  private order: string[] = [];
  private current: HTMLAudioElement | null = null;
  private readonly baseUrl: string;
  private readonly modelId: string;
  private readonly cacheSize: number;

  constructor(private readonly opts: ElevenLabsOptions) {
    this.baseUrl = opts.baseUrl ?? '/api';
    this.modelId = opts.modelId ?? 'eleven_multilingual_v2';
    this.cacheSize = opts.cacheSize ?? 40;
  }

  async available(): Promise<boolean> {
    return typeof window !== 'undefined' && typeof fetch === 'function' && this.opts.getKey().trim().length > 0;
  }

  private cacheKey(req: SpeechRequest): string {
    return `${resolveElevenLabsVoice(req.voice, req.npcId)}|${req.voice.rate}|${req.text}`;
  }

  /** Télécharge l'audio et renvoie une URL objet (mise en cache). */
  private fetchAudio(req: SpeechRequest): Promise<string> {
    const key = this.cacheKey(req);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const promise = (async () => {
      const res = await fetch(`${this.baseUrl}/tts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-elevenlabs-key': this.opts.getKey() },
        body: JSON.stringify({ text: req.text, voiceId: resolveElevenLabsVoice(req.voice, req.npcId), modelId: this.modelId, settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2 } }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    })();
    this.cache.set(key, promise);
    this.order.push(key);
    while (this.order.length > this.cacheSize) {
      const old = this.order.shift()!;
      const p = this.cache.get(old);
      this.cache.delete(old);
      void p?.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
    }
    promise.catch(() => {
      this.cache.delete(key);
      this.order = this.order.filter((k) => k !== key);
    });
    return promise;
  }

  async preload(req: SpeechRequest): Promise<void> {
    await this.fetchAudio(req);
  }

  cancelAll(): void {
    if (this.current) {
      this.current.pause();
      this.current = null;
    }
  }

  speak(req: SpeechRequest, opts: SpeakOptions): SpeechHandle {
    let resolve!: (r: { interrupted: boolean }) => void;
    const done = new Promise<{ interrupted: boolean }>((r) => { resolve = r; });
    let cancelled = false;
    let audio: HTMLAudioElement | null = null;
    void this.fetchAudio(req)
      .then((url) => {
        if (cancelled) return resolve({ interrupted: true });
        audio = new Audio(url);
        audio.playbackRate = Math.min(2, Math.max(0.5, opts.rate));
        this.current = audio;
        audio.onplay = () => opts.onStart?.();
        audio.onended = () => {
          if (this.current === audio) this.current = null;
          resolve({ interrupted: false });
        };
        audio.onerror = () => resolve({ interrupted: false });
        return audio.play().catch(() => resolve({ interrupted: false }));
      })
      .catch(() => resolve({ interrupted: false }));
    return {
      id: req.id,
      done,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        if (audio) {
          audio.pause();
          if (this.current === audio) this.current = null;
        }
        resolve({ interrupted: true });
      },
    };
  }
}

/** Fournisseur muet : sous-titres seuls (mode silencieux ou navigateur sans synthèse). */
export class SilentTTS implements TTSProvider {
  readonly name = 'silencieux' as const;
  async available(): Promise<boolean> { return true; }
  async preload(): Promise<void> { /* rien */ }
  cancelAll(): void { /* rien */ }
  speak(req: SpeechRequest): SpeechHandle {
    return { id: req.id, done: Promise.resolve({ interrupted: false }), cancel: () => undefined };
  }
}
