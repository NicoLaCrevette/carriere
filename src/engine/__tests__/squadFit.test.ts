/**
 * Situation prévisionnelle dans un effectif : le jeu doit dire, AVANT de
 * signer, qu'on ne jouera pas. Les verdicts sont calibrés sur la simulation
 * (voir `squadFit.ts`) ; ce test verrouille la calibration.
 */
import { describe, expect, it } from 'vitest';
import realDataset from '../../data/leagues/real/ligue1-2026-27.json';
import { parseDataset } from '../../data/schema';
import { squadFit } from '../player/squadFit';

const dataset = parseDataset(realDataset);
const club = (id: string) => dataset.clubs.find((c) => c.id === id)!;

/** Note de départ typique d'un joueur « prometteur » de 18 ans. */
const PROMETTEUR = 55;

describe('où le joueur se situerait dans l’effectif', () => {
  it('annonce l’impasse là où la simulation montre zéro titularisation', () => {
    // Strasbourg : attaquants 74, 70, 67, 67, 65 → mesuré 0 titularisation en 4 saisons.
    const fit = squadFit(club('strasbourg'), 'BU', PROMETTEUR);
    expect(fit.verdict).toBe('hors_plans');
    expect(fit.ecartAuDeuxieme).toBeGreaterThanOrEqual(14);
    expect(fit.rang).toBeGreaterThan(4);
  });

  it('n’effraie pas là où la simulation montre une percée', () => {
    // Angers : 68, 65, 58, 54, 53 → mesuré titulaire dès la 2e saison, 26 buts en 4e.
    const fit = squadFit(club('angers'), 'BU', PROMETTEUR);
    expect(fit.verdict).toBe('remplacant');
    expect(fit.ecartAuDeuxieme).toBeLessThan(14);
  });

  it('classe les cadors hors de portée', () => {
    for (const id of ['psg', 'lens']) {
      expect(squadFit(club(id), 'BU', PROMETTEUR).verdict, id).toBe('hors_plans');
    }
  });

  it('reconnaît un joueur meilleur que tout le monde comme titulaire', () => {
    const fit = squadFit(club('strasbourg'), 'BU', 90);
    expect(fit.verdict).toBe('titulaire');
    expect(fit.rang).toBe(1);
    expect(fit.ecartAuPremier).toBe(0);
  });

  it('compte les joueurs de poste voisin comme concurrents', () => {
    // Un latéral droit est un concurrent crédible d'un latéral gauche, pas un gardien.
    const fit = squadFit(club('strasbourg'), 'DD', PROMETTEUR);
    expect(fit.effectif).toBeGreaterThan(2);
    expect(fit.concurrents.every((n) => n > 0)).toBe(true);
  });
});
