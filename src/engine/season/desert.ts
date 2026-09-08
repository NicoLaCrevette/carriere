/**
 * Traversées du désert (§6.6) : 1 à 3 par saison selon la difficulté, 4 à 8
 * matchs chacune, réparties sur la saison sans chevauchement ni proximité,
 * cachées au joueur. Le malus lui-même (finition, confiance) est appliqué par
 * le moteur de match via `MatchContext.desert`.
 *
 * Convention : `season.playerMatchIndex` est l'index (0-based) du prochain
 * match effectivement joué par le joueur ; `advanceDesert` l'incrémente.
 */
import type { DesertSpell, DifficultyProfile, Season } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';

/**
 * Programme les traversées du désert de la saison. Mute season. Les longueurs
 * sont tirées, réduites si la saison est trop courte, puis les traversées sont
 * posées dans l'ordre avec l'écart minimal et le jeu restant réparti au hasard.
 * Jamais de chevauchement ; une traversée n'est abandonnée que si même la
 * longueur minimale ne tient pas.
 */
export function scheduleDesertSpells(season: Season, profile: DifficultyProfile, expectedPlayerMatches: number, rng: Rng): void {
  const cfg = BALANCE.desert;
  const [minLen, maxLen] = cfg.lengthMatches;
  const count = profile.desertSpellsPerSeason;
  const span = expectedPlayerMatches - cfg.earliestMatchIndex;
  const lengths: number[] = [];
  for (let i = 0; i < count; i++) lengths.push(rng.int(minLen, maxLen));

  let gap = cfg.minGapMatches;
  const needed = (): number => lengths.reduce((s, l) => s + l, 0) + Math.max(0, lengths.length - 1) * gap;
  // Trop long : raccourcir les plus longues, puis réduire l'écart, puis abandonner la dernière.
  while (needed() > span && lengths.some((l) => l > minLen)) {
    const i = lengths.indexOf(Math.max(...lengths));
    lengths[i] = lengths[i]! - 1;
  }
  while (needed() > span && gap > 0) gap--;
  while (needed() > span && lengths.length > 0) lengths.pop();

  const slack = span - needed();
  const cuts = lengths.map(() => rng.int(0, Math.max(0, slack))).sort((a, b) => a - b);
  const spells: DesertSpell[] = [];
  let cursor = cfg.earliestMatchIndex;
  lengths.forEach((length, i) => {
    const extra = cuts[i]! - (i > 0 ? cuts[i - 1]! : 0);
    const start = cursor + extra;
    spells.push({
      id: `desert-${season.id}-${i + 1}`,
      startMatchIndex: start,
      lengthMatches: length,
      finishingMultiplier: cfg.finishingMultiplier,
      confidenceMalus: cfg.confidenceMalus,
      elapsed: 0,
    });
    cursor = start + length + gap;
  });
  season.desertSpells = spells;
}

/** Traversée active pour le prochain match du joueur, ou null. */
export function activeDesert(season: Season): DesertSpell | null {
  const idx = season.playerMatchIndex;
  return season.desertSpells.find((s) => idx >= s.startMatchIndex && idx < s.startMatchIndex + s.lengthMatches) ?? null;
}

/** À appeler après chaque match joué par le joueur : compte le match subi et avance l'index. */
export function advanceDesert(season: Season): void {
  const spell = activeDesert(season);
  if (spell) spell.elapsed += 1;
  season.playerMatchIndex += 1;
}
