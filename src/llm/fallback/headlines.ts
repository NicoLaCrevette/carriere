/**
 * Titres de presse de repli (sans LLM) : deux à trois médias fictifs, ton
 * selon la prestation et la sévérité des médias.
 */
import type { DifficultyProfile, PlayerMatchReport } from '../../engine/types';
import type { Headlines } from '../schemas';

export interface HeadlineFacts {
  report: PlayerMatchReport;
  lastName: string;
  clubShort: string;
  opponentShort: string;
  scoreFor: number;
  scoreAgainst: number;
  severity: DifficultyProfile['mediaSeverity'];
}

const OUTLETS = ['La Dépêche du Stade', 'Foot Hebdo', 'Onze sur Onze', 'Le Quotidien de la Ville', 'Ballon Rond Mag'];

export function fallbackHeadlines(f: HeadlineFacts): Headlines {
  const { report: r, lastName, clubShort, opponentShort } = f;
  const st = r.stats;
  const won = f.scoreFor > f.scoreAgainst;
  const lost = f.scoreFor < f.scoreAgainst;
  const harsh = f.severity === 'brutale' ? 2 : f.severity === 'forte' ? 1 : 0;
  const list: Headlines['headlines'] = [];

  if (r.minutesPlayed <= 0) {
    list.push({ outlet: OUTLETS[0]!, title: `${clubShort} ${f.scoreFor}-${f.scoreAgainst} ${opponentShort} : ${lastName} n'a pas quitté le banc`, tone: 'neutre' });
    if (harsh >= 1) list.push({ outlet: OUTLETS[1]!, title: `Le cas ${lastName} : le coach a-t-il tourné la page ?`, tone: 'critique' });
    return { headlines: list };
  }
  if (st.redCards > 0) {
    list.push({ outlet: OUTLETS[0]!, title: `${lastName} expulsé, ${clubShort} plombé`, tone: 'critique' });
    list.push({ outlet: OUTLETS[2]!, title: harsh >= 1 ? `Tête brûlée : ${lastName} lâche les siens` : `Coup de sang de ${lastName}`, tone: harsh >= 2 ? 'moqueur' : 'critique' });
    return { headlines: list };
  }
  if (st.goals >= 2) {
    list.push({ outlet: OUTLETS[0]!, title: `Doublé de ${lastName}, ${clubShort} ${won ? 'régale' : 'ne gagne pas malgré son buteur'}`, tone: 'elogieux' });
    list.push({ outlet: OUTLETS[3]!, title: `${lastName}, l'homme qui fait lever ${clubShort}`, tone: 'elogieux' });
    return { headlines: list };
  }
  if (st.goals === 1 || st.assists >= 1) {
    list.push({ outlet: OUTLETS[0]!, title: `${lastName} décisif, ${clubShort} ${won ? 's\'impose' : lost ? 's\'incline quand même' : 'partage les points'}`, tone: won ? 'elogieux' : 'neutre' });
    if (r.rating < 6.5) list.push({ outlet: OUTLETS[1]!, title: `${lastName} décisif mais discret`, tone: 'neutre' });
    return { headlines: list };
  }
  if (r.motm || r.rating >= 7.8) {
    list.push({ outlet: OUTLETS[0]!, title: `${lastName} rayonne, ${clubShort} récompensé`, tone: 'elogieux' });
    return { headlines: list };
  }
  if (r.rating < 5) {
    list.push({ outlet: OUTLETS[1]!, title: harsh >= 1 ? `La surcote du gamin ? ${lastName} passe à côté` : `Soirée difficile pour ${lastName}`, tone: harsh >= 2 ? 'moqueur' : 'critique' });
    if (r.subbedOffReason === 'mauvais match') list.push({ outlet: OUTLETS[3]!, title: `Sorti à la ${r.subbedOffMinute}e : le coach a tranché pour ${lastName}`, tone: 'critique' });
    return { headlines: list };
  }
  if (r.subbedOffReason === 'mauvais match') {
    list.push({ outlet: OUTLETS[0]!, title: `${lastName} sorti à la ${r.subbedOffMinute}e, le message est clair`, tone: 'critique' });
    return { headlines: list };
  }
  list.push({ outlet: OUTLETS[0]!, title: `${clubShort} ${f.scoreFor}-${f.scoreAgainst} ${opponentShort} : ${lastName} ${r.started ? 'dans le rang' : 'en jeu sans peser'}`, tone: 'neutre' });
  if (harsh >= 2 && r.rating < 6) list.push({ outlet: OUTLETS[4]!, title: `${lastName}, encore transparent`, tone: 'moqueur' });
  return { headlines: list };
}
