/**
 * Voix neuronales servies par le proxy local (`POST /api/voices/edge`).
 *
 * C'est le fournisseur à privilégier quand le proxy tourne : treize voix
 * francophones réellement distinctes et naturelles, gratuites et sans compte,
 * là où le navigateur n'offre que les trois vieilles voix SAPI de Windows.
 *
 * Aucune clé, aucune adresse externe dans le bundle : tout passe par le proxy,
 * comme pour Ollama. Sans proxy, `available()` renvoie faux et la couche vocale
 * retombe sur `WebSpeechTTS`.
 */
import type { SpeechHandle, SpeechRequest, SpeakOptions, TTSProvider } from '../types';
import { resolveEdgeVoice, splitForSpeech } from '../voiceRegistry';

export interface EdgeTTSOptions {
  baseUrl?: string;
  /** Répliques gardées en mémoire (une réplique ≈ 40 ko). */
  cacheSize?: number;
}

export class EdgeTTS implements TTSProvider {
  readonly name = 'edge' as const;
  private cache = new Map<string, Promise<string>>();
  private order: string[] = [];
  private current: HTMLAudioElement | null = null;
  private readonly baseUrl: string;
  private readonly cacheSize: number;
  private disponible: Promise<boolean> | null = null;

  constructor(opts: EdgeTTSOptions = {}) {
    this.baseUrl = opts.baseUrl ?? '/api';
    this.cacheSize = opts.cacheSize ?? 60;
  }

  /** Le proxy répond-il et le service de voix est-il joignable ? Demandé une fois. */
  async available(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
    this.disponible ??= (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/voices/edge/status`);
        if (!res.ok) return false;
        const data = (await res.json()) as { available?: boolean };
        return data.available === true;
      } catch {
        return false;
      }
    })();
    return this.disponible;
  }

  private cacheKey(req: SpeechRequest, texte: string): string {
    return `${resolveEdgeVoice(req.voice, req.npcId, req.kind)}|${req.voice.rate}|${req.voice.pitch}|${texte}`;
  }

  /** Télécharge l'audio d'un fragment et renvoie une URL objet (mise en cache). */
  private fetchAudio(req: SpeechRequest, texte: string): Promise<string> {
    const key = this.cacheKey(req, texte);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const promise = (async () => {
      const res = await fetch(`${this.baseUrl}/voices/edge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: texte,
          voice: resolveEdgeVoice(req.voice, req.npcId, req.kind),
          rate: req.voice.rate,
          pitch: req.voice.pitch,
        }),
      });
      if (!res.ok) throw new Error(`Voix ${res.status}`);
      return URL.createObjectURL(await res.blob());
    })();
    this.cache.set(key, promise);
    this.order.push(key);
    while (this.order.length > this.cacheSize) {
      const vieux = this.order.shift()!;
      const p = this.cache.get(vieux);
      this.cache.delete(vieux);
      void p?.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
    }
    promise.catch(() => {
      this.cache.delete(key);
      this.order = this.order.filter((k) => k !== key);
    });
    return promise;
  }

  async preload(req: SpeechRequest): Promise<void> {
    // Seul le premier fragment est préchargé : c'est lui qui décide du délai perçu.
    const premier = splitForSpeech(req.text)[0];
    if (premier) await this.fetchAudio(req, premier);
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
    let annule = false;
    let demarre = false;

    const fragments = splitForSpeech(req.text);
    void (async () => {
      try {
        for (let i = 0; i < fragments.length; i++) {
          if (annule) return resolve({ interrupted: true });
          const url = await this.fetchAudio(req, fragments[i]!);
          if (annule) return resolve({ interrupted: true });
          // Le fragment suivant se télécharge pendant la lecture de celui-ci.
          const suivant = fragments[i + 1];
          if (suivant) void this.fetchAudio(req, suivant).catch(() => undefined);

          const audio = new Audio(url);
          audio.playbackRate = Math.min(2, Math.max(0.5, opts.rate));
          this.current = audio;
          await new Promise<void>((fin) => {
            audio.onplay = () => {
              if (!demarre) {
                demarre = true;
                opts.onStart?.();
              }
            };
            audio.onended = () => fin();
            audio.onerror = () => fin();
            void audio.play().catch(() => fin());
          });
          if (this.current === audio) this.current = null;
        }
        resolve({ interrupted: annule });
      } catch {
        // Le service a lâché en cours de route : on rend la main sans bloquer la scène.
        resolve({ interrupted: false });
      }
    })();

    return {
      id: req.id,
      done,
      cancel: () => {
        annule = true;
        this.cancelAll();
      },
    };
  }
}
