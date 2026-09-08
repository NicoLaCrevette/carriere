/**
 * Génère le jeu de données fictif (18 clubs français inventés, sans droits) et
 * l'écrit dans `src/data/leagues/fictional/ligue1.json`.
 *
 *   npx tsx src/scripts/generateFictional.ts
 *   npx tsx src/scripts/validateDataset.ts src/data/leagues/fictional/ligue1.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFictionalDataset } from '../engine/world/loadDataset';

const SEED = 42;

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'data', 'leagues', 'fictional', 'ligue1.json');

const dataset = generateFictionalDataset(SEED);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

console.log(`Écrit : ${outPath}`);
console.log(`  ${dataset.clubs.length} clubs, ${dataset.clubs.reduce((n, c) => n + c.players.length, 0)} joueurs.`);
