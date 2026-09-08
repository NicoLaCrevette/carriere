/**
 * Titres de presse du lendemain d'un match du joueur : LLM ou repli, stockés
 * dans le rapport du match (`playerReport.headlines`). Mute state.
 */
import type { CareerState, Id } from '../../engine/types';
import { difficultyProfile } from '../../engine/config/difficulty';
import { callStructured } from '../client';
import { buildSystem } from '../context';
import { HEADLINES_SYSTEM } from '../prompts/memoriste';
import { fallbackHeadlines } from '../fallback/headlines';
import type { Headlines } from '../schemas';

export async function generateHeadlines(state: CareerState, matchId: Id, useLlm = true): Promise<{ headlines: Headlines['headlines']; source: 'llm' | 'fallback' }> {
  const match = state.matches[matchId];
  const report = match?.result?.playerReport;
  if (!match || !match.result || !report) throw new Error(`Aucun rapport de match pour ${matchId}`);
  if (report.headlines && report.headlines.length > 0) return { headlines: report.headlines, source: 'fallback' };
  const p = state.player;
  const home = match.homeClubId === p.contract.clubId;
  const clubShort = state.world.clubs[p.contract.clubId]?.shortName ?? '?';
  const opponentShort = state.world.clubs[home ? match.awayClubId : match.homeClubId]?.shortName ?? '?';
  const scoreFor = home ? match.result.homeGoals : match.result.awayGoals;
  const scoreAgainst = home ? match.result.awayGoals : match.result.homeGoals;
  const severity = difficultyProfile(state.settings.difficulty).mediaSeverity;
  const fallback = (): Headlines => fallbackHeadlines({ report, lastName: p.identity.lastName, clubShort, opponentShort, scoreFor, scoreAgainst, severity });
  let headlines: Headlines['headlines'];
  let source: 'llm' | 'fallback' = 'fallback';
  if (useLlm) {
    const result = await callStructured<Headlines>(
      'headlines',
      `${buildSystem('journaliste', state)}\n\n${HEADLINES_SYSTEM}`,
      [{
        role: 'user',
        content: `Match : ${clubShort} ${scoreFor}-${scoreAgainst} ${opponentShort} (${home ? 'à domicile' : 'à l\'extérieur'}). Le joueur : ${report.minutesPlayed} min (${report.started ? 'titulaire' : report.minutesPlayed > 0 ? `entré à la ${report.subbedOnMinute}e` : 'resté sur le banc'}), note ${report.rating.toFixed(1)}, ${report.stats.goals} but(s), ${report.stats.assists} passe(s), ${report.stats.shots} tir(s), ${report.stats.yellowCards} jaune(s), ${report.stats.redCards} rouge(s)${report.motm ? ', homme du match' : ''}${report.subbedOffReason ? `, sorti à la ${report.subbedOffMinute}e (${report.subbedOffReason})` : ''}. Sévérité des médias : ${severity}. Écris les titres.`,
      }],
      fallback,
    );
    headlines = result.ok ? result.data.headlines : fallback().headlines;
    source = result.ok && result.source === 'llm' ? 'llm' : 'fallback';
  } else {
    headlines = fallback().headlines;
  }
  report.headlines = headlines;
  if (headlines[0]) report.headline = headlines[0].title;
  return { headlines, source };
}
