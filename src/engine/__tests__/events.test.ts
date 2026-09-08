/**
 * Système d'événements : au plus un par jour, cooldowns et unicité par
 * saison, déterminisme, résolution d'issue, storylines, changement
 * d'entraîneur.
 */
import { describe, expect, it } from 'vitest';
import { EVENT_CATALOGUE } from '../events/catalogue';
import { advanceStorylines, maybeChangeCoach, resolveEvent, rollDailyEvents } from '../events/roll';
import { EVENTS_BALANCE } from '../config/balance/events';
import { addDays, diffDays } from '../calendar/dates';
import type { CareerState, GameEvent, Storyline } from '../types';
import { makeState, playedMatch } from './helpers/seasonFixtures';

function simulateDays(state: CareerState, days: number): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < days; i++) {
    all.push(...rollDailyEvents(state));
    state.currentDate = addDays(state.currentDate, 1);
  }
  return all;
}

describe('events : catalogue', () => {
  it('couvre au moins 25 définitions et toutes les catégories', () => {
    expect(EVENT_CATALOGUE.length).toBeGreaterThanOrEqual(25);
    const categories = new Set(EVENT_CATALOGUE.map((d) => d.category));
    expect(categories.size).toBeGreaterThanOrEqual(20);
  });

  it('chaque définition a au moins une issue et un id unique', () => {
    const ids = new Set<string>();
    for (const def of EVENT_CATALOGUE) {
      expect(def.outcomes.length).toBeGreaterThan(0);
      expect(ids.has(def.id)).toBe(false);
      ids.add(def.id);
    }
  });
});

describe('events : rollDailyEvents', () => {
  it('déclenche au plus un événement par jour ; cooldowns et unicité par saison respectés (200 jours)', () => {
    const state = makeState();
    const lastFiredOn = new Map<string, string>();
    const firedThisSeason = new Set<string>();

    for (let i = 0; i < 200; i++) {
      const events = rollDailyEvents(state);
      expect(events.length).toBeLessThanOrEqual(1);
      for (const e of events) {
        const def = EVENT_CATALOGUE.find((d) => d.id === e.definitionId);
        expect(def).toBeDefined();
        const cooldown = def!.cooldownDays > 0 ? def!.cooldownDays : EVENTS_BALANCE.events.cooldownDaysDefault;
        const prev = lastFiredOn.get(e.definitionId);
        if (prev) expect(diffDays(prev, e.date)).toBeGreaterThanOrEqual(cooldown);
        if (def!.oncePerSeason) {
          expect(firedThisSeason.has(e.definitionId)).toBe(false);
          firedThisSeason.add(e.definitionId);
        }
        lastFiredOn.set(e.definitionId, e.date);
        expect(e.resolved).toBe(false);
      }
      state.currentDate = addDays(state.currentDate, 1);
    }
  });

  it('déterminisme : la même graine produit exactement les mêmes événements sur 200 jours', () => {
    const run = (): string => JSON.stringify(simulateDays(makeState(), 200));
    expect(run()).toBe(run());
  });
});

describe('events : resolveEvent', () => {
  it("applique l'issue choisie (effets bornés) et marque l'événement résolu", () => {
    const state = makeState();
    const before = state.relationships['npc-mere']?.trust ?? 0;
    const event: GameEvent = {
      id: 'evt-test-famille', definitionId: 'coup_de_fil_famille', category: 'famille', date: state.currentDate,
      title: 'Coup de fil de la famille', facts: {}, npcIds: ['npc-mere'], resolved: false,
    };
    state.events.push(event);

    resolveEvent(state, event.id, 'prendre_le_temps');

    expect(event.resolved).toBe(true);
    expect(state.relationships['npc-mere']?.trust ?? 0).toBeGreaterThan(before);
  });

  it('résout aussi la storyline associée (statut, trace de résolution)', () => {
    const state = makeState();
    const storyline: Storyline = {
      id: 'evt-test-clash', kind: 'conflit_vestiaire', title: 'Tension dans le vestiaire', startedOn: state.currentDate,
      deadline: addDays(state.currentDate, 14), status: 'ouverte', stage: 'ouverte', vars: {}, npcIds: [],
      log: [{ date: state.currentDate, text: 'Ouverture.' }],
    };
    state.storylines.push(storyline);
    const event: GameEvent = {
      id: 'evt-test-clash', definitionId: 'clash_vestiaire', category: 'conflit_vestiaire', date: state.currentDate,
      title: 'Accrochage dans le vestiaire', facts: {}, npcIds: [], storylineId: storyline.id, resolved: false,
    };
    state.events.push(event);
    const beforeTeammates = state.reputation.teammates.value;

    resolveEvent(state, event.id, 'apaiser');

    expect(event.resolved).toBe(true);
    expect(storyline.status).toBe('resolue');
    expect(storyline.resolution).toBeDefined();
    expect(state.reputation.teammates.value).toBeGreaterThan(beforeTeammates);
  });

  it('lève sur un id d\'événement inconnu', () => {
    const state = makeState();
    expect(() => resolveEvent(state, 'inconnu', 'x')).toThrow();
  });
});

describe('events : advanceStorylines', () => {
  it('expire une storyline dont l\'échéance est dépassée et journalise', () => {
    const state = makeState();
    const storyline: Storyline = {
      id: 'sl-expiree', kind: 'sentimental', title: 'Histoire sans suite', startedOn: '2026-07-01', deadline: '2026-08-01',
      status: 'ouverte', stage: 'ouverte', vars: {}, npcIds: [], log: [],
    };
    state.storylines.push(storyline); // état par défaut : currentDate 2026-08-15, après l'échéance
    advanceStorylines(state);
    expect(storyline.status).toBe('expiree');
    expect(storyline.resolution).toBeDefined();
    expect(state.log.some((l) => l.text.includes('Histoire sans suite'))).toBe(true);
  });

  it('ne touche pas une storyline dont l\'échéance n\'est pas dépassée', () => {
    const state = makeState();
    const storyline: Storyline = {
      id: 'sl-ouverte', kind: 'famille', title: 'Encore ouverte', startedOn: state.currentDate, deadline: '2027-01-01',
      status: 'ouverte', stage: 'ouverte', vars: {}, npcIds: [], log: [],
    };
    state.storylines.push(storyline);
    advanceStorylines(state);
    expect(storyline.status).toBe('ouverte');
  });
});

describe('events : maybeChangeCoach', () => {
  function addLeagueMatches(state: CareerState, homeGoalsAwayGoals: [number, number][]): void {
    homeGoalsAwayGoals.forEach(([gf, ga], i) => {
      playedMatch(state, `lg-${i}`, 'a', 'c', `2026-08-${String(i + 1).padStart(2, '0')}`, gf, ga);
    });
  }

  it('ne se déclenche jamais après une bonne série (8 victoires, 100 essais)', () => {
    const state = makeState();
    addLeagueMatches(state, Array.from({ length: 8 }, () => [3, 0] as [number, number]));
    for (let i = 0; i < 100; i++) expect(maybeChangeCoach(state)).toBe(false);
  });

  it('ne se déclenche pas avant le minimum de matchs de la saison', () => {
    const state = makeState();
    addLeagueMatches(state, Array.from({ length: 3 }, () => [0, 2] as [number, number]));
    expect(maybeChangeCoach(state)).toBe(false);
  });

  it('se déclenche après une série noire forcée (au moins une fois sur 100 essais)', () => {
    const state = makeState();
    addLeagueMatches(state, Array.from({ length: 8 }, () => [0, 2] as [number, number]));
    const oldCoachId = state.world.clubs.a!.coachId;
    state.player.coachTrust = 90;
    let triggered = false;
    for (let i = 0; i < 100 && !triggered; i++) triggered = maybeChangeCoach(state);
    expect(triggered).toBe(true);
    // La confiance converge vers le niveau neutre sans être remise à zéro : un cadre reconnu doit reconvaincre, pas repartir de rien.
    const { trustReset, trustResetShare } = EVENTS_BALANCE.events.coachChange;
    expect(state.player.coachTrust).toBe(Math.round(90 + (trustReset - 90) * trustResetShare));
    expect(state.player.coachTrust).toBeGreaterThan(trustReset);
    expect(state.world.clubs.a!.coachId).not.toBe(oldCoachId);
    expect(state.world.npcs[oldCoachId]?.active).toBe(false);
    expect(state.world.npcs[state.world.clubs.a!.coachId]?.active).toBe(true);
  });

  it('ne limoge pas deux fois coup sur coup (délai minimal entre deux changements)', () => {
    const state = makeState();
    addLeagueMatches(state, Array.from({ length: 8 }, () => [0, 2] as [number, number]));
    let first = false;
    for (let i = 0; i < 100 && !first; i++) first = maybeChangeCoach(state);
    expect(first).toBe(true);
    for (let i = 0; i < 100; i++) expect(maybeChangeCoach(state)).toBe(false);
    // Passé le délai, un nouveau limogeage redevient possible.
    state.currentDate = addDays(state.currentDate, EVENTS_BALANCE.events.coachChange.minDaysBetweenChanges + 1);
    let second = false;
    for (let i = 0; i < 100 && !second; i++) second = maybeChangeCoach(state);
    expect(second).toBe(true);
  });
});
