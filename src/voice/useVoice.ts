/**
 * Hook React de la couche vocale : modes (vocal, mixte, silencieux),
 * push-to-talk (barre espace maintenue) et mains libres, transcription en
 * direct éditable, file de lecture avec barge-in, sous-titres, rejeu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VoiceMode, VoiceProfile } from '../engine/types';
import { SpeechQueue } from './speechQueue';
import { WebSpeechTTS } from './tts/webSpeechTTS';
import { ElevenLabsTTS, SilentTTS } from './tts/elevenLabsTTS';
import { WebSpeechSTT } from './stt/webSpeechSTT';
import { RecorderSTT } from './stt/recorderSTT';
import type { SpeechHandle, SpeechRequest, STTProvider, SubtitleEvent, TTSProvider } from './types';

export interface VoiceSettings {
  mode: VoiceMode;
  pushToTalk: boolean;
  speechRate: number;
  ttsProvider: 'webspeech' | 'elevenlabs';
  elevenLabsKey: string;
}

export interface VoiceApi {
  mode: VoiceMode;
  speaking: SubtitleEvent | null;
  listening: boolean;
  transcript: string;
  setTranscript: (t: string) => void;
  /**
   * Phrase terminée : le silence de fin a été détecté, ou le micro relâché.
   * L'écran l'envoie tel quel, puis appelle `clearFinal()` : c'est ce qui
   * permet de jouer entièrement à la voix, sans jamais écrire.
   */
  finalTranscript: string;
  clearFinal: () => void;
  startListening: () => void;
  stopListening: () => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
  say: (req: Omit<SpeechRequest, 'id'>) => SpeechHandle;
  preload: (req: Omit<SpeechRequest, 'id'>) => void;
  interrupt: () => void;
  replayLast: () => void;
  micAvailable: boolean;
  error: string | null;
  /** Vrai si la dernière réplique a été interrompue par le joueur (barge-in). */
  lastInterrupted: boolean;
}

let counter = 0;
const nextId = (): string => `voix-${++counter}`;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function useVoice(settings: VoiceSettings): VoiceApi {
  const [speaking, setSpeaking] = useState<SubtitleEvent | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [handsFree, setHandsFree] = useState(!settings.pushToTalk);
  // Le réglage peut changer en cours de partie : le mode mains libres suit.
  useEffect(() => {
    setHandsFree(!settings.pushToTalk);
  }, [settings.pushToTalk]);
  const [error, setError] = useState<string | null>(null);
  const [lastInterrupted, setLastInterrupted] = useState(false);
  const keyRef = useRef(settings.elevenLabsKey);
  keyRef.current = settings.elevenLabsKey;

  const provider = useMemo<TTSProvider>(() => {
    if (settings.mode === 'silencieux') return new SilentTTS();
    if (settings.ttsProvider === 'elevenlabs' && settings.elevenLabsKey.trim()) return new ElevenLabsTTS({ getKey: () => keyRef.current });
    return new WebSpeechTTS();
  }, [settings.mode, settings.ttsProvider, settings.elevenLabsKey]);

  const queue = useMemo(() => new SpeechQueue(provider), []);
  useEffect(() => {
    queue.setProvider(provider);
  }, [queue, provider]);
  useEffect(() => {
    queue.setRate(settings.speechRate);
    queue.setMuted(settings.mode === 'silencieux');
  }, [queue, settings.speechRate, settings.mode]);
  useEffect(() => {
    const offSub = queue.onSubtitle((e) => setSpeaking(e.active ? e : null));
    const offInt = queue.onInterrupted(() => setLastInterrupted(true));
    return () => {
      offSub();
      offInt();
      queue.cancelAll();
    };
  }, [queue]);

  const stt = useMemo<STTProvider | null>(() => {
    if (settings.mode !== 'vocal') return null;
    const web = new WebSpeechSTT();
    if (web.available()) return web;
    const rec = new RecorderSTT({ getKey: () => keyRef.current });
    return rec.available() ? rec : null;
  }, [settings.mode]);
  const micAvailable = stt !== null;

  const startListening = useCallback(() => {
    if (!stt || listening) return;
    setError(null);
    setLastInterrupted(false);
    if (queue.speaking) {
      queue.interrupt();
      setLastInterrupted(true);
    }
    setListening(true);
    setFinalTranscript('');
    stt.start({
      lang: 'fr-FR',
      continuous: handsFree,
      onResult: (r) => {
        setTranscript(r.transcript);
        // Phrase terminée : l'écran peut l'envoyer sans que le joueur touche au clavier.
        if (r.isFinal && r.transcript.trim()) setFinalTranscript(r.transcript.trim());
      },
      onEnd: () => setListening(false),
      onError: (m) => setError(m),
    });
  }, [stt, listening, handsFree, queue]);

  const stopListening = useCallback(() => {
    stt?.stop();
  }, [stt]);

  // Push-to-talk : barre espace maintenue (hors champs de saisie).
  useEffect(() => {
    if (settings.mode !== 'vocal' || handsFree) return;
    let held = false;
    const down = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || held || isTypingTarget(e.target)) return;
      e.preventDefault();
      held = true;
      startListening();
    };
    const up = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || !held) return;
      held = false;
      stopListening();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [settings.mode, handsFree, startListening, stopListening]);

  const say = useCallback((req: Omit<SpeechRequest, 'id'>): SpeechHandle => {
    setLastInterrupted(false);
    return queue.enqueue({ ...req, id: nextId() });
  }, [queue]);
  const preload = useCallback((req: Omit<SpeechRequest, 'id'>) => queue.preload({ ...req, id: nextId() }), [queue]);
  const interrupt = useCallback(() => {
    if (queue.speaking) setLastInterrupted(true);
    queue.interrupt();
  }, [queue]);
  const replayLast = useCallback(() => { queue.replayLast(); }, [queue]);

  const clearFinal = useCallback(() => {
    setFinalTranscript('');
    setTranscript('');
  }, []);

  return {
    mode: settings.mode, speaking, listening, transcript, setTranscript, finalTranscript, clearFinal, startListening, stopListening,
    handsFree, setHandsFree, say, preload, interrupt, replayLast, micAvailable, error, lastInterrupted,
  };
}

/** Requête de parole prête à l'emploi. */
export function speech(npcId: string, text: string, voice: VoiceProfile, priority: 'normale' | 'haute' = 'normale'): Omit<SpeechRequest, 'id'> {
  return { npcId, text, voice, priority };
}
