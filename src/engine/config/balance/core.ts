/**
 * Section « rng/config » de BALANCE : bornes générales et création du joueur.
 * Composée dans ../balance.ts. Ajouts par Edit ciblé, jamais de suppression.
 */
import type { StartingLevel } from '../../types';

export const CORE_BALANCE = {
  bounds: {
    attribute: { min: 1, max: 99 },
    gauge: { min: 0, max: 100 },
    form: { min: -5, max: 5 },
    relation: { min: -100, max: 100 },
    rating: { min: 3.0, max: 10.0 },
  },

  creation: {
    /** Points à répartir à la création (§2). */
    allocationPoints: 40,
    /** Plafond par attribut si le profil de poste n'en fixe pas. */
    defaultCreationCap: 8,
    /** Plafonds par attribut à 16 ans selon son rôle au poste (config/positions.ts) : clé, secondaire, hors rôle. */
    creationCapTiers: { key: 12, secondary: 10, offRole: 3 },
    /** Âge de départ autorisé. */
    startAge: { min: 16, max: 21 },
    /** Points de plafond supplémentaires par année au-delà de 16 ans. */
    capBonusPerYearOver16: 1,
    /** Note globale de départ (avant répartition) par niveau. */
    startOverall: { espoir: [46, 52], prometteur: [53, 59], pepite: [60, 66] } as Record<StartingLevel, readonly [number, number]>,
    /** Fourchette du potentiel caché tiré à la création (§6.8). */
    potentialRange: { espoir: [66, 94], prometteur: [70, 92], pepite: [76, 95] } as Record<StartingLevel, readonly [number, number]>,
    /** Chance d'un potentiel « Ballon d'Or » (≥ 90) : ~1 carrière sur 8-10 avec les bons choix. */
    ballonDOrPotentialFrom: 90,
    /** Déplacement maximal cumulé du potentiel par le jeu (§6.8). */
    potentialNudgeMax: 6,
    /** Attributs gardien des joueurs de champ (et inversement) : fourchette basse. */
    offRoleAttributeRange: [5, 25] as readonly [number, number],
    /** Prédisposition cachée aux blessures : loi normale tronquée 0-1. */
    injuryProneness: { mean: 0.35, sd: 0.18 },
    /** Valeurs initiales des jauges du joueur incarné. */
    initial: {
      fitness: 92,
      sharpness: 55,
      morale: 70,
      confidence: 60,
      coachTrust: { espoir: 28, prometteur: 38, pepite: 48 } as Record<StartingLevel, number>,
    },
    // ── ajouts module player (createPlayer / overall) ──
    /**
     * Tirage du potentiel (§6.8) : avec `eliteProb`, potentiel ≥ ballonDOrPotentialFrom
     * (uniforme jusqu'au max du niveau) ; sinon tirage sous ce seuil, exposant > 1 = tiré vers le bas.
     */
    potentialDraw: { eliteProb: 0.09, belowEliteExponent: 1.15 },
    /** Génération d'attributs autour d'une note (overall.ts) : décalage moyen et écart-type par rôle de l'attribut au poste. */
    attributeGeneration: {
      /** Attributs clés du poste : note + 3 à + 8. */
      key: { offset: 5.5, sd: 1.6 },
      /** Attributs pondérés non clés : autour de la note. */
      weighted: { offset: -2, sd: 3 },
      /** Attributs du même rôle mais absents des poids : note − 5 à − 15. */
      unweighted: { offset: -10, sd: 3 },
      /** Effet de l'âge : jeune → physique un peu plus haut, mental plus bas ; trentenaire → inverse. */
      youngUntil: 20, young: { physique: 2, mental: -3 },
      oldFrom: 30, old: { physique: -3, mental: 3 },
      /** Ajustement itératif pour retomber à ± tolerance de la cible. */
      maxIterations: 16, tolerance: 1,
    },
    /** Poste secondaire déclaré à la création : compatibilité minimale (config/positions). */
    secondaryPositionMinCompat: 0.75,
  },
} as const;
