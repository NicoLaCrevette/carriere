/**
 * Banque de répliques de repli par rôle et humeur (sans LLM). Sélection
 * déterministe. Placeholders : {prenom}, {club}, {adversaire}.
 */
import type { NpcKind } from '../../engine/types';
import type { NpcReply } from '../schemas';

type Mood = NpcReply['mood'];
type Bank = Partial<Record<Mood, string[]>>;

const GENERIC: Bank = {
  chaleureux: ['Je te sens bien, {prenom}. Continue.', 'C\'est ce que j\'aime entendre.', 'On avance ensemble, ça me va.'],
  neutre: ['D\'accord. On verra sur le terrain.', 'Très bien. Autre chose ?', 'Je note. On en reparle.'],
  froid: ['Si tu le dis.', 'Les mots, c\'est facile.', 'On jugera sur pièces.'],
  agace: ['Ce n\'est pas ce que je voulais entendre.', 'Tu ne m\'aides pas, là.', 'Réfléchis à ce que tu viens de dire.'],
  furieux: ['Ça suffit. On arrête là.', 'Tu dépasses les bornes.', 'Je ne veux plus t\'entendre aujourd\'hui.'],
  amuse: ['Tu ne manques pas d\'air, {prenom}.', 'Ah, celle-là je la garde.', 'On verra si tu tiens la route.'],
};

const BANKS: Partial<Record<NpcKind, Bank>> = {
  coach: {
    chaleureux: ['Tu as la bonne attitude. Garde-la à l\'entraînement lundi.', 'C\'est bien. Maintenant montre-le sur le terrain, pas devant moi.', 'Je compte sur toi. Ne me déçois pas.'],
    neutre: ['On verra ça à l\'entraînement.', 'Je prends note. Ma décision viendra du terrain.', 'D\'accord. Retourne travailler.'],
    froid: ['Tes phrases ne changent rien à ma composition.', 'Je préfère les joueurs qui parlent sur le terrain.', 'On en reparle quand tu auras enchaîné deux bons matchs.'],
    agace: ['Tu crois vraiment que c\'est ce que je veux entendre ?', 'Baisse d\'un ton. Ici c\'est moi qui décide.', 'Encore une sortie comme ça et tu regardes le match depuis la tribune.'],
    furieux: ['Dehors. On se reparle quand tu auras compris où tu es.', 'Tu viens de perdre ma confiance. Bon courage pour la récupérer.', 'Tribune. Point.'],
  },
  journaliste: {
    chaleureux: ['Merci pour votre franchise, c\'est rare.', 'Voilà une réponse claire. On en reparlera après le prochain match.', 'C\'est noté, et vos supporters apprécieront.'],
    neutre: ['Très bien. Et sur le match de dimanche ?', 'Je vois. Vous ne voulez pas en dire plus ?', 'D\'accord. Passons à autre chose.'],
    froid: ['On sent la langue de bois, non ?', 'Vous ne répondez pas vraiment à la question.', 'Je reformule, peut-être que vous m\'avez mal compris.'],
    agace: ['Vous ne facilitez pas notre travail.', 'C\'est une réponse, mais pas à ma question.', 'Le public mérite mieux que ça.'],
    amuse: ['Ah, ça, ça fera un titre.', 'Vous êtes sûr de vouloir que j\'écrive ça ?', 'Je vous cite mot pour mot, alors.'],
  },
  capitaine: {
    chaleureux: ['Bien parlé. On est derrière toi.', 'C\'est comme ça qu\'on avance. Continue.', 'Le vestiaire a entendu, et ça fait du bien.'],
    neutre: ['OK. Maintenant on bosse.', 'Mouais. On verra samedi.', 'Ça va. Ne te disperse pas.'],
    froid: ['Tu parles beaucoup pour quelqu\'un qui joue vingt minutes.', 'Ici, on gagne sa place, on ne la réclame pas.', 'Fais-le d\'abord, tu parleras après.'],
    agace: ['Ne recommence jamais ça devant les autres.', 'Tu viens de te mettre le vestiaire à dos.', 'Si tu as un problème, tu viens me voir, pas la presse.'],
    furieux: ['Tu ne parles plus au nom de l\'équipe. Jamais.', 'Sors de ma vue.', 'On réglera ça entre nous, mais ce n\'est pas fini.'],
  },
  agent: {
    chaleureux: ['Parfait, c\'est exactement ce que le marché veut entendre.', 'Tu me facilites la vie, continue comme ça.', 'Avec ça, je peux travailler.'],
    neutre: ['Bien. Je te rappelle quand j\'ai du concret.', 'OK. Ne fais rien sans m\'en parler.', 'Compris. Je prends la température.'],
    froid: ['Ne dis plus jamais ça à un journaliste.', 'Tu viens de faire baisser ta cote, tu sais ?', 'Laisse-moi les négociations, toi tu joues.'],
    agace: ['Tu me compliques la tâche, là.', 'On avait dit : pas un mot sur les transferts.', 'Tu veux vraiment finir ta carrière ici ?'],
    amuse: ['Tu as du culot, j\'aime ça, mais pas devant les micros.', 'Je ne sais pas si je dois rire ou pleurer.', 'Tu me feras mourir jeune.'],
  },
  mere: {
    chaleureux: ['Je suis fière de toi, mon grand.', 'Tu as bien parlé. Ton père aurait dit pareil.', 'Repose-toi, tu as l\'air fatigué.'],
    neutre: ['Tu manges bien au moins ?', 'Appelle ta grand-mère, elle te regarde à chaque match.', 'Fais attention à toi.'],
    froid: ['Ce n\'est pas comme ça que je t\'ai élevé.', 'Tu changes, et pas dans le bon sens.', 'Rappelle-toi d\'où tu viens.'],
    agace: ['Je ne te reconnais plus quand tu parles comme ça.', 'On ne parle pas comme ça des gens qui t\'aident.', 'Tu me fais de la peine.'],
  },
  coequipier: {
    chaleureux: ['Bien joué frérot, on est ensemble.', 'Merci d\'avoir dit ça, sincèrement.', 'T\'es un bon, continue.'],
    neutre: ['Ouais. On verra.', 'Ça marche.', 'OK, tranquille.'],
    froid: ['Facile à dire quand on n\'est pas sur le terrain.', 'Parle moins, joue plus.', 'On n\'est pas potes, hein.'],
    agace: ['Tu te prends pour qui ?', 'Ne me vise plus jamais comme ça.', 'C\'est ça, va le dire aux journalistes.'],
    furieux: ['Viens me le dire en face.', 'Toi et moi, c\'est terminé.', 'Tu vas le regretter.'],
  },
  selectionneur: {
    chaleureux: ['C\'est la réponse d\'un joueur que je veux voir en bleu.', 'Je vous observe depuis un moment. Ça se confirme.', 'Gardez cette humilité. Elle vous mènera loin.'],
    neutre: ['Continuez à travailler. La porte n\'est pas fermée.', 'Je regarde tous vos matchs. Tous.', 'On se reparlera au prochain rassemblement.'],
    froid: ['Ce n\'est pas avec ça qu\'on entre en sélection.', 'Je cherche des joueurs, pas des communicants.', 'Vous avez encore beaucoup à prouver.'],
  },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Réplique de repli pour un rôle et une humeur, déterministe pour une clé donnée. */
export function fallbackReply(kind: NpcKind, mood: Mood, vars: Record<string, string>, key: string): NpcReply {
  const bank = BANKS[kind]?.[mood] ?? BANKS[kind]?.neutre ?? GENERIC[mood] ?? GENERIC.neutre!;
  const line = bank[hash(key) % bank.length]!.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  return { reply: line, mood, wantsToContinue: mood !== 'furieux' };
}

/** Réaction à une phrase méta : incompréhension polie, retour au sujet. */
export function metaReply(kind: NpcKind, key: string): NpcReply {
  const lines = kind === 'journaliste'
    ? ['Pardon ? Je ne suis pas sûr de comprendre. Revenons au match, si vous voulez bien.', 'Je... d\'accord. Reprenons : sur le match de dimanche ?']
    : ['Qu\'est-ce que tu racontes ? Concentre-toi.', 'Je ne comprends rien à ce que tu dis. On reprend.'];
  return { reply: lines[hash(key) % lines.length]!, mood: 'neutre', wantsToContinue: true };
}
