/**
 * Registre des jeux de données (§1, §2) : intégrés (réel, fictif) et importés
 * par l'utilisateur (Dexie). Le fichier réel peut être absent (livré par un
 * autre chantier) : `import.meta.glob` ne casse jamais le build s'il manque,
 * contrairement à un import dynamique littéral.
 */
import type { DatasetFile } from './schema';
import { parseDataset } from './schema';
import { generateFictionalDataset } from '../engine/world/loadDataset';
import { db } from '../db/db';

export interface DatasetEntry {
  id: string;
  label: string;
  realNames: boolean;
  referenceSeason: string;
  load(): Promise<DatasetFile>;
}

// Résolu au build par Vite ; vide (sans erreur) si le fichier n'existe pas encore.
const REAL_DATASET_MODULES = import.meta.glob<{ default: unknown }>('./leagues/real/ligue1-2026-27.json');

async function loadRealDataset(): Promise<DatasetFile> {
  const key = Object.keys(REAL_DATASET_MODULES)[0];
  if (!key) throw new Error('Jeu de données réel indisponible pour le moment.');
  const mod = await REAL_DATASET_MODULES[key]!();
  return parseDataset(mod.default);
}

let realAvailableCache: boolean | undefined;
async function isRealDatasetAvailable(): Promise<boolean> {
  if (realAvailableCache !== undefined) return realAvailableCache;
  try {
    await loadRealDataset();
    realAvailableCache = true;
  } catch {
    realAvailableCache = false;
  }
  return realAvailableCache;
}

const REAL_ENTRY: DatasetEntry = {
  id: 'ligue1-2026-27-reel',
  label: 'Ligue 1 2026-27 (noms réels)',
  realNames: true,
  referenceSeason: '2026-27',
  load: loadRealDataset,
};

let fictionalCache: DatasetFile | undefined;
const FICTIONAL_ENTRY: DatasetEntry = {
  id: 'ligue1-fictif',
  label: 'Ligue 1 fictive',
  realNames: false,
  referenceSeason: '2026-27',
  load: async () => {
    if (!fictionalCache) fictionalCache = generateFictionalDataset(42);
    return fictionalCache;
  },
};

/** Jeux intégrés : réel (par défaut) puis fictif. L'écran doit vérifier `listDatasets()` pour masquer le réel absent. */
export const BUILTIN_DATASETS: DatasetEntry[] = [REAL_ENTRY, FICTIONAL_ENTRY];

/** Jeux disponibles : intégrés (réel masqué si absent) puis importés (Dexie), du plus récent au plus ancien. */
export async function listDatasets(): Promise<DatasetEntry[]> {
  const out: DatasetEntry[] = [];
  if (await isRealDatasetAvailable()) out.push(REAL_ENTRY);
  out.push(FICTIONAL_ENTRY);
  const imported = await db.datasets.orderBy('importedAt').reverse().toArray();
  for (const row of imported) {
    out.push({
      id: row.id,
      label: `${row.label} (import)`,
      // Les jeux importés avant l'ajout de ces colonnes n'ont pas l'information : repli honnête.
      realNames: row.realNames ?? true,
      referenceSeason: row.referenceSeason ?? '—',
      load: async () => parseDataset(JSON.parse(row.json)),
    });
  }
  return out;
}

/** Valide puis stocke un jeu de données importé par l'utilisateur (Réglages). */
export async function importUserDataset(json: string): Promise<DatasetEntry> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Fichier JSON illisible.');
  }
  const parsed = parseDataset(raw);
  const id = `import-${parsed.id}-${Date.now()}`;
  await db.datasets.put({
    id, label: parsed.label, json: JSON.stringify(parsed), importedAt: new Date().toISOString(),
    realNames: parsed.realNames, referenceSeason: parsed.referenceSeason,
  });
  return {
    id,
    label: `${parsed.label} (import)`,
    realNames: parsed.realNames,
    referenceSeason: parsed.referenceSeason,
    load: async () => parsed,
  };
}
