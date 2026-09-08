/**
 * Réglages de difficulté (§6.9). Aucun mode ne dépasse les plafonds §6.3 :
 * le multiplicateur de conversion s'applique avant le plafond, jamais après.
 *
 * `decisionTimerSeconds` est le chrono NU, celui d'un joueur qui écrit. Le jeu
 * se joue à la voix : l'interface l'allonge (BALANCE.situations.voiceTimer*)
 * car parler prend le temps d'écouter, de formuler puis d'être entendu. La
 * difficulté doit venir du jeu, pas de l'impossibilité matérielle de répondre.
 */
import type { Difficulty, DifficultyProfile } from '../types';

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  realiste: {
    difficulty: 'realiste',
    conversionMultiplier: 1.1,
    // 16 s écrites → 32 s à la voix : le temps d'hésiter, de se reprendre, de finir sa phrase.
    decisionTimerSeconds: 16,
    coachTolerance: 'haute',
    mediaSeverity: 'moderee',
    injuryFrequency: 0.8,
    desertSpellsPerSeason: 1,
    potentialReveal: 'indicative',
    manMarkingFromLeagueReputation: 70,
  },
  exigeant: {
    difficulty: 'exigeant',
    conversionMultiplier: 1.0,
    // 13 s écrites → 26 s à la voix : une phrase réfléchie, sans temps mort.
    decisionTimerSeconds: 13,
    coachTolerance: 'moyenne',
    mediaSeverity: 'forte',
    injuryFrequency: 1.0,
    desertSpellsPerSeason: 2,
    potentialReveal: 'floue',
    manMarkingFromLeagueReputation: 55,
  },
  impitoyable: {
    difficulty: 'impitoyable',
    conversionMultiplier: 0.92,
    // 10 s écrites → 20 s à la voix (le plancher) : il faut décider vite, mais on a le temps de parler.
    decisionTimerSeconds: 10,
    coachTolerance: 'faible',
    mediaSeverity: 'brutale',
    injuryFrequency: 1.3,
    desertSpellsPerSeason: 3,
    potentialReveal: 'jamais',
    manMarkingFromLeagueReputation: 40,
  },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  realiste: 'Réaliste',
  exigeant: 'Exigeant',
  impitoyable: 'Impitoyable',
};

/** Profil d'une difficulté. Lève si inconnue (jamais de repli silencieux). */
export function difficultyProfile(d: Difficulty): DifficultyProfile {
  const profile = DIFFICULTY_PROFILES[d];
  if (!profile) throw new Error(`Difficulté inconnue : ${String(d)}`);
  return profile;
}
