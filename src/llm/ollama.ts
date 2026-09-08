/**
 * Fournisseur local Ollama : dialogues et narration générés sur la machine du
 * joueur, sans clé et sans frais. Ce module ne contient que des fonctions
 * pures, partagées par le proxy (server/proxy.ts) et testées ; les appels
 * réseau vivent dans le proxy.
 *
 * Deux particularités des modèles locaux sont traitées ici :
 * - les modèles « à raisonnement » (qwen3, deepseek-r1…) émettent parfois leur
 *   réflexion avant la réponse, en anglais ; `stripThinking` la retire ;
 * - la sortie structurée passe par `format` (JSON Schema), ce qui suffit à
 *   contraindre le modèle sans outil externe.
 */
import type { LlmTaskId, LlmTier } from './tasks';

export const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';

/** Le modèle reste chargé en mémoire entre deux appels : sans cela, chaque appel repaie 8 à 10 s de chargement. */
export const OLLAMA_KEEP_ALIVE = '30m';

export interface OllamaMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface OllamaChatBody {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  think: boolean;
  keep_alive: string;
  options: { temperature: number; num_predict: number };
  format?: unknown;
}

/** Températures par tâche : basses pour interpréter, hautes pour raconter. */
const TEMPERATURE: Partial<Record<LlmTaskId, number>> = {
  classify_intent: 0.1,
  analyze_communication: 0.3,
  npc_card: 0.4,
  headlines: 0.85,
  narrate_action: 0.85,
  narrate_ambiance: 0.85,
  describe_situation: 0.8,
  npc_dialogue: 0.85,
  event_scene: 0.85,
  season_summary: 0.7,
  day_narration: 0.8,
};

export function temperatureFor(task: LlmTaskId): number {
  return TEMPERATURE[task] ?? 0.7;
}

/**
 * Retire la réflexion d'un modèle « thinking » : balises explicites, puis
 * préambule en anglais avant le premier objet JSON. Le contenu utile est
 * conservé tel quel quand il n'y a rien à retirer.
 */
export function stripThinking(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Balise ouverte sans fermeture (réponse tronquée) : tout ce qui suit est de la réflexion.
  const open = out.search(/<think>/i);
  if (open >= 0) out = out.slice(0, open);
  return out.trim();
}

/**
 * Premier objet JSON complet du texte, en suivant les accolades hors chaînes.
 * Renvoie null si le texte n'en contient aucun.
 */
export function extractJson(text: string): string | null {
  const clean = stripThinking(text);
  const start = clean.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < clean.length; i++) {
    const c = clean[i]!;
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return clean.slice(start, i + 1);
    }
  }
  return null;
}

/** Taille en milliards de paramètres devinée depuis le nom (`qwen3:8b` → 8). 0 si inconnue. */
export function modelSizeHint(name: string): number {
  const m = /(\d+(?:\.\d+)?)\s*b\b/i.exec(name.replace(/[:_-]/g, ' '));
  return m ? Number(m[1]) : 0;
}

/**
 * Modèles par niveau : le plus gros modèle installé pour les deux, parce que
 * la qualité du français prime et qu'un appel tient en deux secondes. Le
 * joueur peut choisir autrement dans les réglages.
 */
export function chooseOllamaModels(installed: readonly string[]): Record<LlmTier, string> | null {
  if (installed.length === 0) return null;
  const sorted = [...installed].sort((a, b) => modelSizeHint(b) - modelSizeHint(a) || a.localeCompare(b));
  const best = sorted[0]!;
  return { courant: best, premium: best };
}

export interface ChatBodyInput {
  model: string;
  system: string;
  messages: readonly OllamaMessage[];
  task: LlmTaskId;
  maxTokens: number;
  schema?: unknown;
  stream?: boolean;
}

/** Corps d'une requête `/api/chat` : consigne système en tête, sortie contrainte par le schéma. */
export function ollamaChatBody(input: ChatBodyInput): OllamaChatBody {
  const body: OllamaChatBody = {
    model: input.model,
    messages: [{ role: 'system', content: input.system }, ...input.messages],
    stream: input.stream === true,
    think: false,
    keep_alive: OLLAMA_KEEP_ALIVE,
    options: { temperature: temperatureFor(input.task), num_predict: input.maxTokens },
  };
  if (input.schema) body.format = input.schema;
  return body;
}
