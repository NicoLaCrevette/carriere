/**
 * Textes de repli (sans LLM) : résumés des minutes creuses, titres de presse.
 * Le narrateur LLM (Phase 4) les remplace quand il est disponible.
 */
import type { MatchContext, MatchState, PlayerMatchReport } from '../types';
import { BALANCE } from '../config/balance';
import { fullName, scoreFor } from './matchEvents';

const QUIET_LINES = {
  dominant: ['Ton équipe pousse, tu touches {n} ballons dans le camp adverse.', 'Domination sans occasion nette, {n} ballons pour toi.'],
  balanced: ['Le match s\'équilibre, tu touches {n} ballons.', 'Rythme moyen, {n} ballons touchés, rien de décisif.'],
  suffering: ['Ton équipe subit, tu ne touches que {n} ballons.', 'Long temps faible, {n} ballons, beaucoup de courses dans le vide.'],
  bench: ['Tu suis le match depuis le banc.', 'Le coach observe, tu t\'échauffes le long de la ligne.'],
};

/** Ligne de résumé d'un intervalle de minutes sans implication du joueur. */
export function summaryLine(ms: MatchState, ctx: MatchContext, from: number, to: number, touches: number, forced?: 'bench'): string {
  const side = ctx.playerSide ?? 'home';
  const sign = side === 'home' ? 1 : -1;
  const mood = forced ?? (!ms.playerOnPitch ? 'bench' : ms.momentum * sign > 0.15 ? 'dominant' : ms.momentum * sign < -0.15 ? 'suffering' : 'balanced');
  const lines = QUIET_LINES[mood];
  const text = lines[(from + to) % lines.length]!.replace('{n}', String(Math.max(1, Math.round(touches))));
  return `${from}'-${to}' — ${text}`;
}

/** Titre de presse de repli après le match du joueur. */
export function fallbackHeadline(report: PlayerMatchReport, ms: MatchState, ctx: MatchContext): string {
  const player = ctx.player!;
  const name = player.identity.lastName;
  const side = ctx.playerSide ?? 'home';
  const s = scoreFor(ms, side);
  const club = ctx[side].club.shortName;
  const st = report.stats;
  if (report.minutesPlayed <= 0) return `${club} : ${name} est resté sur le banc`;
  if (st.redCards > 0) return `${name} expulsé, ${club} termine à dix`;
  if (st.goals >= 2) return `Doublé de ${name}, ${club} s'impose grâce à son ${player.identity.position === 'BU' ? 'buteur' : 'joueur'}`;
  if (st.goals === 1 && s.pour > s.contre) return `${name} décisif, ${club} l'emporte`;
  if (st.goals === 1) return `${name} marque mais ${club} ne gagne pas`;
  if (report.motm) return `${name}, homme du match, porte ${club}`;
  if (report.rating >= 7.5) return `${name} rayonne, ${club} récompensé`;
  if (report.rating < 5) return `La surcote du gamin ? ${name} passe à côté`;
  if (report.subbedOffReason === 'mauvais match') return `${name} sorti à la ${report.subbedOffMinute}e : le coach a tranché`;
  if (s.pour < s.contre) return `${club} s'incline, ${name} n'a pas pesé`;
  return `${club} ${s.pour}-${s.contre} : ${name} discret`;
}

/** Ligne de vestiaire de repli du capitaine ou du coach à la mi-temps. */
export function halfTimeLine(ms: MatchState, ctx: MatchContext): string {
  const side = ctx.playerSide ?? 'home';
  const s = scoreFor(ms, side);
  const coach = ctx[side].coach.lastName;
  if (s.pour > s.contre) return `${coach} : « On ne relâche rien. Deuxième mi-temps, même intensité. »`;
  if (s.pour < s.contre) return `${coach} : « Ce n'est pas ça. Je veux voir des hommes sur le terrain. »`;
  return `${coach} : « C'est ouvert. Le premier qui marque fait la différence. »`;
}

/** Nom lisible d'un joueur du match. */
export function nameOf(ctx: MatchContext, id: string): string {
  if (ctx.player && id === ctx.player.id) return fullName(ctx.player.identity);
  const npc = ctx.roster[id];
  return npc ? fullName(npc.identity) : 'un joueur';
}

/** Ballons touchés attendus par minute pour le poste (résumés). */
export function touchesPerMinute(ctx: MatchContext): number {
  const pos = ctx.player?.identity.position ?? 'MC';
  return BALANCE.matchSim.passiveStats.touchesPerMinute[pos];
}
