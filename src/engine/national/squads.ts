/**
 * Force des sélections et effectifs (docs/PHASE6_CONTRACTS.md §
 * `src/engine/national/squads.ts`).
 *
 * Chaque sélection est représentée par un club pseudo `nat_<CODE>` dans
 * `world.clubs`, `leagueId: 'international'`. Écart au contrat documenté ici
 * (voir aussi le rapport final) : `leagueId: 'international'` ne correspond à
 * aucune entrée de `world.leagues` ni `season.leagues` — vérifié qu'aucun
 * module existant n'itère `world.clubs` en supposant que chaque club a une
 * ligue jouable (le classement, le calendrier et la progression annuelle des
 * PNJ n'itèrent que par ligue/`club.squadIds` explicites, jamais par
 * `Object.values(world.clubs)` en aveugle). `world.nationalSquads[code]` est
 * tenu à jour en miroir de `club.squadIds` pour les lecteurs qui préfèrent ce
 * champ (prévu par les types mais inutilisé jusqu'ici).
 */
import type { Club, Competition, CountryCode, Id, KnockoutFormat, League, NpcPlayer, World } from '../types';
import { INTERNATIONAL_COMPETITION_ID, POSITIONS } from '../types';
import type { CareerState } from '../types';
import type { Rng } from '../rng/mulberry32';
import { countryName, normalizeCountryCode } from '../../data/nationalities';
import { NATIONAL_BALANCE } from '../config/balance/national';
import { nextRng } from '../rng/derive';
import { generateCoach, generateNpcPlayer } from '../world/generateSquad';

const N = NATIONAL_BALANCE.national;

// Défini dans types.ts (la boucle quotidienne et les effets de match en ont besoin sans dépendre de ce module) ; ré-exporté ici pour les appelants du domaine « sélection ».
export { INTERNATIONAL_COMPETITION_ID };

/** Force d'une sélection (0-100) depuis la table par pays (repli `fallbackStrength`). Normalise les codes FIFA/ISO. */
export function countryStrength(country: CountryCode): number {
  const code = normalizeCountryCode(country);
  return N.strengthByCountry[code] ?? N.fallbackStrength;
}

/** Id du club pseudo d'une sélection nationale. */
export function nationalClubId(country: CountryCode): Id {
  return `nat_${normalizeCountryCode(country)}`;
}

function ensureInternationalCompetition(world: World): void {
  if (world.competitions[INTERNATIONAL_COMPETITION_ID]) return;
  const format: KnockoutFormat = { type: 'elimination', teams: 0, twoLegged: false, extraTime: false, rounds: ['amical'] };
  const competition: Competition = {
    id: INTERNATIONAL_COMPETITION_ID, kind: 'international', name: 'Sélections nationales', shortName: 'INT', prestige: 82, format,
  };
  world.competitions[INTERNATIONAL_COMPETITION_ID] = competition;
}

/** Ligue factice (jamais stockée dans `world.leagues`) : seule sa `prestige` est lue par `suggestedWage`/`computeNpcMarketValue`. */
function fakeLeagueFor(club: Club): League {
  return {
    id: club.leagueId, kind: 'championnat', name: 'International', shortName: 'INT', country: club.country, tier: 1,
    clubIds: [club.id],
    format: { type: 'ligue', teams: 1, rounds: 0, pointsWin: 3, pointsDraw: 1, promoted: 0, relegated: 0, playoffSlots: 0, continentalSlots: [] },
    prestige: club.prestige,
  };
}

function countByPosition(world: World, club: Club): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of club.squadIds) {
    const npc = world.npcPlayers[id];
    if (npc) counts[npc.identity.position] = (counts[npc.identity.position] ?? 0) + 1;
  }
  return counts;
}

function pickCaptain(world: World, club: Club): Id {
  return club.squadIds
    .map((id) => world.npcPlayers[id])
    .filter((npc): npc is NpcPlayer => npc !== undefined)
    .sort((a, b) => b.attributes.leadership - a.attributes.leadership || b.overall - a.overall || a.id.localeCompare(b.id))[0]?.id ?? '';
}

/**
 * Complète l'effectif jusqu'à la cible exacte par poste
 * (`NATIONAL_BALANCE.national.squadTargetByPosition`, 23 au total) : d'abord
 * les meilleurs PNJ existants de cette nationalité (ou double nationalité)
 * pas déjà dans la sélection, puis des PNJ générés. Ne tire un RNG (et ne
 * touche donc pas `state.rngCounters`) que s'il manque effectivement des
 * joueurs — ce qui rend `ensureNationalSquad` idempotent : un second appel
 * sans changement du monde ne fait rien.
 */
function topUpSquad(state: CareerState, club: Club, code: CountryCode): void {
  const world = state.world;
  const target = N.squadTargetByPosition;
  // Relégations et retraites suppriment des PNJ sans nettoyer les sélections : sans cette purge,
  // les effectifs nationaux accumulent des identifiants fantômes à chaque saison.
  club.squadIds = club.squadIds.filter((id) => world.npcPlayers[id] !== undefined);
  const counts = countByPosition(world, club);
  const needsMore = POSITIONS.some((p) => (counts[p] ?? 0) < (target[p] ?? 0));
  if (!needsMore) {
    world.nationalSquads[code] = [...club.squadIds];
    return;
  }

  const inSquad = new Set(club.squadIds);
  const pool = Object.values(world.npcPlayers)
    .filter((npc) => !inSquad.has(npc.id) && (npc.identity.nationality === code || npc.identity.secondNationality === code))
    .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const poolByPosition = new Map<string, NpcPlayer[]>();
  for (const npc of pool) {
    const list = poolByPosition.get(npc.identity.position) ?? [];
    list.push(npc);
    poolByPosition.set(npc.identity.position, list);
  }

  const rng = nextRng(state, `national:${code}:squad`);
  const strength = countryStrength(code);
  const league = fakeLeagueFor(club);

  for (const position of POSITIONS) {
    const need = target[position] ?? 0;
    let have = counts[position] ?? 0;
    const candidates = poolByPosition.get(position) ?? [];
    while (have < need) {
      const fromPool = candidates.shift();
      if (fromPool) {
        club.squadIds.push(fromPool.id);
      } else {
        const isBackup = have >= Math.max(1, Math.round(need / 2));
        const targetOverall = Math.round(clampToBounds(strength - (isBackup ? N.benchOverallGap : 0) + rng.normal(0, N.squadOverallSd)));
        const npc = generateNpcPlayer(rng, { clubId: club.id, position, targetOverall, date: state.currentDate, nationality: code, ageRange: [N.ageRange[0], N.ageRange[1]] }, league, club);
        let id = npc.id;
        for (let k = 2; world.npcPlayers[id]; k++) id = `${npc.id}_${k}`;
        npc.id = id;
        world.npcPlayers[id] = npc;
        club.squadIds.push(id);
      }
      have += 1;
    }
    counts[position] = have;
  }

  if (!club.captainId || !club.squadIds.includes(club.captainId)) club.captainId = pickCaptain(world, club);
  world.nationalSquads[code] = [...club.squadIds];
}

function clampToBounds(v: number): number {
  return Math.min(99, Math.max(1, v));
}

/**
 * Effectif de la sélection nationale : meilleurs PNJ du monde de cette
 * nationalité, complétés par des PNJ générés déterministes. Idempotent :
 * un second appel sans changement du monde ne modifie rien et ne consomme
 * pas de RNG.
 */
export function ensureNationalSquad(state: CareerState, country: CountryCode): Club {
  const code = normalizeCountryCode(country);
  const clubId = nationalClubId(code);
  ensureInternationalCompetition(state.world);

  let club = state.world.clubs[clubId];
  if (!club) {
    const strength = countryStrength(code);
    club = {
      id: clubId,
      name: `Sélection ${countryName(code)}`,
      shortName: code,
      code,
      city: countryName(code),
      country: code,
      colors: { primary: '#14213d', secondary: '#ffffff' },
      stadium: { name: 'Stade national', capacity: N.clubStadiumCapacity },
      leagueId: INTERNATIONAL_COMPETITION_ID,
      prestige: strength,
      fanbase: N.clubFanbase,
      facilities: N.clubFacilities,
      transferBudget: 0,
      wageBudgetMonthly: 0,
      boardObjective: 'ventre_mou',
      tactic: { formation: '4-3-3', mentality: 'equilibree', style: 'possession', pressing: 0.55, tempo: 0.55, width: 0.5 },
      coachId: `selectionneur_${code}`,
      captainId: '',
      squadIds: [],
      rivalClubIds: [],
      teamMorale: 70,
      positionHierarchy: {},
      real: false,
    };
    state.world.clubs[clubId] = club;
  }
  if (!state.world.npcs[club.coachId]) {
    const rng = nextRng(state, `national:${code}:coach`);
    state.world.npcs[club.coachId] = generateCoach(rng, club, state.currentDate, countryStrength(code));
  }
  topUpSquad(state, club, code);
  return club;
}

/** PNJ sélectionneur de la sélection (crée le club et le coach s'ils manquent). */
export function selectionneurId(state: CareerState, country: CountryCode): Id {
  return ensureNationalSquad(state, country).coachId;
}

/**
 * Choisit `count` pays adversaires plausibles (force voisine de `country`),
 * distincts entre eux et du pays du joueur, déterministe via `rng`. Élargit
 * l'écart de force par paliers si la table n'offre pas assez de candidats.
 */
export function pickOpponentCountries(country: CountryCode, count: number, rng: Rng): CountryCode[] {
  const code = normalizeCountryCode(country);
  const ownStrength = countryStrength(code);
  const table = Object.keys(N.strengthByCountry).filter((c) => c !== code).sort();
  const chosen: CountryCode[] = [];
  let spread = N.opponentStrengthSpread;
  const remaining = new Set(table);
  while (chosen.length < count && remaining.size > 0) {
    const candidates = [...remaining].filter((c) => Math.abs(countryStrength(c) - ownStrength) <= spread);
    if (candidates.length === 0) {
      spread += N.opponentStrengthSpreadStep;
      continue;
    }
    const weights = candidates.map((c) => 1 / (1 + Math.abs(countryStrength(c) - ownStrength)));
    const pick = rng.weighted(candidates, weights);
    chosen.push(pick);
    remaining.delete(pick);
  }
  return chosen;
}
