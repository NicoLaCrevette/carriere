/**
 * File de lecture séquentielle des répliques : précharge de la suivante,
 * barge-in (le joueur coupe la parole : la réplique en cours est annulée et
 * signalée comme interrompue), rejouer la dernière, sous-titres.
 */
import type { SpeechHandle, SpeechRequest, SubtitleEvent, TTSProvider } from './types';

interface QueueItem {
  req: SpeechRequest;
  resolve: (r: { interrupted: boolean }) => void;
  cancelled: boolean;
}

export type SubtitleListener = (e: SubtitleEvent) => void;
export type InterruptListener = (req: SpeechRequest) => void;

export class SpeechQueue {
  private items: QueueItem[] = [];
  private current: { item: QueueItem; handle: SpeechHandle } | null = null;
  private last: SpeechRequest | null = null;
  private rate = 1;
  private subtitleListeners = new Set<SubtitleListener>();
  private interruptListeners = new Set<InterruptListener>();
  private muted = false;

  constructor(private provider: TTSProvider) {}

  setProvider(provider: TTSProvider): void {
    this.cancelAll();
    this.provider = provider;
  }

  setRate(rate: number): void {
    this.rate = Math.min(2, Math.max(0.5, rate));
  }

  /** Mode silencieux : les répliques passent instantanément (sous-titres seuls). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.cancelAll();
  }

  onSubtitle(listener: SubtitleListener): () => void {
    this.subtitleListeners.add(listener);
    return () => this.subtitleListeners.delete(listener);
  }

  onInterrupted(listener: InterruptListener): () => void {
    this.interruptListeners.add(listener);
    return () => this.interruptListeners.delete(listener);
  }

  get speaking(): SpeechRequest | null {
    return this.current?.item.req ?? null;
  }

  get pending(): number {
    return this.items.length;
  }

  /** Ajoute une réplique ; une priorité haute passe devant les autres en attente. */
  enqueue(req: SpeechRequest): SpeechHandle {
    let resolve!: (r: { interrupted: boolean }) => void;
    const done = new Promise<{ interrupted: boolean }>((r) => { resolve = r; });
    const item: QueueItem = { req, resolve, cancelled: false };
    if (req.priority === 'haute') this.items.unshift(item); else this.items.push(item);
    this.emit({ npcId: req.npcId, text: req.text, active: false });
    void this.provider.preload(req).catch(() => undefined);
    this.pump();
    return {
      id: req.id,
      done,
      cancel: () => {
        if (this.current?.item === item) this.current.handle.cancel();
        else {
          item.cancelled = true;
          this.items = this.items.filter((x) => x !== item);
          resolve({ interrupted: true });
        }
      },
    };
  }

  /** Précharge une réplique probable (pendant que le joueur réfléchit). */
  preload(req: SpeechRequest): void {
    void this.provider.preload(req).catch(() => undefined);
  }

  /** Barge-in : coupe la réplique en cours et vide la file. */
  interrupt(): void {
    const current = this.current;
    for (const item of this.items) {
      item.cancelled = true;
      item.resolve({ interrupted: true });
    }
    this.items = [];
    if (current) {
      this.interruptListeners.forEach((l) => l(current.item.req));
      current.handle.cancel();
    }
  }

  cancelAll(): void {
    for (const item of this.items) {
      item.cancelled = true;
      item.resolve({ interrupted: true });
    }
    this.items = [];
    this.current?.handle.cancel();
    this.provider.cancelAll();
  }

  /** Rejoue la dernière réplique terminée. */
  replayLast(): SpeechHandle | null {
    if (!this.last) return null;
    return this.enqueue({ ...this.last, id: `${this.last.id}:rejeu:${Date.now()}` });
  }

  private emit(e: SubtitleEvent): void {
    this.subtitleListeners.forEach((l) => l(e));
  }

  private pump(): void {
    if (this.current) return;
    const item = this.items.shift();
    if (!item) return;
    if (item.cancelled) {
      this.pump();
      return;
    }
    this.emit({ npcId: item.req.npcId, text: item.req.text, active: true });
    if (this.muted) {
      this.last = item.req;
      item.resolve({ interrupted: false });
      this.emit({ npcId: item.req.npcId, text: item.req.text, active: false });
      this.pump();
      return;
    }
    const handle = this.provider.speak(item.req, { rate: this.rate });
    this.current = { item, handle };
    void handle.done.then((r) => {
      if (this.current?.item === item) this.current = null;
      this.last = item.req;
      item.resolve(r);
      this.emit({ npcId: item.req.npcId, text: item.req.text, active: false });
      this.pump();
    });
  }
}
