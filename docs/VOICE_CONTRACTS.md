# Contrats de la couche vocale (Phase 5)

Tout vit dans `src/voice/`. Aucune dépendance du moteur vers cette couche. Les
profils vocaux (`VoiceProfile`) sont déjà dans `CareerState.world.npcs[id].voice`
et persistent toute la carrière : cette couche les **résout** en voix concrètes,
elle ne les invente pas.

## Trois modes (§7)

| Mode | PNJ | Joueur |
|---|---|---|
| `vocal` | TTS | micro (push-to-talk ou mains libres) avec repli clavier toujours visible |
| `mixte` | TTS | clavier |
| `silencieux` | texte seul | clavier |

Le mode est dans `settingsStore.voiceMode`. Les sous-titres sont toujours affichés.

## `src/voice/types.ts`

```ts
export interface SpeechRequest {
  id: string;                 // unique par réplique, sert au cache de précharge
  npcId: string | 'commentateur' | 'systeme';
  text: string;
  voice: VoiceProfile;
  /** Priorité : une consigne de coach en match peut couper une ligne d'ambiance. */
  priority: 'normale' | 'haute';
}
export interface SpeechHandle {
  id: string;
  /** Résolue à la fin de la lecture, ou au barge-in (interrupted = true). */
  done: Promise<{ interrupted: boolean }>;
  cancel(): void;
}
export interface TTSProvider {
  readonly name: 'webspeech' | 'elevenlabs';
  available(): Promise<boolean>;
  /** Prépare l'audio sans le jouer (précharge pendant que le joueur réfléchit). */
  preload(req: SpeechRequest): Promise<void>;
  speak(req: SpeechRequest, opts: { rate: number; onBoundary?: (charIndex: number) => void }): SpeechHandle;
  cancelAll(): void;
}
export interface STTResult { transcript: string; isFinal: boolean; confidence?: number }
export interface STTProvider {
  readonly name: 'webspeech' | 'recorder';
  available(): boolean;
  start(opts: { lang: 'fr-FR'; continuous: boolean; onResult: (r: STTResult) => void; onEnd: () => void; onError: (e: string) => void }): void;
  stop(): void;   // termine proprement et livre le final
  abort(): void;  // annule sans résultat
}
```

## `src/voice/tts/webSpeechTTS.ts`

- Utilise `speechSynthesis`. Résout `VoiceProfile` → `SpeechSynthesisVoice` :
  filtre `lang` commençant par `fr`, préfère `webSpeechVoiceHint` si présent,
  sinon choisit de façon **déterministe** (hash de `npcId`) parmi les voix
  françaises disponibles en respectant `gender` quand le nom de la voix le
  permet, puis applique `pitch` et `rate × réglage utilisateur`.
- `preload` est un no-op (la synthèse système est instantanée).
- Gère le bug Chrome des `onend` manquants (timeout de sécurité proportionnel à
  la longueur du texte) et la coupure des textes > 200 caractères en phrases.

## `src/voice/tts/elevenLabsTTS.ts`

- Passe par le proxy : `POST /api/tts` `{ text, voiceId, modelId, settings }`
  avec la clé ElevenLabs envoyée dans l'en-tête `x-elevenlabs-key` depuis le
  stockage local (la clé reste sur la machine de l'utilisateur, jamais dans le
  bundle). Le proxy relaie vers ElevenLabs et renvoie l'audio (mpeg).
- `preload` télécharge et met en cache (Map `id → ArrayBuffer`, limite 40
  entrées). `speak` joue via `AudioContext`/`HTMLAudioElement`.
- Sans `elevenLabsVoiceId` dans le profil : choix déterministe dans une table
  de voix françaises par genre et tranche d'âge (`elevenLabsVoices.ts`).

## `src/voice/stt/webSpeechSTT.ts` et `src/voice/stt/recorderSTT.ts`

- Web Speech : `SpeechRecognition` en `fr-FR`, `interimResults = true`,
  `continuous` selon le mode. Mains libres : fin de phrase détectée après 1,2 s
  sans nouveau résultat intermédiaire (timer réarmé à chaque résultat).
- Repli `MediaRecorder` : enregistre en webm/opus, envoie à `POST /api/transcribe`
  (le proxy relaie vers l'API de transcription d'ElevenLabs si une clé est
  présente ; sinon renvoie une erreur lisible et l'UI bascule au clavier).

## `src/voice/voiceRegistry.ts`

```ts
export function voiceFor(state: CareerState, npcId: string): VoiceProfile;   // PNJ, commentateur, système
export const COMMENTATOR_VOICE: VoiceProfile;
export function assignVoiceProfile(rng: Rng, kind: NpcKind, nationality: CountryCode, birthDate: ISODate): VoiceProfile; // utilisé par le moteur à la création d'un PNJ (déjà dans engine/world), exposé ici pour cohérence
```

## `src/voice/speechQueue.ts`

File d'attente séquentielle : `enqueue(req)`, `preloadNext(req)`, `interrupt()`
(barge-in : annule la réplique en cours, résout `done` avec
`interrupted = true`, et émet un événement `voice:interrupted` que l'analyse
de communication consomme via `flags.interruption`), `replayLast()`,
`setRate(r)`. Événements pour les sous-titres : `onSubtitle({ npcId, text, active })`.

## `src/voice/useVoice.ts` (hook React)

```ts
export function useVoice(): {
  mode: VoiceMode;
  speaking: { npcId: string; text: string } | null;
  listening: boolean;
  transcript: string;           // intermédiaire + final, éditable
  setTranscript(t: string): void;
  startListening(): void; stopListening(): void;  // push-to-talk : appelé sur keydown/keyup Espace
  handsFree: boolean; setHandsFree(v: boolean): void;
  say(req: Omit<SpeechRequest, 'id'>): SpeechHandle;
  preload(req: Omit<SpeechRequest, 'id'>): void;
  interrupt(): void;
  replayLast(): void;
}
```

Espace maintenue = push-to-talk (ignoré si un champ texte a le focus). Le
transcript intermédiaire s'affiche en direct dans `VoiceInput` ; validation par
Entrée ou bouton, édition possible avant envoi.

## Composants `src/ui/voice/`

`VoiceInput` (micro, niveau, transcript éditable, repli clavier),
`Subtitles` (bandeau bas, nom du PNJ, texte en cours, bouton rejouer),
`VoiceSettings` (mode, push-to-talk, vitesse, fournisseur, clé ElevenLabs,
test de voix).

## Précharge en match (§7)

Pendant qu'une situation attend la réponse du joueur, l'UI demande au
narrateur (Phase 4) les deux répliques probables les plus courtes (consigne du
coach, réaction générique du public) et les précharge. La narration de l'issue
ne peut pas être préchargée (elle dépend de la résolution) : elle est
générée en streaming et lue phrase par phrase dès la première phrase complète.
