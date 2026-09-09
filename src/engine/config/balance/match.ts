/**
 * Section « match » de BALANCE : plafonds §6.3, probabilités de base,
 * résolution, note en direct, cibles §6.5, simulation de fond, situations,
 * adaptation adverse (§6.4) et traversées du désert (§6.6).
 * Composée dans ../balance.ts. Ajouts par Edit ciblé, jamais de suppression.
 */
import type { Position, ShotZone } from '../../types';

export const MATCH_BALANCE = {
  /** Plafonds absolus de probabilité (§6.3). Aucune entrée > 0.93, aucun mode ne les dépasse. */
  caps: {
    // Tirs
    butVideDeuxMetres: 0.93,
    penalty: 0.78,
    faceAFace: 0.38,
    repriseSurface: 0.26,
    frappePremiereIntention: 0.3,
    teteSurCentre: 0.17,
    frappeHorsSurface: 0.08,
    lob: 0.22,
    coupFrancDirect: 0.09,
    contreAttaqueFinition: 0.34,
    // Dribbles
    dribbleHautNiveau: 0.42,
    dribbleStandard: 0.62,
    dribbleGardien: 0.36,
    crochet: 0.55,
    // Passes et centres
    passeCourte: 0.93,
    passeProfondeur: 0.55,
    passeLongue: 0.72,
    uneDeux: 0.6,
    remise: 0.88,
    centre: 0.45,
    centreEnRetrait: 0.5,
    conserverBallon: 0.85,
    appelReussi: 0.6,
    // Coups de pied arrêtés (occasion créée)
    cornerOccasion: 0.25,
    coupFrancCentre: 0.3,
    // Défense
    tacle: 0.7,
    interception: 0.6,
    pressing: 0.55,
    duelDefensif: 0.72,
    duelAerien: 0.65,
    couverture: 0.8,
    bloquer: 0.5,
    degagement: 0.9,
    relanceCourte: 0.9,
    relanceLongue: 0.75,
    fauteTactiqueSansCarton: 0.6,
    // Gardien
    gbArretFaceAFace: 0.62,
    gbArretPenalty: 0.22,
    gbArretFrappe: 0.85,
    gbSortieAerienne: 0.8,
    gbRelanceCourte: 0.92,
    gbDegagementLong: 0.75,
    // Comportement
    simulerSansSanction: 0.35,
    protesterSansCarton: 0.7,
    provoquerSansCarton: 0.6,
  },

  /** Les attributs déplacent la base de ±35 % au maximum (§6.3). */
  attributeInfluence: 0.35,

  /** xG / probabilité de base par situation-action, avant modificateurs et plafond. */
  /**
   * Bases avant modificateurs. Mesuré : la chaîne multiplicative (distance,
   * densité, attributs, fatigue, pression, confiance, adversaire, difficulté)
   * ramenait la médiane réelle au tiers du plafond autorisé — une occasion dans
   * la surface se concluait à 9 % pour un plafond de 26 %, une tête à 6 % pour
   * 17 %. Le joueur construisait l'action, parlait, et n'avait aucune chance.
   * Les bases de finition sont remontées pour qu'une VRAIE occasion approche son
   * plafond ; les plafonds du §6, eux, ne bougent pas, et une frappe désespérée
   * de loin reste mauvaise (frappeHorsSurface inchangée).
   */
  baseProbability: {
    butVideDeuxMetres: 0.85,
    penalty: 0.76,
    faceAFace: 0.34,
    repriseSurface: 0.21,
    frappePremiereIntention: 0.21,
    teteSurCentre: 0.135,
    frappeHorsSurface: 0.04,
    lob: 0.15,
    coupFrancDirect: 0.06,
    contreAttaqueFinition: 0.27,
    dribbleHautNiveau: 0.3,
    dribbleStandard: 0.48,
    /** §6.1 : « J'élimine le gardien tranquillement » → base 0.31. */
    dribbleGardien: 0.31,
    crochet: 0.45,
    passeCourte: 0.86,
    passeProfondeur: 0.36,
    passeLongue: 0.58,
    uneDeux: 0.42,
    remise: 0.78,
    centre: 0.3,
    centreEnRetrait: 0.36,
    conserverBallon: 0.7,
    appelReussi: 0.4,
    cornerOccasion: 0.14,
    coupFrancCentre: 0.18,
    tacle: 0.52,
    interception: 0.42,
    pressing: 0.36,
    duelDefensif: 0.55,
    duelAerien: 0.5,
    couverture: 0.65,
    bloquer: 0.35,
    degagement: 0.8,
    relanceCourte: 0.8,
    relanceLongue: 0.58,
    fauteTactiqueSansCarton: 0.45,
    gbArretFaceAFace: 0.5,
    gbArretPenalty: 0.17,
    gbArretFrappe: 0.7,
    gbSortieAerienne: 0.62,
    gbRelanceCourte: 0.84,
    gbDegagementLong: 0.6,
    simulerSansSanction: 0.25,
    protesterSansCarton: 0.55,
    provoquerSansCarton: 0.45,
  },

  /** Multiplicateur de probabilité par zone visée (§6.1 : lucarne ×0.45). */
  shotZoneRisk: {
    lucarne_gauche: 0.45, lucarne_droite: 0.45, ras_de_terre_premier_poteau: 0.95,
    ras_de_terre_deuxieme_poteau: 1.0, mi_hauteur: 0.85, entre_les_jambes: 0.7,
    au_dessus_du_gardien: 0.6, defaut: 1.0,
  } as Record<ShotZone, number>,
  /** Récompense d'un but selon la zone : bonus de note et de réputation (supporters, médias). */
  shotZoneReward: {
    lucarne_gauche: { rating: 0.3, reputation: 2 }, lucarne_droite: { rating: 0.3, reputation: 2 },
    ras_de_terre_premier_poteau: { rating: 0, reputation: 0 }, ras_de_terre_deuxieme_poteau: { rating: 0, reputation: 0 },
    mi_hauteur: { rating: 0, reputation: 0 }, entre_les_jambes: { rating: 0.15, reputation: 1 },
    au_dessus_du_gardien: { rating: 0.2, reputation: 1 }, defaut: { rating: 0, reputation: 0 },
  } as Record<ShotZone, { rating: number; reputation: number }>,
  /** Risque déclaré (0-1) : au-dessus du neutre, la probabilité baisse et la récompense monte. */
  risk: { neutral: 0.5, probabilityPenaltyPerPoint: 0.6, ratingRewardPerPoint: 0.4, minMultiplier: 0.55 },
  /** Modificateurs multiplicatifs génériques de résolution. */
  resolution: {
    /** Forme -5..+5 → ±10 %. */
    formPerPoint: 0.02,
    /** Pression 0-1 × (1 − résistancePression/100) → jusqu'à −25 %. */
    pressureMaxMalus: 0.25,
    /** Qualité du gardien / défenseur adverse : ±20 % autour de 70 (titulaire type de Ligue 1). */
    opponentQuality: { reference: 70, perPoint: 0.008, min: 0.7, max: 1.25 },
    /** Angle et densité défensive. */
    angleMinMultiplier: 0.5,
    densityMaxMalus: 0.35,
    /** Part du malus de densité subie par les passes, remises et relances. */
    densityPassShare: 0.5,
    /** Confiance 0-100 : ±8 % autour de 60. */
    confidencePerPoint: 0.002,
    /** Distance : au-delà de 20 m, −4 % par mètre sur les frappes. */
    distance: { freeMeters: 20, malusPerMeter: 0.04, min: 0.2 },
    /** Enchaînement : un dribble réussi ouvre une frappe avec ce bonus de probabilité. */
    followUpBonus: 1.1,
    /** Action « impossible » (tir depuis son camp…) : probabilité résiduelle. */
    impossibleActionProb: 0.002,
    /** Nombre de duels enchaînés quand le joueur veut « dribbler tout le monde » (§6.1). */
    multiDribbleFromRisk: { threshold: 0.85, defenders: 3 },
    // ── match/resolve : ajouts du moteur de match ──
    /** Score d'attributs pondéré : référence et étendue pour atteindre ±attributeInfluence. */
    attribute: { reference: 60, span: 40 },
    /** Fatigue : fitness effectif = fitness × (1 − poids × fatigue de match/100) ; malus max à fitness 0. */
    fatigue: { maxMalus: 0.3, matchFatigueWeight: 0.5 },
    /** Plancher absolu : aucune action n'a une probabilité nulle. */
    minProbability: 0.001,
    /** Une frappe tentée au-delà de cette distance est « impossible » (probabilité résiduelle). */
    absurdShotFromMeters: 45,
    /** Limite de la surface de réparation (mètres) : un tir en deçà est une reprise dans la surface. */
    boxMeters: 16.5,
    /** Un défenseur direct de cette note ou plus impose le plafond « dribble haut niveau ». */
    highLevelDefenderFrom: 78,
    /** Conversion du coéquipier servi selon la nature de la passe (avant gardien adverse). */
    /**
     * Conversion du coéquipier servi. Elle était SUPÉRIEURE à celle du joueur
     * incarné en face-à-face (0.34 contre une base de 0.30) : servir valait mieux
     * que conclure soi-même. Elle reste en dessous de la base du joueur, qui est
     * censé être le finisseur de l'histoire.
     */
    teammateConversion: { faceAFace: 0.27, centre: 0.16, profondeur: 0.3, passeCourte: 0.14, centreEnRetrait: 0.24, remise: 0.11, fixation: 0.1 },
    /**
     * Qualité d'occasion pour laquelle « occasion créée » vaut son delta plein.
     * Au-dessous, la passe rapporte moins ; au-dessus, davantage. Sans cette
     * proportionnalité, servir un coéquipier qui rate payait autant que le servir
     * pour un but, et davantage qu'un tir cadré : le jeu apprenait à ne pas tirer.
     */
    occasionCreeeReference: 0.3,
    /** Style de penalty : multiplicateur (le panenka est un vrai pari). */
    penaltyStyle: { placer: 1.0, puissance: 0.96, panenka: 0.7 },
    /** Gardien sur penalty : le tireur choisit un côté caché ; bon côté ×, mauvais côté ×. */
    gkPenaltySide: { rightGuess: 1.6, wrongGuess: 0.3, centreShare: 0.12 },
    /** Répartition d'un tir raté : cadré (arrêt), non cadré, poteau, contré (somme 1). */
    shotMiss: { arret: 0.4, horsCadre: 0.45, poteau: 0.04, contre: 0.11 },
    /** Penalty raté : arrêt ou non cadré. */
    penaltyMiss: { arret: 0.6 },
    /** Dribble raté : faute subie (→ penalty dans la surface) ou ballon perdu. */
    dribbleFailure: { fouled: 0.18, lost: 0.35 },
    /** Conservation ratée : faute subie. */
    holdFailure: { fouled: 0.25 },
    /** Appel raté : hors-jeu. */
    runFailure: { offside: 0.35 },
    /** Duel défensif perdu : faute commise, puis carton (dernier défenseur → rouge). */
    defensiveFailure: { foul: 0.3, yellowOnFoul: 0.28, redOnFoul: 0.02, redIfLastMan: 0.5, opponentChance: 0.55 },
    /** Faute tactique ratée : carton rouge si dernier défenseur (sinon jaune). */
    tacticalFoul: { redIfLastMan: 0.45 },
    /** Ballon perdu en zone offensive : contre adverse. */
    counterOnLostBall: 0.08,
    /** Relance ratée : occasion adverse. */
    buildUpFailureChance: 0.5,
    /** Sortie de gardien ratée / relance ratée : occasion adverse. */
    gkFailureChance: 0.6,
    /** Occasion adverse concédée après une erreur du joueur : xG selon la zone. */
    concededChanceXg: { proche: 0.28, milieu: 0.12 },
    /** Profondeur maximale d'enchaînement (dribble → frappe → …). */
    followUpMaxDepth: 2,
    /** Le joueur tire le penalty si son attribut est au moins celui du meilleur coéquipier moins cette marge. */
    penaltyTakerMargin: 5,
    /** Pressing réussi par un attaquant : ouvre une occasion. */
    pressingFollowUpProb: 0.45,
    /** Récompense de note pour un tir cadré très dangereux (xG ≥ seuil) manqué : occasion manquée. */
    bigChanceXg: 0.3,
  },

  rating: {
    base: 6.0,
    min: 3.0,
    max: 10.0,
    /** Deltas par événement (note en direct §5.5). */
    delta: {
      but: 1.0,
      butDecisif: 0.3,
      passe_decisive: 0.7,
      tir_cadre: 0.15,
      tir_non_cadre: -0.05,
      poteau: 0.1,
      occasion_creee: 0.25,
      occasion_manquee: -0.25,
      dribble_reussi: 0.15,
      dribble_rate: -0.1,
      duel_gagne: 0.1,
      duel_perdu: -0.1,
      ballon_perdu: -0.15,
      ballon_conserve: 0.05,
      passe_reussie: 0.03,
      passe_ratee: -0.08,
      faute_commise: -0.1,
      faute_subie: 0.05,
      carton_jaune: -0.3,
      carton_rouge: -1.5,
      pressing_reussi: 0.2,
      pressing_rate: -0.05,
      tacle_reussi: 0.15,
      interception: 0.15,
      degagement: 0.05,
      hors_jeu: -0.05,
      penalty_obtenu: 0.3,
      penalty_rate: -0.8,
      simulation_sanctionnee: -0.3,
      protestation_jaune: -0.3,
      gb_arret: 0.25,
      gb_arret_decisif: 0.5,
      gb_but_encaisse: -0.2,
      gb_sortie_reussie: 0.15,
      gb_sortie_ratee: -0.4,
      gb_penalty_arrete: 1.0,
      cleanSheetDefender: 0.4,
      cleanSheetGoalkeeper: 0.6,
      butEncaisseDefenseur: -0.1,
      victoire: 0.2,
      defaite: -0.2,
    },
    /** Dérive passive par minute jouée sans implication, selon le momentum de l'équipe (±). */
    passiveDriftPerMinute: 0.004,
    /** Pénalité méta : à partir de N tentatives dans le match (§6.2). */
    metaPenalty: { fromAttempts: 3, delta: -0.2 },
    /** Les grands matchs amplifient les deltas. */
    importanceMultiplier: { atZero: 0.9, atHundred: 1.2 },
    /** Arrondi de la note (dixième). */
    roundTo: 0.1,
    /** Homme du match (§6.5 : rare). */
    motm: { minRating: 8.0, decisiveMinRating: 7.6, baseProb: 0.5 },
    /** Tableau §5.6 : sensibilité de chaque regard à la note (1 = suit la note). */
    evaluation: { coachResultWeight: 0.3, supportersSpectacleWeight: 0.4, mediaSeverityShift: { moderee: 0, forte: -0.3, brutale: -0.6 } },
    // ── match/rating : ajouts du moteur de match ──
    /** Homme du match : bonus par point au-dessus du seuil, malus si l'équipe a perdu, note simulée du meilleur coéquipier. */
    motmExtra: { perRatingPointOverMin: 0.25, lostMultiplier: 0.4, teammateBestMean: 7.1, teammateBestSd: 0.45, maxProb: 0.9 },
    /** Tableau §5.6 : bonus et malus additionnels par regard. */
    evaluationExtra: {
      /** Coach : résultat (victoire +, défaite −), cartons, discipline tactique (fautes), sévérité de la personnalité. */
      coach: { win: 0.3, loss: -0.4, cardMalus: 0.5, severityPerPoint: 0.006 },
      /** Supporters : buts, dribbles, but en lucarne, défaite à domicile, ferveur. */
      supporters: { goal: 0.5, dribble: 0.08, homeLossMalus: 0.5, fanbasePerPoint: 0.004 },
      /** Coéquipiers : passes décisives, duels, égoïsme (tirs sans passe), cartons. */
      teammates: { assist: 0.4, duelWon: 0.05, selfishShotsFrom: 5, selfishMalus: 0.3, cardMalus: 0.4 },
      /** Médias : décisif, sortie prématurée, jeune (comparaison). */
      media: { decisive: 0.4, subOffEarlyMalus: 0.4 },
    },
    /** Note passive quand le joueur est sur le terrain sans être impliqué : bornes du cumul par match. */
    passiveDriftMax: 0.3,
    /** Pénalité de note si le joueur reste très peu impliqué (moins de N décisions sur 90 min). */
    lowInvolvement: { decisionsBelow: 4, malus: -0.2 },
    /** Un but qui change l'état du score (égalisation, prise d'avantage) est « décisif » après cette minute. */
    decisiveGoalFromMinute: 60,
  },

  /** Cibles de distribution sur une saison (§6.5), vérifiées par les tests. */
  seasonTargets: {
    medianRating: 6.3,
    medianRatingRange: [6.1, 6.5] as readonly [number, number],
    share75plus: 0.1,
    share75plusRange: [0.06, 0.15] as readonly [number, number],
    /** Un 9+ : 2 ou 3 par saison au sommet de la carrière. */
    nineplusPerSeasonTop: [2, 3] as readonly [number, number],
    youngStrikerGoals: [4, 9] as readonly [number, number],
    goalsPerMatchTop: 0.55,
    motmPerSeasonTop: 6,
    leagueGoalsPerMatch: [2.3, 3.3] as readonly [number, number],
    championPoints: [70, 95] as readonly [number, number],
    lastPoints: [15, 40] as readonly [number, number],
    topScorerGoals: [14, 30] as readonly [number, number],
  },

  matchSim: {
    /** Ligue 1 ≈ 2,7 buts par match, soit ~1,35 par équipe. */
    goalsPerTeam: 1.35,
    /** ~12 tirs par équipe et par match. */
    shotsPerTeam: 12,
    /** xG total ≈ 2,6 : xG moyen par tir ≈ 0,108. */
    xgPerShot: 0.108,
    /** Occasions par minute et par équipe (≈ 10 / 90 ; les situations du joueur incarné s'ajoutent). */
    chancesPerMinutePerTeam: 0.11,
    /** Avantage domicile ≈ +0,2 but : bonus multiplicatif sur la création d'occasions. */
    homeAdvantage: { chanceMultiplier: 1.08, strengthBonus: 2 },
    /** Poids des lignes dans la force d'équipe (somme 1). */
    strengthWeights: { attack: 0.35, midfield: 0.28, defense: 0.25, goalkeeper: 0.12 },
    /** Influence du coach (ability 0-100) : ±5 % autour de 50. */
    coachInfluence: 0.1,
    /** Sensibilité de la répartition des occasions à l'écart de force : ratio^exposant (2.0 : le champion finit vers 72-78 points). */
    strengthExponent: 2.0,
    /** Répartition de la qualité des occasions (xG) : poids relatifs par type. */
    chanceTypes: [
      { kind: 'frappe_lointaine', weight: 32, xg: 0.04 },
      { kind: 'reprise_surface', weight: 30, xg: 0.11 },
      { kind: 'tete', weight: 14, xg: 0.09 },
      { kind: 'face_a_face', weight: 8, xg: 0.3 },
      { kind: 'contre', weight: 8, xg: 0.2 },
      { kind: 'coup_franc', weight: 5, xg: 0.06 },
      { kind: 'but_vide', weight: 1, xg: 0.8 },
      { kind: 'penalty', weight: 1, xg: 0.76 },
    ] as readonly { kind: string; weight: number; xg: number }[],
    /** Qualité du gardien : ±12 % sur la conversion autour de 65. */
    goalkeeperEffect: { reference: 65, perPoint: 0.006, min: 0.75, max: 1.25 },
    /** Effet du score : l'équipe menée pousse, celle qui mène gère (après cette minute). */
    scoreEffect: { fromMinute: 60, trailingMultiplier: 1.12, leadingMultiplier: 0.9 },
    /** Momentum : influence ±15 % sur la création d'occasions, retour vers 0 chaque minute. */
    momentum: { chanceInfluence: 0.15, decayPerMinute: 0.05, goalShift: 0.35, chanceShift: 0.08 },
    /** Fatigue PNJ par minute (0-100) et malus de force quand l'équipe est fatiguée. */
    fatigue: { perMinute: 0.5, pressingExtra: 0.25, strengthMalusAtFull: 0.12, fromMinute: 60 },
    /** Discipline par équipe et par match (≈ 3,5 jaunes par match, un rouge tous les 8 matchs). */
    discipline: { foulsPerTeam: 12, yellowsPerTeam: 1.75, redsPerTeam: 0.0625, penaltiesPerMatch: 0.28, cornersPerTeam: 5 },
    /** Remplacements : nombre max et minutes typiques. */
    substitutions: { max: 5, windows: 3, typicalMinutes: [58, 66, 74, 82, 88] as readonly number[], fromMinute: 45 },
    /** Temps additionnel [min, max] par mi-temps. */
    addedTime: { firstHalf: [1, 3] as readonly [number, number], secondHalf: [3, 7] as readonly [number, number] },
    /** Prolongation et tirs au but (coupes). */
    extraTime: { minutes: 30, chanceMultiplier: 0.85, penaltyShootoutConversion: 0.75 },
    /** Possession : part de l'équipe la plus forte au milieu, bornée. */
    possession: { midfieldWeight: 0.6, min: 0.3, max: 0.7 },
    /** Affluence : fraction de la capacité selon l'enjeu et la ferveur. */
    attendance: { base: 0.7, importanceWeight: 0.2, fanbaseWeight: 0.1 },
    /** Enjeu 0-100 d'un match : composantes. */
    importance: { base: 30, derby: 35, topSixClash: 15, relegationClash: 15, cupFinal: 50, cupSemi: 30, lateSeasonBoost: 10 },
    // ── match/teamStrength + simulateMinute : ajouts du moteur de match ──
    teamStrength: {
      /** Forme −5..+5 d'un joueur : ±5 % sur sa note effective. */
      formPerPoint: 0.01,
      /** Fitness 0-100 : jusqu'à −25 % sur la note effective à 0. */
      fitnessInfluence: 0.25,
      /** Joueur hors poste : malus = outOfPositionMalus × (1 − compatibilité). */
      outOfPositionScale: 1.0,
      /** Mentalité : points d'attaque gagnés (et de défense perdus) par cran. */
      mentalityShiftPoints: { tres_defensive: -2, defensive: -1, equilibree: 0, offensive: 1, tres_offensive: 2 },
      /** Le milieu offensif compte pour moitié dans l'attaque. */
      mocAttackShare: 0.5,
      /** Équipe réduite : malus multiplicatif par joueur manquant. */
      missingPlayerMalus: 0.9,
      /** Pressing effectif = tactique × (base + part × milieu/99). */
      pressingFromMidfield: { base: 0.7, share: 0.3 },
      /** Note de repli d'une ligne vide. */
      emptyLineStrength: 40,
    },
    /** Attaque effective = a × attaque + b × milieu ; défense effective = c × défense + d × milieu + e × gardien. */
    lineMix: { attackFromAttack: 0.6, attackFromMidfield: 0.4, defenseFromDefense: 0.6, defenseFromMidfield: 0.25, defenseFromGoalkeeper: 0.15 },
    /** Poids de choix du tireur d'une occasion d'équipe par poste (attributs de finition ensuite). */
    scorerWeights: { GB: 0, DC: 0.5, DD: 0.4, DG: 0.4, MDC: 0.6, MC: 1.2, MOC: 2.6, AIG: 3.2, AID: 3.2, BU: 5.5 } as Record<Position, number>,
    /** Poids du passeur décisif par poste. */
    assistWeights: { GB: 0.05, DC: 0.4, DD: 1.2, DG: 1.2, MDC: 0.9, MC: 1.8, MOC: 3.0, AIG: 2.8, AID: 2.8, BU: 1.4 } as Record<Position, number>,
    /** Poids de l'auteur d'une faute par poste. */
    foulWeights: { GB: 0.1, DC: 2.2, DD: 1.6, DG: 1.6, MDC: 2.4, MC: 1.6, MOC: 0.9, AIG: 0.8, AID: 0.8, BU: 1.0 } as Record<Position, number>,
    /** Finition du tireur PNJ : ±20 % autour de 62 (moyenne finition / tête / sang-froid). */
    finisherEffect: { reference: 62, perPoint: 0.007, min: 0.75, max: 1.25 },
    /** Un tir non converti : part cadrée (arrêt), poteau, le reste hors cadre ou contré. */
    shotOutcome: { onTargetShare: 0.38, postShare: 0.035 },
    /** Corners : part des occasions de type « tête » précédées d'un corner. */
    cornerBeforeHeaderShare: 0.6,
    /** Fatigue : influence de l'endurance (malus à endurance faible) et fatigue à l'entrée d'un remplaçant. */
    fatigueExtra: { enduranceInfluence: 0.6, enduranceReference: 70, substituteStart: 0 },
    /** Statistiques passives par minute sur le terrain, par poste (ballons touchés, passes, km, sprints). */
    passiveStats: {
      touchesPerMinute: { GB: 0.35, DC: 0.7, DD: 0.75, DG: 0.75, MDC: 0.8, MC: 0.85, MOC: 0.7, AIG: 0.6, AID: 0.6, BU: 0.45 } as Record<Position, number>,
      passesPerMinute: { GB: 0.28, DC: 0.6, DD: 0.55, DG: 0.55, MDC: 0.65, MC: 0.7, MOC: 0.5, AIG: 0.38, AID: 0.38, BU: 0.25 } as Record<Position, number>,
      passAccuracy: { GB: 0.8, DC: 0.9, DD: 0.84, DG: 0.84, MDC: 0.9, MC: 0.88, MOC: 0.82, AIG: 0.78, AID: 0.78, BU: 0.74 } as Record<Position, number>,
      distanceKmPerMinute: { GB: 0.05, DC: 0.105, DD: 0.12, DG: 0.12, MDC: 0.125, MC: 0.13, MOC: 0.12, AIG: 0.115, AID: 0.115, BU: 0.11 } as Record<Position, number>,
      sprintsPerMinute: { GB: 0.02, DC: 0.2, DD: 0.35, DG: 0.35, MDC: 0.25, MC: 0.3, MOC: 0.35, AIG: 0.45, AID: 0.45, BU: 0.4 } as Record<Position, number>,
    },
    /** Ambiance : consignes du banc, clameurs, sifflets (minutes et probabilités). */
    atmosphere: { coachInstructionMinutes: [25, 70] as readonly number[], whistlesFromMinute: 70, whistlesProb: 0.03, roarOnHomeGoal: true },
    /** Remplacements : nombre par équipe, fenêtre, jitter, probabilité qu'un remplaçant incarné entre en jeu. */
    substitutionExtra: { perTeam: [3, 5] as readonly [number, number], window: [55, 85] as readonly [number, number], jitterMinutes: 3, playerFromBenchProb: 0.65, fatigueWeight: 1.0, overallWeight: 0.6 },
    /** Blessure PNJ : fraction qui impose un remplacement immédiat. */
    npcInjuryForcesSub: 0.85,
    /** Blessure PNJ en match : probabilité par minute et par équipe (≈ 0,35 blessure par match). */
    npcInjuryPerMinutePerTeam: 0.002,
    /** Remplacements : probabilité qu'une fenêtre typique soit utilisée (≈ 4 changements sur 5 fenêtres). */
    substitutionWindowProb: 0.8,
    /** Part des buts d'équipe avec un passeur décisif identifié. */
    assistShare: 0.72,
  },

  situations: {
    /** Points de décision par match [min, max] pour un titulaire (§5.2 : 8-16). */
    perMatchByPosition: {
      GB: [8, 12], DC: [9, 14], DD: [9, 14], DG: [9, 14], MDC: [10, 15],
      MC: [10, 16], MOC: [10, 16], AIG: [9, 15], AID: [9, 15], BU: [8, 14],
    } as Record<Position, readonly [number, number]>,
    /** Remplaçant entré à la 60e : ~4-7 situations (proportionnel aux minutes restantes, plancher). */
    substitute: { referenceMinutesRemaining: 30, range: [4, 7] as readonly [number, number], perMinuteFloor: 0.1 },
    /** Espacement minimal entre deux situations (minutes). */
    minGapMinutes: 3,
    /** Implication : forme et momentum modulent la fréquence (±20 %). */
    involvement: { formInfluence: 0.04, momentumInfluence: 0.2, lateMatchBoost: 1.15, lateFromMinute: 75 },
    /** Part des situations tirées du mix du poste (le reste vient des occasions de l'équipe). */
    fromPositionMixShare: 0.65,
    /** Probabilité qu'une occasion de l'équipe implique le joueur, par poste (attaquant souvent, gardien jamais). */
    teamChanceInvolvement: {
      GB: 0, DC: 0.08, DD: 0.15, DG: 0.15, MDC: 0.2, MC: 0.3, MOC: 0.45, AIG: 0.45, AID: 0.45, BU: 0.55,
    } as Record<Position, number>,
    /** Qualité du défenseur/gardien direct : moyenne de la ligne adverse ± bruit. */
    opponentQualityNoiseSd: 4,
    /** Timer de décision de repli si la difficulté n'en fixe pas. */
    defaultTimerSeconds: 10,
    /**
     * Chrono en mode vocal. Le moteur ne connaît que le chrono nu
     * (`situation.timerSeconds`) : jouer à la voix est une affaire d'interface,
     * et c'est le store qui applique ce multiplicateur et ce plancher.
     * Parler coûte bien plus de temps qu'écrire : écouter la fin de l'annonce,
     * formuler une phrase à l'oral, puis attendre la détection de fin de phrase
     * (1,2 s de silence). Sans cette marge, une action sur deux se résolvait
     * toute seule avant que le joueur ait fini de parler.
     */
    voiceTimerMultiplier: 2,
    voiceTimerMinimumSeconds: 20,
    /** Le chrono expire pendant que le joueur parle : on repousse l'échéance d'autant plutôt que de le couper. */
    voiceGraceSeconds: 6,
    /** Reprise d'une situation dont le chrono était écoulé : le temps de réagir, adapté comme le chrono normal. */
    graceOnResumeSeconds: 8,
    /** « Le joueur parle » = le micro a entendu quelque chose dans ces dernières secondes (sinon c'est une transcription qui traîne). */
    voiceRecentSpeechSeconds: 3,
    /** Plafond de prolongations par situation : au-delà, le chrono ne voudrait plus rien dire. */
    voiceGraceMaxExtensions: 2,
    /** Filet de sécurité : si le TTS ne signale jamais la fin de la lecture, le chrono s'arme quand même après ce délai. */
    voiceReadingWatchdogSeconds: 25,
    /** Coéquipiers proches proposés comme cibles de passe. */
    nearbyTeammates: 3,
    // ── match/situations : ajouts du moteur de match ──
    /** Probabilité qu'une occasion ADVERSE soit offerte au joueur comme situation défensive, par poste. */
    defensiveInvolvement: {
      GB: 0.5, DC: 0.45, DD: 0.3, DG: 0.3, MDC: 0.3, MC: 0.15, MOC: 0.05, AIG: 0.05, AID: 0.05, BU: 0.03,
    } as Record<Position, number>,
    /** Cadence : la cible primaire est tirée dans [min, max − marge] pour laisser la place aux enchaînements. */
    primaryTargetMargin: 2,
    /** Probabilité maximale de situation sur une minute (lissage de la cadence). */
    maxPerMinuteProb: 0.6,
    /** Remplaçant : cible = tirage [range] × minutes restantes / référence, au moins ce plancher. */
    substituteMinTarget: 1,
    /** Géométrie par type de situation : distance [min, max] en mètres, angle [min, max], densité [min, max]. */
    geometry: {
      centre_a_venir: { distance: [6, 12], angle: [0.5, 1], density: [0.5, 0.9] },
      occasion_surface: { distance: [7, 16], angle: [0.45, 1], density: [0.3, 0.8] },
      face_a_face: { distance: [8, 18], angle: [0.7, 1], density: [0.05, 0.3] },
      un_contre_un: { distance: [20, 35], angle: [0.3, 0.8], density: [0.2, 0.6] },
      contre_attaque: { distance: [25, 45], angle: [0.5, 1], density: [0.1, 0.4] },
      reception_dos_au_but: { distance: [16, 28], angle: [0.2, 0.7], density: [0.5, 0.9] },
      frappe_lointaine_possible: { distance: [21, 32], angle: [0.6, 1], density: [0.3, 0.6] },
      penalty: { distance: [11, 11], angle: [1, 1], density: [0, 0] },
      coup_franc_direct: { distance: [18, 28], angle: [0.5, 1], density: [0.6, 0.9] },
      coup_franc_indirect: { distance: [28, 40], angle: [0.3, 0.9], density: [0.6, 0.9] },
      corner_offensif: { distance: [6, 12], angle: [0.3, 0.8], density: [0.7, 1] },
      derniere_passe: { distance: [18, 30], angle: [0.4, 1], density: [0.4, 0.8] },
      appel_a_faire: { distance: [25, 40], angle: [0.4, 1], density: [0.3, 0.7] },
      duel_defensif: { distance: [12, 35], angle: [0.3, 1], density: [0.2, 0.7] },
      couverture: { distance: [15, 30], angle: [0.3, 1], density: [0.2, 0.6] },
      pressing_declenche: { distance: [35, 60], angle: [0.2, 0.8], density: [0.2, 0.6] },
      corner_defensif: { distance: [5, 12], angle: [0.3, 0.8], density: [0.7, 1] },
      relance_sous_pression: { distance: [60, 80], angle: [0.2, 0.8], density: [0.4, 0.9] },
      contre_adverse: { distance: [20, 40], angle: [0.4, 1], density: [0.1, 0.4] },
      faute_tactique_possible: { distance: [25, 45], angle: [0.4, 1], density: [0.1, 0.4] },
      gardien_face_a_face: { distance: [6, 14], angle: [0.6, 1], density: [0, 0.2] },
      gardien_sortie_aerienne: { distance: [4, 9], angle: [0.3, 0.9], density: [0.6, 1] },
      gardien_relance: { distance: [90, 95], angle: [0.5, 1], density: [0.3, 0.8] },
      gardien_penalty: { distance: [11, 11], angle: [1, 1], density: [0, 0] },
      provocation_adverse: { distance: [30, 60], angle: [0, 0], density: [0, 0] },
      coequipier_en_difficulte: { distance: [30, 60], angle: [0, 0], density: [0, 0] },
      consigne_du_banc: { distance: [30, 60], angle: [0, 0], density: [0, 0] },
      tension_fin_de_match: { distance: [30, 60], angle: [0, 0], density: [0, 0] },
      blessure_ressentie: { distance: [30, 60], angle: [0, 0], density: [0, 0] },
    } as Record<string, { distance: readonly [number, number]; angle: readonly [number, number]; density: readonly [number, number] }>,
    /** Part d'une situation « aérienne » (duel de la tête) dans les duels défensifs et corners. */
    aerialShare: { duel_defensif: 0.3, corner_defensif: 0.85, couverture: 0.1 },
    /** Part des situations « dernier défenseur » dans les contres adverses et fautes tactiques. */
    lastManShare: 0.35,
    /** Hors ballon : la tension de fin de match n'apparaît qu'après cette minute et si l'écart est ≤ 1. */
    tensionFromMinute: 75,
    /** Blessure ressentie : probabilité de base (× difficulté, × fatigue) qu'elle remplace une situation hors ballon. */
    injuryFeelingProb: 0.02,
    /** Pression du moment 0-1 : poids de l'enjeu, de la minute, du score serré et de l'extérieur. */
    pressure: { importanceWeight: 0.4, lateFrom60: 0.12, lateFrom75: 0.25, closeScore: 0.2, openScore: 0.05, away: 0.1 },
    /** Temps additionnel moyen ajouté aux minutes restantes pour la cadence. */
    expectedAddedMinutes: 4,
  },

  adaptation: {
    /** Même action dans la même situation : −8 % cumulés par répétition (§6.4). */
    repetitionPenalty: 0.08,
    /** Décroissance de la mémoire du défenseur (minutes). */
    repetitionDecayMinutes: 20,
    /** Plancher du multiplicateur de répétition. */
    repetitionMinMultiplier: 0.6,
    /** Profil de scouting disponible après N matchs joués. */
    scoutingAfterMatches: 5,
    /** Malus de scouting : proportionnel à la fréquence de l'action favorite (max). */
    scoutingMaxMalus: 0.15,
    /** Marquage individuel : multiplicateur sur les actions avec ballon du joueur. */
    manMarkingMalus: 0.85,
    /** Doublage (deux défenseurs) : multiplicateur, déclenché en plus si la réputation dépasse largement le seuil. */
    doubledMalus: 0.78,
    doubledFromReputationOverThreshold: 15,
    /** Le marquage se décide à ces minutes (coup d'envoi, mi-temps, après un but du joueur). */
    decisionMinutes: [0, 45] as readonly number[],
    /** Probabilité de marquage quand le seuil de réputation est atteint. */
    manMarkingProbAtThreshold: 0.5,
    manMarkingProbPerReputationPoint: 0.02,
    /** Changer de registre (décrocher, remise, profondeur) réduit le malus de marquage. */
    counterMoveBonus: 1.12,
    /** Provocations adverses plus fréquentes quand la réputation monte. */
    provocationPerReputationPoint: 0.004,
    // ── match/adaptation : ajouts du moteur de match ──
    /** Actions qui « changent de registre » face à un marquage individuel (§6.4). */
    counterMoves: ['decrocher', 'remise', 'appel_profondeur', 'une_deux', 'rester_en_pivot', 'fixer_defenseur', 'passe_courte'] as readonly string[],
    /** Le marquage est réévalué aussi juste après un but du joueur. */
    reconsiderAfterPlayerGoal: true,
    /** Scouting : lissage exponentiel des fréquences d'action (part du nouveau match). */
    scoutingSmoothing: 0.35,
  },

  /** Choix automatique d'une action (mode auto, action par défaut, tests). */
  autoplay: {
    /** Risque par défaut tiré dans cette fourchette (jamais 0.9). */
    riskRange: [0.3, 0.5] as readonly [number, number],
    intensityRange: [0.5, 0.8] as readonly [number, number],
    /** Poids multiplié pour les actions favorites d'un archétype. */
    archetypeBoost: 2.2,
    /** La première action par défaut du poste pèse plus que les suivantes. */
    firstDefaultWeight: 2.0,
    /** Mené en fin de match : risque en plus et préférence pour la frappe. */
    trailingLate: { fromMinute: 75, riskBonus: 0.15, shotBoost: 1.5 },
    /** Mène en fin de match : préférence pour la conservation. */
    leadingLate: { fromMinute: 80, safeBoost: 1.6 },
    /** Probabilité de viser une zone ambitieuse (lucarne) sur une frappe. */
    ambitiousZoneProb: 0.1,
    /** Risque maximal produit par l'autoplay. */
    maxRisk: 0.65,
  },

  /** Traversées du désert (§6.6). */
  desert: {
    lengthMatches: [4, 8] as readonly [number, number],
    finishingMultiplier: 0.72,
    confidenceMalus: 12,
    /** Écart minimal entre deux déserts (matchs) et premier match possible. */
    minGapMatches: 6,
    earliestMatchIndex: 3,
    /** Coups du sort (poteau, VAR, hors-jeu limite) : probabilité par match du joueur. */
    badLuckPerMatch: 0.08,
  },
} as const;
