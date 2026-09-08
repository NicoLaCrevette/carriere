/**
 * Profils des 10 postes : poids des attributs dans la note, attributs clés,
 * mix de situations en match, actions par défaut, plafonds de création et
 * compatibilité entre postes.
 *
 * Les poids bruts ci-dessous sont normalisés (somme = 1). Seul le gardien
 * pèse les attributs du groupe « gardien ».
 */
import { ATTRIBUTE_GROUPS, POSITIONS } from '../types';
import type { AttributeKey, MatchActionId, Position, SituationKind } from '../types';
import { BALANCE } from './balance';

export interface PositionProfile {
  position: Position;
  /** « Buteur ». */
  label: string;
  /** Poids des attributs dans la note globale (somme = 1). */
  weights: Partial<Record<AttributeKey, number>>;
  /** Attributs « clés » affichés en priorité. */
  keyAttributes: AttributeKey[];
  /** Nombre de points de décision par match [min, max] pour un titulaire (§5.2 : 8-16). */
  situationsPerMatch: [number, number];
  /** Mix de situations (poids relatifs). */
  situationMix: Partial<Record<SituationKind, number>>;
  /** Actions par défaut plausibles par type de situation, pour autoplay (la première est l'action par défaut). */
  defaultActions: Partial<Record<SituationKind, MatchActionId[]>>;
  /** Plafond de points à la création par attribut à 16 ans (§2), avant bonus d'âge. */
  creationCaps: Partial<Record<AttributeKey, number>>;
  /** Malus multiplicatif (fraction) appliqué à la note quand le joueur joue à un poste secondaire. */
  outOfPositionMalus: number;
}

export const POSITION_LABELS: Record<Position, string> = {
  GB: 'Gardien', DC: 'Défenseur central', DD: 'Latéral droit', DG: 'Latéral gauche',
  MDC: 'Milieu défensif', MC: 'Milieu central', MOC: 'Milieu offensif',
  AIG: 'Ailier gauche', AID: 'Ailier droit', BU: 'Buteur',
};

// ── Helpers de construction ──────────────────────────────────────────────

type Weights = Partial<Record<AttributeKey, number>>;
type Defaults = Partial<Record<SituationKind, MatchActionId[]>>;
type Mix = Partial<Record<SituationKind, number>>;

/** Normalise des poids bruts pour que leur somme vaille exactement 1. */
function normalize(raw: Weights): Weights {
  const entries = Object.entries(raw) as [AttributeKey, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  const out: Weights = {};
  for (const [key, w] of entries) out[key] = w / total;
  return out;
}

/** Plafonds de création : attributs clés, secondaires, hors rôle ; les autres suivent le plafond par défaut. */
function caps(key: readonly AttributeKey[], secondary: readonly AttributeKey[], offRole: readonly AttributeKey[]): Weights {
  const tiers = BALANCE.creation.creationCapTiers;
  const out: Weights = {};
  for (const k of offRole) out[k] = tiers.offRole;
  for (const k of secondary) out[k] = tiers.secondary;
  for (const k of key) out[k] = tiers.key;
  return out;
}

function perMatch(p: Position): [number, number] {
  const [min, max] = BALANCE.situations.perMatchByPosition[p];
  return [min, max];
}

const GK_ATTRIBUTES = ATTRIBUTE_GROUPS.gardien;
/** Attributs de joueur de champ sans intérêt pour un gardien. */
const GK_OFF_ROLE: readonly AttributeKey[] = ['finition', 'tirLointain', 'centres', 'dribble', 'coupsFrancs', 'penalty', 'tete', 'agressivite'];

// ── Actions par défaut partagées ─────────────────────────────────────────

/** Situations hors ballon, communes à tous les postes. */
const OFF_BALL_DEFAULTS: Defaults = {
  provocation_adverse: ['calmer_le_jeu', 'attendre'],
  coequipier_en_difficulte: ['encourager'],
  consigne_du_banc: ['attendre'],
  tension_fin_de_match: ['calmer_le_jeu', 'temporiser'],
  blessure_ressentie: ['signaler_blessure', 'jouer_blesse'],
};

/** Coups de pied arrêtés, joueurs de champ. */
const SET_PIECE_DEFAULTS: Defaults = {
  penalty: ['penalty_placer', 'penalty_puissance', 'penalty_panenka'],
  coup_franc_direct: ['coup_franc_frappe', 'coup_franc_centre'],
  coup_franc_indirect: ['coup_franc_centre', 'coup_franc_passe'],
  corner_offensif: ['appel_premier_poteau', 'appel_deuxieme_poteau', 'tete'],
  corner_defensif: ['marquer', 'degager'],
};

/** Défauts génériques d'un joueur de champ, surchargés poste par poste. */
const OUTFIELD_DEFAULTS: Defaults = {
  ...OFF_BALL_DEFAULTS,
  ...SET_PIECE_DEFAULTS,
  duel_defensif: ['tacler', 'marquer'],
  couverture: ['couvrir', 'marquer'],
  pressing_declenche: ['presser'],
  relance_sous_pression: ['passe_courte', 'relancer_court'],
  contre_adverse: ['couvrir', 'faute_tactique'],
  faute_tactique_possible: ['faute_tactique', 'couvrir'],
  centre_a_venir: ['appel_premier_poteau', 'appel_deuxieme_poteau'],
  occasion_surface: ['frappe', 'frappe_premiere_intention'],
  face_a_face: ['frappe', 'dribble_gardien'],
  un_contre_un: ['dribble', 'passe_courte'],
  contre_attaque: ['accelerer', 'passe_profondeur'],
  reception_dos_au_but: ['remise', 'proteger_ballon'],
  frappe_lointaine_possible: ['frappe_lointaine', 'passe_courte'],
  derniere_passe: ['passe_profondeur', 'passe_courte'],
  appel_a_faire: ['appel_profondeur', 'decrocher'],
};

const GK_DEFAULTS: Defaults = {
  ...OFF_BALL_DEFAULTS,
  gardien_face_a_face: ['gb_rester_ligne', 'gb_sortir'],
  gardien_sortie_aerienne: ['gb_sortie_aerienne', 'gb_rester_ligne'],
  gardien_relance: ['gb_relance_courte', 'gb_degagement_long'],
  gardien_penalty: ['gb_plonger_gauche', 'gb_plonger_droite', 'gb_rester_centre'],
  corner_defensif: ['gb_rester_ligne', 'gb_sortie_aerienne'],
};

/** Poids hors ballon, faibles et identiques partout. */
const OFF_BALL_MIX: Mix = {
  provocation_adverse: 1, coequipier_en_difficulte: 1, consigne_du_banc: 1,
  tension_fin_de_match: 1, blessure_ressentie: 0.5,
};

// ── Profils ──────────────────────────────────────────────────────────────

const GB: PositionProfile = {
  position: 'GB',
  label: POSITION_LABELS.GB,
  weights: normalize({
    reflexes: 18, plongeon: 15, unContreUn: 13, sortiesAeriennes: 12, jeuAuPied: 9, placement: 10,
    sangFroid: 6, resistancePression: 5, detente: 4, passeLongue: 3, passeCourte: 3, leadership: 2,
  }),
  keyAttributes: ['reflexes', 'plongeon', 'unContreUn', 'sortiesAeriennes', 'jeuAuPied', 'placement'],
  situationsPerMatch: perMatch('GB'),
  situationMix: {
    gardien_relance: 30, gardien_face_a_face: 22, gardien_sortie_aerienne: 22, corner_defensif: 8,
    gardien_penalty: 4, ...OFF_BALL_MIX, consigne_du_banc: 3, coequipier_en_difficulte: 3,
  },
  defaultActions: GK_DEFAULTS,
  creationCaps: caps(
    ['reflexes', 'plongeon', 'unContreUn', 'sortiesAeriennes', 'jeuAuPied', 'placement'],
    ['sangFroid', 'resistancePression', 'detente', 'passeLongue', 'passeCourte'],
    GK_OFF_ROLE,
  ),
  outOfPositionMalus: 0.5,
};

const DC: PositionProfile = {
  position: 'DC',
  label: POSITION_LABELS.DC,
  weights: normalize({
    placement: 14, travailDefensif: 12, tete: 12, force: 11, sangFroid: 6, passeCourte: 6, vitesse: 6, detente: 6,
    agressivite: 5, passeLongue: 4, acceleration: 3, equilibre: 3, leadership: 3, determination: 3,
    resistancePression: 3, controle: 3,
  }),
  keyAttributes: ['placement', 'travailDefensif', 'tete', 'force', 'vitesse', 'passeCourte'],
  situationsPerMatch: perMatch('DC'),
  situationMix: {
    duel_defensif: 22, couverture: 18, corner_defensif: 12, relance_sous_pression: 12, contre_adverse: 10,
    faute_tactique_possible: 6, corner_offensif: 6, pressing_declenche: 3, ...OFF_BALL_MIX, tension_fin_de_match: 2,
  },
  defaultActions: {
    ...OUTFIELD_DEFAULTS,
    duel_defensif: ['tacler', 'marquer', 'bloquer'],
    corner_offensif: ['tete', 'appel_premier_poteau'],
    relance_sous_pression: ['degager', 'relancer_court', 'relancer_long'],
    contre_adverse: ['couvrir', 'faute_tactique', 'degager'],
  },
  creationCaps: caps(
    ['placement', 'travailDefensif', 'tete', 'force', 'vitesse', 'passeCourte'],
    ['sangFroid', 'detente', 'agressivite', 'passeLongue', 'leadership'],
    GK_ATTRIBUTES,
  ),
  outOfPositionMalus: 0.12,
};

/** Latéraux : même profil, côté différent. */
function fullBack(position: 'DD' | 'DG'): PositionProfile {
  return {
    position,
    label: POSITION_LABELS[position],
    weights: normalize({
      travailDefensif: 11, vitesse: 10, endurance: 10, centres: 10, acceleration: 9, placement: 9, passeCourte: 7,
      dribble: 6, controle: 5, force: 4, tete: 4, agilite: 4, agressivite: 3, equilibre: 3, determination: 3, sangFroid: 2,
    }),
    keyAttributes: ['vitesse', 'endurance', 'centres', 'travailDefensif', 'placement', 'dribble'],
    situationsPerMatch: perMatch(position),
    situationMix: {
      duel_defensif: 18, un_contre_un: 12, couverture: 10, contre_adverse: 10, relance_sous_pression: 10,
      derniere_passe: 8, contre_attaque: 8, corner_defensif: 6, pressing_declenche: 6, faute_tactique_possible: 5,
      appel_a_faire: 3, ...OFF_BALL_MIX,
    },
    defaultActions: {
      ...OUTFIELD_DEFAULTS,
      duel_defensif: ['marquer', 'tacler'],
      un_contre_un: ['dribble', 'centre', 'passe_courte'],
      derniere_passe: ['centre', 'centre_en_retrait', 'passe_courte'],
      contre_attaque: ['accelerer', 'centre'],
    },
    creationCaps: caps(
      ['vitesse', 'endurance', 'centres', 'travailDefensif', 'placement', 'dribble'],
      ['acceleration', 'passeCourte', 'controle', 'agilite', 'force'],
      GK_ATTRIBUTES,
    ),
    outOfPositionMalus: 0.1,
  };
}

const MDC: PositionProfile = {
  position: 'MDC',
  label: POSITION_LABELS.MDC,
  weights: normalize({
    travailDefensif: 14, placement: 13, passeCourte: 11, endurance: 9, force: 8, passeLongue: 7, agressivite: 6,
    vision: 6, controle: 6, sangFroid: 5, tete: 5, equilibre: 3, leadership: 3, determination: 2, resistancePression: 2,
  }),
  keyAttributes: ['travailDefensif', 'placement', 'passeCourte', 'endurance', 'force', 'vision'],
  situationsPerMatch: perMatch('MDC'),
  situationMix: {
    relance_sous_pression: 18, duel_defensif: 18, pressing_declenche: 14, couverture: 12, faute_tactique_possible: 8,
    contre_adverse: 8, corner_defensif: 6, derniere_passe: 5, frappe_lointaine_possible: 3, ...OFF_BALL_MIX,
    coequipier_en_difficulte: 2,
  },
  defaultActions: {
    ...OUTFIELD_DEFAULTS,
    duel_defensif: ['tacler', 'intercepter', 'faute_tactique'],
    relance_sous_pression: ['relancer_court', 'passe_longue', 'conserver'],
    couverture: ['couvrir', 'bloquer'],
  },
  creationCaps: caps(
    ['travailDefensif', 'placement', 'passeCourte', 'endurance', 'force', 'vision'],
    ['passeLongue', 'agressivite', 'controle', 'sangFroid', 'tete'],
    GK_ATTRIBUTES,
  ),
  outOfPositionMalus: 0.1,
};

const MC: PositionProfile = {
  position: 'MC',
  label: POSITION_LABELS.MC,
  weights: normalize({
    passeCourte: 14, vision: 12, controle: 10, endurance: 10, placement: 9, travailDefensif: 8, passeLongue: 7,
    dribble: 5, sangFroid: 5, tirLointain: 4, agilite: 3, force: 3, equilibre: 3, determination: 3,
    resistancePression: 2, leadership: 2,
  }),
  keyAttributes: ['passeCourte', 'vision', 'controle', 'endurance', 'placement', 'passeLongue'],
  situationsPerMatch: perMatch('MC'),
  situationMix: {
    derniere_passe: 16, relance_sous_pression: 16, pressing_declenche: 14, duel_defensif: 10,
    frappe_lointaine_possible: 7, couverture: 6, contre_attaque: 5, appel_a_faire: 5, occasion_surface: 4,
    coup_franc_indirect: 3, corner_defensif: 3, corner_offensif: 3, ...OFF_BALL_MIX, coequipier_en_difficulte: 2,
  },
  defaultActions: {
    ...OUTFIELD_DEFAULTS,
    derniere_passe: ['passe_profondeur', 'passe_courte', 'passe_longue'],
    relance_sous_pression: ['passe_courte', 'conserver', 'passe_longue'],
    duel_defensif: ['intercepter', 'tacler'],
  },
  creationCaps: caps(
    ['passeCourte', 'vision', 'controle', 'endurance', 'placement', 'passeLongue'],
    ['travailDefensif', 'dribble', 'sangFroid', 'tirLointain', 'agilite'],
    GK_ATTRIBUTES,
  ),
  outOfPositionMalus: 0.08,
};

const MOC: PositionProfile = {
  position: 'MOC',
  label: POSITION_LABELS.MOC,
  weights: normalize({
    vision: 14, passeCourte: 12, controle: 11, dribble: 11, finition: 7, tirLointain: 7, agilite: 6, acceleration: 6,
    sangFroid: 6, equilibre: 4, placement: 4, passeLongue: 3, coupsFrancs: 3, resistancePression: 3, endurance: 3,
  }),
  keyAttributes: ['vision', 'passeCourte', 'controle', 'dribble', 'finition', 'tirLointain'],
  situationsPerMatch: perMatch('MOC'),
  situationMix: {
    derniere_passe: 20, un_contre_un: 12, frappe_lointaine_possible: 10, occasion_surface: 8, reception_dos_au_but: 8,
    appel_a_faire: 8, contre_attaque: 8, pressing_declenche: 8, coup_franc_direct: 4, relance_sous_pression: 4,
    corner_offensif: 3, duel_defensif: 3, ...OFF_BALL_MIX,
  },
  defaultActions: {
    ...OUTFIELD_DEFAULTS,
    derniere_passe: ['passe_profondeur', 'une_deux', 'passe_courte'],
    un_contre_un: ['dribble', 'crochet', 'passe_courte'],
    frappe_lointaine_possible: ['frappe_lointaine', 'passe_courte'],
    reception_dos_au_but: ['remise', 'une_deux', 'proteger_ballon'],
  },
  creationCaps: caps(
    ['vision', 'passeCourte', 'controle', 'dribble', 'finition', 'tirLointain'],
    ['agilite', 'acceleration', 'sangFroid', 'equilibre', 'coupsFrancs'],
    GK_ATTRIBUTES,
  ),
  outOfPositionMalus: 0.1,
};

/** Ailiers : même profil, côté différent. */
function winger(position: 'AIG' | 'AID'): PositionProfile {
  return {
    position,
    label: POSITION_LABELS[position],
    weights: normalize({
      dribble: 14, vitesse: 13, acceleration: 13, centres: 10, agilite: 8, controle: 8, finition: 8, passeCourte: 5,
      equilibre: 4, vision: 4, sangFroid: 4, placement: 3, endurance: 3, travailDefensif: 3,
    }),
    keyAttributes: ['vitesse', 'acceleration', 'dribble', 'centres', 'finition', 'agilite'],
    situationsPerMatch: perMatch(position),
    situationMix: {
      un_contre_un: 20, contre_attaque: 12, derniere_passe: 12, appel_a_faire: 10, occasion_surface: 8,
      pressing_declenche: 8, centre_a_venir: 6, face_a_face: 5, frappe_lointaine_possible: 5, duel_defensif: 4,
      corner_offensif: 3, coup_franc_indirect: 2, ...OFF_BALL_MIX,
    },
    defaultActions: {
      ...OUTFIELD_DEFAULTS,
      un_contre_un: ['dribble', 'crochet', 'centre'],
      derniere_passe: ['centre', 'centre_en_retrait', 'passe_courte'],
      contre_attaque: ['accelerer', 'dribble', 'passe_profondeur'],
      centre_a_venir: ['appel_deuxieme_poteau', 'appel_premier_poteau'],
    },
    creationCaps: caps(
      ['vitesse', 'acceleration', 'dribble', 'centres', 'finition', 'agilite'],
      ['controle', 'passeCourte', 'equilibre', 'vision', 'sangFroid'],
      GK_ATTRIBUTES,
    ),
    outOfPositionMalus: 0.1,
  };
}

const BU: PositionProfile = {
  position: 'BU',
  label: POSITION_LABELS.BU,
  weights: normalize({
    finition: 20, placement: 12, sangFroid: 9, tete: 8, controle: 7, force: 6, vitesse: 6, acceleration: 6, dribble: 5,
    detente: 4, resistancePression: 4, equilibre: 3, passeCourte: 3, tirLointain: 2, determination: 2, penalty: 2, vision: 1,
  }),
  keyAttributes: ['finition', 'placement', 'sangFroid', 'tete', 'controle', 'acceleration'],
  situationsPerMatch: perMatch('BU'),
  situationMix: {
    occasion_surface: 18, appel_a_faire: 16, centre_a_venir: 14, reception_dos_au_but: 12, face_a_face: 10,
    contre_attaque: 6, un_contre_un: 5, corner_offensif: 5, pressing_declenche: 5, derniere_passe: 4,
    frappe_lointaine_possible: 2, ...OFF_BALL_MIX,
  },
  defaultActions: {
    ...OUTFIELD_DEFAULTS,
    reception_dos_au_but: ['remise', 'rester_en_pivot', 'proteger_ballon'],
    centre_a_venir: ['appel_premier_poteau', 'appel_deuxieme_poteau', 'tete'],
    appel_a_faire: ['appel_profondeur', 'decrocher', 'fixer_defenseur'],
    face_a_face: ['frappe', 'dribble_gardien', 'lob'],
    occasion_surface: ['frappe', 'frappe_premiere_intention', 'remise'],
  },
  creationCaps: caps(
    ['finition', 'placement', 'sangFroid', 'tete', 'controle', 'acceleration'],
    ['force', 'vitesse', 'dribble', 'detente', 'resistancePression', 'penalty'],
    GK_ATTRIBUTES,
  ),
  outOfPositionMalus: 0.12,
};

export const POSITION_PROFILES: Record<Position, PositionProfile> = {
  GB, DC, DD: fullBack('DD'), DG: fullBack('DG'), MDC, MC, MOC, AIG: winger('AIG'), AID: winger('AID'), BU,
};

/** Profil d'un poste. Lève si inconnu. */
export function positionProfile(p: Position): PositionProfile {
  const profile = POSITION_PROFILES[p];
  if (!profile) throw new Error(`Poste inconnu : ${String(p)}`);
  return profile;
}

// ── Compatibilité entre postes ───────────────────────────────────────────

/** Compatibilité 0-1 par paire (ordre indifférent). Paires absentes : `DEFAULT_COMPATIBILITY`. */
const COMPATIBILITY_PAIRS: readonly [Position, Position, number][] = [
  // Latéraux
  ['DD', 'DG', 0.8], ['DD', 'DC', 0.55], ['DG', 'DC', 0.55], ['DD', 'AID', 0.55], ['DG', 'AIG', 0.55],
  ['DD', 'AIG', 0.3], ['DG', 'AID', 0.3], ['DD', 'MDC', 0.4], ['DG', 'MDC', 0.4], ['DD', 'MC', 0.35], ['DG', 'MC', 0.35],
  ['DD', 'MOC', 0.2], ['DG', 'MOC', 0.2], ['DD', 'BU', 0.15], ['DG', 'BU', 0.15],
  // Central
  ['DC', 'MDC', 0.65], ['DC', 'MC', 0.35], ['DC', 'BU', 0.25], ['DC', 'MOC', 0.15], ['DC', 'AIG', 0.15], ['DC', 'AID', 0.15],
  // Milieux
  ['MDC', 'MC', 0.85], ['MDC', 'MOC', 0.45], ['MDC', 'AIG', 0.3], ['MDC', 'AID', 0.3], ['MDC', 'BU', 0.2],
  ['MC', 'MOC', 0.75], ['MC', 'AIG', 0.5], ['MC', 'AID', 0.5], ['MC', 'BU', 0.35],
  ['MOC', 'AIG', 0.75], ['MOC', 'AID', 0.75], ['MOC', 'BU', 0.65],
  // Attaquants
  ['AIG', 'AID', 0.9], ['AIG', 'BU', 0.65], ['AID', 'BU', 0.65],
];

/** Un gardien n'est jamais un joueur de champ, et inversement. */
const GK_COMPATIBILITY = 0.05;
const DEFAULT_COMPATIBILITY = 0.1;

const COMPATIBILITY: Record<string, number> = {};
for (const [a, b, v] of COMPATIBILITY_PAIRS) {
  COMPATIBILITY[`${a}|${b}`] = v;
  COMPATIBILITY[`${b}|${a}`] = v;
}

/** Compatibilité 0-1 entre deux postes (DD→DG 0.8, BU→GB 0.05). Symétrique, 1 pour un même poste. */
export function positionCompatibility(a: Position, b: Position): number {
  if (a === b) return 1;
  if (a === 'GB' || b === 'GB') return GK_COMPATIBILITY;
  return COMPATIBILITY[`${a}|${b}`] ?? DEFAULT_COMPATIBILITY;
}

/** Postes triés par compatibilité décroissante avec `p` (lui-même exclu). */
export function compatiblePositions(p: Position): Position[] {
  return POSITIONS.filter((q) => q !== p).sort((x, y) => positionCompatibility(p, y) - positionCompatibility(p, x));
}
