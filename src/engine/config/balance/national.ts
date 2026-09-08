/**
 * Constantes de la sélection nationale (`src/engine/national/`).
 *
 * Fichier AUTONOME, importé directement par `national/*` (`import { NATIONAL_BALANCE }
 * from '../config/balance/national'`) — volontairement PAS composé dans
 * `config/balance.ts` ni dans `config/balance/depth.ts` (cf. docs/PHASE6_CONTRACTS.md :
 * l'intégration finale dans `BALANCE.depth.national` est faite séparément, par
 * Edit ciblé de `depth.ts`, pour ne pas entrer en conflit avec les autres
 * agents qui éditent ces fichiers en parallèle).
 *
 * Les codes pays sont les codes CANONIQUES de `src/data/nationalities.ts`
 * (`normalizeCountryCode`) : les jeux de données mélangent parfois des codes
 * FIFA (« GER », « POR », « ALG », « DEN », « SUI »…) et des codes ISO
 * (« DEU », « PRT », « DZA », « DNK », « CHE »…) pour le même pays — toute
 * lecture de cette table doit passer par `normalizeCountryCode` d'abord
 * (voir `national/squads.ts::countryStrength`).
 */
import type { CountryCode } from '../../types';

export const NATIONAL_BALANCE = {
  national: {
    /**
     * Force 0-100 d'une sélection nationale, table par code pays canonique.
     * Repli sur `fallbackStrength` pour tout pays absent de la table.
     */
    strengthByCountry: {
      FRA: 92, ESP: 91, ARG: 91, BRA: 91, ENG: 90, PRT: 89, NLD: 88, DEU: 88, BEL: 86, ITA: 86,
      HRV: 84, MAR: 84, URY: 83, COL: 82, SEN: 81, DNK: 80, CHE: 79, JPN: 79, USA: 78, MEX: 78,
      CIV: 77, NGA: 76, DZA: 76, CMR: 75, TUN: 74, EGY: 74, POL: 76, AUT: 77, TUR: 77, SRB: 76,
      UKR: 76, SWE: 75, NOR: 76, SCO: 74, WAL: 72, GRC: 73, CZE: 74, HUN: 74, ROU: 72, GHA: 74,
      MLI: 73, KOR: 77, AUS: 75, CAN: 75, ECU: 77, CHL: 75, PER: 72, PRY: 73, VEN: 71, COD: 73,
      GAB: 68, GIN: 70, BFA: 70, CPV: 69, ISL: 70, IRL: 70, NIR: 66, FIN: 68, SVK: 70, SVN: 72,
      BIH: 70, GEO: 72, ALB: 70, MKD: 66, MNE: 66, ISR: 68, IRN: 76, SAU: 72, QAT: 70, JAM: 68,
      HTI: 62, COM: 60, MTQ: 58, GLP: 58,
    } as Record<CountryCode, number>,
    /** Force par défaut pour un pays sans table (petites fédérations non listées). */
    fallbackStrength: 55,

    /** Seuils d'évaluation par étape (`selection.ts::evaluateSelection`), une trêve à la fois. */
    stages: {
      /** « Espoirs » réservé aux moins de 22 ans (§11 : pipeline Espoirs → pré-liste → A). */
      espoirsMaxAge: 21,
      espoirs: { minRating: 6.2, minLeagueReputation: 20 },
      /** Pré-liste : plus accessible aux joueurs plus âgés déjà auteurs d'une bonne saison. */
      preListe: { minRating: 6.5, minLeagueReputation: 35, minAge: 16 },
      /** Première convocation A. */
      convoque: { minRating: 6.8, minLeagueReputation: 48, minMinutes60d: 300 },
      /** Titulaire : doit avoir déjà quelques sélections et confirmer au haut niveau. */
      titulaire: { minRating: 7.0, minLeagueReputation: 58, minCaps: 3 },
      cadre: { minRating: 7.15, minLeagueReputation: 68, minCaps: 8 },
      capitaine: { minRating: 7.3, minLeagueReputation: 78, minCaps: 20, minLeadership: 70 },
      /**
       * Recul d'un cran si la note ou la réputation retombent nettement sous
       * le seuil d'entrée du palier courant (marge avant rétrogradation).
       */
      demotionMarginRating: 0.5,
      demotionMarginReputation: 12,
    },
    /** Nombre de derniers matchs du joueur (toutes compétitions) utilisés pour la note moyenne récente. */
    ratingSampleMatches: 10,
    /** Fenêtre (jours) pour les minutes récentes utilisées par le seuil de première convocation. */
    minutesWindowDays: 60,

    /** Nombre de matchs joués par trêve internationale. */
    matchesPerBreak: 2,
    /** Espacement (jours) entre les deux matchs d'une même trêve. */
    daysBetweenMatches: 3,
    /** Écart de force toléré (puis élargi si besoin) pour choisir des adversaires plausibles. */
    opponentStrengthSpread: 10,
    opponentStrengthSpreadStep: 10,

    /** Effectif généré pour une sélection (`squads.ts::ensureNationalSquad`) : cible exacte par poste (somme = 23). */
    squadTargetByPosition: { GB: 3, DC: 5, DD: 2, DG: 2, MDC: 2, MC: 3, MOC: 2, AIG: 1, AID: 1, BU: 2 } as Record<string, number>,
    /** Écart-type de la note des joueurs générés autour de la force du pays, écart titulaires/réserve. */
    squadOverallSd: 4,
    benchOverallGap: 5,
    /** Âges plausibles d'une sélection A. */
    ageRange: [19, 32] as readonly [number, number],

    /** Club pseudo de la sélection (`nat_<CODE>`, `leagueId: 'international'`). */
    clubFanbase: 78,
    clubFacilities: 70,
    clubStadiumCapacity: 45_000,

    /** Enjeu (Match.importance) d'un match de sélection : base + poids × force moyenne des deux équipes. */
    matchImportanceBase: 40,
    matchImportancePerStrengthPoint: 0.35,
  },
} as const;

export type NationalBalance = typeof NATIONAL_BALANCE;
