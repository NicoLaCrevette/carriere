/**
 * Section « profondeur de carrière » de BALANCE (Phase 6) : traits, sponsors,
 * fin de carrière. Composée dans ../balance.ts sous `depth`. Ajouts par Edit
 * ciblé, jamais de suppression.
 */
export const CAREER_DEPTH_BALANCE = {
  traits: {
    /** Enjeu de match (0-100) à partir duquel un match compte comme « grand match ». */
    bigMatchImportance: 70,
    /** Buts décisifs en grands matchs pour « sang-froid des grands soirs ». */
    decisiveBigMatchGoalsFor: 3,
    /** Cote supporters à tenir, et pendant combien de jours, pour « chouchou du public ». */
    supportersHigh: { value: 80, days: 60 },
    /** Cartons rouges dans la saison pour « tête brûlée ». */
    redCardsSeasonFor: 2,
    /** Séances intenses cumulées pour « bourreau de travail ». */
    intenseSessionsFor: 60,
    /** « Fragile » : N blessures d'au moins minDays jours sur windowDays ; retiré après clearAfterDays sans blessure sérieuse. */
    fragile: { minDays: 15, count: 3, windowDays: 548, clearAfterDays: 730 },
    /** Matchs joués avec le brassard pour « leader ». */
    leaderCaptainMatches: 30,
    /** « Mercenaire » : N transferts (hors prêts) en windowDays jours. */
    mercenaire: { transfers: 3, windowDays: 1461 },
    /** « Renard des surfaces » : buts dans une saison (attaquants). */
    renard: { goalsSeason: 15 },
    /** « Roc » : matchs et note moyenne dans une saison (défenseurs centraux, milieux défensifs). */
    roc: { matchesSeason: 25, averageRating: 6.8 },
  },

  sponsors: {
    /** Réputation monde minimale pour recevoir une proposition. */
    minWorldReputation: 20,
    /** Contrats actifs ou en attente au maximum. */
    maxActive: 3,
    /** Probabilité de proposition chaque 1er du mois quand les conditions sont réunies. */
    monthlyOfferProb: 0.35,
    /** Une proposition sans réponse expire après ce délai (jours). */
    proposalExpiryDays: 21,
    /** Durée des contrats [min, max] en années. */
    yearsRange: [1, 3] as readonly [number, number],
    /** Négociation : hausse demandée et probabilité que la marque l'accepte. */
    negotiation: { raise: 0.2, acceptProb: 0.5 },
    /** Montant annuel de base selon la réputation monde (palier atteint). */
    tiers: [
      { fromWorld: 20, amountYearly: 40_000 },
      { fromWorld: 35, amountYearly: 150_000 },
      { fromWorld: 50, amountYearly: 500_000 },
      { fromWorld: 65, amountYearly: 1_500_000 },
      { fromWorld: 80, amountYearly: 5_000_000 },
    ] as readonly { fromWorld: number; amountYearly: number }[],
    /** Bonus multiplicatif par point de réputation médias. */
    mediaBonusPerPoint: 0.005,
    /** Dispersion aléatoire du montant [min, max]. */
    amountSpread: [0.85, 1.15] as readonly [number, number],
    /** Obligations par contrat [min, max]. */
    obligationsPerDeal: [1, 2] as readonly [number, number],
    /** Réputation médias gagnée à la signature. */
    signingMediaBonus: 1,
  },

  retirement: {
    /** Retraite possible dès cet âge, imposée en fin de saison à l'âge forcé. */
    minAge: 33,
    forcedAge: 39,
    /** Une blessure de cette durée réelle (jours) rend la retraite possible à tout âge. */
    careerEndingInjuryDays: 300,
  },
} as const;
