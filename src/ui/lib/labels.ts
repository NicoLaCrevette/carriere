/**
 * Libellés français d'affichage pour les énumérations du moteur. Pure
 * présentation (pas de logique métier) : centralisé ici pour que les écrans
 * et composants n'aient jamais de chaîne magique dupliquée.
 *
 * Beaucoup d'énumérations du moteur sont déjà des mots français en
 * `snake_case` (§0 du cahier des charges impose un vocabulaire français) :
 * `humanize` les rend lisibles par défaut, et quelques recouvrements
 * (`*_OVERRIDES`) améliorent la ponctuation des plus fréquemment affichés.
 */
import type {
  Archetype, AttributeKey, DayKind, Foot, InjuryType, MatchActionId, MatchEventType, NationalStage, OutcomeKind,
  Position, ReputationKey, SituationKind, StartingLevel, TrainingFocus,
} from '../../engine/types';

/** Alias local : `Player.squadStatus` est un littéral inline, non exporté par le moteur. */
type SquadStatus = 'capitaine' | 'vice_capitaine' | 'cadre' | 'membre' | 'ecarte';

export function humanize(id: string): string {
  if (!id) return '';
  const s = id.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  finition: 'Finition',
  tirLointain: 'Tir lointain',
  centres: 'Centres',
  passeCourte: 'Passe courte',
  passeLongue: 'Passe longue',
  dribble: 'Dribble',
  controle: 'Contrôle',
  coupsFrancs: 'Coups francs',
  penalty: 'Penalty',
  tete: 'Jeu de tête',
  vitesse: 'Vitesse',
  acceleration: 'Accélération',
  endurance: 'Endurance',
  force: 'Force',
  detente: 'Détente',
  agilite: 'Agilité',
  equilibre: 'Équilibre',
  placement: 'Placement',
  vision: 'Vision',
  sangFroid: 'Sang-froid',
  agressivite: 'Agressivité',
  travailDefensif: 'Travail défensif',
  leadership: 'Leadership',
  determination: 'Détermination',
  resistancePression: 'Résistance à la pression',
  reflexes: 'Réflexes',
  plongeon: 'Plongeon',
  sortiesAeriennes: 'Sorties aériennes',
  jeuAuPied: 'Jeu au pied',
  unContreUn: 'Un contre un',
};

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  finisseur: 'Finisseur',
  profondeur: 'Appel de profondeur',
  dribbleur: 'Dribbleur',
  pivot: 'Pivot',
  ailier_de_debordement: 'Ailier de débordement',
  faux_neuf: 'Faux numéro 9',
  box_to_box: 'Box-to-box',
  regisseur: 'Régisseur',
  destructeur: 'Destructeur',
  sentinelle: 'Sentinelle',
  createur: 'Créateur',
  mur: 'Mur défensif',
  relanceur: 'Relanceur',
  piston: 'Piston',
  libero: 'Libéro',
  gardien_ligne: 'Gardien de ligne',
  gardien_libero: 'Gardien libéro',
};

export const FOOT_LABELS: Record<Foot, string> = {
  droit: 'Droit',
  gauche: 'Gauche',
  ambidextre: 'Ambidextre',
};

export const STARTING_LEVEL_LABELS: Record<StartingLevel, string> = {
  espoir: 'Espoir',
  prometteur: 'Prometteur',
  pepite: 'Pépite',
};

export const STARTING_LEVEL_HELP: Record<StartingLevel, string> = {
  espoir: 'Attributs modestes, gros potentiel caché.',
  prometteur: 'Profil équilibré, potentiel correct.',
  pepite: 'Départ élevé, mais la pression est immédiate.',
};

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  entrainement: 'Entraînement',
  veille_match: 'Veille de match',
  jour_match: 'Jour de match',
  lendemain_match: 'Lendemain de match',
  repos: 'Repos',
  treve_internationale: 'Trêve internationale',
  rassemblement_selection: 'Rassemblement en sélection',
  match_international: 'Match international',
  mercato: 'Mercato',
  intersaison: 'Intersaison',
  preparation: 'Préparation',
  vacances: 'Vacances',
  reeducation: 'Rééducation',
};

export const TRAINING_INTENSITY_LABELS: Record<'legere' | 'normale' | 'intense', string> = {
  legere: 'Légère',
  normale: 'Normale',
  intense: 'Intense',
};

export const SQUAD_STATUS_LABELS: Record<SquadStatus, string> = {
  capitaine: 'Capitaine',
  vice_capitaine: 'Vice-capitaine',
  cadre: 'Cadre',
  membre: 'Membre du groupe',
  ecarte: 'Écarté',
};

export const NATIONAL_STAGE_LABELS: Record<NationalStage, string> = {
  aucun: 'Aucune sélection',
  espoirs: 'Espoirs',
  pre_liste: 'Pré-liste',
  convoque: 'Convoqué',
  titulaire: 'Titulaire',
  cadre: 'Cadre',
  capitaine: 'Capitaine',
};

export const INJURY_TYPE_LABELS: Record<InjuryType, string> = {
  contracture: 'Contracture',
  ischios: 'Blessure aux ischios',
  entorse_cheville: 'Entorse à la cheville',
  entorse_genou: 'Entorse au genou',
  pubalgie: 'Pubalgie',
  fracture: 'Fracture',
  commotion: 'Commotion cérébrale',
  croises: 'Rupture des ligaments croisés',
  menisque: 'Lésion au ménisque',
  adducteurs: 'Blessure aux adducteurs',
  mollet: 'Blessure au mollet',
  dos: 'Douleurs dorsales',
};

export const REPUTATION_LABELS: Record<ReputationKey, string> = {
  club: 'Club',
  supporters: 'Supporters',
  coach: 'Coach',
  teammates: 'Coéquipiers',
  league: 'Championnat',
  world: 'Monde',
  nationalTeam: 'Sélection',
  media: 'Médias',
};

const EVENT_OVERRIDES: Partial<Record<MatchEventType, string>> = {
  coup_d_envoi: 'Coup d’envoi',
  but: 'BUT',
  but_csc: 'But contre son camp',
  penalty_marque: 'Penalty marqué',
  penalty_rate: 'Penalty manqué',
  penalty_arrete: 'Penalty arrêté',
  tir_cadre: 'Tir cadré',
  tir_non_cadre: 'Tir non cadré',
  poteau: 'Poteau',
  arret: 'Arrêt du gardien',
  occasion_manquee: 'Occasion manquée',
  grosse_occasion: 'Grosse occasion',
  passe_decisive: 'Passe décisive',
  dribble_reussi: 'Dribble réussi',
  dribble_rate: 'Dribble raté',
  duel_gagne: 'Duel gagné',
  duel_perdu: 'Duel perdu',
  tacle: 'Tacle',
  interception: 'Interception',
  faute: 'Faute',
  faute_subie: 'Faute subie',
  carton_jaune: 'Carton jaune',
  carton_rouge: 'Carton rouge',
  hors_jeu: 'Hors-jeu',
  corner: 'Corner',
  coup_franc: 'Coup franc',
  var_but_refuse: 'But refusé par la VAR',
  var_penalty: 'Penalty accordé par la VAR',
  var_rouge: 'Rouge confirmé par la VAR',
  remplacement: 'Remplacement',
  blessure: 'Blessure',
  changement_tactique: 'Changement tactique',
  marquage_individuel: 'Marquage individuel déclenché',
  mi_temps: 'Mi-temps',
  temps_additionnel: 'Temps additionnel',
  coup_de_sifflet_final: 'Coup de sifflet final',
  clameur: 'Clameur du public',
  sifflets: 'Sifflets',
  consigne_coach: 'Consigne du coach',
  replique_capitaine: 'Réplique du capitaine',
  simulation_sanctionnee: 'Simulation sanctionnée',
  protestation: 'Protestation',
};

export function eventLabel(type: MatchEventType): string {
  return EVENT_OVERRIDES[type] ?? humanize(type);
}

const OUTCOME_OVERRIDES: Partial<Record<OutcomeKind, string>> = {
  but: 'But !',
  arret: 'Arrêt du gardien',
  hors_cadre: 'Tir hors cadre',
  poteau: 'Poteau',
  gb_arret: 'Arrêt réussi',
  gb_but_encaisse: 'But encaissé',
  gb_sortie_reussie: 'Sortie réussie',
  gb_sortie_ratee: 'Sortie manquée',
};

export function outcomeLabel(kind: OutcomeKind): string {
  return OUTCOME_OVERRIDES[kind] ?? humanize(kind);
}

export function situationLabel(kind: SituationKind): string {
  return humanize(kind);
}

export function actionLabel(action: MatchActionId): string {
  return humanize(action);
}

export function trainingFocusLabel(focus: TrainingFocus): string {
  return humanize(focus);
}

export function positionOrDash(p: Position | undefined): string {
  return p ?? '—';
}

// ── Formats numériques ──────────────────────────────────────────────────

const euroFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** « 4,2 M€ », « 850 k€ », « 12 000 € ». */
export function formatEuros(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M€`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1000)} k€`;
  return `${euroFormatter.format(value)} €`;
}

export function formatSigned(value: number, digits = 0): string {
  const s = value.toFixed(digits);
  return value > 0 ? `+${s}` : s;
}

export function formatRating(value: number): string {
  return value.toFixed(1);
}
