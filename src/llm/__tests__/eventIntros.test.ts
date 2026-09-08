/**
 * Mise en situation des événements : chaque définition du catalogue doit
 * donner au joueur de quoi répondre (qui parle, ce qui se passe, une question).
 */
import { describe, expect, it } from 'vitest';
import { EVENT_CATALOGUE } from '../../engine/events/catalogue';
import { eventIntro, hasEventIntro } from '../scenes/eventIntros';
import type { GameEvent } from '../../engine/types';

const VARS = { prenom: 'Léo', nom: 'Martin', club: 'Toulouse', coachNom: 'Dupont', poste: 'BU' };

function eventFor(definitionId: string, facts: Record<string, string> = {}): GameEvent {
  return { id: 'evt', definitionId, category: 'famille', date: '2026-09-01', title: 'Titre', facts, npcIds: [], resolved: false };
}

describe('intros d’événements', () => {
  it('chaque définition du catalogue a sa mise en situation', () => {
    const manquantes = EVENT_CATALOGUE.filter((d) => !hasEventIntro(d.id)).map((d) => d.id);
    expect(manquantes, `définitions sans intro : ${manquantes.join(', ')}`).toHaveLength(0);
  });

  it('chaque intro pose le contexte et une question ouverte', () => {
    for (const def of EVENT_CATALOGUE) {
      const texte = eventIntro(eventFor(def.id, { motif: 'un partage de ballon jugé injuste', sujet: 'le salaire', plateforme: 'X', enseigne: 'une brasserie du coin', poste: 'BU' }), VARS);
      expect(texte.length, def.id).toBeGreaterThan(90);
      expect(texte, def.id).toMatch(/\?/);
      // Pas de faute d'élision produite par l'insertion d'un fait déjà déterminé.
      expect(texte, def.id).not.toMatch(/\b(de|que) (un|une|des) /);
    }
  });

  it('les faits déjà déterminés sont introduits sans préposition qui les rende bancals', () => {
    // Ces deux définitions insèrent un groupe nominal complet (« le salaire », « un partage… »).
    expect(eventIntro(eventFor('appel_agent_conseils', { sujet: 'le salaire' }), VARS)).toContain('Le sujet : le salaire');
    expect(eventIntro(eventFor('clash_vestiaire', { motif: 'une critique publique' }), VARS)).toContain('En cause : une critique publique');
  });

  it('un événement inconnu retombe sur une formulation générique exploitable', () => {
    const texte = eventIntro(eventFor('inconnu_au_bataillon', { detail: 'une convocation inattendue' }), VARS);
    expect(texte).toContain('Léo');
    expect(texte).toMatch(/\?$/);
  });
});
