/**
 * Analyse de communication de repli (sans LLM, §8) : heuristiques par
 * mots-clés et longueur. Deltas modestes, bornés, jamais plus de ±3.
 */
import type { CommunicationAnalysis, InteractionChannel, NpcKind, ReputationDeltas } from '../../engine/types';
import { addDays } from '../../engine/calendar/dates';
import { isMetaInstruction, normalize } from '../classify/keywords';
import { fallbackReply, metaReply } from './dialogues';

export interface FallbackAnalysisInput {
  text: string;
  channel: InteractionChannel;
  interlocutor: NpcKind;
  date: string;
  interrupted?: boolean;
  vars?: Record<string, string>;
  /** Match visé par une promesse (« je marquerai dimanche »), si connu. */
  promiseMatchId?: string;
  promiseDeadlineDays?: number;
}

const ARROGANCE = [/\bje suis le meilleur\b/, /\bpersonne ne peut\b/, /\bsans moi\b/, /\bje merite\b/, /\bils ne sont pas a mon niveau\b/, /\bje suis au dessus\b/, /\bfacile\b/, /\bje porte l equipe\b/, /\bqu ils regardent\b/];
const CRITIQUE_MATES = [/\bmes coequipiers (ne|n)\b/, /\bla defense a\b/, /\bils (n ont|ne m ont) pas\b/, /\bon ne me sert pas\b/, /\bpersonne ne me donne\b/, /\bmes partenaires (ne|n)\b/, /\bc est de leur faute\b/];
const CRITIQUE_COACH = [/\ble coach (n a|ne|aurait|devrait|s est trompe)\b/, /\bl entraineur (n a|ne|aurait|devrait|s est trompe)\b/, /\bses choix\b/, /\bje ne comprends pas (sa|ses) (decision|choix)\b/, /\bpourquoi je ne joue pas\b/, /\bje devrais etre titulaire\b/];
const CRITIQUE_REF = [/\barbitre\b/, /\barbitrage\b/, /\bscandaleux\b/, /\bvoles\b/, /\bvar\b.*\b(honte|scandale)\b/];
const PROMESSE = [/\bje vais marquer\b/, /\bje marquerai\b/, /\bje promets\b/, /\bon va gagner\b/, /\bon gagnera\b/, /\bje serai titulaire\b/, /\bje vous le promets\b/, /\bje m engage\b/, /\bvous verrez\b/];
const TEASING = [/\bpartir\b/, /\bailleurs\b/, /\bl avenir dira\b/, /\bon verra l ete prochain\b/, /\bmon agent\b/, /\bd autres clubs\b/, /\bje ne sais pas si je serai la\b/, /\bje reflechis\b.*\bavenir\b/];
const HUMBLE = [/\bcollectif\b/, /\bl equipe\b/, /\bmes coequipiers ont\b/, /\bmerci\b/, /\bsupporters\b/, /\bgrace a\b/, /\bon a tous\b/, /\bje dois progresser\b/, /\bj ai encore beaucoup a apprendre\b/, /\bon a gagne ensemble\b/];
const TRAVAIL = [/\btravail\b/, /\bbosser\b/, /\bprogresser\b/, /\bentrainement\b/, /\bcontinuer a\b/, /\bapprendre\b/];
const LANGUE_DE_BOIS = [/\bmatch apres match\b/, /\bon prend les matchs les uns apres les autres\b/, /\bl essentiel c est les trois points\b/, /\bon va continuer a travailler\b/, /\ble plus important c est l equipe\b/, /\bc est le football\b/];
const RESPECT_REF = [/\bje respecte (la|sa) decision\b/, /\bl arbitre a fait son travail\b/];

const count = (n: string, list: RegExp[]): number => list.filter((p) => p.test(n)).length;

function moodFor(score: number, flags: CommunicationAnalysis['flags'], kind: NpcKind): 'chaleureux' | 'neutre' | 'froid' | 'agace' | 'furieux' | 'amuse' {
  if (flags.critique_coach && kind === 'coach') return 'furieux';
  if (flags.critique_coequipier && (kind === 'capitaine' || kind === 'coequipier')) return 'furieux';
  if (flags.arrogance) return kind === 'journaliste' ? 'amuse' : 'agace';
  if (score >= 7) return 'chaleureux';
  if (score <= 3.5) return 'froid';
  return 'neutre';
}

/** Analyse heuristique. Les deltas restent entre −3 et +3. */
export function analyzeFallback(input: FallbackAnalysisInput): CommunicationAnalysis {
  const raw = input.text ?? '';
  const n = normalize(raw);
  const words = n.split(' ').filter(Boolean).length;
  const key = `${input.date}|${input.channel}|${input.interlocutor}|${n.slice(0, 40)}`;

  if (isMetaInstruction(raw)) {
    return {
      interpretation: 'Il s\'adresse au jeu plutôt qu\'à son interlocuteur.',
      tone: ['hors sujet'],
      communication_score: 3,
      flags: { arrogance: false, critique_coequipier: false, critique_coach: false, critique_arbitre: false, promesse_publique: false, teasing_transfert: false, langue_de_bois: 0.2, interruption: !!input.interrupted, meta: true },
      deltas: { media: -1 },
      consequences: [],
      npc_reply: metaReply(input.interlocutor, key).reply,
    };
  }

  const flags: CommunicationAnalysis['flags'] = {
    arrogance: count(n, ARROGANCE) > 0,
    critique_coequipier: count(n, CRITIQUE_MATES) > 0,
    critique_coach: count(n, CRITIQUE_COACH) > 0,
    critique_arbitre: count(n, CRITIQUE_REF) > 0 && count(n, RESPECT_REF) === 0,
    promesse_publique: count(n, PROMESSE) > 0,
    teasing_transfert: count(n, TEASING) > 0,
    langue_de_bois: Math.min(1, (count(n, LANGUE_DE_BOIS) * 0.35) + (words < 6 ? 0.4 : 0) + (words > 0 && count(n, HUMBLE) === 0 && count(n, TRAVAIL) === 0 && words < 15 ? 0.15 : 0)),
    interruption: !!input.interrupted,
    meta: false,
  };
  const humble = count(n, HUMBLE);
  const travail = count(n, TRAVAIL);
  let score = 5 + humble * 0.8 + travail * 0.5;
  if (flags.arrogance) score -= 1.8;
  if (flags.critique_coequipier) score -= 2;
  if (flags.critique_coach) score -= 2;
  if (flags.critique_arbitre) score -= 1;
  if (flags.teasing_transfert) score -= 0.8;
  score -= flags.langue_de_bois * 1.5;
  if (words === 0) score = 2;
  if (words > 140) score -= 0.5;
  if (flags.interruption) score -= 1;
  score = Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;

  const deltas: ReputationDeltas = {};
  const add = (k: keyof ReputationDeltas, v: number): void => { deltas[k] = Math.max(-3, Math.min(3, (deltas[k] ?? 0) + v)); };
  if (humble > 0) { add('supporters', 1); add('teammates', 1); }
  if (travail > 0) add('coach', 1);
  if (flags.arrogance) { add('supporters', -2); add('teammates', -1); add('media', 1); }
  if (flags.critique_coequipier) { add('teammates', -3); add('coach', -1); }
  if (flags.critique_coach) { add('coach', -3); add('media', 1); }
  if (flags.critique_arbitre) { add('media', 1); add('league', -1); }
  if (flags.teasing_transfert) { add('supporters', -2); add('club', -1); add('media', 1); }
  if (flags.promesse_publique) { add('media', 1); add('supporters', 1); }
  if (flags.langue_de_bois >= 0.6) add('media', -1);
  if (flags.interruption) add('media', -1);
  for (const k of Object.keys(deltas) as (keyof ReputationDeltas)[]) if (deltas[k] === 0) delete deltas[k];

  const tone: string[] = [];
  if (humble > 0) tone.push('humble');
  if (travail > 0) tone.push('appliqué');
  if (flags.arrogance) tone.push('arrogant');
  if (flags.critique_coequipier || flags.critique_coach) tone.push('accusateur');
  if (flags.promesse_publique) tone.push('engagé');
  if (flags.langue_de_bois >= 0.5) tone.push('convenu');
  if (flags.teasing_transfert) tone.push('ambigu');
  if (tone.length === 0) tone.push(words < 6 ? 'laconique' : 'neutre');

  const consequences: CommunicationAnalysis['consequences'] = [];
  if (flags.promesse_publique) {
    const promise = raw.trim().slice(0, 140);
    const deadline = addDays(input.date, input.promiseDeadlineDays ?? 30);
    consequences.push({
      type: 'promesse', text: promise, deadline,
      check: input.promiseMatchId ? { type: 'marquer_dans_match', matchId: input.promiseMatchId } : { type: 'declaratif' },
    });
  }
  if (flags.arrogance) consequences.push({ type: 'media_headline', text: `${input.vars?.nom ?? 'Le jeune'} ne doute de rien` });
  if (flags.critique_coach) consequences.push({ type: 'media_headline', text: `Malaise : ${input.vars?.nom ?? 'le joueur'} conteste son coach` });

  const mood = moodFor(score, flags, input.interlocutor);
  const reply = fallbackReply(input.interlocutor, mood, input.vars ?? {}, key);
  const interpretation = flags.critique_coequipier ? 'Il rejette la faute sur ses coéquipiers.'
    : flags.critique_coach ? 'Il conteste publiquement les choix de son entraîneur.'
    : flags.arrogance ? 'Il se met en avant sans retenue.'
    : flags.promesse_publique ? 'Il s\'engage publiquement.'
    : flags.teasing_transfert ? 'Il entretient le flou sur son avenir.'
    : humble > 0 ? 'Il met le collectif en avant.'
    : flags.langue_de_bois >= 0.6 ? 'Il ne dit rien de personnel.'
    : 'Réponse mesurée, sans relief particulier.';

  return { interpretation, tone, communication_score: score, flags, deltas, consequences, npc_reply: reply.reply };
}
