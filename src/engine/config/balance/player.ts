/**
 * Section « player » de BALANCE : progression, forme physique, blessures,
 * valeur marchande et contrats.
 * Composée dans ../balance.ts. Ajouts par Edit ciblé, jamais de suppression.
 */
import type { AttributeKey, DayKind, InjuryType, Position, PromisedRole, StartingLevel } from '../../types';

export const PLAYER_BALANCE = {
  progression: {
    /**
     * XP par séance et par attribut ciblé, avant facteurs. Formule §10 :
     * gain = base × facteurÂge × (potentiel − actuel) × qualitéCentre × moral × tempsDeJeu.
     * Calibré pour qu'un joueur de 19 ans à 20 points de son potentiel gagne
     * ~4-6 points de note par saison (centre 0.8, moral 0.7, temps de jeu 0.8).
     */
    xpBasePerSession: 0.0055,
    /** Le terme (potentiel − actuel) est borné pour éviter les explosions ; `min` s'applique une fois le potentiel atteint. */
    potentialGap: { min: 1, max: 30 },
    /** Sous cet écart, le terme reste au plancher tant que la note est sous le potentiel (plateau franc plutôt qu'asymptote). */
    potentialGapFloor: 12,
    /** Multiplicateur d'intensité de séance. */
    intensityMultiplier: { legere: 0.6, normale: 1.0, intense: 1.45 },
    /** Facteur d'âge par groupe d'attributs (§10 : fort 17-23, plateau 24-29, déclin dès 30). */
    ageBands: [
      { maxAge: 19, technique: 1.15, physique: 1.2, mental: 0.95, gardien: 1.05 },
      { maxAge: 23, technique: 1.0, physique: 1.0, mental: 1.0, gardien: 1.0 },
      { maxAge: 29, technique: 0.5, physique: 0.4, mental: 0.7, gardien: 0.65 },
      { maxAge: 32, technique: 0.25, physique: 0.05, mental: 0.5, gardien: 0.4 },
      { maxAge: 99, technique: 0.1, physique: 0.0, mental: 0.35, gardien: 0.2 },
    ] as readonly { maxAge: number; technique: number; physique: number; mental: number; gardien: number }[],
    /** Attributs qui continuent de monter tard (placement, vision, sang-froid). */
    lateBloomers: ['placement', 'vision', 'sangFroid', 'leadership'] as readonly AttributeKey[],
    lateBloomerAgeFactor: 0.6,
    /** Déclin quotidien (XP négative) à partir de cet âge, vitesse et détente en premier. */
    decline: {
      fromAge: 30,
      xpPerDay: { physique: -0.0045, technique: -0.0012, mental: 0, gardien: -0.0008 },
      /** Attributs qui déclinent en premier (multiplicateur). */
      earlyDecliners: { vitesse: 1.6, acceleration: 1.6, detente: 1.4, agilite: 1.2 } as Partial<Record<AttributeKey, number>>,
      /** Accélération du déclin par année au-delà de fromAge. */
      accelerationPerYear: 1.25,
    },
    /** Sur-entraînement : séances intenses d'affilée. */
    overtraining: { streakThreshold: 3, injuryMultiplierPerExtraSession: 1.35, xpMalusPerExtraSession: 0.85, maxInjuryMultiplier: 3.0 },
    /** XP de match : par minute jouée et bonus de note. */
    match: { xpPerMinute: 0.00028, ratingBonusPerPoint: 0.35, minutesForFullEffect: 70 },
    /** Facteur « temps de jeu » : minutes sur 30 jours rapportées à cette référence. */
    playingTime: { referenceMinutes30Days: 270, min: 0.6, max: 1.1 },
    /** Facteur « moral » : 0.6 à moral 0, 1.0 à moral 70, 1.1 à 100. */
    morale: { atZero: 0.6, atSeventy: 1.0, atHundred: 1.1 },
    /** Facteur « qualité du centre » : facilities 0-100 → 0.6-1.1. */
    facilities: { min: 0.6, max: 1.1 },
    /** Estimation floue du potentiel (§10) : largeur de la fourchette selon l'âge. */
    estimate: { widthAt17: 16, widthAt25: 6, widthMin: 3 },
    // ── ajouts module player (progression / training) ──
    /** Les attributs tardifs gardent leur plancher de facteur d'âge jusqu'à cet âge inclus (§10 : 32-33). */
    lateBloomerUntilAge: 33,
    /** Sur-entraînement (§10) : ×2 de risque de blessure dès le seuil atteint, fatigue accrue par séance de trop. */
    overtrainingExtra: { injuryMultiplierAtThreshold: 2.0, fatigueMultiplierPerExtraSession: 1.25 },
    /** Temps de jeu estimé depuis le rythme de compétition : minutes sur 30 jours ≈ sharpness / 100 × cette valeur. */
    sharpnessToMinutes30Days: 360,
    /** Séance suivie en étant blessé : XP réduite, pas de tirage de blessure. */
    injuredXpMultiplier: 0.25,
    /** Focus « récupération » : gain de fitness au lieu de fatigue. */
    recoveryFocusFitnessGain: 6,
    /** Part de l'XP d'une séance qui se répartit entre attributs ciblés : poids relatifs de TRAINING_TARGETS × ce facteur. */
    trainingTargetScale: 1.0,
    /**
     * Estimation floue : décalage du centre (fraction de la largeur, déterministe par joueur et par âge),
     * resserrement selon la révélation §6.9 (« jamais » = fourchette [note, 99]), seuils des phrases du staff.
     */
    estimateExtra: {
      centerOffsetShare: 0.35,
      widthByReveal: { indicative: 0.75, floue: 1.0, jamais: 0 } as Record<'indicative' | 'floue' | 'jamais', number>,
      statementThresholds: { sommet: 90, europe: 82, titulaire: 74 },
    },
  },

  fitness: {
    /** Fatigue par minute de match (×intensité, 1 = match normal) : un match plein coûte ~22-28 points (mission player). */
    fatiguePerMatchMinute: 0.28,
    /** Multiplicateur de fatigue de match par poste : latéraux, milieux et ailiers courent plus, le gardien peu. */
    positionFatigue: {
      GB: 0.6, DC: 0.9, DD: 1.1, DG: 1.1, MDC: 1.05, MC: 1.1, MOC: 1.0, AIG: 1.1, AID: 1.1, BU: 1.0,
    } as Record<Position, number>,
    /** Multiplicateur de fatigue selon l'âge : les jeunes et les trentenaires encaissent plus. */
    ageFatigue: { youngUntil: 19, youngFactor: 1.08, oldFrom: 30, oldFactorPerYear: 0.03 },
    /** Journées sans déclin du rythme (le match lui-même en apporte). */
    sharpnessNoDecayDays: ['jour_match', 'match_international'] as readonly DayKind[],
    /** Fatigue d'une séance selon l'intensité. */
    trainingFatigue: { legere: 4, normale: 9, intense: 15 },
    /** Récupération quotidienne par type de journée (points de fitness). */
    /** Une séance normale (−9) est plus que compensée par la nuit (+12) : un joueur bien géré arrive frais au match. */
    recoveryByDay: {
      entrainement: 12, veille_match: 12, jour_match: 0, lendemain_match: 14, repos: 22,
      treve_internationale: 14, rassemblement_selection: 10, match_international: 0,
      mercato: 12, intersaison: 18, preparation: 12, vacances: 20, reeducation: 10,
    } as Record<DayKind, number>,
    /** Multiplicateur de récupération selon l'âge (plus lent après 30 ans). */
    recoveryAge: { fromAge: 30, perYearMultiplier: 0.95, min: 0.7 },
    /** Rythme de compétition : gagné par minute jouée, perdu chaque jour sans match. */
    sharpness: { gainPerMatchMinute: 0.25, decayPerDay: 1.0, trainingGainPerSession: 0.6, max: 100 },
    /** Multiplicateur de performance 0.6-1.0 (fitness pèse plus que sharpness). */
    multiplier: { min: 0.6, fitnessWeight: 0.65, sharpnessWeight: 0.35 },
    /** Sous ce niveau de fitness, le staff conseille le repos. */
    tiredThreshold: 60,
  },

  injuries: {
    /**
     * Probabilité de base par minute de match, toutes gravités confondues.
     * ≈ 1 blessure sérieuse (≥ 3 semaines, ~45 % des tirages) toutes les
     * 1 500-2 500 minutes selon l'âge, la fatigue et la prédisposition.
     */
    baseProbPerMatchMinute: 0.0005,
    /** Probabilité de base par séance d'entraînement. */
    trainingProb: { legere: 0.0012, normale: 0.003, intense: 0.007 },
    /** Multiplicateur d'âge. */
    ageMultiplier: [
      { maxAge: 22, factor: 0.85 },
      { maxAge: 29, factor: 1.0 },
      { maxAge: 32, factor: 1.3 },
      { maxAge: 99, factor: 1.65 },
    ] as readonly { maxAge: number; factor: number }[],
    /** Multiplicateur de fatigue selon le fitness courant. */
    fatigueMultiplier: [
      { belowFitness: 50, factor: 2.0 },
      { belowFitness: 65, factor: 1.5 },
      { belowFitness: 80, factor: 1.15 },
      { belowFitness: 101, factor: 1.0 },
    ] as readonly { belowFitness: number; factor: number }[],
    /** Contact (duel, tacle subi) et prédisposition cachée : facteur = base + slope × proneness. */
    contactMultiplier: 1.3,
    proneness: { base: 0.7, slope: 0.6 },
    /** Poids relatifs et durées réelles [min, max] en jours par type. */
    types: {
      contracture: { weight: 22, days: [4, 12], serious: false },
      mollet: { weight: 9, days: [12, 28], serious: false },
      adducteurs: { weight: 9, days: [8, 24], serious: false },
      dos: { weight: 6, days: [5, 25], serious: false },
      commotion: { weight: 4, days: [7, 14], serious: false },
      entorse_cheville: { weight: 12, days: [10, 30], serious: true },
      ischios: { weight: 14, days: [14, 35], serious: true },
      entorse_genou: { weight: 8, days: [21, 60], serious: true },
      pubalgie: { weight: 5, days: [30, 90], serious: true },
      menisque: { weight: 4, days: [40, 90], serious: true },
      fracture: { weight: 8, days: [45, 120], serious: true },
      croises: { weight: 7, days: [180, 270], serious: true },
    } as Record<InjuryType, { weight: number; days: readonly [number, number]; serious: boolean }>,
    /** Une blessure > ce seuil est « lourde » (§6.6). */
    heavyInjuryDays: 90,
    /** Le staff annonce un diagnostic optimiste : annoncé = réel × facteur. */
    announcedOptimism: 0.85,
    /** Risque de rechute laissé après guérison, par gravité. */
    recurrenceRisk: { minor: 0.04, serious: 0.1, heavy: 0.18, playedThroughBonus: 0.08 },
    /** Jouer blessé : malus d'attributs (multiplicateur) et rallongement de la durée. */
    playThrough: { attributeMultiplier: 0.82, extraDaysPerMatch: 4, aggravationProb: 0.12 },
    /** Séquelles permanentes sur blessure lourde (points perdus sur vitesse/détente). */
    permanentLoss: { probIfHeavy: 0.45, points: [1, 3] as readonly [number, number] },
    /** Moral perdu par semaine d'indisponibilité. */
    moralePerWeekOut: 2.5,
    /** Blessures PNJ en match (probabilité par match et par équipe). */
    npcPerMatchPerTeam: 0.12,
    // ── ajouts module player (injuries) ──
    /** Blessure hors terrain : probabilité par tirage (événement de vie). */
    offPitchProb: 0.002,
    /** Intensité numérique (0-1) d'une séance, pour retrouver sa catégorie dans `trainingProb`. */
    trainingIntensityValue: { legere: 0.35, normale: 0.65, intense: 1.0 },
    /** Intensité d'un match : facteur = 1 + slope × (intensité − 1), borné. */
    matchIntensity: { slope: 0.5, min: 0.6, max: 1.5 },
    /** Diagnostic annoncé : facteur tiré dans [optimism − jitter, optimism + jitter] (10-20 % d'optimisme). */
    announcedOptimismJitter: 0.05,
    /** Rechute : fenêtre après guérison (jours), durée relative à la blessure d'origine, risque résiduel après rechute. */
    recurrence: { windowDays: 30, relativeDuration: [0.4, 0.7] as readonly [number, number], riskAfterRelapse: 0.25 },
    /** Séquelles permanentes : attributs candidats. */
    permanentLossKeys: ['vitesse', 'acceleration', 'detente'] as readonly AttributeKey[],
    /** Jouer blessé : groupes d'attributs touchés par type (physique par défaut, mental pour une commotion). */
    playThroughGroups: { commotion: ['mental'] } as Partial<Record<InjuryType, readonly ('technique' | 'physique' | 'mental' | 'gardien')[]>>,
    playThroughDefaultGroups: ['physique'] as readonly ('technique' | 'physique' | 'mental' | 'gardien')[],
    /** Une blessure au-delà de ce nombre de jours compte comme « significative » (mission : ~1 par 1 800 min). */
    significantDays: 7,
    /** Jouer blessé : jours ajoutés en cas d'aggravation (en plus de extraDaysPerMatch). */
    playThroughAggravationExtraDays: 10,
  },

  marketValue: {
    /** Base par poste (euros) pour une note de référence (§11, base(poste)). */
    baseByPosition: {
      GB: 1_600_000, DC: 2_250_000, DD: 2_000_000, DG: 2_000_000, MDC: 2_150_000,
      MC: 2_500_000, MOC: 3_050_000, AIG: 3_200_000, AID: 3_200_000, BU: 3_400_000,
    } as Record<Position, number>,
    /** f(note) : exponentielle autour de la référence (×4,5 tous les 10 points ; 65 ≈ 2 M€, 75 ≈ 10 M€, 82 ≈ 35 M€ avec réputation). */
    overallCurve: { reference: 70, growthPerPoint: 0.15 },
    /** g(âge) : interpolation linéaire entre points. */
    ageCurve: [
      { age: 16, factor: 0.6 }, { age: 18, factor: 0.8 }, { age: 21, factor: 1.05 },
      { age: 24, factor: 1.15 }, { age: 27, factor: 1.05 }, { age: 29, factor: 0.9 },
      { age: 31, factor: 0.65 }, { age: 33, factor: 0.4 }, { age: 36, factor: 0.2 },
    ] as readonly { age: number; factor: number }[],
    /** h(potentiel restant) : 1 + slope × (potentiel − note), plafonné. */
    potentialFactor: { perPoint: 0.025, max: 1.6 },
    /** i(forme sur 10 matchs) : 1 + slope × (moyenne des notes − 6.3). */
    formFactor: { perRatingPoint: 0.25, min: 0.75, max: 1.4 },
    /** j(réputation) : 1 + a × ligue/100 + b × monde/100. */
    reputationFactor: { leagueWeight: 0.3, worldWeight: 0.6 },
    /** k(contrat restant) par tranche de mois restants. */
    contractFactor: [
      { maxMonths: 6, factor: 0.55 }, { maxMonths: 12, factor: 0.75 },
      { maxMonths: 24, factor: 0.95 }, { maxMonths: 36, factor: 1.0 }, { maxMonths: 999, factor: 1.05 },
    ] as readonly { maxMonths: number; factor: number }[],
    /** l(prestige du club) : base + slope × prestige/100. */
    prestigeFactor: { base: 0.7, slope: 0.6 },
    /** Prestige de la ligue : même forme. */
    leaguePrestigeFactor: { base: 0.5, slope: 0.7 },
    minValue: 100_000,
    /** Arrondi d'affichage (euros). */
    rounding: 50_000,
    /** Jour du mois où la valeur est recalculée. */
    recomputeDayOfMonth: 1,
    // ── ajouts module player (marketValue) ──
    /** f(note) : au-delà de ce seuil la croissance par point se tasse (§11 : 88 ≈ 90 M€, 92+ ≈ 150 M€+). */
    overallCurveSoftening: { fromOverall: 85, growthPerPoint: 0.1 },
    /** Réputation par défaut (si non fournie) dérivée de la note : ligue ≈ (note − 55) × 2.5, monde ≈ (note − 65) × 3, bornées 0-100. */
    reputationProxy: { league: { fromOverall: 55, perPoint: 2.5 }, world: { fromOverall: 65, perPoint: 3 } },
    /** Réputation d'un PNJ dérivée de sa renommée. */
    npcReputationFromFame: { leagueShare: 1.0, worldShare: 0.6 },
    /** Forme : note moyenne de repli quand aucun match n'est joué, contribution de la jauge form (-5..+5). */
    formFallback: { neutralRating: 6.3, perFormPoint: 0.1, minMatches: 3 },
    /** Jours par mois pour convertir la durée de contrat restante. */
    daysPerMonth: 30.44,
    /** Valeur PNJ : mois de contrat restants supposés quand la date n'est pas fournie. */
    npcDefaultContractMonths: 24,
  },

  contracts: {
    /** Salaire brut mensuel (euros) par tranche de note globale, avant prestige. */
    wageByOverall: [
      { maxOverall: 54, wage: 4_000 }, { maxOverall: 59, wage: 10_000 }, { maxOverall: 64, wage: 22_000 },
      { maxOverall: 69, wage: 45_000 }, { maxOverall: 74, wage: 95_000 }, { maxOverall: 79, wage: 190_000 },
      { maxOverall: 84, wage: 380_000 }, { maxOverall: 89, wage: 700_000 }, { maxOverall: 99, wage: 1_200_000 },
    ] as readonly { maxOverall: number; wage: number }[],
    /** Multiplicateur de prestige du club : base + slope × prestige/100. */
    prestigeMultiplier: { base: 0.6, slope: 0.8 },
    /** Jeunes sous-payés, trentenaires en légère décote. */
    ageMultiplier: [
      { maxAge: 19, factor: 0.55 }, { maxAge: 22, factor: 0.8 }, { maxAge: 30, factor: 1.0 }, { maxAge: 99, factor: 0.8 },
    ] as readonly { maxAge: number; factor: number }[],
    /** Durée par défaut (années) selon l'âge. */
    defaultYears: [
      { maxAge: 21, years: 3 }, { maxAge: 28, years: 4 }, { maxAge: 31, years: 2 }, { maxAge: 99, years: 1 },
    ] as readonly { maxAge: number; years: number }[],
    /** Primes en fraction du salaire mensuel. */
    bonuses: { perAppearance: 0.05, perGoal: 0.08, perAssist: 0.05, perTrophy: 1.0 },
    /** Clause libératoire par défaut = valeur × multiplicateur. */
    releaseClauseMultiplier: 2.5,
    /** Salaire minimal mensuel. */
    minWage: 2_500,
    /** Prolongation proposée quand il reste moins de N mois. */
    renewalFromMonthsLeft: 12,
    // ── ajouts module player (createPlayer / marketValue) ──
    /** Arrondi du salaire suggéré (euros). */
    wageRounding: 500,
    /** Prestige de la ligue sur le salaire : base + slope × prestige/100. */
    leaguePrestigeMultiplier: { base: 0.65, slope: 0.5 },
    /** Rôle promis au premier contrat selon le niveau de départ (§6.5 : un concurrent est devant). */
    initialRoleByLevel: { espoir: 'projet', prometteur: 'projet', pepite: 'rotation' } as Record<StartingLevel, PromisedRole>,
  },
} as const;
