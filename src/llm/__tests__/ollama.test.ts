/**
 * Fournisseur local Ollama : nettoyage du raisonnement des modèles
 * « thinking », extraction du JSON, choix du modèle, corps de requête.
 */
import { describe, expect, it } from 'vitest';
import { chooseOllamaModels, extractJson, modelSizeHint, ollamaChatBody, OLLAMA_KEEP_ALIVE, stripThinking, temperatureFor } from '../ollama';

describe('ollama : nettoyage du raisonnement', () => {
  it('retire un bloc <think> complet et garde la réponse', () => {
    expect(stripThinking('<think>Okay, the user wants…</think>\nLéo Martin marque.')).toBe('Léo Martin marque.');
    expect(stripThinking('<THINK>bruit</THINK> Réponse.')).toBe('Réponse.');
  });

  it('coupe une balise ouverte sans fermeture (réponse tronquée)', () => {
    expect(stripThinking('Réponse utile.<think>Let me reconsider')).toBe('Réponse utile.');
  });

  it('laisse un texte normal intact', () => {
    expect(stripThinking('  Deux phrases. Sobres.  ')).toBe('Deux phrases. Sobres.');
  });
});

describe('ollama : extraction du JSON', () => {
  it('trouve l’objet même précédé de réflexion ou de texte', () => {
    expect(extractJson('<think>bla</think> Voici : {"a":1} et voilà')).toBe('{"a":1}');
    expect(extractJson('Okay, so the user… {"lines":[{"text":"but"}]}')).toBe('{"lines":[{"text":"but"}]}');
  });

  it('gère les accolades imbriquées et celles à l’intérieur des chaînes', () => {
    expect(extractJson('{"a":{"b":2},"c":"} pas la fin {"}')).toBe('{"a":{"b":2},"c":"} pas la fin {"}');
    expect(extractJson('{"t":"il a dit \\"{\\" puis rien"}')).toBe('{"t":"il a dit \\"{\\" puis rien"}');
  });

  it('renvoie null sans objet JSON', () => {
    expect(extractJson('aucun objet ici')).toBeNull();
    expect(extractJson('{"incomplet": 1')).toBeNull();
  });
});

describe('ollama : choix du modèle', () => {
  it('devine la taille depuis le nom', () => {
    expect(modelSizeHint('qwen3:8b')).toBe(8);
    expect(modelSizeHint('qwen3:4b')).toBe(4);
    expect(modelSizeHint('llama3.1:70b-instruct')).toBe(70);
    expect(modelSizeHint('mistral-small')).toBe(0);
  });

  it('retient le plus gros modèle installé pour les deux niveaux', () => {
    expect(chooseOllamaModels(['qwen3:4b', 'qwen3:8b'])).toEqual({ courant: 'qwen3:8b', premium: 'qwen3:8b' });
    expect(chooseOllamaModels(['mistral', 'llama3:70b'])).toEqual({ courant: 'llama3:70b', premium: 'llama3:70b' });
    expect(chooseOllamaModels([])).toBeNull();
  });
});

describe('ollama : corps de requête', () => {
  const base = { model: 'qwen3:8b', system: 'Consigne.', messages: [{ role: 'user' as const, content: 'Salut' }], maxTokens: 300 };

  it('place la consigne système en tête, coupe le raisonnement et garde le modèle chargé', () => {
    const body = ollamaChatBody({ ...base, task: 'narrate_action' });
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Consigne.' });
    expect(body.messages[1]!.content).toBe('Salut');
    expect(body.think).toBe(false);
    expect(body.stream).toBe(false);
    expect(body.keep_alive).toBe(OLLAMA_KEEP_ALIVE);
    expect(body.options.num_predict).toBe(300);
    expect(body.format).toBeUndefined();
  });

  it('transmet le schéma quand la tâche est structurée', () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    expect(ollamaChatBody({ ...base, task: 'classify_intent', schema }).format).toBe(schema);
  });

  it('interprète froidement et raconte chaudement', () => {
    expect(temperatureFor('classify_intent')).toBeLessThan(0.3);
    expect(temperatureFor('analyze_communication')).toBeLessThan(0.5);
    expect(temperatureFor('narrate_action')).toBeGreaterThan(0.7);
    expect(temperatureFor('npc_dialogue')).toBeGreaterThan(0.7);
  });
});
