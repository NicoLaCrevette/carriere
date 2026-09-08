/**
 * Repli de reconnaissance : enregistrement `MediaRecorder` (webm/opus) envoyé
 * au proxy (`POST /api/transcribe`, relais vers l'API de transcription
 * d'ElevenLabs si une clé est présente). Pas de transcription intermédiaire.
 */
import type { STTProvider, STTStartOptions } from '../types';

export interface RecorderOptions {
  getKey: () => string;
  baseUrl?: string;
}

export class RecorderSTT implements STTProvider {
  readonly name = 'recorder' as const;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private opts: STTStartOptions | null = null;
  private aborted = false;

  constructor(private readonly options: RecorderOptions) {}

  available(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && this.options.getKey().trim().length > 0;
  }

  start(opts: STTStartOptions): void {
    this.opts = opts;
    this.aborted = false;
    this.chunks = [];
    void navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        if (this.aborted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        this.stream = stream;
        const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
        recorder.onstop = () => void this.transcribe();
        this.recorder = recorder;
        recorder.start();
      })
      .catch((err) => {
        opts.onError(err instanceof Error && err.name === 'NotAllowedError' ? 'Micro refusé : autorise l\'accès au micro.' : String(err));
        opts.onEnd();
      });
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }

  private async transcribe(): Promise<void> {
    const opts = this.opts;
    this.release();
    if (!opts || this.aborted) return;
    try {
      const blob = new Blob(this.chunks, { type: 'audio/webm' });
      const res = await fetch(`${this.options.baseUrl ?? '/api'}/transcribe`, {
        method: 'POST',
        headers: { 'x-elevenlabs-key': this.options.getKey(), 'content-type': 'audio/webm', 'x-lang': opts.lang },
        body: blob,
      });
      if (!res.ok) throw new Error(`Transcription ${res.status}`);
      const body = (await res.json()) as { text?: string };
      opts.onResult({ transcript: (body.text ?? '').trim(), isFinal: true });
    } catch (err) {
      opts.onError(`Transcription impossible : ${String(err)}. Utilise le clavier.`);
    } finally {
      opts.onEnd();
    }
  }

  stop(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
  }

  abort(): void {
    this.aborted = true;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.release();
    this.opts?.onEnd();
    this.opts = null;
  }
}
