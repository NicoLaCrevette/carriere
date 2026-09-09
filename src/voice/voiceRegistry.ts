/**
 * Registre de voix : chaque PNJ garde son profil toute la carrière ; ici on
 * le résout en voix concrète (Web Speech ou ElevenLabs) de façon
 * déterministe, pour que le coach ait la même voix pendant six saisons.
 */
import type { CareerState, NpcKind, VoiceProfile } from '../engine/types';

export const COMMENTATOR_VOICE: VoiceProfile = { gender: 'homme', ageBand: 'adulte', pitch: 1.0, rate: 1.05, timbre: 'voix de commentateur, vive et articulée' };
export const SYSTEM_VOICE: VoiceProfile = { gender: 'femme', ageBand: 'adulte', pitch: 1.0, rate: 1.0, timbre: 'voix neutre' };
export const CROWD_VOICE: VoiceProfile = { gender: 'homme', ageBand: 'adulte', pitch: 0.92, rate: 0.98, timbre: 'rumeur de stade' };

/**
 * Registres par rôle.
 *
 * ATTENTION, leçon apprise à la dure : on ne différencie PAS deux personnages
 * en déformant la même voix. Les voix SAPI de Windows (Hortense, Julie, Paul)
 * sont déjà synthétiques ; les transposer de ±0,3 en hauteur les rend
 * inintelligibles — c'est exactement ce que faisait la version précédente, et
 * le joueur ne comprenait plus rien.
 *
 * Ici les écarts restent dans une bande où l'articulation tient. La vraie
 * différenciation vient d'ailleurs : une voix RÉELLE différente par rôle,
 * choisie par `resolveWebSpeechVoice` parmi les voix installées, et par les
 * voix neuronales du fournisseur `edge` quand le proxy tourne.
 */
const REGISTERS: Partial<Record<NpcKind, { pitch: number; rate: number }>> = {
  coach: { pitch: 0.94, rate: 0.96 },
  adjoint: { pitch: 0.97, rate: 0.98 },
  president: { pitch: 0.92, rate: 0.92 },
  directeur_sportif: { pitch: 0.95, rate: 0.96 },
  capitaine: { pitch: 0.98, rate: 1.0 },
  coequipier: { pitch: 1.02, rate: 1.02 },
  journaliste: { pitch: 1.06, rate: 1.04 },
  consultant_tv: { pitch: 1.04, rate: 1.05 },
  agent: { pitch: 1.0, rate: 1.06 },
  mere: { pitch: 1.08, rate: 0.98 },
  pere: { pitch: 0.93, rate: 0.95 },
  frere_soeur: { pitch: 1.06, rate: 1.04 },
  partenaire: { pitch: 1.07, rate: 1.0 },
  ami: { pitch: 1.04, rate: 1.04 },
  selectionneur: { pitch: 0.93, rate: 0.94 },
  medecin: { pitch: 0.99, rate: 0.94 },
  preparateur: { pitch: 0.97, rate: 1.03 },
  sponsor: { pitch: 1.03, rate: 1.02 },
  supporter: { pitch: 1.08, rate: 1.06 },
  adversaire: { pitch: 0.96, rate: 1.02 },
  commentateur: { pitch: 1.0, rate: 1.05 },
};

/**
 * Écart maximal de la signature propre à un PNJ, autour de son registre.
 * Volontairement minuscule : il sert à ce que deux coéquipiers ne soient pas
 * rigoureusement identiques, pas à les faire sonner différemment. C'est le
 * choix de la voix réelle qui porte la différence.
 */
const SIGNATURE_SPREAD = { pitch: 0.05, rate: 0.04 };

/** Bande dans laquelle une voix de synthèse reste articulée et compréhensible. */
const INTELLIGIBLE = { pitch: [0.88, 1.14] as const, rate: [0.88, 1.12] as const };

function clampRange(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Voix effectivement prononcée : registre du rôle, signature déterministe du
 * PNJ, le tout borné à la bande intelligible. Un même PNJ garde sa voix toute
 * la carrière, y compris sur une sauvegarde ancienne.
 */
export function effectiveVoice(profile: VoiceProfile, npcId: string, kind?: NpcKind): VoiceProfile {
  const register = (kind && REGISTERS[kind]) ?? { pitch: profile.gender === 'femme' ? 1.05 : 0.95, rate: 1 };
  const h = hash32(npcId);
  // Deux tirages indépendants dans [-1, 1] à partir du même hachage.
  const jitterPitch = ((h % 1000) / 500 - 1) * SIGNATURE_SPREAD.pitch;
  const jitterRate = (((h >>> 10) % 1000) / 500 - 1) * SIGNATURE_SPREAD.rate;
  return {
    ...profile,
    pitch: Math.round(clampRange(register.pitch + jitterPitch, INTELLIGIBLE.pitch[0], INTELLIGIBLE.pitch[1]) * 100) / 100,
    rate: Math.round(clampRange(register.rate + jitterRate, INTELLIGIBLE.rate[0], INTELLIGIBLE.rate[1]) * 100) / 100,
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

// ── Voix neuronales (fournisseur `edge`, servi par le proxy local) ──────────

/**
 * Voix neuronales francophones attribuées par rôle.
 *
 * C'est ici que se joue la différenciation des personnages : deux voix
 * réellement enregistrées ne se confondent pas, là où deux transpositions de
 * la même voix de synthèse se confondent toujours. Les accents (belge,
 * québécois, suisse) servent à écarter davantage les timbres — un agent
 * québécois et un coach français ne peuvent pas être pris l'un pour l'autre.
 *
 * Chaque rôle propose plusieurs voix : le PNJ en tire une, stable pour toute
 * la carrière (hachage de son identifiant).
 */
const EDGE_VOICES_BY_KIND: Partial<Record<NpcKind, readonly string[]>> = {
  coach: ['fr-FR-RemyMultilingualNeural', 'fr-CA-ThierryNeural'],
  adjoint: ['fr-CA-JeanNeural', 'fr-BE-GerardNeural'],
  president: ['fr-BE-GerardNeural', 'fr-CA-ThierryNeural'],
  directeur_sportif: ['fr-CH-FabriceNeural', 'fr-CA-JeanNeural'],
  capitaine: ['fr-FR-HenriNeural', 'fr-CA-AntoineNeural'],
  coequipier: ['fr-FR-HenriNeural', 'fr-CA-AntoineNeural', 'fr-CH-FabriceNeural', 'fr-BE-GerardNeural'],
  journaliste: ['fr-FR-DeniseNeural', 'fr-CA-SylvieNeural', 'fr-BE-CharlineNeural'],
  consultant_tv: ['fr-FR-RemyMultilingualNeural', 'fr-CH-FabriceNeural'],
  agent: ['fr-CA-AntoineNeural', 'fr-BE-GerardNeural'],
  mere: ['fr-CH-ArianeNeural', 'fr-FR-VivienneMultilingualNeural'],
  pere: ['fr-CA-ThierryNeural', 'fr-BE-GerardNeural'],
  frere_soeur: ['fr-FR-EloiseNeural', 'fr-CA-AntoineNeural'],
  partenaire: ['fr-FR-EloiseNeural', 'fr-CA-SylvieNeural'],
  ami: ['fr-CA-AntoineNeural', 'fr-BE-CharlineNeural'],
  selectionneur: ['fr-FR-RemyMultilingualNeural', 'fr-BE-GerardNeural'],
  medecin: ['fr-CH-FabriceNeural', 'fr-BE-CharlineNeural'],
  preparateur: ['fr-CA-JeanNeural', 'fr-CH-FabriceNeural'],
  sponsor: ['fr-FR-VivienneMultilingualNeural', 'fr-CA-SylvieNeural'],
  supporter: ['fr-BE-GerardNeural', 'fr-CA-AntoineNeural'],
  adversaire: ['fr-CA-JeanNeural', 'fr-CH-FabriceNeural'],
  commentateur: ['fr-FR-RemyMultilingualNeural'],
};

/** Voix par genre, quand le rôle est inconnu. */
const EDGE_FALLBACK: Record<VoiceProfile['gender'], readonly string[]> = {
  homme: ['fr-FR-HenriNeural', 'fr-CA-AntoineNeural', 'fr-CH-FabriceNeural', 'fr-BE-GerardNeural', 'fr-CA-JeanNeural'],
  femme: ['fr-FR-DeniseNeural', 'fr-FR-EloiseNeural', 'fr-CA-SylvieNeural', 'fr-CH-ArianeNeural', 'fr-BE-CharlineNeural'],
};

/** Voix réservées à ce qui n'est pas un PNJ. */
const EDGE_SPECIAL: Record<string, string> = {
  commentateur: 'fr-FR-RemyMultilingualNeural',
  public: 'fr-BE-GerardNeural',
  systeme: 'fr-FR-DeniseNeural',
};

/**
 * Voix neuronale d'un PNJ : stable pour toute la carrière, différente d'un
 * PNJ à l'autre. `voix` respecte un choix explicite si le profil en porte un.
 */
export function resolveEdgeVoice(profile: VoiceProfile, key: string, kind?: NpcKind): string {
  const special = EDGE_SPECIAL[key];
  if (special) return special;
  const pool = (kind && EDGE_VOICES_BY_KIND[kind]) ?? EDGE_FALLBACK[profile.gender];
  return pool[hash32(key) % pool.length]!;
}
