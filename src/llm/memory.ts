/**
 * Mémoire longue durée (§9) : résumé canonique de saison (conservé pour
 * toujours dans SeasonRecord.narrativeSummary), fiche courte des PNJ
 * récurrents, narration d'ambiance de la journée. LLM si disponible, repli
 * déterministe sinon.
 */
import type { CareerState, Id, SeasonRecord } from '../engine/types';
import { formatDateFr } from '../engine/calendar/dates';
import { callStructured } from './client';
import { buildSystem, memoriesBlock, npcCard, selectMemories } from './context';
import { DAY_NARRATION_SYSTEM, NPC_CARD_SYSTEM, SEASON_SUMMARY_SYSTEM } from './prompts/memoriste';
import { fallbackSeasonSummary } from './fallback/season';
import type { DayNarration, NpcCardOutput, SeasonSummary } from './schemas';

/** Écrit le résumé canonique d'une saison passée (la dernière par défaut). Mute state. */
export async function summarizeSeason(state: CareerState, record?: SeasonRecord, useLlm = true): Promise<{ summary: SeasonSummary; source: 'llm' | 'fallback' }> {
  const target = record ?? state.pastSeasons[state.pastSeasons.length - 1];
  if (!target) throw new Error('Aucune saison passée à résumer.');
  const fallback = (): SeasonSummary => fallbackSeasonSummary(state, target);
  let summary: SeasonSummary;
  let source: 'llm' | 'fallback' = 'fallback';
  if (useLlm) {
    const memories = state.memory.filter((m) => m.date >= state.season.startDate || target.narrativeSummary === '').slice(-40);
    const result = await callStructured<SeasonSummary>(
      'season_summary',
      `${buildSystem('memoriste', state)}\n\n${SEASON_SUMMARY_SYSTEM}`,
      [{
        role: 'user',
        content: [
          `Saison ${target.label}, club ${state.world.clubs[target.clubId]?.name ?? target.clubId}, ${target.leagueRank}e du championnat.`,
          `Statistiques : ${target.stats.total.matches} matchs, ${target.stats.total.starts} titularisations, ${target.stats.total.minutes} minutes, ${target.stats.total.goals} buts, ${target.stats.total.assists} passes, note moyenne ${target.averageRating.toFixed(2)}, ${target.trophies.length} trophée(s), distinctions : ${target.awards.map((a) => a.kind).join(', ') || 'aucune'}.`,
          `Valeur en fin de saison ${Math.round(target.marketValueEnd / 1000)} k€, salaire ${Math.round(target.wageMonthlyEnd)} €/mois.`,
          `Souvenirs de la saison :\n${memoriesBlock(memories)}`,
          'Rédige le résumé canonique et les moments clés.',
        ].join('\n'),
      }],
      fallback,
      { tier: 'premium' },
    );
    summary = result.ok ? result.data : fallback();
    source = result.ok && result.source === 'llm' ? 'llm' : 'fallback';
  } else {
    summary = fallback();
  }
  target.narrativeSummary = summary.summary;
  return { summary, source };
}

/** Met à jour la fiche courte d'un PNJ récurrent. Mute state. */
export async function refreshNpcCard(state: CareerState, npcId: Id, useLlm = true): Promise<{ card: NpcCardOutput; source: 'llm' | 'fallback' }> {
  const npc = state.world.npcs[npcId];
  if (!npc) throw new Error(`PNJ inconnu : ${npcId}`);
  const rel = state.relationships[npcId];
  const fallback = (): NpcCardOutput => ({
    summary: npc.card.summary || `${npc.firstName} ${npc.lastName}, ${npc.kind}.`,
    lastExchange: npc.card.lastExchange ?? (rel?.history.length ? `${formatDateFr(rel.history[rel.history.length - 1]!.date)} : ${rel.history[rel.history.length - 1]!.summary}` : ''),
  });
  let card: NpcCardOutput;
  let source: 'llm' | 'fallback' = 'fallback';
  if (useLlm) {
    const history = (rel?.history ?? []).slice(-8).map((h) => `- ${h.date} (${h.channel}) : ${h.summary} [confiance ${h.deltaTrust >= 0 ? '+' : ''}${h.deltaTrust}]`).join('\n');
    const result = await callStructured<NpcCardOutput>(
      'npc_card',
      `${buildSystem('memoriste', state)}\n\n${NPC_CARD_SYSTEM}`,
      [{ role: 'user', content: `Ancienne fiche : ${npcCard(state, npcId)}\nHistorique récent avec le joueur :\n${history || 'aucun'}\nSouvenirs liés :\n${memoriesBlock(selectMemories(state, [npcId], 8))}\nMets la fiche à jour.` }],
      fallback,
    );
    card = result.ok ? result.data : fallback();
    source = result.ok && result.source === 'llm' ? 'llm' : 'fallback';
  } else {
    card = fallback();
  }
  npc.card = { summary: card.summary, lastExchange: card.lastExchange, updatedOn: state.currentDate };
  return { card, source };
}

const AMBIENT: Record<string, string[]> = {
  entrainement: ['Séance du matin sous un ciel bas. Le terrain est lourd, le ballon aussi.', 'Journée d\'entraînement ordinaire. Le staff a l\'œil sur tout le monde.'],
  veille_match: ['Veille de match : causerie vidéo, hôtel, téléphone qui ne doit pas sonner.', 'La mise au vert. Tout le monde parle moins fort.'],
  jour_match: ['Jour de match. Les rues autour du stade se remplissent dès midi.', 'Le car entre dans le parking du stade, les tribunes bourdonnent déjà.'],
  lendemain_match: ['Décrassage, bains froids et débrief. Les jambes sont lourdes.', 'Lendemain de match : la presse locale a déjà rendu son verdict.'],
  repos: ['Journée de repos. Le portable vibre plus qu\'il ne devrait.', 'Repos. La ville est calme, toi aussi.'],
  treve_internationale: ['Trêve internationale : l\'effectif est amputé, le centre respire.', 'Semaine de trêve. Ceux qui restent bossent, ceux qui partent rêvent.'],
  mercato: ['Mercato ouvert. Chaque rumeur traverse le vestiaire en dix minutes.', 'Le mercato bat son plein, les agents rôdent.'],
  preparation: ['Préparation d\'avant-saison : courses en côte et regards neufs.', 'Stage de préparation. Le coach teste, note, et ne dit rien.'],
  vacances: ['Vacances. Le football semble loin, mais pas tant que ça.', 'Coupure estivale, pieds dans l\'eau et téléphone en mode avion.'],
  reeducation: ['Rééducation : salle de soins, silence, patience.', 'Séance de rééducation. Chaque jour compte, aucun ne se voit.'],
};

/** Deux phrases d'ambiance pour la journée (LLM ou repli). */
export async function narrateDay(state: CareerState, kind: string, useLlm = true): Promise<{ text: string; source: 'llm' | 'fallback' }> {
  const bank = AMBIENT[kind] ?? AMBIENT.entrainement!;
  const idx = Number(state.currentDate.slice(8, 10)) % bank.length;
  const fallback = (): DayNarration => ({ text: bank[idx]! });
  if (!useLlm) return { text: fallback().text, source: 'fallback' };
  const result = await callStructured<DayNarration>(
    'day_narration',
    `${buildSystem('narrateur', state)}\n\n${DAY_NARRATION_SYSTEM}`,
    [{ role: 'user', content: `Journée : ${kind}, ${formatDateFr(state.currentDate)}. Écris deux phrases d'ambiance.` }],
    fallback,
  );
  if (!result.ok) return { text: fallback().text, source: 'fallback' };
  return { text: result.data.text, source: result.source === 'llm' ? 'llm' : 'fallback' };
}
