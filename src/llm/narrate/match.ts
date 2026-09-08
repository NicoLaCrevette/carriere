/**
 * Narration de match : description d'une situation et récit d'une issue,
 * par le LLM quand il est disponible, sinon par les textes de repli. Le
 * moteur a déjà décidé l'issue : ici on ne fait que raconter.
 */
import type { ActionOutcome, CareerState, ClassifiedAction, MatchContext, MatchState, Situation } from '../../engine/types';
import { fullName, scoreFor } from '../../engine/match/matchEvents';
import { callStructured } from '../client';
import { buildSystem } from '../context';
import { PREAMBLE } from '../prompts/preamble';
import { rolePrompt } from '../prompts/roles';
import { NARRATION_SYSTEM, SITUATION_SYSTEM } from '../prompts/memoriste';
import { describeSituationFallback } from '../fallback/situations';
import { narrateOutcomeFallback } from '../fallback/narration';
import type { Narration, NarrationLine, SituationText } from '../schemas';

/** Noms des joueurs du match par id (coéquipiers proches, tireur, etc.). */
export function matchNames(ctx: MatchContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, npc] of Object.entries(ctx.roster)) out[id] = fullName(npc.identity);
  if (ctx.player) out[ctx.player.id] = fullName(ctx.player.identity);
  return out;
}

function matchSystem(state: CareerState | undefined, role: 'commentateur'): string {
  return state ? buildSystem(role, state) : `${PREAMBLE}\n\nTon rôle : ${rolePrompt(role)}`;
}

function matchFacts(situation: Situation, ctx: MatchContext, ms: MatchState): string {
  const side = ctx.playerSide ?? 'home';
  const s = scoreFor(ms, side);
  const home = ctx.home.club.shortName;
  const away = ctx.away.club.shortName;
  return [
    `Match : ${home} ${ms.homeGoals}-${ms.awayGoals} ${away}, minute ${situation.context.minute}${ms.addedTime ? `+${ms.addedTime}` : ''}, le joueur (${ctx.player ? fullName(ctx.player.identity) : '?'}) joue pour ${ctx[side].club.shortName} (${s.pour}-${s.contre} de son point de vue).`,
    `Situation : ${situation.kind}. Faits : ${Object.entries(situation.facts).filter(([k]) => k !== 'passeurId').map(([k, v]) => `${k}=${String(v)}`).join(', ')}.`,
    `Contexte : distance ${situation.context.distanceM} m, pression ${situation.context.pressure.toFixed(2)}, marquage individuel ${situation.context.manMarked ? 'oui' : 'non'}.`,
  ].join('\n');
}

/** Texte de la situation présenté au joueur. */
export async function describeSituation(situation: Situation, ctx: MatchContext, ms: MatchState, state?: CareerState, useLlm = true): Promise<{ text: string; source: 'llm' | 'fallback' }> {
  const fallback = (): SituationText => ({ text: describeSituationFallback(situation) });
  if (!useLlm) return { text: fallback().text, source: 'fallback' };
  const result = await callStructured<SituationText>(
    'describe_situation',
    `${matchSystem(state, 'commentateur')}\n\n${SITUATION_SYSTEM}`,
    [{ role: 'user', content: `${matchFacts(situation, ctx, ms)}\nDécris la situation au joueur, à la deuxième personne, et termine par « Que fais-tu ? ».` }],
    fallback,
  );
  if (!result.ok) return { text: fallback().text, source: 'fallback' };
  return { text: result.data.text, source: result.source === 'llm' ? 'llm' : 'fallback' };
}

/** Récit de l'issue d'une action, décidée par le moteur. */
export async function narrateOutcome(situation: Situation, action: ClassifiedAction, outcome: ActionOutcome, ctx: MatchContext, ms: MatchState, state?: CareerState, useLlm = true): Promise<{ lines: NarrationLine[]; source: 'llm' | 'fallback' }> {
  const names = matchNames(ctx);
  const lastName = ctx.player?.identity.lastName ?? 'Le joueur';
  const fallback = (): Narration => ({ lines: narrateOutcomeFallback(situation, action, outcome, lastName, names) });
  if (!useLlm) return { lines: fallback().lines, source: 'fallback' };
  const outcomeFacts = Object.entries(outcome.facts).map(([k, v]) => `${k}=${String(v)}`).join(', ');
  const result = await callStructured<Narration>(
    'narrate_action',
    `${matchSystem(state, 'commentateur')}\n\n${NARRATION_SYSTEM}`,
    [{
      role: 'user',
      content: `${matchFacts(situation, ctx, ms)}\nAction tentée par le joueur : ${action.action}${action.cible ? ` (cible ${names[action.cible] ?? action.cible})` : ''}, risque déclaré ${action.risque.toFixed(2)}${action.communication ? `, il dit : « ${action.communication} »` : ''}.\nIssue décidée par le moteur : ${outcome.kind}. Faits de l'issue : ${outcomeFacts}. Variation de note : ${outcome.ratingDelta >= 0 ? '+' : ''}${outcome.ratingDelta.toFixed(2)} (${outcome.ratingReason}).\nRaconte cette issue exactement, en une à quatre lignes.`,
    }],
    fallback,
  );
  if (!result.ok) return { lines: fallback().lines, source: 'fallback' };
  return { lines: result.data.lines, source: result.source === 'llm' ? 'llm' : 'fallback' };
}
