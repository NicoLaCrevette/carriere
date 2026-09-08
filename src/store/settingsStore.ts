/**
 * Préférences hors carrière (§7, §13), persistées en localStorage.
 * N'influencent rien en Phase 2 (voix, IA) sauf leur affichage en Réglages ;
 * elles sont stockées dès maintenant pour ne pas migrer plus tard.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VoiceMode } from '../engine/types';

export interface SettingsState {
  voiceMode: VoiceMode;
  pushToTalk: boolean;
  speechRate: number;
  subtitles: boolean;
  ttsProvider: 'webspeech' | 'elevenlabs';
  /** Stockée en local uniquement, jamais envoyée telle quelle ailleurs qu'au TTS. */
  elevenLabsKey: string;
  /** Vrai si une clé Anthropic a été fournie côté proxy (Phase 4). */
  apiKeyPresent: boolean;
  /** Utiliser le LLM quand le proxy est joignable (sinon replis pré-écrits). */
  llmEnabled: boolean;
  /** Sons d'ambiance synthétisés (bips de situation, clameurs, sifflets). */
  sounds: boolean;
  theme: 'sombre';
  lastSlotId: string | null;
  datasetId: string | null;

  setVoiceMode(v: VoiceMode): void;
  setLlmEnabled(v: boolean): void;
  setApiKeyPresent(v: boolean): void;
  setSounds(v: boolean): void;
  setPushToTalk(v: boolean): void;
  setSpeechRate(v: number): void;
  setSubtitles(v: boolean): void;
  setTtsProvider(v: 'webspeech' | 'elevenlabs'): void;
  setElevenLabsKey(v: string): void;
  setLastSlotId(id: string | null): void;
  setDatasetId(id: string | null): void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Le jeu est conçu pour être joué à la voix : on parle, on n'écrit pas (§0).
      voiceMode: 'vocal',
      pushToTalk: false,
      speechRate: 1,
      subtitles: true,
      ttsProvider: 'webspeech',
      elevenLabsKey: '',
      apiKeyPresent: false,
      llmEnabled: true,
      sounds: true,
      theme: 'sombre',
      lastSlotId: null,
      datasetId: null,

      setVoiceMode: (voiceMode) => set({ voiceMode }),
      setLlmEnabled: (llmEnabled) => set({ llmEnabled }),
      setApiKeyPresent: (apiKeyPresent) => set({ apiKeyPresent }),
      setSounds: (sounds) => set({ sounds }),
      setPushToTalk: (pushToTalk) => set({ pushToTalk }),
      setSpeechRate: (speechRate) => set({ speechRate }),
      setSubtitles: (subtitles) => set({ subtitles }),
      setTtsProvider: (ttsProvider) => set({ ttsProvider }),
      setElevenLabsKey: (elevenLabsKey) => set({ elevenLabsKey }),
      setLastSlotId: (lastSlotId) => set({ lastSlotId }),
      setDatasetId: (datasetId) => set({ datasetId }),
    }),
    {
      name: 'carriere-settings',
      // v2 : le mode « tout vocal » mains libres devient le défaut, y compris pour les réglages déjà enregistrés.
      version: 2,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<SettingsState>;
        if (version < 2) return { ...state, voiceMode: 'vocal' as VoiceMode, pushToTalk: false };
        return state as SettingsState;
      },
    },
  ),
);
