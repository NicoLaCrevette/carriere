/**
 * Description de repli d'une situation de match (sans LLM) : deuxième
 * personne, présent, faits structurés uniquement, termine par « Que fais-tu ? ».
 */
import type { Situation, SituationKind } from '../../engine/types';

type F = Record<string, string | number | boolean>;
const s = (f: F, key: string, fallback: string): string => (f[key] === undefined || f[key] === '' ? fallback : String(f[key]));

const TEMPLATES: Record<SituationKind, (f: F, c: Situation['context']) => string> = {
  centre_a_venir: (f) => `${s(f, 'passeur', 'Ton ailier')} déborde côté ${s(f, 'cote', 'droit')} et lève la tête. Tu es entre les deux centraux, ${s(f, 'defenseur', 'ton défenseur')} t'a dans le dos${f.marquageIndividuel ? ' et ne te lâche pas d\'une semelle' : ''}. Le premier poteau semble libre.`,
  occasion_surface: (f, c) => f.filetVide
    ? `${s(f, 'gardien', 'Le gardien')} est battu, le ballon arrive sur toi à ${c.distanceM} m, le but est vide.`
    : `Le ballon arrive dans tes pieds à ${c.distanceM} m, ${s(f, 'cote', 'axe') === 'axe' ? 'plein axe' : `côté ${s(f, 'cote', '')}`}. ${s(f, 'defenseur', 'Un défenseur')} revient sur toi, ${s(f, 'gardien', 'le gardien')} ajuste sa position.`,
  face_a_face: (f, c) => `Tu es lancé en profondeur, seul face à ${s(f, 'gardien', 'le gardien')} qui sort à ta rencontre, à ${c.distanceM} m. ${s(f, 'defenseur', 'Un défenseur')} revient à toute vitesse dans ton dos.`,
  un_contre_un: (f) => `Balle au pied côté ${s(f, 'cote', 'droit')}, ${s(f, 'defenseur', 'le latéral')} vient au duel, bien campé sur ses appuis. Derrière lui, de l'espace.`,
  contre_attaque: (f, c) => `Contre-attaque ! Tu emmènes le ballon à ${c.distanceM} m du but, ${s(f, 'passeur', 'un coéquipier')} déboule en soutien, ${s(f, 'defenseur', 'le dernier défenseur')} recule en te fixant.`,
  reception_dos_au_but: (f, c) => `Tu reçois dos au but à ${c.distanceM} m, ${s(f, 'defenseur', 'le central')} collé dans ton dos, ${s(f, 'passeur', 'un milieu')} qui suit l'action.`,
  frappe_lointaine_possible: (f, c) => `Le ballon te revient à ${c.distanceM} m, personne ne vient au pressing, ${s(f, 'gardien', 'le gardien')} est un peu avancé sur sa ligne.`,
  penalty: (f) => `Penalty. Le ballon est posé sur le point, ${s(f, 'gardien', 'le gardien')} te fixe depuis sa ligne, le stade retient son souffle.`,
  coup_franc_direct: (f, c) => `Coup franc à ${c.distanceM} m, légèrement ${s(f, 'cote', 'excentré')}. Le mur se met en place, ${s(f, 'gardien', 'le gardien')} cherche l'angle.`,
  coup_franc_indirect: (f, c) => `Coup franc excentré à ${c.distanceM} m. Tes grands montent dans la surface, ${s(f, 'defenseur', 'un défenseur')} prend le marquage.`,
  corner_offensif: (f) => f.tireur === true
    ? 'Corner pour ton équipe. Tu te places au poteau de corner, la surface se remplit, les bras se tirent.'
    : `Corner. ${s(f, 'passeur', 'Un coéquipier')} va le tirer, ${s(f, 'defenseur', 'un défenseur')} te tient au point de penalty.`,
  derniere_passe: (f, c) => `Tu portes le ballon à ${c.distanceM} m du but, ${s(f, 'passeur', 'un attaquant')} fait l'appel, ${s(f, 'defenseur', 'le central')} hésite entre vous deux.`,
  appel_a_faire: (f) => `${s(f, 'passeur', 'Le milieu')} a le ballon et cherche une solution devant lui. ${s(f, 'defenseur', 'Ton défenseur')} te surveille du coin de l'œil.`,
  duel_defensif: (f, c) => f.aerien === true
    ? `Long ballon vers l'attaquant que tu marques, duel aérien à ${c.distanceM} m de ton but.`
    : `L'attaquant adverse, ${s(f, 'defenseur', 'un joueur rapide')}, s'avance sur toi balle au pied à ${c.distanceM} m du but.`,
  couverture: (f) => `Ton latéral est pris de vitesse, l'attaquant file vers la surface. Tu es le premier à pouvoir couvrir, ${s(f, 'passeur', 'ton coéquipier')} revient derrière toi.`,
  pressing_declenche: (f, c) => `Le défenseur adverse temporise à ${c.distanceM} m de son but, le ballon sur le mauvais pied. Le public te pousse à y aller.`,
  corner_defensif: (f) => `Corner adverse. Tu es au marquage dans la surface, ${s(f, 'defenseur', 'un grand gabarit')} monte pour le contester.`,
  relance_sous_pression: () => 'Ton gardien te donne le ballon aux abords de ta surface, l\'attaquant adverse fonce sur toi.',
  contre_adverse: (f) => `Contre adverse. L'attaquant part balle au pied, ${f.dernierDefenseur === true ? 'tu es le dernier défenseur' : 'un coéquipier revient à tes côtés'}.`,
  faute_tactique_possible: () => 'Le porteur adverse te passe devant, lancé vers le but. Tu peux encore l\'accrocher.',
  gardien_face_a_face: (f, c) => `L'attaquant est lancé seul vers toi, ballon devant lui, à ${c.distanceM} m. ${s(f, 'defenseur', 'Ton défenseur')} ne reviendra pas.`,
  gardien_sortie_aerienne: () => 'Centre haut dans ta surface, mêlée devant toi, l\'attaquant se jette.',
  gardien_relance: () => 'Ballon dans tes mains, l\'adversaire remonte son bloc, ton latéral demande le ballon.',
  gardien_penalty: () => 'Penalty contre toi. Le tireur pose le ballon sans te regarder, le stade gronde.',
  provocation_adverse: (f) => `${s(f, 'defenseur', 'Un adversaire')} vient te souffler quelque chose à l'oreille après l'action, sourire en coin.`,
  coequipier_en_difficulte: (f) => `${s(f, 'passeur', 'Un coéquipier')} vient de rater une passe simple, tête basse, sifflé par une partie du public.`,
  consigne_du_banc: () => 'Le coach te fait signe depuis la ligne de touche et t\'adresse une consigne, le doigt tendu.',
  tension_fin_de_match: (f, c) => `${c.minute}', le score est serré, tout le stade est debout. Une main dans le dos, un mot de trop : l'adversaire cherche la tension.`,
  blessure_ressentie: () => 'Une douleur vive vient de te traverser la cuisse en pleine course. Tu ralentis malgré toi.',
};

/** Texte de situation sans LLM. */
export function describeSituationFallback(situation: Situation): string {
  const body = (TEMPLATES[situation.kind] ?? (() => 'Le ballon arrive vers toi.'))(situation.facts, situation.context);
  const chain = situation.facts.enchainement === true ? 'Dans la foulée : ' : '';
  return `${situation.context.minute}' — ${chain}${body} Que fais-tu ?`;
}
