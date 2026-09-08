/**
 * Narration de repli d'une issue d'action (sans LLM) : commentateur, public,
 * capitaine. Plusieurs variantes par issue, choisies de façon déterministe.
 */
import type { ActionOutcome, ClassifiedAction, OutcomeKind, Situation } from '../../engine/types';
import type { NarrationLine } from '../schemas';

type Vars = { nom: string; action: string; defenseur: string; gardien: string; passeur: string; zone: string; buteur: string; cible: string };

const V = (list: string[], i: number): string => list[i % list.length]!;

const COMMENT: Partial<Record<OutcomeKind, string[]>> = {
  but: ['BUUUT ! {nom} ! {action} et le ballon finit au fond !', 'Et c\'est au fond ! {nom} ne tremble pas, {gardien} est battu !', '{nom} ! Quel sang-froid, le ballon termine sa course dans les filets !'],
  arret: ['{nom} arme sa frappe... {gardien} se détend et repousse !', 'Belle tentative de {nom}, mais {gardien} est sur la trajectoire.', '{gardien} sort le grand jeu sur la frappe de {nom}.'],
  hors_cadre: ['{nom} frappe... à côté ! Le public soupire.', 'La tentative de {nom} s\'envole au-dessus de la barre.', 'Ça passe à côté du poteau, {nom} se prend la tête entre les mains.'],
  poteau: ['Le poteau ! {nom} n\'est pas passé loin !', 'Sur le montant ! Le stade se lève, le ballon ressort.', '{nom} touche du bois, quel dommage !'],
  contre: ['La frappe de {nom} est contrée par {defenseur}.', '{defenseur} se jette et détourne le tir de {nom}.', 'Contrée ! {defenseur} met le corps, le ballon file en corner.'],
  passe_decisive: ['{nom} sert {buteur} qui n\'a plus qu\'à conclure ! But !', 'Quelle passe de {nom} ! {buteur} la met au fond !', '{buteur} conclut le caviar de {nom} !'],
  passe_reussie: ['Passe propre de {nom}, le jeu continue.', '{nom} trouve {cible}, bien joué.', '{nom} joue juste vers {cible}.'],
  passe_ratee: ['La passe de {nom} est trop longue, ballon perdu.', '{nom} se manque, {defenseur} récupère.', 'Mauvaise passe de {nom}, l\'action est gâchée.'],
  occasion_creee: ['{nom} lance l\'action, ça devient dangereux !', 'Bonne idée de {nom}, l\'occasion est là.', '{nom} ouvre une brèche dans la défense.'],
  dribble_reussi: ['{nom} efface {defenseur} d\'un crochet !', 'Quel dribble de {nom} ! {defenseur} est resté sur place.', '{nom} passe en force et se retrouve en position.'],
  dribble_rate: ['{nom} tente le dribble... {defenseur} ne bouge pas et récupère.', '{defenseur} lit le dribble de {nom}, ballon perdu.', 'Trop de gourmandise de {nom}, {defenseur} le stoppe.'],
  duel_gagne: ['{nom} remporte son duel avec autorité.', 'Duel gagné par {nom}, propre.', '{nom} prend le dessus, l\'action adverse est stoppée.'],
  duel_perdu: ['{nom} perd son duel, l\'adversaire file.', '{nom} est pris de vitesse.', 'Duel perdu pour {nom}, danger !'],
  faute_subie: ['{defenseur} accroche {nom}, coup franc.', 'Faute sur {nom}, l\'arbitre siffle.', '{nom} obtient la faute.'],
  faute_commise: ['{nom} fait faute, l\'arbitre siffle.', 'Intervention trop appuyée de {nom}, coup franc.', '{nom} arrête l\'action irrégulièrement.'],
  penalty_obtenu: ['PENALTY ! {nom} est fauché dans la surface !', '{defenseur} touche {nom} dans la surface, l\'arbitre montre le point !', 'Penalty pour {nom} !'],
  carton_jaune: ['Carton jaune pour {nom}.', 'L\'arbitre avertit {nom}.', 'Jaune logique pour {nom}.'],
  carton_rouge: ['ROUGE ! {nom} est expulsé !', 'L\'arbitre sort le rouge pour {nom}, son équipe va finir à dix.', 'Expulsion de {nom} ! Quelle catastrophe.'],
  hors_jeu: ['{nom} est parti trop tôt, hors-jeu signalé.', 'Drapeau levé, {nom} était hors-jeu.', 'Hors-jeu de {nom}, de quelques centimètres.'],
  ballon_conserve: ['{nom} garde le ballon sous pression.', '{nom} protège bien son ballon.', 'Conservation propre de {nom}.'],
  ballon_perdu: ['{nom} perd le ballon.', '{nom} se fait chiper le ballon par {defenseur}.', 'Ballon perdu par {nom}, mauvaise inspiration.'],
  tacle_reussi: ['Tacle impeccable de {nom} !', '{nom} tacle proprement et récupère.', 'Superbe tacle de {nom}.'],
  interception: ['{nom} lit la passe et intercepte !', 'Interception de {nom}, bien vu.', '{nom} coupe la trajectoire.'],
  degagement: ['{nom} dégage loin devant.', 'Dégagement de {nom}, le danger s\'éloigne.', '{nom} écarte le danger.'],
  simulation_sanctionnee: ['{nom} se laisse tomber... l\'arbitre n\'est pas dupe : carton jaune pour simulation !', 'Simulation grossière de {nom}, jaune, et le stade siffle.', 'L\'arbitre sanctionne le plongeon de {nom}.'],
  protestation_jaune: ['{nom} conteste trop longtemps, l\'arbitre l\'avertit.', 'Jaune pour contestation, {nom} l\'a cherché.', '{nom} prend un jaune pour ses protestations.'],
  blessure: ['{nom} se tient la cuisse et fait signe au banc.', '{nom} reste au sol, le staff médical entre.', 'Inquiétude : {nom} demande le changement.'],
  rien: ['{nom} temporise, rien à signaler.', 'L\'action se poursuit sans {nom}.', 'Rien ne se passe, le jeu reprend.'],
  gb_arret: ['ARRÊT de {nom} ! Quel réflexe !', '{nom} se détend et sauve son équipe !', 'Parade de {nom} !'],
  gb_but_encaisse: ['{nom} est battu, but.', 'Le ballon passe, {nom} ne pouvait rien.', 'But encaissé, {nom} regarde le ballon au fond.'],
  gb_sortie_reussie: ['{nom} sort et capte le ballon avec autorité.', 'Sortie parfaite de {nom}.', '{nom} s\'impose dans les airs.'],
  gb_sortie_ratee: ['{nom} sort et se manque, panique dans la surface !', 'Sortie hasardeuse de {nom}, le ballon traîne.', '{nom} rate sa sortie.'],
};

const PUBLIC_ON: Partial<Record<OutcomeKind, string>> = {
  but: 'Le stade explose !',
  poteau: 'Le public a cru au but.',
  penalty_obtenu: 'Le stade réclame le carton.',
  simulation_sanctionnee: 'Sifflets nourris.',
  carton_rouge: 'Le stade est sous le choc.',
  gb_arret: 'Ovation pour le gardien.',
};

const CAPTAIN_ON: Partial<Record<OutcomeKind, string>> = {
  simulation_sanctionnee: 'Arrête ça, tu nous ridiculises.',
  protestation_jaune: 'Laisse l\'arbitre tranquille et joue !',
  carton_rouge: 'Qu\'est-ce que tu as fait...',
  dribble_rate: 'Joue simple !',
  ballon_perdu: 'Garde-le, ce ballon !',
  but: 'Énorme, continue comme ça !',
  passe_decisive: 'Quelle passe !',
};

function fill(template: string, v: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, k: keyof Vars) => v[k] ?? '');
}

/** Narration sans LLM : commentateur, éventuellement public et capitaine. */
export function narrateOutcomeFallback(situation: Situation, action: ClassifiedAction, outcome: ActionOutcome, playerLastName: string, names: Record<string, string> = {}): NarrationLine[] {
  const f = situation.facts;
  const i = situation.actionIndex + situation.context.minute;
  const vars: Vars = {
    nom: playerLastName,
    action: String(outcome.facts.action ?? action.action),
    defenseur: String(f.defenseur ?? 'le défenseur'),
    gardien: String(f.gardien ?? 'le gardien'),
    passeur: String(f.passeur ?? 'un coéquipier'),
    zone: String(outcome.facts.zone ?? ''),
    buteur: String(outcome.facts.buteur ?? 'son coéquipier'),
    cible: String(outcome.facts.cible ?? (action.cible && names[action.cible]) ?? 'un coéquipier'),
  };
  const lines: NarrationLine[] = [];
  if (outcome.facts.absurde === true) {
    lines.push({ speaker: 'commentateur', text: `${playerLastName} tente l'impensable... et évidemment ça ne donne rien. Le ballon file n'importe où.` });
    lines.push({ speaker: 'public', text: 'Sifflets et rires dans les tribunes.' });
    lines.push({ speaker: 'capitaine', text: 'Mais qu\'est-ce que tu fais ?!' });
    return lines;
  }
  if (outcome.facts.varRefus === true) {
    lines.push({ speaker: 'commentateur', text: `${playerLastName} marque... mais la VAR intervient. But refusé, ${String(outcome.facts.motif ?? 'hors-jeu')}. La célébration tourne court.` });
    lines.push({ speaker: 'public', text: 'Le stade passe de la joie à la colère.' });
    return lines;
  }
  const comment = COMMENT[outcome.kind] ?? COMMENT.rien!;
  let text = fill(V(comment, i), vars);
  if (outcome.kind === 'but' && vars.zone.startsWith('lucarne')) text += ' Et en pleine lucarne !';
  if (outcome.kind === 'but' && outcome.facts.decisif === true) text += ' Un but qui change le match !';
  lines.push({ speaker: 'commentateur', text });
  const pub = PUBLIC_ON[outcome.kind];
  if (pub) lines.push({ speaker: 'public', text: pub });
  const cap = CAPTAIN_ON[outcome.kind];
  if (cap && (i % 2 === 0 || outcome.kind === 'simulation_sanctionnee' || outcome.kind === 'carton_rouge')) lines.push({ speaker: 'capitaine', text: cap });
  if (outcome.facts.occasionConcedee === true || outcome.facts.contreConcede === true) lines.push({ speaker: 'commentateur', text: 'Et l\'adversaire part en contre sur la perte de balle !' });
  return lines;
}
