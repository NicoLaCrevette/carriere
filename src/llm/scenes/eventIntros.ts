/**
 * Mise en situation des événements de vie (§12).
 *
 * Le moteur ne produit qu'un titre et quelques faits ; sans contexte, le
 * joueur ne peut pas répondre (« Une fuite a fuité dans la presse. » ne dit
 * ni ce qui a fuité, ni qui lui parle, ni ce qu'on attend de lui). Ces
 * intros disent qui parle, ce qui se passe, et posent une question ouverte.
 *
 * Elles sont déterministes et gratuites : elles fonctionnent sans modèle de
 * langue, et servent aussi de repli quand un modèle est branché.
 */
import type { GameEvent } from '../../engine/types';

export interface IntroVars {
  prenom: string;
  nom: string;
  club: string;
  coachNom?: string;
  poste?: string;
}

type Fact = string | number | boolean | undefined;

function f(event: GameEvent, key: string, fallback = ''): string {
  const v: Fact = event.facts[key];
  return v === undefined || v === '' ? fallback : String(v);
}

type Intro = (event: GameEvent, v: IntroVars) => string;

const INTROS: Record<string, Intro> = {
  // ── Agent ──────────────────────────────────────────────────────────────
  appel_agent_conseils: (e, v) =>
    `Ton agent t'appelle en fin de journée. « ${v.prenom}, tu as deux minutes ? Le sujet : ${f(e, 'sujet', 'la suite de ta saison')}. Je préfère qu'on soit alignés tous les deux avant que ça sorte ailleurs. Tu le sens comment, toi ? »`,
  agent_evoque_prolongation: (e, v) =>
    `Ton agent te rappelle que ton contrat avec ${v.club} arrive à son terme. « Le club va sûrement venir te voir pour prolonger. Avant que je réponde quoi que ce soit, j'ai besoin de savoir : tu veux rester, ou tu veux qu'on regarde ailleurs ? »`,

  // ── Sponsors ───────────────────────────────────────────────────────────
  sollicitation_sponsor_locale: (e, v) =>
    `Un commerçant du coin, ${f(e, 'enseigne', 'une enseigne locale')}, a contacté le club : il aimerait ta photo dans sa vitrine et un petit passage à l'inauguration. Ça ne rapporte presque rien, mais ce sont des gens du quartier. Qu'est-ce que tu réponds ?`,
  proposition_equipementier: (_e, v) =>
    `Un équipementier s'intéresse à toi. Chaussures fournies, quelques séances photo, ton nom sur leur campagne jeunes. C'est un vrai palier pour un joueur de ${v.club}, mais tu deviens leur visage. Tu leur dis quoi ?`,

  // ── Réseaux sociaux ────────────────────────────────────────────────────
  post_reseaux_polemique: (e, v) =>
    `Un de tes posts sur ${f(e, 'plateforme', 'les réseaux')} est repris partout depuis ce matin, sorti de son contexte. Des comptes de supporters s'énervent, un journaliste a déjà demandé une réaction au club. ${v.prenom}, tu fais quoi : tu clarifies, tu assumes, tu te tais ?`,
  story_virale_entrainement: (_e, v) =>
    `Une vidéo de toi à l'entraînement tourne en boucle : un geste réussi, filmé par un coéquipier. Des centaines de milliers de vues en une nuit. Le club te demande comment tu veux gérer ça. Qu'est-ce que tu en dis ?`,

  // ── Supporters ─────────────────────────────────────────────────────────
  tifo_supporters: (_e, v) =>
    `Les ultras de ${v.club} préparent un tifo à ton effigie pour le prochain match à domicile. Un membre du groupe est venu te le dire au centre d'entraînement, un peu intimidé. Tu lui réponds quoi ?`,
  chant_dedie: (_e, v) =>
    `Depuis samedi, le virage a un chant pour toi. On te l'a fait écouter dans le vestiaire, tout le monde riait. Un journaliste te demande maintenant ce que ça te fait. ${v.prenom} ?`,

  // ── Télévision ─────────────────────────────────────────────────────────
  interview_tele_surprise: (_e, v) =>
    `Une chaîne nationale veut te consacrer un sujet : plateau, questions sur ton parcours, ta famille, tes ambitions. Le club te laisse décider. C'est de l'exposition, et de l'exposition, ça se retourne vite. Tu y vas ?`,

  // ── Vie de groupe ──────────────────────────────────────────────────────
  soiree_integration: (_e, v) =>
    `Le groupe organise une soirée d'équipe jeudi, la veille d'une journée légère. Les cadres insistent pour que tout le monde vienne, le staff ferme les yeux sans le dire. Tu viens, tu passes en coup de vent, tu déclines ?`,
  clash_vestiaire: (e, v) =>
    `Le ton est monté dans le vestiaire après la séance. En cause : ${f(e, 'motif', 'une histoire de terrain')}. Deux coéquipiers se sont pris la tête et le groupe s'est tourné vers toi. Tu dis quelque chose, ou tu laisses passer ?`,
  dispute_penalty: (_e, v) =>
    `Le prochain penalty pose question : le tireur habituel a manqué le dernier, et plusieurs joueurs pensent que ça devrait être toi. Le sujet arrive sur la table devant tout le monde. Tu te positionnes comment ?`,
  rumeur_capitanat: (e, v) =>
    `Le brassard fait parler à ${v.club}. Ton nom revient dans les discussions du vestiaire, et un journaliste vient de le mentionner en conférence. ${v.coachNom ? `${v.coachNom} n'a rien confirmé.` : 'Le staff n\'a rien confirmé.'} Tu en penses quoi ?`,
  arrivee_concurrent: (_e, v) =>
    `Le club recrute un ${(v.poste ?? 'joueur').toLowerCase()}, exactement ton poste. Il arrive avec une réputation et un salaire supérieurs aux tiens. On te demande ta réaction avant que la presse ne la demande. Qu'est-ce que tu réponds ?`,
  rumeur_licenciement_coach: (e, v) =>
    `La presse annonce que ${v.coachNom ?? 'ton entraîneur'} est sur un siège éjectable. Le vestiaire en parle à voix basse, et un micro se tend vers toi à la sortie du centre. Tu dis quoi ?`,

  // ── Vie privée ─────────────────────────────────────────────────────────
  rencontre_sentimentale: (_e, v) =>
    `Tu vois quelqu'un depuis quelques semaines. Ça commence à se savoir, et une photo de vous deux circule déjà. Il faut décider : vous officialisez, ou vous restez discrets. Tu en dis quoi ?`,
  deuil_proche: (_e, v) =>
    `Tu as appris un décès dans ton entourage proche ce matin. Le club te propose de te libérer quelques jours, sans condition. ${v.prenom}, qu'est-ce que tu veux faire ?`,
  maladie_parent: (_e, v) =>
    `Un appel de chez toi : un de tes proches est hospitalisé, les nouvelles sont incertaines. Tu es à trois jours d'un match. Personne au club ne le sait encore. Qu'est-ce que tu fais ?`,
  probleme_amende: (_e, v) =>
    `Une amende de stationnement récupérée par un site people : rien de grave, mais ton nom se retrouve dans une brève moqueuse. Le service com du club te demande si tu veux répondre. Tu réponds quoi ?`,
  coup_de_fil_famille: (_e, v) =>
    `Ta mère t'appelle en pleine préparation. Elle veut des nouvelles, savoir si tu manges correctement, si tu rentres bientôt. Tu as une séance vidéo dans vingt minutes. Tu lui dis quoi ?`,

  // ── Coups du sort ──────────────────────────────────────────────────────
  petite_alerte_musculaire: (_e, v) =>
    `Tu as senti quelque chose derrière la cuisse en fin de séance. Rien de net, mais le kiné a vu ta grimace et attend que tu lui dises la vérité. Match dans trois jours. Tu lui dis quoi ?`,
  incident_voyage: (_e, v) =>
    `Le déplacement tourne mal : vol retardé, arrivée à l'hôtel en pleine nuit, groupe fatigué et agacé. Un cadre te demande de donner le ton devant les jeunes. Qu'est-ce que tu dis au groupe ?`,

  // ── Presse et club ─────────────────────────────────────────────────────
  fuite_presse: (_e, v) =>
    `Une information te concernant a fuité avant que tu sois au courant : des détails sur ta situation à ${v.club} que seuls quelques initiés connaissaient. La presse veut une réaction avant de publier. Qu'est-ce qu'on répond ?`,
  annonce_club_investissement: (_e, v) =>
    `${v.club} annonce un projet ambitieux : nouvelles infrastructures, recrutement, objectifs relevés. On te tend un micro pour la réaction des joueurs. Qu'est-ce que tu en dis ?`,
  sondage_supporters_selection: (_e, v) =>
    `Un sondage circule sur ta place possible en sélection : une partie du public te voit convoqué, une autre trouve ça très prématuré. Un journaliste te met le résultat sous le nez. Tu réagis comment ?`,
};

/**
 * Réplique d'ouverture d'un événement : contexte, interlocuteur, question
 * ouverte. Repli générique si la définition n'a pas d'intro dédiée.
 */
export function eventIntro(event: GameEvent, vars: IntroVars): string {
  const intro = INTROS[event.definitionId];
  if (intro) return intro(event, vars).replace(/\s+/g, ' ').trim();
  const details = Object.values(event.facts)
    .filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 80)
    .join(', ');
  return `${event.title}.${details ? ` Il est question de ${details}.` : ''} ${vars.prenom}, qu'est-ce que tu en dis ?`.replace(/\s+/g, ' ').trim();
}

/** Vrai si l'événement a une mise en situation écrite (utile aux tests de couverture). */
export function hasEventIntro(definitionId: string): boolean {
  return definitionId in INTROS;
}
