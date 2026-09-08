/**
 * Registre des tâches LLM : schéma de sortie, niveau de modèle, réflexion,
 * effort, budget de tokens, délai. Partagé par le proxy (server/proxy.ts) et
 * le client (src/llm/client.ts).
 */
import type { ZodTypeAny } from 'zod';
import {
  ClassifiedActionSchema, CommunicationAnalysisSchema, DayNarrationSchema, EventSceneSchema, HeadlinesSchema,
  NarrationSchema, NpcCardSchema, NpcReplySchema, SeasonSummarySchema, SituationTextSchema,
} from './schemas';

export type LlmTaskId =
  | 'classify_intent'
  | 'narrate_action'
  | 'narrate_ambiance'
  | 'describe_situation'
  | 'npc_dialogue'
  | 'analyze_communication'
  | 'headlines'
  | 'season_summary'
  | 'npc_card'
  | 'event_scene'
  | 'day_narration';

export type LlmTier = 'courant' | 'premium';

export interface LlmTask {
  id: LlmTaskId;
  /** Schéma Zod de la sortie structurée, ou null pour une tâche texte (streaming). */
  schema: ZodTypeAny | null;
  tier: LlmTier;
  thinking: 'disabled' | 'adaptive';
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
  timeoutMs: number;
}

export const LLM_TASKS: Record<LlmTaskId, LlmTask> = {
  classify_intent: { id: 'classify_intent', schema: ClassifiedActionSchema, tier: 'courant', thinking: 'disabled', effort: 'low', maxTokens: 300, timeoutMs: 4000 },
  narrate_action: { id: 'narrate_action', schema: NarrationSchema, tier: 'courant', thinking: 'disabled', effort: 'low', maxTokens: 500, timeoutMs: 8000 },
  narrate_ambiance: { id: 'narrate_ambiance', schema: NarrationSchema, tier: 'courant', thinking: 'disabled', effort: 'low', maxTokens: 300, timeoutMs: 6000 },
  describe_situation: { id: 'describe_situation', schema: SituationTextSchema, tier: 'courant', thinking: 'disabled', effort: 'low', maxTokens: 300, timeoutMs: 5000 },
  npc_dialogue: { id: 'npc_dialogue', schema: NpcReplySchema, tier: 'courant', thinking: 'adaptive', effort: 'medium', maxTokens: 800, timeoutMs: 20000 },
  analyze_communication: { id: 'analyze_communication', schema: CommunicationAnalysisSchema, tier: 'courant', thinking: 'adaptive', effort: 'medium', maxTokens: 1200, timeoutMs: 25000 },
  headlines: { id: 'headlines', schema: HeadlinesSchema, tier: 'courant', thinking: 'disabled', effort: 'low', maxTokens: 400, timeoutMs: 8000 },
  season_summary: { id: 'season_summary', schema: SeasonSummarySchema, tier: 'premium', thinking: 'adaptive', effort: 'high', maxTokens: 1500, timeoutMs: 45000 },
  npc_card: { id: 'npc_card', schema: NpcCardSchema, tier: 'courant', thinking: 'adaptive', effort: 'medium', maxTokens: 500, timeoutMs: 15000 },
  event_scene: { id: 'event_scene', schema: EventSceneSchema, tier: 'premium', thinking: 'adaptive', effort: 'high', maxTokens: 800, timeoutMs: 30000 },
  day_narration: { id: 'day_narration', schema: DayNarrationSchema, tier: 'courant', thinking: 'disabled', effort: 'low', maxTokens: 300, timeoutMs: 6000 },
};

/** Identifiants de modèles par défaut (modifiables dans les réglages). */
export const DEFAULT_MODELS: Record<LlmTier, string> = {
  courant: 'claude-sonnet-5',
  premium: 'claude-opus-5',
};

export function taskOf(id: LlmTaskId): LlmTask {
  const task = LLM_TASKS[id];
  if (!task) throw new Error(`Tâche LLM inconnue : ${id}`);
  return task;
}
