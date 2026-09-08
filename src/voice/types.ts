/**
 * Types de la couche vocale (§7). Les profils vocaux persistants vivent dans
 * `CareerState.world.npcs[id].voice` ; cette couche les résout en voix réelles.
 */
import type { VoiceProfile } from '../engine/types';

export interface SpeechRequest {
  /** Unique par réplique (cache de précharge). */
  id: string;
  npcId: string;
  text: string;
  voice: VoiceProfile;
  /** Une consigne du banc en match peut couper une ligne d'ambiance. */
  priority: 'normale' | 'haute';
}

export interface SpeechHandle {
  id: string;
  /** Résolue à la fin de la lecture, ou au barge-in (interrupted = true). */
  done: Promise<{ interrupted: boolean }>;
  cancel(): void;
}

export interface SpeakOptions {
  rate: number;
  onBoundary?: (charIndex: number) => void;
  onStart?: () => void;
}

export interface TTSProvider {
  readonly name: 'webspeech' | 'elevenlabs' | 'silencieux';
  available(): Promise<boolean>;
  /** Prépare l'audio sans le jouer. */
  preload(req: SpeechRequest): Promise<void>;
  speak(req: SpeechRequest, opts: SpeakOptions): SpeechHandle;
  cancelAll(): void;
}

export interface STTResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
}

export interface STTStartOptions {
  lang: string;
  /** Mains libres : écoute continue, fin de phrase détectée par silence. */
  continuous: boolean;
  onResult: (r: STTResult) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface STTProvider {
  readonly name: 'webspeech' | 'recorder' | 'aucun';
  available(): boolean;
  start(opts: STTStartOptions): void;
  /** Termine proprement et livre le résultat final. */
  stop(): void;
  /** Annule sans résultat. */
  abort(): void;
}

export interface SubtitleEvent {
  npcId: string;
  text: string;
  active: boolean;
}
