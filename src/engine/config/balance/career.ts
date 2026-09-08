/**
 * Section « calendar/career » de BALANCE : saison, mercato, trêves, retraite, événements.
 * Composée dans ../balance.ts. Ajouts par Edit ciblé, jamais de suppression.
 */
import type { DayKind, Position, TrainingFocus } from '../../types';

export const CAREER_BALANCE = {
  calendar: {
    /** Une carrière et une saison commencent le 1er juillet. */
    seasonStart: { month: 7, day: 1 },
    seasonEnd: { month: 6, day: 30 },
    /** Première journée : troisième week-end d'août ; dernière : fin mai. */
    firstMatchday: { month: 8, earliestDay: 14 },
    lastMatchdayLatest: { month: 5, day: 31 },
    /** Trêve hivernale ~2 semaines. */
    winterBreak: { from: { month: 12, day: 23 }, to: { month: 1, day: 6 } },
    /** Trêves internationales (début du mois, ~10 jours). */
    internationalBreaks: [
      { month: 9, day: 1, days: 10 }, { month: 10, day: 6, days: 10 },
      { month: 11, day: 10, days: 10 }, { month: 3, day: 22, days: 10 },
    ] as readonly { month: number; day: number; days: number }[],
    /** Fenêtres de mercato. */
    transferWindows: {
      summer: { from: { month: 7, day: 1 }, to: { month: 9, day: 1 } },
      winter: { from: { month: 1, day: 1 }, to: { month: 2, day: 1 } },
    },
    /** Préparation d'avant-saison et vacances. */
    preparation: { from: { month: 7, day: 8 }, matchesFriendly: 3 },
    vacationDays: 21,
    /** Jours de match préférés (0 = dimanche) et espacement entre journées. */
    matchDays: { preferred: [6, 0] as readonly number[], midweek: 3, minDaysBetweenMatchdays: 3 },
    /** Part des matchs d'une journée de week-end joués le dimanche plutôt que le samedi. */
    sundayShare: 0.4,
    /** Repos hebdomadaire : lendemain de match et un jour de repos par semaine. */
    restDayOfWeek: 1,
    /** Journée « lendemain de match » : décrassage. */
    dayAfterMatchIsRecovery: true,
  },

  career: {
    /** Fin de carrière : proposée dès cet âge, imposée à l'âge max. */
    retirementAge: { proposedFrom: 33, forcedAt: 39 },
    /** Nombre de saisons visé (§0 : 15 à 20). */
    seasonsRange: [15, 20] as readonly [number, number],
    /** Actions par jour proposées (§4 : 1 à 3). */
    dayActions: { min: 1, max: 3 },
    /** Événements aléatoires : probabilité de base par jour, modulée par l'état. */
    events: { baseProbPerDay: 0.06, maxPerWeek: 2, badBuzzReputationMalus: 6 },
    /** Mémoire narrative : souvenirs injectés par appel LLM (§9). */
    memory: { injected: 15, recencyHalfLifeDays: 120 },
    /** Moral : bornes des variations quotidiennes et retour vers 60. */
    morale: { dailyDriftToBaseline: 0.5, baseline: 60, benchMalus: 2, startBonus: 1, winBonus: 3, lossMalus: 3 },
    /** Confiance 0-100 : variation après match selon la note, retour lent vers 55. */
    confidence: { perRatingPoint: 6, goalBonus: 5, baseline: 55, dailyDriftToBaseline: 0.3 },
    /** Mercato : offres. */
    transfers: { offersPerWindowMax: 4, interestFromValueRatio: 0.8, feePremiumOnDemand: 1.15, loanFromAge: 22 },
    /** Sélection nationale : seuils d'appel (note moyenne, réputation ligue). */
    national: { espoirsMaxAge: 21, preListRating: 6.6, callUpRating: 6.9, callUpLeagueReputation: 45, breakMatches: 2 },
    /** Sponsors : premier contrat dès cette réputation monde. */
    sponsors: { firstDealWorldReputation: 20, yearlyAmountPerReputationPoint: 15_000 },
    /** Journal de carrière : nombre maximal d'entrées conservées. */
    logMaxEntries: 2000,
    /**
     * Taille de la sauvegarde sur 15 à 20 saisons : le détail minute par minute
     * d'un match ne sert qu'à l'affichage. Les matchs des autres clubs sont
     * réduits à leur score dès qu'ils sont appliqués au monde ; les matchs du
     * joueur gardent leur flux d'événements pour les N plus récents seulement.
     */
    saves: { keepMatchFeedForLastPlayerMatches: 20 },
    /** Bornes des deltas appliqués via applyDeltas (relations par interaction, moral par appel). */
    deltaBounds: { relationshipPerInteraction: 10, moralePerCall: 10 },
    /** Relations initiales (confiance, respect) avec les PNJ créés à la naissance de la carrière. */
    initialRelationships: {
      coach: { trust: 10, respect: 5 },
      capitaine: { trust: 5, respect: 10 },
      agent: { trust: 30, respect: 20 },
      journaliste: { trust: 0, respect: 0 },
      mere: { trust: 85, respect: 60 },
    },
    /** Entraînement par défaut en mode auto, selon le type de journée. */
    defaultTraining: {
      entrainement: { focus: 'physique', intensity: 'normale' },
      preparation: { focus: 'physique', intensity: 'normale' },
      mercato: { focus: 'physique', intensity: 'normale' },
      treve_internationale: { focus: 'physique', intensity: 'normale' },
      veille_match: { focus: 'tactique_individuelle', intensity: 'legere' },
      lendemain_match: { focus: 'recuperation', intensity: 'legere' },
    } as Partial<Record<DayKind, { focus: TrainingFocus; intensity: 'legere' | 'normale' | 'intense' }>>,
    /** Rotation des séances en mode auto, par poste (jour de l'année modulo la longueur). */
    autoTrainingRotation: {
      GB: ['gardien_specifique', 'gardien_specifique', 'physique', 'passes', 'placement', 'gardien_specifique', 'tactique_individuelle'],
      DC: ['defense', 'jeu_de_tete', 'placement', 'physique', 'passes', 'musculation', 'tactique_individuelle'],
      DD: ['vitesse', 'defense', 'passes', 'physique', 'tactique_individuelle', 'dribble', 'placement'],
      DG: ['vitesse', 'defense', 'passes', 'physique', 'tactique_individuelle', 'dribble', 'placement'],
      MDC: ['defense', 'passes', 'tactique_individuelle', 'physique', 'placement', 'musculation', 'passes'],
      MC: ['passes', 'tactique_individuelle', 'physique', 'defense', 'placement', 'finition', 'dribble'],
      MOC: ['passes', 'dribble', 'finition', 'tactique_individuelle', 'physique', 'placement', 'coups_de_pied_arretes'],
      AIG: ['dribble', 'vitesse', 'finition', 'passes', 'physique', 'tactique_individuelle', 'dribble'],
      AID: ['dribble', 'vitesse', 'finition', 'passes', 'physique', 'tactique_individuelle', 'dribble'],
      BU: ['finition', 'physique', 'dribble', 'placement', 'jeu_de_tete', 'finition', 'tactique_individuelle', 'vitesse'],
    } as Record<Position, readonly TrainingFocus[]>,
    /** Promesses publiques (§8) : effets d'une promesse tenue ou rompue, avant inertie. */
    promises: {
      kept: { supporters: 2, media: 2, teammates: 1 },
      broken: { supporters: -3, media: -3, coach: -1 },
      /** Durée par défaut d'une promesse « déclarative » (jours). */
      defaultDeadlineDays: 30,
    },
    /** Scènes de dialogue (Phase 4) : déclencheurs et effets relationnels. */
    scenes: {
      flashMinMinutes: 20,
      conferenceRatingHigh: 7.5,
      conferenceRatingLow: 5.0,
      lockerRoomLowRating: 5.3,
      lockerRoomGoalsFrom: 2,
      agentCallDayOfMonth: 1,
      agentLowMinutes30Days: 90,
      agentContractMonths: 12,
      coachOfficeTrustLow: 25,
      coachOfficeTrustHigh: 75,
      coachOfficeGapDays: 60,
      /** Relation avec l'interlocuteur : par point de score de communication autour de 5. */
      relationshipPerScorePoint: { trust: 1.2, respect: 0.7 },
      /** Malus relationnel direct quand le joueur attaque son interlocuteur (coach ou coéquipiers). */
      attackedMalus: { trust: -8, respect: -5 },
      /** Nombre de questions par conférence de presse [min, max]. */
      conferenceQuestions: [2, 4] as readonly [number, number],
      /**
       * La semaine doit être vivante : quelqu'un vient te parler régulièrement.
       * Chaque déclencheur a son délai minimal pour ne pas devenir du bruit.
       */
      causerieAvantGrosMatch: { importanceFrom: 68, daysBefore: 2, gapDays: 10 },
      capitaineApresMauvaisePasse: { ratingBelow: 5.8, matches: 2, gapDays: 14 },
      capitaineMoralBas: { moraleBelow: 40, gapDays: 21 },
      agentSurOffre: { gapDays: 5 },
    },
    /** Retraite forcée à la fin de la saison où le joueur atteint cet âge (voir retirementAge.forcedAt). */
    retirementCheckAtSeasonEnd: true,
  },
} as const;
