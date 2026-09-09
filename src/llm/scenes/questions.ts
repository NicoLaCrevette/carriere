/**
 * Banques de questions et d'ouvertures de repli (sans LLM) pour les scènes
 * de dialogue : conférence de presse, interview flash, vestiaire, agent,
 * bureau du coach. Les questions s'appuient sur des faits fournis.
 */
import type { PlayerMatchReport } from '../../engine/types';

export interface SceneFacts {
  prenom: string;
  nom: string;
  club: string;
  adversaire?: string;
  scoreFor?: number;
  scoreAgainst?: number;
  report?: PlayerMatchReport;
  coachNom?: string;
  rang?: number;
  /** Promesse publique en cours (texte). */
  promesse?: string;
  /** Concurrent au poste. */
  concurrent?: string;
  minutesSaison?: number;
  butsSaison?: number;
  /** Matchs consécutifs sans entrer en jeu. */
  matchsSansJouer?: number;
  /**
   * Offre de transfert sur la table. Sans ces faits, l'agent appelait pour une
   * offre qu'il refusait de nommer : le préambule interdit au modèle d'inventer
   * un chiffre, et rien ne lui en fournissait.
   */
  offre?: {
    club: string;
    pret: boolean;
    /** Prolongation proposée par le club actuel, et non un départ. */
    prolongation: boolean;
    indemnite: string;
    salaire: string;
    annees: number;
    role: string;
    posture: string;
    expireLe: string;
  };
  /** Issue retenue pour un événement de vie (après la réponse du joueur). */
  issue?: string;
}

function outcome(f: SceneFacts): 'victoire' | 'defaite' | 'nul' | undefined {
  if (f.scoreFor === undefined || f.scoreAgainst === undefined) return undefined;
  return f.scoreFor > f.scoreAgainst ? 'victoire' : f.scoreFor < f.scoreAgainst ? 'defaite' : 'nul';
}

/** Questions de conférence de presse, du plus factuel au plus piégeux. */
export function pressQuestions(f: SceneFacts, severity: 'moderee' | 'forte' | 'brutale'): string[] {
  const r = f.report;
  const o = outcome(f);
  const q: string[] = [];
  if (o === 'victoire') q.push(`${f.prenom}, ${f.scoreFor}-${f.scoreAgainst} contre ${f.adversaire ?? 'cet adversaire'} : qu'est-ce qui a fait la différence ce soir ?`);
  if (o === 'defaite') q.push(`Défaite ${f.scoreFor}-${f.scoreAgainst} contre ${f.adversaire ?? 'cet adversaire'}. Qu'est-ce qui n'a pas fonctionné ?`);
  if (o === 'nul') q.push(`Un nul ${f.scoreFor}-${f.scoreAgainst} contre ${f.adversaire ?? 'cet adversaire'}. Deux points perdus ou un point pris ?`);
  if (r && r.stats.goals > 0) q.push(`${r.stats.goals > 1 ? 'Un doublé' : 'Un but'} ce soir. Vous vous attendiez à peser autant ?`);
  if (r && r.minutesPlayed > 0 && r.rating < 5.5) q.push(severity === 'brutale' ? `Une note de ${r.rating.toFixed(1)} ce soir. On commence à parler de surcote à votre sujet. Vous répondez quoi ?` : `Une soirée compliquée pour vous personnellement. Comment vous l'expliquez ?`);
  if (r && r.subbedOffReason === 'mauvais match') q.push(`Vous êtes sorti à la ${r.subbedOffMinute}e minute. Vous avez compris le choix de ${f.coachNom ?? 'votre entraîneur'} ?`);
  if (r && !r.started && r.minutesPlayed > 0) q.push(`Encore une entrée en jeu. Le statut de remplaçant, ça commence à peser ?`);
  if (f.promesse) q.push(`Vous aviez dit : « ${f.promesse} ». Vous vous en souvenez ?`);
  if (f.concurrent) q.push(`${f.concurrent} occupe le poste. Vous vous sentez capable de le déloger ?`);
  if (f.rang !== undefined && f.rang >= 15) q.push(`Le club est ${f.rang}e. Le maintien devient une vraie question ?`);
  if (severity !== 'moderee') q.push(`Certains supporters s'interrogent sur votre implication. Qu'est-ce que vous leur dites ?`);
  q.push(`Un mot sur la suite ? Le prochain match arrive vite.`);
  return q;
}

/** Question d'interview flash (une seule). */
export function flashQuestion(f: SceneFacts): string {
  const r = f.report;
  const o = outcome(f);
  if (r && r.motm) return `${f.prenom}, homme du match ce soir. Votre première réaction ?`;
  if (r && r.stats.goals > 0 && o === 'victoire') return `Buteur et victoire, la soirée parfaite ?`;
  if (r && r.stats.redCards > 0) return `Vous sortez de ce match avec un carton rouge. Vous regrettez votre geste ?`;
  if (o === 'defaite') return `${f.prenom}, une défaite qui fait mal. À chaud, qu'est-ce que vous retenez ?`;
  if (o === 'victoire') return `Trois points ce soir. Le mot de la fin ?`;
  return `Un point pris ce soir. Satisfait ?`;
}

/** Ouverture de la causerie ou de l'échange de vestiaire par le coach ou le capitaine. */
export function lockerRoomOpening(f: SceneFacts, who: 'coach' | 'capitaine'): string {
  const o = outcome(f);
  const r = f.report;
  if (who === 'coach') {
    if (o === 'defaite' && r && r.rating < 5.5) return `${f.prenom}, viens là. Je t'ai vu ce soir. Tu m'expliques ?`;
    if (o === 'defaite') return `On a perdu, et on a mal perdu. Je veux entendre ce que chacun a à dire. ${f.prenom} ?`;
    if (r && r.stats.goals > 0) return `Bon match, ${f.prenom}. Mais je t'ai vu relâcher sur la fin. Tu en penses quoi ?`;
    return `${f.prenom}, un mot sur ton match ?`;
  }
  if (o === 'defaite') return `Les gars, on se regarde en face. ${f.prenom}, toi qui es jeune, tu as vu quoi ce soir ?`;
  if (r && r.stats.goals > 0) return `Le petit a marqué ! Alors, ça fait quoi ?`;
  return `${f.prenom}, viens, on fait le point deux minutes.`;
}

/** Ouverture d'un appel de l'agent. */
export function agentOpening(f: SceneFacts, topic: 'temps_de_jeu' | 'contrat' | 'interet' | 'image'): string {
  switch (topic) {
    case 'temps_de_jeu': return `${f.prenom}, c'est moi. ${f.minutesSaison ?? 0} minutes cette saison. Je ne vais pas te mentir, ça commence à se voir. Tu veux qu'on fasse quoi ?`;
    case 'contrat': return `${f.prenom}. Ton contrat, on doit en parler. Le club traîne, et moi je n'aime pas quand ça traîne. Tu vois les choses comment ?`;
    case 'interet': {
      const o = f.offre;
      if (!o) return `${f.prenom}, écoute-moi bien. J'ai eu un coup de fil ce matin. Un club te suit. Toi, tu en penses quoi, sur le principe ?`;
      if (o.prolongation) {
        return `${f.prenom}, c'est moi. ${o.club} veut prolonger : ${o.salaire} par mois sur ${o.annees} an${o.annees > 1 ? 's' : ''}, avec un rôle de ${o.role}. Tu as jusqu'au ${o.expireLe} pour répondre. Tu signes, ou on fait monter les enchères ?`;
      }
      const argent = o.pret ? 'un prêt d’une saison, sans indemnité' : `${o.indemnite} d’indemnité`;
      return `${f.prenom}, écoute-moi bien. ${o.club} te veut : ${argent}, ${o.salaire} par mois sur ${o.annees} an${o.annees > 1 ? 's' : ''}, et ils te promettent un rôle de ${o.role}. ${o.posture[0]!.toUpperCase()}${o.posture.slice(1)}. Tu as jusqu'au ${o.expireLe}. Tu en dis quoi ?`;
    }
    default: return `${f.prenom}. Il faut qu'on parle de ton image. Tout se voit, tout se retient. Dis-moi comment tu vois ta communication.`;
  }
}

/** Ouverture d'une convocation dans le bureau du coach. */
export function coachOfficeOpening(f: SceneFacts, reason: 'sanction' | 'felicitations' | 'statut' | 'attitude'): string {
  switch (reason) {
    case 'sanction': return `Assieds-toi. Tu sais pourquoi tu es là. Je veux t'entendre avant de décider.`;
    case 'felicitations': return `Je ne le dis pas souvent : ces dernières semaines, tu as été bon. Je veux savoir si tu peux tenir ça. Tu en penses quoi ?`;
    case 'statut': {
      const sans = f.matchsSansJouer ?? 0;
      const debut = sans >= 3
        ? `Ça fait ${sans} matchs que tu ne rentres pas. Je ne vais pas te raconter d'histoires : aujourd'hui, tu n'es pas dans mes plans.`
        : `Parlons de ta place dans l'équipe.`;
      const devant = f.concurrent ? ` ${f.concurrent} est devant toi, et tu le sais.` : '';
      return `${debut}${devant} Soit tu me prouves le contraire à l'entraînement, soit tu vas chercher du temps de jeu ailleurs. Qu'est-ce que tu veux faire ?`;
    }
    default: return `On m'a rapporté des choses sur ton attitude. Je préfère l'entendre de toi.`;
  }
}
