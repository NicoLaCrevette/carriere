/**
 * CARRIÈRE — modèle de données du moteur.
 *
 * Règles de ce fichier :
 *  - Tout est sérialisable en JSON : pas de Date, pas de Map, pas de classe.
 *    Les dates sont des chaînes ISO « YYYY-MM-DD », les montants en euros.
 *  - `CareerState` est la sauvegarde complète d'une carrière.
 *  - Le moteur (src/engine) est la seule source de vérité. Le LLM ne produit
 *    que des `ClassifiedAction`, des `CommunicationAnalysis` et des deltas
 *    bornés (`ReputationDeltas`, `RelationshipDelta`). Jamais un chiffre de jeu.
 *  - Aucune dépendance React ou navigateur ici.
 *
 * Convention de nommage : noms de types en anglais, littéraux d'énumération et
 * attributs en français (ils apparaissent tels quels dans l'UI et les prompts).
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. Primitifs et énumérations fermées
// ═══════════════════════════════════════════════════════════════════════════

export type Id = string;
/** Date calendaire « YYYY-MM-DD ». */
export type ISODate = string;
/** Graine 32 bits non signée. */
export type Seed = number;
/** Montant en euros. */
export type Euros = number;
/** Valeur bornée 0-100. */
export type Pct100 = number;
/** Probabilité 0-1. */
export type Prob = number;
/** Code pays ISO 3166-1 alpha-3, ex. « FRA ». */
export type CountryCode = string;

export const POSITIONS = ['GB', 'DC', 'DD', 'DG', 'MDC', 'MC', 'MOC', 'AIG', 'AID', 'BU'] as const;
export type Position = (typeof POSITIONS)[number];

export const FEET = ['droit', 'gauche', 'ambidextre'] as const;
export type Foot = (typeof FEET)[number];

export const ARCHETYPES = [
  // Offensifs
  'finisseur', 'profondeur', 'dribbleur', 'pivot', 'ailier_de_debordement', 'faux_neuf',
  // Milieux
  'box_to_box', 'regisseur', 'destructeur', 'sentinelle', 'createur',
  // Défenseurs
  'mur', 'relanceur', 'piston', 'libero',
  // Gardiens
  'gardien_ligne', 'gardien_libero',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const STARTING_LEVELS = ['espoir', 'prometteur', 'pepite'] as const;
export type StartingLevel = (typeof STARTING_LEVELS)[number];

export const DIFFICULTIES = ['realiste', 'exigeant', 'impitoyable'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const VOICE_MODES = ['vocal', 'mixte', 'silencieux'] as const;
export type VoiceMode = (typeof VOICE_MODES)[number];

// ═══════════════════════════════════════════════════════════════════════════
// 2. Attributs
// ═══════════════════════════════════════════════════════════════════════════

/** Chaque attribut vaut 1-99. */
export interface Attributes {
  // Technique
  finition: number;
  tirLointain: number;
  centres: number;
  passeCourte: number;
  passeLongue: number;
  dribble: number;
  controle: number;
  coupsFrancs: number;
  penalty: number;
  tete: number;
  // Physique
  vitesse: number;
  acceleration: number;
  endurance: number;
  force: number;
  detente: number;
  agilite: number;
  equilibre: number;
  // Mental
  placement: number;
  vision: number;
  sangFroid: number;
  agressivite: number;
  travailDefensif: number;
  leadership: number;
  determination: number;
  resistancePression: number;
  // Gardien — significatifs seulement pour un GB, bas (5-25) pour les autres.
  reflexes: number;
  plongeon: number;
  sortiesAeriennes: number;
  jeuAuPied: number;
  unContreUn: number;
}

export type AttributeKey = keyof Attributes;
export type AttributeGroup = 'technique' | 'physique' | 'mental' | 'gardien';

export const ATTRIBUTE_GROUPS: Record<AttributeGroup, readonly AttributeKey[]> = {
  technique: ['finition', 'tirLointain', 'centres', 'passeCourte', 'passeLongue', 'dribble', 'controle', 'coupsFrancs', 'penalty', 'tete'],
  physique: ['vitesse', 'acceleration', 'endurance', 'force', 'detente', 'agilite', 'equilibre'],
  mental: ['placement', 'vision', 'sangFroid', 'agressivite', 'travailDefensif', 'leadership', 'determination', 'resistancePression'],
  gardien: ['reflexes', 'plongeon', 'sortiesAeriennes', 'jeuAuPied', 'unContreUn'],
};

export const ATTRIBUTE_KEYS: readonly AttributeKey[] = [
  ...ATTRIBUTE_GROUPS.technique,
  ...ATTRIBUTE_GROUPS.physique,
  ...ATTRIBUTE_GROUPS.mental,
  ...ATTRIBUTE_GROUPS.gardien,
];

/** Points d'expérience accumulés vers le prochain point de chaque attribut (0-1). */
export type AttributeXp = Record<AttributeKey, number>;

// ═══════════════════════════════════════════════════════════════════════════
// 3. Identité, joueur incarné, joueurs PNJ
// ═══════════════════════════════════════════════════════════════════════════

export interface Identity {
  firstName: string;
  lastName: string;
  /** Surnom éventuel utilisé par le commentateur et les supporters. */
  nickname?: string;
  birthDate: ISODate;
  nationality: CountryCode;
  /** Double nationalité, choisie à la création ou révélée plus tard. */
  secondNationality?: CountryCode;
  position: Position;
  secondaryPositions: Position[];
  foot: Foot;
  heightCm: number;
  weightKg: number;
  /** 1 à 3 archétypes. Vide pour les PNJ non décrits. */
  archetypes: Archetype[];
}

export const PROMISED_ROLES = ['titulaire_indiscutable', 'titulaire', 'rotation', 'projet'] as const;
export type PromisedRole = (typeof PROMISED_ROLES)[number];

export interface Contract {
  clubId: Id;
  signedOn: ISODate;
  endsOn: ISODate;
  /** Salaire brut mensuel. */
  wageMonthly: Euros;
  /** Clause libératoire, absente si aucune. */
  releaseClause?: Euros;
  promisedRole: PromisedRole;
  bonuses: {
    perAppearance: Euros;
    perGoal: Euros;
    perAssist: Euros;
    perTrophy: Euros;
  };
  /** Prêt en cours : club propriétaire. */
  loanFromClubId?: Id;
  /** Prêt en cours : contrat d'origine au club propriétaire, restauré au retour de prêt. */
  loanOriginal?: Omit<Contract, 'loanOriginal'>;
}

export const INJURY_TYPES = [
  'contracture', 'ischios', 'entorse_cheville', 'entorse_genou', 'pubalgie',
  'fracture', 'commotion', 'croises', 'menisque', 'adducteurs', 'mollet', 'dos',
] as const;
export type InjuryType = (typeof INJURY_TYPES)[number];

export const INJURY_ORIGINS = ['match', 'entrainement', 'selection', 'hors_terrain'] as const;
export type InjuryOrigin = (typeof INJURY_ORIGINS)[number];

export interface Injury {
  id: Id;
  type: InjuryType;
  origin: InjuryOrigin;
  occurredOn: ISODate;
  /** Diagnostic communiqué par le staff (peut être optimiste). */
  announcedDays: number;
  /** Vraie durée, cachée, ajustée par la rééducation et les décisions. */
  actualDays: number;
  daysRemaining: number;
  /** Le joueur a choisi de jouer malgré la blessure au moins une fois. */
  playedThrough: boolean;
  /** Risque de rechute laissé après guérison (0-1). */
  recurrenceRisk: Prob;
  healedOn?: ISODate;
  /** Séquelles permanentes appliquées à la guérison, ex. { vitesse: -2 }. */
  permanentLoss?: Partial<Attributes>;
}

export interface Trait {
  id: Id;
  label: string;
  description: string;
  polarity: 'positif' | 'negatif' | 'neutre';
  acquiredOn: ISODate;
  /** Origine lisible : « Finale de coupe 2028, doublé sous pression ». */
  origin: string;
  /** Modificateurs multiplicatifs appliqués par le moteur, ex. { pression_grand_match: 1.08 }. */
  modifiers: Record<string, number>;
}

/** Statistiques brutes, cumulables (une compétition, une saison ou une carrière). */
export interface Stats {
  matches: number;
  starts: number;
  subOn: number;
  subOff: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  xG: number;
  xA: number;
  keyPasses: number;
  dribblesAttempted: number;
  dribblesCompleted: number;
  duelsWon: number;
  duelsTotal: number;
  aerialsWon: number;
  aerialsTotal: number;
  touches: number;
  passesAttempted: number;
  passesCompleted: number;
  tackles: number;
  interceptions: number;
  blocks: number;
  clearances: number;
  fouls: number;
  foulsSuffered: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
  penaltiesTaken: number;
  penaltiesScored: number;
  distanceKm: number;
  sprints: number;
  /** Somme et compte des notes, pour la moyenne. */
  ratingSum: number;
  ratingCount: number;
  motm: number;
  // Gardien
  saves: number;
  goalsConceded: number;
  cleanSheets: number;
  penaltiesSaved: number;
}

export interface SeasonStats {
  total: Stats;
  byCompetition: Record<Id, Stats>;
}

export const TROPHIES = [
  'championnat', 'coupe_nationale', 'coupe_ligue', 'supercoupe', 'ligue_des_champions',
  'ligue_europa', 'conference', 'coupe_du_monde', 'euro', 'copa_america', 'can', 'jeux_olympiques',
] as const;
export type TrophyKind = (typeof TROPHIES)[number];

export const AWARDS = [
  'ballon_d_or', 'joueur_de_la_saison', 'espoir_de_la_saison', 'meilleur_buteur',
  'meilleur_passeur', 'meilleur_gardien', 'equipe_type', 'joueur_du_mois', 'but_de_la_saison',
] as const;
export type AwardKind = (typeof AWARDS)[number];

export interface Award {
  kind: AwardKind;
  /** Lauréat (joueur incarné ou PNJ). Absent dans les récompenses stockées sur `Player` (implicite). */
  playerId?: Id;
  competitionId?: Id;
  /** Classement pour les récompenses ordonnées (Ballon d'Or : 1-30). */
  rank?: number;
  date: ISODate;
}

/** Bilan figé d'une saison passée du joueur incarné. */
export interface SeasonRecord {
  seasonId: Id;
  label: string;
  clubId: Id;
  /** Club de prêt éventuel. */
  loanClubId?: Id;
  leagueId: Id;
  leagueRank: number;
  stats: SeasonStats;
  averageRating: number;
  trophies: TrophyKind[];
  awards: Award[];
  marketValueEnd: Euros;
  wageMonthlyEnd: Euros;
  nationalCaps: number;
  nationalGoals: number;
  /** Note globale du joueur à la fin de la saison (bilan de carrière). */
  overallEnd?: number;
  /** Paragraphe canonique produit en fin de saison (LLM), conservé pour toujours. */
  narrativeSummary: string;
}

/** Estimation floue du potentiel donnée par le staff (jamais le chiffre réel). */
export interface PotentialEstimate {
  low: number;
  high: number;
  /** Phrase du staff : « Il peut jouer plus haut que la Ligue 1 ». */
  statement: string;
  updatedOn: ISODate;
}

/** Profil connu des adversaires (§6.4). */
export interface OpponentScouting {
  /** Vrai après 5 matchs joués. */
  profiled: boolean;
  /** Fréquence relative de chaque action par situation, alimentée par le moteur. */
  actionFrequency: Partial<Record<MatchActionId, number>>;
  /** Marquage individuel déclenché quand la réputation ligue dépasse le seuil de difficulté. */
  manMarkingLikely: boolean;
}

/** Le joueur incarné. */
export interface Player {
  id: Id;
  identity: Identity;
  attributes: Attributes;
  attributeXp: AttributeXp;
  /** Potentiel réel 1-99, caché. Tiré à la création, déplaçable de ±6 (§6.8). */
  potential: number;
  potentialEstimate: PotentialEstimate;
  /** Note globale au poste, recalculée par le moteur. */
  overall: number;
  /** -5 à +5, glissant sur 5 matchs. */
  form: number;
  /** 0-100, condition physique (100 = frais). */
  fitness: number;
  /** 0-100, rythme de compétition. */
  sharpness: number;
  /** 0-100. */
  morale: number;
  /** 0-100, confiance en soi liée aux derniers matchs. Sert de malus/bonus discret. */
  confidence: number;
  injuries: Injury[];
  /** Prédisposition cachée aux blessures (0-1). */
  injuryProneness: number;
  /** Jours consécutifs de séances intenses (sur-entraînement). */
  intenseSessionsStreak: number;
  contract: Contract;
  marketValue: Euros;
  marketValueHistory: ValuePoint[];
  seasonStats: SeasonStats;
  careerStats: Stats;
  history: SeasonRecord[];
  traits: Trait[];
  trophies: { kind: TrophyKind; seasonId: Id; clubId: Id }[];
  awards: Award[];
  scouting: OpponentScouting;
  /** Statut au sein du club : capitaine, vice-capitaine, etc. */
  squadStatus: 'capitaine' | 'vice_capitaine' | 'cadre' | 'membre' | 'ecarte';
  /** Cote auprès du coach pour la hiérarchie au poste, 0-100, distincte de la réputation. */
  coachTrust: Pct100;
  /** Suspension en cours : nombre de matchs restants par compétition. */
  suspensions: Record<Id, number>;
  /** Cartons jaunes accumulés par compétition (seuil de suspension). */
  yellowCardTally: Record<Id, number>;
  /** Revenus cumulés (Phase 6) : salaires, primes, sponsors. */
  earnings?: { wagesTotal: Euros; bonusesTotal: Euros; sponsorsTotal: Euros };
  /** Compteurs de carrière servant aux traits (Phase 6). */
  counters?: PlayerCounters;
  /** Potentiel tiré à la création : le potentiel courant ne s'en écarte jamais de plus de ±6 (§6.8). */
  initialPotential?: number;
}

/** Compteurs cumulés du joueur incarné, alimentés par le moteur (traits). */
export interface PlayerCounters {
  intenseSessions: number;
  captainMatches: number;
  decisiveBigMatchGoals: number;
  /** Dernier match dont les compteurs ont été pris en compte. */
  lastCountedMatchId?: Id;
  /** Depuis quand la cote supporters est ≥ au seuil « chouchou ». */
  supportersHighSince?: ISODate;
}

export interface ValuePoint {
  date: ISODate;
  value: Euros;
}

/** Joueur généré ou importé, coéquipier ou adversaire. Plus léger que `Player`. */
export interface NpcPlayer {
  id: Id;
  identity: Identity;
  attributes: Attributes;
  overall: number;
  /** Potentiel des PNJ, visible du moteur pour leur progression annuelle. */
  potential: number;
  form: number;
  fitness: number;
  morale: number;
  injury?: Injury;
  suspensionMatches: number;
  clubId: Id;
  contractEndsOn: ISODate;
  wageMonthly: Euros;
  marketValue: Euros;
  seasonStats: Stats;
  /** Numéro de maillot. */
  shirtNumber: number;
  /** Renommée individuelle 0-100 (star mondiale, joueur de Ligue 1, inconnu). */
  fame: Pct100;
  /** Vrai si le joueur vient d'un jeu de données réel (nom réel). */
  real: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Clubs, ligues, compétitions, saisons
// ═══════════════════════════════════════════════════════════════════════════

export const MENTALITIES = ['tres_defensive', 'defensive', 'equilibree', 'offensive', 'tres_offensive'] as const;
export type Mentality = (typeof MENTALITIES)[number];

export const PLAY_STYLES = ['possession', 'contre', 'pressing_haut', 'bloc_bas', 'direct', 'ailes'] as const;
export type PlayStyle = (typeof PLAY_STYLES)[number];

export interface Tactic {
  /** Ex. « 4-3-3 », « 3-5-2 ». Doit exister dans config/formations. */
  formation: string;
  mentality: Mentality;
  style: PlayStyle;
  /** Intensité du pressing 0-1. */
  pressing: number;
  /** Tempo 0-1 (lent → rapide). */
  tempo: number;
  /** Largeur 0-1 (axial → large). */
  width: number;
}

export const BOARD_OBJECTIVES = ['titre', 'podium', 'europe', 'ventre_mou', 'maintien', 'montee'] as const;
export type BoardObjective = (typeof BOARD_OBJECTIVES)[number];

export interface Club {
  id: Id;
  name: string;
  shortName: string;
  /** Trigramme d'affichage broadcast, ex. « OM ». */
  code: string;
  city: string;
  country: CountryCode;
  colors: { primary: string; secondary: string };
  stadium: { name: string; capacity: number };
  leagueId: Id;
  /** Prestige 0-100, très inertiel. */
  prestige: Pct100;
  /** Ferveur du public 0-100 : ambiance, pression, exigence. */
  fanbase: Pct100;
  /** Qualité du centre d'entraînement 0-100 (progression). */
  facilities: Pct100;
  transferBudget: Euros;
  wageBudgetMonthly: Euros;
  boardObjective: BoardObjective;
  tactic: Tactic;
  coachId: Id;
  captainId: Id;
  /** Ids de NpcPlayer (le joueur incarné n'est pas dedans, voir `CareerState.player`). */
  squadIds: Id[];
  rivalClubIds: Id[];
  /** Moral collectif 0-100. */
  teamMorale: Pct100;
  /** Hiérarchie au poste calculée par le coach IA, le joueur incarné inclus. */
  positionHierarchy: Partial<Record<Position, Id[]>>;
  /** Vrai si le club vient d'un jeu de données réel. */
  real: boolean;
}

export interface LeagueFormat {
  type: 'ligue';
  teams: number;
  /** 2 = aller-retour. */
  rounds: number;
  pointsWin: number;
  pointsDraw: number;
  promoted: number;
  relegated: number;
  /** Barragiste éventuel. */
  playoffSlots: number;
  /** Places européennes par ordre (LDC, LDC, LDC, LE, C4). */
  continentalSlots: ('ldc' | 'ldc_barrage' | 'le' | 'conf')[];
}

export interface KnockoutFormat {
  type: 'elimination';
  teams: number;
  twoLegged: boolean;
  extraTime: boolean;
  /** Tours joués, ex. ['32e', '16e', '8e', 'quart', 'demi', 'finale']. */
  rounds: string[];
}

export const COMPETITION_KINDS = [
  'championnat', 'coupe_nationale', 'coupe_ligue', 'supercoupe', 'continental_1',
  'continental_2', 'continental_3', 'international', 'amical',
] as const;
export type CompetitionKind = (typeof COMPETITION_KINDS)[number];

/** Définition statique d'une compétition. */
export interface Competition {
  id: Id;
  kind: CompetitionKind;
  name: string;
  shortName: string;
  country?: CountryCode;
  /** Prestige 0-100 : influence pression, réputation et valeur des performances. */
  prestige: Pct100;
  format: LeagueFormat | KnockoutFormat;
}

/** Un championnat national : compétition + niveau + clubs permanents. */
export interface League extends Competition {
  kind: 'championnat';
  country: CountryCode;
  /** 1 = élite. */
  tier: number;
  clubIds: Id[];
  format: LeagueFormat;
  /** Ligue de l'échelon inférieur, si simulée. */
  lowerLeagueId?: Id;
  upperLeagueId?: Id;
}

export interface TableRow {
  clubId: Id;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Derniers résultats, du plus ancien au plus récent. */
  last5: ('V' | 'N' | 'D')[];
}

/** Instance d'un championnat pour une saison. */
export interface LeagueSeason {
  leagueId: Id;
  seasonId: Id;
  clubIds: Id[];
  table: TableRow[];
  matchIds: Id[];
  currentMatchday: number;
  totalMatchdays: number;
}

/** Instance d'une compétition à élimination pour une saison. */
export interface CupSeason {
  competitionId: Id;
  seasonId: Id;
  clubIds: Id[];
  currentRound: number;
  /** Clubs encore en lice. */
  aliveClubIds: Id[];
  matchIds: Id[];
  winnerClubId?: Id;
}

export const SEASON_PHASES = [
  'vacances', 'preparation', 'championnat', 'treve_internationale',
  'mercato_ete', 'mercato_hiver', 'intersaison',
] as const;
export type SeasonPhase = (typeof SEASON_PHASES)[number];

/** Traversée du désert programmée (§6.6), cachée au joueur. */
export interface DesertSpell {
  id: Id;
  /** Index du match du joueur (dans la saison) où elle commence. */
  startMatchIndex: number;
  lengthMatches: number;
  finishingMultiplier: number;
  confidenceMalus: number;
  /** Nombre de matchs déjà subis. */
  elapsed: number;
}

export interface Season {
  id: Id;
  /** Ex. « 2026-27 ». */
  label: string;
  startDate: ISODate;
  endDate: ISODate;
  phase: SeasonPhase;
  leagues: Record<Id, LeagueSeason>;
  cups: Record<Id, CupSeason>;
  /** Fenêtres de mercato [ouverture, fermeture]. */
  transferWindows: { summer: [ISODate, ISODate]; winter: [ISODate, ISODate] };
  internationalBreaks: [ISODate, ISODate][];
  desertSpells: DesertSpell[];
  /** Index (0-based) du prochain match du joueur, sert au tirage des déserts. */
  playerMatchIndex: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Match : événements, situations, actions, résolution
// ═══════════════════════════════════════════════════════════════════════════

export const MATCH_STATUSES = ['a_venir', 'en_cours', 'joue', 'reporte'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export interface Lineup {
  formation: string;
  starters: Id[];
  bench: Id[];
  captainId: Id;
}

export const MATCH_EVENT_TYPES = [
  'coup_d_envoi', 'but', 'but_csc', 'penalty_marque', 'penalty_rate', 'penalty_arrete',
  'tir_cadre', 'tir_non_cadre', 'poteau', 'arret', 'occasion_manquee', 'grosse_occasion',
  'passe_decisive', 'dribble_reussi', 'dribble_rate', 'duel_gagne', 'duel_perdu',
  'tacle', 'interception', 'faute', 'faute_subie', 'carton_jaune', 'carton_rouge',
  'hors_jeu', 'corner', 'coup_franc', 'var_but_refuse', 'var_penalty', 'var_rouge',
  'remplacement', 'blessure', 'changement_tactique', 'marquage_individuel',
  'mi_temps', 'temps_additionnel', 'coup_de_sifflet_final', 'clameur', 'sifflets',
  'consigne_coach', 'replique_capitaine', 'simulation_sanctionnee', 'protestation', 'ballon_perdu',
] as const;
export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];

export interface MatchEvent {
  minute: number;
  /** Ordre dans la minute. */
  seq: number;
  type: MatchEventType;
  side: 'home' | 'away' | 'neutre';
  playerId?: Id;
  secondaryPlayerId?: Id;
  /** xG de l'occasion, si applicable. */
  xg?: number;
  /** Faits structurés pour la narration (zone, distance, qualité du tir). */
  detail?: Record<string, string | number | boolean>;
  /** Vrai si le joueur incarné est impliqué. */
  involvesPlayer: boolean;
  /** Phrase déjà narrée (cache), remplie par le LLM ou le narrateur de repli. */
  narration?: string;
}

/** Types de situations qui arrêtent le match pour le joueur incarné (§5.2). */
export const SITUATION_KINDS = [
  // Offensives
  'centre_a_venir', 'occasion_surface', 'face_a_face', 'un_contre_un', 'contre_attaque',
  'reception_dos_au_but', 'frappe_lointaine_possible', 'penalty', 'coup_franc_direct',
  'coup_franc_indirect', 'corner_offensif', 'derniere_passe', 'appel_a_faire',
  // Défensives
  'duel_defensif', 'couverture', 'pressing_declenche', 'corner_defensif', 'relance_sous_pression',
  'contre_adverse', 'faute_tactique_possible',
  // Gardien
  'gardien_face_a_face', 'gardien_sortie_aerienne', 'gardien_relance', 'gardien_penalty',
  // Hors ballon
  'provocation_adverse', 'coequipier_en_difficulte', 'consigne_du_banc', 'tension_fin_de_match',
  'blessure_ressentie',
] as const;
export type SituationKind = (typeof SITUATION_KINDS)[number];

/** Actions canoniques, enum fermé validé par Zod côté LLM (§6.1). */
export const MATCH_ACTIONS = [
  // Sans ballon
  'appel_premier_poteau', 'appel_deuxieme_poteau', 'appel_profondeur', 'decrocher',
  'rester_en_pivot', 'fixer_defenseur', 'attendre',
  // Avec ballon
  'frappe', 'frappe_premiere_intention', 'frappe_lointaine', 'tete', 'lob',
  'dribble', 'dribble_gardien', 'crochet', 'remise', 'une_deux', 'passe_courte',
  'passe_profondeur', 'passe_longue', 'centre', 'centre_en_retrait', 'conserver',
  'proteger_ballon', 'temporiser', 'accelerer',
  // Coups de pied arrêtés
  'penalty_placer', 'penalty_puissance', 'penalty_panenka', 'coup_franc_frappe',
  'coup_franc_centre', 'coup_franc_passe', 'corner_rentrant', 'corner_sortant', 'corner_court',
  // Défensif
  'presser', 'tacler', 'intercepter', 'couvrir', 'marquer', 'degager', 'relancer_court',
  'relancer_long', 'faute_tactique', 'bloquer',
  // Gardien
  'gb_rester_ligne', 'gb_sortir', 'gb_sortie_aerienne', 'gb_relance_courte', 'gb_degagement_long',
  'gb_plonger_gauche', 'gb_plonger_droite', 'gb_rester_centre',
  // Comportement
  'simuler', 'protester', 'provoquer', 'encourager', 'calmer_le_jeu', 'demander_changement',
  'jouer_blesse', 'signaler_blessure',
  // Non-décision : instruction méta, silence, hors sujet → action par défaut
  'aucune',
] as const;
export type MatchActionId = (typeof MATCH_ACTIONS)[number];

export const SHOT_ZONES = [
  'lucarne_gauche', 'lucarne_droite', 'ras_de_terre_premier_poteau', 'ras_de_terre_deuxieme_poteau',
  'mi_hauteur', 'entre_les_jambes', 'au_dessus_du_gardien', 'defaut',
] as const;
export type ShotZone = (typeof SHOT_ZONES)[number];

/** Sortie du classificateur d'intention (§6.1). Le résolveur ne voit jamais le texte brut. */
export interface ClassifiedAction {
  action: MatchActionId;
  /** Cible : zone de tir, coéquipier, côté. */
  cible?: ShotZone | Id | 'gauche' | 'droite' | 'axe';
  /** 0-1. */
  intensite: number;
  /** 0-1. Plus c'est haut, plus c'est difficile et plus ça rapporte. */
  risque: number;
  /** Ce que le joueur crie ou dit pendant l'action (mémorisé, pas résolu). */
  communication?: string;
  /** Vrai si la phrase était une instruction méta ou une affirmation de résultat. */
  meta: boolean;
}

export interface SituationContext {
  minute: number;
  scoreFor: number;
  scoreAgainst: number;
  /** Qualité du défenseur direct 1-99. */
  defenderQuality: number;
  goalkeeperQuality: number;
  /** Distance au but en mètres. */
  distanceM: number;
  /** Angle 0-1 (0 = fermé, 1 = face au but). */
  angle: number;
  /** Densité défensive 0-1. */
  density: number;
  /** Pression du moment 0-1 (enjeu, minute, public, score). */
  pressure: number;
  playerFitness: number;
  /** Nombre de fois où la même action a été tentée dans une situation similaire ce match. */
  repetitionCount: number;
  manMarked: boolean;
}

/** Point de décision présenté au joueur. Le texte est produit par le narrateur à partir des faits. */
export interface Situation {
  id: Id;
  matchId: Id;
  /** Index de l'action dans le match, sert à dériver le RNG. */
  actionIndex: number;
  kind: SituationKind;
  context: SituationContext;
  /** Faits structurés que le narrateur transforme en texte. */
  facts: Record<string, string | number | boolean>;
  /** xG de base avant modificateurs. */
  baseProbability: Prob;
  /** Actions plausibles ici (aide au classificateur, pas un QCM affiché). */
  allowedActions: MatchActionId[];
  /** Action jouée si silence ou méta. */
  defaultAction: ClassifiedAction;
  timerSeconds: number;
  /** Coéquipiers proches, pour les cibles de passe. */
  nearbyTeammateIds: Id[];
}

export const OUTCOME_KINDS = [
  'but', 'arret', 'hors_cadre', 'poteau', 'contre', 'passe_decisive', 'passe_reussie',
  'passe_ratee', 'occasion_creee', 'dribble_reussi', 'dribble_rate', 'duel_gagne', 'duel_perdu',
  'faute_subie', 'faute_commise', 'penalty_obtenu', 'carton_jaune', 'carton_rouge', 'hors_jeu',
  'ballon_conserve', 'ballon_perdu', 'tacle_reussi', 'interception', 'degagement',
  'simulation_sanctionnee', 'protestation_jaune', 'blessure', 'rien', 'gb_arret', 'gb_but_encaisse',
  'gb_sortie_reussie', 'gb_sortie_ratee',
] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

/** Résultat factuel d'une action, calculé par le moteur, jamais par le LLM. */
export interface ActionOutcome {
  kind: OutcomeKind;
  /** Probabilité finale après plafonds et modificateurs. */
  probability: Prob;
  /** Tirage seedé qui a décidé. */
  roll: number;
  /** Décomposition lisible : { base: 0.26, fatigue: 0.94, pression: 0.88, plafond: 0.26 }. */
  modifiers: Record<string, number>;
  ratingDelta: number;
  ratingReason: string;
  statsDelta: Partial<Stats>;
  /** Enchaînement éventuel : un dribble réussi ouvre une frappe. */
  followUp?: SituationKind;
  /** Faits pour la narration : célébration, réaction du public, réplique de coéquipier. */
  facts: Record<string, string | number | boolean>;
}

export interface DecisionRecord {
  situationId: Id;
  minute: number;
  actionIndex: number;
  kind: SituationKind;
  /** Transcription brute (vocal ou clavier), conservée pour le journal. */
  rawInput: string;
  /** Vrai si le timer a expiré. */
  timedOut: boolean;
  classified: ClassifiedAction;
  outcome: ActionOutcome;
}

export interface RatingChange {
  minute: number;
  delta: number;
  reason: string;
}

/** Tableau de fin de match obligatoire (§5.6), notes sur 10. */
export interface MatchEvaluation {
  performance: number;
  coach: number;
  supporters: number;
  teammates: number;
  media: number;
  /** Une phrase par regard, produite par le LLM ou le narrateur de repli. */
  verdicts: { performance: string; coach: string; supporters: string; teammates: string; media: string };
}

export interface PlayerMatchReport {
  matchId: Id;
  started: boolean;
  /** Absent si non convoqué ou en tribune. */
  minutesPlayed: number;
  subbedOnMinute?: number;
  subbedOffMinute?: number;
  /** Raison d'une sortie anticipée : « mauvais match », « blessure », « tactique ». */
  subbedOffReason?: string;
  rating: number;
  ratingLog: RatingChange[];
  stats: Stats;
  motm: boolean;
  evaluation: MatchEvaluation;
  decisions: DecisionRecord[];
  /** Nombre d'instructions méta détectées (−0.2 de note à partir de 3). */
  metaAttempts: number;
  /** Titre de presse du lendemain (repli). */
  headline?: string;
  /** Titres de presse détaillés (générés après le match, LLM ou repli). */
  headlines?: { outlet: string; title: string; tone: 'elogieux' | 'neutre' | 'critique' | 'moqueur' }[];
  /** Blessure contractée pendant le match, appliquée au joueur par la boucle quotidienne. */
  injury?: Injury;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  /** Score après prolongation ou tirs au but, pour les coupes. */
  extraTime?: { homeGoals: number; awayGoals: number };
  penalties?: { homeGoals: number; awayGoals: number };
  homeXg: number;
  awayXg: number;
  homePossession: number;
  attendance: number;
  lineups: { home: Lineup; away: Lineup };
  events: MatchEvent[];
  /** Résumés des minutes creuses : « 14'-22' — Le match s'équilibre ». */
  summaryLines: { from: number; to: number; text: string }[];
  playerReport?: PlayerMatchReport;
}

export interface Match {
  id: Id;
  seasonId: Id;
  competitionId: Id;
  matchday?: number;
  round?: string;
  leg?: 1 | 2;
  date: ISODate;
  homeClubId: Id;
  awayClubId: Id;
  neutralVenue: boolean;
  status: MatchStatus;
  /** Enjeu 0-100 calculé par le moteur : derby, classement, coupe, finale. */
  importance: Pct100;
  /** Vrai si le joueur incarné appartient à l'un des deux clubs. */
  involvesPlayer: boolean;
  result?: MatchResult;
}

/** État vivant d'un match en cours, sérialisable pour reprendre après rechargement. */
export interface MatchState {
  matchId: Id;
  /**
   * Échéance du chrono de décision (horodatage), conservée dans la sauvegarde :
   * quitter puis rouvrir l'écran de match ne redonne pas du temps de réflexion (§6.7).
   */
  situationDeadlineAt?: number;
  minute: number;
  addedTime: number;
  half: 1 | 2 | 'prolongation' | 'tab';
  homeGoals: number;
  awayGoals: number;
  homeXg: number;
  awayXg: number;
  /** Possession cumulée en minutes pour l'équipe à domicile. */
  homePossessionMinutes: number;
  /** Momentum -1 (adversaire domine) à +1. */
  momentum: number;
  events: MatchEvent[];
  lineups: { home: Lineup; away: Lineup };
  homeSubsUsed: number;
  awaySubsUsed: number;
  /** Fatigue par joueur 0-100. */
  fatigue: Record<Id, number>;
  playerOnPitch: boolean;
  playerMinutes: number;
  playerRating: number;
  ratingLog: RatingChange[];
  playerStats: Stats;
  decisions: DecisionRecord[];
  actionIndex: number;
  metaAttempts: number;
  /** Mémoire du détecteur de répétition : action, minute. */
  repetitions: { action: MatchActionId; kind: SituationKind; minute: number }[];
  /** Adaptations adverses actives. */
  opponentAdaptations: { manMarking: boolean; since?: number; doubled: boolean };
  /** Situation en attente de réponse, s'il y en a une. */
  pendingSituation?: Situation;
  /** Minute de la dernière situation, pour l'espacement. */
  lastSituationMinute: number;
  summaryLines: { from: number; to: number; text: string }[];
  /** Minutes simulées, temps additionnel compris : base de la clé RNG de chaque minute. */
  tick?: number;
  /** Actions du joueur déjà résolues dans la minute courante (suite de la clé RNG). */
  tickActions?: number;
  /** Nombre de situations visé pour le joueur dans ce match. */
  situationTarget?: number;
  /** Dérive passive de note déjà appliquée, bornée. */
  passiveDrift?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. PNJ, voix, relations
// ═══════════════════════════════════════════════════════════════════════════

export const NPC_KINDS = [
  'coach', 'adjoint', 'president', 'directeur_sportif', 'capitaine', 'coequipier',
  'journaliste', 'consultant_tv', 'agent', 'mere', 'pere', 'frere_soeur', 'partenaire', 'ami',
  'selectionneur', 'medecin', 'preparateur', 'sponsor', 'supporter', 'adversaire', 'commentateur',
] as const;
export type NpcKind = (typeof NPC_KINDS)[number];

/** Profil vocal persistant attribué à la création du PNJ (§7). */
export interface VoiceProfile {
  gender: 'homme' | 'femme';
  ageBand: 'jeune' | 'adulte' | 'senior';
  /** 0.5-2.0 pour Web Speech. */
  pitch: number;
  /** 0.7-1.3. */
  rate: number;
  /** Nom de voix système préféré, si disponible. */
  webSpeechVoiceHint?: string;
  /** Identifiant de voix ElevenLabs, si activé. */
  elevenLabsVoiceId?: string;
  /** Accent ou timbre décrit pour le prompt : « voix rocailleuse du sud ». */
  timbre: string;
}

export interface NpcPersonality {
  /** Chaleur 0-100. */
  warmth: Pct100;
  /** Sévérité 0-100. */
  severity: Pct100;
  /** Volatilité 0-100 : réactions à chaud. */
  volatility: Pct100;
  /** Appétit médiatique 0-100 : parle à la presse, balance. */
  mediaHunger: Pct100;
  /** Loyauté 0-100. */
  loyalty: Pct100;
  /** Quelques mots-clés libres pour le prompt : « ancien joueur, aime les jeunes, rancunier ». */
  keywords: string[];
}

export interface Npc {
  id: Id;
  kind: NpcKind;
  firstName: string;
  lastName: string;
  nationality: CountryCode;
  birthDate: ISODate;
  clubId?: Id;
  /** Média d'appartenance pour un journaliste, sélection pour un sélectionneur. */
  affiliation?: string;
  /** Si le PNJ est aussi un joueur (capitaine, coéquipier), id du NpcPlayer. */
  npcPlayerId?: Id;
  personality: NpcPersonality;
  voice: VoiceProfile;
  /** Fiche courte injectée dans le prompt quand le PNJ apparaît (§9). */
  card: { summary: string; lastExchange?: string; updatedOn: ISODate };
  active: boolean;
  createdOn: ISODate;
  /** Vrai si le PNJ vient d'un jeu de données réel (coach réel). */
  real: boolean;
}

/** Coach : PNJ + profil tactique et exigences. */
export interface Coach extends Npc {
  kind: 'coach';
  /** Préférences tactiques appliquées au club. */
  preferredTactic: Tactic;
  /** Confiance envers les jeunes 0-100. */
  youthTrust: Pct100;
  /** Patience avant sanction 0-100 (modulée par la difficulté). */
  patience: Pct100;
  /** Compétence 0-100 : influence la force d'équipe. */
  ability: Pct100;
  contractEndsOn: ISODate;
}

export const INTERACTION_CHANNELS = [
  'conference', 'interview_flash', 'vestiaire', 'terrain', 'telephone', 'sms', 'reseaux_sociaux',
  'television', 'bureau', 'repas', 'soiree', 'domicile',
] as const;
export type InteractionChannel = (typeof INTERACTION_CHANNELS)[number];

export interface InteractionLog {
  date: ISODate;
  channel: InteractionChannel;
  summary: string;
  deltaTrust: number;
  deltaRespect: number;
}

export interface Relationship {
  npcId: Id;
  /** -100 à +100. */
  trust: number;
  /** -100 à +100. */
  respect: number;
  history: InteractionLog[];
}

export interface RelationshipDelta {
  npcId: Id;
  trust: number;
  respect: number;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Réputation
// ═══════════════════════════════════════════════════════════════════════════

export const REPUTATION_KEYS = [
  'club', 'supporters', 'coach', 'teammates', 'league', 'world', 'nationalTeam', 'media',
] as const;
export type ReputationKey = (typeof REPUTATION_KEYS)[number];

export interface GaugePoint {
  date: ISODate;
  value: number;
  delta: number;
  reason: string;
}

export interface Gauge {
  /** 0-100. */
  value: Pct100;
  /** Historique daté, compacté par le moteur (derniers 200 points + un point mensuel). */
  history: GaugePoint[];
}

export type Reputation = Record<ReputationKey, Gauge>;

/** Deltas proposés par le LLM ou le moteur, bornés à ±5 par interaction et ±12 par jour (§8). */
export type ReputationDeltas = Partial<Record<ReputationKey, number>>;

// ═══════════════════════════════════════════════════════════════════════════
// 8. Communication, citations, promesses, storylines, mémoire
// ═══════════════════════════════════════════════════════════════════════════

export interface CommunicationFlags {
  arrogance: boolean;
  critique_coequipier: boolean;
  critique_coach: boolean;
  critique_arbitre: boolean;
  promesse_publique: boolean;
  teasing_transfert: boolean;
  /** 0-1. */
  langue_de_bois: number;
  /** Le joueur a coupé la parole au PNJ (barge-in). */
  interruption: boolean;
  /** Tentative méta hors match. */
  meta: boolean;
}

export const STORYLINE_KINDS = [
  'promesse_publique', 'conflit_vestiaire', 'concurrent_au_poste', 'changement_coach',
  'rumeur_transfert', 'demande_transfert', 'bad_buzz', 'sponsor', 'famille', 'sentimental',
  'deuil', 'maladie_proche', 'probleme_extra_sportif', 'capitanat', 'selection', 'blessure_longue',
  'renouvellement_contrat', 'soiree_equipe', 'television', 'supporters',
] as const;
export type StorylineKind = (typeof STORYLINE_KINDS)[number];

export type ConsequenceSpec =
  | { type: 'storyline'; kind: StorylineKind; id: Id; deadline?: ISODate; title: string }
  | { type: 'media_headline'; text: string }
  | { type: 'promesse'; text: string; deadline: ISODate; check: PromiseCheck }
  | { type: 'relationship'; delta: RelationshipDelta }
  | { type: 'memory'; summary: string; importance: 1 | 2 | 3 | 4 | 5 };

/** Sortie structurée de l'analyse de communication (§8). */
export interface CommunicationAnalysis {
  interpretation: string;
  tone: string[];
  /** 0-10. */
  communication_score: number;
  flags: CommunicationFlags;
  deltas: ReputationDeltas;
  consequences: ConsequenceSpec[];
  npc_reply: string;
}

export interface QuoteEntry {
  id: Id;
  date: ISODate;
  channel: InteractionChannel;
  npcId?: Id;
  /** Contexte court : « Conférence d'après-match, défaite 0-3 à Lens ». */
  context: string;
  text: string;
  analysis: CommunicationAnalysis;
  /** Deltas réellement appliqués après bornage. */
  appliedDeltas: ReputationDeltas;
}

/** Condition vérifiable par le moteur, jamais par le LLM. */
export type PromiseCheck =
  | { type: 'marquer_dans_match'; matchId: Id }
  | { type: 'buts_avant_date'; goals: number }
  | { type: 'gagner_match'; matchId: Id }
  | { type: 'titulaire_avant_date' }
  | { type: 'rester_au_club_jusqua'; date: ISODate }
  | { type: 'declaratif' };

export interface PublicPromise {
  id: Id;
  quoteId: Id;
  text: string;
  madeOn: ISODate;
  deadline: ISODate;
  check: PromiseCheck;
  status: 'en_cours' | 'tenue' | 'rompue';
  resolvedOn?: ISODate;
}

export interface Storyline {
  id: Id;
  kind: StorylineKind;
  title: string;
  startedOn: ISODate;
  deadline?: ISODate;
  status: 'ouverte' | 'resolue' | 'echouee' | 'expiree';
  /** Étape courante d'un scénario à embranchements. */
  stage: string;
  /** Variables libres du scénario. */
  vars: Record<string, string | number | boolean>;
  npcIds: Id[];
  /** Journal daté des étapes franchies. */
  log: { date: ISODate; text: string }[];
  /** Trace permanente laissée à la résolution. */
  resolution?: { date: ISODate; text: string; traitId?: Id };
}

export const MEMORY_TYPES = [
  'match', 'declaration', 'transfert', 'blessure', 'relation', 'selection', 'vie_privee',
  'trophee', 'conflit', 'promesse', 'saison',
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Souvenir narratif pour la mémoire hiérarchique (§9). */
export interface MemoryEntry {
  id: Id;
  date: ISODate;
  type: MemoryType;
  importance: 1 | 2 | 3 | 4 | 5;
  summary: string;
  /** Ids de PNJ, de clubs, de matchs, mots-clés. */
  entities: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Calendrier, journées, entraînement, événements
// ═══════════════════════════════════════════════════════════════════════════

export const DAY_KINDS = [
  'entrainement', 'veille_match', 'jour_match', 'lendemain_match', 'repos',
  'treve_internationale', 'rassemblement_selection', 'match_international',
  'mercato', 'intersaison', 'preparation', 'vacances', 'reeducation',
] as const;
export type DayKind = (typeof DAY_KINDS)[number];

export const TRAINING_FOCUSES = [
  'physique', 'finition', 'dribble', 'vitesse', 'jeu_de_tete', 'placement', 'musculation',
  'recuperation', 'tactique_individuelle', 'coups_de_pied_arretes', 'passes', 'defense',
  'gardien_specifique',
] as const;
export type TrainingFocus = (typeof TRAINING_FOCUSES)[number];

export type DayActionKind =
  | { type: 'entrainement'; focus: TrainingFocus; intensity: 'legere' | 'normale' | 'intense' }
  | { type: 'media'; channel: InteractionChannel; npcId: Id }
  | { type: 'rendez_vous'; npcId: Id; channel: InteractionChannel; subject: string }
  | { type: 'vie_privee'; label: string; storylineId?: Id }
  | { type: 'soins'; label: string }
  | { type: 'repos' };

export interface DayAction {
  id: Id;
  label: string;
  kind: DayActionKind;
  /** Vrai si l'action est imposée (convocation, conférence obligatoire). */
  mandatory: boolean;
  done: boolean;
}

export interface CalendarDay {
  date: ISODate;
  kind: DayKind;
  matchId?: Id;
  /** Ids des événements déclenchés ce jour. */
  eventIds: Id[];
  actions: DayAction[];
  /** Journée terminée, autosave faite. */
  completed: boolean;
}

export const EVENT_CATEGORIES = [
  'famille', 'agent', 'sponsor', 'reseaux_sociaux', 'supporters', 'television', 'soiree_equipe',
  'conflit_vestiaire', 'capitanat', 'concurrent', 'changement_coach', 'sentimental', 'deuil',
  'maladie_proche', 'extra_sportif', 'blessure', 'coup_du_sort', 'presse', 'club', 'selection',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** Événement déclenché, journalisé (§12). La définition pondérée vit dans engine/events. */
export interface GameEvent {
  id: Id;
  /** Id de la définition dans le catalogue d'événements. */
  definitionId: Id;
  category: EventCategory;
  date: ISODate;
  title: string;
  /** Faits structurés fournis au narrateur. */
  facts: Record<string, string | number | boolean>;
  npcIds: Id[];
  storylineId?: Id;
  resolved: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. Mercato, sélection nationale, sponsors
// ═══════════════════════════════════════════════════════════════════════════

export const OFFER_STATUSES = ['en_attente', 'en_negociation', 'acceptee', 'refusee', 'expiree', 'retiree'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export interface TransferOffer {
  id: Id;
  clubId: Id;
  receivedOn: ISODate;
  expiresOn: ISODate;
  /** 1-5 étoiles. */
  interest: 1 | 2 | 3 | 4 | 5;
  fee: Euros;
  wageMonthly: Euros;
  years: number;
  promisedRole: PromisedRole;
  releaseClause?: Euros;
  /** Prêt plutôt qu'achat. */
  loan: boolean;
  status: OfferStatus;
  /** Réponse du club actuel : accepte de vendre ou non. */
  currentClubStance: 'ouvert' | 'reticent' | 'ferme';
  negotiationLog: { date: ISODate; from: 'joueur' | 'agent' | 'club'; text: string }[];
  /** Date d'exécution du transfert (ou de la prolongation) : une offre acceptée ne s'exécute qu'une fois. */
  executedOn?: ISODate;
}

export interface TransferRecord {
  date: ISODate;
  fromClubId: Id;
  toClubId: Id;
  fee: Euros;
  loan: boolean;
  requested: boolean;
}

/** Compétition des matchs de sélection nationale (clubs pseudo `nat_<CODE>`, hors championnat). */
export const INTERNATIONAL_COMPETITION_ID = 'international';

export const NATIONAL_STAGES = ['aucun', 'espoirs', 'pre_liste', 'convoque', 'titulaire', 'cadre', 'capitaine'] as const;
export type NationalStage = (typeof NATIONAL_STAGES)[number];

export interface NationalTeamStatus {
  countryCode: CountryCode;
  stage: NationalStage;
  caps: number;
  goals: number;
  assists: number;
  /** Vrai dès le premier match officiel A : changement de sélection impossible. */
  lockedIn: boolean;
  firstCallOn?: ISODate;
  lastCallOn?: ISODate;
  selectionneurId?: Id;
}

export interface SponsorDeal {
  id: Id;
  brand: string;
  kind: 'equipementier' | 'marque' | 'jeu_video' | 'boisson' | 'automobile' | 'autre';
  signedOn: ISODate;
  endsOn: ISODate;
  amountYearly: Euros;
  /** Obligations : posts par mois, apparitions. */
  obligations: string[];
  /** Cycle de vie (Phase 6) : proposé, actif, refusé, terminé. Absent = actif (anciennes sauvegardes). */
  status?: 'proposee' | 'active' | 'refusee' | 'terminee';
  proposedOn?: ISODate;
  /** Une seule négociation possible par proposition. */
  negotiated?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. Jeu de données, réglages, RNG
// ═══════════════════════════════════════════════════════════════════════════

/** Description du jeu de données chargé (fictif par défaut ou réel importé). */
export interface DatasetInfo {
  id: Id;
  label: string;
  /** Vrai si noms réels de clubs, joueurs et coachs. */
  realNames: boolean;
  /** Saison de référence des effectifs, ex. « 2026-27 ». */
  referenceSeason: string;
  /** Provenance : « intégré », « import utilisateur ». */
  source: string;
  leagueIds: Id[];
}

export interface DifficultyProfile {
  difficulty: Difficulty;
  conversionMultiplier: number;
  decisionTimerSeconds: number;
  coachTolerance: 'haute' | 'moyenne' | 'faible';
  mediaSeverity: 'moderee' | 'forte' | 'brutale';
  injuryFrequency: number;
  desertSpellsPerSeason: number;
  potentialReveal: 'indicative' | 'floue' | 'jamais';
  manMarkingFromLeagueReputation: number;
}

export interface CareerSettings {
  difficulty: Difficulty;
  voiceMode: VoiceMode;
  /** Mode bac à sable : rechargements libres, bilan et records désactivés (§6.7). */
  sandbox: boolean;
  /** Timer de décision actif en match. */
  decisionTimer: boolean;
  /** Mode d'entrée vocale. */
  pushToTalk: boolean;
  speechRate: number;
  subtitles: boolean;
  /** Modèle LLM courant et modèle pour les grands moments. */
  llmModel: string;
  llmPremiumModel?: string;
  ttsProvider: 'webspeech' | 'elevenlabs';
}

/**
 * Clé de dérivation du RNG (§6.7). Chaque tirage vient de
 * hash(careerSeed, scope, index) : recharger et rejouer la même décision
 * donne le même résultat.
 *  - match : scope = matchId, index = minute * 100 + actionIndex
 *  - jour  : scope = date, index = compteur d'appels du jour
 *  - monde : scope = 'world:<seasonId>', index = compteur
 */
export interface RngKey {
  scope: string;
  index: number;
}

export interface CareerLogEntry {
  date: ISODate;
  category: 'match' | 'transfert' | 'blessure' | 'contrat' | 'selection' | 'trophee' | 'reputation' | 'vie' | 'systeme';
  text: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. État complet de la carrière (sauvegarde)
// ═══════════════════════════════════════════════════════════════════════════

export interface World {
  dataset: DatasetInfo;
  leagues: Record<Id, League>;
  competitions: Record<Id, Competition>;
  clubs: Record<Id, Club>;
  npcPlayers: Record<Id, NpcPlayer>;
  npcs: Record<Id, Npc | Coach>;
  /** Sélections nationales simulées : effectif par pays. */
  nationalSquads: Record<CountryCode, Id[]>;
  /** Inflation du marché des transferts, 1.0 au départ. */
  marketInflation: number;
}

export interface CareerState {
  /** Version du schéma de sauvegarde, pour les migrations. */
  schemaVersion: number;
  careerId: Id;
  seed: Seed;
  createdOn: ISODate;
  settings: CareerSettings;
  currentDate: ISODate;
  player: Player;
  world: World;
  season: Season;
  /** Saisons passées, ordre chronologique. */
  pastSeasons: SeasonRecord[];
  /** Matchs de la saison en cours, toutes équipes (les saisons passées gardent seulement les matchs du joueur). */
  matches: Record<Id, Match>;
  /** Match en cours, s'il y en a un (sauvegarde à mi-match possible). */
  liveMatch?: MatchState;
  /** Journée interactive commencée, en attente du match du joueur. */
  pendingDay?: PendingDay;
  /** Calendrier de la saison en cours, ordre chronologique. */
  calendar: CalendarDay[];
  reputation: Reputation;
  relationships: Record<Id, Relationship>;
  storylines: Storyline[];
  promises: PublicPromise[];
  quotes: QuoteEntry[];
  memory: MemoryEntry[];
  events: GameEvent[];
  offers: TransferOffer[];
  transfers: TransferRecord[];
  national: NationalTeamStatus;
  sponsors: SponsorDeal[];
  /** Deltas de réputation déjà appliqués aujourd'hui, pour la borne ±12/jour. */
  reputationDeltasToday: ReputationDeltas;
  /** Compteurs de tirages par scope, pour dériver des clés RNG uniques. */
  rngCounters: Record<string, number>;
  log: CareerLogEntry[];
  /** Vrai une fois la carrière terminée (retraite). */
  retired: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. Types de travail partagés entre modules du moteur (pas sauvegardés)
// ═══════════════════════════════════════════════════════════════════════════

/** Forces d'équipe 1-99 dérivées du onze, de la tactique et du coach. */
export interface TeamStrength {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
  overall: number;
  /** Intensité effective du pressing 0-1. */
  pressing: number;
  /** Vitesse collective 1-99, sert aux contres. */
  pace: number;
}

export interface MatchSide {
  club: Club;
  coach: Coach;
  lineup: Lineup;
  strength: TeamStrength;
}

/** Tout ce qu'un match a besoin de connaître, construit avant le coup d'envoi. */
export interface MatchContext {
  match: Match;
  seed: Seed;
  home: MatchSide;
  away: MatchSide;
  /** Joueurs des deux effectifs par id (le joueur incarné n'y est pas, voir `player`). */
  roster: Record<Id, NpcPlayer>;
  /** Le joueur incarné et son côté, absents s'il ne participe pas. */
  player?: Player;
  playerSide?: 'home' | 'away';
  difficulty: DifficultyProfile;
  /** Traversée du désert active pour le joueur, s'il y en a une. */
  desert?: DesertSpell;
  /** Réputation « ligue » du joueur (0-100) au coup d'envoi : déclenche le marquage individuel (§6.4). */
  playerLeagueReputation?: Pct100;
  mode: 'auto' | 'interactif';
}

export interface AttributeGain {
  key: AttributeKey;
  from: number;
  to: number;
}

export interface TrainingResult {
  focus: TrainingFocus;
  intensity: 'legere' | 'normale' | 'intense';
  gains: AttributeGain[];
  fatigueDelta: number;
  xpAdded: Partial<AttributeXp>;
}

/** Ce qu'une journée a produit, pour l'UI et le journal. */
export interface DayResult {
  date: ISODate;
  kind: DayKind;
  matchId?: Id;
  matchResult?: MatchResult;
  training?: TrainingResult;
  newInjuries: Injury[];
  attributeGains: AttributeGain[];
  reputationChanges: { key: ReputationKey; delta: number; reason: string }[];
  /** Lignes lisibles pour le journal du jour. */
  messages: string[];
  /** Mode interactif : match du joueur à jouer par l'interface avant de terminer la journée. */
  pendingPlayerMatchId?: Id;
}

/** Journée commencée en mode interactif, en attente du match du joueur (sauvegardée pour reprise). */
export interface PendingDay {
  date: ISODate;
  kind: DayKind;
  matchId: Id;
  /** Ids des blessures déjà présentes au début de la journée. */
  injuriesBefore: Id[];
  result: DayResult;
}

/** Paramètres de l'écran de création (§2). */
export interface CareerSetup {
  firstName: string;
  lastName: string;
  startAge: number;
  nationality: CountryCode;
  secondNationality?: CountryCode;
  position: Position;
  foot: Foot;
  heightCm: number;
  weightKg: number;
  archetypes: Archetype[];
  clubId: Id;
  startingLevel: StartingLevel;
  difficulty: Difficulty;
  /** Répartition des 40 points, bornée par âge et poste. */
  allocation: Partial<Attributes>;
  datasetId: Id;
  seed?: Seed;
  sandbox?: boolean;
}
