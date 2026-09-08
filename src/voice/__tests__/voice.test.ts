/**
 * Couche vocale : registre déterministe, découpe des textes, file de lecture
 * séquentielle avec précharge, barge-in et rejeu (fournisseur factice).
 */
import { describe, expect, it } from 'vitest';
import { SpeechQueue } from '../speechQueue';
import { resolveElevenLabsVoice, resolveWebSpeechVoice, splitForSpeech, voiceFor, COMMENTATOR_VOICE } from '../voiceRegistry';
import type { SpeechHandle, SpeechRequest, TTSProvider } from '../types';
import type { VoiceProfile } from '../../engine/types';

const profile = (gender: VoiceProfile['gender'], hint?: string): VoiceProfile => ({ gender, ageBand: 'adulte', pitch: 1, rate: 1, timbre: 't', webSpeechVoiceHint: hint });
const voices = [
  { name: 'Google français', lang: 'fr-FR' }, { name: 'Thomas', lang: 'fr-FR' }, { name: 'Amélie', lang: 'fr-CA' },
  { name: 'Audrey', lang: 'fr-FR' }, { name: 'Daniel', lang: 'en-GB' },
];

describe('registre de voix', () => {
  it('résout une voix française stable pour une clé, selon le genre et l’indice', () => {
    const a = resolveWebSpeechVoice(profile('femme'), 'coach-1', voices);
    const b = resolveWebSpeechVoice(profile('femme'), 'coach-1', voices);
    expect(a).toEqual(b);
    expect(['Amélie', 'Audrey']).toContain(a!.name);
    expect(resolveWebSpeechVoice(profile('homme'), 'coach-1', voices)!.name).toBe('Thomas');
    expect(resolveWebSpeechVoice(profile('homme', 'Google français'), 'x', voices)!.name).toBe('Google français');
    expect(resolveWebSpeechVoice(profile('homme'), 'x', [{ name: 'Daniel', lang: 'en-GB' }])!.name).toBe('Daniel');
    expect(resolveWebSpeechVoice(profile('homme'), 'x', [])).toBeUndefined();
  });

  it('ElevenLabs : identifiant persistant, ou choix déterministe par clé', () => {
    expect(resolveElevenLabsVoice({ ...profile('homme'), elevenLabsVoiceId: 'abc' }, 'k')).toBe('abc');
    expect(resolveElevenLabsVoice(profile('femme'), 'npc-mere')).toBe(resolveElevenLabsVoice(profile('femme'), 'npc-mere'));
  });

  it('voiceFor renvoie le commentateur sans état', () => {
    expect(voiceFor(null, 'commentateur')).toBe(COMMENTATOR_VOICE);
  });

  it('découpe un long texte en phrases de moins de 220 caractères', () => {
    const text = 'Première phrase courte. ' + 'Une phrase beaucoup plus longue qui parle du match de dimanche et de la pression du public. '.repeat(4) + 'Fin !';
    const parts = splitForSpeech(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(220);
    expect(parts.join(' ')).toContain('Fin !');
  });
});

/** Fournisseur factice : chaque réplique dure `ms` millisecondes, annulable. */
function fakeProvider(ms: number): TTSProvider & { spoken: string[]; preloaded: string[] } {
  const spoken: string[] = [];
  const preloaded: string[] = [];
  return {
    name: 'silencieux',
    spoken,
    preloaded,
    async available() { return true; },
    async preload(req: SpeechRequest) { preloaded.push(req.id); },
    cancelAll() { /* rien */ },
    speak(req: SpeechRequest): SpeechHandle {
      spoken.push(req.id);
      let resolve!: (r: { interrupted: boolean }) => void;
      const done = new Promise<{ interrupted: boolean }>((r) => { resolve = r; });
      const timer = setTimeout(() => resolve({ interrupted: false }), ms);
      return { id: req.id, done, cancel: () => { clearTimeout(timer); resolve({ interrupted: true }); } };
    },
  };
}

const req = (id: string, priority: 'normale' | 'haute' = 'normale'): SpeechRequest => ({ id, npcId: 'coach', text: `texte ${id}`, voice: profile('homme'), priority });

describe('file de lecture', () => {
  it('lit les répliques dans l’ordre, précharge chaque réplique, émet les sous-titres', async () => {
    const provider = fakeProvider(5);
    const queue = new SpeechQueue(provider);
    const subs: string[] = [];
    queue.onSubtitle((e) => subs.push(`${e.text}:${e.active ? 'on' : 'off'}`));
    const a = queue.enqueue(req('a'));
    const b = queue.enqueue(req('b'));
    expect(provider.preloaded).toEqual(['a', 'b']);
    expect(queue.pending).toBe(1);
    await a.done;
    await b.done;
    expect(provider.spoken).toEqual(['a', 'b']);
    expect(subs).toContain('texte a:on');
    expect(subs[subs.length - 1]).toBe('texte b:off');
    expect(queue.speaking).toBeNull();
  });

  it('une priorité haute passe devant, le barge-in interrompt et vide la file', async () => {
    const provider = fakeProvider(50);
    const queue = new SpeechQueue(provider);
    const interrupted: string[] = [];
    queue.onInterrupted((r) => interrupted.push(r.id));
    const a = queue.enqueue(req('a'));
    queue.enqueue(req('b'));
    queue.enqueue(req('c', 'haute'));
    queue.interrupt();
    const ra = await a.done;
    expect(ra.interrupted).toBe(true);
    expect(interrupted).toEqual(['a']);
    expect(queue.pending).toBe(0);
    expect(provider.spoken).toEqual(['a']);
  });

  it('rejoue la dernière réplique terminée, le mode muet passe instantanément', async () => {
    const provider = fakeProvider(5);
    const queue = new SpeechQueue(provider);
    await queue.enqueue(req('a')).done;
    const replay = queue.replayLast();
    expect(replay).not.toBeNull();
    await replay!.done;
    expect(provider.spoken).toHaveLength(2);
    queue.setMuted(true);
    const r = await queue.enqueue(req('b')).done;
    expect(r.interrupted).toBe(false);
    expect(provider.spoken).toHaveLength(2);
  });
});
