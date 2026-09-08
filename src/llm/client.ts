/**
 * Client LLM côté navigateur : appelle le proxy local (server/proxy.ts) qui
 * détient la clé. Chaque tâche a un schéma Zod, un délai et un repli : le jeu
 * ne plante jamais à cause du LLM (§16). Journal des appels pour les réglages.
 */
import type { ZodTypeAny } from 'zod';
import { DEFAULT_MODELS, taskOf, type LlmTaskId, type LlmTier } from './tasks';

export interface LlmMessage { role: 'user' | 'assistant'; content: string }

export type LlmResult<T> =
  | { ok: true; data: T; source: 'llm'; ms: number }
  | { ok: true; data: T; source: 'fallback'; reason: string; ms: number }
  | { ok: false; error: string; ms: number };

export interface LlmLogEntry { at: number; task: LlmTaskId; source: 'llm' | 'fallback' | 'error'; ms: number; detail?: string; tokens?: number }

export type LlmProvider = 'ollama' | 'anthropic' | 'aucun';

interface ClientConfig {
  baseUrl: string;
  enabled: boolean;
  models: Record<LlmTier, string>;
  fetchImpl: typeof fetch | null;
  availabilityTtlMs: number;
  /**
   * Un modèle local tourne sur la machine du joueur : il est plus lent qu'une
   * API et sérialise les appels. Les délais des tâches, réglés pour le nuage,
   * sont multipliés par ce facteur quand le proxy sert Ollama.
   */
  localTimeoutFactor: number;
}

const config: ClientConfig = {
  /**
   * Proxy local en développement. En ligne, `VITE_LLM_BASE_URL` pointe vers la
   * fonction hébergée ; sans elle, les appels échouent proprement et le jeu
   * tourne sur ses textes pré-écrits.
   */
  baseUrl: import.meta.env.VITE_LLM_BASE_URL ?? '/api',
  enabled: true,
  models: { ...DEFAULT_MODELS },
  fetchImpl: null,
  availabilityTtlMs: 60_000,
  localTimeoutFactor: 3,
};

/** Fournisseur annoncé par le proxy au dernier contrôle de disponibilité. */
let provider: LlmProvider = 'aucun';

export function llmProvider(): LlmProvider {
  return provider;
}

/** Délai d'une tâche, allongé quand un modèle local sert les appels. */
function timeoutFor(taskTimeoutMs: number): number {
  return provider === 'ollama' ? Math.round(taskTimeoutMs * config.localTimeoutFactor) : taskTimeoutMs;
}

const LOG_LIMIT = 200;
const log: LlmLogEntry[] = [];
let availability: { at: number; value: boolean } | null = null;

export function configureLlm(partial: Partial<Pick<ClientConfig, 'baseUrl' | 'enabled' | 'fetchImpl'>> & { models?: Partial<Record<LlmTier, string>> }): void {
  if (partial.baseUrl !== undefined) config.baseUrl = partial.baseUrl;
  if (partial.enabled !== undefined) config.enabled = partial.enabled;
  if (partial.fetchImpl !== undefined) config.fetchImpl = partial.fetchImpl;
  if (partial.models) config.models = { ...config.models, ...partial.models };
  availability = null;
}

export function llmLog(): readonly LlmLogEntry[] {
  return log;
}

function record(entry: LlmLogEntry): void {
  log.push(entry);
  if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
}

function doFetch(): typeof fetch | null {
  if (config.fetchImpl) return config.fetchImpl;
  return typeof fetch === 'function' ? fetch.bind(globalThis) : null;
}

/** Clé présente ET proxy joignable (mis en cache 60 s). */
export async function llmAvailable(force = false): Promise<boolean> {
  if (!config.enabled) return false;
  const now = Date.now();
  if (!force && availability && now - availability.at < config.availabilityTtlMs) return availability.value;
  const f = doFetch();
  if (!f) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await f(`${config.baseUrl}/key/status`, { signal: controller.signal });
    clearTimeout(timer);
    const body = res.ok ? ((await res.json()) as { present?: boolean; provider?: LlmProvider }) : { present: false };
    provider = body.present === true ? (body.provider ?? 'anthropic') : 'aucun';
    availability = { at: now, value: body.present === true };
  } catch {
    provider = 'aucun';
    availability = { at: now, value: false };
  }
  return availability.value;
}

interface ProxyResponse { ok: boolean; data?: unknown; error?: string; retryable?: boolean; usage?: { input_tokens?: number; output_tokens?: number } }

async function postTask(task: LlmTaskId, tier: LlmTier, system: string, messages: LlmMessage[], timeoutMs: number, signal?: AbortSignal, stream = false): Promise<Response> {
  const f = doFetch();
  if (!f) throw new Error('fetch indisponible');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort());
  try {
    return await f(`${config.baseUrl}/llm${stream ? '/stream' : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task, tier, model: config.models[tier], system, messages }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface CallOptions<T> {
  tier?: LlmTier;
  signal?: AbortSignal;
  /** Normalisation après validation Zod (bornes, nettoyage). */
  normalize?: (raw: unknown) => T;
  /** Schéma de validation côté client (défaut : celui de la tâche). */
  schema?: ZodTypeAny;
}

/**
 * Appel structuré : 1 tentative + 1 retry sur erreur retryable ou sortie
 * invalide, délai par tâche, puis repli. Ne lève jamais.
 */
export async function callStructured<T>(task: LlmTaskId, system: string, messages: LlmMessage[], fallback: () => T, opts: CallOptions<T> = {}): Promise<LlmResult<T>> {
  const t0 = Date.now();
  const spec = taskOf(task);
  const tier = opts.tier ?? spec.tier;
  const schema = opts.schema ?? spec.schema;
  const fail = (reason: string): LlmResult<T> => {
    const ms = Date.now() - t0;
    record({ at: t0, task, source: 'fallback', ms, detail: reason });
    try {
      return { ok: true, data: fallback(), source: 'fallback', reason, ms };
    } catch (e) {
      record({ at: t0, task, source: 'error', ms, detail: String(e) });
      return { ok: false, error: `${reason} ; repli en échec : ${String(e)}`, ms };
    }
  };
  if (!(await llmAvailable())) return fail('LLM indisponible');

  let lastReason = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await postTask(task, tier, system, messages, timeoutFor(spec.timeoutMs), opts.signal);
      const body = (await res.json()) as ProxyResponse;
      if (!res.ok || !body.ok) {
        lastReason = body.error ?? `HTTP ${res.status}`;
        if (body.retryable === false || res.status === 401) break;
        continue;
      }
      const parsed = schema ? schema.safeParse(body.data) : { success: true as const, data: body.data };
      if (!parsed.success) {
        lastReason = 'sortie invalide';
        continue;
      }
      const data = (opts.normalize ? opts.normalize(parsed.data) : parsed.data) as T;
      const ms = Date.now() - t0;
      record({ at: t0, task, source: 'llm', ms, tokens: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0) });
      return { ok: true, data, source: 'llm', ms };
    } catch (e) {
      lastReason = e instanceof Error && e.name === 'AbortError' ? 'délai dépassé' : String(e);
    }
  }
  return fail(lastReason || 'échec inconnu');
}

/**
 * Appel texte en streaming (SSE) : `onDelta` reçoit les fragments, le texte
 * complet est renvoyé. Repli sur `fallback()` (texte complet, sans stream).
 */
export async function callStream(task: LlmTaskId, system: string, messages: LlmMessage[], onDelta: (text: string) => void, fallback: () => string, opts: { tier?: LlmTier; signal?: AbortSignal } = {}): Promise<LlmResult<string>> {
  const t0 = Date.now();
  const spec = taskOf(task);
  const tier = opts.tier ?? spec.tier;
  const fail = (reason: string): LlmResult<string> => {
    const text = fallback();
    onDelta(text);
    record({ at: t0, task, source: 'fallback', ms: Date.now() - t0, detail: reason });
    return { ok: true, data: text, source: 'fallback', reason, ms: Date.now() - t0 };
  };
  if (!(await llmAvailable())) return fail('LLM indisponible');
  try {
    const res = await postTask(task, tier, system, messages, timeoutFor(spec.timeoutMs), opts.signal, true);
    if (!res.ok || !res.body) return fail(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        if (!chunk.startsWith('data:')) continue;
        const payload = JSON.parse(chunk.slice(5).trim()) as { delta?: string; done?: boolean; error?: string };
        if (payload.error) return fail(payload.error);
        if (payload.delta) {
          full += payload.delta;
          onDelta(payload.delta);
        }
      }
    }
    if (!full.trim()) return fail('réponse vide');
    record({ at: t0, task, source: 'llm', ms: Date.now() - t0 });
    return { ok: true, data: full, source: 'llm', ms: Date.now() - t0 };
  } catch (e) {
    return fail(e instanceof Error && e.name === 'AbortError' ? 'délai dépassé' : String(e));
  }
}
