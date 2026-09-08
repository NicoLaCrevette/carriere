/**
 * Table des actions par type de situation : pour chaque paire
 * (SituationKind, MatchActionId) autorisée, la clé de probabilité de base
 * (BALANCE.baseProbability / caps), les attributs qui pèsent, l'adversaire
 * direct, la nature de l'action (tir, passe, dribble…), les issues et
 * l'enchaînement éventuel. Toute paire absente est « impossible » et se
 * résout avec la probabilité résiduelle (§6.2).
 */
import type { AttributeKey, MatchActionId, OutcomeKind, Situation, SituationKind } from '../types';
import { BALANCE } from '../config/balance';

export type BaseKey = keyof typeof BALANCE.baseProbability;
export type TeammateFinishKey = keyof typeof BALANCE.resolution.teammateConversion;
export type AttrWeights = Partial<Record<AttributeKey, number>>;

export type ActionNature =
  | 'tir' | 'passe' | 'dribble' | 'conservation' | 'appel' | 'duel' | 'faute_tactique' | 'relance'
  | 'gardien' | 'gardien_penalty' | 'comportement' | 'neutre' | 'blessure';

export interface ActionSpec {
  /** Clé de probabilité de base, éventuellement choisie selon la situation (distance, défenseur). */
  base: BaseKey | ((s: Situation) => BaseKey);
  attrs: AttrWeights;
  opponent: 'gardien' | 'defenseur' | 'aucun';
  nature: ActionNature;
  /** Action avec ballon : subit le marquage individuel. */
  withBall: boolean;
  /** Action de finition : subit la traversée du désert. */
  finishing?: boolean;
  success: OutcomeKind;
  failure: OutcomeKind;
  followUp?: SituationKind;
  teammateFinish?: TeammateFinishKey;
  /** Multiplicateur propre à la paire (jamais > 1). */
  multiplier?: number;
  /** Libellé français court. */
  label: string;
}

// ── Poids d'attributs ────────────────────────────────────────────────────
const FINISH: AttrWeights = { finition: 3, sangFroid: 2, controle: 1 };
const HEADER: AttrWeights = { tete: 3, detente: 2, placement: 1 };
const LONGSHOT: AttrWeights = { tirLointain: 3, finition: 1, sangFroid: 1 };
const LOB: AttrWeights = { finition: 2, vision: 1, sangFroid: 2 };
const DRIBBLE: AttrWeights = { dribble: 3, agilite: 2, acceleration: 1, equilibre: 1 };
const PACE: AttrWeights = { vitesse: 3, acceleration: 2, controle: 1 };
const SHORTPASS: AttrWeights = { passeCourte: 3, vision: 1, controle: 1 };
const THROUGH: AttrWeights = { vision: 3, passeCourte: 2, passeLongue: 1 };
const LONGPASS: AttrWeights = { passeLongue: 3, vision: 1 };
const CROSS: AttrWeights = { centres: 3, vision: 1 };
const HOLD: AttrWeights = { force: 2, controle: 2, equilibre: 2 };
const RUN: AttrWeights = { placement: 2, acceleration: 2, vitesse: 1, vision: 1 };
const TACKLE: AttrWeights = { travailDefensif: 3, agressivite: 1, force: 1 };
const MARK: AttrWeights = { placement: 3, travailDefensif: 2, force: 1 };
const INTERCEPT: AttrWeights = { placement: 2, vision: 1, travailDefensif: 2 };
const AERIAL: AttrWeights = { tete: 3, detente: 2, force: 1 };
const PRESS: AttrWeights = { travailDefensif: 2, endurance: 1, acceleration: 1, agressivite: 1 };
const CLEAR: AttrWeights = { tete: 1, force: 1, placement: 1, sangFroid: 1 };
const BUILDUP: AttrWeights = { passeCourte: 3, sangFroid: 2, controle: 1 };
const BLOCK: AttrWeights = { placement: 2, travailDefensif: 2, determination: 1 };
const GK_1V1: AttrWeights = { unContreUn: 3, reflexes: 1, placement: 1 };
const GK_AIR: AttrWeights = { sortiesAeriennes: 3, detente: 1, sangFroid: 1 };
const GK_FEET: AttrWeights = { jeuAuPied: 3, passeCourte: 1, sangFroid: 1 };
const GK_KICK: AttrWeights = { jeuAuPied: 2, passeLongue: 2 };
const GK_PEN: AttrWeights = { plongeon: 2, reflexes: 2, sangFroid: 1 };
const GK_SHOT: AttrWeights = { reflexes: 3, plongeon: 2, placement: 1 };
const CALM: AttrWeights = { sangFroid: 3, leadership: 1, resistancePression: 1 };
const PROVOKE: AttrWeights = { agressivite: 2, sangFroid: 1 };
const LEAD: AttrWeights = { leadership: 3, determination: 1 };
const FREEKICK: AttrWeights = { coupsFrancs: 3, tirLointain: 1, sangFroid: 1 };
const PENALTY: AttrWeights = { penalty: 3, sangFroid: 2, resistancePression: 1 };
const SETCROSS: AttrWeights = { coupsFrancs: 2, centres: 2 };
const DIVE: AttrWeights = { dribble: 1, agilite: 1 };
const GRIT: AttrWeights = { determination: 2, force: 1 };

// ── Sélecteurs de base dépendant de la situation ─────────────────────────
const box = BALANCE.resolution.boxMeters;

/** Frappe : filet vide, reprise dans la surface ou frappe hors surface selon la distance. */
function shotBase(s: Situation): BaseKey {
  if (s.facts.filetVide === true) return 'butVideDeuxMetres';
  return s.context.distanceM <= box ? 'repriseSurface' : 'frappeHorsSurface';
}

/**
 * Dribble : plafond « haut niveau » face à un défenseur coté, quel que soit le
 * geste employé (§6.3). Sans cela, écrire « crochet » plutôt que « je dribble »
 * suffirait à échapper au plafond en affrontant le même défenseur.
 */
function dribbleBaseOr(standard: BaseKey): (s: Situation) => BaseKey {
  return (s) => (s.context.defenderQuality >= BALANCE.resolution.highLevelDefenderFrom ? 'dribbleHautNiveau' : standard);
}

const dribbleBase = dribbleBaseOr('dribbleStandard');

/** Duel défensif : aérien ou au sol. */
function duelBase(s: Situation): BaseKey {
  return s.facts.aerien === true ? 'duelAerien' : 'duelDefensif';
}

// ── Briques réutilisables ────────────────────────────────────────────────
type Specs = Partial<Record<MatchActionId, ActionSpec>>;

const shot = (base: ActionSpec['base'], attrs: AttrWeights, label: string, extra: Partial<ActionSpec> = {}): ActionSpec => ({
  base, attrs, opponent: 'gardien', nature: 'tir', withBall: true, finishing: true, success: 'but', failure: 'hors_cadre', label, ...extra,
});
const pass = (base: BaseKey, attrs: AttrWeights, label: string, teammateFinish?: TeammateFinishKey, extra: Partial<ActionSpec> = {}): ActionSpec => ({
  base, attrs, opponent: 'defenseur', nature: 'passe', withBall: true, success: 'passe_reussie', failure: 'passe_ratee', label, teammateFinish, ...extra,
});
const dribble = (base: ActionSpec['base'], attrs: AttrWeights, label: string, followUp: SituationKind): ActionSpec => ({
  base, attrs, opponent: 'defenseur', nature: 'dribble', withBall: true, success: 'dribble_reussi', failure: 'dribble_rate', followUp, label,
});
const hold = (attrs: AttrWeights, label: string, followUp?: SituationKind): ActionSpec => ({
  base: 'conserverBallon', attrs, opponent: 'defenseur', nature: 'conservation', withBall: true, success: 'ballon_conserve', failure: 'ballon_perdu', followUp, label,
});
const run = (attrs: AttrWeights, label: string, followUp: SituationKind, base: BaseKey = 'appelReussi'): ActionSpec => ({
  base, attrs, opponent: 'defenseur', nature: 'appel', withBall: false, success: 'occasion_creee', failure: 'rien', followUp, label,
});
const duel = (base: ActionSpec['base'], attrs: AttrWeights, success: OutcomeKind, label: string, followUp?: SituationKind): ActionSpec => ({
  base, attrs, opponent: 'defenseur', nature: 'duel', withBall: false, success, failure: 'duel_perdu', label, followUp,
});
const behaviour = (base: BaseKey, attrs: AttrWeights, success: OutcomeKind, failure: OutcomeKind, label: string): ActionSpec => ({
  base, attrs, opponent: 'aucun', nature: 'comportement', withBall: false, success, failure, label,
});
const neutral = (attrs: AttrWeights, label: string): ActionSpec => ({
  base: 'conserverBallon', attrs, opponent: 'aucun', nature: 'neutre', withBall: false, success: 'rien', failure: 'rien', label,
});

const SIMULER = behaviour('simulerSansSanction', DIVE, 'faute_subie', 'simulation_sanctionnee', 'simulation');
const PROTESTER = behaviour('protesterSansCarton', CALM, 'rien', 'protestation_jaune', 'protestation');
const PROVOQUER = behaviour('provoquerSansCarton', PROVOKE, 'rien', 'carton_jaune', 'provocation');
const CALMER = neutral(CALM, 'calme le jeu');
const ATTENDRE = neutral({ placement: 1, sangFroid: 1 }, 'attend');
const ENCOURAGER = neutral(LEAD, 'encourage');
const TEMPORISER = hold({ sangFroid: 2, controle: 2, passeCourte: 1 }, 'temporise');
const TACLER = duel('tacle', TACKLE, 'tacle_reussi', 'tacle');
const MARQUER = duel(duelBase, MARK, 'duel_gagne', 'marquage');
const INTERCEPTER = duel('interception', INTERCEPT, 'interception', 'interception');
const COUVRIR = duel('couverture', MARK, 'duel_gagne', 'couverture');
const BLOQUER = duel('bloquer', BLOCK, 'duel_gagne', 'bloc');
const DEGAGER = duel('degagement', CLEAR, 'degagement', 'dégagement');
const PRESSER: ActionSpec = { ...duel('pressing', PRESS, 'duel_gagne', 'pressing'), followUp: 'contre_attaque' };
const FAUTE_TACTIQUE: ActionSpec = {
  base: 'fauteTactiqueSansCarton', attrs: { agressivite: 1, sangFroid: 2, placement: 1 }, opponent: 'aucun', nature: 'faute_tactique',
  withBall: false, success: 'faute_commise', failure: 'carton_jaune', label: 'faute tactique',
};

const FRAPPE = shot(shotBase, FINISH, 'frappe');
const FRAPPE_PI = shot(shotBase, { finition: 3, sangFroid: 1, controle: 1, equilibre: 1 }, 'frappe en première intention', { base: (s) => (s.facts.filetVide === true ? 'butVideDeuxMetres' : s.context.distanceM <= box ? 'frappePremiereIntention' : 'frappeHorsSurface') });
const TETE = shot('teteSurCentre', HEADER, 'tête', { opponent: 'gardien' });
const LOB_SHOT = shot('lob', LOB, 'lob');
const FRAPPE_LOINTAINE = shot('frappeHorsSurface', LONGSHOT, 'frappe lointaine');

const PASSE_COURTE = pass('passeCourte', SHORTPASS, 'passe courte');
const PASSE_PROFONDEUR = pass('passeProfondeur', THROUGH, 'passe en profondeur', 'profondeur');
const PASSE_LONGUE = pass('passeLongue', LONGPASS, 'passe longue');
const CENTRE = pass('centre', CROSS, 'centre', 'centre');
const CENTRE_RETRAIT = pass('centreEnRetrait', { centres: 2, vision: 2, passeCourte: 1 }, 'centre en retrait', 'centreEnRetrait');
const UNE_DEUX = pass('uneDeux', { passeCourte: 2, vision: 1, acceleration: 2 }, 'une-deux', undefined, { followUp: 'occasion_surface' });
const REMISE = pass('remise', { controle: 2, passeCourte: 2, force: 1 }, 'remise', 'remise');
const DRIBBLE_STD = dribble(dribbleBase, DRIBBLE, 'dribble', 'occasion_surface');
const CROCHET = dribble(dribbleBaseOr('crochet'), { dribble: 2, agilite: 2, equilibre: 1 }, 'crochet', 'occasion_surface');
const ACCELERER = dribble(dribbleBaseOr('dribbleStandard'), PACE, 'accélération', 'face_a_face');
const CONSERVER = hold(HOLD, 'conservation');
const PROTEGER = hold(HOLD, 'protection du ballon');

const OFF_BALL: Specs = { calmer_le_jeu: CALMER, attendre: ATTENDRE, encourager: ENCOURAGER, provoquer: PROVOQUER, protester: PROTESTER };

// ── La table ─────────────────────────────────────────────────────────────
export const ACTION_TABLE: Record<SituationKind, Specs> = {
  centre_a_venir: {
    appel_premier_poteau: run({ placement: 3, acceleration: 2, tete: 1 }, 'appel au premier poteau', 'occasion_surface'),
    appel_deuxieme_poteau: run({ placement: 3, detente: 1, tete: 2 }, 'appel au deuxième poteau', 'occasion_surface'),
    tete: TETE,
    decrocher: hold({ vision: 2, placement: 2, controle: 1 }, 'décrochage', 'derniere_passe'),
    rester_en_pivot: hold(HOLD, 'pivot'),
    attendre: ATTENDRE,
    simuler: SIMULER,
  },
  occasion_surface: {
    frappe: FRAPPE, frappe_premiere_intention: FRAPPE_PI, tete: TETE, lob: LOB_SHOT,
    remise: REMISE, passe_courte: pass('passeCourte', SHORTPASS, 'passe courte', 'passeCourte'),
    centre_en_retrait: CENTRE_RETRAIT, dribble: DRIBBLE_STD, crochet: CROCHET,
    temporiser: TEMPORISER, simuler: SIMULER, protester: PROTESTER,
  },
  face_a_face: {
    frappe: shot('faceAFace', FINISH, 'frappe en face-à-face'),
    frappe_premiere_intention: shot('faceAFace', { finition: 3, sangFroid: 1, equilibre: 1 }, 'frappe instantanée'),
    lob: LOB_SHOT,
    dribble_gardien: dribble('dribbleGardien', { dribble: 3, sangFroid: 2, agilite: 1 }, 'dribble du gardien', 'occasion_surface'),
    passe_courte: pass('passeCourte', SHORTPASS, 'passe en retrait', 'faceAFace'),
    temporiser: TEMPORISER, simuler: SIMULER,
  },
  un_contre_un: {
    dribble: DRIBBLE_STD, crochet: CROCHET, accelerer: ACCELERER,
    passe_courte: PASSE_COURTE, centre: CENTRE, passe_profondeur: PASSE_PROFONDEUR, une_deux: UNE_DEUX,
    frappe: FRAPPE, conserver: CONSERVER, temporiser: TEMPORISER, simuler: SIMULER,
  },
  contre_attaque: {
    accelerer: ACCELERER, dribble: DRIBBLE_STD, passe_profondeur: PASSE_PROFONDEUR, passe_courte: PASSE_COURTE,
    frappe: shot('contreAttaqueFinition', FINISH, 'frappe en contre'),
    temporiser: TEMPORISER, centre: CENTRE,
  },
  reception_dos_au_but: {
    remise: REMISE, rester_en_pivot: hold(HOLD, 'pivot'), proteger_ballon: PROTEGER,
    une_deux: UNE_DEUX, crochet: CROCHET, dribble: DRIBBLE_STD,
    frappe: shot(shotBase, { finition: 2, sangFroid: 1, agilite: 2 }, 'frappe en pivot'),
    passe_courte: PASSE_COURTE, simuler: SIMULER,
  },
  frappe_lointaine_possible: {
    frappe_lointaine: FRAPPE_LOINTAINE, frappe: FRAPPE_LOINTAINE,
    passe_courte: PASSE_COURTE, passe_profondeur: PASSE_PROFONDEUR, dribble: DRIBBLE_STD, conserver: CONSERVER, accelerer: ACCELERER,
  },
  penalty: {
    penalty_placer: shot('penalty', PENALTY, 'penalty placé', { opponent: 'gardien', multiplier: BALANCE.resolution.penaltyStyle.placer }),
    penalty_puissance: shot('penalty', { penalty: 3, force: 1, sangFroid: 1 }, 'penalty en force', { multiplier: BALANCE.resolution.penaltyStyle.puissance }),
    penalty_panenka: shot('penalty', { penalty: 2, sangFroid: 3 }, 'panenka', { multiplier: BALANCE.resolution.penaltyStyle.panenka }),
  },
  coup_franc_direct: {
    coup_franc_frappe: shot('coupFrancDirect', FREEKICK, 'coup franc direct'),
    coup_franc_centre: pass('coupFrancCentre', SETCROSS, 'coup franc centré', 'centre'),
    coup_franc_passe: pass('passeCourte', SHORTPASS, 'coup franc joué court'),
  },
  coup_franc_indirect: {
    coup_franc_centre: pass('coupFrancCentre', SETCROSS, 'coup franc centré', 'centre'),
    coup_franc_passe: pass('passeCourte', SHORTPASS, 'coup franc joué court'),
    coup_franc_frappe: shot('coupFrancDirect', FREEKICK, 'coup franc frappé de loin'),
  },
  corner_offensif: {
    appel_premier_poteau: run({ placement: 3, tete: 2, detente: 1 }, 'appel au premier poteau', 'occasion_surface', 'cornerOccasion'),
    appel_deuxieme_poteau: run({ placement: 3, tete: 2, detente: 1 }, 'appel au deuxième poteau', 'occasion_surface', 'cornerOccasion'),
    tete: TETE,
    corner_rentrant: pass('cornerOccasion', SETCROSS, 'corner rentrant', 'centre'),
    corner_sortant: pass('cornerOccasion', SETCROSS, 'corner sortant', 'centre'),
    corner_court: pass('passeCourte', SHORTPASS, 'corner joué court'),
    attendre: ATTENDRE,
  },
  derniere_passe: {
    passe_profondeur: PASSE_PROFONDEUR, passe_courte: pass('passeCourte', SHORTPASS, 'passe courte', 'passeCourte'),
    centre: CENTRE, centre_en_retrait: CENTRE_RETRAIT, une_deux: UNE_DEUX, passe_longue: PASSE_LONGUE,
    frappe: FRAPPE, dribble: DRIBBLE_STD, conserver: CONSERVER, temporiser: TEMPORISER,
  },
  appel_a_faire: {
    appel_profondeur: run(RUN, 'appel en profondeur', 'face_a_face'),
    decrocher: hold({ vision: 2, placement: 2, controle: 1 }, 'décrochage', 'derniere_passe'),
    fixer_defenseur: pass('conserverBallon', { placement: 2, vision: 1, force: 1 }, 'fixation du défenseur', 'fixation'),
    rester_en_pivot: hold(HOLD, 'pivot'),
    appel_premier_poteau: run({ placement: 3, acceleration: 2 }, 'appel au premier poteau', 'occasion_surface'),
    appel_deuxieme_poteau: run({ placement: 3, detente: 1, tete: 1 }, 'appel au deuxième poteau', 'occasion_surface'),
    attendre: ATTENDRE,
  },
  duel_defensif: {
    tacler: TACLER, marquer: MARQUER, intercepter: INTERCEPTER, bloquer: BLOQUER,
    faute_tactique: FAUTE_TACTIQUE, presser: PRESSER, couvrir: COUVRIR, tete: duel('duelAerien', AERIAL, 'duel_gagne', 'duel de la tête'),
  },
  couverture: { couvrir: COUVRIR, marquer: MARQUER, bloquer: BLOQUER, tacler: TACLER, degager: DEGAGER, intercepter: INTERCEPTER },
  pressing_declenche: { presser: PRESSER, tacler: TACLER, intercepter: INTERCEPTER, couvrir: COUVRIR, attendre: ATTENDRE },
  corner_defensif: {
    marquer: duel('duelAerien', AERIAL, 'duel_gagne', 'marquage aérien'), degager: DEGAGER,
    tete: duel('duelAerien', AERIAL, 'degagement', 'dégagement de la tête'), bloquer: BLOQUER,
    gb_rester_ligne: { base: 'gbArretFrappe', attrs: GK_SHOT, opponent: 'defenseur', nature: 'gardien', withBall: false, success: 'gb_arret', failure: 'gb_but_encaisse', label: 'reste sur sa ligne' },
    gb_sortie_aerienne: { base: 'gbSortieAerienne', attrs: GK_AIR, opponent: 'defenseur', nature: 'gardien', withBall: false, success: 'gb_sortie_reussie', failure: 'gb_sortie_ratee', label: 'sortie aérienne' },
  },
  relance_sous_pression: {
    passe_courte: { ...pass('passeCourte', BUILDUP, 'passe courte'), nature: 'relance' },
    relancer_court: { ...pass('relanceCourte', BUILDUP, 'relance courte'), nature: 'relance' },
    relancer_long: { ...pass('relanceLongue', LONGPASS, 'relance longue'), nature: 'relance' },
    passe_longue: { ...pass('passeLongue', LONGPASS, 'passe longue'), nature: 'relance' },
    degager: { base: 'degagement', attrs: CLEAR, opponent: 'aucun', nature: 'relance', withBall: true, success: 'degagement', failure: 'ballon_perdu', label: 'dégagement' },
    conserver: { ...CONSERVER, nature: 'relance' },
    proteger_ballon: { ...PROTEGER, nature: 'relance' },
    dribble: { ...dribble(dribbleBase, DRIBBLE, 'dribble dans son camp', 'derniere_passe'), nature: 'relance', success: 'dribble_reussi', failure: 'ballon_perdu' },
  },
  contre_adverse: {
    couvrir: COUVRIR, faute_tactique: FAUTE_TACTIQUE, tacler: TACLER, degager: DEGAGER, presser: PRESSER, marquer: MARQUER, intercepter: INTERCEPTER,
  },
  faute_tactique_possible: { faute_tactique: FAUTE_TACTIQUE, couvrir: COUVRIR, tacler: TACLER, attendre: ATTENDRE },
  gardien_face_a_face: {
    gb_rester_ligne: { base: 'gbArretFaceAFace', attrs: { unContreUn: 2, reflexes: 2, placement: 1 }, opponent: 'defenseur', nature: 'gardien', withBall: false, success: 'gb_arret', failure: 'gb_but_encaisse', label: 'reste debout' },
    gb_sortir: { base: 'gbArretFaceAFace', attrs: GK_1V1, opponent: 'defenseur', nature: 'gardien', withBall: false, success: 'gb_arret', failure: 'gb_but_encaisse', label: 'sortie dans les pieds' },
  },
  gardien_sortie_aerienne: {
    gb_sortie_aerienne: { base: 'gbSortieAerienne', attrs: GK_AIR, opponent: 'defenseur', nature: 'gardien', withBall: false, success: 'gb_sortie_reussie', failure: 'gb_sortie_ratee', label: 'sortie aérienne' },
    gb_rester_ligne: { base: 'gbArretFrappe', attrs: GK_SHOT, opponent: 'defenseur', nature: 'gardien', withBall: false, success: 'gb_arret', failure: 'gb_but_encaisse', label: 'reste sur sa ligne' },
  },
  gardien_relance: {
    gb_relance_courte: { base: 'gbRelanceCourte', attrs: GK_FEET, opponent: 'defenseur', nature: 'gardien', withBall: true, success: 'passe_reussie', failure: 'ballon_perdu', label: 'relance courte' },
    gb_degagement_long: { base: 'gbDegagementLong', attrs: GK_KICK, opponent: 'aucun', nature: 'gardien', withBall: true, success: 'passe_reussie', failure: 'ballon_perdu', label: 'dégagement long' },
  },
  gardien_penalty: {
    gb_plonger_gauche: { base: 'gbArretPenalty', attrs: GK_PEN, opponent: 'defenseur', nature: 'gardien_penalty', withBall: false, success: 'gb_arret', failure: 'gb_but_encaisse', label: 'plonge à gauche' },
    gb_plonger_droite: { base: 'gbArretPenalty', attrs: GK_PEN, opponent: 'defenseur', nature: 'gardien_penalty', withBall: false, success: 'gb_arret', failure: 'gb_but_encaisse', label: 'plonge à droite' },
    gb_rester_centre: { base: 'gbArretPenalty', attrs: { reflexes: 2, sangFroid: 3 }, opponent: 'defenseur', nature: 'gardien_penalty', withBall: false, success: 'gb_arret', failure: 'gb_but_encaisse', label: 'reste au centre' },
  },
  provocation_adverse: { ...OFF_BALL },
  coequipier_en_difficulte: { encourager: ENCOURAGER, attendre: ATTENDRE, calmer_le_jeu: CALMER },
  consigne_du_banc: { attendre: neutral({ travailDefensif: 1, placement: 1 }, 'applique la consigne'), protester: neutral({ leadership: 1 }, 'discute la consigne'), demander_changement: neutral({ determination: 1 }, 'demande le changement') },
  tension_fin_de_match: { ...OFF_BALL, temporiser: TEMPORISER },
  blessure_ressentie: {
    signaler_blessure: { base: 'conserverBallon', attrs: GRIT, opponent: 'aucun', nature: 'blessure', withBall: false, success: 'blessure', failure: 'blessure', label: 'signale la blessure' },
    jouer_blesse: { base: 'conserverBallon', attrs: GRIT, opponent: 'aucun', nature: 'neutre', withBall: false, success: 'rien', failure: 'rien', label: 'serre les dents' },
    demander_changement: { base: 'conserverBallon', attrs: GRIT, opponent: 'aucun', nature: 'blessure', withBall: false, success: 'blessure', failure: 'blessure', label: 'demande le changement' },
  },
};

/** Spécification d'une paire, ou undefined si l'action n'a pas de sens dans cette situation. */
export function actionSpec(kind: SituationKind, action: MatchActionId): ActionSpec | undefined {
  return ACTION_TABLE[kind][action];
}

/** Clé de base effective d'une spécification pour une situation. */
export function baseKeyOf(spec: ActionSpec, situation: Situation): BaseKey {
  return typeof spec.base === 'function' ? spec.base(situation) : spec.base;
}

/** Actions autorisées dans une situation, selon ses faits (tireur de corner, gardien…). */
export function allowedActionsFor(kind: SituationKind, facts: Record<string, string | number | boolean>, isGoalkeeper: boolean): MatchActionId[] {
  const all = Object.keys(ACTION_TABLE[kind]) as MatchActionId[];
  return all.filter((a) => {
    if (kind === 'corner_offensif') {
      const taker = facts.tireur === true;
      if (a.startsWith('corner_')) return taker;
      if (a === 'tete' || a.startsWith('appel_')) return !taker;
    }
    if (a.startsWith('gb_')) return isGoalkeeper;
    if (kind === 'corner_defensif' && isGoalkeeper) return a.startsWith('gb_');
    return true;
  });
}

/** Actions de tir, gardées telles quelles même hors contexte (frappe absurde → probabilité résiduelle). */
export const SHOT_ACTIONS: readonly MatchActionId[] = ['frappe', 'frappe_premiere_intention', 'frappe_lointaine', 'tete', 'lob'];

/** Familles d'actions, pour rapprocher une action non autorisée de l'action par défaut la plus proche. */
export const ACTION_FAMILIES: readonly (readonly MatchActionId[])[] = [
  ['frappe', 'frappe_premiere_intention', 'frappe_lointaine', 'tete', 'lob', 'penalty_placer', 'penalty_puissance', 'penalty_panenka', 'coup_franc_frappe'],
  ['dribble', 'dribble_gardien', 'crochet', 'accelerer'],
  ['passe_courte', 'passe_profondeur', 'passe_longue', 'une_deux', 'remise', 'centre', 'centre_en_retrait', 'coup_franc_centre', 'coup_franc_passe', 'corner_rentrant', 'corner_sortant', 'corner_court', 'relancer_court', 'relancer_long', 'gb_relance_courte', 'gb_degagement_long'],
  ['conserver', 'proteger_ballon', 'temporiser', 'rester_en_pivot', 'calmer_le_jeu', 'attendre'],
  ['appel_premier_poteau', 'appel_deuxieme_poteau', 'appel_profondeur', 'decrocher', 'fixer_defenseur'],
  ['tacler', 'intercepter', 'marquer', 'couvrir', 'bloquer', 'degager', 'presser', 'faute_tactique'],
  ['gb_rester_ligne', 'gb_sortir', 'gb_sortie_aerienne', 'gb_plonger_gauche', 'gb_plonger_droite', 'gb_rester_centre'],
  ['simuler', 'protester', 'provoquer', 'encourager', 'demander_changement', 'jouer_blesse', 'signaler_blessure'],
];
