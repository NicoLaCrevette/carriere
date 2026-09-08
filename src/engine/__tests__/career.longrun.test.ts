/**
 * Carrière longue : 10 carrières de 8 saisons. Progression plausible, bornes
 * respectées, aucune exception, le joueur finit par gagner sa place, la
 * valeur marchande suit la note. `CARRIERE_LONGRUN=0` pour sauter.
 */
import { describe, expect, it } from 'vitest';
import type { CareerState } from '../types';
import { ATTRIBUTE_KEYS } from '../types';
import { runHeadlessSeason, type HeadlessSeasonSummary } from '../sim/headless';

const CAREERS = Number(process.env.CARRIERE_LONGRUN ?? 10);
const SEASONS = 8;

describe.skipIf(CAREERS <= 0)(`carrière longue : ${CAREERS} carrières de ${SEASONS} saisons`, () => {
  const careers: HeadlessSeasonSummary[][] = [];
  const states: CareerState[] = [];
  for (let seed = 1; seed <= CAREERS; seed++) {
    const r = runHeadlessSeason({ seed, dataset: 'fictional', position: 'BU', age: 18, level: 'prometteur', difficulty: 'exigeant', seasons: SEASONS });
    careers.push(r.seasons);
    states.push(r.state);
  }
  const summary = careers.map((c, i) => `carrière ${i + 1} : ${c.map((s) => `${s.label.slice(2, 4)}:${s.overallEnd}/${s.player.minutes}min/${s.player.starts}t/${s.player.goals}b/conf${Math.round(s.coachTrustEnd)}/riv${s.rivals.map((r) => r.overall).join('-')}`).join(' ')}`).join('\n');
  // eslint-disable-next-line no-console
  console.log(`\n${summary}\n`);

  it('produit 8 saisons par carrière sans exception', () => {
    for (const c of careers) expect(c.length, summary).toBe(SEASONS);
  });

  it('note globale à 26 ans entre 60 et 92, attributs bornés 1-99', () => {
    for (const c of careers) {
      const last = c[c.length - 1]!;
      expect(last.overallEnd, summary).toBeGreaterThanOrEqual(60);
      expect(last.overallEnd, summary).toBeLessThanOrEqual(92);
      expect(last.overallEnd, summary).toBeGreaterThan(c[0]!.overallStart);
      for (const key of ATTRIBUTE_KEYS) {
        expect(last.attributesEnd[key], key).toBeGreaterThanOrEqual(1);
        expect(last.attributesEnd[key], key).toBeLessThanOrEqual(99);
      }
    }
  });

  it('la progression est forte à 18-20 ans et ralentit ensuite', () => {
    const early = careers.map((c) => c[1]!.overallEnd - c[0]!.overallStart);
    const late = careers.map((c) => c[7]!.overallEnd - c[5]!.overallEnd);
    const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
    expect(mean(early), summary).toBeGreaterThanOrEqual(6);
    expect(mean(early), summary).toBeLessThanOrEqual(20);
    expect(mean(late), summary).toBeLessThan(mean(early));
  });

  // Les cibles d'équilibrage ne valent que sur l'échantillon complet (10 carrières) : `CARRIERE_LONGRUN`
  // sert à accélérer les exécutions de développement, où l'on vérifie seulement que rien n'est cassé.
  const ECHANTILLON_COMPLET = CAREERS >= 8;

  it('le joueur finit par devenir titulaire dans la plupart des carrières', () => {
    const became = careers.filter((c) => c.some((s) => s.player.starts >= 10)).length;
    expect(became, summary).toBeGreaterThanOrEqual(ECHANTILLON_COMPLET ? Math.ceil(CAREERS * 0.6) : 1);
  });

  it('la profondeur reste plausible : évènements espacés, entraîneurs pas limogés tous les quatre matins', () => {
    const seasonsTotal = CAREERS * SEASONS;
    const coachChanges = states.reduce((n, s) => n + s.log.filter((l) => l.text.includes("change d'entraîneur")).length, 0);
    const events = states.reduce((n, s) => n + s.events.filter((e) => e.definitionId !== 'mercato:offre' && !e.definitionId.startsWith('sponsor')).length, 0);
    const detail = `${coachChanges} changements d'entraîneur et ${events} évènements sur ${seasonsTotal} saisons`;
    // Un club change d'entraîneur de temps en temps, pas chaque saison (mesuré ≈ 0.24/saison sur l'échantillon complet).
    if (ECHANTILLON_COMPLET) expect(coachChanges / seasonsTotal, detail).toBeGreaterThan(0.05);
    expect(coachChanges / seasonsTotal, detail).toBeLessThan(0.6);
    // Deux évènements par semaine au maximum, soit très en dessous d'un par jour (mesuré ≈ 20/saison).
    expect(events / seasonsTotal, detail).toBeGreaterThan(3);
    expect(events / seasonsTotal, detail).toBeLessThan(40);
    // Aucun évènement ne reste ouvert indéfiniment : ils sont résolus ou refermés.
    for (const s of states) expect(s.events.filter((e) => !e.resolved).length, detail).toBeLessThanOrEqual(3);
  });

  it('la valeur marchande suit la note globale', () => {
    const all = careers.flat();
    const strong = all.filter((s) => s.overallEnd >= 78).map((s) => s.marketValueEnd);
    const weak = all.filter((s) => s.overallEnd <= 66).map((s) => s.marketValueEnd);
    if (strong.length > 0 && weak.length > 0) {
      const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
      expect(mean(strong), summary).toBeGreaterThan(mean(weak) * 3);
    }
    for (const s of all) expect(s.marketValueEnd, summary).toBeGreaterThan(0);
  });
});

/** Mercato exercé : politique « ambitieux » (offres acceptées, transferts, prolongations) sur des carrières entières. */
describe.skipIf(CAREERS <= 0)('carrière longue avec mercato (politique ambitieuse)', () => {
  const MOVERS = Math.min(3, Math.max(1, CAREERS));
  const careers = Array.from({ length: MOVERS }, (_, i) =>
    runHeadlessSeason({ seed: 100 + i, dataset: 'fictional', position: 'BU', age: 18, level: 'prometteur', difficulty: 'exigeant', seasons: SEASONS, offerPolicy: 'ambitieux' }));
  const summary = careers.map((c, i) => `carrière ${i + 1} : ${c.state.transfers.map((t) => `${t.date} ${t.fromClubId}→${t.toClubId}`).join(', ') || 'aucun transfert'} ; ${c.seasons.map((s) => `${s.player.minutes}min/${s.player.starts}t`).join(' ')}`).join('\n');
  // eslint-disable-next-line no-console
  console.log(`\n${summary}\n`);

  it('des transferts ont lieu, chacun une seule fois, sans erreur journalisée, et le joueur continue de jouer', () => {
    expect(careers.some((c) => c.state.transfers.length > 0), summary).toBe(true);
    for (const c of careers) {
      expect(c.seasons.length, summary).toBe(SEASONS);
      const errors = c.state.log.filter((l) => l.category === 'systeme' && l.text.startsWith('Erreur'));
      expect(errors.map((l) => l.text), summary).toHaveLength(0);
      const dates = c.state.transfers.map((t) => t.date);
      expect(new Set(dates).size, summary).toBe(dates.length);
      for (const o of c.state.offers.filter((x) => x.status === 'acceptee')) expect(o.executedOn, summary).toBeDefined();
      const minutes = c.seasons.reduce((s, x) => s + x.player.minutes, 0) / c.seasons.length;
      expect(minutes, summary).toBeGreaterThan(400);
      // Le contrat suit toujours un club existant, jamais un club « fantôme ».
      expect(c.state.world.clubs[c.state.player.contract.clubId], summary).toBeDefined();
    }
  });
});
