/**
 * Choix automatique d'une action plausible sans humain : archétypes, poste,
 * score et minute, avec un peu d'aléa seedé. Sert au mode auto, à l'action
 * par défaut d'une situation et aux tests. Le risque produit n'est jamais élevé.
 */
import type { Archetype, ClassifiedAction, MatchActionId, MatchContext, MatchState, Situation } from '../types';
import type { Rng } from '../rng/mulberry32';
import { BALANCE } from '../config/balance';
import { positionProfile } from '../config/positions';
import { SHOT_ACTIONS } from './actionTable';
import { lerpRange, scoreFor } from './matchEvents';

const AP = BALANCE.autoplay;

/** Actions favorites par archétype. */
const ARCHETYPE_FAVOURITES: Record<Archetype, readonly MatchActionId[]> = {
  finisseur: ['frappe', 'frappe_premiere_intention', 'tete', 'appel_premier_poteau', 'penalty_placer'],
  profondeur: ['appel_profondeur', 'accelerer', 'passe_profondeur'],
  dribbleur: ['dribble', 'crochet', 'dribble_gardien'],
  pivot: ['remise', 'rester_en_pivot', 'proteger_ballon', 'tete'],
  ailier_de_debordement: ['centre', 'accelerer', 'dribble', 'centre_en_retrait'],
  faux_neuf: ['decrocher', 'une_deux', 'passe_courte', 'remise'],
  box_to_box: ['presser', 'appel_profondeur', 'frappe_lointaine', 'tacler'],
  regisseur: ['passe_courte', 'passe_longue', 'temporiser', 'relancer_court'],
  destructeur: ['tacler', 'presser', 'intercepter', 'faute_tactique'],
  sentinelle: ['intercepter', 'couvrir', 'passe_courte', 'marquer'],
  createur: ['passe_profondeur', 'une_deux', 'centre_en_retrait', 'centre'],
  mur: ['marquer', 'bloquer', 'degager', 'couvrir', 'tete'],
  relanceur: ['relancer_court', 'passe_courte', 'passe_longue', 'conserver'],
  piston: ['centre', 'accelerer', 'couvrir', 'appel_profondeur'],
  libero: ['couvrir', 'relancer_court', 'intercepter', 'passe_longue'],
  gardien_ligne: ['gb_rester_ligne', 'gb_plonger_gauche', 'gb_degagement_long'],
  gardien_libero: ['gb_sortir', 'gb_sortie_aerienne', 'gb_relance_courte'],
};

const SAFE_ACTIONS: readonly MatchActionId[] = ['conserver', 'proteger_ballon', 'temporiser', 'degager', 'calmer_le_jeu', 'passe_courte', 'relancer_court', 'couvrir'];

/** Poids d'une action candidate selon le profil, les archétypes et le contexte de match. */
function weightOf(action: MatchActionId, index: number, archetypes: Archetype[], trailingLate: boolean, leadingLate: boolean): number {
  let w = index === 0 ? AP.firstDefaultWeight : 1;
  for (const a of archetypes) if (ARCHETYPE_FAVOURITES[a]?.includes(action)) w *= AP.archetypeBoost;
  if (trailingLate && SHOT_ACTIONS.includes(action)) w *= AP.trailingLate.shotBoost;
  if (leadingLate && SAFE_ACTIONS.includes(action)) w *= AP.leadingLate.safeBoost;
  return w;
}

/** Choisit une action plausible pour le joueur dans une situation. */
export function autoDecide(situation: Situation, ctx: MatchContext, ms: MatchState, rng: Rng): ClassifiedAction {
  const player = ctx.player;
  const position = player?.identity.position ?? 'MC';
  const archetypes = player?.identity.archetypes ?? [];
  const profile = positionProfile(position);
  const defaults = profile.defaultActions[situation.kind] ?? [];
  const allowed = situation.allowedActions;

  // Candidats : actions par défaut du poste autorisées ici, sinon toutes les actions autorisées.
  let candidates: MatchActionId[] = defaults.filter((a) => allowed.includes(a));
  if (candidates.length === 0) candidates = [...allowed];
  if (candidates.length === 0) {
    return { action: 'attendre', intensite: 0.5, risque: AP.riskRange[0], meta: false };
  }

  const side = ctx.playerSide ?? 'home';
  const s = scoreFor(ms, side);
  const trailingLate = ms.minute >= AP.trailingLate.fromMinute && s.pour < s.contre;
  const leadingLate = ms.minute >= AP.leadingLate.fromMinute && s.pour > s.contre;
  const weights = candidates.map((a, i) => weightOf(a, i, archetypes, trailingLate, leadingLate));
  const action = rng.weighted(candidates, weights);

  let risque = lerpRange(AP.riskRange, rng.next());
  if (trailingLate) risque += AP.trailingLate.riskBonus;
  risque = Math.min(AP.maxRisk, risque);
  const intensite = lerpRange(AP.intensityRange, rng.next());

  const classified: ClassifiedAction = { action, intensite, risque, meta: false };
  if (SHOT_ACTIONS.includes(action)) {
    classified.cible = rng.chance(AP.ambitiousZoneProb)
      ? rng.pick(['lucarne_gauche', 'lucarne_droite'] as const)
      : rng.pick(['ras_de_terre_premier_poteau', 'ras_de_terre_deuxieme_poteau', 'mi_hauteur', 'defaut'] as const);
  } else if (action.startsWith('passe') || action === 'centre' || action === 'centre_en_retrait' || action === 'une_deux' || action === 'remise') {
    const target = situation.nearbyTeammateIds[0];
    if (target) classified.cible = target;
  }
  return classified;
}
