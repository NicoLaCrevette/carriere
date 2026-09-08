/**
 * Section « world » de BALANCE : génération des clubs, effectifs, PNJ et calendrier.
 * Composée dans ../balance.ts. Ajouts par Edit ciblé, jamais de suppression.
 */
import type { Position } from '../../types';

export const WORLD_BALANCE = {
  world: {
    /** Effectif minimal par poste complété par `fillSquad`. */
    squadMinByPosition: { GB: 2, DC: 4, DD: 2, DG: 2, MDC: 2, MC: 3, MOC: 2, AIG: 2, AID: 2, BU: 3 } as Record<Position, number>,
    squadTargetSize: 26,
    /** Écart-type de la note des joueurs d'un effectif autour de la cible du club. */
    squadOverallSd: 5,
    /** Écart entre titulaires et remplaçants (points de note). */
    benchOverallGap: 6,
    /** Âges plausibles d'un effectif généré. */
    ageRange: [17, 35] as readonly [number, number],
    /** Potentiel PNJ déduit de l'âge : jeune → marge haute. */
    npcPotentialMarginByAge: [
      { maxAge: 20, margin: [8, 22] },
      { maxAge: 23, margin: [4, 14] },
      { maxAge: 27, margin: [0, 6] },
      { maxAge: 99, margin: [0, 0] },
    ] as readonly { maxAge: number; margin: readonly [number, number] }[],
    /** Bruit des attributs d'un PNJ autour de sa note (écart-type). */
    attributeNoiseSd: 6,
    /** Renommée déduite : fame ≈ a × overall + b × prestige + offset. */
    fame: { overallWeight: 0.9, prestigeWeight: 0.35, offset: -35 },
    /** Compétence des coachs générés. */
    coachAbility: { mean: 55, sd: 12 },
    /** Inflation annuelle du marché (§11, m). */
    marketInflationYearly: 1.03,
    /** Prestige de la Ligue 1 par défaut pour un jeu fictif. */
    defaultLeaguePrestige: 72,
    /** Part de joueurs étrangers dans un effectif généré. */
    foreignShare: 0.42,
    /** Répartition des pieds forts. */
    footShares: { droit: 0.72, gauche: 0.24, ambidextre: 0.04 },
    /** Gabarit : taille moyenne (cm) par poste, écart-type, IMC moyen et écart-type. */
    body: {
      heightMeanByPosition: { GB: 190, DC: 187, DD: 179, DG: 178, MDC: 182, MC: 179, MOC: 177, AIG: 176, AID: 176, BU: 184 } as Record<Position, number>,
      heightSd: 4.5,
      bmiMean: 23.2,
      bmiSd: 0.9,
      heightRange: [165, 205] as readonly [number, number],
    },
    /** Probabilité qu'un PNJ généré ait un poste secondaire compatible. */
    secondaryPositionProb: 0.35,
    /** Jauges initiales des PNJ et des clubs. */
    npcInitial: { fitness: 96, morale: 60, teamMorale: 60 },
    /** Choix du capitaine : score = note + leadership × poids + bonus si âge ≥ seuil. */
    captainChoice: { leadershipWeight: 0.6, ageBonusFrom: 26, ageBonus: 6 },
    /** Coachs générés : âge, durée de contrat (années), part d'étrangers. */
    coachGen: {
      ageRange: [36, 66] as readonly [number, number],
      contractYears: [1, 3] as readonly [number, number],
      foreignShare: 0.3,
      /** Fourchettes uniformes des traits de personnalité, de la confiance envers les jeunes et de la patience. */
      personalityRange: [25, 80] as readonly [number, number],
      youthTrustRange: [20, 85] as readonly [number, number],
      patienceRange: [25, 80] as readonly [number, number],
      /** Curseurs tactiques : loi normale autour de 0,5. */
      tacticSd: 0.18,
    },
    /** Enjeu initial d'un match de championnat : base + poids × prestige moyen + bonus derby. */
    importance: { base: 30, prestigeWeight: 0.3, derbyBonus: 25 },
    /** Jeu de données fictif généré (`generateFictionalDataset`). */
    fictional: {
      clubs: 18,
      prestigeRange: [40, 92] as readonly [number, number],
      /** Note cible du onze : overallAtPrestige0 + perPrestigePoint × prestige. */
      overallAtPrestige0: 55,
      overallPerPrestigePoint: 0.29,
      /** Bruit de la note d'un titulaire autour de la cible. */
      starterSd: 2.5,
      /** Composition d'un effectif fictif (26 joueurs). */
      squadByPosition: { GB: 3, DC: 5, DD: 2, DG: 2, MDC: 3, MC: 3, MOC: 2, AIG: 2, AID: 2, BU: 2 } as Record<Position, number>,
      /** Capacité de stade, budgets et ferveur en fonction du prestige (interpolation 0 → 100). */
      capacity: [12_000, 68_000] as readonly [number, number],
      transferBudget: [3_000_000, 150_000_000] as readonly [number, number],
      wageBudgetMonthly: [900_000, 30_000_000] as readonly [number, number],
      fanbase: { min: 35, max: 90, sd: 6 },
      facilities: { min: 40, max: 95, sd: 5 },
      /** Objectif du conseil d'administration selon le rang de prestige (1 = plus prestigieux). */
      objectiveByRank: [
        { maxRank: 1, objective: 'titre' }, { maxRank: 3, objective: 'podium' }, { maxRank: 6, objective: 'europe' },
        { maxRank: 12, objective: 'ventre_mou' }, { maxRank: 99, objective: 'maintien' },
      ] as readonly { maxRank: number; objective: 'titre' | 'podium' | 'europe' | 'ventre_mou' | 'maintien' | 'montee' }[],
      /** Compétence des coachs fictifs : prestige × pente + base, bruit. */
      coachAbility: { base: 30, prestigeSlope: 0.6, sd: 6 },
    },
  },
} as const;
