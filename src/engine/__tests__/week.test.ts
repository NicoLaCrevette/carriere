/**
 * Moteur de semaine : le joueur choisit un plan, lance la semaine, et le
 * moteur s'arrête tout seul dès qu'il se passe quelque chose.
 */
import { describe, expect, it } from 'vitest';
import { newCareer } from '../career/newCareer';
import { generateFictionalDataset } from '../world/loadDataset';
import { buildAllocation, midTableClubId } from '../sim/headless';
import { advanceDay, completePlayerMatch, playerMatchOfDay } from '../calendar/advanceDay';
import { buildMatchContext, runMatchAuto } from '../match/simulateMatch';
import { addDays } from '../calendar/dates';
import { expireEvent } from '../events/roll';
import { BALANCE } from '../config/balance';
import { advanceWeek, trainingForPlan, type WeekPlan, type WeekResult } from '../season/week';
import type { CareerSetup, CareerState, ISODate } from '../types';

function career(seed: number): CareerState {
  const dataset = generateFictionalDataset(42);
  const clubId = midTableClubId(dataset);
  const setup: CareerSetup = {
    firstName: 'Léo', lastName: 'Martin', startAge: 18, nationality: 'FRA', position: 'BU', foot: 'droit', heightCm: 180, weightKg: 74,
    archetypes: ['finisseur'], clubId, startingLevel: 'pepite', difficulty: 'realiste',
    allocation: buildAllocation({ startAge: 18, position: 'BU', startingLevel: 'pepite' }), datasetId: dataset.id, seed,
  };
  return newCareer(setup, dataset);
}

/** Referme les événements en attente : l'interface les aurait joués en scène. */
function purgerEvenements(state: CareerState): void {
  for (const ev of state.events) if (!ev.resolved) expireEvent(state, ev.id);
}

/** Joue le match du jour comme le ferait l'interface, sinon la semaine ne repart jamais. */
function jouerLeMatch(state: CareerState): void {
  const jour = advanceDay(state, { playerMatchMode: 'interactif' });
  const matchId = jour.pendingPlayerMatchId;
  if (!matchId) return;
  const match = state.matches[matchId]!;
  completePlayerMatch(state, runMatchAuto(buildMatchContext(state, match, 'auto')));
}

/** Avance de semaine en semaine (en purgeant les scènes) jusqu'à une date. */
function avancerJusqua(state: CareerState, date: ISODate, plan: WeekPlan): void {
  let garde = 0;
  while (state.currentDate < date && garde++ < 80) {
    const avant = state.currentDate;
    const week = advanceWeek(state, plan);
    purgerEvenements(state);
    if (week.stop === 'match') jouerLeMatch(state);
    // Une semaine qui ne fait pas avancer la date boucle : mieux vaut échouer que mentir sur la date atteinte.
    expect(state.currentDate, `bloqué le ${avant} (arrêt : ${week.stop})`).not.toBe(avant);
  }
}

/** Première semaine complète (7 journées, rien à signaler) trouvée à partir d'ici. */
function semaineComplete(state: CareerState, plan: WeekPlan): WeekResult {
  let garde = 0;
  for (;;) {
    const avant = state.currentDate;
    const week = advanceWeek(state, plan);
    purgerEvenements(state);
    if (week.stop === 'fin_de_semaine') return week;
    if (week.stop === 'match') jouerLeMatch(state);
    expect(state.currentDate, `bloqué le ${avant} (arrêt : ${week.stop})`).not.toBe(avant);
    expect(garde++).toBeLessThan(40);
  }
}

/** Date de la première journée d'entraînement de la saison (début de la préparation). */
function debutPreparation(state: CareerState): ISODate {
  const { from } = BALANCE.calendar.preparation;
  const annee = state.season.startDate.slice(0, 4);
  return `${annee}-${String(from.month).padStart(2, '0')}-${String(from.day).padStart(2, '0')}`;
}

describe('advanceWeek', () => {
  it('avance 7 journées et applique le focus demandé quand rien ne se passe', () => {
    const state = career(11);
    // Début juillet : vacances, aucun entraînement. On rejoint la préparation.
    avancerJusqua(state, debutPreparation(state), { focus: 'auto', intensity: 'normale' });
    const depart = state.currentDate;

    const week = semaineComplete(state, { focus: 'finition', intensity: 'normale' });

    expect(week.stop).toBe('fin_de_semaine');
    expect(week.days).toHaveLength(BALANCE.week.maxDays);
    expect(week.to).toBe(addDays(week.from, BALANCE.week.maxDays - 1));
    expect(state.currentDate).toBe(addDays(week.to, 1));
    expect(state.currentDate > depart).toBe(true);
    // Le plan choisi arrive jusqu'aux séances (hors veille/lendemain de match, qui restent fixes).
    expect(week.days.some((d) => d.training?.focus === 'finition')).toBe(true);
    expect(week.resume.entrainements).toBeGreaterThan(0);
  });

  it('s’arrête AVANT le match du joueur sans consommer la journée', () => {
    const state = career(3);
    let week = advanceWeek(state, { focus: 'physique', intensity: 'normale' });
    let garde = 0;
    while (week.stop !== 'match' && garde++ < 40) {
      purgerEvenements(state);
      week = advanceWeek(state, { focus: 'physique', intensity: 'normale' });
    }

    expect(week.stop).toBe('match');
    expect(week.matchId).toBeDefined();
    const match = state.matches[week.matchId!]!;
    expect(match.involvesPlayer).toBe(true);
    expect(match.status).toBe('a_venir');
    // La journée du match n'a pas été jouée : on est toujours dessus.
    expect(state.currentDate).toBe(match.date);
    expect(playerMatchOfDay(state, state.currentDate)?.id).toBe(week.matchId);
    expect(week.days.some((d) => d.date === match.date)).toBe(false);
    expect(week.to < state.currentDate).toBe(true);
    expect(state.pendingDay).toBeUndefined();
  });

  it('plan « auto » : aucune erreur, la rotation par défaut du staff s’applique', () => {
    const state = career(7);
    avancerJusqua(state, debutPreparation(state), { focus: 'auto', intensity: 'normale' });

    let week: WeekResult | undefined;
    expect(() => { week = semaineComplete(state, { focus: 'auto', intensity: 'intense' }); }).not.toThrow();

    const seances = week!.days.map((d) => d.training).filter((t) => t !== undefined);
    expect(seances.length).toBeGreaterThan(0);
    const rotation = BALANCE.career.autoTrainingRotation[state.player.identity.position];
    const fixes = Object.values(BALANCE.career.defaultTraining).map((t) => t.focus);
    for (const s of seances) {
      expect([...rotation, ...fixes]).toContain(s!.focus);
      // L'intensité du plan est ignorée en 'auto' : le staff garde la sienne.
      expect(s!.intensity).not.toBe('intense');
    }
  });

  it('une semaine intense fatigue plus qu’une semaine légère (même graine)', () => {
    const base = career(5);
    avancerJusqua(base, debutPreparation(base), { focus: 'auto', intensity: 'normale' });

    const dur = structuredClone(base);
    const doux = structuredClone(base);
    const intense = advanceWeek(dur, { focus: 'physique', intensity: 'intense' });
    const legere = advanceWeek(doux, { focus: 'physique', intensity: 'legere' });

    expect(intense.resume.entrainements).toBeGreaterThan(0);
    expect(intense.days.length).toBe(legere.days.length);
    expect(intense.resume.conditionAvant).toBe(legere.resume.conditionAvant);
    expect(intense.resume.conditionApres).toBeLessThan(legere.resume.conditionApres);
  });

  it('le résumé agrège fidèlement les journées', () => {
    const state = career(9);
    avancerJusqua(state, debutPreparation(state), { focus: 'auto', intensity: 'normale' });
    const conditionAvant = state.player.fitness;
    const rythmeAvant = state.player.sharpness;

    const week = advanceWeek(state, { focus: 'vitesse', intensity: 'normale' });
    const { resume, days } = week;

    expect(resume.entrainements).toBe(days.filter((d) => d.training).length);
    expect(resume.blessures).toBe(days.reduce((n, d) => n + d.newInjuries.length, 0));
    expect(resume.conditionAvant).toBe(conditionAvant);
    expect(resume.conditionApres).toBe(state.player.fitness);
    expect(resume.rythmeAvant).toBe(rythmeAvant);
    expect(resume.rythmeApres).toBe(state.player.sharpness);

    // Une ligne de gain par clé touchée dans la semaine, premier « from » et dernier « to ».
    const cles = days.flatMap((d) => d.attributeGains.map((g) => String(g.key)));
    expect(resume.gains.map((g) => g.key)).toEqual([...new Set(cles)]);
    for (const gain of resume.gains) {
      const touches = days.flatMap((d) => d.attributeGains.filter((g) => String(g.key) === gain.key));
      expect(gain.from).toBe(touches[0]!.from);
      expect(gain.to).toBe(touches[touches.length - 1]!.to);
    }
    // Les gains d'attribut ligne par ligne sont du bruit : ils ne repassent pas dans les messages.
    for (const message of resume.messages) {
      expect(resume.gains.some((g) => message.startsWith(`${g.key} :`))).toBe(false);
    }
    expect(resume.messages.length).toBeLessThanOrEqual(BALANCE.week.maxMessages);
    expect(BALANCE.week.maxMessages, 'un plafond inatteignable ne protège de rien').toBeLessThanOrEqual(20);
  });

  it('est déterministe : même état, même plan, même semaine', () => {
    const base = career(13);
    avancerJusqua(base, debutPreparation(base), { focus: 'auto', intensity: 'normale' });
    const plan: WeekPlan = { focus: 'dribble', intensity: 'normale' };

    const a = structuredClone(base);
    const b = structuredClone(base);
    const ra = advanceWeek(a, plan);
    const rb = advanceWeek(b, plan);

    expect(JSON.stringify(ra.resume)).toBe(JSON.stringify(rb.resume));
    expect(ra.stop).toBe(rb.stop);
    expect(ra.to).toBe(rb.to);
    expect(ra.matchId).toBe(rb.matchId);
    expect(ra.eventIds).toEqual(rb.eventIds);
    expect(a.currentDate).toBe(b.currentDate);
    expect(a.player.fitness).toBe(b.player.fitness);
  });

  it('trainingForPlan laisse la main au moteur là où le plan n’a pas de sens', () => {
    const state = career(21);
    const plan: WeekPlan = { focus: 'finition', intensity: 'intense' };

    expect(trainingForPlan(state, plan, 'entrainement')).toEqual({ focus: 'finition', intensity: 'intense' });
    expect(trainingForPlan(state, plan, 'preparation')).toEqual({ focus: 'finition', intensity: 'intense' });
    // Journées sans séance : le moteur décide (repos, match, vacances, rééducation).
    expect(trainingForPlan(state, plan, 'jour_match')).toBeUndefined();
    expect(trainingForPlan(state, plan, 'repos')).toBeUndefined();
    expect(trainingForPlan(state, plan, 'vacances')).toBeUndefined();
    expect(trainingForPlan(state, plan, 'reeducation')).toBeUndefined();
    // Veille et lendemain de match : séance fixe, on ne s'épuise pas avant un match.
    expect(trainingForPlan(state, plan, 'veille_match')).toEqual(BALANCE.career.defaultTraining.veille_match);
    expect(trainingForPlan(state, plan, 'lendemain_match')).toEqual(BALANCE.career.defaultTraining.lendemain_match);
    // Plan 'auto' : rien d'imposé, la rotation du staff s'applique.
    expect(trainingForPlan(state, { focus: 'auto', intensity: 'intense' }, 'entrainement')).toBeUndefined();
  });
});


describe('advanceWeek : tous les motifs d’arrêt', () => {
  it('un événement neuf interrompt la semaine, un événement déjà là ne l’interrompt pas', () => {
    const plan: WeekPlan = { focus: 'auto', intensity: 'normale' };
    // Un événement présent AVANT la semaine : le joueur l'a déjà vu passer, la semaine doit aller au bout.
    const dejaLa = career(31);
    avancerJusqua(dejaLa, debutPreparation(dejaLa), plan);
    dejaLa.events.push({
      id: 'evt-avant', definitionId: 'coup_de_fil_famille', category: 'famille', date: dejaLa.currentDate,
      title: 'Coup de fil de la famille', facts: {}, npcIds: [], resolved: false,
    });
    const semaine = advanceWeek(dejaLa, plan);
    // La semaine peut s'arrêter pour un événement NEUF, jamais pour celui-ci.
    expect(semaine.eventIds, 'un événement déjà connu ne doit pas interrompre').not.toContain('evt-avant');

    // Un événement créé pendant la semaine, lui, arrête tout et est rendu dans eventIds.
    const state = career(32);
    let trouve: WeekResult | null = null;
    for (let i = 0; i < 60 && !trouve; i++) {
      const w = advanceWeek(state, plan);
      if (w.stop === 'evenement') trouve = w;
      else if (w.stop === 'match') jouerLeMatch(state);
      else purgerEvenements(state);
    }
    expect(trouve, 'aucun événement en 60 semaines').not.toBeNull();
    expect(trouve!.eventIds.length).toBeGreaterThan(0);
    for (const id of trouve!.eventIds) {
      const ev = state.events.find((e) => e.id === id);
      expect(ev, id).toBeDefined();
      expect(ev!.resolved, 'un événement qui arrête la semaine est non résolu').toBe(false);
    }
  });

  it('la fin de saison arrête la semaine', () => {
    const plan: WeekPlan = { focus: 'auto', intensity: 'normale' };
    const state = career(33);
    const saisonDepart = state.season.id;
    let vu: WeekResult | null = null;
    for (let i = 0; i < 250 && !vu; i++) {
      const w = advanceWeek(state, plan);
      if (w.stop === 'fin_de_saison') vu = w;
      else if (w.stop === 'match') jouerLeMatch(state);
      else purgerEvenements(state);
    }
    expect(vu, 'aucune fin de saison atteinte').not.toBeNull();
    expect(state.season.id, 'la saison suivante a bien commencé').not.toBe(saisonDepart);
    expect(state.pastSeasons.length).toBeGreaterThan(0);
  });

  it('une carrière terminée renvoie « retraite » sans rien jouer', () => {
    const state = career(34);
    state.retired = true;
    const w = advanceWeek(state, { focus: 'auto', intensity: 'normale' });
    expect(w.stop).toBe('retraite');
    expect(w.days).toHaveLength(0);
    expect(state.currentDate).toBe(w.from);
  });

  it('un état abîmé ne fait jamais planter l’appelant', () => {
    // Contrat réel : quoi qu'il arrive, l'interface reçoit un WeekResult exploitable.
    const state = career(35);
    state.calendar = [];
    delete (state.world.clubs as Record<string, unknown>)[state.player.contract.clubId];
    let w: WeekResult | null = null;
    expect(() => { w = advanceWeek(state, { focus: 'auto', intensity: 'normale' }); }).not.toThrow();
    expect(w).not.toBeNull();
    expect(['fin_de_semaine', 'evenement', 'match', 'fin_de_saison', 'retraite', 'erreur']).toContain(w!.stop);
    // Si le moteur a levé, la semaine s'arrête proprement et le laisse par écrit.
    if (w!.stop === 'erreur') {
      expect(w!.resume.messages.join(' ')).toMatch(/interrompue/);
      expect(state.log.some((l) => l.category === 'systeme' && l.text.startsWith('Erreur pendant la semaine'))).toBe(true);
    }
  });

  it('une journée interactive laissée en plan renvoie directement au match', () => {
    const plan: WeekPlan = { focus: 'auto', intensity: 'normale' };
    const state = career(36);
    let garde = 0;
    while (garde++ < 60) {
      const w = advanceWeek(state, plan);
      if (w.stop === 'match') break;
      purgerEvenements(state);
    }
    // L'interface commence la journée puis quitte sans jouer le match.
    const jour = advanceDay(state, { playerMatchMode: 'interactif' });
    expect(jour.pendingPlayerMatchId).toBeDefined();
    const w = advanceWeek(state, plan);
    expect(w.stop).toBe('match');
    expect(w.matchId).toBe(jour.pendingPlayerMatchId);
    expect(w.days).toHaveLength(0);
  });
});
