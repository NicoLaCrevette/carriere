/**
 * Section « season » de BALANCE : coach IA, hiérarchie, classement,
 * progression des PNJ et fin de saison.
 * Composée dans ../balance.ts. Ajouts par Edit ciblé, jamais de suppression.
 */

export const SEASON_BALANCE = {
  coach: {
    /** Patience (0-100) selon la tolérance de la difficulté (§6.9). */
    patienceByTolerance: { haute: 75, moyenne: 55, faible: 35 },
    /** Sanctions en match : sortie anticipée si la note est sous ce seuil à partir de cette minute. */
    subOff: { ratingThreshold: 5.4, fromMinute: 55, baseProb: 0.35, patienceInfluence: 0.4, fatigueThreshold: 45 },
    /** Un « mauvais match » pour le coach. */
    badMatchRating: 5.6,
    goodMatchRating: 7.0,
    /** Confiance du coach : variation par point de note autour de 6.3, bornée par match. */
    trust: { perRatingPoint: 4, maxPerMatch: 8, decisiveBonus: 3, cardMalus: 3, redCardMalus: 8, weeklyDriftToMerit: 0.1 },
    /** Banc après N mauvais matchs consécutifs ; tribune sous cette confiance. */
    benchAfterConsecutiveBad: 2,
    tribuneBelowTrust: 15,
    /** Hiérarchie au poste : poids des critères (somme 1). */
    hierarchyWeights: { overall: 0.6, form: 0.15, fitness: 0.1, trust: 0.15 },
    /** Points de note d'avance nécessaires pour déloger un titulaire installé (§6.5). */
    incumbentBonus: 2.5,
    /** Confiance envers les jeunes : bonus pour les moins de 21 ans si youthTrust élevé. */
    youthBonusMax: 3,
    /** Rotation légère : probabilité de faire souffler un titulaire fatigué. */
    rotationProb: 0.12,
    rotationFitnessBelow: 65,
    /** Demande de transfert : malus de confiance et de réputation. */
    transferRequest: { trustMalus: 25, supportersMalus: 10, coachRepMalus: 12 },
    /** Confiance après match : pivot de note, malus fort sous 5.5 (§6.5), facteur des malus selon la tolérance (§6.9). */
    trustAfterMatch: {
      ratingPivot: 6.3,
      strongMalusBelowRating: 5.5,
      strongMalus: 4,
      negativeFactorByTolerance: { haute: 0.6, moyenne: 1.0, faible: 1.4 },
      /** Minutes jouées pour un effet plein (un remplaçant de 10 minutes bouge peu). */
      minutesForFullEffect: 60,
    },
    /** Sortie anticipée : fenêtre « mauvais match » (60e-72e), fraîcheur (fitness − fatigue du match) sous laquelle le coach sort le joueur, délai de grâce d'un remplaçant. */
    subOffExtra: { untilMinute: 72, freshnessBelow: 35, subbedOnGraceMinutes: 20 },
    /** Confiance implicite du coach envers un PNJ (pas de jauge pour eux). */
    npcTrustDefault: 60,
    /**
     * Seuils de la situation prévisionnelle dans un effectif (`player/squadFit.ts`),
     * exprimés en points de note d'écart avec le DEUXIÈME choix du club au poste.
     * Calibrés sur la simulation : à Angers l'écart vaut 10 et le joueur finit
     * titulaire dès la deuxième saison ; à Strasbourg il vaut 15 et le joueur
     * ne dispute pas une seule titularisation en quatre saisons.
     */
    squadFit: { titulaire: 0, rotation: 6, remplacant: 14 },
    /** Composition du onze (lineupSelection). */
    lineup: {
      /** Forme -5..+5 → ±10 % sur le score de sélection. */
      formPerPoint: 0.02,
      /** Part du score qui dépend du fitness (0.15 : un joueur à 0 de fitness vaut 85 %). */
      fitnessWeight: 0.15,
      /** Compatibilité minimale d'un poste secondaire déclaré. */
      secondaryPositionCompat: 0.92,
      /**
       * Joueur incarné : la défiance du coach coûte des POINTS de note, pas un
       * pourcentage. Un malus multiplicatif grandit avec le niveau (à 0.83, un
       * joueur à 55 perd 9 points, un joueur à 73 en perd 12) : progresser ne
       * rapproche jamais du onze, et la hiérarchie se verrouille — la confiance
       * dépend du rang, qui dépend de la confiance. En points, le malus est
       * constant : le joueur qui devient meilleur que ses concurrents finit par
       * passer devant, sans que le début de carrière soit plus tendre.
       * 0 de confiance → −maxPenalty points ; 100 → aucun malus.
       */
      playerTrust: { maxPenalty: 12 },
      benchSize: 9,
      /** Congestion : N matchs en D jours → repos partiel des titulaires fatigués avec cette probabilité. */
      congestion: { matches: 3, days: 8, restProb: 0.5 },
      /** Un remplaçant ne remplace un titulaire au repos que s'il vaut au moins cette fraction de son score. */
      rotationMinScoreRatio: 0.8,
      /** Hiérarchie : compatibilité minimale pour figurer dans la liste d'un poste. */
      hierarchyMinCompat: 0.5,
      /** Le joueur incarné est dans le groupe (banc) dès cette confiance du coach, sauf blessure ou suspension. */
      playerBenchTrustFrom: 25,
    },
    /** Dérive hebdomadaire de la confiance vers un niveau « mérité » par la hiérarchie au poste (rang 1, 2, 3, 4…) et la forme. */
    trustMerit: { byRank: [80, 60, 45, 32] as readonly number[], beyond: 22, formPerPoint: 2 },
  },

  table: {
    /** Longueur de la série de derniers résultats affichée. */
    last5Length: 5,
    /** Points par défaut si le format de la ligue n'est pas fourni. */
    defaultPoints: { win: 3, draw: 1 },
  },

  /** Effets d'un match sur le joueur incarné (advanceDay). */
  playerAfterMatch: {
    /** Forme glissante : form = form × decay + (note − pivot) × perRatingPoint, bornée -5..+5. */
    form: { decay: 0.7, perRatingPoint: 1.2, ratingPivot: 6.3 },
    /** Suspensions : matchs pour un rouge, jaunes cumulés avant un match de suspension. */
    suspension: { redCardMatches: 1, yellowsForBan: 3 },
    /** Un match entre en mémoire narrative à partir de cette note ou de ce nombre de buts. */
    memory: { ratingFrom: 8.0, goalsFrom: 2, importanceHigh: 4, importanceLow: 2 },
    /** Fraction de la fatigue de match considérée comme « intensité » (1 = match normal). */
    intensity: 1.0,
  },

  npcProgression: {
    /** Progression annuelle des PNJ vers le potentiel (fraction de l'écart), par tranche d'âge. */
    yearlyGainShare: [
      { maxAge: 20, share: 0.35 }, { maxAge: 23, share: 0.25 }, { maxAge: 27, share: 0.12 }, { maxAge: 99, share: 0 },
    ] as readonly { maxAge: number; share: number }[],
    /**
     * Plafond de note des PNJ selon le prestige du club (base + prestige × perPrestigePoint) :
     * sans mercato, il tient lieu de « la star part dans un plus grand club ». Prestige 55 → 76, prestige 90 → 87.
     */
    clubCeiling: { base: 58, perPrestigePoint: 0.32 },
    /** Plafond absolu du gain annuel d'un PNJ (points de note) : un titulaire de Ligue 1 ne prend pas 5 points par an. */
    yearlyGainMax: [
      { maxAge: 20, max: 4 }, { maxAge: 23, max: 3 }, { maxAge: 27, max: 1.5 }, { maxAge: 99, max: 0 },
    ] as readonly { maxAge: number; max: number }[],
    /** Déclin annuel après 30 ans (points de note), accéléré chaque année. */
    decline: { fromAge: 30, pointsPerYear: 1.2, accelerationPerYear: 1.3 },
    /** Retraite : probabilité par an selon l'âge. */
    retirement: [
      { maxAge: 32, prob: 0.02 }, { maxAge: 34, prob: 0.15 }, { maxAge: 36, prob: 0.4 }, { maxAge: 99, prob: 0.8 },
    ] as readonly { maxAge: number; prob: number }[],
    /** Forme PNJ après match : variation selon le résultat et les buts. */
    formAfterMatch: { win: 0.4, draw: 0, loss: -0.4, goal: 0.6, assist: 0.4, decayToZero: 0.15 },
    /** Récupération quotidienne des PNJ (fitness). */
    dailyRecovery: 12,
    /** Retraite envisagée seulement à partir de cet âge (§ mission : 34-38). */
    minRetirementAge: 33,
    /** Suspension PNJ après un rouge (matchs). */
    redCardSuspension: 1,
    /** Minutes créditées à un titulaire et à un remplaçant entré en jeu (stats PNJ simplifiées). */
    minutes: { starter: 90, substitute: 30 },
    /** Répartition du gain annuel entre groupes d'attributs (physique monte moins vite chez les jeunes déjà rapides). */
    gainGroupFactor: { technique: 1.0, physique: 0.9, mental: 1.1, gardien: 1.0 },
    /** Répartition du déclin annuel entre groupes (physique d'abord). */
    declineGroupFactor: { technique: 0.7, physique: 1.6, mental: 0.2, gardien: 0.9 },
  },

  /**
   * Moteur de semaine (`season/week.ts`) : le joueur lance une semaine entière
   * et le moteur s'arrête dès qu'il se passe quelque chose. Sans cela il
   * faudrait valider ~300 journées vides par saison.
   */
  week: {
    /** Journées avancées au maximum par appel à `advanceWeek` (une semaine calendaire). */
    maxDays: 7,
    /** Bilan de semaine : lignes de journal conservées au maximum (les plus anciennes d'abord). */
    maxMessages: 12,
    /** Bilan de semaine : attributs détaillés au maximum dans « ce que l'entraînement a rapporté ». */
    maxProgression: 6,
  },

  endOfSeason: {
    /** Récompenses : minimum de matchs pour être éligible. */
    minMatchesForAwards: 15,
    /** Espoir de la saison : âge maximal. */
    youngPlayerMaxAge: 21,
    /** Équipe type : formation utilisée. */
    teamOfTheSeasonFormation: '4-3-3',
    /** Ballon d'Or : score = note moyenne × poids + buts + trophées ; taille du classement. */
    ballonDOr: { ratingWeight: 10, goalsWeight: 0.15, assistsWeight: 0.1, trophyWeight: 2, capsWeight: 0.05, top: 30 },
    /** Prime de fin de saison au moral. */
    moraleBonus: { trophy: 10, relegation: -15, europe: 4 },
    /**
     * Révision du potentiel en fin de saison (§6.8), au plus un point par
     * saison et ±6 au total sur la carrière (`creation.potentialNudgeMax`).
     */
    potentialNudge: { goodRating: 7.1, goodMatches: 20, poorRating: 6.0, poorMatches: 15, lostMinutes: 300 },
    /** Score de saison d'un joueur pour les récompenses : note moyenne (repli si aucune) + buts + passes. */
    seasonScore: { fallbackRating: 6.2, goalsWeight: 0.06, assistsWeight: 0.04, cleanSheetWeight: 0.05 },
    /** Clubs promus générés pour remplacer les relégués (prestige bas). */
    promotedClub: {
      prestige: [22, 38] as readonly [number, number],
      fanbase: [30, 55] as readonly [number, number],
      facilities: [30, 50] as readonly [number, number],
      capacity: [12_000, 28_000] as readonly [number, number],
      targetOverall: [56, 62] as readonly [number, number],
      transferBudget: 8_000_000,
      wageBudgetMonthly: 900_000,
    },
    /** Prolongation automatique (Phase 1) d'un contrat arrivé à échéance : années ajoutées. */
    autoRenewYears: 1,
  },
} as const;
