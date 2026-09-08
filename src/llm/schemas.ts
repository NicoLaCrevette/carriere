/**
 * Schémas Zod des sorties du LLM : source de vérité, partagée par le proxy
 * (format de sortie structurée) et par le client (re-validation).
 *
 * Les bornes numériques sont appliquées APRÈS le parsing par `normalize*`
 * (le format de sortie structurée reste un JSON Schema simple) : jamais un
 * delta > ±5, jamais un score hors 0-10, jamais une action hors de l'enum.
 */
import { z } from 'zod';
import { MATCH_ACTIONS, REPUTATION_KEYS, SHOT_ZONES, STORYLINE_KINDS } from '../engine/types';
import type { ClassifiedAction, CommunicationAnalysis, ReputationDeltas } from '../engine/types';

const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);

// ── Classification d'intention (§6.1) ────────────────────────────────────

export const ClassifiedActionSchema = z.object({
  action: z.enum(MATCH_ACTIONS),
  cible: z.string().max(80).optional(),
  intensite: z.number(),
  risque: z.number(),
  communication: z.string().max(200).optional(),
  meta: z.boolean(),
});
export type ClassifiedActionOutput = z.infer<typeof ClassifiedActionSchema>;

export function normalizeClassifiedAction(raw: ClassifiedActionOutput): ClassifiedAction {
  const out: ClassifiedAction = {
    action: raw.action,
    intensite: clamp(raw.intensite, 0, 1),
    risque: clamp(raw.risque, 0, 1),
    meta: raw.meta === true,
  };
  if (raw.cible && raw.cible.trim().length > 0) out.cible = raw.cible.trim() as ClassifiedAction['cible'];
  if (raw.communication && raw.communication.trim().length > 0) out.communication = raw.communication.trim();
  if (out.meta) out.action = 'aucune';
  return out;
}

// ── Analyse de communication (§8) ────────────────────────────────────────

export const CommunicationFlagsSchema = z.object({
  arrogance: z.boolean(),
  critique_coequipier: z.boolean(),
  critique_coach: z.boolean(),
  critique_arbitre: z.boolean(),
  promesse_publique: z.boolean(),
  teasing_transfert: z.boolean(),
  langue_de_bois: z.number(),
  interruption: z.boolean().optional(),
  meta: z.boolean().optional(),
});

export const ReputationDeltasSchema = z.object({
  club: z.number().optional(),
  supporters: z.number().optional(),
  coach: z.number().optional(),
  teammates: z.number().optional(),
  league: z.number().optional(),
  world: z.number().optional(),
  nationalTeam: z.number().optional(),
  media: z.number().optional(),
});

export const PromiseCheckSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('marquer_dans_match'), matchId: z.string() }),
  z.object({ type: z.literal('buts_avant_date'), goals: z.number() }),
  z.object({ type: z.literal('gagner_match'), matchId: z.string() }),
  z.object({ type: z.literal('titulaire_avant_date') }),
  z.object({ type: z.literal('rester_au_club_jusqua'), date: z.string() }),
  z.object({ type: z.literal('declaratif') }),
]);

export const ConsequenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('storyline'), kind: z.enum(STORYLINE_KINDS), id: z.string(), deadline: z.string().optional(), title: z.string() }),
  z.object({ type: z.literal('media_headline'), text: z.string() }),
  z.object({ type: z.literal('promesse'), text: z.string(), deadline: z.string(), check: PromiseCheckSchema }),
  z.object({ type: z.literal('relationship'), delta: z.object({ npcId: z.string(), trust: z.number(), respect: z.number(), reason: z.string() }) }),
  z.object({ type: z.literal('memory'), summary: z.string(), importance: z.number() }),
]);

export const CommunicationAnalysisSchema = z.object({
  interpretation: z.string().max(400),
  tone: z.array(z.string().max(30)).max(6),
  communication_score: z.number(),
  flags: CommunicationFlagsSchema,
  deltas: ReputationDeltasSchema,
  consequences: z.array(ConsequenceSchema).max(4),
  npc_reply: z.string().max(800),
});
export type CommunicationAnalysisOutput = z.infer<typeof CommunicationAnalysisSchema>;

const MAX_DELTA = 5;

/** Borne les deltas à ±5 et le score à 0-10 ; les conséquences gardent une importance 1-5. */
export function normalizeAnalysis(raw: CommunicationAnalysisOutput, interrupted = false): CommunicationAnalysis {
  const deltas: ReputationDeltas = {};
  for (const key of REPUTATION_KEYS) {
    const v = raw.deltas[key];
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) deltas[key] = Math.round(clamp(v, -MAX_DELTA, MAX_DELTA) * 10) / 10;
  }
  return {
    interpretation: raw.interpretation.trim(),
    tone: raw.tone.map((t) => t.trim()).filter(Boolean).slice(0, 6),
    communication_score: Math.round(clamp(raw.communication_score, 0, 10) * 10) / 10,
    flags: {
      arrogance: raw.flags.arrogance,
      critique_coequipier: raw.flags.critique_coequipier,
      critique_coach: raw.flags.critique_coach,
      critique_arbitre: raw.flags.critique_arbitre,
      promesse_publique: raw.flags.promesse_publique,
      teasing_transfert: raw.flags.teasing_transfert,
      langue_de_bois: clamp(raw.flags.langue_de_bois, 0, 1),
      interruption: interrupted || raw.flags.interruption === true,
      meta: raw.flags.meta === true,
    },
    deltas,
    consequences: raw.consequences.map((c) => {
      if (c.type === 'memory') return { ...c, importance: Math.round(clamp(c.importance, 1, 5)) as 1 | 2 | 3 | 4 | 5 };
      if (c.type === 'relationship') return { ...c, delta: { ...c.delta, trust: clamp(c.delta.trust, -10, 10), respect: clamp(c.delta.respect, -10, 10) } };
      return c;
    }),
    npc_reply: raw.npc_reply.trim(),
  };
}

// ── Dialogues et narration ───────────────────────────────────────────────

export const NPC_MOODS = ['chaleureux', 'neutre', 'froid', 'agace', 'furieux', 'amuse'] as const;
export const NpcReplySchema = z.object({
  reply: z.string().max(800),
  mood: z.enum(NPC_MOODS),
  wantsToContinue: z.boolean(),
});
export type NpcReply = z.infer<typeof NpcReplySchema>;

export const NARRATION_SPEAKERS = ['commentateur', 'coach', 'capitaine', 'coequipier', 'public', 'adversaire', 'arbitre'] as const;
export const NarrationSchema = z.object({
  lines: z.array(z.object({ speaker: z.enum(NARRATION_SPEAKERS), text: z.string().max(300) })).min(1).max(4),
});
export type Narration = z.infer<typeof NarrationSchema>;
export type NarrationLine = Narration['lines'][number];

export const HEADLINE_TONES = ['elogieux', 'neutre', 'critique', 'moqueur'] as const;
export const HeadlinesSchema = z.object({
  headlines: z.array(z.object({ outlet: z.string().max(60), title: z.string().max(140), tone: z.enum(HEADLINE_TONES) })).min(1).max(4),
});
export type Headlines = z.infer<typeof HeadlinesSchema>;

export const SeasonSummarySchema = z.object({
  summary: z.string().max(1200),
  keyMoments: z.array(z.string().max(160)).max(5),
});
export type SeasonSummary = z.infer<typeof SeasonSummarySchema>;

export const NpcCardSchema = z.object({
  summary: z.string().max(400),
  lastExchange: z.string().max(240),
});
export type NpcCardOutput = z.infer<typeof NpcCardSchema>;

export const EventSceneSchema = z.object({
  npcLine: z.string().max(600),
  choicesHint: z.string().max(240).optional(),
});
export type EventScene = z.infer<typeof EventSceneSchema>;

export const DayNarrationSchema = z.object({ text: z.string().max(500) });
export type DayNarration = z.infer<typeof DayNarrationSchema>;

/** Description d'une situation de match (texte présenté au joueur avant sa décision). */
export const SituationTextSchema = z.object({ text: z.string().max(500) });
export type SituationText = z.infer<typeof SituationTextSchema>;

export { SHOT_ZONES };
