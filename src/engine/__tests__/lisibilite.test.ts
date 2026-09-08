/**
 * Ce que le joueur doit pouvoir comprendre.
 *
 * Trois reproches, tous vérifiés ici plutôt que sur l'écran :
 *  - « c'est toujours la même chose » : deux carrières de même fiche mais de
 *    graines différentes ne se ressemblent pas, et les remplacements ne
 *    tombent plus tous à la 58e minute ;
 *  - « on ne comprend pas ce qu'on gagne à l'entraînement » : la semaine
 *    remonte l'XP même quand aucun point entier n'est tombé ;
 *  - « on ne s'améliore jamais » : la progression est relevée mois par mois,
 *    et un joueur devenu meilleur que ses concurrents finit par jouer.
 */
import { describe, expect, it } from 'vitest';
import { newCareer } from '../career/newCareer';
import { generateFictionalDataset } from '../world/loadDataset';
import { buildAllocation, midTableClubId } from '../sim/headless';
import { advanceDay } from '../calendar/advanceDay';
import { advanceWeek } from '../season/week';
import { formatSeed, parseSeed, randomSeed } from '../rng/derive';
import { selectionScore, trustPenalty, type Candidate } from '../season/lineupScore';
import { BALANCE } from '../config/balance';
import type { CareerSetup, CareerState } from '../types';

function career(seed: number | undefined): CareerState {
  const dataset = generateFictionalDataset(42);
  const clubId = midTableClubId(dataset);
  const setup: CareerSetup = {
    firstName: 'Léo', lastName: 'Martin', startAge: 18, nationality: 'FRA', position: 'BU', foot: 'droit',
    heightCm: 180, weightKg: 74, archetypes: ['finisseur'], clubId, startingLevel: 'prometteur', difficulty: 'exigeant',
    allocation: buildAllocation({ startAge: 18, position: 'BU', startingLevel: 'prometteur' }), datasetId: dataset.id,
    ...(seed === undefined ? {} : { seed }),
  };
  return newCareer(setup, dataset);
}

/** Résultats des premiers matchs du joueur, sous forme comparable. */
function premiersMatchs(state: CareerState, combien: number): string[] {
  const vus: string[] = [];
  for (let i = 0; i < 200 && vus.length < combien; i++) {
    advanceDay(state);
    for (const m of Object.values(state.matches)) {
      if (!m.involvesPlayer || !m.result) continue;
      const ligne = `${m.date} ${m.result.homeGoals}-${m.result.awayGoals} ${m.result.playerReport?.subbedOnMinute ?? '-'}`;
      if (!vus.includes(ligne)) vus.push(ligne);
    }
  }
  return vus.slice(0, combien);
}

describe('graine de carrière', () => {
  it('une fiche identique sans graine donne toujours la même carrière — d’où l’impression de scripté', () => {
    expect(premiersMatchs(career(undefined), 3)).toEqual(premiersMatchs(career(undefined), 3));
  });

  it('deux graines différentes donnent des saisons différentes', () => {
    expect(premiersMatchs(career(111), 3)).not.toEqual(premiersMatchs(career(222), 3));
  });

  it('la même graine reste parfaitement reproductible', () => {
    expect(premiersMatchs(career(111), 3)).toEqual(premiersMatchs(career(111), 3));
  });

  it('une graine s’écrit et se relit', () => {
    for (let i = 0; i < 50; i++) {
      const s = randomSeed();
      expect(parseSeed(formatSeed(s))).toBe(s);
    }
    expect(parseSeed('')).toBeUndefined();
    expect(parseSeed('pas une graine !')).toBeUndefined();
    // Une graine peut aussi se saisir en clair.
    expect(parseSeed('1234')).toBe(1234);
  });
});

describe('minutes de remplacement', () => {
  it('les entrées en jeu ne tombent pas toujours aux mêmes minutes', () => {
    const minutes = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = career(seed);
      for (let i = 0; i < 200 && minutes.size < 40; i++) {
        advanceDay(state);
        for (const m of Object.values(state.matches)) {
          for (const side of ['home', 'away'] as const) {
            for (const e of m.result?.events ?? []) {
              if (e.type === 'remplacement' && e.side === side) minutes.add(e.minute);
            }
          }
        }
      }
    }
    // Les minutes de référence sont [58, 66, 74, 82, 88] : sans décalage il n'y en aurait que cinq.
    const reference = BALANCE.matchSim.substitutions.typicalMinutes.length;
    expect(minutes.size, [...minutes].sort((a, b) => a - b).join(' ')).toBeGreaterThan(reference);
  });
});

describe('ce que l’entraînement rapporte', () => {
  it('le bilan de semaine remonte l’XP gagnée, même sans point entier', () => {
    const state = career(7);
    // On avance jusqu'à une semaine qui contient de vraies séances (juillet est en vacances).
    let progression: { key: string; xpGagne: number; xp: number }[] = [];
    for (let i = 0; i < 12 && progression.length === 0; i++) {
      const semaine = advanceWeek(state, { focus: 'finition', intensity: 'normale' });
      progression = semaine.resume.progression;
      if (semaine.stop === 'match') advanceDay(state, { playerMatchMode: 'auto' });
    }
    expect(progression.length).toBeGreaterThan(0);
    for (const p of progression) {
      expect(p.xpGagne).toBeGreaterThan(0);
      expect(p.xp).toBeGreaterThanOrEqual(0);
      expect(p.xp).toBeLessThanOrEqual(1);
    }
    // La séance choisie travaille la finition : elle doit être en tête du bilan.
    expect(progression.map((p) => p.key)).toContain('finition');
  });
});

describe('progression relevée dans le temps', () => {
  it('la note globale est relevée chaque mois et le relevé reste borné', () => {
    const state = career(9);
    for (let i = 0; i < 400; i++) advanceDay(state);
    const history = state.player.overallHistory ?? [];
    // Environ treize relevés en un an (création + un par mois).
    expect(history.length).toBeGreaterThanOrEqual(12);
    expect(history.length).toBeLessThanOrEqual(BALANCE.career.maxOverallHistory);
    expect(history[history.length - 1]!.overall).toBeGreaterThan(history[0]!.overall);
    // Les attributs sont conservés avec le relevé : c'est ce qui rend le progrès lisible.
    expect(Object.keys(history[0]!.attributes).length).toBeGreaterThan(20);
  });
});

describe('confiance du coach et sélection', () => {
  const candidat = (over: Partial<Candidate>): Candidate => ({
    id: 'x', position: 'BU', secondaryPositions: [], overall: 70, form: 0, fitness: 100, age: 22,
    leadership: 50, available: true, isPlayer: false, coachTrust: BALANCE.coach.npcTrustDefault, ...over,
  });
  const ctx = { coach: undefined, hierarchy: {} };

  it('la défiance coûte des points, pas un pourcentage', () => {
    // Un malus proportionnel grandirait avec le niveau : le joueur ne rattraperait jamais ses concurrents.
    const faible = trustPenalty(candidat({ isPlayer: true, overall: 50, coachTrust: 40 }));
    const fort = trustPenalty(candidat({ isPlayer: true, overall: 85, coachTrust: 40 }));
    expect(faible).toBeCloseTo(fort, 6);
    expect(fort).toBeGreaterThan(0);
  });

  it('une pleine confiance n’applique aucun malus', () => {
    expect(trustPenalty(candidat({ isPlayer: true, coachTrust: 100 }))).toBe(0);
    expect(trustPenalty(candidat({ isPlayer: false, coachTrust: 0 }))).toBe(0);
  });

  it('un joueur nettement meilleur finit par passer devant, même mal vu du coach', () => {
    const rival = candidat({ id: 'rival', overall: 66 });
    const moi = candidat({ id: 'moi', isPlayer: true, overall: 73, coachTrust: 45 });
    expect(selectionScore(moi, 'BU', ctx)).toBeGreaterThan(selectionScore(rival, 'BU', ctx));
  });

  it('mais un joueur moins bon ne passe pas devant en attendant', () => {
    const rival = candidat({ id: 'rival', overall: 66 });
    const moi = candidat({ id: 'moi', isPlayer: true, overall: 58, coachTrust: 45 });
    expect(selectionScore(moi, 'BU', ctx)).toBeLessThan(selectionScore(rival, 'BU', ctx));
  });
});
