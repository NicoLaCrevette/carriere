/**
 * CARRIÈRE — tous les nombres d'équilibrage du moteur.
 *
 * Règles :
 *  - Jamais de constante d'équilibrage en dur dans la logique : tout vit ici.
 *  - `BALANCE` est composé de sections, UNE PAR MODULE, chacune dans un
 *    sous-fichier de `./balance/` (limite de 600 lignes par fichier). Un
 *    agent de module ajoute ses paramètres par Edit ciblé dans le sous-fichier
 *    de sa section, ou directement ci-dessous derrière la ligne `...` de sa
 *    section. Jamais de suppression ni de renommage d'un paramètre existant.
 *  - Les plafonds §6.3 (`caps`) sont absolus : aucun mode de difficulté ne
 *    les dépasse, et `resolve.caps.test.ts` le vérifie.
 *  - Les commentaires donnent l'ordre de grandeur visé pour que le tuning
 *    reste lisible (cibles §6.5, Ligue 1 ≈ 2,7 buts par match, etc.).
 */
import { CORE_BALANCE } from './balance/core';
import { WORLD_BALANCE } from './balance/world';
import { PLAYER_BALANCE } from './balance/player';
import { MATCH_BALANCE } from './balance/match';
import { SEASON_BALANCE } from './balance/season';
import { REPUTATION_BALANCE } from './balance/reputation';
import { CAREER_BALANCE } from './balance/career';
import { DEPTH_BALANCE } from './balance/depth';

export const BALANCE = {
  // ═══════════════════════════════════════════════════════════════════════
  // ── rng/config ──  bornes générales et création → ./balance/core.ts
  //    (bounds, creation)
  // ═══════════════════════════════════════════════════════════════════════
  ...CORE_BALANCE,

  // ═══════════════════════════════════════════════════════════════════════
  // ── world ──  clubs, effectifs, PNJ, calendrier → ./balance/world.ts
  //    (world)
  // ═══════════════════════════════════════════════════════════════════════
  ...WORLD_BALANCE,

  // ═══════════════════════════════════════════════════════════════════════
  // ── player ──  progression, fitness, blessures, valeur, contrats → ./balance/player.ts
  //    (progression, fitness, injuries, marketValue, contracts)
  // ═══════════════════════════════════════════════════════════════════════
  ...PLAYER_BALANCE,

  // ═══════════════════════════════════════════════════════════════════════
  // ── match ──  plafonds §6.3, résolution, note, simulation → ./balance/match.ts
  //    (caps, attributeInfluence, baseProbability, shotZoneRisk, shotZoneReward,
  //     risk, resolution, rating, seasonTargets, matchSim, situations, adaptation, desert)
  // ═══════════════════════════════════════════════════════════════════════
  ...MATCH_BALANCE,

  // ═══════════════════════════════════════════════════════════════════════
  // ── season ──  coach, hiérarchie, classement, PNJ, fin de saison → ./balance/season.ts
  //    (coach, table, npcProgression, endOfSeason)
  // ═══════════════════════════════════════════════════════════════════════
  ...SEASON_BALANCE,

  // ═══════════════════════════════════════════════════════════════════════
  // ── reputation ──  8 jauges, bornes, inertie → ./balance/reputation.ts
  //    (reputation)
  // ═══════════════════════════════════════════════════════════════════════
  ...REPUTATION_BALANCE,

  // ═══════════════════════════════════════════════════════════════════════
  // ── calendar/career ──  saison, mercato, trêves, retraite → ./balance/career.ts
  //    (calendar, career)
  // ═══════════════════════════════════════════════════════════════════════
  ...CAREER_BALANCE,

  // ═══════════════════════════════════════════════════════════════════════
  // ── depth ──  mercato, sélection nationale, événements, traits, sponsors,
  //    fin de carrière (Phase 6) → ./balance/depth.ts
  //    (depth.transfers, depth.national, depth.events, depth.traits,
  //     depth.sponsors, depth.retirement)
  // ═══════════════════════════════════════════════════════════════════════
  ...DEPTH_BALANCE,
} as const;

export type Balance = typeof BALANCE;
