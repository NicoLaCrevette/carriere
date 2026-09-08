/**
 * Catalogue des définitions d'événements (docs/PHASE6_CONTRACTS.md §
 * `src/engine/events/catalogue.ts`).
 *
 * Chaque définition est pure côté `weight` (fonction de l'état, jamais de
 * RNG) ; `facts`/`npcIds` peuvent tirer dans le `Rng` fourni par
 * `events/roll.ts::rollDailyEvents`. Les `outcomes[].apply` ne touchent
 * jamais l'état directement (bornes, journal, mémoire) : tout passe par
 * `career/apply.applyDeltas`, comme pour les scènes du LLM (§6.2). La
 * résolution générique de la storyline éventuelle (statut, journal, trace)
 * est faite par `events/roll.ts::resolveEvent`, pas ici.
 */
import type { CareerState, CommunicationFlags, EventCategory, Id, RelationshipDelta, ReputationDeltas, StorylineKind } from '../types';
import type { Rng } from '../rng/mulberry32';
import { EVENTS_BALANCE } from '../config/balance/events';
import { diffDays } from '../calendar/dates';
import { applyDeltas } from '../career/apply';
import { ensureEventNpc, playerClub } from './helpers';

const D = EVENTS_BALANCE.events.reputationDelta;
const M = EVENTS_BALANCE.events.moraleDelta;

export interface EventOutcome {
  id: string;
  label: string;
  minScore?: number;
  flags?: Partial<CommunicationFlags>;
  apply(state: CareerState): void;
}

export interface EventDefinition {
  id: Id;
  category: EventCategory;
  title: string;
  /** Poids 0 = impossible aujourd'hui. Fonction PURE de l'état (jamais de RNG). */
  weight(state: CareerState): number;
  cooldownDays: number;
  oncePerSeason?: boolean;
  /** Faits pour le narrateur, tirés avec le RNG fourni. */
  facts(state: CareerState, rng: Rng): Record<string, string | number | boolean>;
  /** PNJ impliqués (existants ou créés à la volée). */
  npcIds(state: CareerState, rng: Rng): Id[];
  /** Effets immédiats (au déclenchement, avant toute réponse du joueur). */
  immediate?(state: CareerState): void;
  storyline?: { kind: StorylineKind; title: string; deadlineDays: number };
  outcomes: EventOutcome[];
}

// ── Petites aides de construction ───────────────────────────────────────

function rep(state: CareerState, deltas: ReputationDeltas, reason: string): void {
  applyDeltas(state, { reputation: deltas }, reason);
}

function repAndMorale(state: CareerState, deltas: ReputationDeltas, morale: number, reason: string): void {
  applyDeltas(state, { reputation: deltas, morale }, reason);
}

function relation(state: CareerState, npcId: Id, trust: number, respect: number, reason: string): void {
  const delta: RelationshipDelta = { npcId, trust, respect, reason };
  applyDeltas(state, { relationships: [delta] }, reason);
}

function simple(id: string, label: string, apply: (state: CareerState) => void, flags?: Partial<CommunicationFlags>): EventOutcome {
  return { id, label, flags, apply };
}

const MOTHER_ID = 'npc-mere';
const AGENT_ID = 'npc-agent';
const JOURNALIST_ID = 'npc-journaliste-local';

function captainNpcId(state: CareerState): Id[] {
  const club = playerClub(state);
  if (!club) return [];
  const found = Object.values(state.world.npcs).find((n) => n.kind === 'capitaine' && n.npcPlayerId === club.captainId);
  return found ? [found.id] : [];
}

// ── Catalogue ─────────────────────────────────────────────────────────────

export const EVENT_CATALOGUE: EventDefinition[] = [
  // 1-2 — agent
  {
    id: 'appel_agent_conseils',
    category: 'agent',
    title: "Appel de l'agent",
    weight: () => 1.4,
    cooldownDays: 20,
    facts: (_s, rng) => ({ sujet: rng.pick(['le salaire', 'une clause libératoire', 'un contrat de sponsoring', 'la suite de la carrière']) }),
    npcIds: (s, rng) => [ensureEventNpc(s, AGENT_ID, 'agent', 42, `Agent de ${s.player.identity.firstName} ${s.player.identity.lastName}.`, rng).id],
    outcomes: [
      simple('ecouter', 'Tu écoutes ses conseils avec attention.', (s) => relation(s, AGENT_ID, 4, 2, 'Écoute les conseils de son agent')),
      simple('eluder', 'Tu élude, pressé d\'aller t\'entraîner.', (s) => relation(s, AGENT_ID, -2, -1, 'Élude son agent')),
    ],
  },
  {
    id: 'agent_evoque_prolongation',
    category: 'agent',
    title: 'Ton agent évoque une prolongation',
    weight: (s) => {
      const monthsLeft = diffDays(s.currentDate, s.player.contract.endsOn) / 30;
      return monthsLeft < 18 ? 1.2 : 0;
    },
    cooldownDays: 60,
    facts: () => ({}),
    npcIds: (s, rng) => [ensureEventNpc(s, AGENT_ID, 'agent', 42, 'Agent du joueur.', rng).id],
    outcomes: [
      simple('ouvert', 'Tu te dis ouvert à en discuter.', (s) => repAndMorale(s, { coach: D.small }, M.small, 'Ouvert à prolonger')),
      simple('reserve', 'Tu restes réservé, sans t\'engager.', (s) => relation(s, AGENT_ID, -1, 0, 'Réservé sur une prolongation')),
    ],
  },

  // 3-4 — sponsor
  {
    id: 'sollicitation_sponsor_locale',
    category: 'sponsor',
    title: 'Un commerçant local sollicite ton image',
    weight: (s) => (s.reputation.world.value >= 15 ? 1.2 : 0.3),
    cooldownDays: 40,
    facts: (_s, rng) => ({ enseigne: rng.pick(['une brasserie du coin', 'un magasin de sport', 'une auto-école', 'un garage']) }),
    npcIds: (s, rng) => [ensureEventNpc(s, 'npc-sponsor-local', 'sponsor', 40, 'Contact sponsoring local.', rng).id],
    outcomes: [
      simple('accepter', 'Tu acceptes, sourire de rigueur pour la photo.', (s) => repAndMorale(s, { media: D.small, supporters: D.small }, M.small, 'Accepte une sollicitation locale')),
      simple('refuser', 'Tu refuses poliment, pas le moment.', (s) => rep(s, { media: -1 }, 'Refuse une sollicitation locale')),
    ],
  },
  {
    id: 'proposition_equipementier',
    category: 'sponsor',
    title: "Un équipementier propose une collaboration",
    weight: (s) => (s.reputation.world.value >= 40 ? 1.0 : 0),
    cooldownDays: 90,
    oncePerSeason: true,
    facts: () => ({}),
    npcIds: (s, rng) => [ensureEventNpc(s, 'npc-sponsor-equipementier', 'sponsor', 38, 'Contact équipementier.', rng).id],
    outcomes: [
      simple('accepter', 'Tu acceptes de rencontrer leurs équipes.', (s) => repAndMorale(s, { media: D.medium, world: D.small }, M.small, 'Accepte de discuter avec un équipementier')),
      simple('refuser', 'Tu déclines pour le moment.', () => undefined),
    ],
  },

  // 5-6 — réseaux sociaux
  {
    id: 'post_reseaux_polemique',
    category: 'reseaux_sociaux',
    title: 'Un de tes posts fait polémique',
    weight: (s) => (s.player.morale < 40 ? 1.6 : 1.0),
    cooldownDays: 25,
    facts: (_s, rng) => ({ plateforme: rng.pick(['X', 'Instagram', 'TikTok']) }),
    npcIds: () => [],
    outcomes: [
      simple('clarifier', 'Tu publies un message pour clarifier calmement.', (s) => rep(s, { media: D.small, supporters: D.small }, 'Clarifie un post polémique'), { langue_de_bois: 0.5 }),
      simple('assumer', 'Tu assumes sans revenir dessus.', (s) => rep(s, { media: -D.medium, supporters: -D.small }, 'Assume un post polémique'), { arrogance: true }),
    ],
  },
  {
    id: 'story_virale_entrainement',
    category: 'reseaux_sociaux',
    title: "Une story d'entraînement devient virale",
    weight: (s) => (s.player.fitness > 70 ? 0.9 : 0.4),
    cooldownDays: 30,
    facts: () => ({}),
    npcIds: () => [],
    outcomes: [
      simple('relayer', 'Tu relayes fièrement.', (s) => rep(s, { supporters: D.small, media: D.small }, 'Relaie une story virale')),
      simple('ignorer', 'Tu laisses filer sans réagir.', () => undefined),
    ],
  },

  // 7-8 — supporters
  {
    id: 'tifo_supporters',
    category: 'supporters',
    title: 'Un tifo à ton effigie',
    weight: (s) => (s.reputation.supporters.value >= 50 ? 1.3 : 0.5),
    cooldownDays: 60,
    facts: () => ({}),
    npcIds: () => [],
    outcomes: [
      simple('remercier', 'Tu remercies publiquement le kop.', (s) => repAndMorale(s, { supporters: D.medium }, M.medium, 'Remercie les supporters pour un tifo')),
      simple('discret', 'Tu restes discret, gêné par l\'attention.', (s) => rep(s, { supporters: D.small }, 'Reste discret après un tifo')),
    ],
  },
  {
    id: 'chant_dedie',
    category: 'supporters',
    title: 'Les tribunes ont un chant pour toi',
    weight: (s) => (s.reputation.supporters.value >= 65 ? 1.1 : 0.3),
    cooldownDays: 60,
    facts: () => ({}),
    npcIds: () => [],
    outcomes: [
      simple('jouer_le_jeu', 'Tu mimes le chant en célébration.', (s) => repAndMorale(s, { supporters: D.small }, M.small, 'Joue le jeu du chant des tribunes')),
      simple('ignorer', 'Tu n\'y prêtes pas attention.', () => undefined),
    ],
  },

  // 9 — télévision
  {
    id: 'interview_tele_surprise',
    category: 'television',
    title: 'Une chaîne te propose une interview surprise',
    weight: (s) => (s.reputation.media.value >= 20 ? 1.0 : 0.5),
    cooldownDays: 35,
    facts: (_s, rng) => ({ emission: rng.pick(['le journal du sport', 'une émission de plateau', 'un flash spécial']) }),
    npcIds: (s, rng) => [ensureEventNpc(s, JOURNALIST_ID, 'journaliste', 38, 'Journaliste local.', rng).id],
    outcomes: [
      simple('brillant', 'Tu te montres à l\'aise et souriant.', (s) => rep(s, { media: D.medium }, 'Interview télé réussie')),
      simple('lisse', 'Tu restes sur des réponses toutes faites.', (s) => rep(s, { media: D.small }, 'Interview télé lisse'), { langue_de_bois: 0.7 }),
    ],
  },

  // 10 — soirée d'équipe
  {
    id: 'soiree_integration',
    category: 'soiree_equipe',
    title: "Soirée d'équipe organisée par le groupe",
    weight: () => 1.0,
    cooldownDays: 45,
    facts: () => ({}),
    npcIds: (s) => captainNpcId(s),
    outcomes: [
      simple('participer', 'Tu passes la soirée avec le groupe.', (s) => repAndMorale(s, { teammates: D.medium }, M.small, 'Participe à la soirée d\'équipe')),
      simple('decliner', 'Tu déclines poliment, fatigue oblige.', (s) => rep(s, { teammates: -D.small }, 'Décline la soirée d\'équipe')),
    ],
  },

  // 11-12 — conflit de vestiaire
  {
    id: 'clash_vestiaire',
    category: 'conflit_vestiaire',
    title: 'Accrochage dans le vestiaire',
    weight: (s) => (s.world.clubs[s.player.contract.clubId]?.teamMorale ?? 60) < 50 ? 1.6 : 0.6,
    cooldownDays: 50,
    facts: (_s, rng) => ({ motif: rng.pick(['une répartition des tâches', 'une critique publique', 'un partage de ballon jugé injuste']) }),
    npcIds: (s) => captainNpcId(s),
    storyline: { kind: 'conflit_vestiaire', title: 'Tension dans le vestiaire', deadlineDays: 14 },
    outcomes: [
      simple('apaiser', 'Tu prends les devants pour apaiser les choses.', (s) => repAndMorale(s, { teammates: D.medium, coach: D.small }, M.small, 'Apaise un clash de vestiaire')),
      simple('hausser_le_ton', 'Tu hausses le ton à ton tour.', (s) => rep(s, { teammates: -D.medium, coach: -D.small }, 'Envenime un clash de vestiaire')),
    ],
  },
  {
    id: 'dispute_penalty',
    category: 'conflit_vestiaire',
    title: 'Qui tire le prochain penalty ?',
    weight: (s) => (['BU', 'MOC', 'AIG', 'AID'].includes(s.player.identity.position) ? 0.9 : 0),
    cooldownDays: 40,
    facts: () => ({}),
    npcIds: () => [],
    outcomes: [
      simple('laisser_filer', 'Tu laisses filer, sans en faire une affaire.', (s) => rep(s, { teammates: D.small }, 'Laisse filer une dispute de penalty')),
      simple('revendiquer', 'Tu revendiques ton statut de tireur.', (s) => rep(s, { teammates: -D.small }, 'Revendique le tir des penaltys')),
    ],
  },

  // 13 — capitanat
  {
    id: 'rumeur_capitanat',
    category: 'capitanat',
    title: 'Le brassard fait parler',
    weight: (s) => (s.player.coachTrust >= 55 || s.player.squadStatus === 'cadre' ? 1.1 : 0.2),
    cooldownDays: 60,
    oncePerSeason: true,
    facts: () => ({}),
    npcIds: (s) => captainNpcId(s),
    storyline: { kind: 'capitanat', title: 'Qui portera le brassard ?', deadlineDays: 30 },
    outcomes: [
      simple('se_montrer_pret', 'Tu te montres prêt à endosser plus de responsabilités.', (s) => rep(s, { coach: D.medium }, 'Se montre prêt pour le capitanat')),
      simple('rester_discret', 'Tu restes discret sur le sujet.', (s) => rep(s, { coach: D.small }, 'Reste discret sur le capitanat')),
    ],
  },

  // 14 — concurrent
  {
    id: 'arrivee_concurrent',
    category: 'concurrent',
    title: 'Un concurrent débarque à ton poste',
    weight: (s) => (s.player.coachTrust < 60 ? 1.3 : 0.7),
    cooldownDays: 70,
    facts: (s) => ({ poste: s.player.identity.position }),
    npcIds: () => [],
    storyline: { kind: 'concurrent_au_poste', title: 'Un concurrent au poste', deadlineDays: 60 },
    outcomes: [
      simple('se_muscler', 'Tu prends la nouvelle comme un défi.', (s) => repAndMorale(s, {}, M.small, 'Prend la concurrence comme un défi')),
      simple('s_inquieter', 'La nouvelle t\'inquiète un peu.', (s) => repAndMorale(s, {}, -M.small, 'S\'inquiète de la concurrence')),
    ],
  },

  // 15 — changement d'entraîneur (rumeur, distinct du licenciement réel de `events/roll.maybeChangeCoach`)
  {
    id: 'rumeur_licenciement_coach',
    category: 'changement_coach',
    title: "La presse évoque un possible limogeage du coach",
    weight: (s) => (s.reputation.coach.value < 40 ? 1.2 : 0.4),
    cooldownDays: 30,
    facts: () => ({}),
    npcIds: (s) => {
      const club = playerClub(s);
      const coach = club ? s.world.npcs[club.coachId] : undefined;
      return coach ? [coach.id] : [];
    },
    outcomes: [
      simple('soutenir', 'Tu apportes ton soutien public au coach.', (s) => rep(s, { coach: D.medium, media: -1 }, 'Soutient publiquement le coach visé')),
      simple('rester_neutre', 'Tu restes neutre, ce n\'est pas ton rôle.', () => undefined),
    ],
  },

  // 16 — sentimental
  {
    id: 'rencontre_sentimentale',
    category: 'sentimental',
    title: 'Une nouvelle rencontre',
    weight: () => 0.7,
    cooldownDays: 180,
    facts: () => ({}),
    npcIds: (s, rng) => [ensureEventNpc(s, 'npc-partenaire', 'partenaire', 25, 'Rencontre récente.', rng).id],
    storyline: { kind: 'sentimental', title: 'Une nouvelle relation', deadlineDays: 45 },
    outcomes: [
      simple('officialiser', 'Vous officialisez publiquement.', (s) => repAndMorale(s, { media: D.small }, M.medium, 'Officialise une relation')),
      simple('discretion', 'Vous restez discrets pour l\'instant.', (s) => repAndMorale(s, {}, M.small, 'Reste discret sur sa relation')),
    ],
  },

  // 17 — deuil
  {
    id: 'deuil_proche',
    category: 'deuil',
    title: "Deuil dans l'entourage",
    weight: () => 0.15,
    cooldownDays: 365,
    oncePerSeason: true,
    facts: (_s, rng) => ({ lien: rng.pick(['un grand-parent', 'un proche de la famille']) }),
    npcIds: () => [],
    storyline: { kind: 'deuil', title: 'Deuil dans la famille', deadlineDays: 21 },
    outcomes: [
      simple('pause', 'Tu prends quelques jours pour toi.', (s) => repAndMorale(s, { media: D.small }, -M.small, 'Prend une pause pour un deuil')),
      simple('jouer_quand_meme', 'Tu choisis de jouer quand même.', (s) => repAndMorale(s, { media: D.small }, -M.medium, 'Joue malgré un deuil')),
    ],
  },

  // 18 — maladie d'un proche
  {
    id: 'maladie_parent',
    category: 'maladie_proche',
    title: "Un proche est malade",
    weight: () => 0.3,
    cooldownDays: 180,
    facts: () => ({}),
    npcIds: (s, rng) => [ensureEventNpc(s, MOTHER_ID, 'mere', 48, 'Mère du joueur.', rng).id],
    storyline: { kind: 'maladie_proche', title: 'Un proche est malade', deadlineDays: 30 },
    outcomes: [
      simple('rester_present', 'Tu prends des nouvelles chaque jour.', (s) => repAndMorale(s, { media: D.small }, -M.small, 'Reste présent pour un proche malade')),
      simple('se_concentrer', 'Tu te concentres sur le foot pour tenir.', (s) => repAndMorale(s, {}, -M.medium, 'Se concentre sur le foot malgré la maladie d\'un proche')),
    ],
  },

  // 19 — problème extra-sportif
  {
    id: 'probleme_amende',
    category: 'extra_sportif',
    title: 'Une petite amende qui fait jaser',
    weight: () => 0.5,
    cooldownDays: 60,
    facts: (_s, rng) => ({ motif: rng.pick(['stationnement gênant', 'léger excès de vitesse', 'retard à l\'entraînement']) }),
    npcIds: () => [],
    outcomes: [
      simple('payer_discretement', 'Tu régularises discrètement.', (s) => rep(s, { media: D.small }, 'Régularise une amende discrètement')),
      simple('laisser_trainer', 'Tu laisses traîner l\'histoire.', (s) => rep(s, { media: -D.medium }, 'Laisse traîner une amende')),
    ],
  },

  // 20 — blessure (alerte narrative, distincte du moteur de blessures déterministe)
  {
    id: 'petite_alerte_musculaire',
    category: 'blessure',
    title: 'Petite alerte musculaire à l\'entraînement',
    weight: (s) => (s.player.fitness < 70 ? 1.3 : 0.5),
    cooldownDays: 30,
    facts: (_s, rng) => ({ zone: rng.pick(['ischios', 'mollet', 'adducteurs']) }),
    npcIds: () => [],
    outcomes: [
      simple('lever_le_pied', 'Tu lèves le pied par précaution.', (s) => repAndMorale(s, {}, M.small, 'Lève le pied après une alerte musculaire')),
      simple('forcer', 'Tu continues comme si de rien n\'était.', (s) => repAndMorale(s, {}, -M.small, 'Force malgré une alerte musculaire')),
    ],
  },

  // 21 — coup du sort
  {
    id: 'incident_voyage',
    category: 'coup_du_sort',
    title: "Incident de voyage avant un déplacement",
    weight: () => 0.7,
    cooldownDays: 20,
    facts: (_s, rng) => ({ incident: rng.pick(['vol retardé', 'bagage égaré', 'embouteillage monstre']) }),
    npcIds: () => [],
    outcomes: [
      simple('relativiser', 'Tu prends la chose avec le sourire.', (s) => repAndMorale(s, {}, M.small, 'Relativise un incident de voyage')),
      simple('s_agacer', 'Tu t\'agaces visiblement.', (s) => repAndMorale(s, { media: -1 }, -M.small, 'S\'agace d\'un incident de voyage')),
    ],
  },

  // 22 — presse
  {
    id: 'fuite_presse',
    category: 'presse',
    title: 'Une information te concernant fuite dans la presse',
    weight: (s) => (s.reputation.media.value < 40 ? 1.2 : 0.6),
    cooldownDays: 30,
    facts: () => ({}),
    npcIds: (s, rng) => [ensureEventNpc(s, JOURNALIST_ID, 'journaliste', 38, 'Journaliste local.', rng).id],
    outcomes: [
      simple('dementir', 'Tu démens publiquement.', (s) => rep(s, { media: D.small }, 'Dément une fuite de presse')),
      simple('ne_rien_dire', 'Tu ne commentes pas.', (s) => rep(s, { media: -1 }, 'Ne commente pas une fuite de presse')),
    ],
  },

  // 23 — club
  {
    id: 'annonce_club_investissement',
    category: 'club',
    title: 'Le club annonce un projet',
    weight: () => 0.6,
    cooldownDays: 90,
    facts: (_s, rng) => ({ projet: rng.pick(["un nouveau centre d'entraînement", 'un agrandissement du stade', 'un recrutement ambitieux'])}),
    npcIds: () => [],
    outcomes: [
      simple('saluer', 'Tu salues publiquement l\'ambition du club.', (s) => rep(s, { club: D.small }, 'Salue un projet du club')),
      simple('prudent', 'Tu restes prudent, on jugera sur les actes.', () => undefined),
    ],
  },

  // 24 — sélection
  {
    id: 'sondage_supporters_selection',
    category: 'selection',
    title: 'Un sondage sur ta place en sélection',
    weight: (s) => (s.national.stage !== 'aucun' ? 1.0 : 0),
    cooldownDays: 45,
    facts: (_s, rng) => ({ resultat: rng.pick(['favorable', 'partagé', 'sceptique']) }),
    npcIds: () => [],
    outcomes: [
      simple('savourer', 'Tu savoures sans t\'enflammer.', (s) => rep(s, { nationalTeam: D.small }, 'Savoure un sondage favorable')),
      simple('relativiser', 'Tu relativises, seul le terrain compte.', () => undefined),
    ],
  },

  // 25 — famille
  {
    id: 'coup_de_fil_famille',
    category: 'famille',
    title: 'Coup de fil de la famille',
    weight: () => 1.0,
    cooldownDays: 21,
    facts: () => ({}),
    npcIds: (s, rng) => [ensureEventNpc(s, MOTHER_ID, 'mere', 48, 'Mère du joueur.', rng).id],
    outcomes: [
      simple('prendre_le_temps', 'Tu prends le temps de bien parler.', (s) => relation(s, MOTHER_ID, 3, 2, 'Prend le temps au téléphone avec sa famille')),
      simple('ecourter', 'Tu écourtes, pressé.', (s) => relation(s, MOTHER_ID, -2, -1, 'Écourte un appel familial')),
    ],
  },
];
