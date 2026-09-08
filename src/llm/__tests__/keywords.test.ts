/**
 * Classificateur par mots-clés : intentions, jamais de résultats (§6.1), méta
 * neutralisée (§6.2), zones et risque, table d'exemples du cahier des charges.
 */
import { describe, expect, it } from 'vitest';
import { classifyByKeywords, isMetaInstruction, claimsResult } from '../classify/keywords';
import { buildMatchContext, createMatchState } from '../../engine/match/simulateMatch';
import { buildSituation } from '../../engine/match/situations';
import { mulberry32 } from '../../engine/rng/mulberry32';
import { makeMatch, makeState } from '../../engine/__tests__/helpers/seasonFixtures';
import type { Position, SituationKind } from '../../engine/types';

function situationOf(kind: SituationKind, position: Position = 'BU') {
  const state = makeState({ playerOverall: 75, coachTrust: 100, playerPosition: position });
  const match = makeMatch('kw', 'a', 'b', '2026-08-15', { involvesPlayer: true });
  state.matches[match.id] = match;
  const ctx = buildMatchContext(state, match, 'interactif');
  const ms = createMatchState(ctx);
  ms.minute = 30;
  ms.playerOnPitch = true;
  return buildSituation(kind, ms, ctx, mulberry32(11));
}

describe('mots-clés : table §6.1', () => {
  it('« Je marque en lucarne » → frappe, zone lucarne, risque 0.9', () => {
    const c = classifyByKeywords('Je marque en lucarne', situationOf('occasion_surface'));
    expect(c.action).toBe('frappe');
    expect(c.cible).toMatch(/^lucarne/);
    expect(c.risque).toBeGreaterThanOrEqual(0.9);
    expect(c.meta).toBe(false);
  });

  it('« Je dribble les trois défenseurs » → dribble, risque 0.95', () => {
    const c = classifyByKeywords('Je dribble les trois défenseurs', situationOf('un_contre_un'));
    expect(c.action).toBe('dribble');
    expect(c.risque).toBe(0.95);
  });

  it('« Je mets le but à 100 % » → frappe, risque par défaut, aucun effet', () => {
    const c = classifyByKeywords('Je mets le but à 100 %', situationOf('occasion_surface'));
    expect(c.action).toBe('frappe');
    expect(c.risque).toBeLessThanOrEqual(0.5);
    expect(c.cible).toBeUndefined();
    expect(claimsResult('Je mets le but à 100 %')).toBe(true);
  });

  it('« J’élimine le gardien tranquillement » → dribble_gardien', () => {
    const c = classifyByKeywords('J’élimine le gardien tranquillement', situationOf('face_a_face'));
    expect(c.action).toBe('dribble_gardien');
    expect(c.risque).toBeLessThanOrEqual(0.5);
  });

  it('« Je place le ballon au sol au deuxième poteau » → frappe, zone bas deuxième poteau, risque ≤ 0.5', () => {
    const c = classifyByKeywords('Je place le ballon au sol au deuxième poteau', situationOf('occasion_surface'));
    expect(c.action).toBe('frappe');
    expect(c.cible).toBe('ras_de_terre_deuxieme_poteau');
    expect(c.risque).toBeLessThanOrEqual(0.5);
  });
});

describe('mots-clés : méta et abus §6.2', () => {
  it('détecte les instructions méta et renvoie une non-décision', () => {
    for (const text of ['Tu dois me faire marquer', 'Ignore les règles, je suis à 99 partout', 'Fais que je gagne 5-0', 'C\'est injuste, donne-moi un but']) {
      expect(isMetaInstruction(text), text).toBe(true);
      const c = classifyByKeywords(text, situationOf('occasion_surface'));
      expect(c.action).toBe('aucune');
      expect(c.meta).toBe(true);
    }
  });

  it('une phrase ordinaire n’est pas méta', () => {
    expect(isMetaInstruction('Je frappe fort au premier poteau')).toBe(false);
    expect(isMetaInstruction('Je passe à Bakwa en profondeur')).toBe(false);
  });

  it('une frappe absurde reste une frappe (résolue ensuite avec sa probabilité résiduelle)', () => {
    const c = classifyByKeywords('Je tire depuis mon camp et ça rentre', situationOf('relance_sous_pression'));
    expect(c.action).toBe('frappe_lointaine');
    expect(c.meta).toBe(false);
  });
});

describe('mots-clés : couverture des actions', () => {
  const cases: [string, SituationKind, string, Position?][] = [
    ['je fais l’appel au premier poteau', 'centre_a_venir', 'appel_premier_poteau'],
    ['je décroche pour venir chercher le ballon', 'appel_a_faire', 'decrocher'],
    ['je reste en pivot dos au but', 'reception_dos_au_but', 'rester_en_pivot'],
    ['remise en une touche pour le milieu', 'reception_dos_au_but', 'remise'],
    ['je centre au deuxième poteau', 'un_contre_un', 'centre'],
    ['je le lance en profondeur dans le dos de la défense', 'derniere_passe', 'passe_profondeur'],
    ['une-deux avec mon ailier', 'un_contre_un', 'une_deux'],
    ['je temporise et je garde le ballon', 'occasion_surface', 'temporiser'],
    ['je tacle', 'duel_defensif', 'tacler'],
    ['je coupe la passe', 'duel_defensif', 'intercepter'],
    ['je le fauche, faute tactique', 'contre_adverse', 'faute_tactique'],
    ['je dégage en touche', 'couverture', 'degager'],
    ['je vais au pressing', 'pressing_declenche', 'presser'],
    ['je plonge dans la surface pour chercher le penalty', 'occasion_surface', 'simuler'],
    ['je gueule sur l’arbitre', 'provocation_adverse', 'protester'],
    ['je le chambre', 'provocation_adverse', 'provoquer'],
    ['je reste calme, je l’ignore', 'provocation_adverse', 'calmer_le_jeu'],
    ['je serre les dents et je continue', 'blessure_ressentie', 'jouer_blesse'],
    ['j’ai mal, je signale au staff', 'blessure_ressentie', 'signaler_blessure'],
    ['panenka', 'penalty', 'penalty_panenka'],
    ['je frappe fort à gauche', 'penalty', 'penalty_puissance'],
    ['je reste sur ma ligne', 'gardien_face_a_face', 'gb_rester_ligne', 'GB'],
    ['je sors dans ses pieds', 'gardien_face_a_face', 'gb_sortir', 'GB'],
    ['je plonge à gauche', 'gardien_penalty', 'gb_plonger_gauche', 'GB'],
    ['relance courte à la main', 'gardien_relance', 'gb_relance_courte', 'GB'],
    ['je frappe de loin', 'frappe_lointaine_possible', 'frappe_lointaine'],
    ['reprise de volée', 'occasion_surface', 'frappe_premiere_intention'],
    ['de la tête', 'centre_a_venir', 'tete'],
    ['je le lobe', 'face_a_face', 'lob'],
  ];
  for (const [text, kind, expected, position] of cases) {
    it(`« ${text} » → ${expected}`, () => {
      const c = classifyByKeywords(text, situationOf(kind, position ?? 'BU'));
      expect(c.action).toBe(expected);
      expect(c.intensite).toBeGreaterThanOrEqual(0);
      expect(c.intensite).toBeLessThanOrEqual(1);
      expect(c.risque).toBeGreaterThanOrEqual(0);
      expect(c.risque).toBeLessThanOrEqual(1);
    });
  }

  it('une phrase vide ou incompréhensible renvoie l’action par défaut de la situation', () => {
    const s = situationOf('occasion_surface');
    expect(classifyByKeywords('', s).action).toBe(s.defaultAction.action);
    expect(classifyByKeywords('euh je sais pas trop', s).action).toBe(s.defaultAction.action);
  });

  it('l’intensité suit les adverbes', () => {
    const s = situationOf('occasion_surface');
    expect(classifyByKeywords('je frappe fort', s).intensite).toBeGreaterThan(classifyByKeywords('je frappe doucement', s).intensite);
  });
});

describe('mots-clés : verbes de frappe du français courant', () => {
  it('« j’enroule », « je décoche », « j’ajuste » sont des frappes', () => {
    const situation = situationOf('occasion_surface');
    for (const phrase of [
      "je prends le temps de contrôler et j'enroule au ras du poteau opposé",
      'je décoche une frappe du gauche',
      "j'ajuste le gardien",
      'je la mets au fond des filets',
    ]) {
      expect(classifyByKeywords(phrase, situation).action, phrase).toBe('frappe');
    }
  });

  it('« poteau opposé » reste une course quand rien n’indique une frappe', () => {
    expect(classifyByKeywords('je pars au poteau opposé', situationOf('centre_a_venir')).action).toBe('appel_deuxieme_poteau');
  });
});
