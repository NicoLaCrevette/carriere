/**
 * Lecture d'une action et briefing de semaine : les deux endroits où le jeu
 * doit expliquer ce qu'il fait. Aucun calcul de jeu ici, seulement la
 * traduction de ce que le moteur a produit — c'est justement ce qu'il faut
 * garder honnête : une explication qui invente serait pire que rien.
 */
import { describe, expect, it } from 'vitest';
import { expliquerAction, pourcentage } from '../lib/explainAction';
import { buildBriefing } from '../lib/weekBriefing';
import { newCareer } from '../../engine/career/newCareer';
import { generateFictionalDataset } from '../../engine/world/loadDataset';
import { buildAllocation, midTableClubId } from '../../engine/sim/headless';
import { advanceDay } from '../../engine/calendar/advanceDay';
import { avatarDepuisId } from '../lib/avatar';
import type { ActionOutcome, CareerSetup, CareerState } from '../../engine/types';

function issue(modifiers: Record<string, number>, roll: number): ActionOutcome {
  return {
    kind: 'arret', probability: modifiers.final ?? 0.3, roll, modifiers,
    ratingDelta: 0, ratingReason: '', statsDelta: {}, facts: {},
  };
}

describe('pourquoi ça a marché ou non', () => {
  const mods = {
    base: 0.4, distance: 0.72, densite: 0.88, attributs: 0.95, pression: 0.82,
    forme: 1.06, confiance: 1.005, plafond: 0.38, final: 0.19,
  };

  it('trie les facteurs du plus pénalisant au plus favorable', () => {
    const e = expliquerAction(issue(mods, 0.5));
    expect(e.facteurs[0]!.key).toBe('distance');
    expect(e.facteurs[e.facteurs.length - 1]!.key).toBe('forme');
  });

  it('ne parle ni des valeurs de sortie ni des effets négligeables', () => {
    const cles = expliquerAction(issue(mods, 0.5)).facteurs.map((f) => f.key);
    expect(cles).not.toContain('final');
    expect(cles).not.toContain('plafond');
    expect(cles).not.toContain('base');
    // 1.005, soit un demi pour cent : trop peu pour mériter une ligne.
    expect(cles).not.toContain('confiance');
  });

  it('reprend la probabilité et le tirage du moteur, sans les recalculer', () => {
    const e = expliquerAction(issue(mods, 0.44));
    expect(e.probabilite).toBe(0.19);
    expect(e.tirage).toBe(0.44);
  });

  it('signale le plafond du §6 quand il a bridé l’action', () => {
    expect(expliquerAction(issue(mods, 0.5)).plafonne).toBe(false);
    expect(expliquerAction(issue({ ...mods, final: 0.38 }, 0.5)).plafonne).toBe(true);
  });

  it('dit « raté » ou « réussi » selon le tirage, et l’explique dans ce sens', () => {
    // Tirage sous la probabilité : c'est passé.
    expect(expliquerAction(issue(mods, 0.1)).resume).toContain('pourtant');
    expect(expliquerAction(issue(mods, 0.9)).resume).not.toContain('pourtant');
  });

  it('nomme les trois facteurs les plus pénalisants, en français', () => {
    const e = expliquerAction(issue(mods, 0.9));
    expect(e.pires).toHaveLength(3);
    for (const f of e.pires) {
      expect(f.aide).toBe(false);
      expect(f.label).not.toBe(f.key);
    }
  });

  it('affiche les très petites probabilités sans les arrondir à zéro', () => {
    expect(pourcentage(0.004)).toBe('0.4 %');
    expect(pourcentage(0.62)).toBe('62 %');
    expect(pourcentage(0)).toBe('0 %');
  });
});

function career(seed: number): CareerState {
  const dataset = generateFictionalDataset(42);
  const setup: CareerSetup = {
    firstName: 'Léo', lastName: 'Martin', startAge: 18, nationality: 'FRA', position: 'BU', foot: 'droit',
    heightCm: 180, weightKg: 74, archetypes: ['finisseur'], clubId: midTableClubId(dataset),
    startingLevel: 'prometteur', difficulty: 'exigeant',
    allocation: buildAllocation({ startAge: 18, position: 'BU', startingLevel: 'prometteur' }),
    datasetId: dataset.id, seed,
  };
  return newCareer(setup, dataset);
}

describe('ouverture de semaine', () => {
  it('situe l’équipe, le prochain match et l’état du joueur', () => {
    const state = career(3);
    for (let i = 0; i < 60; i++) advanceDay(state);
    const b = buildBriefing(state);
    expect(b.phrases.length).toBeGreaterThanOrEqual(2);
    expect(b.titre.length).toBeGreaterThan(0);
    if (b.match) {
      expect(b.match.jours).toBeGreaterThanOrEqual(0);
      expect(b.titre).toContain(b.match.adversaire);
    }
  });

  it('varie sa formulation d’une semaine à l’autre, à faits égaux', () => {
    const state = career(3);
    const vues = new Set<string>();
    for (let i = 0; i < 120; i++) {
      advanceDay(state);
      vues.add(buildBriefing(state).phrases[0] ?? '');
    }
    expect(vues.size).toBeGreaterThan(1);
  });

  it('reste identique pour un même jour : c’est une lecture, pas un tirage', () => {
    const state = career(3);
    for (let i = 0; i < 40; i++) advanceDay(state);
    expect(buildBriefing(state)).toEqual(buildBriefing(state));
  });
});

describe('portraits', () => {
  it('un même joueur garde son portrait, deux joueurs en ont de différents', () => {
    expect(avatarDepuisId('npc-42')).toEqual(avatarDepuisId('npc-42'));
    const portraits = new Set(
      Array.from({ length: 40 }, (_, i) => JSON.stringify(avatarDepuisId(`npc-${i}`))),
    );
    expect(portraits.size).toBeGreaterThan(10);
  });

  it('les accessoires restent rares', () => {
    const avec = Array.from({ length: 200 }, (_, i) => avatarDepuisId(`j-${i}`)).filter((a) => a.accessoire !== 'aucun');
    expect(avec.length).toBeLessThan(100);
  });
});

describe('la cause en toutes lettres', () => {
  const mods = {
    base: 0.4, distance: 0.72, densite: 0.88, attributs: 0.95, pression: 0.82,
    forme: 1.06, plafond: 0.38, final: 0.19,
  };

  it('ne contient aucun chiffre : c’est ce qui remplace le dé à l’écran', () => {
    for (const roll of [0.05, 0.5, 0.95]) {
      expect(expliquerAction(issue(mods, roll)).causeLisible).not.toMatch(/\d/);
    }
  });

  it('sur un échec, nomme ce qui a manqué', () => {
    const e = expliquerAction(issue(mods, 0.9));
    expect(e.causeLisible).toContain('manqué');
    expect(e.causeLisible.length).toBeGreaterThan(20);
  });

  it('sur une réussite, ne reproche rien au joueur', () => {
    const e = expliquerAction(issue(mods, 0.05));
    expect(e.causeLisible).not.toContain('manqué');
  });

  it('reste lisible quand rien ne pesait', () => {
    const neutre = { base: 0.4, plafond: 0.9, final: 0.4 };
    expect(expliquerAction(issue(neutre, 0.9)).causeLisible.length).toBeGreaterThan(10);
    expect(expliquerAction(issue(neutre, 0.1)).causeLisible.length).toBeGreaterThan(10);
  });
});
