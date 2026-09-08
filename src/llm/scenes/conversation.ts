/**
 * Moteur de scène de dialogue (Phase 4) : conférence de presse, interview
 * flash, vestiaire, appel de l'agent, bureau du coach. Le joueur répond
 * librement ; chaque réponse est analysée (LLM ou repli), les deltas sont
 * appliqués par le moteur (bornés), la citation est journalisée, les
 * promesses et storylines sont créées. Aucune logique React ici.
 */
import type {
  CareerState, CommunicationAnalysis, CommunicationFlags, GameEvent, Id, InteractionChannel, Npc, NpcKind, PublicPromise, QuoteEntry, ReputationDeltas, Storyline,
} from '../../engine/types';
import { EVENT_CATALOGUE } from '../../engine/events/catalogue';
import { resolveEvent } from '../../engine/events/roll';
import { BALANCE } from '../../engine/config/balance';
import { difficultyProfile } from '../../engine/config/difficulty';
import { addDays, ageAt, formatDateFr } from '../../engine/calendar/dates';
import { applyDeltas } from '../../engine/career/apply';
import { rankOf } from '../../engine/season/table';
import { POSITION_LABELS } from '../../engine/config/positions';
import { recentPlayerMatches } from '../../engine/season/recentMatches';
import { rngFor } from '../../engine/rng/derive';
import { callStructured } from '../client';
import { buildSystem } from '../context';
import { ANALYST_SYSTEM } from '../prompts/analyst';
import { analyzeFallback } from '../fallback/analysis';
import { normalizeAnalysis, type CommunicationAnalysisOutput } from '../schemas';
import { agentOpening, coachOfficeOpening, flashQuestion, lockerRoomOpening, pressQuestions, type SceneFacts } from './questions';
import { eventIntro } from './eventIntros';

export type SceneKind = 'conference' | 'flash' | 'vestiaire' | 'agent' | 'bureau_coach' | 'evenement';

export interface SceneSpec {
  kind: SceneKind;
  title: string;
  matchId?: Id;
  /** Événement de vie (§12) à résoudre par la réponse du joueur. */
  eventId?: Id;
  /** Sujet de l'agent ou motif du coach. */
  topic?: 'temps_de_jeu' | 'contrat' | 'interet' | 'image' | 'sanction' | 'felicitations' | 'statut' | 'attitude';
  /** Interlocuteur du vestiaire. */
  who?: 'coach' | 'capitaine';
  mandatory: boolean;
}

export interface SceneTurn {
  npcId: Id;
  npcName: string;
  npcKind: NpcKind;
  npcLine: string;
  playerText?: string;
  interrupted?: boolean;
  analysis?: CommunicationAnalysis;
  applied?: ReputationDeltas;
  source?: 'llm' | 'fallback';
}

export interface ConversationState {
  id: string;
  kind: SceneKind;
  channel: InteractionChannel;
  date: string;
  title: string;
  npcId: Id;
  npcKind: NpcKind;
  turns: SceneTurn[];
  queue: string[];
  maxTurns: number;
  done: boolean;
  facts: SceneFacts;
  matchId?: Id;
  eventId?: Id;
  entities: string[];
}

const CHANNEL: Record<SceneKind, InteractionChannel> = {
  conference: 'conference', flash: 'interview_flash', vestiaire: 'vestiaire', agent: 'telephone', bureau_coach: 'bureau', evenement: 'telephone',
};

/** Canal d'un événement selon sa catégorie (le PNJ te parle là où l'événement se passe). */
const EVENT_CHANNEL: Partial<Record<GameEvent['category'], InteractionChannel>> = {
  famille: 'domicile', sentimental: 'domicile', deuil: 'domicile', maladie_proche: 'telephone', agent: 'telephone', sponsor: 'telephone',
  reseaux_sociaux: 'reseaux_sociaux', supporters: 'terrain', television: 'television', soiree_equipe: 'soiree', conflit_vestiaire: 'vestiaire',
  capitanat: 'bureau', concurrent: 'vestiaire', changement_coach: 'bureau', presse: 'interview_flash', club: 'bureau', selection: 'telephone',
};

/** Réplique d'ouverture d'un événement, sans LLM : titre et faits marquants. */
export function eventOpening(event: GameEvent, firstName: string): string {
  const details = Object.entries(event.facts)
    .filter(([, v]) => typeof v === 'string' && v.length > 0 && v.length < 80)
    .map(([, v]) => String(v));
  // « Sujet : » évite l'élision impossible avec des faits déjà déterminés (« le salaire », « une brasserie du coin »).
  const core = details.length > 0 ? `Sujet : ${details.join(', ')}.` : '';
  return `${event.title}. ${core} ${firstName}, qu'est-ce que tu en dis ?`.replace(/\s+/g, ' ').trim();
}

/**
 * Choisit l'issue d'un événement d'après l'analyse de communication : d'abord
 * une issue dont les drapeaux correspondent tous, sinon la première dont le
 * score minimal est atteint, sinon la dernière (issue passive par défaut).
 */
export function chooseEventOutcome(outcomes: readonly { id: string; minScore?: number; flags?: Partial<CommunicationFlags> }[], analysis: CommunicationAnalysis): string | undefined {
  if (outcomes.length === 0) return undefined;
  const flagged = outcomes.find((o) => o.flags && Object.keys(o.flags).length > 0 && Object.entries(o.flags).every(([k, v]) => {
    const actual = analysis.flags[k as keyof CommunicationFlags];
    return typeof v === 'number' && typeof actual === 'number' ? actual >= v : actual === v;
  }));
  if (flagged) return flagged.id;
  const scored = outcomes.filter((o) => o.minScore !== undefined);
  if (scored.length > 0) {
    const reached = scored.filter((o) => analysis.communication_score >= (o.minScore ?? 0)).sort((a, b) => (b.minScore ?? 0) - (a.minScore ?? 0))[0];
    if (reached) return reached.id;
    return outcomes[outcomes.length - 1]!.id;
  }
  // Sans indication : une réponse convenable prend la première issue, une mauvaise la dernière.
  return (analysis.communication_score >= 5 ? outcomes[0] : outcomes[outcomes.length - 1])!.id;
}

function npcOfKind(state: CareerState, kind: NpcKind, clubId?: Id): Npc | undefined {
  const all = Object.values(state.world.npcs).filter((n) => n.active && n.kind === kind && (!clubId || n.clubId === clubId));
  return all.sort((a, b) => a.id.localeCompare(b.id))[0];
}

function coachNpc(state: CareerState): Npc | undefined {
  const club = state.world.clubs[state.player.contract.clubId];
  return club ? state.world.npcs[club.coachId] : undefined;
}

/** Faits de scène : identité, club, dernier match, promesse en cours, concurrent, minutes. */
export function sceneFacts(state: CareerState, matchId?: Id): SceneFacts {
  const p = state.player;
  const club = state.world.clubs[p.contract.clubId];
  const ls = club ? state.season.leagues[club.leagueId] : undefined;
  const played = matchId ? recentPlayerMatches(state, 5).find((x) => x.match.id === matchId) : recentPlayerMatches(state, 1)[0];
  const facts: SceneFacts = {
    prenom: p.identity.firstName, nom: p.identity.lastName, club: club?.shortName ?? '?',
    coachNom: coachNpc(state)?.lastName, rang: ls && club ? rankOf(ls, club.id) : undefined,
    minutesSaison: p.seasonStats.total.minutes, butsSaison: p.seasonStats.total.goals,
  };
  if (played) {
    const m = played.match;
    const home = m.homeClubId === p.contract.clubId;
    const r = m.result!;
    facts.adversaire = state.world.clubs[home ? m.awayClubId : m.homeClubId]?.shortName;
    facts.scoreFor = home ? r.homeGoals : r.awayGoals;
    facts.scoreAgainst = home ? r.awayGoals : r.homeGoals;
    facts.report = played.report;
  }
  const promise = state.promises.find((x) => x.status === 'en_cours');
  if (promise) facts.promesse = promise.text;
  const hierarchy = club?.positionHierarchy[p.identity.position] ?? [];
  const rival = hierarchy.find((id) => id !== p.id && state.world.npcPlayers[id]?.identity.position === p.identity.position);
  if (rival && hierarchy.indexOf(rival) < hierarchy.indexOf(p.id)) {
    const npc = state.world.npcPlayers[rival]!;
    facts.concurrent = `${npc.identity.firstName} ${npc.identity.lastName}`;
  }
  return facts;
}

/** Ouvre une scène : interlocuteur, faits, file de questions, première réplique. */
export function startScene(state: CareerState, spec: SceneSpec): ConversationState {
  const facts = sceneFacts(state, spec.matchId);
  const severity = difficultyProfile(state.settings.difficulty).mediaSeverity;
  const rng = rngFor(state.seed, { scope: `scene:${spec.kind}:${state.currentDate}`, index: 0 });
  let npc: Npc | undefined;
  let queue: string[] = [];
  let maxTurns = 1;
  let channel: InteractionChannel = CHANNEL[spec.kind];
  switch (spec.kind) {
    case 'conference': {
      npc = npcOfKind(state, 'journaliste');
      const [min, max] = BALANCE.career.scenes.conferenceQuestions;
      maxTurns = rng.int(min, max);
      queue = pressQuestions(facts, severity).slice(0, maxTurns);
      break;
    }
    case 'flash':
      npc = npcOfKind(state, 'journaliste');
      queue = [flashQuestion(facts)];
      break;
    case 'vestiaire': {
      const who = spec.who ?? 'coach';
      npc = who === 'coach' ? coachNpc(state) : npcOfKind(state, 'capitaine', state.player.contract.clubId);
      queue = [lockerRoomOpening(facts, who)];
      maxTurns = 2;
      break;
    }
    case 'agent':
      npc = npcOfKind(state, 'agent');
      queue = [agentOpening(facts, (spec.topic as 'temps_de_jeu' | 'contrat' | 'interet' | 'image' | undefined) ?? 'temps_de_jeu')];
      maxTurns = 2;
      break;
    case 'bureau_coach':
      npc = coachNpc(state);
      queue = [coachOfficeOpening(facts, (spec.topic as 'sanction' | 'felicitations' | 'statut' | 'attitude' | undefined) ?? 'statut')];
      maxTurns = 2;
      break;
    case 'evenement': {
      const event = state.events.find((e) => e.id === spec.eventId);
      if (!event) throw new Error(`Événement introuvable : ${spec.eventId ?? '?'}`);
      npc = event.npcIds.map((id) => state.world.npcs[id]).find((n): n is Npc => !!n) ?? npcOfKind(state, 'agent');
      queue = [eventIntro(event, {
        prenom: state.player.identity.firstName,
        nom: state.player.identity.lastName,
        club: facts.club,
        coachNom: facts.coachNom,
        poste: POSITION_LABELS[state.player.identity.position],
      })];
      channel = EVENT_CHANNEL[event.category] ?? 'telephone';
      break;
    }
  }
  if (!npc) npc = npcOfKind(state, 'journaliste') ?? Object.values(state.world.npcs)[0];
  if (!npc) throw new Error('Aucun PNJ disponible pour la scène.');
  const first = queue.shift() ?? 'Alors ?';
  return {
    id: `scene-${spec.kind}-${state.currentDate}-${state.quotes.length}`,
    kind: spec.kind,
    channel,
    date: state.currentDate,
    title: spec.title,
    npcId: npc.id,
    npcKind: npc.kind,
    turns: [{ npcId: npc.id, npcName: `${npc.firstName} ${npc.lastName}`, npcKind: npc.kind, npcLine: first }],
    queue,
    maxTurns,
    done: false,
    facts,
    matchId: spec.matchId,
    eventId: spec.eventId,
    entities: [npc.id, state.player.contract.clubId, ...(spec.matchId ? [spec.matchId] : []), ...(spec.eventId ? [spec.eventId] : [])],
  };
}

function relationshipDeltas(analysis: CommunicationAnalysis, npcKind: NpcKind): { trust: number; respect: number } {
  const s = BALANCE.career.scenes;
  const diff = analysis.communication_score - 5;
  let trust = diff * s.relationshipPerScorePoint.trust;
  let respect = diff * s.relationshipPerScorePoint.respect;
  const attacked = (npcKind === 'coach' && analysis.flags.critique_coach) || ((npcKind === 'capitaine' || npcKind === 'coequipier') && analysis.flags.critique_coequipier);
  if (attacked) {
    trust += s.attackedMalus.trust;
    respect += s.attackedMalus.respect;
  }
  if (analysis.flags.meta) trust -= 2;
  return { trust: Math.round(trust * 10) / 10, respect: Math.round(respect * 10) / 10 };
}

/** Applique une analyse à l'état : réputation, relation, citation, promesses, storylines, souvenirs. */
export function applyAnalysis(state: CareerState, conv: ConversationState, text: string, analysis: CommunicationAnalysis): ReputationDeltas {
  const before = { ...state.reputationDeltasToday };
  const rel = relationshipDeltas(analysis, conv.npcKind);
  const extraRelations = analysis.consequences.filter((c) => c.type === 'relationship').map((c) => (c.type === 'relationship' ? c.delta : null)!).filter(Boolean);
  const memories = analysis.consequences.filter((c) => c.type === 'memory').map((c) => (c.type === 'memory' ? c : null)!).filter(Boolean);
  const headlines = analysis.consequences.filter((c) => c.type === 'media_headline').map((c) => (c.type === 'media_headline' ? c.text : '')).filter(Boolean);
  const notable = analysis.communication_score >= 8 || analysis.communication_score <= 3 || analysis.flags.arrogance || analysis.flags.critique_coach || analysis.flags.critique_coequipier || analysis.flags.promesse_publique || analysis.flags.teasing_transfert;

  applyDeltas(state, {
    reputation: analysis.deltas,
    relationships: [
      { npcId: conv.npcId, trust: rel.trust, respect: rel.respect, reason: `${conv.title} : ${analysis.interpretation}` },
      ...extraRelations,
    ],
    memory: [
      ...memories.map((m) => ({ date: state.currentDate, type: 'declaration' as const, importance: m.importance, summary: m.summary, entities: conv.entities })),
      ...(notable ? [{ date: state.currentDate, type: 'declaration' as const, importance: (analysis.flags.critique_coach || analysis.flags.critique_coequipier ? 4 : 3) as 3 | 4, summary: `${conv.title} : ${analysis.interpretation} (« ${text.slice(0, 90)}${text.length > 90 ? '…' : ''} »)`, entities: conv.entities }] : []),
      ...headlines.map((h) => ({ date: state.currentDate, type: 'declaration' as const, importance: 2 as const, summary: `Titre de presse : « ${h} »`, entities: conv.entities })),
    ],
    log: [{ category: 'vie', text: `${conv.title} : ${analysis.interpretation} (score ${analysis.communication_score}/10).` }],
    channel: conv.channel,
  }, conv.title);

  const applied: ReputationDeltas = {};
  for (const key of Object.keys(state.reputationDeltasToday) as (keyof ReputationDeltas)[]) {
    const d = (state.reputationDeltasToday[key] ?? 0) - (before[key] ?? 0);
    if (d !== 0) applied[key] = Math.round(d * 100) / 100;
  }

  const quote: QuoteEntry = {
    id: `quote-${state.quotes.length + 1}-${state.currentDate}`,
    date: state.currentDate,
    channel: conv.channel,
    npcId: conv.npcId,
    context: `${conv.title}${conv.facts.adversaire ? ` (${conv.facts.club} ${conv.facts.scoreFor}-${conv.facts.scoreAgainst} ${conv.facts.adversaire})` : ''}`,
    text,
    analysis,
    appliedDeltas: applied,
  };
  state.quotes.push(quote);

  for (const c of analysis.consequences) {
    if (c.type === 'promesse') {
      const promise: PublicPromise = {
        id: `promesse-${state.promises.length + 1}-${state.currentDate}`,
        quoteId: quote.id,
        text: c.text,
        madeOn: state.currentDate,
        deadline: c.deadline && /^\d{4}-\d{2}-\d{2}$/.test(c.deadline) && c.deadline > state.currentDate ? c.deadline : addDays(state.currentDate, BALANCE.career.promises.defaultDeadlineDays),
        check: c.check,
        status: 'en_cours',
      };
      state.promises.push(promise);
    } else if (c.type === 'storyline') {
      if (state.storylines.some((s) => s.id === c.id && s.status === 'ouverte')) continue;
      const story: Storyline = {
        id: c.id, kind: c.kind, title: c.title, startedOn: state.currentDate, deadline: c.deadline, status: 'ouverte', stage: 'ouverture',
        vars: {}, npcIds: [conv.npcId], log: [{ date: state.currentDate, text: `Ouverte après ${conv.title.toLowerCase()} : ${analysis.interpretation}` }],
      };
      state.storylines.push(story);
    }
  }

  const npc = state.world.npcs[conv.npcId];
  if (npc) {
    npc.card.lastExchange = `${formatDateFr(state.currentDate)} : ${analysis.interpretation}`;
    npc.card.updatedOn = state.currentDate;
  }
  return applied;
}

function userMessage(conv: ConversationState, state: CareerState, text: string, interrupted: boolean): string {
  const previous = conv.turns
    .filter((t) => t.playerText)
    .map((t) => `${t.npcName} : « ${t.npcLine} »\nJoueur : « ${t.playerText} »`)
    .join('\n');
  const last = conv.turns[conv.turns.length - 1]!;
  const f = conv.facts;
  const matchLine = f.report
    ? `Match concerné : ${f.club} ${f.scoreFor}-${f.scoreAgainst} ${f.adversaire}, le joueur a joué ${f.report.minutesPlayed} min (${f.report.started ? 'titulaire' : 'remplaçant'}), note ${f.report.rating.toFixed(1)}, ${f.report.stats.goals} but(s), ${f.report.stats.assists} passe(s)${f.report.motm ? ', homme du match' : ''}${f.report.subbedOffReason ? `, sorti à la ${f.report.subbedOffMinute}e (${f.report.subbedOffReason})` : ''}.`
    : '';
  return [
    `Scène : ${conv.title} (${conv.channel}), ${formatDateFr(state.currentDate)}. Interlocuteur : ${last.npcName} (${last.npcKind}). Sévérité des médias : ${difficultyProfile(state.settings.difficulty).mediaSeverity}.`,
    matchLine,
    f.promesse ? `Promesse publique en cours : « ${f.promesse} ».` : '',
    f.concurrent ? `Concurrent au poste : ${f.concurrent}.` : '',
    previous ? `Échanges précédents :\n${previous}` : '',
    `${last.npcName} vient de dire : « ${last.npcLine} »`,
    `Le joueur ${interrupted ? 'l\'a interrompu et ' : ''}répond : « ${text.trim().slice(0, 1200)} »`,
    `Analyse cette réponse et écris la réplique de ${last.npcName}.`,
  ].filter(Boolean).join('\n');
}

export interface AnswerResult {
  analysis: CommunicationAnalysis;
  applied: ReputationDeltas;
  reply: string;
  source: 'llm' | 'fallback';
  done: boolean;
  nextLine?: string;
}

/**
 * Le joueur répond à la dernière réplique : analyse (LLM ou repli),
 * application bornée, réplique du PNJ, question suivante ou fin de scène.
 * Mute state et conv.
 */
export async function answerScene(state: CareerState, conv: ConversationState, text: string, opts: { interrupted?: boolean; useLlm?: boolean } = {}): Promise<AnswerResult> {
  if (conv.done) throw new Error('Scène terminée.');
  const last = conv.turns[conv.turns.length - 1]!;
  const interrupted = !!opts.interrupted;
  const age = ageAt(state.player.identity.birthDate, state.currentDate);
  const fallback = (): CommunicationAnalysis => analyzeFallback({
    text, channel: conv.channel, interlocutor: conv.npcKind, date: state.currentDate, interrupted,
    vars: { prenom: state.player.identity.firstName, nom: state.player.identity.lastName, club: conv.facts.club, age: String(age) },
    promiseMatchId: undefined,
    promiseDeadlineDays: BALANCE.career.promises.defaultDeadlineDays,
  });
  let analysis: CommunicationAnalysis;
  let source: 'llm' | 'fallback' = 'fallback';
  if (opts.useLlm === false) {
    analysis = fallback();
  } else {
    const result = await callStructured<CommunicationAnalysis>(
      'analyze_communication',
      `${buildSystem(conv.npcKind, state, conv.npcId, conv.entities)}\n\n${ANALYST_SYSTEM}`,
      [{ role: 'user', content: userMessage(conv, state, text, interrupted) }],
      fallback,
      { normalize: (raw) => normalizeAnalysis(raw as CommunicationAnalysisOutput, interrupted) },
    );
    analysis = result.ok ? result.data : fallback();
    source = result.ok && result.source === 'llm' ? 'llm' : 'fallback';
  }

  const applied = applyAnalysis(state, conv, text, analysis);
  last.playerText = text;
  last.interrupted = interrupted;
  last.analysis = analysis;
  last.applied = applied;
  last.source = source;

  // Événement de vie : l'issue est choisie par l'analyse, jamais par le LLM, puis appliquée par le moteur.
  if (conv.kind === 'evenement' && conv.eventId) {
    const event = state.events.find((e) => e.id === conv.eventId);
    const def = event ? EVENT_CATALOGUE.find((d) => d.id === event.definitionId) : undefined;
    if (event && def && !event.resolved) {
      const outcomeId = chooseEventOutcome(def.outcomes, analysis);
      if (outcomeId) {
        resolveEvent(state, event.id, outcomeId);
        const label = def.outcomes.find((o) => o.id === outcomeId)?.label;
        if (label) conv.facts.issue = label;
      }
    }
  }

  const answered = conv.turns.filter((t) => t.playerText).length;
  const next = answered < conv.maxTurns ? conv.queue.shift() : undefined;
  if (next) {
    conv.turns.push({ npcId: conv.npcId, npcName: last.npcName, npcKind: last.npcKind, npcLine: `${analysis.npc_reply} ${next}`.trim() });
    return { analysis, applied, reply: analysis.npc_reply, source, done: false, nextLine: next };
  }
  conv.done = true;
  return { analysis, applied, reply: analysis.npc_reply, source, done: true };
}

/** Lecture humaine de l'analyse pour l'affichage après coup (« Calme ✔ / Arrogance ✘ »). */
export function analysisBadges(a: CommunicationAnalysis): { label: string; good: boolean }[] {
  const out: { label: string; good: boolean }[] = [];
  for (const t of a.tone) out.push({ label: t.charAt(0).toUpperCase() + t.slice(1), good: !/arrogant|accusateur|convenu|ambigu|hors sujet|laconique/.test(t) });
  if (a.flags.arrogance) out.push({ label: 'Arrogance', good: false });
  if (a.flags.critique_coequipier) out.push({ label: 'Coéquipier visé', good: false });
  if (a.flags.critique_coach) out.push({ label: 'Coach contredit', good: false });
  if (a.flags.critique_arbitre) out.push({ label: 'Arbitre critiqué', good: false });
  if (a.flags.promesse_publique) out.push({ label: 'Promesse publique', good: false });
  if (a.flags.teasing_transfert) out.push({ label: 'Avenir flou', good: false });
  if (a.flags.langue_de_bois >= 0.6) out.push({ label: 'Langue de bois', good: false });
  if (a.flags.interruption) out.push({ label: 'A coupé la parole', good: false });
  if (a.flags.meta) out.push({ label: 'Hors sujet', good: false });
  return out;
}
