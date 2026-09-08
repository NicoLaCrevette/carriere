/**
 * Section « depth » de BALANCE : mercato, sélection nationale, événements,
 * traits, sponsors, fin de carrière (Phase 6 — profondeur).
 * Composée dans ../balance.ts. Ajouts par Edit ciblé, jamais de suppression.
 */

import { CAREER_DEPTH_BALANCE } from './careerDepth';
import { NATIONAL_BALANCE } from './national';
import { EVENTS_BALANCE } from './events';

export const DEPTH_BALANCE = {
  depth: {
    /** `src/engine/transfers/` : intérêt des clubs, offres, négociation, exécution. */
    transfers: {
      /** Au plus 3 offres ouvertes (en_attente ou en_negociation) simultanément. */
      maxOpenOffers: 3,
      /** Expiration d'une offre : jours après réception. */
      expirationDays: 10,
      /** Probabilité qu'un club intéressé fasse une offre aujourd'hui, par étoile d'intérêt (fenêtre ≈ 60 jours : 1 à 4 offres concrètes). */
      offerProbByStar: { 1: 0.004, 2: 0.008, 3: 0.015, 4: 0.025, 5: 0.04 } as Record<1 | 2 | 3 | 4 | 5, number>,
      /** Au plus une offre nouvelle par jour ; le plafond par fenêtre est BALANCE.career.transfers.offersPerWindowMax. */
      maxNewOffersPerDay: 1,
      /** Montant proposé = valeur marchande × facteur tiré dans cette fourchette, selon l'intérêt. */
      feeFactorByStar: {
        1: [0.6, 0.85], 2: [0.7, 0.95], 3: [0.8, 1.05], 4: [0.95, 1.2], 5: [1.1, 1.4],
      } as Record<1 | 2 | 3 | 4 | 5, readonly [number, number]>,
      /** Durée du contrat proposé (années), hors prêt. */
      years: [2, 5] as readonly [number, number],
      /** Prêt : toujours un an, réservé aux jeunes peu utilisés (rythme de compétition bas). */
      loanYears: 1,
      loanMaxAge: 22,
      loanSharpnessBelow: 40,
      /** Part des offres à un jeune peu utilisé qui sont des prêts plutôt qu'un achat. */
      loanProbShare: 0.3,
      /** Salaire proposé = suggestedWage(club acheteur) × facteur tiré dans cette fourchette. */
      wageFactor: [0.95, 1.25] as readonly [number, number],
      /** Clause libératoire : probabilité de présence et multiplicateur du montant du transfert. */
      releaseClauseProb: 0.3,
      releaseClauseFactor: [1.3, 1.8] as readonly [number, number],
      /** Intérêt (interest.ts) : poids des critères, seuil de listage, bornes des étoiles. */
      interest: {
        needWeight: 0.35, budgetWeight: 0.25, prestigeWeight: 0.25, ageWeight: 0.15,
        /** En-dessous, le club n'est pas listé (0 étoile). */
        minScoreToList: 0.3,
        /** Score minimal pour 2, 3, 4, 5 étoiles (1 étoile par défaut au-dessus du seuil de listage). */
        starThresholds: [0.45, 0.6, 0.75, 0.88] as readonly number[],
        /** Écart d'overall (joueur vs meilleur titulaire au poste du club) qui sature le score de besoin. */
        needSpan: 16,
        /** Bonus de besoin lié au potentiel perçu (mi-fourchette de l'estimation du staff) au-delà de la note actuelle. */
        potentialBonusFactor: 0.3,
        potentialBonusMax: 8,
        /** Note plancher attendue par un club selon son prestige : base + prestige × perPoint. */
        prestigeFloorBase: 42,
        prestigeFloorPerPoint: 0.42,
        /** Écart sous le plancher au-delà duquel un club prestigieux n'est pas intéressé (0 étoile). */
        prestigeGapMax: 14,
        /** Le club doit pouvoir couvrir au moins cette fraction de la valeur marchande avec son budget transfert. */
        budgetCoverageMin: 0.55,
        /** Écart d'overall sur le titulaire actuel à partir duquel le rôle promis est « titulaire indiscutable ». */
        incumbentGapForIndisputable: 8,
      },
      /** Position du club actuel face à une offre (offers.ts). */
      stance: {
        openIfMonthsLeftBelow: 12,
        reluctantIfMonthsLeftBelow: 24,
        openIfFeeOverValue: 1.3,
        reluctantIfFeeOverValue: 0.9,
        /** Rang (0-based) dans la hiérarchie du club en dessous duquel le joueur est indispensable. */
        keyPlayerHierarchyRank: 1,
      },
      /** Négociation (negotiate.ts) : au plus 2 tours, probabilité d'acceptation qui décroît avec l'écart relatif demandé. */
      negotiation: {
        maxRounds: 2,
        baseAcceptProb: 0.55,
        acceptProbPerGapShare: -1.1,
        /** Part de l'écart que le club concède dans sa contre-contre-offre. */
        clubCounterEasing: 0.55,
      },
      /** Exécution du transfert (negotiate.ts : executeTransfer). */
      execution: {
        /** Confiance du coach envers un joueur qui vient d'arriver (repli si le rôle promis est inconnu). */
        coachTrustAfter: 45,
        /** Selon le rôle promis dans le contrat : un titulaire annoncé démarre avec la confiance qui va avec. */
        coachTrustAfterByRole: { projet: 35, rotation: 45, titulaire: 60, titulaire_indiscutable: 72 } as Record<'projet' | 'rotation' | 'titulaire' | 'titulaire_indiscutable', number>,
        memoryImportance: 4,
        /** Inflation du marché : += (montant en milliards d'€) × ce facteur, plafonnée. */
        inflationPerFeeBillion: 0.006,
        inflationMax: 1.6,
        /** Malus de réputation « supporters » à l'annonce d'un départ. */
        supportersMalusOnLeave: 4,
        /** Cible de réputation « club » à l'arrivée, selon le prestige du nouveau club (delta borné comme tout applyDeltas). */
        clubReputationFromPrestige: { base: 25, perPrestigePoint: 0.5 },
      },
      /** Demande de transfert publique (requestTransfer), en plus de BALANCE.coach.transferRequest. */
      request: {
        storylineDeadlineDays: 45,
      },
      /** Prolongation de contrat proposée par le club actuel (rollContractRenewal). */
      renewal: {
        /** Aligné sur BALANCE.contracts.renewalFromMonthsLeft. */
        monthsLeftThreshold: 12,
        usefulHierarchyRankMax: 2,
        usefulCoachTrustMin: 45,
        years: [1, 3] as readonly [number, number],
        wageGrowth: [1.05, 1.35] as readonly [number, number],
        /** Probabilité, une fois éligible, qu'un appel de prolongation arrive ce mois-ci. */
        probPerMonth: 0.5,
      },
    },

    // ── national ──  src/engine/national/ : forces par pays, seuils par étape, matchs par trêve → ./national.ts
    ...NATIONAL_BALANCE,

    // ── events ──  src/engine/events/ : dailyProb, cooldowns, changement d'entraîneur → ./events.ts
    ...EVENTS_BALANCE,

    // ── traits / sponsors / retirement ──  src/engine/career/{traits,sponsors,retirement}.ts → ./careerDepth.ts
    ...CAREER_DEPTH_BALANCE,
  },
} as const;
