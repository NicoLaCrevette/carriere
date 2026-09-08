# Contrats de la Phase 6 — profondeur (mercato, sélection, événements, traits, sponsors, fin de carrière)

Complète `src/engine/CONTRACTS.md`. Mêmes règles : TypeScript strict, imports
relatifs, zéro dépendance UI, aucun `Math.random` (RNG dérivé de la graine via
`rngFor` / `nextRng`), tous les nombres dans `src/engine/config/balance/*.ts`
(nouveau sous-fichier `depth.ts` composé dans `balance.ts`), fonctions qui
mutent `CareerState` en place, tests Vitest dans `src/engine/__tests__/`.
Le LLM ne décide de rien ici : il habille (scènes) ce que ces modules
calculent.

## `src/engine/transfers/`

### `interest.ts`

```ts
export interface ClubInterest { clubId: Id; stars: 1 | 2 | 3 | 4 | 5; need: PromisedRole; reason: string }
/**
 * Intérêt de chaque club (hors club actuel) pour le joueur : besoin au poste
 * (hiérarchie du club vs note et potentiel estimé du joueur), budget vs valeur
 * marchande, prestige vs réputation ligue/monde, âge. 0 étoile = pas listé.
 * Déterministe ; recalculé chaque semaine pendant les fenêtres.
 */
export function computeInterest(state: CareerState): ClubInterest[];
```

### `offers.ts`

```ts
/** Vrai si une fenêtre de mercato est ouverte à la date. */
export function transferWindowOpen(state: CareerState, date: ISODate): 'summer' | 'winter' | null;
/**
 * Tirage quotidien pendant une fenêtre : au plus 3 offres ouvertes, nouvelles
 * offres depuis les clubs intéressés (probabilité par étoile), montant ≈ valeur
 * marchande × (0.7-1.4 selon l'intérêt et la concurrence), salaire via
 * suggestedWage du club acheteur, durée 2-5 ans, rôle promis selon le besoin,
 * clause libératoire parfois, prêt pour un jeune peu utilisé, expiration +10 j,
 * position du club actuel (ouvert / réticent / fermé) selon la durée de contrat
 * restante, l'importance du joueur et le montant. Crée un GameEvent 'agent'.
 */
export function rollTransferOffers(state: CareerState): TransferOffer[];
/** Expire les offres dépassées. */
export function expireOffers(state: CareerState): TransferOffer[];
```

### `negotiate.ts`

```ts
export interface CounterProposal { wageMonthly?: Euros; years?: number; releaseClause?: Euros; promisedRole?: PromisedRole }
export type OfferDecision = { type: 'accepter' } | { type: 'refuser' } | { type: 'negocier'; counter: CounterProposal };
/**
 * Réponse à une offre : accepter (→ executeTransfer si la fenêtre est ouverte,
 * sinon transfert programmé à l'ouverture), refuser, négocier (contre-proposition
 * acceptée avec une probabilité qui décroît avec l'écart, ou contre-contre-offre,
 * au plus 2 tours ; journal dans offer.negotiationLog). Mute state.
 */
export function respondToOffer(state: CareerState, offerId: Id, decision: OfferDecision): { offer: TransferOffer; outcome: 'accepte' | 'refuse' | 'contre_offre' | 'retire'; message: string };
/**
 * Exécute un transfert : contrat, club (squad du nouveau club, hiérarchie),
 * matchs à venir (involvesPlayer recalculé), TransferRecord, inflation,
 * réputation (supporters de l'ancien club −, nouveau club initial selon prestige),
 * coachTrust ≈ 45, souvenir, journal. Le prêt garde le club propriétaire.
 */
export function executeTransfer(state: CareerState, offer: TransferOffer): TransferRecord;
/** Demande de transfert publique : malus immédiats (BALANCE.coach.transferRequest), club « ouvert », storyline 'demande_transfert'. */
export function requestTransfer(state: CareerState): void;
/** Prolongation proposée par le club actuel (contrat < 12 mois, joueur utile) : nouvelle offre de type prolongation dans state.offers avec clubId = club actuel. */
export function rollContractRenewal(state: CareerState): TransferOffer | null;
```

Points d'attention : un club acheteur doit avoir un effectif cohérent (le joueur
remplace la hiérarchie au poste) ; un transfert en cours de saison conserve les
statistiques par compétition ; `state.player.contract.loanFromClubId` pour un
prêt (retour automatique à la fin de saison dans `endOfSeason`, à brancher).

## `src/engine/national/`

### `eligibility.ts`

```ts
export function eligibleCountries(player: Player): CountryCode[];   // nationalité + double nationalité
export function canSwitchCountry(state: CareerState): boolean;        // tant que lockedIn est faux
export function switchCountry(state: CareerState, country: CountryCode): void;
```

### `squads.ts`

```ts
/** Force d'une sélection (0-100) depuis une table par pays dans balance (FRA 92, BRA 91, … repli 55). */
export function countryStrength(country: CountryCode): number;
/** Effectif de la sélection : meilleurs PNJ du monde de cette nationalité, complétés par des PNJ générés (world.nationalSquads[country], clubs pseudo `nat_<CODE>` dans world.clubs avec leagueId 'international'). Idempotent. */
export function ensureNationalSquad(state: CareerState, country: CountryCode): Club;
```

### `selection.ts`

```ts
/**
 * À chaque trêve internationale (season.internationalBreaks) : évalue le joueur
 * (note, minutes sur 60 jours, réputation ligue/monde/nationalTeam, âge, force de
 * la sélection) et fait évoluer `state.national.stage` : aucun → espoirs (≤ 21 ans,
 * seuil bas) → pre_liste → convoque → titulaire → cadre → capitaine, avec
 * possibilité de redescendre. Crée un GameEvent 'selection' et le PNJ
 * sélectionneur (une fois par pays). Une première convocation A + match joué → lockedIn.
 */
export function evaluateSelection(state: CareerState): { stage: NationalStage; changed: boolean; reason: string };
/** Matchs de la trêve (2) pour la sélection du joueur si convoqué : adversaires générés (force par pays), matchs 'international' dans state.matches (involvesPlayer), joués via runMatchAuto ou laissés à l'interface en mode interactif comme un match de club (advanceDay les traite comme des matchs du joueur). Stats dans seasonStats.byCompetition['international'], national.caps/goals/assists. */
export function scheduleInternationalMatches(state: CareerState, breakStart: ISODate): Match[];
```

`calendar/dayKind.ts` renvoie déjà `rassemblement_selection` / `match_international` ;
brancher : pendant une trêve, si `state.national.stage ∈ {convoque, titulaire, cadre, capitaine}`,
les jours deviennent `rassemblement_selection` et les jours de match `match_international`.

## `src/engine/events/`

### `catalogue.ts`

```ts
export interface EventDefinition {
  id: Id; category: EventCategory; title: string;
  /** Poids 0 = impossible aujourd'hui. Fonction pure de l'état. */
  weight(state: CareerState): number;
  cooldownDays: number; oncePerSeason?: boolean;
  /** Faits pour le narrateur, tirés avec le RNG fourni. */
  facts(state: CareerState, rng: Rng): Record<string, string | number | boolean>;
  /** PNJ impliqués (existants ou créés à la volée : frère, partenaire, sponsor…). */
  npcIds(state: CareerState, rng: Rng): Id[];
  /** Effets immédiats (moral, réputation) et storyline éventuelle. */
  immediate?(state: CareerState): void;
  storyline?: { kind: StorylineKind; title: string; deadlineDays: number };
  /** Issues possibles quand le joueur répond (l'analyse de communication choisit par score/flags) : effets par issue. */
  outcomes: { id: string; label: string; minScore?: number; flags?: Partial<CommunicationFlags>; apply(state: CareerState): void }[];
}
export const EVENT_CATALOGUE: EventDefinition[];   // ≥ 25 définitions couvrant toutes les catégories de EVENT_CATEGORIES
```

### `roll.ts`

```ts
/** Tirage quotidien : au plus un événement par jour (probabilité totale BALANCE.depth.events.dailyProb), pondéré, cooldowns et unicité respectés ; crée GameEvent (resolved false) et la storyline. Appelé par finishDay. */
export function rollDailyEvents(state: CareerState): GameEvent[];
/** Résout un événement avec l'issue choisie (par la scène ou par défaut à l'expiration). */
export function resolveEvent(state: CareerState, eventId: Id, outcomeId: string): void;
/** Fait vivre les storylines : échéances → expirée/échouée, étapes, résolution avec trace permanente (trait). */
export function advanceStorylines(state: CareerState): void;
/** Changement d'entraîneur : série de mauvais résultats du club (points sur 8 matchs) → probabilité de licenciement, nouveau coach généré (generateCoach), ancien inactif, coachTrust du joueur remis vers 40, événement 'changement_coach'. */
export function maybeChangeCoach(state: CareerState): boolean;
```

## `src/engine/career/traits.ts`

```ts
export const TRAIT_CATALOGUE: Record<string, { label: string; description: string; polarity: Trait['polarity']; modifiers: Record<string, number> }>;
export function grantTrait(state: CareerState, traitId: string, origin: string): Trait | null;   // idempotent
export function removeTrait(state: CareerState, traitId: string, reason: string): void;
/** Règles d'acquisition évaluées après chaque match et chaque fin de mois : sang_froid_grands_matchs (3 buts décisifs en matchs ≥ 70 d'enjeu), chouchou_du_public (supporters ≥ 80 pendant 60 jours), tete_brulee (2 rouges dans la saison), bourreau_de_travail (60 séances intenses), fragile (3 blessures > 14 j en 18 mois), leader (capitaine 30 matchs), mercenaire (3 transferts en 4 ans), ingrat (demande de transfert), etc. */
export function evaluateTraits(state: CareerState): Trait[];
/** Multiplicateur d'un modificateur de trait (1 si aucun trait ne le porte). Utilisé par match/resolve pour 'pression_grand_match' et 'finition'. */
export function traitMultiplier(player: Player, key: string): number;
```

## `src/engine/career/sponsors.ts`

```ts
/** Propositions de sponsors (marques fictives : Aerion, Volta, Brava, Nordik…) quand la réputation le permet ; négociation ±20 % ; obligations (posts, apparitions) qui deviennent des événements ; revenus cumulés dans player.earnings. */
export function rollSponsorOffers(state: CareerState): SponsorDeal[];
export function respondToSponsor(state: CareerState, dealId: Id, decision: 'accepter' | 'refuser' | 'negocier'): { outcome: 'accepte' | 'refuse' | 'contre_offre'; deal: SponsorDeal };
```

Ajout de types (autorisé, par ajout) : `Player.earnings?: { wagesTotal: Euros; bonusesTotal: Euros; sponsorsTotal: Euros }`,
`SponsorDeal.status?: 'proposee' | 'active' | 'refusee' | 'terminee'`, `SponsorDeal.proposedOn?: ISODate`.

## `src/engine/career/retirement.ts`

```ts
export interface CareerSummary { seasons: number; clubs: string[]; matches: number; goals: number; assists: number; peakOverall: number; peakValue: Euros; trophies: TrophyKind[]; awards: Award[]; traits: string[]; quotes: number; nationalCaps: number; verdict: string }
export function canRetire(state: CareerState): boolean;   // ≥ 33 ans, ou sans contrat, ou blessure de fin de carrière
export function retire(state: CareerState, reason: string): CareerSummary;   // retired = true, journal, souvenir, bilan
export function careerSummary(state: CareerState): CareerSummary;
```

## Branchements dans la boucle quotidienne (`calendar/advanceDay.ts`, `finishDay`)

Dans cet ordre, après l'entretien quotidien : `expireOffers`, `rollTransferOffers` (fenêtre ouverte),
`rollContractRenewal` (1er du mois), `evaluateSelection` (premier jour d'une trêve), `scheduleInternationalMatches`,
`rollDailyEvents`, `advanceStorylines`, `maybeChangeCoach` (lendemain de match), `evaluateTraits`, `rollSponsorOffers` (1er du mois).
Chaque branchement est protégé par un try/catch qui journalise sans casser la journée.

## Balance (`src/engine/config/balance/depth.ts`, section `depth`)

`transfers` (probabilités par étoile, fourchettes de montant, expiration, stances, prêt), `national` (forces par pays, seuils par étape, matchs par trêve),
`events` (dailyProb, cooldowns), `traits` (seuils), `sponsors` (seuils de réputation, montants par niveau), `retirement` (âge minimal 33, verdicts).
