/**
 * Traduit la décomposition d'une action (`ActionOutcome.modifiers`) en phrases
 * lisibles : « pourquoi j'ai raté ».
 *
 * Le moteur calcule déjà tout — probabilité de base, distance, densité,
 * attributs, fatigue, pression, adversaire, plafond — mais ne le disait à
 * personne. Sans cette lecture, rater une frappe ressemble à de l'arbitraire ;
 * avec elle, on voit qu'on a tiré de 22 mètres, sous pression, en fin de match.
 *
 * Ne calcule rien : ne fait que nommer et trier ce que le moteur a produit.
 */
import type { ActionOutcome } from '../../engine/types';

/** Nom lisible de chaque modificateur, et ce qu'il faut comprendre quand il pénalise. */
const LABELS: Record<string, { label: string; quandCaGene: string }> = {
  base: { label: 'Difficulté de l’action', quandCaGene: 'l’action est difficile en soi' },
  distance: { label: 'Distance', quandCaGene: 'la frappe partait de loin' },
  densite: { label: 'Adversaires dans la zone', quandCaGene: 'la zone était fermée' },
  attributs: { label: 'Tes attributs', quandCaGene: 'tu n’as pas encore le niveau sur ce geste' },
  zone: { label: 'Zone visée', quandCaGene: 'tu as visé une zone difficile' },
  risque: { label: 'Prise de risque', quandCaGene: 'tu as tenté quelque chose de risqué' },
  fatigue: { label: 'Fraîcheur', quandCaGene: 'tu étais émoussé' },
  forme: { label: 'Forme du moment', quandCaGene: 'tu traverses une mauvaise passe' },
  pression: { label: 'Pression', quandCaGene: 'le moment était lourd' },
  confiance: { label: 'Confiance', quandCaGene: 'tu doutes en ce moment' },
  adversaire: { label: 'Adversaire direct', quandCaGene: 'tu avais un bon joueur en face' },
  repetition: { label: 'Action répétée', quandCaGene: 'ils t’attendaient, tu venais de le faire' },
  marquage: { label: 'Marquage individuel', quandCaGene: 'ils te collent, ta réputation attire' },
  scouting: { label: 'Ils t’ont étudié', quandCaGene: 'ton geste favori est scouté' },
  desert: { label: 'Passage à vide', quandCaGene: 'tu traverses un désert' },
  trait: { label: 'Trait de caractère', quandCaGene: 'un de tes traits te dessert ici' },
  difficulte: { label: 'Difficulté de la carrière', quandCaGene: 'la difficulté choisie te pénalise' },
  enchainement: { label: 'Enchaînement', quandCaGene: '' },
  coteDevine: { label: 'Côté deviné', quandCaGene: 'le gardien a lu ton côté' },
  duelsEnchaines: { label: 'Duels enchaînés', quandCaGene: 'tu as voulu éliminer plusieurs joueurs' },
  impossible: { label: 'Action impossible ici', quandCaGene: 'ce geste n’était pas jouable dans cette situation' },
};

/** Clés qui ne sont pas des multiplicateurs mais des valeurs de sortie. */
const NON_MULTIPLICATEURS = new Set(['final', 'plafond', 'base', 'impossible']);

export interface FacteurLisible {
  key: string;
  label: string;
  /** Multiplicateur appliqué (0.82 = −18 %). */
  effet: number;
  /** Variation en points de pourcentage relatifs, arrondie (−18). */
  pourcent: number;
  aide: boolean;
  explication: string;
}

export interface ExplicationAction {
  /** Probabilité finale, 0-1. */
  probabilite: number;
  /** Tirage qui a décidé, 0-1. Réussi si tirage < probabilité. */
  tirage: number;
  /** Probabilité de base de l'action avant tout ce qui dépend du joueur. */
  base?: number;
  /** Vrai si un plafond du §6 a bridé la probabilité. */
  plafonne: boolean;
  /** Facteurs triés du plus pénalisant au plus favorable. */
  facteurs: FacteurLisible[];
  /** Les trois qui ont le plus pénalisé. */
  pires: FacteurLisible[];
  /** Une phrase qui résume, pour la lire à voix haute ou l'afficher seule. */
  resume: string;
}

const SEUIL = 0.02; // en dessous de 2 % d'effet, ce n'est pas la peine d'en parler.

export function expliquerAction(outcome: ActionOutcome): ExplicationAction {
  const mods = outcome.modifiers ?? {};
  const facteurs: FacteurLisible[] = [];
  for (const [key, valeur] of Object.entries(mods)) {
    if (NON_MULTIPLICATEURS.has(key) || !Number.isFinite(valeur)) continue;
    if (Math.abs(valeur - 1) < SEUIL) continue;
    const meta = LABELS[key];
    facteurs.push({
      key,
      label: meta?.label ?? key,
      effet: valeur,
      pourcent: Math.round((valeur - 1) * 100),
      aide: valeur > 1,
      explication: meta?.quandCaGene ?? '',
    });
  }
  facteurs.sort((a, b) => a.effet - b.effet);

  const probabilite = mods.final ?? outcome.probability;
  const plafond = mods.plafond;
  const plafonne = plafond !== undefined && probabilite >= plafond - 1e-6 && plafond < 1;
  const pires = facteurs.filter((f) => !f.aide).slice(0, 3);

  return {
    probabilite,
    tirage: outcome.roll,
    ...(mods.base !== undefined ? { base: mods.base } : {}),
    plafonne,
    facteurs,
    pires,
    resume: resumer(probabilite, outcome.roll < probabilite, pires, plafonne),
  };
}

/**
 * La même décomposition se lit différemment selon l'issue : ce qui pénalisait
 * explique un échec, mais rend une réussite méritante. Dire « tu as raté parce
 * que » sur un but réussi n'aurait aucun sens.
 */
function resumer(probabilite: number, reussi: boolean, pires: FacteurLisible[], plafonne: boolean): string {
  const pct = `${Math.round(probabilite * 100)} %`;
  if (pires.length === 0) {
    if (plafonne) return `${pct} de réussite : c'est le maximum que ce geste puisse offrir.`;
    return reussi ? `${pct} de réussite, et c'est passé.` : `${pct} de réussite. Rien ne te pénalisait : c'est le tirage.`;
  }
  const raisons = pires.map((f) => f.explication).filter(Boolean);
  const liste = raisons.length > 1 ? `${raisons.slice(0, -1).join(', ')} et ${raisons.at(-1)}` : raisons[0];
  if (!liste) return `${pct} de réussite.`;
  return reussi
    ? `${pct} de réussite seulement, et pourtant c'est passé : ${liste}.`
    : `${pct} de réussite : ${liste}.`;
}

/** « 62 % » ou « 8 % », sans décimale inutile. */
export function pourcentage(p: number): string {
  const v = p * 100;
  return `${v < 1 && v > 0 ? v.toFixed(1) : Math.round(v)} %`;
}
