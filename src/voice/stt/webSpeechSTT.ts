/**
 * Reconnaissance vocale du navigateur (`SpeechRecognition`, fr-FR) avec
 * transcription intermédiaire et, en mains libres, détection de fin de
 * phrase après 1,2 s de silence.
 */
import type { STTProvider, STTStartOptions } from '../types';

type RecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export const END_OF_SPEECH_SILENCE_MS = 1200;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class WebSpeechSTT implements STTProvider {
  readonly name = 'webspeech' as const;
  private recognition: SpeechRecognitionLike | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private finalParts: string[] = [];
  private interim = '';

  available(): boolean {
    return ctor() !== null;
  }

  start(opts: STTStartOptions): void {
    const Ctor = ctor();
    if (!Ctor) {
      opts.onError('Reconnaissance vocale indisponible dans ce navigateur.');
      opts.onEnd();
      return;
    }
    this.abort();
    const r = new Ctor();
    r.lang = opts.lang;
    r.continuous = opts.continuous;
    r.interimResults = true;
    r.maxAlternatives = 1;
    this.finalParts = [];
    this.interim = '';
    const emit = (isFinal: boolean): void => {
      const transcript = [...this.finalParts, this.interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      opts.onResult({ transcript, isFinal });
    };
    const armSilence = (): void => {
      if (!opts.continuous) return;
      if (this.silenceTimer) clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => this.stop(), END_OF_SPEECH_SILENCE_MS);
    };
    r.onresult = (e) => {
      this.interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const alt = res[0];
        if (!alt) continue;
        if (res.isFinal) this.finalParts.push(alt.transcript.trim());
        else this.interim += alt.transcript;
      }
      emit(false);
      armSilence();
    };
    r.onerror = (e) => {
      if (e.error === 'aborted') return;
      opts.onError(e.error === 'not-allowed' ? 'Micro refusé : autorise l\'accès au micro dans le navigateur.' : e.error === 'no-speech' ? 'Aucune parole détectée.' : `Erreur de reconnaissance : ${e.error}`);
    };
    r.onend = () => {
      if (this.silenceTimer) clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
      emit(true);
      this.recognition = null;
      opts.onEnd();
    };
    this.recognition = r;
    try {
      r.start();
    } catch (err) {
      opts.onError(String(err));
      opts.onEnd();
    }
  }

  stop(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    try {
      this.recognition?.stop();
    } catch {
      /* déjà arrêtée */
    }
  }

  abort(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    const r = this.recognition;
    this.recognition = null;
    try {
      if (r) {
        r.onend = null;
        r.abort();
      }
    } catch {
      /* déjà arrêtée */
    }
  }
}
