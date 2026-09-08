/**
 * Classification d'intention : mots-clés d'abord (rapide, hors ligne), LLM
 * si disponible pour les phrases ambiguës, méta toujours détectée. Le
 * résultat est ensuite sanitisé par le moteur (resolve.sanitizeAction).
 */
import type { ClassifiedAction, Situation } from '../../engine/types';
import { SHOT_ACTIONS } from '../../engine/match/actionTable';
import { callStructured } from '../client';
import { CLASSIFIER_SYSTEM, classifierUserMessage } from '../prompts/classifier';
import { normalizeClassifiedAction, type ClassifiedActionOutput } from '../schemas';
import { classifyByKeywords, isMetaInstruction } from './keywords';

export interface IntentResult {
  action: ClassifiedAction;
  source: 'mots-cles' | 'llm';
  ms: number;
}

/** Une phrase courte et sans ambiguïté n'a pas besoin du LLM. */
function keywordsSufficient(text: string, kw: ClassifiedAction, situation: Situation): boolean {
  if (kw.meta) return true;
  const words = text.trim().split(/\s+/).length;
  const matchedDefault = kw.action === situation.defaultAction.action && !/\b(frappe|tire|dribble|passe|centre|tacle|presse)\b/i.test(text);
  return words <= 8 && !matchedDefault;
}

/**
 * Classe la phrase libre du joueur. `teammateNames` : id → nom des
 * coéquipiers proches (cibles de passe).
 */
export async function classifyIntent(text: string, situation: Situation, teammateNames: Record<string, string> = {}, opts: { useLlm?: boolean; signal?: AbortSignal } = {}): Promise<IntentResult> {
  const t0 = Date.now();
  const kw = classifyByKeywords(text, situation, teammateNames);
  if (opts.useLlm === false || keywordsSufficient(text, kw, situation)) {
    return { action: kw, source: 'mots-cles', ms: Date.now() - t0 };
  }
  const result = await callStructured<ClassifiedAction>(
    'classify_intent',
    CLASSIFIER_SYSTEM,
    [{ role: 'user', content: classifierUserMessage(situation, text, teammateNames) }],
    () => kw,
    { normalize: (raw) => normalizeClassifiedAction(raw as ClassifiedActionOutput), signal: opts.signal },
  );
  if (!result.ok || result.source === 'fallback') return { action: kw, source: 'mots-cles', ms: Date.now() - t0 };
  const llm = result.data;
  // Sécurité : la méta détectée par les mots-clés l'emporte ; une action ni autorisée ni une frappe revient aux mots-clés.
  const meta = llm.meta || isMetaInstruction(text);
  if (meta) return { action: { action: 'aucune', intensite: 0.5, risque: 0.5, meta: true, communication: llm.communication ?? kw.communication }, source: 'llm', ms: Date.now() - t0 };
  const allowed = situation.allowedActions.includes(llm.action) || SHOT_ACTIONS.includes(llm.action);
  const action: ClassifiedAction = allowed ? llm : { ...kw, communication: llm.communication ?? kw.communication };
  return { action, source: 'llm', ms: Date.now() - t0 };
}
