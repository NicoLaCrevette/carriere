/**
 * Registre de voix : chaque PNJ garde son profil toute la carrière ; ici on
 * le résout en voix concrète (Web Speech ou ElevenLabs) de façon
 * déterministe, pour que le coach ait la même voix pendant six saisons.
 */
import type { CareerState, NpcKind, VoiceProfile } from '../engine/types';

export const COMMENTATOR_VOICE: VoiceProfile = { gender: 'homme', ageBand: 'adulte', pitch: 1.0, rate: 1.08, timbre: 'voix de commentateur, vive et articulée' };
export const SYSTEM_VOICE: VoiceProfile = { gender: 'femme', ageBand: 'adulte', pitch: 1.0, rate: 1.0, timbre: 'voix neutre' };
export const CROWD_VOICE: VoiceProfile = { gender: 'homme', ageBand: 'adulte', pitch: 0.8, rate: 0.95, timbre: 'rumeur de stade' };

/**
 * Registres par rôle : une machine n'a le plus souvent qu'une seule voix
 * française installée, et les profils générés tiennent tous entre 0.85 et
 * 1.05 de hauteur, ce qui s'entend à peine. On écarte donc franchement les
 * timbres selon le rôle, puis on ajoute une signature propre à chaque PNJ.
 */
const REGISTERS: Partial<Record<NpcKind, { pitch: number; rate: number }>> = {
  coach: { pitch: 0.72, rate: 0.94 },
  adjoint: { pitch: 0.8, rate: 0.98 },
  president: { pitch: 0.68, rate: 0.88 },
  directeur_sportif: { pitch: 0.78, rate: 0.95 },
  capitaine: { pitch: 0.85, rate: 1.0 },
  coequipier: { pitch: 1.0, rate: 1.05 },
  journaliste: { pitch: 1.12, rate: 1.12 },
  consultant_tv: { pitch: 1.05, rate: 1.15 },
  agent: { pitch: 0.92, rate: 1.18 },
  mere: { pitch: 1.35, rate: 0.96 },
  pere: { pitch: 0.7, rate: 0.92 },
  frere_soeur: { pitch: 1.2, rate: 1.1 },
  partenaire: { pitch: 1.3, rate: 1.0 },
  ami: { pitch: 1.08, rate: 1.1 },
  selectionneur: { pitch: 0.75, rate: 0.9 },
  medecin: { pitch: 0.95, rate: 0.9 },
  preparateur: { pitch: 0.88, rate: 1.08 },
  sponsor: { pitch: 1.1, rate: 1.05 },
  supporter: { pitch: 1.25, rate: 1.2 },
  adversaire: { pitch: 0.9, rate: 1.05 },
  commentateur: { pitch: 1.0, rate: 1.08 },
};

/** Écart maximal de la signature propre à un PNJ, autour de son registre. */
const SIGNATURE_SPREAD = { pitch: 0.14, rate: 0.1 };

function clampRange(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Voix effectivement prononcée : registre du rôle, signature déterministe du
 * PNJ (hachage de son identifiant), profil stocké conservé comme nuance. Deux
 * PNJ différents ne sonnent jamais pareil, y compris sur une sauvegarde
 * ancienne, et un même PNJ garde sa voix toute la carrière.
 */
export function effectiveVoice(profile: VoiceProfile, npcId: string, kind?: NpcKind): VoiceProfile {
  const register = (kind && REGISTERS[kind]) ?? { pitch: profile.gender === 'femme' ? 1.2 : 0.9, rate: 1 };
  const h = hash32(npcId);
  // Deux tirages indépendants dans [-1, 1] à partir du même hachage.
  const jitterPitch = ((h % 1000) / 500 - 1) * SIGNATURE_SPREAD.pitch;
  const jitterRate = (((h >>> 10) % 1000) / 500 - 1) * SIGNATURE_SPREAD.rate;
  // Le profil stocké (0.85-1.05) ne sert plus que de nuance fine autour du registre.
  const nuance = (profile.pitch - 0.95) * 0.5;
  return {
    ...profile,
    pitch: Math.round(clampRange(register.pitch + jitterPitch + nuance, 0.5, 2) * 100) / 100,
    rate: Math.round(clampRange(register.rate + jitterRate, 0.6, 1.6) * 100) / 100,
  };
}

/** Profil vocal d'un PNJ, du commentateur ou du système, prêt à être prononcé. */
export function voiceFor(state: CareerState | null, npcId: string): VoiceProfile {
  if (npcId === 'commentateur') return COMMENTATOR_VOICE;
  if (npcId === 'public') return CROWD_VOICE;
  if (npcId === 'systeme') return SYSTEM_VOICE;
  const npc = state?.world.npcs[npcId];
  if (!npc) return SYSTEM_VOICE;
  return effectiveVoice(npc.voice, npcId, npc.kind);
}

/** Hachage FNV-1a 32 bits. */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface VoiceLike { name: string; lang: string; voiceURI?: string; default?: boolean }

const FEMALE_HINTS = /amelie|amélie|audrey|aurelie|aurélie|celine|céline|chantal|denise|elise|hortense|julie|marie|pauline|sophie|virginie|zoe|female|femme|woman/i;
const MALE_HINTS = /antoine|claude|henri|louis|mathieu|nicolas|paul|pierre|thomas|yannick|male|homme|man/i;

/**
 * Choisit une voix Web Speech française pour un profil, de façon
 * déterministe (clé = id du PNJ) : préférence à `webSpeechVoiceHint`, puis au
 * genre déduit du nom de la voix, sinon n'importe quelle voix française.
 */
export function resolveWebSpeechVoice<T extends VoiceLike>(profile: VoiceProfile, key: string, voices: readonly T[]): T | undefined {
  const french = voices.filter((v) => v.lang.toLowerCase().startsWith('fr'));
  const pool = french.length > 0 ? french : voices;
  if (pool.length === 0) return undefined;
  if (profile.webSpeechVoiceHint) {
    const hinted = pool.find((v) => v.name === profile.webSpeechVoiceHint || v.voiceURI === profile.webSpeechVoiceHint);
    if (hinted) return hinted;
  }
  const byGender = pool.filter((v) => (profile.gender === 'femme' ? FEMALE_HINTS : MALE_HINTS).test(v.name));
  const candidates = byGender.length > 0 ? byGender : pool;
  const sorted = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
  return sorted[hash32(key) % sorted.length];
}

/** Voix ElevenLabs françaises par genre et tranche d'âge (identifiants publics de la bibliothèque, remplaçables dans les réglages). */
export const ELEVENLABS_VOICES: Record<VoiceProfile['gender'], Record<VoiceProfile['ageBand'], string[]>> = {
  homme: {
    jeune: ['pNInz6obpgDQGcFmaJgB', 'TX3LPaxmHKxFdv7VOQHJ'],
    adulte: ['onwK4e9ZLuTAKqWW03F9', 'VR6AewLTigWG4xSOukaG', 'JBFqnCBsd6RMkjVDRZzb'],
    senior: ['pqHfZKP75CvOlQylNhV4', 'N2lVS1w4EtoT3dr4eOWO'],
  },
  femme: {
    jeune: ['jsCqWAovK2LkecY7zXl4', 'LcfcDJNUP1GQjkzn1xUU'],
    adulte: ['EXAVITQu4vr4xnSDxMaL', 'XB0fDUnXU5powFXDhCwa', 'ThT5KcBeYPX3keUQqHPh'],
    senior: ['oWAxZDx7w5VEj9dCyTzz'],
  },
};

/** Identifiant de voix ElevenLabs pour un profil (persistant via la clé). */
export function resolveElevenLabsVoice(profile: VoiceProfile, key: string): string {
  if (profile.elevenLabsVoiceId) return profile.elevenLabsVoiceId;
  const list = ELEVENLABS_VOICES[profile.gender][profile.ageBand];
  return list[hash32(key) % list.length]!;
}

/** Coupe un texte long en phrases lisibles par la synthèse (≤ 220 caractères). */
export function splitForSpeech(text: string, max = 220): string[] {
  const parts = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  let current = '';
  for (const p of parts) {
    if ((current + ' ' + p).trim().length > max && current) {
      out.push(current.trim());
      current = p;
    } else {
      current = `${current} ${p}`.trim();
    }
  }
  if (current) out.push(current.trim());
  return out.filter(Boolean);
}
