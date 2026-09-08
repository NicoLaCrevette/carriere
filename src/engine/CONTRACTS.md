# Contrats des modules du moteur (`src/engine/`)

Ce document fixe les signatures exportées de chaque module pour que plusieurs
personnes (ou agents) puissent implémenter des modules en parallèle sans se
bloquer. **Les signatures ci-dessous font foi.** Si une implémentation a besoin
de dévier, elle le fait en gardant la signature publique et en ajoutant, pas en
retirant.

Règles générales :

- TypeScript strict, zéro dépendance React ou navigateur. Imports **relatifs**
  à l'intérieur de `src/engine` et `src/data` (l'alias `@/` est réservé à l'UI).
- Les fonctions du moteur **mutent en place** l'objet `CareerState` (ou
  `MatchState`, `Player`) qu'on leur passe, pour que la simulation de 100
  saisons reste rapide. Le store UI clone avant d'appeler. Les fonctions
  « pures » (calculs) renvoient une valeur sans muter.
- Toute valeur aléatoire vient d'un `Rng` obtenu par `rngFor(seed, key)` ou
  `nextRng(state, scope)`. **Jamais `Math.random()`.**
- Tous les nombres d'équilibrage viennent de `config/balance.ts`
  (`BALANCE`), jamais en dur dans la logique. Les plafonds §6.3 sont dans
  `BALANCE.caps` et vérifiés par les tests.
- Les bornes sont respectées : attributs 1-99, jauges 0-100, `form` -5..+5,
  `trust`/`respect` -100..+100.
- Dates : `ISODate` (« YYYY-MM-DD »). Helpers dans `calendar/dates.ts`.
- Chaque module a un test unitaire minimal dans `__tests__/`.

---

## `rng/mulberry32.ts`

```ts
export interface Rng {
  /** Uniforme [0, 1). */
  next(): number;
  /** Entier uniforme dans [min, max] inclus. */
  int(min: number, max: number): number;
  /** Vrai avec probabilité p. */
  chance(p: number): boolean;
  /** Élément au hasard (lève si vide). */
  pick<T>(items: readonly T[]): T;
  /** Tirage pondéré : weights[i] ≥ 0. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** Loi normale (Box-Muller). */
  normal(mean: number, sd: number): number;
  /** Copie mélangée (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** État interne courant, pour reprise. */
  state(): number;
}
export function mulberry32(seed: number): Rng;
```

## `rng/derive.ts`

```ts
import type { CareerState, RngKey, Seed } from '../types';
/** Hachage 32 bits stable (xmur3 ou FNV-1a sur la chaîne `${seed}|${scope}|${index}`). */
export function hashKey(seed: Seed, scope: string, index: number): number;
/** RNG déterministe pour une clé. Même clé → même séquence. */
export function rngFor(seed: Seed, key: RngKey): Rng;
/** Incrémente state.rngCounters[scope] et renvoie un RNG pour (scope, ancien compteur). */
export function nextRng(state: CareerState, scope: string): Rng;
/** Clé d'une action de match : scope = matchId, index = minute * 100 + actionIndex. */
export function matchActionKey(matchId: string, minute: number, actionIndex: number): RngKey;
/** Graine 32 bits à partir d'une chaîne quelconque (nom de carrière, date). */
export function seedFromString(s: string): Seed;
```

## `calendar/dates.ts`

```ts
export function addDays(date: ISODate, days: number): ISODate;
export function diffDays(a: ISODate, b: ISODate): number;      // b - a
export function ageAt(birthDate: ISODate, date: ISODate): number; // années révolues
export function dayOfWeek(date: ISODate): number;                // 0 = dimanche
export function monthOf(date: ISODate): number;                  // 1-12
export function yearOf(date: ISODate): number;
export function isBefore(a: ISODate, b: ISODate): boolean;
export function formatDateFr(date: ISODate): string;             // « sam. 15 août 2026 »
```

## `config/balance.ts`

```ts
export const BALANCE = {
  caps: {            // §6.3, probabilité maximale absolue par situation
    butVideDeuxMetres: 0.93, penalty: 0.78, faceAFace: 0.38, repriseSurface: 0.26,
    teteSurCentre: 0.17, frappeHorsSurface: 0.08, dribbleHautNiveau: 0.42, coupFrancDirect: 0.09,
    // + toutes les autres situations/actions, aucune > 0.93
  },
  attributeInfluence: 0.35,         // les attributs déplacent la base de ±35 % max
  shotZoneRisk: { lucarne: 0.45, ... }, // multiplicateur de probabilité par zone visée
  rating: { base: 6.0, min: 3.0, max: 10.0, /* deltas par événement */ },
  seasonTargets: { medianRating: 6.3, share75plus: 0.10, youngStrikerGoals: [4, 9], goalsPerMatchTop: 0.55 },
  matchSim: { /* occasions/minute, poids des forces, avantage domicile, fatigue */ },
  situations: { perMatchByPosition: Record<Position, [min, max]>, minGapMinutes: 3, ... },
  adaptation: { repetitionPenalty: 0.08, repetitionDecayMinutes: 20, scoutingAfterMatches: 5, manMarkingMalus: ... },
  desert: { lengthMatches: [4, 8], finishingMultiplier: 0.72, confidenceMalus: 12 },
  progression: { /* base, facteurs d'âge par groupe, sur-entraînement */ },
  fitness: { /* fatigue par minute, récupération par type de jour */ },
  injuries: { /* base par contexte, multiplicateurs, durées par type */ },
  reputation: { maxPerInteraction: 5, maxPerDay: 12, inertia: Record<ReputationKey, number> },
  marketValue: { /* base par poste, courbes d'âge, etc. §11 */ },
  coach: { /* seuils de sanction, patience, hiérarchie */ },
  contracts: { /* salaires par niveau */ },
} as const;
export type Balance = typeof BALANCE;
```

La forme exacte des sous-objets est libre, mais **tout nombre d'équilibrage
vit ici**. Le tuning se fait uniquement dans ce fichier.

## `config/difficulty.ts`

```ts
export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile>; // table §6.9
export function difficultyProfile(d: Difficulty): DifficultyProfile;
```

## `config/positions.ts`

```ts
export interface PositionProfile {
  position: Position;
  label: string;                                   // « Buteur »
  /** Poids des attributs dans la note globale (somme = 1). */
  weights: Partial<Record<AttributeKey, number>>;
  /** Attributs « clés » affichés en priorité. */
  keyAttributes: AttributeKey[];
  /** Nombre de points de décision par match [min, max] pour un titulaire (§5.2 : 8-16). */
  situationsPerMatch: [number, number];
  /** Mix de situations (poids relatifs). */
  situationMix: Partial<Record<SituationKind, number>>;
  /** Actions par défaut plausibles par type de situation, pour autoplay. */
  defaultActions: Partial<Record<SituationKind, MatchActionId[]>>;
  /** Plafond de points à la création par attribut selon l'âge (§2). */
  creationCaps: Partial<Record<AttributeKey, number>>;
  /** Attributs pénalisés lors d'un poste secondaire. */
  outOfPositionMalus: number;
}
export const POSITION_PROFILES: Record<Position, PositionProfile>;
export function positionProfile(p: Position): PositionProfile;
/** Compatibilité 0-1 entre deux postes (DD→DG 0.8, BU→GB 0.05). */
export function positionCompatibility(a: Position, b: Position): number;
```

## `config/formations.ts`

```ts
export interface Formation { name: string; slots: Position[] /* 11, GB en premier */ }
export const FORMATIONS: Record<string, Formation>; // '4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '3-4-3', '5-3-2', '4-1-4-1', '4-3-1-2'
export function formation(name: string): Formation;  // lève si inconnue
```

## `player/overall.ts`

```ts
export function computeOverall(attributes: Attributes, position: Position): number; // 1-99, arrondi
/** Génère des attributs cohérents autour d'une note au poste, avec bruit seedé et surcharges. */
export function attributesFromOverall(
  overall: number, position: Position, rng: Rng, overrides?: Partial<Attributes>, age?: number,
): Attributes;
export function clampAttribute(v: number): number; // 1-99
```

## `player/createPlayer.ts`

```ts
export interface AllocationLimits { total: number; perAttributeMax: Record<AttributeKey, number>; base: Attributes }
/** Base d'attributs + plafonds selon âge, poste et niveau de départ (§2 : 40 points). */
export function allocationLimits(setup: Pick<CareerSetup, 'startAge' | 'position' | 'startingLevel'>): AllocationLimits;
/** Valide la répartition (total ≤ 40, plafonds). Renvoie la liste des erreurs, vide si OK. */
export function validateAllocation(setup: CareerSetup): string[];
/** Crée le joueur incarné. Tire le potentiel caché dans la fourchette du niveau (§6.8). */
export function createPlayer(setup: CareerSetup, club: Club, league: League, rng: Rng, date: ISODate): Player;
export function emptyStats(): Stats;
export function emptySeasonStats(): SeasonStats;
export function emptyAttributeXp(): AttributeXp;
```

## `player/progression.ts`

```ts
/** Facteur d'âge par attribut : fort 17-23, plateau 24-29, déclin dès 30-31 (physique d'abord). */
export function ageFactor(age: number, key: AttributeKey): number;
/** Applique des XP à un attribut ; passe le point quand xp ≥ 1. Renvoie le gain éventuel. */
export function addAttributeXp(player: Player, key: AttributeKey, xp: number): AttributeGain | null;
/** XP d'une séance : gain = base × facteurÂge × (potentiel − actuel) × qualitéCentre × moral × tempsDeJeu. */
export function trainingXp(
  player: Player, focus: TrainingFocus, intensity: 'legere' | 'normale' | 'intense',
  club: Club, age: number, minutesLast30Days: number,
): Partial<AttributeXp>;
/** XP gagnée en match (minutes, note). */
export function matchXp(player: Player, minutes: number, rating: number, age: number): Partial<AttributeXp>;
/** Déclin quotidien après 30 ans (petites pertes d'XP négatives sur le physique). */
export function applyAgeing(player: Player, age: number): AttributeGain[];
/** Déplace le potentiel de delta, borné à ±6 cumulés depuis la création (§6.8). */
export function nudgePotential(player: Player, delta: number, initialPotential: number): void;
/** Estimation floue du staff, s'affine avec l'âge et la difficulté (§10). */
export function estimatePotential(player: Player, age: number, profile: DifficultyProfile, date: ISODate): PotentialEstimate;
```

## `player/training.ts`

```ts
/** Résout une séance : XP, fatigue, sur-entraînement, blessure éventuelle. Mute player. */
export function runTraining(
  player: Player, focus: TrainingFocus, intensity: 'legere' | 'normale' | 'intense',
  club: Club, profile: DifficultyProfile, date: ISODate, rng: Rng,
): TrainingResult & { injury: Injury | null };
export const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string>;
/** Attributs travaillés par chaque focus (poids relatifs). */
export const TRAINING_TARGETS: Record<TrainingFocus, Partial<Record<AttributeKey, number>>>;
```

## `player/fitness.ts`

```ts
export function applyMatchFatigue(player: Player, minutes: number, intensity: number, age: number): void;
/** Récupération quotidienne selon le type de journée et l'âge. Met aussi à jour sharpness. */
export function dailyRecovery(player: Player, kind: DayKind, age: number): void;
/** Multiplicateur de performance 0.6-1.0 lié à fitness et sharpness. */
export function fitnessMultiplier(player: Player): number;
```

## `player/injuries.ts`

```ts
export interface InjuryContext { origin: InjuryOrigin; minutes: number; intensity: number; contact: boolean; age: number }
/** Tire une blessure ou null. Probabilité = f(fatigue, minutes, intensité, âge, prédisposition, contact) × difficulté. */
export function rollInjury(player: Player, ctx: InjuryContext, profile: DifficultyProfile, rng: Rng, date: ISODate): Injury | null;
/** Avance d'un jour toutes les blessures ; guérison, rechutes, séquelles. Renvoie les blessures guéries. */
export function advanceInjuries(player: Player, date: ISODate, rng: Rng): Injury[];
export function isInjured(player: Player): boolean;
/** Malus d'attributs si le joueur joue blessé (§12). */
export function injuryMalus(player: Player): Partial<Attributes>;
export const INJURY_LABELS: Record<InjuryType, string>;
```

## `player/marketValue.ts`

```ts
/** Formule déterministe §11. `prestige` = prestige du club, `leaguePrestige` = ligue. */
export function computeMarketValue(
  player: Player, age: number, club: Club, league: League, marketInflation: number, date: ISODate,
): Euros;
/** Version PNJ. */
export function computeNpcMarketValue(npc: NpcPlayer, age: number, club: Club, league: League, marketInflation: number): Euros;
/** Salaire mensuel plausible pour une note, un âge et un club. */
export function suggestedWage(overall: number, age: number, club: Club, league: League): Euros;
```

## `world/names.ts`

```ts
/** Prénom + nom crédibles selon la nationalité (pools par pays, repli international). */
export function generateName(rng: Rng, nationality: CountryCode): { firstName: string; lastName: string };
/** Nom de club fictif + ville + stade pour un pays. */
export function generateClubIdentity(rng: Rng, country: CountryCode, used: Set<string>): { name: string; shortName: string; code: string; city: string; stadium: string };
```

## `world/generateSquad.ts`

```ts
export interface NpcSpec {
  clubId: Id; position: Position; targetOverall: number; date: ISODate;
  ageRange?: [number, number]; nationality?: CountryCode; shirtNumber?: number;
}
export function generateNpcPlayer(rng: Rng, spec: NpcSpec, league: League, club: Club): NpcPlayer;
/** Complète l'effectif d'un club jusqu'à un minimum par poste (2 GB, 4 DC, 2 DD, 2 DG, 3 MDC/MC, ...). Mute world. */
export function fillSquad(world: World, club: Club, targetOverall: number, date: ISODate, rng: Rng): NpcPlayer[];
export function generateCoach(rng: Rng, club: Club, date: ISODate, ability?: number): Coach;
/** Construit un NpcPlayer à partir d'une ligne du jeu de données (attributs générés autour de la note). */
export function npcFromDataset(row: DatasetPlayer, clubId: Id, league: League, club: Club, date: ISODate, rng: Rng): NpcPlayer;
```

## `world/generateCalendar.ts`

```ts
export interface FixtureSpec { matchday: number; homeClubId: Id; awayClubId: Id }
/** Aller-retour équilibré (méthode du cercle), alternance domicile/extérieur, retour = miroir. */
export function generateLeagueFixtures(clubIds: Id[], rng: Rng): FixtureSpec[];
export interface SeasonSkeleton { season: Season; matches: Match[]; calendar: CalendarDay[] }
/**
 * Saison complète pour toutes les ligues du monde : dates des journées (week-ends
 * d'août à mai, trêves internationales sept/oct/nov/mars, trêve hivernale
 * ~2 semaines fin décembre, mercatos), objets Match, jours du calendrier avec
 * leur DayKind pour le club du joueur.
 */
export function buildSeason(world: World, startYear: number, playerClubId: Id, seed: Seed): SeasonSkeleton;
export function seasonLabel(startYear: number): string; // « 2026-27 »
```

## `world/loadDataset.ts`

```ts
import type { DatasetFile } from '../../data/schema';
/** Construit le monde depuis un jeu de données validé. Déterministe pour (dataset, seed). */
export function buildWorld(dataset: DatasetFile, seed: Seed, date: ISODate): World;
/** Génère un jeu de données fictif complet (18 clubs, ~26 joueurs chacun) — utilisé pour `fictional/ligue1.json` et les tests. */
export function generateFictionalDataset(seed: Seed, options?: { clubs?: number; country?: CountryCode; leagueId?: string }): DatasetFile;
```

## `match/teamStrength.ts`

```ts
export interface Footballer { id: Id; attributes: Attributes; overall: number; position: Position; identity: Identity; fitness: number; form: number }
/** Accès uniforme joueur incarné / PNJ. Lève si l'id est inconnu. */
export function getFootballer(ctx: MatchContext, id: Id): Footballer;
export function computeTeamStrength(lineup: Lineup, footballers: Record<Id, Footballer>, tactic: Tactic, coach: Coach, homeAdvantage: boolean): TeamStrength;
```

## `match/simulateMinute.ts`

```ts
/**
 * Simulation de fond d'une minute pour les deux équipes : possession, occasion,
 * but, faute, carton, blessure PNJ, changement, fatigue. Ajoute les événements
 * à ms.events et met à jour score/xG/momentum. Ne crée jamais de situation
 * pour le joueur incarné (voir situations.ts) mais signale, via le retour,
 * qu'une occasion impliquant son équipe est disponible pour lui.
 */
export interface MinuteOutcome { events: MatchEvent[]; playerOpportunity: boolean; teamChanceSide?: 'home' | 'away' }
export function simulateMinute(ms: MatchState, ctx: MatchContext, rng: Rng): MinuteOutcome;
/** Modèle d'occasion générique (équipe sans le joueur) : renvoie xG et issue. */
export function resolveTeamChance(side: 'home' | 'away', ms: MatchState, ctx: MatchContext, rng: Rng): MatchEvent[];
```

## `match/situations.ts`

```ts
/**
 * Décide si une situation impliquant le joueur survient cette minute (espacement
 * minimal, quota par poste, implication dans le jeu) et la construit avec ses
 * faits, son xG de base, ses actions autorisées, son action par défaut et le timer.
 */
export function maybeCreateSituation(ms: MatchState, ctx: MatchContext, rng: Rng, opportunity: MinuteOutcome): Situation | null;
/** Contexte de pression 0-1 (enjeu, minute, score, public, adversaire). */
export function pressureAt(ms: MatchState, ctx: MatchContext): number;
/** Situation en cours de match pour un enchaînement (dribble réussi → frappe). */
export function followUpSituation(prev: Situation, outcome: ActionOutcome, ms: MatchState, ctx: MatchContext, rng: Rng): Situation | null;
```

## `match/resolve.ts`

```ts
/**
 * Probabilité finale d'une action : base par situation/action × attributs (±35 %)
 * × zone visée × risque × fatigue × forme × pression × gardien/défenseur × répétition
 * × marquage × désert × difficulté, puis plafond BALANCE.caps. Renvoie aussi la
 * décomposition. PURE, testée exhaustivement (aucune combinaison > plafond).
 */
export function actionProbability(situation: Situation, action: ClassifiedAction, ctx: MatchContext, ms: MatchState): { probability: Prob; modifiers: Record<string, number>; cap: number };
/** Résout l'action avec le RNG dérivé de (matchId, minute, actionIndex). Mute ms (événements, stats, note). */
export function resolveAction(situation: Situation, action: ClassifiedAction, ctx: MatchContext, ms: MatchState): ActionOutcome;
/** Réécrit une action « impossible » ou méta en action par défaut, et compte la tentative méta. */
export function sanitizeAction(situation: Situation, action: ClassifiedAction, ms: MatchState): ClassifiedAction;
```

## `match/adaptation.ts`

```ts
/** −8 % cumulés par répétition (décroissance 20 min). Renvoie un multiplicateur ≤ 1. */
export function repetitionMultiplier(ms: MatchState, action: MatchActionId, kind: SituationKind, minute: number): number;
export function recordRepetition(ms: MatchState, action: MatchActionId, kind: SituationKind, minute: number): void;
/** Active marquage individuel / doublage selon réputation ligue, difficulté, minute et score. Ajoute un événement narré si ça change. */
export function updateOpponentAdaptations(ms: MatchState, ctx: MatchContext, rng: Rng): void;
/** Met à jour le profil de scouting du joueur après un match. */
export function updateScouting(player: Player, decisions: DecisionRecord[], profile: DifficultyProfile): void;
```

## `match/rating.ts`

```ts
export function applyRatingDelta(ms: MatchState, delta: number, reason: string, minute: number): void;
/** Note finale bornée [3, 10], arrondie au dixième, avec pénalité méta (≥3 tentatives → −0.2). */
export function finalizeRating(ms: MatchState): number;
/** Tableau §5.6 : cinq regards notés sur 10 + verdicts textuels de repli (sans LLM). */
export function computeEvaluation(ms: MatchState, ctx: MatchContext, rating: number): MatchEvaluation;
/** Homme du match : rare (note ≥ 8.0 et meilleure note du match, ou décisif). */
export function isManOfTheMatch(ms: MatchState, ctx: MatchContext, rating: number, rng: Rng): boolean;
```

## `match/autoplay.ts`

```ts
/** Choisit une action plausible sans humain : archétypes, poste, score, minute, un peu d'aléa. Utilisé pour le mode auto, l'action par défaut et les tests. */
export function autoDecide(situation: Situation, ctx: MatchContext, ms: MatchState, rng: Rng): ClassifiedAction;
```

## `match/simulateMatch.ts`

```ts
/** Construit le contexte : onze via lineupSelection, forces, côté du joueur, désert. */
export function buildMatchContext(state: CareerState, match: Match, mode: 'auto' | 'interactif'): MatchContext;
export function createMatchState(ctx: MatchContext): MatchState;
/**
 * Avance minute par minute jusqu'à la prochaine situation du joueur ou la fin.
 * Résume les minutes creuses dans ms.summaryLines. Ne résout rien pour le joueur.
 */
export function advanceUntilSituation(ms: MatchState, ctx: MatchContext): { situation: Situation } | { finished: true };
/** Résout la décision du joueur (sanitisation, résolution, enchaînement éventuel géré en interne). */
export function applyDecision(ms: MatchState, ctx: MatchContext, situation: Situation, action: ClassifiedAction, rawInput: string, timedOut: boolean): ActionOutcome;
/** Clôture : note finale, évaluation, stats, rapport, MatchResult. Ne touche pas CareerState. */
export function finishMatch(ms: MatchState, ctx: MatchContext): MatchResult;
/** Match complet en mode auto (autoplay pour le joueur). */
export function runMatchAuto(ctx: MatchContext): MatchResult;
/** Match entre deux clubs sans le joueur (autres affiches de la journée). */
export function runBackgroundMatch(state: CareerState, match: Match): MatchResult;
```

## `season/table.ts`

```ts
export function emptyTable(clubIds: Id[]): TableRow[];
export function applyResultToTable(ls: LeagueSeason, match: Match): void;
/** Tri : points, différence, buts marqués, confrontation directe ignorée en Phase 1, puis nom. */
export function sortTable(rows: TableRow[], format: LeagueFormat): TableRow[];
export function rankOf(ls: LeagueSeason, clubId: Id): number; // 1-based
export interface ScorerRow { playerId: Id; clubId: Id; goals: number; assists: number; matches: number }
export function topScorers(state: CareerState, competitionId: Id, limit?: number): ScorerRow[];
export function topAssists(state: CareerState, competitionId: Id, limit?: number): ScorerRow[];
```

## `season/lineupSelection.ts`

```ts
/**
 * Le coach IA compose le onze et le banc : formation du coach, meilleurs au poste
 * (note × forme × fitness × confiance du coach), blessés et suspendus exclus,
 * rotation légère. Le joueur incarné est traité comme les autres via coachTrust
 * et sa hiérarchie (§6.5 : concurrent meilleur au départ).
 */
export function pickLineup(state: CareerState, clubId: Id, match: Match, rng: Rng): Lineup;
/** Statut du joueur pour ce match, dérivé du onze. */
export function playerStatus(lineup: Lineup, playerId: Id): 'titulaire' | 'banc' | 'tribune';
/** Hiérarchie par poste du club (ids triés), joueur incarné inclus. Écrit club.positionHierarchy. */
export function updatePositionHierarchy(state: CareerState, clubId: Id): void;
/** Réaction du coach après match : coachTrust, sortie anticipée, banc. Tolérance selon difficulté. */
export function updateCoachTrust(state: CareerState, report: PlayerMatchReport, match: Match): { delta: number; reason: string };
/** Décide, en match, si le coach sort le joueur (mauvaise note, fatigue, tactique). */
export function shouldSubOff(ms: MatchState, ctx: MatchContext, rng: Rng): { yes: boolean; reason?: string };
```

## `season/desert.ts`

```ts
/** Programme 1-3 traversées du désert pour la saison selon la difficulté (§6.6). Mute season. */
export function scheduleDesertSpells(season: Season, profile: DifficultyProfile, expectedPlayerMatches: number, rng: Rng): void;
export function activeDesert(season: Season): DesertSpell | null;
/** À appeler après chaque match du joueur. */
export function advanceDesert(season: Season): void;
```

## `season/npcProgression.ts`

```ts
/** Forme/moral des PNJ après un match (buteurs, notes simplifiées). */
export function updateNpcAfterMatch(world: World, result: MatchResult, match: Match): void;
/** Progression annuelle des PNJ : jeunes montent vers le potentiel, vieux déclinent, retraites, remplacements. */
export function progressNpcPlayersYearly(world: World, date: ISODate, rng: Rng): void;
/** Récupération quotidienne légère des PNJ (fitness, blessures). */
export function dailyNpcRecovery(world: World, date: ISODate, rng: Rng): void;
```

## `season/endOfSeason.ts`

```ts
/** Récompenses de la saison (buteur, passeur, joueur, espoir, équipe type) — déterministes depuis les stats. */
export function computeAwards(state: CareerState): Award[];
/** Fige la saison du joueur (SeasonRecord), applique montées/descentes (clubs relégués remplacés par des promus générés ou du dataset), récompenses, progression annuelle des PNJ, valeur marchande. */
export function closeSeason(state: CareerState): SeasonRecord;
/** Crée la saison suivante : calendrier, remise à zéro des stats de saison, mercato à venir. */
export function startNextSeason(state: CareerState): void;
```

## `reputation/reputation.ts`

```ts
export function initialReputation(setup: CareerSetup, club: Club, date: ISODate): Reputation;
/** Applique des deltas bornés (±5 par appel, ±12 par jour via state.reputationDeltasToday) avec inertie par jauge. Renvoie les deltas réellement appliqués. */
export function applyReputationDeltas(state: CareerState, deltas: ReputationDeltas, reason: string): ReputationDeltas;
/** Deltas déterministes après un match (note, décisif, statut, résultat, enjeu). Passe par applyReputationDeltas. */
export function reputationAfterMatch(state: CareerState, report: PlayerMatchReport, match: Match): ReputationDeltas;
/** Dérive lente hebdomadaire vers un niveau « mérité » (réputation monde lente, supporters volatile). */
export function weeklyReputationDrift(state: CareerState): void;
/** Compacte l'historique (derniers 200 points + 1 par mois). */
export function compactGaugeHistory(gauge: Gauge): void;
```

## `calendar/dayKind.ts`

```ts
/** Type de journée pour le joueur à une date : jour de match, veille, lendemain, trêve, mercato, vacances, rééducation… */
export function dayKindFor(state: CareerState, date: ISODate): DayKind;
/** Actions proposées pour la journée (1-3 : entraînement, récupération, soins, repos). Phase 1 : entraînements seulement. */
export function dayActionsFor(state: CareerState, day: CalendarDay): DayAction[];
export function nextPlayerMatch(state: CareerState, from: ISODate): Match | null;
export function todayCalendarDay(state: CareerState): CalendarDay;
```

## `calendar/advanceDay.ts`

```ts
export interface DayChoices { training?: { focus: TrainingFocus; intensity: 'legere' | 'normale' | 'intense' } }
/**
 * Joue la journée courante puis passe au lendemain (currentDate + 1) :
 * entraînement choisi, matchs de la journée (le joueur en auto en Phase 1, les
 * autres en fond), récupération, blessures, coach, réputation, désert,
 * valeur marchande le 1er du mois, dérive hebdo, fin de saison le cas échéant.
 * Mute state. Renvoie ce qui s'est passé.
 */
export function advanceDay(state: CareerState, choices?: DayChoices): DayResult;
/** Joue tous les matchs d'une date pour toutes les ligues (utilisé par advanceDay). */
export function playMatchesOfDay(state: CareerState, date: ISODate): MatchResult[];
```

## `career/newCareer.ts`

```ts
import type { DatasetFile } from '../../data/schema';
/** Carrière neuve : monde depuis le dataset, joueur, saison, calendrier, réputation, PNJ initiaux (coach, capitaine, agent, journaliste, mère). Date de départ : 1er juillet de l'année de référence. */
export function newCareer(setup: CareerSetup, dataset: DatasetFile): CareerState;
export const SCHEMA_VERSION: number;
```

## `career/apply.ts`

```ts
export interface EngineDeltas {
  reputation?: ReputationDeltas;
  relationships?: RelationshipDelta[];
  memory?: Omit<MemoryEntry, 'id'>[];
  log?: Omit<CareerLogEntry, 'date'>[];
  morale?: number;
}
/** Seul point d'entrée pour appliquer des deltas venant du LLM ou d'événements : bornes, journal, mémoire. */
export function applyDeltas(state: CareerState, deltas: EngineDeltas, reason: string): void;
export function clamp(v: number, min: number, max: number): number;
export function addLog(state: CareerState, category: CareerLogEntry['category'], text: string): void;
```

## `scripts/simulateSeason.ts` (hors engine, `npm run sim`)

Options CLI : `--seed=123 --dataset=real|fictional --position=BU --age=18 --level=prometteur --difficulty=exigeant --seasons=1 --quiet`.
Affiche : classement final, meilleurs buteurs, stats du joueur (matchs, titularisations, minutes, buts, xG, note moyenne, distribution des notes), progression des attributs, valeur marchande, blessures, traversées du désert subies.

## Tests (`__tests__/`)

- `rng.test.ts` : reproductibilité, distribution uniforme, `matchActionKey` stable.
- `calendar.test.ts` : 18 clubs → 34 journées × 9 matchs, chaque paire deux fois avec inversion, un match par club et par journée, dates croissantes, trêves respectées.
- `table.test.ts` : points, tri, différence de buts.
- `resolve.caps.test.ts` : pour chaque situation/action, attributs 99 partout, forme +5, fitness 100, pression 0, risque 0 → probabilité ≤ plafond §6.3 ; attributs 1 → probabilité > 0 et < base.
- `progression.test.ts` : facteur d'âge, passage de point, plafond du potentiel, ±6.
- `season.distribution.test.ts` : 100 saisons (graines 1..100), attaquant de 18 ans « prometteur », difficulté « exigeant », club de milieu de tableau. Cibles §6.5 : médiane des notes du joueur ≈ 6.3 (6.1-6.5), part de notes ≥ 7.5 entre 6 % et 15 %, buts par saison médiane dans [4, 9], classements plausibles (le champion entre 70 et 95 points, dernier entre 15 et 40), buts par match de ligue entre 2.3 et 3.3, meilleur buteur de Ligue 1 entre 14 et 30.

---

## Écarts et ajouts constatés à l'intégration (Phase 1 → Phase 4)

- **Balance** : `BALANCE` est composé depuis `config/balance/{core,world,player,match,season,reputation,career,depth}.ts` (un sous-fichier par module, limite de 600 lignes). Tout nombre d'équilibrage y vit ; ajouts par Edit ciblé dans la section du module.
- **`calendar/advanceDay.ts`** : `advanceDay(state, choices?, hooks?)` avec `DayChoices.playerMatchMode: 'auto' | 'interactif'` et `DayHooks.onDayCompleted`. En mode interactif avec un match du joueur, la journée s'arrête avant ce match (`DayResult.pendingPlayerMatchId`, `state.pendingDay`) ; l'interface joue le match via `match/simulateMatch` puis appelle `completePlayerMatch(state, matchResult, hooks?)`. Exports supplémentaires : `playerMatchOfDay(state, date)`, `applyMatchToWorld(state, match, result)`, `playMatchesOfDay(state, date, { skipMatchId? })`.
- **`career/promises.ts`** : `evaluatePromises(state)` (appelé chaque jour par `finishDay`) et `promiseVerdict(state, promise)` ; effets dans `BALANCE.career.promises`.
- **`season/coachReaction.ts`** : `weeklyCoachTrustDrift(state)` (dimanche) : la confiance dérive vers un mérite dicté par le rang au poste (`BALANCE.coach.trustMerit`) ; le banc garantit une place au joueur dès `lineup.playerBenchTrustFrom` de confiance ; le banc est composé par couverture de postes.
- **`season/npcProgression.ts`** : gain annuel des PNJ plafonné (`yearlyGainMax`) et borné par le prestige du club (`clubCeiling`) en l'absence de mercato PNJ.
- **Match** : `simulateMinute` défère l'occasion de la minute au joueur quand il est sur le terrain (`MinuteOutcome.teamChanceSide/chanceKind/chanceXg`) ; l'orchestrateur appelle `resolveDeferredChance` si aucune situation n'est créée. Fichiers supplémentaires : `match/actionTable.ts` (table situation × action → base, attributs, issues), `match/outcomes.ts` (application des issues), `match/narration.ts` (résumés et titres de repli), `match/matchEvents.ts` (helpers). `resolve.actionProbability` renvoie aussi `xg` (xG de la situation) et `impossible`. `subOffPlayer(ms, ctx, reason, rng)` et `expelPlayer` dans `simulateMinute.ts`. `situations.initialSituationTarget`, `primarySituationCount`, `isSetPieceTaker`, `buildSituation` exportés.
- **Types ajoutés** : `MatchState.tick/tickActions/situationTarget/passiveDrift` (optionnels), `MatchContext.playerLeagueReputation`, `PlayerMatchReport.injury/headlines`, `DayResult.pendingPlayerMatchId`, `PendingDay`, `CareerState.pendingDay`. La clé RNG d'une action est `matchActionKey(matchId, tick, n° d'action dans la minute)` ; les minutes de fond utilisent l'index 0.
- **Simulation** : `sim/headless.ts` (`runHeadlessSeason`, `buildAllocation`, `midTableClubId`, `resultHash`) et `scripts/simulateSeason.ts` (`--debug=N` affiche chaque décision avec sa décomposition de probabilité).
- **Données** : `data/leagues/real/ligue1-2026-27.json` (assemblé depuis `real/clubs/*.json` par `scripts/assembleRealDataset.ts`) et `data/leagues/fictional/ligue1.json` (`scripts/generateFictional.ts`, graine 42).
- **Couche LLM (Phase 4)** : `src/llm/` — `classify/keywords.ts` + `classify/intent.ts`, `narrate/match.ts`, `narrate/press.ts`, `scenes/conversation.ts` + `scenes/scheduler.ts`, `memory.ts`, `context.ts`, `client.ts`, `schemas.ts`, `tasks.ts`, `prompts/*`, `fallback/*`. Aucune de ces fonctions n'écrit l'état autrement que par `career/apply.applyDeltas` (bornes ±5 / ±12) et les listes `quotes`, `promises`, `storylines`, `memory`.
- **Couche vocale (Phase 5)** : `src/voice/` — `speechQueue.ts`, `voiceRegistry.ts`, `tts/*`, `stt/*`, `useVoice.ts`.
- **Boucle de semaine** : `season/week.ts` — `WeekPlan` (séance dominante + intensité, ou `'auto'`), `advanceWeek(state, plan, hooks)` qui enchaîne `advanceDay` et s'arrête sur `match` (sans consommer la journée : l'interface joue le match), `evenement` (événement neuf non résolu), `fin_de_saison`, `retraite`, `erreur` ou `fin_de_semaine`. `trainingForPlan` laisse au moteur la veille et le lendemain de match. Constantes dans `balance/season.ts` section `week`. L'interface (`careerStore.advanceWeek`, `ui/components/WeekPanel.tsx`) ne fait que présenter le plan et le bilan.
- **Chrono de décision** : le moteur fournit un chrono **nu** (`situation.timerSeconds`, `difficulty.decisionTimerSeconds` : 16/13/10 s) ; l'interface l'adapte au mode de jeu (`BALANCE.situations.voiceTimerMultiplier` ×2 et plancher `voiceTimerMinimumSeconds` 20 s en mode vocal), ne l'arme qu'après la lecture de l'annonce (`matchStore.armDeadline`, appelé par `LiveMatch` à la fin du TTS, avec filet de sécurité), le prolonge tant que le micro entend une phrase (`extendDeadlineWhileSpeaking`, quota borné), et à l'échéance envoie ce que le joueur a déjà dit ou écrit plutôt que l'action par défaut. `MatchState.situationDeadlineAt` persiste l'échéance : rouvrir l'écran ne redonne pas de temps.
- **Taille de la sauvegarde** : `season/compactMatches.ts` — `compactBackgroundMatch` (appelé par `applyMatchToWorld`) réduit un match d'un autre club à son score dès que le monde l'a absorbé ; `compactOldPlayerMatches` (le dimanche, dans `finishDay`) ne garde flux d'événements, décisions et journal de note que pour les `BALANCE.career.saves.keepMatchFeedForLastPlayerMatches` derniers matchs du joueur. Le rapport (note, statistiques, évaluation, titres) est conservé pour toujours. Mesuré : ≈ 2.8 Mo après 6 saisons et demie, contre 4.8 Mo sans compression. `startNextSeason` ne conserve déjà que les matchs joués du joueur.
- **Sélection et événements (Phase 6)** : `national/{eligibility,squads,selection,matchContext}.ts` et `events/{catalogue,roll,helpers}.ts`, balances `config/balance/{national,events}.ts` composées dans `depth.ts`. Écarts retenus : les sélections sont des clubs pseudo `nat_<CODE>` de `leagueId: 'international'` (constante `INTERNATIONAL_COMPETITION_ID` dans `types.ts`) ; `buildInternationalMatchContext` remplace `buildMatchContext` pour ces matchs (le joueur n'appartient pas au club de sa sélection) via `calendar/advanceDay.buildContextFor` ; `season/npcProgression` ne recomplète pas ces clubs (c'est `ensureNationalSquad` qui le fait) ; `calendar/matchEffects` saute le coach de club et le désert pour un match international et applique `reputation.reputationAfterInternationalMatch` (sélection, monde, médias) ; les statistiques d'un match international sont cumulées une seule fois, par `applyPlayerMatchEffects`, jamais par `recordInternationalResult`. Un événement sans réponse est refermé par `events/roll.expireEvent` **sans issue** : le silence n'est jamais puni (§6.2).
- **Profondeur (Phase 6, `docs/PHASE6_CONTRACTS.md`)** : `career/traits.ts` (`TRAIT_CATALOGUE`, `grantTrait`, `removeTrait`, `evaluateTraits`, `traitMultiplier` lu par `match/resolve` pour `pression_grand_match` et `finition` ; compteurs dans `Player.counters`, séances intenses comptées par `player/training.ts`), `career/sponsors.ts` (`rollSponsorOffers`, `respondToSponsor`, `expireSponsorDeals`, `accrueMonthlyEarnings`, `accrueMatchBonuses`, revenus dans `Player.earnings`), `career/retirement.ts` (`canRetire`, `mustRetire`, `careerSummary`, `retire`), balance dans `config/balance/careerDepth.ts`. Types ajoutés par ajout : `Player.earnings`, `Player.counters` (`PlayerCounters`), `SponsorDeal.status/proposedOn/negotiated`, `SeasonRecord.overallEnd`.
