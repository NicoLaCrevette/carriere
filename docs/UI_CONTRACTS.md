# Contrats de la couche interface (Phase 2 et suivantes)

Complète `src/engine/CONTRACTS.md`. L'UI ne calcule jamais rien : elle appelle
le moteur, affiche, et persiste.

## Principes

- **Le moteur mute en place** : le store clone (`structuredClone`) l'état
  courant, appelle le moteur sur la copie, puis remplace l'état. Ainsi React
  voit une nouvelle référence et l'ancien état reste intact en cas d'exception.
- **Une seule sauvegarde active par carrière** (§6.7) : chaque fin de journée
  écrase le slot. Pas de « charger l'état d'avant le match » hors mode bac à sable.
- **Aucune dépendance de `src/engine` vers `src/ui`, `src/store`, `src/db`.**
- Direction artistique : sombre et épurée, formes rondes. Typographie condensée
  (`font-display` = Barlow Condensed) pour les titres et les chiffres.
  Palette de `tailwind.config.ts` : `ink` pour les fonds, `accent` (vert citron)
  comme unique couleur d'accent, `signal-*` réservées à l'information (rouge
  alerte, vert positif, ambre avertissement), `muted` pour le texte secondaire.
  Ne jamais réintroduire un accent concurrent : une seule couleur porte l'action.
- Vocabulaire de formes : `Panel` (carte `rounded-card`, contour `ring-1
  ring-white/[0.07]`, ombre basse), `Button` en pilule, pilules de choix
  arrondies, jauges et barres en `rounded-full`, portraits ronds. Les contours
  se font au `ring`, pas au `border` : ils ne décalent pas la mise en page.
  Chiffres clés dans des pastilles rondes. Animations sobres avec Framer Motion.
- **L'interface explique le moteur, elle ne le double jamais.** `ui/lib/
  explainAction.ts` ne fait que nommer et trier `ActionOutcome.modifiers` ;
  `ui/lib/weekBriefing.ts` ne fait que lire `CareerState`. Aucun de ces modules
  ne calcule une probabilité, une note ou un gain : ce serait une seconde
  vérité, qui divergerait.
- Tout le texte en français. Dates via `formatDateFr`.

## Portraits — `ui/lib/avatar.ts` et `components/PlayerAvatar.tsx`

`AvatarConfig` est une donnée d'identité (`Identity.avatar`), donc elle vit dans
le moteur : des index dans des palettes, jamais des couleurs. Les palettes et le
dessin sont à l'interface. Un PNJ sans configuration reçoit un portrait déduit
de son identifiant (`avatarDepuisId`), stable pour toute la carrière.

Deux règles à ne pas contourner : pas de photo de joueur réel (leur image ne
nous appartient pas), et aucun trait déduit de la nationalité. Ce que l'on
reprend du réel, ce sont les couleurs du club, qui sont un fait du jeu de
données. Les identifiants SVG sont préfixés par `useId()` : ils sont globaux au
document, et deux portraits sur un écran partageraient sinon leurs découpes.

## `src/db/db.ts` — Dexie

```ts
export interface SaveSlot {
  id: string;                 // uuid
  name: string;               // « Lucas Moreau — Lille »
  createdAt: string; updatedAt: string;
  summary: { playerName: string; clubName: string; season: string; date: string; age: number; overall: number; position: Position; sandbox: boolean };
  /** CareerState sérialisé (JSON.stringify) pour rester sous la limite structurée d'IndexedDB. */
  careerJson: string;
}
export interface UserDataset { id: string; label: string; json: string; importedAt: string }
export class CarriereDb extends Dexie {
  saves: Table<SaveSlot, string>;
  datasets: Table<UserDataset, string>;
}
export const db: CarriereDb;
export async function listSlots(): Promise<Omit<SaveSlot, 'careerJson'>[]>;
export async function loadSlot(id: string): Promise<CareerState | null>;
export async function saveSlot(id: string, state: CareerState): Promise<void>;
export async function deleteSlot(id: string): Promise<void>;
export async function exportSlot(id: string): Promise<Blob>;            // JSON téléchargeable
export async function importSlot(json: string): Promise<SaveSlot>;      // valide schemaVersion, migre si besoin
```

## `src/data/index.ts` — registre des jeux de données

```ts
export interface DatasetEntry { id: string; label: string; realNames: boolean; referenceSeason: string; load(): Promise<DatasetFile> }
export const BUILTIN_DATASETS: DatasetEntry[];   // real (par défaut) puis fictional
export async function listDatasets(): Promise<DatasetEntry[]>; // intégrés + importés (Dexie)
export async function importUserDataset(json: string): Promise<DatasetEntry>; // parseDataset puis Dexie
```

## `src/store/settingsStore.ts` — Zustand + persist (localStorage)

Préférences hors carrière : `voiceMode`, `pushToTalk`, `speechRate`,
`subtitles`, `ttsProvider`, `elevenLabsKey` (local uniquement), `apiKeyPresent`
(la clé Anthropic vit côté proxy, voir Phase 4), `theme` (fixe sombre),
`lastSlotId`, `datasetId`.

## `src/store/careerStore.ts` — Zustand (état vivant)

```ts
interface CareerStore {
  career: CareerState | null;
  slotId: string | null;
  lastDay: DayResult | null;      // pour afficher ce qui vient de se passer
  busy: boolean;                  // simulation en cours
  error: string | null;
  // Actions
  startNewCareer(setup: CareerSetup, dataset: DatasetFile): Promise<void>;  // newCareer + saveSlot + navigate('home')
  loadCareer(slotId: string): Promise<void>;
  advanceDay(choices?: DayChoices): Promise<DayResult>;  // clone → engine.advanceDay → set → autosave
  saveNow(): Promise<void>;
  exportJson(): Promise<Blob>;
  quit(): void;
  // Sélecteurs mémoïsés (fonctions pures hors du store, dans src/store/selectors.ts)
}
```

`selectors.ts` : `selectPlayerClub`, `selectLeagueTable`, `selectNextMatch`,
`selectTodayActions`, `selectPositionHierarchy`, `selectPlayerAge`,
`selectOverall`, `selectFormLabel`, `selectValueHistory`, `selectSeasonStats`,
`selectRecentResults`, etc. Chaque écran lit via ces sélecteurs.

## `src/store/uiStore.ts`

```ts
type Screen = 'title' | 'new_career' | 'home' | 'match' | 'profile' | 'league' | 'club' | 'media' | 'career' | 'national' | 'settings';
interface UiStore { screen: Screen; navigate(s: Screen): void; modal: ModalSpec | null; openModal(m: ModalSpec): void; closeModal(): void; toasts: Toast[]; toast(t: Omit<Toast, 'id'>): void }
```

## Écrans (`src/ui/screens/`)

| Écran | Fichier | Contenu Phase 2 |
|---|---|---|
| Titre | `TitleScreen.tsx` | logo, slots de sauvegarde (charger / supprimer / exporter / importer), nouvelle carrière, réglages |
| Création | `NewCareerScreen.tsx` | formulaire §2 en étapes : identité → poste et style → niveau/difficulté → club (filtré par niveau) → répartition des 40 points avec plafonds (`allocationLimits`, `validateAllocation`) → récapitulatif |
| Accueil | `HomeScreen.tsx` | bandeau permanent (`TopBar`), journée du jour et ses actions (`DayPanel`), résumé de la veille (`DayRecap`), prochain match (`NextMatchCard`), jauges de réputation (`ReputationStrip`), bouton « Journée suivante » |
| Match | `MatchScreen.tsx` | Phase 2 : match en mode texte automatique lu depuis `lastDay.matchResult` : score, chronologie des événements avec le joueur mis en évidence, lignes de résumé, note et son journal, tableau des cinq regards, statistiques complètes. Phase 3 : flux interactif (voir plus bas). |
| Profil | `ProfileScreen.tsx` | radar des attributs par groupe (`AttributeRadar` en SVG maison), liste `Vitesse 81 → 82` avec barre d'XP, forme/condition/rythme/moral, traits, palmarès, historique des saisons, estimation floue du potentiel |
| Championnat | `LeagueScreen.tsx` | classement complet (le club du joueur surligné), calendrier et résultats par journée, buteurs et passeurs avec la position du joueur |
| Club | `ClubScreen.tsx` | effectif par poste avec notes et forme, hiérarchie au poste du joueur, coach et sa confiance, relations coéquipiers (Phase 4) |
| Médias | `MediaScreen.tsx` | Phase 2 : titres de presse des matchs ; Phase 4 : conférences, citations |
| Carrière | `CareerScreen.tsx` | courbe de valeur marchande (`ValueChart` SVG), contrat, stats de carrière, transferts (Phase 6) |
| Sélection | `NationalScreen.tsx` | statut (Phase 6), placeholder propre en Phase 2 |
| Réglages | `SettingsScreen.tsx` | modes vocaux, clés, difficulté affichée, jeux de données (import), sauvegardes |

## Composants (`src/ui/components/`)

`TopBar`, `Gauge`, `ReputationStrip`, `AttributeRadar`, `AttributeRow`,
`ProgressBar`, `LeagueTable`, `FixtureList`, `ScorersTable`, `SquadList`,
`MatchTimeline`, `RatingTicker`, `EvaluationBoard`, `StatsGrid`,
`ValueChart`, `DayPanel`, `TrainingPicker`, `DayRecap`, `NextMatchCard`,
`Modal`, `Toast`, `Button`, `Panel`, `SectionTitle`, `NumberTabular`.

Chaque composant : props typées, aucune logique métier, styles Tailwind,
accessible (boutons focusables, contrastes ≥ 4.5).

## Flux d'une journée (Phase 2)

1. L'écran Accueil affiche `todayCalendarDay(state)` et `dayActionsFor(...)`.
2. Le joueur choisit son entraînement (ou rien).
3. « Journée suivante » → `careerStore.advanceDay(choices)` → `busy`.
4. Si `lastDay.matchResult` existe et concerne le joueur → navigation automatique vers l'écran Match (mode texte), sinon `DayRecap` sur l'accueil.
5. Autosave.

## Match interactif (Phase 3, pour mémoire)

`src/ui/match/useInteractiveMatch.ts` : hook qui pilote
`buildMatchContext` → `createMatchState` → boucle `advanceUntilSituation` /
`applyDecision` / `finishMatch`, avec `liveMatch` sauvegardé dans le
`CareerState` à chaque situation (reprise après rechargement). Le jour de
match, `advanceDay` ne joue pas le match du joueur si `mode = 'interactif'` :
il expose `pendingPlayerMatchId` et l'UI lance le match ; à la fin, l'UI
appelle `engine.calendar.completePlayerMatch(state, result)` qui applique le
résultat (table, stats, coach, réputation) puis termine la journée. Ce point
d'entrée est à ajouter à `advanceDay.ts` en Phase 3.

## Réalisé (Phases 3 à 7) — écarts par rapport au plan ci-dessus

- **Match interactif** : pas de hook `useInteractiveMatch`, mais un store
  `src/store/matchStore.ts` (phases `idle → running → awaiting → resolving →
  narrated → finished`, objet `MatchState` unique muté par le moteur + compteur
  `tick` pour forcer le rendu) et l'écran `src/ui/match/LiveMatch.tsx`
  (score, chrono, note en direct, fil des événements avec filtre « temps
  forts », situation + réponse libre + timer, narration par intervenant,
  voix, sons). `careerStore.beginDay` / `completePlayerMatch` encadrent le match.
- **Scènes de dialogue** : `src/store/sceneStore.ts` (propositions calculées par
  `llm/scenes/scheduler`, remises à zéro à chaque date, scène obligatoire
  ouverte d'office), `src/ui/scenes/{ConversationPanel,ScenePanel,PostMatchScenes}.tsx`.
  L'analyse (badges, score, deltas appliqués, source IA/repli) s'affiche après
  chaque réponse ; Médias montre le journal des citations et les promesses.
- **Réglages** : clé Anthropic envoyée au proxy (`POST /api/key`), état du proxy,
  interrupteur IA, journal des appels, fournisseur de voix, clé ElevenLabs
  locale, sons d'ambiance.
- **Carrière** : `TransferOffersPanel` (offres, négociation, clubs intéressés,
  demande de transfert), sponsors (signer / négocier / décliner), revenus,
  tableau des saisons, export du palmarès, retraite ; `CareerSummaryPanel` et
  `SeasonRecapPanel` (accueil en fin de saison). Les mutations passent par
  `careerStore.mutate(label, fn)` : clone, moteur, sauvegarde, nouvelle référence.
- **Accueil** : panneau « À traiter » (offres et propositions ouvertes), scènes
  du jour, bilan quand la carrière est terminée.
- **Sélection** : statut, sélectionneur, trêves, matchs internationaux à venir
  et joués, parcours (événements `selection`).
- En développement, `window.__carriere` expose les stores (voir `src/main.tsx`).
