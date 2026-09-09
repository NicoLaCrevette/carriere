/**
 * Proxy local : détient la clé Anthropic (jamais dans le bundle), relaie les
 * tâches LLM avec sorties structurées (schémas Zod partagés), le streaming
 * texte, et les appels ElevenLabs (voix, transcription).
 *
 *   npm run server   →   http://localhost:8787
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { DEFAULT_MODELS, LLM_TASKS, type LlmTaskId, type LlmTier } from '../src/llm/tasks';
import { chooseOllamaModels, extractJson, ollamaChatBody, OLLAMA_DEFAULT_URL, stripThinking } from '../src/llm/ollama';
import { listFrenchVoices, synthesize } from './edgeVoices';

/** Mots-clés de contrainte retirés du JSON Schema envoyé à l'API (la validation fine reste côté client, avec Zod). */
const STRIPPED_KEYWORDS = new Set(['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'format', 'default', '$schema', 'markdownDescription']);

function sanitizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (STRIPPED_KEYWORDS.has(key)) continue;
    out[key] = sanitizeSchema(value);
  }
  return out;
}

const schemaCache = new Map<string, Record<string, unknown>>();

/** JSON Schema d'une tâche (Zod v3 → JSON Schema, références inlinées, contraintes retirées). */
function jsonSchemaFor(task: LlmTaskId, schema: ZodTypeAny): Record<string, unknown> {
  const cached = schemaCache.get(task);
  if (cached) return cached;
  const json = sanitizeSchema(zodToJsonSchema(schema, { $refStrategy: 'none' })) as Record<string, unknown>;
  schemaCache.set(task, json);
  return json;
}

/** Texte des blocs de réponse. */
function textOf(response: Anthropic.Message): string {
  return response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
}

const PORT = Number(process.env.PROXY_PORT ?? 8787);
const ENV_PATH = resolve(process.cwd(), '.env');
const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'];

let apiKey = process.env.ANTHROPIC_API_KEY ?? '';
let client: Anthropic | null = apiKey ? new Anthropic({ apiKey }) : null;

// ── Fournisseur local Ollama (gratuit, hors ligne) ────────────────────────

type Provider = 'ollama' | 'hote' | 'anthropic' | 'aucun';

const OLLAMA_URL = (process.env.OLLAMA_URL ?? OLLAMA_DEFAULT_URL).replace(/\/+$/, '');

/**
 * Fournisseur hébergé compatible OpenAI.
 *
 * Volontairement générique : Mistral par défaut (palier gratuit, modèles
 * français natifs), mais Groq, Google AI Studio, Cerebras, OpenRouter et les
 * autres s'utilisent en changeant deux variables. Il ne faut pas que le jeu
 * dépende d'un compte qu'on n'arrive pas à ouvrir — c'est arrivé.
 *
 * La même clé sert ensuite à la version en ligne, via la fonction de `edge/`.
 */
// `MISTRAL_API_KEY` reste accepté : c'était le nom avant que le proxy ne soit générique.
let HOTE_KEY = (process.env.LLM_API_KEY ?? process.env.MISTRAL_API_KEY ?? '').trim();
let HOTE_URL = (process.env.LLM_BASE_URL ?? process.env.MISTRAL_URL ?? 'https://api.mistral.ai/v1').replace(/\/+$/, '');
const HOTE_COURANT = process.env.LLM_MODEL_COURANT ?? process.env.MISTRAL_MODEL_COURANT ?? 'mistral-small-latest';
let HOTE_MODELS: Record<LlmTier, string> = {
  courant: HOTE_COURANT,
  // Sans modèle « premium » explicite, on reprend le courant : un nom Mistral par
  // défaut ferait échouer toutes les grandes scènes chez un autre fournisseur.
  premium: process.env.LLM_MODEL_PREMIUM ?? process.env.MISTRAL_MODEL_PREMIUM
    ?? (process.env.LLM_MODEL_COURANT || process.env.MISTRAL_MODEL_COURANT ? HOTE_COURANT : 'mistral-large-latest'),
};
/** Nom lisible du fournisseur, déduit de l'adresse : un message d'erreur ne doit jamais nommer le mauvais. */
function nomDeLUrl(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^api\./, '').replace(/\.(ai|com|dev)$/, '');
    return h.charAt(0).toUpperCase() + h.slice(1);
  } catch {
    return 'Fournisseur hébergé';
  }
}
let HOTE_NOM = nomDeLUrl(HOTE_URL);
/** 'auto' (défaut) : Ollama s'il répond, sinon Anthropic si une clé est là, sinon les textes de repli du jeu. */
const PREFERRED: 'auto' | Provider = (process.env.LLM_PROVIDER as 'auto' | Provider) || 'auto';

let ollamaModels: string[] = [];
let ollamaByTier: Record<LlmTier, string> | null = null;
let ollamaCheckedAt = 0;

/** Modèles installés localement (mise en cache 15 s : l'écran Réglages interroge souvent). */
async function refreshOllama(force = false): Promise<string[]> {
  if (!force && Date.now() - ollamaCheckedAt < 15_000) return ollamaModels;
  ollamaCheckedAt = Date.now();
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { models?: { name?: string }[] };
    ollamaModels = (body.models ?? []).map((m) => m.name ?? '').filter(Boolean);
  } catch {
    ollamaModels = [];
  }
  const chosen = chooseOllamaModels(ollamaModels);
  // Un modèle choisi à la main dans les réglages est conservé tant qu'il est encore installé.
  if (chosen && (!ollamaByTier || !ollamaModels.includes(ollamaByTier.courant))) ollamaByTier = chosen;
  if (!chosen) ollamaByTier = null;
  return ollamaModels;
}

/**
 * Un appel au fournisseur hébergé, au contrat OpenAI.
 *
 * Le schéma contraint le décodage (`json_schema`, strict) : le modèle ne peut
 * pas sortir du format. Si le fournisseur refuse ce mode, on retente une fois en
 * `json_object` avec le schéma dans la consigne — c'est ce que fait aussi la
 * fonction hébergée de `edge/`.
 */
async function hoteChat(
  _task: LlmTaskId,
  model: string,
  system: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  schema: object | undefined,
  timeoutMs: number,
): Promise<{ content: string; promptTokens: number; outputTokens: number }> {
  const consigneAvecSchema = schema
    ? `${system}

Réponds UNIQUEMENT par un objet JSON valide conforme à ce schéma, sans texte autour :
${JSON.stringify(schema)}`
    : system;

  const appeler = async (strict: boolean): Promise<globalThis.Response> => fetch(`${HOTE_URL}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${HOTE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: strict ? system : consigneAvecSchema }, ...messages],
      max_tokens: maxTokens,
      ...(schema
        ? strict
          ? { response_format: { type: 'json_schema', json_schema: { name: 'reponse', schema, strict: true } } }
          : { response_format: { type: 'json_object' } }
        : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  let res = await appeler(!!schema);
  if (schema && (res.status === 400 || res.status === 422)) res = await appeler(false);
  if (res.status === 429) {
    // Palier gratuit : souvent une requête par seconde. Le client doit attendre avant de
    // réessayer, sinon il retombe aussitôt dans la limite et perd sa tentative.
    const entete = Number(res.headers.get('retry-after'));
    const err = new Error('429') as Error & { retryAfterMs?: number };
    err.retryAfterMs = Number.isFinite(entete) && entete > 0 ? entete * 1000 : 1200;
    throw err;
  }
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    content: json.choices?.[0]?.message?.content ?? '',
    promptTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

async function currentProvider(): Promise<Provider> {
  if (PREFERRED === 'anthropic') return client ? 'anthropic' : 'aucun';
  if (PREFERRED === 'hote') return HOTE_KEY ? 'hote' : 'aucun';
  if (PREFERRED === 'ollama') return (await refreshOllama()).length > 0 ? 'ollama' : 'aucun';
  // Ollama d'abord : il ne consomme aucun quota et tourne hors ligne.
  if ((await refreshOllama()).length > 0) return 'ollama';
  if (HOTE_KEY) return 'hote';
  return client ? 'anthropic' : 'aucun';
}

/** Garde le modèle en mémoire : sans préchauffage, le premier appel paie 8 à 10 s de chargement et dépasse le délai. */
async function warmOllama(): Promise<void> {
  if (!ollamaByTier) return;
  for (const model of new Set(Object.values(ollamaByTier))) {
    try {
      await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ok' }], stream: false, think: false, keep_alive: '30m', options: { num_predict: 1 } }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      // Le préchauffage est un confort : son échec ne doit jamais empêcher le proxy de servir.
    }
  }
}

interface OllamaChatResult { content: string; promptTokens: number; outputTokens: number; model: string }

async function ollamaChat(taskId: LlmTaskId, model: string, system: string, messages: { role: 'user' | 'assistant'; content: string }[], maxTokens: number, schema: unknown, timeoutMs: number): Promise<OllamaChatResult> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ollamaChatBody({ model, system, messages, task: taskId, maxTokens, schema })),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Ollama a répondu ${res.status}`);
  const body = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number; model?: string };
  return {
    content: body.message?.content ?? '',
    promptTokens: body.prompt_eval_count ?? 0,
    outputTokens: body.eval_count ?? 0,
    model: body.model ?? model,
  };
}

/** Écrit (ou remplace) des variables dans le .env local, en gardant le reste. */
/**
 * Lit le .env quel que soit son encodage.
 *
 * `echo "X=y" >> .env` dans PowerShell écrit en **UTF-16**, pas en UTF-8. dotenv
 * ne sait pas le lire : la clé est alors silencieusement ignorée, et une
 * réécriture naïve en utf8 corrompt le fichier. On détecte donc la marque
 * d'ordre des octets, et on réécrit toujours en UTF-8.
 */
function readEnvLines(): string[] {
  if (!existsSync(ENV_PATH)) return [];
  const brut = readFileSync(ENV_PATH);
  const utf16le = brut[0] === 0xff && brut[1] === 0xfe;
  const utf16be = brut[0] === 0xfe && brut[1] === 0xff;
  const texte = utf16le
    ? brut.toString('utf16le', 2)
    : utf16be
      ? Buffer.from(brut.subarray(2)).swap16().toString('utf16le')
      : brut.toString('utf8').replace(/^﻿/, '');
  return texte.split(/\r?\n/);
}

function persistEnv(valeurs: Record<string, string>): void {
  const lines = readEnvLines();
  const kept = lines.filter((l) => !Object.keys(valeurs).some((k) => l.startsWith(`${k}=`)));
  for (const [k, v] of Object.entries(valeurs)) kept.push(`${k}=${v}`);
  writeFileSync(ENV_PATH, kept.filter((l, i, a) => l.length > 0 || i < a.length - 1).join('\n') + '\n', 'utf8');
}

function persistKey(key: string): void {
  persistEnv({ ANTHROPIC_API_KEY: key });
}

interface LlmRequestBody {
  task: LlmTaskId;
  tier?: LlmTier;
  model?: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
}

function validateBody(body: unknown): LlmRequestBody | string {
  if (!body || typeof body !== 'object') return 'corps invalide';
  const b = body as Partial<LlmRequestBody>;
  if (!b.task || !(b.task in LLM_TASKS)) return `tâche inconnue : ${String(b.task)}`;
  if (typeof b.system !== 'string') return 'system manquant';
  if (!Array.isArray(b.messages) || b.messages.length === 0) return 'messages manquants';
  for (const m of b.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return 'message invalide';
  }
  if (b.messages[0]!.role !== 'user') return 'le premier message doit venir de l\'utilisateur';
  return b as LlmRequestBody;
}

function errorPayload(e: unknown): { status: number; error: string; retryable: boolean } {
  if (e instanceof Anthropic.AuthenticationError) return { status: 401, error: 'Clé API refusée.', retryable: false };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, error: 'Limite de débit atteinte, réessaie dans un instant.', retryable: true };
  if (e instanceof Anthropic.BadRequestError) return { status: 400, error: `Requête refusée : ${e.message}`, retryable: false };
  if (e instanceof Anthropic.APIError) return { status: e.status ?? 500, error: e.message, retryable: (e.status ?? 500) >= 500 };
  if (e instanceof Anthropic.APIConnectionError) return { status: 503, error: 'Connexion à l\'API impossible.', retryable: true };
  return { status: 500, error: e instanceof Error ? e.message : 'Erreur inconnue', retryable: false };
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '1mb' }));

/**
 * État du proxy : quel fournisseur sert les dialogues. `present` reste vrai
 * dès qu'un fournisseur est disponible, pour que le client (llmAvailable)
 * n'ait pas à connaître le détail.
 */
app.get('/api/key/status', async (_req, res) => {
  const provider = await currentProvider();
  res.json({
    present: provider !== 'aucun',
    provider,
    // Mistral est gratuit sur son palier « Experiment » : le jeu doit le dire.
    gratuit: provider === 'ollama' || provider === 'hote',
    models: provider === 'ollama' && ollamaByTier ? ollamaByTier : provider === 'hote' ? HOTE_MODELS : DEFAULT_MODELS,
    ollama: { disponible: ollamaModels.length > 0, url: OLLAMA_URL, installes: ollamaModels },
    hote: { cle: !!HOTE_KEY, nom: HOTE_NOM, url: HOTE_URL, modeles: HOTE_MODELS },
    anthropic: { cle: !!client },
  });
});

/** Choix manuel du modèle local (réglages). Un seul modèle sert les deux niveaux si `premium` est omis. */
app.post('/api/ollama/model', async (req: Request, res: Response) => {
  const installed = await refreshOllama(true);
  const courant = typeof req.body?.courant === 'string' ? req.body.courant : '';
  const premium = typeof req.body?.premium === 'string' && req.body.premium ? req.body.premium : courant;
  if (!installed.includes(courant) || !installed.includes(premium)) {
    res.status(400).json({ ok: false, error: `Modèle inconnu localement. Installés : ${installed.join(', ') || 'aucun'}` });
    return;
  }
  ollamaByTier = { courant, premium };
  void warmOllama();
  res.json({ ok: true, models: ollamaByTier });
});

app.post('/api/key', (req: Request, res: Response) => {
  const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
  if (!key) {
    apiKey = '';
    client = null;
    persistKey('');
    res.json({ present: false });
    return;
  }
  apiKey = key;
  client = new Anthropic({ apiKey });
  persistKey(key);
  res.json({ present: true });
});

/**
 * Clé et adresse du fournisseur hébergé, saisies depuis l'écran Réglages.
 *
 * Sans ce point d'entrée il fallait éditer `.env` à la main puis relancer le
 * proxy : trop d'obstacles pour quelqu'un qui veut juste coller une clé. Elle
 * est écrite dans `.env` (jamais dans le dépôt, jamais dans le navigateur) et
 * prise en compte immédiatement.
 */
app.post('/api/hote', (req: Request, res: Response) => {
  const cle = typeof req.body?.cle === 'string' ? req.body.cle.trim() : '';
  const url = typeof req.body?.url === 'string' ? req.body.url.trim().replace(/\/+$/, '') : '';
  const courant = typeof req.body?.courant === 'string' ? req.body.courant.trim() : '';
  const premium = typeof req.body?.premium === 'string' ? req.body.premium.trim() : '';

  if (url) {
    try {
      new URL(url);
    } catch {
      res.status(400).json({ ok: false, error: 'Adresse invalide.' });
      return;
    }
  }

  HOTE_KEY = cle;
  if (url) HOTE_URL = url;
  HOTE_NOM = nomDeLUrl(HOTE_URL);
  if (courant) HOTE_MODELS = { courant, premium: premium || courant };

  persistEnv({
    LLM_API_KEY: HOTE_KEY,
    LLM_BASE_URL: HOTE_URL,
    LLM_MODEL_COURANT: HOTE_MODELS.courant,
    LLM_MODEL_PREMIUM: HOTE_MODELS.premium,
  });
  res.json({ ok: true, cle: !!HOTE_KEY, nom: HOTE_NOM, url: HOTE_URL, modeles: HOTE_MODELS });
});

app.post('/api/llm', async (req: Request, res: Response) => {
  const body = validateBody(req.body);
  if (typeof body === 'string') {
    res.status(400).json({ ok: false, error: body, retryable: false });
    return;
  }
  const provider = await currentProvider();
  if (provider === 'aucun') {
    res.status(401).json({ ok: false, error: 'Aucun fournisseur disponible : lance Ollama, renseigne une clé de fournisseur hébergé (LLM_API_KEY) ou une clé Anthropic.', retryable: false });
    return;
  }
  const task = LLM_TASKS[body.task];
  const tier = body.tier ?? task.tier;

  if (provider === 'ollama') {
    // Le client envoie des identifiants de modèles Anthropic : on ne les retient que s'ils sont installés ici.
    const model = (body.model && ollamaModels.includes(body.model)) ? body.model : ollamaByTier![tier];
    try {
      const out = await ollamaChat(body.task, model, body.system, body.messages, body.maxTokens ?? task.maxTokens, task.schema ? jsonSchemaFor(body.task, task.schema) : undefined, task.timeoutMs);
      if (!task.schema) {
        res.json({ ok: true, data: stripThinking(out.content), usage: { input_tokens: out.promptTokens, output_tokens: out.outputTokens }, model: out.model });
        return;
      }
      const json = extractJson(out.content);
      if (!json) {
        res.status(502).json({ ok: false, error: 'Réponse locale non exploitable (aucun JSON).', retryable: true });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        res.status(502).json({ ok: false, error: 'Réponse locale non exploitable (JSON invalide).', retryable: true });
        return;
      }
      const valid = task.schema.safeParse(parsed);
      if (!valid.success) {
        res.status(502).json({ ok: false, error: `Sortie hors schéma : ${valid.error.issues[0]?.message ?? '?'}`, retryable: true });
        return;
      }
      res.json({ ok: true, data: valid.data, usage: { input_tokens: out.promptTokens, output_tokens: out.outputTokens }, model: out.model });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      res.status(timeout ? 504 : 502).json({ ok: false, error: timeout ? 'Le modèle local a dépassé le délai.' : `Ollama injoignable : ${e instanceof Error ? e.message : 'erreur'}`, retryable: true });
    }
    return;
  }

  if (provider === 'hote') {
    const model = HOTE_MODELS[tier];
    try {
      const out = await hoteChat(body.task, model, body.system, body.messages, body.maxTokens ?? task.maxTokens, task.schema ? jsonSchemaFor(body.task, task.schema) : undefined, task.timeoutMs);
      if (!task.schema) {
        res.json({ ok: true, data: out.content, usage: { input_tokens: out.promptTokens, output_tokens: out.outputTokens }, model });
        return;
      }
      const json = extractJson(out.content);
      const valid = json ? task.schema.safeParse(JSON.parse(json)) : null;
      if (!valid?.success) {
        res.status(502).json({ ok: false, error: `Sortie hors schéma : ${valid?.error.issues[0]?.message ?? 'aucun JSON'}`, retryable: true });
        return;
      }
      res.json({ ok: true, data: valid.data, usage: { input_tokens: out.promptTokens, output_tokens: out.outputTokens }, model });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      const attente = (e as { retryAfterMs?: number }).retryAfterMs;
      res.status(timeout ? 504 : attente ? 429 : 502).json({
        ok: false,
        error: timeout ? `${HOTE_NOM} a dépassé le délai.` : attente ? `Limite de débit atteinte (${HOTE_NOM}).` : `${HOTE_NOM} injoignable : ${e instanceof Error ? e.message : 'erreur'}`,
        retryable: true,
        ...(attente ? { retryAfterMs: attente } : {}),
      });
    }
    return;
  }


  const anthropic = client!;
  const model = body.model || DEFAULT_MODELS[tier];
  try {
    const params = {
      model,
      max_tokens: body.maxTokens ?? task.maxTokens,
      system: [{ type: 'text' as const, text: body.system, cache_control: { type: 'ephemeral' as const } }],
      messages: body.messages,
      thinking: task.thinking === 'disabled' ? { type: 'disabled' as const } : { type: 'adaptive' as const },
    };
    if (task.schema) {
      const response = await anthropic.messages.create({
        ...params,
        output_config: { effort: task.effort, format: { type: 'json_schema', schema: jsonSchemaFor(body.task, task.schema) } },
      });
      if (response.stop_reason === 'refusal') {
        res.status(502).json({ ok: false, error: 'Réponse refusée par le modèle.', retryable: false });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(textOf(response));
      } catch {
        res.status(502).json({ ok: false, error: 'Réponse non exploitable (JSON invalide).', retryable: true });
        return;
      }
      const valid = task.schema.safeParse(parsed);
      if (!valid.success) {
        res.status(502).json({ ok: false, error: `Sortie hors schéma : ${valid.error.issues[0]?.message ?? '?'}`, retryable: true });
        return;
      }
      res.json({ ok: true, data: valid.data, usage: response.usage, model: response.model });
      return;
    }
    const response = await anthropic.messages.create({ ...params, output_config: { effort: task.effort } });
    res.json({ ok: true, data: textOf(response), usage: response.usage, model: response.model });
  } catch (e) {
    const p = errorPayload(e);
    res.status(p.status).json({ ok: false, error: p.error, retryable: p.retryable });
  }
});

app.post('/api/llm/stream', async (req: Request, res: Response) => {
  const body = validateBody(req.body);
  if (typeof body === 'string') {
    res.status(400).json({ ok: false, error: body, retryable: false });
    return;
  }
  const provider = await currentProvider();
  if (provider === 'aucun') {
    res.status(401).json({ ok: false, error: 'Aucun fournisseur disponible : lance Ollama, renseigne une clé de fournisseur hébergé (LLM_API_KEY) ou une clé Anthropic.', retryable: false });
    return;
  }
  const task = LLM_TASKS[body.task];
  const tier = body.tier ?? task.tier;
  res.setHeader('content-type', 'text/event-stream');
  res.setHeader('cache-control', 'no-cache');
  res.flushHeaders();
  const send = (payload: object): void => { res.write(`data: ${JSON.stringify(payload)}\n\n`); };

  if (provider === 'ollama') {
    const localModel = (body.model && ollamaModels.includes(body.model)) ? body.model : ollamaByTier![tier];
    try {
      const upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ollamaChatBody({ model: localModel, system: body.system, messages: body.messages, task: body.task, maxTokens: body.maxTokens ?? task.maxTokens, stream: true })),
        signal: AbortSignal.timeout(task.timeoutMs),
      });
      if (!upstream.ok || !upstream.body) throw new Error(`Ollama a répondu ${upstream.status}`);
      // Flux NDJSON : une ligne JSON par fragment.
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let thinking = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          let delta = chunk.message?.content ?? '';
          // Un modèle « thinking » peut ouvrir une balise en cours de flux : on ne relaie pas sa réflexion.
          if (delta.includes('<think>')) { thinking = true; delta = delta.slice(0, delta.indexOf('<think>')); }
          if (thinking && delta.includes('</think>')) { thinking = false; delta = delta.slice(delta.indexOf('</think>') + 8); }
          else if (thinking) delta = '';
          if (delta) send({ delta });
        }
      }
      send({ done: true });
    } catch (e) {
      send({ error: e instanceof Error ? e.message : 'Modèle local indisponible.' });
    } finally {
      res.end();
    }
    return;
  }

  const anthropic = client!;
  const model = body.model || DEFAULT_MODELS[tier];
  try {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: body.maxTokens ?? task.maxTokens,
      system: [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }],
      messages: body.messages,
      thinking: task.thinking === 'disabled' ? { type: 'disabled' } : { type: 'adaptive' },
      output_config: { effort: task.effort },
    });
    stream.on('text', (delta) => send({ delta }));
    const final = await stream.finalMessage();
    send({ done: true, usage: final.usage });
  } catch (e) {
    send({ error: errorPayload(e).error });
  } finally {
    res.end();
  }
});

// ── Voix neuronales d'Edge : gratuites, sans clé, servies en local ──────────────────────────────

app.get('/api/voices/edge/status', async (_req: Request, res: Response) => {
  try {
    const voices = await listFrenchVoices();
    res.json({ available: voices.length > 0, voices });
  } catch (e) {
    res.json({ available: false, voices: [], error: e instanceof Error ? e.message : 'injoignable' });
  }
});

app.post('/api/voices/edge', async (req: Request, res: Response) => {
  const { text, voice, rate, pitch } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || typeof voice !== 'string') {
    res.status(400).json({ error: 'text et voice requis.' });
    return;
  }
  try {
    const audio = await synthesize({
      text,
      voice,
      ...(typeof rate === 'number' ? { rate } : {}),
      ...(typeof pitch === 'number' ? { pitch } : {}),
    });
    res.setHeader('content-type', 'audio/mpeg');
    // L'audio est déterministe pour (texte, voix, prosodie) : le navigateur peut le garder.
    res.setHeader('cache-control', 'public, max-age=86400');
    res.send(audio);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Synthèse indisponible' });
  }
});

// ── ElevenLabs (voix et transcription) : la clé vient de l'en-tête, jamais stockée ici ─────────

app.post('/api/tts', async (req: Request, res: Response) => {
  const key = String(req.header('x-elevenlabs-key') ?? '');
  if (!key) {
    res.status(401).json({ error: 'Clé ElevenLabs absente.' });
    return;
  }
  const { text, voiceId, modelId, settings } = req.body ?? {};
  if (typeof text !== 'string' || typeof voiceId !== 'string') {
    res.status(400).json({ error: 'text et voiceId requis.' });
    return;
  }
  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: modelId ?? 'eleven_multilingual_v2', voice_settings: settings ?? { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `ElevenLabs ${upstream.status}` });
      return;
    }
    res.setHeader('content-type', 'audio/mpeg');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Erreur TTS' });
  }
});

app.post('/api/transcribe', express.raw({ type: 'audio/*', limit: '25mb' }), async (req: Request, res: Response) => {
  const key = String(req.header('x-elevenlabs-key') ?? '');
  if (!key) {
    res.status(401).json({ error: 'Clé ElevenLabs absente.' });
    return;
  }
  try {
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(req.body as Buffer)], { type: req.header('content-type') ?? 'audio/webm' }), 'parole.webm');
    form.append('model_id', 'scribe_v1');
    form.append('language_code', String(req.header('x-lang') ?? 'fr').slice(0, 2));
    const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: form });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `ElevenLabs ${upstream.status}` });
      return;
    }
    const body = (await upstream.json()) as { text?: string };
    res.json({ text: body.text ?? '' });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Erreur de transcription' });
  }
});

app.listen(PORT, () => {
  void (async () => {
    const provider = await currentProvider();
    const log = (m: string): void => {
      // eslint-disable-next-line no-console
      console.log(m);
    };
    log(`Proxy CARRIÈRE sur http://localhost:${PORT}`);
    if (provider === 'ollama') {
      log(`Fournisseur : Ollama local (gratuit) sur ${OLLAMA_URL} — modèles ${ollamaByTier?.courant} / ${ollamaByTier?.premium}`);
      log(`Installés : ${ollamaModels.join(', ')}`);
      log('Préchauffage du modèle…');
      await warmOllama();
      log('Modèle prêt.');
    } else if (provider === 'anthropic') {
      log('Fournisseur : API Anthropic (payante), clé présente.');
    } else {
      log('Aucun fournisseur : le jeu tournera sur ses textes pré-écrits. Lance Ollama, ou renseigne une clé Anthropic dans les Réglages.');
    }
  })();
});
