/**
 * Fonction hébergée (Cloudflare Workers) qui donne des dialogues générés au
 * jeu publié en ligne, quand le PC du joueur est éteint et qu'Ollama ne
 * répond donc pas.
 *
 * Elle parle le même contrat que le proxy local (`server/proxy.ts`) :
 * `GET /api/key/status` et `POST /api/llm`, mêmes tâches, mêmes schémas Zod,
 * même repli côté client si quelque chose échoue. La clé du fournisseur vit
 * dans un secret Cloudflare et n'atteint jamais le navigateur.
 *
 * Fournisseur par défaut : Groq, dont l'API est compatible OpenAI et dont le
 * palier gratuit suffit largement à une carrière. Voir `edge/README.md`.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { LLM_TASKS, type LlmTaskId, type LlmTier } from '../src/llm/tasks';

export interface Env {
  /** Secret : clé du fournisseur (`npx wrangler secret put LLM_API_KEY`). */
  LLM_API_KEY: string;
  /** Optionnels, pour changer de fournisseur sans toucher au code. */
  LLM_BASE?: string;
  LLM_MODEL_COURANT?: string;
  LLM_MODEL_PREMIUM?: string;
  /** Origines autorisées, séparées par des virgules. */
  ORIGINES?: string;
}

const BASE_DEFAUT = 'https://api.groq.com/openai/v1';
const MODELES_DEFAUT: Record<LlmTier, string> = {
  courant: 'llama-3.3-70b-versatile',
  premium: 'llama-3.3-70b-versatile',
};

/** Mots-clés que les grammaires JSON des fournisseurs n'acceptent pas toujours. */
const RETIRES = new Set(['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'format', 'default', '$schema', 'markdownDescription']);

function nettoyer(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(nettoyer);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (RETIRES.has(k)) continue;
    out[k] = nettoyer(v);
  }
  return out;
}

const cacheSchemas = new Map<string, unknown>();

function schemaDe(task: LlmTaskId): unknown {
  const cached = cacheSchemas.get(task);
  if (cached) return cached;
  const zod = LLM_TASKS[task].schema;
  const json = zod ? nettoyer(zodToJsonSchema(zod, { $refStrategy: 'none' })) : null;
  cacheSchemas.set(task, json);
  return json;
}

function entetes(env: Env, origine: string | null): Record<string, string> {
  const autorisees = (env.ORIGINES ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const ok = origine && (autorisees.length === 0 || autorisees.includes(origine));
  return {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': ok ? origine! : (autorisees[0] ?? '*'),
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  };
}

/** Premier objet JSON complet d'un texte (les modèles ajoutent parfois une phrase autour). */
function extraireJson(texte: string): string | null {
  const debut = texte.indexOf('{');
  if (debut < 0) return null;
  let profondeur = 0;
  let chaine = false;
  let echappe = false;
  for (let i = debut; i < texte.length; i++) {
    const c = texte[i]!;
    if (echappe) { echappe = false; continue; }
    if (c === '\\') { echappe = true; continue; }
    if (c === '"') { chaine = !chaine; continue; }
    if (chaine) continue;
    if (c === '{') profondeur++;
    else if (c === '}' && --profondeur === 0) return texte.slice(debut, i + 1);
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const head = entetes(env, request.headers.get('origin'));
    if (request.method === 'OPTIONS') return new Response(null, { headers: head });

    const modeles: Record<LlmTier, string> = {
      courant: env.LLM_MODEL_COURANT ?? MODELES_DEFAUT.courant,
      premium: env.LLM_MODEL_PREMIUM ?? MODELES_DEFAUT.premium,
    };

    if (url.pathname.endsWith('/key/status')) {
      return new Response(JSON.stringify({
        present: !!env.LLM_API_KEY,
        provider: 'hebergé',
        gratuit: true,
        models: modeles,
        ollama: { disponible: false, url: '', installes: [] },
        anthropic: { cle: false },
      }), { headers: head });
    }

    if (!url.pathname.endsWith('/llm') || request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Route inconnue.', retryable: false }), { status: 404, headers: head });
    }
    if (!env.LLM_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'Aucune clé configurée sur la fonction.', retryable: false }), { status: 401, headers: head });
    }

    let body: { task?: LlmTaskId; tier?: LlmTier; system?: string; messages?: { role: string; content: string }[] };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Corps illisible.', retryable: false }), { status: 400, headers: head });
    }
    const task = body.task && LLM_TASKS[body.task] ? LLM_TASKS[body.task] : null;
    if (!task || typeof body.system !== 'string' || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({ ok: false, error: 'Requête invalide.', retryable: false }), { status: 400, headers: head });
    }

    const schema = schemaDe(task.id);
    // Le schéma est joint à la consigne : tous les fournisseurs compatibles OpenAI
    // n'acceptent pas encore `json_schema`, mais tous respectent `json_object`.
    const systeme = schema
      ? `${body.system}\n\nRéponds UNIQUEMENT par un objet JSON valide conforme à ce schéma, sans texte autour :\n${JSON.stringify(schema)}`
      : body.system;

    try {
      const reponse = await fetch(`${env.LLM_BASE ?? BASE_DEFAUT}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.LLM_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: modeles[body.tier ?? task.tier],
          messages: [{ role: 'system', content: systeme }, ...body.messages],
          max_tokens: task.maxTokens,
          temperature: task.id === 'classify_intent' ? 0.1 : task.id === 'analyze_communication' ? 0.3 : 0.85,
          ...(schema ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(task.timeoutMs),
      });
      if (!reponse.ok) {
        const texte = await reponse.text();
        return new Response(JSON.stringify({ ok: false, error: `Fournisseur ${reponse.status} : ${texte.slice(0, 200)}`, retryable: reponse.status >= 500 || reponse.status === 429 }), { status: 502, headers: head });
      }
      const json = await reponse.json<{ choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }>();
      const contenu = json.choices?.[0]?.message?.content ?? '';
      if (!task.schema) {
        return new Response(JSON.stringify({ ok: true, data: contenu, usage: { input_tokens: json.usage?.prompt_tokens ?? 0, output_tokens: json.usage?.completion_tokens ?? 0 } }), { headers: head });
      }
      const brut = extraireJson(contenu);
      if (!brut) {
        return new Response(JSON.stringify({ ok: false, error: 'Réponse sans JSON exploitable.', retryable: true }), { status: 502, headers: head });
      }
      const valide = task.schema.safeParse(JSON.parse(brut));
      if (!valide.success) {
        return new Response(JSON.stringify({ ok: false, error: `Sortie hors schéma : ${valide.error.issues[0]?.message ?? '?'}`, retryable: true }), { status: 502, headers: head });
      }
      return new Response(JSON.stringify({
        ok: true, data: valide.data,
        usage: { input_tokens: json.usage?.prompt_tokens ?? 0, output_tokens: json.usage?.completion_tokens ?? 0 },
      }), { headers: head });
    } catch (e) {
      const delai = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      return new Response(JSON.stringify({ ok: false, error: delai ? 'Délai dépassé.' : 'Fournisseur injoignable.', retryable: true }), { status: delai ? 504 : 502, headers: head });
    }
  },
};
