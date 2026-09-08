/**
 * Assemble le jeu de données réel Ligue 1 2026-27 à partir des fichiers de club.
 *
 *   npx tsx src/scripts/assembleRealDataset.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatasetFile } from '../data/schema';

const here = dirname(fileURLToPath(import.meta.url));
const CLUBS_DIR = join(here, '../data/leagues/real/clubs');
const OUT_PATH = join(here, '../data/leagues/real/ligue1-2026-27.json');

const CLUB_ORDER = [
  'psg', 'marseille', 'lyon', 'monaco', 'lille', 'lens', 'rennes', 'nice',
  'strasbourg', 'toulouse', 'brest', 'auxerre', 'paris_fc', 'le_havre',
  'lorient', 'angers', 'troyes', 'le_mans',
];

function main() {
  const files = readdirSync(CLUBS_DIR).filter((f) => f.endsWith('.json'));
  const byId = new Map<string, any>();
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(CLUBS_DIR, f), 'utf8'));
    byId.set(raw.id, raw);
  }

  const missing = CLUB_ORDER.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`Fichiers de club manquants : ${missing.join(', ')}`);
  }

  const clubs = CLUB_ORDER.map((id) => byId.get(id));

  const dataset: DatasetFile = {
    id: 'ligue1-2026-27',
    label: "Ligue 1 2026-27 (noms réels)",
    realNames: true,
    referenceSeason: '2026-27',
    source: 'recherche web + connaissances, à vérifier',
    asOf: '2026-09-06',
    leagues: [
      {
        id: 'ligue1',
        name: "Ligue 1 McDonald's",
        shortName: 'Ligue 1',
        country: 'FRA',
        tier: 1,
        prestige: 78,
        clubIds: CLUB_ORDER,
        format: {
          teams: 18,
          rounds: 2,
          pointsWin: 3,
          pointsDraw: 1,
          promoted: 2,
          relegated: 2,
          playoffSlots: 1,
          continentalSlots: ['ldc', 'ldc', 'ldc', 'ldc_barrage', 'le', 'conf'],
        },
      },
    ],
    clubs,
  } as unknown as DatasetFile;

  writeFileSync(OUT_PATH, JSON.stringify(dataset, null, 2) + '\n', 'utf8');
  console.log(`Écrit : ${OUT_PATH}`);
  console.log(`Clubs : ${clubs.length}`);
}

main();
