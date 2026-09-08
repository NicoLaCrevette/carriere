/**
 * Classificateur d'intention par mots-clés (Phase 3, et repli sans LLM).
 *
 * Règle absolue (§6.1) : le texte du joueur est une intention, jamais une
 * issue. « Je marque en lucarne » devient une frappe visant la lucarne avec
 * un risque élevé ; « je mets le but à 100 % » devient une frappe ordinaire ;
 * « tu dois me faire marquer » est une instruction méta → non-décision.
 */
import type { ClassifiedAction, MatchActionId, ShotZone, Situation } from '../../engine/types';

interface Rule {
  action: MatchActionId;
  patterns: RegExp[];
  /** Priorité en cas de plusieurs correspondances (plus haut gagne). */
  priority: number;
}

/** Normalise : minuscules, accents retirés, ponctuation espacée. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'-]/g, ' ')
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const META_PATTERNS: RegExp[] = [
  /\btu dois\b/, /\bfais que\b/, /\bfaites que\b/, /\bignore (les|la|le|tes|ta|ton) (regles?|consignes?|moteur|jeu|instructions?)\b/, /\bignore tout\b/, /\boublie les regles\b/, /\bje suis a 99\b/,
  /\b99 partout\b/, /\bje gagne \d/, /\bon gagne \d/, /\bscore final\b/, /\btriche\b/, /\bcode\b/, /\bmode dieu\b/,
  /\bnarrateur\b/, /\bprompt\b/, /\bsysteme\b/, /\bcommande\b/, /\bdonne moi\b.*\b(but|victoire)\b/, /\bmets moi\b.*\bbut\b/,
  /\bje veux que (tu|le jeu|le moteur)\b/, /\bc est injuste\b/, /\bt es oblige\b/, /\bje t ordonne\b/, /\bregle\b.*\bchange\b/,
];

/** Affirmations de résultat : réécrites en tentative (jamais d'effet). */
const RESULT_CLAIMS: RegExp[] = [
  /\bje marque\b/, /\bca rentre\b/, /\bc est but\b/, /\bet c est but\b/, /\bje mets le but\b/, /\bje score\b/, /\bje plante\b/,
  /\b100 ?%/, /\ba coup sur\b/, /\bforcement\b/, /\bje ne peux pas rater\b/, /\bimparable\b/,
];

const RULES: Rule[] = [
  // Gardien
  { action: 'gb_plonger_gauche', patterns: [/\bplonge .*gauche\b/, /\ba gauche\b.*\bplonge/, /\bcote gauche\b/], priority: 9 },
  { action: 'gb_plonger_droite', patterns: [/\bplonge .*droite\b/, /\ba droite\b.*\bplonge/, /\bcote droit\b/], priority: 9 },
  { action: 'gb_rester_centre', patterns: [/\breste au centre\b/, /\bau milieu\b.*\breste/, /\bje bouge pas\b/], priority: 9 },
  { action: 'gb_rester_ligne', patterns: [/\breste sur (ma|la) ligne\b/, /\bje reste debout\b/, /\bje reste sur mes appuis\b/], priority: 8 },
  { action: 'gb_sortie_aerienne', patterns: [/\bsortie aerienne\b/, /\bje sors (au|aux) poing/, /\bje capte\b/, /\bje vais chercher le ballon en l air\b/], priority: 8 },
  { action: 'gb_sortir', patterns: [/\bje sors dans (ses|les) pieds\b/, /\bje sors\b/, /\bje reduis l angle\b/, /\bsortie\b/], priority: 7 },
  { action: 'gb_relance_courte', patterns: [/\brelance courte\b/, /\ba la main\b/, /\brelance court\b/, /\bje donne au defenseur\b/], priority: 8 },
  { action: 'gb_degagement_long', patterns: [/\bdegagement long\b/, /\bje degage loin\b/, /\bgrand degagement\b/, /\bballon long\b/], priority: 8 },
  // Penalty
  { action: 'penalty_panenka', patterns: [/\bpanenka\b/, /\bpique\b.*\bcentre\b/], priority: 9 },
  { action: 'penalty_puissance', patterns: [/\bpenalty\b.*\b(puissance|force|fort)\b/, /\bje frappe fort\b.*\bpenalty\b/, /\bpleine puissance\b/], priority: 8 },
  { action: 'penalty_placer', patterns: [/\bpenalty\b/, /\bje (le )?place\b/, /\bplace\b.*\bcote\b/], priority: 6 },
  // Coups de pied arrêtés
  { action: 'coup_franc_frappe', patterns: [/\bcoup franc\b.*\b(frappe|tire|direct|lucarne)\b/, /\bje tente le coup franc\b/, /\bdirect(ement)? au but\b/], priority: 8 },
  { action: 'coup_franc_centre', patterns: [/\bcoup franc\b.*\bcentre\b/, /\bje centre le coup franc\b/], priority: 8 },
  { action: 'coup_franc_passe', patterns: [/\bcoup franc\b.*\b(court|passe)\b/, /\bje joue court\b/], priority: 7 },
  { action: 'corner_rentrant', patterns: [/\bcorner rentrant\b/, /\brentrant\b/], priority: 8 },
  { action: 'corner_sortant', patterns: [/\bcorner sortant\b/, /\bsortant\b/], priority: 8 },
  { action: 'corner_court', patterns: [/\bcorner court\b/, /\ba deux\b.*\bcorner\b/, /\bje joue le corner court\b/], priority: 8 },
  // Tirs
  { action: 'lob', patterns: [/\blob\b/, /\bpique\b/, /\bpar dessus le gardien\b/, /\bje le lobe\b/], priority: 8 },
  { action: 'tete', patterns: [/\bde la tete\b/, /\btete\b/, /\bje saute\b.*\bballon\b/, /\bcoup de tete\b/], priority: 7 },
  { action: 'frappe_premiere_intention', patterns: [/\bpremiere intention\b/, /\breprise de volee\b/, /\breprise\b/, /\bsans controle\b/, /\bvolee\b/, /\bdirectement\b.*\bfrappe/], priority: 8 },
  { action: 'frappe_lointaine', patterns: [/\bde loin\b/, /\blointaine\b/, /\bde (25|30|35|40) metres\b/, /\bdepuis (mon camp|le milieu)\b/, /\bfrappe longue\b/], priority: 7 },
  { action: 'frappe', patterns: [/\bfrappe\b/, /\btire\b/, /\btir\b/, /\bje shoote\b/, /\bshoot\b/, /\bje tente ma chance\b/, /\bje marque\b/, /\bau but\b/, /\bje plante\b/, /\ben lucarne\b/, /\bje score\b/, /\bje mets le but\b/, /\bje place (le ballon|ma frappe|mon tir)\b/, /\bje (la|le) mets\b.*\bpoteau\b/, /\bje croise\b/, /\bpetit filet\b/, /\bj enroule\b/, /\benrouler\b/, /\bje decoche\b/, /\bj ajuste\b/, /\bje l envoie\b.*\b(filet|but|lucarne)\b/, /\bau fond des filets\b/, /\bdans les filets\b/], priority: 5 },
  // Dribbles
  { action: 'dribble_gardien', patterns: [/\b(dribble|elimine|contourne|passe) le gardien\b/, /\bgardien\b.*\b(dribble|elimine)\b/], priority: 9 },
  { action: 'crochet', patterns: [/\bcrochet\b/, /\bfeinte\b/, /\bje le prends a contre pied\b/], priority: 7 },
  { action: 'accelerer', patterns: [/\bj accelere\b/, /\bacceleration\b/, /\bje prends la profondeur balle au pied\b/, /\bje fonce\b/, /\bje pars en vitesse\b/, /\bje le prends de vitesse\b/], priority: 7 },
  { action: 'dribble', patterns: [/\bdribble\b/, /\bj elimine\b/, /\bje passe\b.*\bdefenseur/, /\bpetit pont\b/, /\bgrand pont\b/, /\bpassement de jambes\b/, /\bje le mystifie\b/, /\bje les (passe|elimine|dribble)\b/], priority: 6 },
  // Passes
  { action: 'une_deux', patterns: [/\bune? ?deux\b/, /\b1 2\b/, /\bje combine\b/], priority: 8 },
  { action: 'centre_en_retrait', patterns: [/\ben retrait\b/, /\bje remets en retrait\b/], priority: 8 },
  { action: 'centre', patterns: [/\bcentre\b/, /\bje deborde et je centre\b/, /\bcentrer\b/], priority: 6 },
  { action: 'passe_profondeur', patterns: [/\ben profondeur\b/, /\bdans le dos\b/, /\bdans l espace\b/, /\bje lance\b/, /\bdans la course\b/, /\bpasse decisive\b/, /\bje l envoie au but\b/], priority: 7 },
  { action: 'passe_longue', patterns: [/\bpasse longue\b/, /\blong ballon\b/, /\btransversale\b/, /\bje renverse\b/, /\bchangement d aile\b/], priority: 7 },
  { action: 'remise', patterns: [/\bremise\b/, /\bje remets\b/, /\bje devie\b/, /\bje pose\b.*\bballon\b/], priority: 7 },
  { action: 'relancer_long', patterns: [/\brelance longue\b/, /\brelance long\b/, /\bje relance loin\b/], priority: 7 },
  { action: 'relancer_court', patterns: [/\brelance courte\b/, /\bje relance\b/, /\brelance\b/, /\bje ressors le ballon\b/], priority: 6 },
  { action: 'passe_courte', patterns: [/\bpasse\b/, /\bje donne\b/, /\bje sers\b/, /\bje joue simple\b/, /\bje transmets\b/, /\bje decale\b/], priority: 4 },
  // Sans ballon (un appel se fait sans ballon : « je place le ballon au deuxième poteau » est une frappe)
  { action: 'appel_premier_poteau', patterns: [/\b(appel|je vais|je file|je pars|je me jette|je surgis)\b.*\bpremier poteau\b/, /\bpremier poteau\b(?!.*\b(ballon|frappe|tir|place|mets)\b)/, /\bpoteau proche\b/], priority: 8 },
  // « Poteau opposé » désigne aussi bien la course que la cible d'une frappe : sans verbe d'appel ni verbe de tir, c'est une course.
  { action: 'appel_deuxieme_poteau', patterns: [/\b(appel|je vais|je file|je pars|je me jette|je surgis)\b.*\b(deuxieme|second) poteau\b/, /\b(deuxieme|second) poteau\b(?!.*\b(ballon|frappe|tir|place|mets)\b)/, /\bpoteau (oppose|eloigne)\b(?!.*\b(ballon|frappe|tir|place|mets)\b)/], priority: 8 },
  { action: 'appel_profondeur', patterns: [/\bappel\b.*\bprofondeur\b/, /\bje prends la profondeur\b/, /\bje pars dans le dos\b/, /\bcourse dans le dos\b/, /\bje fais l appel\b/, /\bappel\b/], priority: 6 },
  { action: 'decrocher', patterns: [/\bje decroche\b/, /\bdecrochage\b/, /\bje viens chercher le ballon\b/, /\bje redescends\b/], priority: 7 },
  { action: 'fixer_defenseur', patterns: [/\bje fixe\b/, /\bfixer\b/, /\bj attire le defenseur\b/], priority: 7 },
  { action: 'rester_en_pivot', patterns: [/\bpivot\b/, /\bdos au but\b/, /\bje garde le ballon dos au but\b/, /\bpoint d appui\b/], priority: 7 },
  // Conservation
  { action: 'proteger_ballon', patterns: [/\bje protege\b/, /\bprotection\b/, /\bje garde le ballon\b/, /\bje mets le corps\b/], priority: 7 },
  { action: 'temporiser', patterns: [/\bje temporise\b/, /\btemporiser\b/, /\bje calme le jeu\b/, /\bje ralentis\b/, /\bje garde\b.*\bballon\b.*\btranquille/], priority: 7 },
  { action: 'conserver', patterns: [/\bje conserve\b/, /\bconservation\b/, /\bje garde\b/, /\bje ne prends pas de risque\b/], priority: 6 },
  // Défense
  { action: 'faute_tactique', patterns: [/\bfaute tactique\b/, /\bje le fauche\b/, /\bje fais faute\b/, /\bje le retiens\b/, /\bje casse le contre\b/, /\bje le stoppe\b.*\bfaute\b/], priority: 8 },
  { action: 'tacler', patterns: [/\btacle\b/, /\bje tacle\b/, /\bglissade\b/, /\bje me jette\b/], priority: 7 },
  { action: 'intercepter', patterns: [/\bintercepte\b/, /\binterception\b/, /\bje coupe la (passe|trajectoire)\b/, /\bje lis la passe\b/], priority: 7 },
  { action: 'bloquer', patterns: [/\bje bloque\b/, /\bje contre (le|la) (tir|frappe)\b/, /\bje me mets devant\b/, /\bbloc\b/], priority: 7 },
  { action: 'degager', patterns: [/\bje degage\b/, /\bdegagement\b/, /\bje balance\b/, /\ben touche\b/, /\bje vire\b/], priority: 7 },
  { action: 'couvrir', patterns: [/\bje couvre\b/, /\bcouverture\b/, /\bje recule\b/, /\bje reste derriere\b/, /\bje ferme\b/, /\bje temporise\b.*\bdefens/], priority: 6 },
  { action: 'marquer', patterns: [/\bje (le )?marque\b/, /\bmarquage\b/, /\bje reste sur lui\b/, /\bje le colle\b/, /\bje le prends\b/, /\bje suis mon joueur\b/], priority: 6 },
  { action: 'presser', patterns: [/\bpressing\b/, /\bje presse\b/, /\bje vais au pressing\b/, /\bje harcele\b/, /\bje vais le chercher\b/, /\bje monte sur (lui|le porteur)\b/], priority: 6 },
  // Comportement
  { action: 'simuler', patterns: [/\bje simule\b/, /\bsimulation\b/, /\bje plonge\b/, /\bje me laisse tomber\b/, /\bje tombe\b/, /\bje cherche (la faute|le penalty)\b/], priority: 8 },
  { action: 'protester', patterns: [/\bje proteste\b/, /\barbitre\b/, /\bje conteste\b/, /\bje gueule\b/, /\bje reclame\b/], priority: 7 },
  { action: 'provoquer', patterns: [/\bje (le |les )?provoque\b/, /\bje (le |les )?chambre\b/, /\bje l insulte\b/, /\bje le pousse\b/, /\bje le bouscule\b/, /\bje le nargue\b/], priority: 7 },
  { action: 'encourager', patterns: [/\bj encourage\b/, /\bje motive\b/, /\ballez les gars\b/, /\bje remonte le moral\b/, /\bje parle a mon coequipier\b/], priority: 6 },
  { action: 'calmer_le_jeu', patterns: [/\bje calme\b/, /\bon se calme\b/, /\bje reste calme\b/, /\bje ne reponds pas\b/, /\bje l ignore\b/, /\bje respire\b/], priority: 6 },
  { action: 'demander_changement', patterns: [/\bje demande (le|a) (changement|sortir)\b/, /\bje veux sortir\b/, /\bje (sors|leve la main)\b/, /\bchangement\b/], priority: 8 },
  { action: 'signaler_blessure', patterns: [/\bje signale\b/, /\bje suis blesse\b/, /\bje m arrete\b/, /\bj ai mal\b.*\b(je sors|je signale|au staff)\b/, /\bje previens le banc\b/], priority: 8 },
  { action: 'jouer_blesse', patterns: [/\bje serre les dents\b/, /\bje continue\b/, /\bje joue (avec la douleur|blesse)\b/, /\bje reste sur le terrain\b/, /\bje tiens\b/], priority: 7 },
  { action: 'attendre', patterns: [/\bj attends\b/, /\bje ne fais rien\b/, /\brien\b/, /\bje regarde\b/, /\bje reste en place\b/, /\bj applique la consigne\b/], priority: 3 },
];

const ZONE_PATTERNS: [RegExp, ShotZone][] = [
  [/\blucarne (gauche|a gauche)\b/, 'lucarne_gauche'],
  [/\blucarne (droite|a droite)\b/, 'lucarne_droite'],
  [/\blucarne\b/, 'lucarne_droite'],
  [/\bpremier poteau\b.*\b(sol|ras|bas)\b|\b(sol|ras|bas)\b.*\bpremier poteau\b|\bpremier poteau\b/, 'ras_de_terre_premier_poteau'],
  [/\b(deuxieme|second) poteau\b/, 'ras_de_terre_deuxieme_poteau'],
  [/\bentre les jambes\b|\bpetit pont\b.*\bgardien\b/, 'entre_les_jambes'],
  [/\bpar dessus\b|\ble lobe\b/, 'au_dessus_du_gardien'],
  [/\ba mi hauteur\b|\bmi hauteur\b/, 'mi_hauteur'],
  [/\bau sol\b|\bras de terre\b|\ba ras du poteau\b/, 'ras_de_terre_deuxieme_poteau'],
];

const HIGH_RISK: RegExp[] = [/\blucarne\b/, /\btout le monde\b/, /\bles (deux|trois|quatre) defenseurs\b/, /\btoute la defense\b/, /\bde (35|40|50) metres\b/, /\bdepuis mon camp\b/, /\bpanenka\b/, /\bcoup du foulard\b/, /\btalonnade\b/, /\bbicyclette\b/, /\bretournee\b/, /\bje tente le tout pour le tout\b/, /\bje prends (le|un) risque\b/];
const LOW_RISK: RegExp[] = [/\btranquille\b/, /\bsimple\b/, /\bplace\b/, /\bau sol\b/, /\bsans risque\b/, /\bpropre\b/, /\bcalmement\b/, /\bsecurite\b/, /\bje joue court\b/];
const HIGH_INTENSITY: RegExp[] = [/\bfort\b/, /\ba fond\b/, /\bpuissance\b/, /\bde toutes mes forces\b/, /\bje fonce\b/, /\bje me jette\b/, /\bviolemment\b/];
const LOW_INTENSITY: RegExp[] = [/\bdoucement\b/, /\ben douceur\b/, /\bdu bout du pied\b/, /\bcaresse\b/, /\bcalmement\b/];

/** Vrai si la phrase est une instruction méta (§6.2). */
export function isMetaInstruction(text: string): boolean {
  const n = normalize(text);
  return META_PATTERNS.some((p) => p.test(n));
}

/** Vrai si la phrase affirme un résultat (« je marque », « ça rentre »). */
export function claimsResult(text: string): boolean {
  const n = normalize(text);
  return RESULT_CLAIMS.some((p) => p.test(n));
}

function detectZone(n: string): ShotZone | undefined {
  for (const [pattern, zone] of ZONE_PATTERNS) if (pattern.test(n)) return zone;
  return undefined;
}

function detectRisk(n: string, base: number): number {
  let risk = base;
  if (HIGH_RISK.some((p) => p.test(n))) risk = Math.max(risk, 0.9);
  else if (LOW_RISK.some((p) => p.test(n))) risk = Math.min(risk, 0.3);
  if (/\bles trois\b|\btout le monde\b|\btoute la defense\b/.test(n)) risk = 0.95;
  return Math.round(risk * 100) / 100;
}

function detectIntensity(n: string): number {
  if (HIGH_INTENSITY.some((p) => p.test(n))) return 0.9;
  if (LOW_INTENSITY.some((p) => p.test(n))) return 0.3;
  return 0.6;
}

/** Cible de passe : nom d'un coéquipier proche cité dans la phrase. */
function detectTeammate(n: string, situation: Situation, names: Record<string, string> | undefined): string | undefined {
  if (!names) return undefined;
  for (const id of situation.nearbyTeammateIds) {
    const name = names[id];
    if (!name) continue;
    const last = normalize(name).split(' ').pop();
    if (last && last.length >= 3 && n.includes(last)) return id;
  }
  return undefined;
}

/**
 * Classe une phrase libre en action canonique. `names` associe les ids des
 * coéquipiers proches à leur nom, pour les cibles de passe. Ne renvoie jamais
 * un résultat : seulement une intention, un risque, une intensité.
 */
export function classifyByKeywords(text: string, situation: Situation, names?: Record<string, string>): ClassifiedAction {
  const raw = text ?? '';
  const n = normalize(raw);
  if (n.length === 0) return { ...situation.defaultAction, communication: undefined };
  if (isMetaInstruction(raw)) {
    return { action: 'aucune', intensite: 0.5, risque: 0.5, meta: true, communication: raw.slice(0, 120) };
  }

  const matches = RULES
    .filter((r) => r.patterns.some((p) => p.test(n)))
    .sort((a, b) => {
      const allowedA = situation.allowedActions.includes(a.action) ? 1 : 0;
      const allowedB = situation.allowedActions.includes(b.action) ? 1 : 0;
      return allowedB - allowedA || b.priority - a.priority;
    });

  let action: MatchActionId | undefined = matches[0]?.action;
  if (!action) {
    // Affirmation de résultat sans verbe reconnu → tentative de frappe si possible.
    if (claimsResult(raw)) action = situation.allowedActions.includes('frappe') ? 'frappe' : situation.defaultAction.action;
    else return { ...situation.defaultAction, communication: raw.slice(0, 120) };
  }
  // Le penalty se tire : « je place » sans le mot penalty dans une situation de penalty.
  if (situation.kind === 'penalty' && !action.startsWith('penalty_')) {
    action = /\b(puissance|force|fort)\b/.test(n) ? 'penalty_puissance' : /\bpanenka\b/.test(n) ? 'penalty_panenka' : 'penalty_placer';
  }
  if (situation.kind === 'gardien_penalty' && !action.startsWith('gb_')) {
    action = /\bgauche\b/.test(n) ? 'gb_plonger_gauche' : /\bdroite\b/.test(n) ? 'gb_plonger_droite' : 'gb_rester_centre';
  }

  const shot = action === 'frappe' || action === 'frappe_premiere_intention' || action === 'frappe_lointaine' || action === 'tete' || action === 'lob';
  const zone = shot ? detectZone(n) : undefined;
  const baseRisk = shot ? 0.45 : action === 'dribble' || action === 'crochet' || action === 'dribble_gardien' ? 0.5 : 0.4;
  const risque = detectRisk(n, zone && zone.startsWith('lucarne') ? 0.9 : baseRisk);
  const classified: ClassifiedAction = { action, intensite: detectIntensity(n), risque, meta: false };
  if (zone) classified.cible = zone;
  const teammate = detectTeammate(n, situation, names);
  if (teammate) classified.cible = teammate;
  else if (!zone && (action === 'dribble' || action === 'accelerer') && /\bgauche\b/.test(n)) classified.cible = 'gauche';
  else if (!zone && (action === 'dribble' || action === 'accelerer') && /\bdroite\b/.test(n)) classified.cible = 'droite';
  const quoted = /[«"](.+?)[»"]/.exec(raw);
  if (quoted) classified.communication = quoted[1]!.slice(0, 120);
  return classified;
}
