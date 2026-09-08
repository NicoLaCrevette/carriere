/**
 * Définitions courtes des actions canoniques, injectées dans le prompt du
 * classificateur (§6.1). Une ligne par action, en français.
 */
import type { MatchActionId } from '../../engine/types';
import { MATCH_ACTIONS } from '../../engine/types';

export const ACTION_DEFINITIONS: Record<MatchActionId, string> = {
  appel_premier_poteau: 'appel au premier poteau pour couper un centre',
  appel_deuxieme_poteau: 'appel au deuxième poteau',
  appel_profondeur: 'course dans la profondeur, dans le dos de la défense',
  decrocher: 'décrocher vers le ballon, venir le chercher plus bas',
  rester_en_pivot: 'rester dos au but en point d\'appui',
  fixer_defenseur: 'fixer un défenseur pour libérer un coéquipier',
  attendre: 'ne rien tenter, attendre, appliquer la consigne',
  frappe: 'frapper au but (contrôle puis tir)',
  frappe_premiere_intention: 'frapper en première intention, sans contrôle, reprise de volée',
  frappe_lointaine: 'frapper de loin, hors de la surface',
  tete: 'tête au but ou tête défensive',
  lob: 'lober le gardien',
  dribble: 'dribbler un défenseur, l\'éliminer',
  dribble_gardien: 'dribbler le gardien',
  crochet: 'crochet, feinte pour se créer l\'espace',
  remise: 'remise en une touche pour un coéquipier',
  une_deux: 'une-deux avec un coéquipier',
  passe_courte: 'passe courte, jeu simple',
  passe_profondeur: 'passe en profondeur, dans la course',
  passe_longue: 'passe longue, renversement de jeu',
  centre: 'centrer vers la surface',
  centre_en_retrait: 'centre en retrait vers l\'entrée de la surface',
  conserver: 'conserver le ballon sans risque',
  proteger_ballon: 'protéger le ballon avec le corps',
  temporiser: 'temporiser, ralentir le jeu',
  accelerer: 'accélérer balle au pied, prendre de vitesse',
  penalty_placer: 'penalty placé',
  penalty_puissance: 'penalty en puissance',
  penalty_panenka: 'panenka',
  coup_franc_frappe: 'coup franc direct frappé',
  coup_franc_centre: 'coup franc centré dans la surface',
  coup_franc_passe: 'coup franc joué court',
  corner_rentrant: 'corner rentrant',
  corner_sortant: 'corner sortant',
  corner_court: 'corner joué court',
  presser: 'presser le porteur du ballon',
  tacler: 'tacler',
  intercepter: 'intercepter une passe',
  couvrir: 'couvrir, reculer, fermer l\'espace',
  marquer: 'marquer un adversaire, rester sur lui',
  degager: 'dégager le ballon loin ou en touche',
  relancer_court: 'relancer court proprement',
  relancer_long: 'relancer long',
  faute_tactique: 'faire une faute volontaire pour stopper une action',
  bloquer: 'bloquer une frappe avec le corps',
  gb_rester_ligne: 'gardien : rester sur sa ligne',
  gb_sortir: 'gardien : sortir dans les pieds de l\'attaquant',
  gb_sortie_aerienne: 'gardien : sortir dans les airs sur un centre',
  gb_relance_courte: 'gardien : relance courte',
  gb_degagement_long: 'gardien : dégagement long',
  gb_plonger_gauche: 'gardien sur penalty : plonger à gauche',
  gb_plonger_droite: 'gardien sur penalty : plonger à droite',
  gb_rester_centre: 'gardien sur penalty : rester au centre',
  simuler: 'simuler une faute, plonger',
  protester: 'protester auprès de l\'arbitre',
  provoquer: 'provoquer, chambrer un adversaire',
  encourager: 'encourager un coéquipier',
  calmer_le_jeu: 'garder son calme, ne pas répondre à la provocation',
  demander_changement: 'demander à sortir',
  jouer_blesse: 'serrer les dents et continuer malgré la douleur',
  signaler_blessure: 'signaler une blessure au banc',
  aucune: 'non-décision : phrase méta, hors sujet ou instruction au jeu',
};

/** Liste formatée des actions autorisées avec leur définition. */
export function describeActions(ids: readonly MatchActionId[]): string {
  return ids.map((id) => `- ${id} : ${ACTION_DEFINITIONS[id]}`).join('\n');
}

export const ALL_ACTION_IDS: readonly MatchActionId[] = MATCH_ACTIONS;
