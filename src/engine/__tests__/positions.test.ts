import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_GROUPS, MATCH_ACTIONS, POSITIONS, SITUATION_KINDS } from '../types';
import type { AttributeKey, MatchActionId, Position, SituationKind } from '../types';
import { POSITION_PROFILES, compatiblePositions, positionCompatibility, positionProfile } from '../config/positions';
import { FORMATIONS, formation } from '../config/formations';
import { BALANCE } from '../config/balance';

const GK_KEYS = new Set<AttributeKey>(ATTRIBUTE_GROUPS.gardien);
const OFFENSIVE: readonly SituationKind[] = [
  'centre_a_venir', 'occasion_surface', 'face_a_face', 'un_contre_un', 'contre_attaque', 'reception_dos_au_but',
  'frappe_lointaine_possible', 'penalty', 'coup_franc_direct', 'coup_franc_indirect', 'corner_offensif',
  'derniere_passe', 'appel_a_faire',
];
const DEFENSIVE: readonly SituationKind[] = [
  'duel_defensif', 'couverture', 'pressing_declenche', 'corner_defensif', 'relance_sous_pression',
  'contre_adverse', 'faute_tactique_possible',
];
const GOALKEEPER: readonly SituationKind[] = ['gardien_face_a_face', 'gardien_sortie_aerienne', 'gardien_relance', 'gardien_penalty'];

/** Types de situation triés par poids décroissant. */
function topKinds(p: Position, n: number): SituationKind[] {
  const mix = Object.entries(POSITION_PROFILES[p].situationMix) as [SituationKind, number][];
  return mix.sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

function shareOf(p: Position, kinds: readonly SituationKind[]): number {
  const mix = POSITION_PROFILES[p].situationMix;
  const total = Object.values(mix).reduce((s, w) => s + (w ?? 0), 0);
  const part = kinds.reduce((s, k) => s + (mix[k] ?? 0), 0);
  return part / total;
}

describe('POSITION_PROFILES', () => {
  it('couvre les 10 postes avec un libellé et le bon identifiant', () => {
    for (const p of POSITIONS) {
      const profile = positionProfile(p);
      expect(profile.position).toBe(p);
      expect(profile.label.length).toBeGreaterThan(2);
    }
  });

  it('a des poids qui somment à 1, positifs, avec les attributs gardien seulement pour le GB', () => {
    for (const p of POSITIONS) {
      const weights = POSITION_PROFILES[p].weights;
      const entries = Object.entries(weights) as [AttributeKey, number][];
      const sum = entries.reduce((s, [, w]) => s + w, 0);
      expect(sum).toBeCloseTo(1, 9);
      for (const [key, w] of entries) {
        expect(w).toBeGreaterThan(0);
        if (p === 'GB') {
          expect(['finition', 'dribble', 'centres', 'tirLointain']).not.toContain(key);
        } else {
          expect(GK_KEYS.has(key)).toBe(false);
        }
      }
    }
    const gkWeights = POSITION_PROFILES.GB.weights;
    const gkShare = ATTRIBUTE_GROUPS.gardien.reduce((s, k) => s + (gkWeights[k] ?? 0), 0);
    expect(gkShare).toBeGreaterThan(0.6);
  });

  it('a des attributs clés présents dans les poids et bien pondérés', () => {
    for (const p of POSITIONS) {
      const { keyAttributes, weights } = POSITION_PROFILES[p];
      expect(keyAttributes.length).toBeGreaterThanOrEqual(4);
      expect(new Set(keyAttributes).size).toBe(keyAttributes.length);
      for (const key of keyAttributes) expect(weights[key] ?? 0).toBeGreaterThan(0.02);
    }
  });

  it('fixe 8 à 16 situations par match et suit BALANCE', () => {
    for (const p of POSITIONS) {
      const [min, max] = POSITION_PROFILES[p].situationsPerMatch;
      expect(min).toBeGreaterThanOrEqual(8);
      expect(max).toBeLessThanOrEqual(16);
      expect(min).toBeLessThanOrEqual(max);
      expect([min, max]).toEqual([...BALANCE.situations.perMatchByPosition[p]]);
    }
  });

  it('a un mix de situations cohérent par poste', () => {
    // Un buteur vit d'occasions, de face-à-face et d'appels.
    expect(topKinds('BU', 3)).toEqual(expect.arrayContaining(['occasion_surface', 'appel_a_faire']));
    expect(shareOf('BU', OFFENSIVE)).toBeGreaterThan(0.85);
    expect(POSITION_PROFILES.BU.situationMix.face_a_face ?? 0).toBeGreaterThan(0);
    // Un central : duels, couvertures, corners.
    expect(topKinds('DC', 3)).toEqual(expect.arrayContaining(['duel_defensif', 'couverture', 'corner_defensif']));
    expect(shareOf('DC', DEFENSIVE)).toBeGreaterThan(0.75);
    // Un gardien : uniquement des situations de gardien (plus le hors ballon et le corner défensif).
    for (const kind of Object.keys(POSITION_PROFILES.GB.situationMix) as SituationKind[]) {
      expect([...GOALKEEPER, 'corner_defensif', 'provocation_adverse', 'coequipier_en_difficulte', 'consigne_du_banc', 'tension_fin_de_match', 'blessure_ressentie']).toContain(kind);
    }
    expect(shareOf('GB', GOALKEEPER)).toBeGreaterThan(0.7);
    // Un milieu central : dernières passes, pressing, relances.
    expect(topKinds('MC', 3)).toEqual(expect.arrayContaining(['derniere_passe', 'pressing_declenche', 'relance_sous_pression']));
    // Les ailiers vivent du un-contre-un, les latéraux du duel.
    expect(topKinds('AIG', 1)).toEqual(['un_contre_un']);
    expect(topKinds('DD', 1)).toEqual(['duel_defensif']);
    // Latéraux et ailiers sont symétriques.
    expect(POSITION_PROFILES.DD.situationMix).toEqual(POSITION_PROFILES.DG.situationMix);
    expect(POSITION_PROFILES.AIG.weights).toEqual(POSITION_PROFILES.AID.weights);
  });

  it('a des poids de situations positifs et des types connus', () => {
    for (const p of POSITIONS) {
      for (const [kind, w] of Object.entries(POSITION_PROFILES[p].situationMix)) {
        expect(SITUATION_KINDS).toContain(kind);
        expect(w).toBeGreaterThan(0);
      }
    }
  });

  it('a une action par défaut valide pour chaque situation du mix', () => {
    for (const p of POSITIONS) {
      const { situationMix, defaultActions } = POSITION_PROFILES[p];
      for (const kind of Object.keys(situationMix) as SituationKind[]) {
        const actions = defaultActions[kind];
        expect(actions, `${p} / ${kind}`).toBeDefined();
        expect(actions!.length).toBeGreaterThan(0);
      }
      for (const [kind, actions] of Object.entries(defaultActions) as [SituationKind, MatchActionId[]][]) {
        expect(SITUATION_KINDS).toContain(kind);
        for (const a of actions) expect(MATCH_ACTIONS, `${p} / ${kind} / ${a}`).toContain(a);
        expect(new Set(actions).size).toBe(actions.length);
      }
    }
  });

  it('réserve les actions de gardien au gardien', () => {
    for (const p of POSITIONS) {
      const all = Object.values(POSITION_PROFILES[p].defaultActions).flat();
      const gkActions = all.filter((a) => a.startsWith('gb_'));
      if (p === 'GB') expect(gkActions.length).toBeGreaterThan(0);
      else expect(gkActions).toEqual([]);
    }
    expect(POSITION_PROFILES.GB.defaultActions.gardien_penalty).toContain('gb_plonger_gauche');
    expect(POSITION_PROFILES.BU.defaultActions.face_a_face?.[0]).toBe('frappe');
    expect(POSITION_PROFILES.DC.defaultActions.duel_defensif?.[0]).toBe('tacler');
  });

  it('plafonne la création : clés > secondaires > hors rôle, gardien à part', () => {
    const tiers = BALANCE.creation.creationCapTiers;
    expect(tiers.key).toBeGreaterThan(tiers.secondary);
    expect(tiers.secondary).toBeGreaterThan(tiers.offRole);
    for (const p of POSITIONS) {
      const { creationCaps, keyAttributes } = POSITION_PROFILES[p];
      for (const key of keyAttributes) expect(creationCaps[key]).toBe(tiers.key);
      for (const gk of ATTRIBUTE_GROUPS.gardien) {
        if (p === 'GB') expect(creationCaps[gk] ?? 0).toBeGreaterThanOrEqual(tiers.secondary);
        else expect(creationCaps[gk]).toBe(tiers.offRole);
      }
      expect(POSITION_PROFILES[p].outOfPositionMalus).toBeGreaterThan(0);
      expect(POSITION_PROFILES[p].outOfPositionMalus).toBeLessThanOrEqual(0.5);
    }
    expect(POSITION_PROFILES.GB.creationCaps.finition).toBe(tiers.offRole);
    expect(POSITION_PROFILES.GB.outOfPositionMalus).toBeGreaterThan(POSITION_PROFILES.MC.outOfPositionMalus);
  });
});

describe('positionCompatibility', () => {
  it('est symétrique, bornée et vaut 1 pour un même poste', () => {
    for (const a of POSITIONS) {
      for (const b of POSITIONS) {
        const v = positionCompatibility(a, b);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(v).toBe(positionCompatibility(b, a));
        if (a === b) expect(v).toBe(1);
        else expect(v).toBeLessThan(1);
      }
    }
  });

  it('respecte les repères du contrat et le bon sens footballistique', () => {
    expect(positionCompatibility('DD', 'DG')).toBeCloseTo(0.8, 5);
    expect(positionCompatibility('BU', 'GB')).toBeCloseTo(0.05, 5);
    expect(positionCompatibility('GB', 'DC')).toBeLessThan(0.1);
    expect(positionCompatibility('MDC', 'MC')).toBeGreaterThan(positionCompatibility('MDC', 'BU'));
    expect(positionCompatibility('AIG', 'AID')).toBeGreaterThan(positionCompatibility('AIG', 'DC'));
    expect(positionCompatibility('DC', 'MDC')).toBeGreaterThan(positionCompatibility('DC', 'MOC'));
    expect(positionCompatibility('MOC', 'BU')).toBeGreaterThan(positionCompatibility('MOC', 'DD'));
    expect(compatiblePositions('DD')[0]).toBe('DG');
    expect(compatiblePositions('BU')).not.toContain('BU');
    expect(compatiblePositions('BU').at(-1)).toBe('GB');
  });
});

describe('BALANCE (config)', () => {
  it('respecte les plafonds §6.3 et ne dépasse jamais 0.93', () => {
    const caps = BALANCE.caps;
    expect(caps.butVideDeuxMetres).toBe(0.93);
    expect(caps.penalty).toBe(0.78);
    expect(caps.faceAFace).toBe(0.38);
    expect(caps.repriseSurface).toBe(0.26);
    expect(caps.teteSurCentre).toBe(0.17);
    expect(caps.frappeHorsSurface).toBe(0.08);
    expect(caps.dribbleHautNiveau).toBe(0.42);
    expect(caps.coupFrancDirect).toBe(0.09);
    for (const [name, cap] of Object.entries(caps)) {
      expect(cap, name).toBeGreaterThan(0);
      expect(cap, name).toBeLessThanOrEqual(0.93);
      const base = (BALANCE.baseProbability as Record<string, number>)[name];
      expect(base, `base manquante pour ${name}`).toBeDefined();
      expect(base, name).toBeLessThanOrEqual(cap);
    }
    expect(BALANCE.baseProbability.dribbleGardien).toBe(0.31);
    expect(BALANCE.attributeInfluence).toBe(0.35);
    expect(BALANCE.shotZoneRisk.lucarne_gauche).toBe(0.45);
    expect(BALANCE.rating.base).toBe(6.0);
    expect(BALANCE.desert).toMatchObject({ finishingMultiplier: 0.72, confidenceMalus: 12 });
    expect(BALANCE.adaptation).toMatchObject({ repetitionPenalty: 0.08, repetitionDecayMinutes: 20, scoutingAfterMatches: 5 });
    expect(BALANCE.reputation).toMatchObject({ maxPerInteraction: 5, maxPerDay: 12 });
  });

  it('compose bien toutes les sections des modules', () => {
    for (const section of [
      'bounds', 'creation', 'world', 'progression', 'fitness', 'injuries', 'marketValue', 'contracts',
      'caps', 'baseProbability', 'rating', 'seasonTargets', 'matchSim', 'situations', 'adaptation', 'desert',
      'coach', 'npcProgression', 'endOfSeason', 'reputation', 'calendar', 'career',
    ]) {
      expect(BALANCE, section).toHaveProperty(section);
    }
    const w = BALANCE.matchSim.strengthWeights;
    expect(w.attack + w.midfield + w.defense + w.goalkeeper).toBeCloseTo(1, 9);
  });
});

describe('FORMATIONS', () => {
  it('propose 8 formations de 11 postes valides, gardien en premier', () => {
    const names = Object.keys(FORMATIONS);
    expect(names).toHaveLength(8);
    for (const name of names) {
      const f = formation(name);
      expect(f.name).toBe(name);
      expect(f.slots).toHaveLength(11);
      expect(f.slots[0]).toBe('GB');
      expect(f.slots.filter((s) => s === 'GB')).toHaveLength(1);
      for (const s of f.slots) expect(POSITIONS).toContain(s);
      // Le nom « a-b-c » décrit les lignes hors gardien.
      const lines = name.split('-').map(Number);
      expect(lines.reduce((s, n) => s + n, 0)).toBe(10);
    }
    expect(() => formation('2-3-5')).toThrow();
  });
});
