/**
 * Traits de carrière (Phase 6) : acquis par des règles déterministes évaluées
 * après chaque match et chaque fin de mois, ils laissent une trace permanente
 * et portent des modificateurs multiplicatifs bornés lus par le moteur
 * (`traitMultiplier`). Le LLM n'attribue jamais un trait.
 */
import type { CareerState, Id, Player, Trait } from '../types';
import { CAREER_DEPTH_BALANCE } from '../config/balance/careerDepth';
import { diffDays } from '../calendar/dates';
import { recentPlayerMatches } from '../season/recentMatches';
import { addLog, addMemory } from './apply';

const T = CAREER_DEPTH_BALANCE.traits;

export interface TraitDefinition {
  label: string;
  description: string;
  polarity: Trait['polarity'];
  /** Modificateurs multiplicatifs, toujours proches de 1 (0.9 à 1.1). */
  modifiers: Record<string, number>;
}

export const TRAIT_CATALOGUE: Record<string, TraitDefinition> = {
  sang_froid_grands_matchs: {
    label: 'Sang-froid des grands soirs',
    description: 'Décisif quand l\'enjeu est maximal : la pression pèse moins sur ses gestes.',
    polarity: 'positif',
    modifiers: { pression_grand_match: 1.08 },
  },
  chouchou_du_public: {
    label: 'Chouchou du public',
    description: 'Le stade le porte : les sifflets l\'atteignent moins, les clameurs le poussent.',
    polarity: 'positif',
    modifiers: { soutien_public: 1.05 },
  },
  tete_brulee: {
    label: 'Tête brûlée',
    description: 'Deux rouges dans la saison : les arbitres le surveillent, le coach aussi.',
    polarity: 'negatif',
    modifiers: { faute: 1.1, sanction: 1.1 },
  },
  bourreau_de_travail: {
    label: 'Bourreau de travail',
    description: 'Des dizaines de séances intenses : il progresse un peu plus vite que les autres.',
    polarity: 'positif',
    modifiers: { progression: 1.05 },
  },
  fragile: {
    label: 'Fragile',
    description: 'Blessures à répétition : le corps lâche plus facilement.',
    polarity: 'negatif',
    modifiers: { blessure: 1.15 },
  },
  leader: {
    label: 'Leader',
    description: 'Le brassard lui va : il tient le vestiaire.',
    polarity: 'positif',
    modifiers: { leadership: 1.05 },
  },
  mercenaire: {
    label: 'Mercenaire',
    description: 'Trop de clubs en trop peu d\'années : les supporters s\'attachent moins.',
    polarity: 'negatif',
    modifiers: { adhesion_supporters: 0.9 },
  },
  ingrat: {
    label: 'Ingrat',
    description: 'A demandé publiquement son transfert : les coachs s\'en souviennent.',
    polarity: 'negatif',
    modifiers: { confiance_coach: 0.9 },
  },
  renard_des_surfaces: {
    label: 'Renard des surfaces',
    description: 'Une saison à quinze buts ou plus : il sent le ballon avant les autres.',
    polarity: 'positif',
    modifiers: { finition: 1.04 },
  },
  roc: {
    label: 'Roc',
    description: 'Une saison entière de duels gagnés : on ne passe pas.',
    polarity: 'positif',
    modifiers: { duel_defensif: 1.04 },
  },
};

/** Multiplicateur cumulé des traits du joueur pour un modificateur (1 si aucun trait ne le porte). */
export function traitMultiplier(player: Pick<Player, 'traits'>, key: string): number {
  let m = 1;
  for (const t of player.traits) {
    const v = t.modifiers[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) m *= v;
  }
  return m;
}

/** Accorde un trait (idempotent) : journal, souvenir. Retourne le trait créé ou null s'il existait. */
export function grantTrait(state: CareerState, traitId: string, origin: string): Trait | null {
  const def = TRAIT_CATALOGUE[traitId];
  if (!def) throw new Error(`Trait inconnu : ${traitId}`);
  if (state.player.traits.some((t) => t.id === traitId)) return null;
  const trait: Trait = {
    id: traitId, label: def.label, description: def.description, polarity: def.polarity,
    acquiredOn: state.currentDate, origin, modifiers: { ...def.modifiers },
  };
  state.player.traits.push(trait);
  addLog(state, 'vie', `Nouveau trait : ${def.label} (${origin}).`);
  addMemory(state, { date: state.currentDate, type: 'saison', importance: 3, summary: `Trait acquis : ${def.label} — ${origin}.`, entities: [state.player.contract.clubId, traitId] });
  return trait;
}

export function removeTrait(state: CareerState, traitId: string, reason: string): void {
  const idx = state.player.traits.findIndex((t) => t.id === traitId);
  if (idx < 0) return;
  const [removed] = state.player.traits.splice(idx, 1);
  addLog(state, 'vie', `Trait perdu : ${removed!.label} (${reason}).`);
}

function counters(player: Player): NonNullable<Player['counters']> {
  player.counters ??= { intenseSessions: 0, captainMatches: 0, decisiveBigMatchGoals: 0 };
  return player.counters;
}

/** Met à jour les compteurs depuis le dernier match joué (une seule fois par match) et la cote supporters. */
function updateCounters(state: CareerState): void {
  const p = state.player;
  const c = counters(p);
  const last = recentPlayerMatches(state, 1)[0];
  if (last && last.match.id !== c.lastCountedMatchId) {
    c.lastCountedMatchId = last.match.id;
    const r = last.match.result!;
    const inHome = r.lineups.home.starters.includes(p.id) || r.lineups.home.bench.includes(p.id);
    const inAway = r.lineups.away.starters.includes(p.id) || r.lineups.away.bench.includes(p.id);
    const side = inHome ? 'home' : inAway ? 'away' : last.match.homeClubId === p.contract.clubId ? 'home' : 'away';
    const captain = r.lineups[side].captainId === p.id || p.squadStatus === 'capitaine';
    if (captain) c.captainMatches += 1;
    const goalsFor = side === 'home' ? r.homeGoals : r.awayGoals;
    const goalsAgainst = side === 'home' ? r.awayGoals : r.homeGoals;
    const g = last.report.stats.goals;
    // Décisif : sans ses buts, l'équipe n'aurait pas pris ce résultat (victoire ou nul).
    if (g > 0 && last.match.importance >= T.bigMatchImportance && goalsFor >= goalsAgainst && goalsFor - goalsAgainst < g + 1) {
      c.decisiveBigMatchGoals += 1;
    }
  }
  if (state.reputation.supporters.value >= T.supportersHigh.value) c.supportersHighSince ??= state.currentDate;
  else delete c.supportersHighSince;
}

function seriousInjuries(state: CareerState, windowDays: number): number {
  return state.player.injuries.filter((i) => i.actualDays >= T.fragile.minDays && diffDays(i.occurredOn, state.currentDate) <= windowDays).length;
}

/**
 * Règles d'acquisition (et de perte pour « fragile »), à appeler après chaque
 * match du joueur et chaque fin de mois. Retourne les traits nouvellement acquis.
 */
export function evaluateTraits(state: CareerState): Trait[] {
  updateCounters(state);
  const p = state.player;
  const c = counters(p);
  const granted: Trait[] = [];
  const grant = (id: string, origin: string): void => {
    const t = grantTrait(state, id, origin);
    if (t) granted.push(t);
  };
  const season = state.season.label;
  const total = p.seasonStats.total;

  if (c.decisiveBigMatchGoals >= T.decisiveBigMatchGoalsFor) grant('sang_froid_grands_matchs', `${c.decisiveBigMatchGoals} buts décisifs dans des grands matchs`);
  if (c.supportersHighSince && diffDays(c.supportersHighSince, state.currentDate) >= T.supportersHigh.days) grant('chouchou_du_public', `cote supporters ≥ ${T.supportersHigh.value} pendant ${T.supportersHigh.days} jours`);
  if (total.redCards >= T.redCardsSeasonFor) grant('tete_brulee', `${total.redCards} cartons rouges en ${season}`);
  if (c.intenseSessions >= T.intenseSessionsFor) grant('bourreau_de_travail', `${c.intenseSessions} séances intenses`);
  if (c.captainMatches >= T.leaderCaptainMatches) grant('leader', `${c.captainMatches} matchs avec le brassard`);

  const serious = seriousInjuries(state, T.fragile.windowDays);
  if (serious >= T.fragile.count) grant('fragile', `${serious} blessures sérieuses en ${Math.round(T.fragile.windowDays / 30)} mois`);
  else if (p.traits.some((t) => t.id === 'fragile') && seriousInjuries(state, T.fragile.clearAfterDays) === 0) removeTrait(state, 'fragile', 'deux ans sans blessure sérieuse');

  const moves = state.transfers.filter((t) => !t.loan && diffDays(t.date, state.currentDate) <= T.mercenaire.windowDays).length;
  if (moves >= T.mercenaire.transfers) grant('mercenaire', `${moves} transferts en ${Math.round(T.mercenaire.windowDays / 365)} ans`);
  if (state.transfers.some((t) => t.requested) || state.storylines.some((s) => s.kind === 'demande_transfert')) grant('ingrat', 'demande de transfert publique');

  const pos = p.identity.position;
  const attacker = pos === 'BU' || pos === 'AIG' || pos === 'AID' || pos === 'MOC';
  if (attacker && total.goals >= T.renard.goalsSeason) grant('renard_des_surfaces', `${total.goals} buts en ${season}`);
  const defender = pos === 'DC' || pos === 'MDC';
  const avg = total.ratingCount > 0 ? total.ratingSum / total.ratingCount : 0;
  if (defender && total.matches >= T.roc.matchesSeason && avg >= T.roc.averageRating) grant('roc', `${total.matches} matchs à ${avg.toFixed(2)} de moyenne en ${season}`);

  return granted;
}

/** Identifiants des traits portés par le joueur. */
export function traitIds(player: Pick<Player, 'traits'>): Id[] {
  return player.traits.map((t) => t.id);
}
