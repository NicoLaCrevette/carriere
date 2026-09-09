/**
 * Contexte injecté dans les prompts (§9) : faits durs compacts, fiche PNJ,
 * souvenirs les plus pertinents (récence × importance × entités), prompt
 * système assemblé dans un ordre stable (préambule, rôle, fiche, faits) pour
 * que le préfixe reste cacheable.
 */
import type { CareerState, Id, MemoryEntry, Npc, TableRow } from '../engine/types';
import { ageAt, diffDays, formatDateFr } from '../engine/calendar/dates';
import { POSITION_LABELS } from '../engine/config/positions';
import { rankOf } from '../engine/season/table';
import { recentPlayerMatches } from '../engine/season/recentMatches';
import { PREAMBLE } from './prompts/preamble';
import { rolePrompt, type RoleId } from './prompts/roles';

const MEMORIES_PER_CALL = 15;

function fmtEuros(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.0', '')} M€`;
  return `${Math.round(v / 1000)} k€`;
}

/**
 * Offres de transfert ouvertes.
 *
 * Le préambule interdit au modèle d'inventer un chiffre : sans cette ligne,
 * un agent qui appelle « pour une offre » ne peut structurellement pas dire
 * de quel club, de quel salaire ni de quel rôle il s'agit.
 */
function offerLine(state: CareerState): string {
  const ouvertes = state.offers.filter((o) => o.status === 'en_attente' || o.status === 'en_negociation');
  if (ouvertes.length === 0) return '';
  const parts = ouvertes.slice(0, 3).map((o) => {
    const club = state.world.clubs[o.clubId]?.name ?? o.clubId;
    const prolongation = o.clubId === state.player.contract.clubId && o.fee === 0;
    const nature = prolongation ? 'prolongation' : o.loan ? 'prêt 1 an' : `transfert ${fmtEuros(o.fee)}`;
    return `${club} (${nature}, ${fmtEuros(o.wageMonthly)}/mois, ${o.years} an(s), rôle promis ${o.promisedRole}, club actuel ${o.currentClubStance}, expire le ${o.expiresOn})`;
  });
  return `Offres ouvertes : ${parts.join(' ; ')}.`;
}

/** Faits durs (≤ 700 caractères) : identité, club, statut, contrat, saison, classement, dernier match, stats, forme, blessure. */
export function hardFacts(state: CareerState): string {
  const p = state.player;
  const club = state.world.clubs[p.contract.clubId];
  const league = club ? state.world.leagues[club.leagueId] : undefined;
  const ls = club ? state.season.leagues[club.leagueId] : undefined;
  const rank = ls && club ? rankOf(ls, club.id) : 0;
  const row: TableRow | undefined = ls?.table.find((r) => r.clubId === club?.id);
  const age = ageAt(p.identity.birthDate, state.currentDate);
  const stats = p.seasonStats.total;
  const hierarchy = club?.positionHierarchy[p.identity.position] ?? [];
  const rankAtPosition = hierarchy.indexOf(p.id) + 1;
  const last = recentPlayerMatches(state, 1)[0];
  const injury = p.injuries.find((i) => i.daysRemaining > 0);
  const lastLine = last
    ? `Dernier match : ${state.world.clubs[last.match.homeClubId]?.shortName ?? '?'} ${last.match.result?.homeGoals ?? '?'}-${last.match.result?.awayGoals ?? '?'} ${state.world.clubs[last.match.awayClubId]?.shortName ?? '?'}, ${last.report.minutesPlayed} min, note ${last.report.rating.toFixed(1)}, ${last.report.stats.goals} but(s), ${last.report.stats.assists} passe(s).`
    : 'Aucun match joué cette saison.';
  return [
    `${p.identity.firstName} ${p.identity.lastName}, ${age} ans, ${POSITION_LABELS[p.identity.position]}, ${p.identity.nationality}, ${club?.name ?? 'sans club'} (${league?.name ?? '?'}).`,
    `Date : ${formatDateFr(state.currentDate)}, saison ${state.season.label}, phase ${state.season.phase}. Statut : ${p.squadStatus}, ${rankAtPosition > 0 ? `${rankAtPosition}e dans la hiérarchie au poste` : 'hors hiérarchie'}, confiance du coach ${Math.round(p.coachTrust)}/100.`,
    `Contrat jusqu'au ${p.contract.endsOn}, ${fmtEuros(p.contract.wageMonthly)}/mois, rôle promis ${p.contract.promisedRole}. Valeur ${fmtEuros(p.marketValue)}.`,
    row ? `Classement : ${rank}e sur ${ls?.clubIds.length ?? '?'}, ${row.points} pts, ${row.played} matchs.` : '',
    `Saison : ${stats.matches} matchs (${stats.starts} titularisations), ${stats.minutes} min, ${stats.goals} buts, ${stats.assists} passes, note moyenne ${stats.ratingCount > 0 ? (stats.ratingSum / stats.ratingCount).toFixed(2) : '-'}. ${lastLine}`,
    `Forme ${p.form.toFixed(1)}/5, condition ${Math.round(p.fitness)}/100, moral ${Math.round(p.morale)}/100.${injury ? ` Blessé : ${injury.type}, ${injury.daysRemaining} jours restants.` : ''}`,
    `Réputation : club ${Math.round(state.reputation.club.value)}, supporters ${Math.round(state.reputation.supporters.value)}, coach ${Math.round(state.reputation.coach.value)}, coéquipiers ${Math.round(state.reputation.teammates.value)}, ligue ${Math.round(state.reputation.league.value)}, monde ${Math.round(state.reputation.world.value)}, médias ${Math.round(state.reputation.media.value)}.`,
    offerLine(state),
  ].filter(Boolean).join(' ');
}

/** Fiche courte d'un PNJ : identité, personnalité, relation, dernier échange. */
export function npcCard(state: CareerState, npcId: Id): string {
  const npc: Npc | undefined = state.world.npcs[npcId];
  if (!npc) return '';
  const rel = state.relationships[npcId];
  const age = ageAt(npc.birthDate, state.currentDate);
  const club = npc.clubId ? state.world.clubs[npc.clubId] : undefined;
  const p = npc.personality;
  const traits = [
    p.warmth >= 65 ? 'chaleureux' : p.warmth <= 35 ? 'froid' : null,
    p.severity >= 65 ? 'sévère' : p.severity <= 35 ? 'indulgent' : null,
    p.volatility >= 65 ? 'sanguin' : p.volatility <= 35 ? 'posé' : null,
    p.mediaHunger >= 65 ? 'aime les médias' : null,
    p.loyalty >= 65 ? 'loyal' : p.loyalty <= 35 ? 'opportuniste' : null,
    ...p.keywords,
  ].filter(Boolean).join(', ');
  return [
    `${npc.firstName} ${npc.lastName}, ${npc.kind}, ${age} ans${club ? `, ${club.name}` : ''}${npc.affiliation ? `, ${npc.affiliation}` : ''}.`,
    traits ? `Personnalité : ${traits}.` : '',
    rel ? `Relation avec le joueur : confiance ${rel.trust > 0 ? '+' : ''}${rel.trust}/100, respect ${rel.respect > 0 ? '+' : ''}${rel.respect}/100.` : '',
    npc.card.summary ? `Fiche : ${npc.card.summary}` : '',
    npc.card.lastExchange ? `Dernier échange : ${npc.card.lastExchange}` : '',
  ].filter(Boolean).join(' ');
}

/** Score de pertinence d'un souvenir : récence × importance × correspondance d'entités. */
function memoryScore(entry: MemoryEntry, today: string, entities: Set<string>): number {
  const ageDays = Math.max(0, diffDays(entry.date, today));
  const recency = 1 / (1 + ageDays / 120);
  const overlap = entry.entities.filter((e) => entities.has(e)).length;
  return recency * entry.importance * (1 + overlap * 1.5);
}

/** Les n souvenirs les plus pertinents pour les entités données. */
export function selectMemories(state: CareerState, entities: string[], n = MEMORIES_PER_CALL): MemoryEntry[] {
  const set = new Set(entities);
  return [...state.memory]
    .map((m) => ({ m, s: memoryScore(m, state.currentDate, set) }))
    .sort((a, b) => b.s - a.s || b.m.date.localeCompare(a.m.date))
    .slice(0, n)
    .map((x) => x.m)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function memoriesBlock(entries: MemoryEntry[]): string {
  if (entries.length === 0) return 'Aucun souvenir notable.';
  return entries.map((m) => `- ${m.date} (${m.type}, importance ${m.importance}) : ${m.summary}`).join('\n');
}

/** Promesses publiques en cours, pour que les journalistes y reviennent. */
export function promisesBlock(state: CareerState): string {
  const open = state.promises.filter((p) => p.status === 'en_cours');
  if (open.length === 0) return '';
  return `Promesses publiques en cours :\n${open.map((p) => `- ${p.madeOn} : « ${p.text} » (échéance ${p.deadline})`).join('\n')}`;
}

/** Résumés des saisons passées (canoniques). */
export function pastSeasonsBlock(state: CareerState): string {
  const past = state.pastSeasons.filter((s) => s.narrativeSummary);
  if (past.length === 0) return '';
  return past.slice(-4).map((s) => `Saison ${s.label} (${state.world.clubs[s.clubId]?.name ?? s.clubId}, ${s.leagueRank}e) : ${s.narrativeSummary}`).join('\n');
}

/**
 * Prompt système d'un rôle : préambule + rôle + fiche PNJ (stables en tête),
 * puis faits durs, résumés de saison, promesses et souvenirs (volatils).
 */
export function buildSystem(role: RoleId, state: CareerState, npcId?: Id, entities: string[] = []): string {
  const parts = [PREAMBLE, `Ton rôle : ${rolePrompt(role)}`];
  if (npcId) parts.push(`Ton personnage : ${npcCard(state, npcId)}`);
  parts.push(`Faits durs (seule source de chiffres) : ${hardFacts(state)}`);
  const past = pastSeasonsBlock(state);
  if (past) parts.push(past);
  const promises = promisesBlock(state);
  if (promises) parts.push(promises);
  const memories = selectMemories(state, [...entities, ...(npcId ? [npcId] : []), state.player.contract.clubId]);
  parts.push(`Souvenirs pertinents :\n${memoriesBlock(memories)}`);
  return parts.join('\n\n');
}
