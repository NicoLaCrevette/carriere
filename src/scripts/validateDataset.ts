/**
 * Valide un jeu de données complet ou un fichier de club isolé.
 *
 *   npx tsx src/scripts/validateDataset.ts src/data/leagues/real/ligue1-2026-27.json
 *   npx tsx src/scripts/validateDataset.ts --club src/data/leagues/real/clubs/psg.json
 *
 * Code de sortie 0 si valide, 1 sinon (erreurs listées).
 */
import { readFileSync } from 'node:fs';
import { DatasetClubSchema, DatasetFileSchema } from '../data/schema';

const args = process.argv.slice(2);
const clubMode = args.includes('--club');
const path = args.filter((a) => !a.startsWith('--'))[0];
if (!path) {
  console.error('usage : validateDataset.ts [--club] <fichier.json>');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(path, 'utf8'));
const result = clubMode ? DatasetClubSchema.safeParse(raw) : DatasetFileSchema.safeParse(raw);

if (!result.success) {
  console.error(`INVALIDE : ${path}`);
  for (const issue of result.error.issues.slice(0, 50)) {
    console.error(`  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`);
  }
  process.exit(1);
}

if (clubMode) {
  const club = result.data as import('../data/schema').DatasetClub;
  const byPos = new Map<string, number>();
  for (const p of club.players) byPos.set(p.position, (byPos.get(p.position) ?? 0) + 1);
  const avg = club.players.reduce((s, p) => s + p.overall, 0) / club.players.length;
  const top11 = [...club.players].sort((a, b) => b.overall - a.overall).slice(0, 11);
  const avgTop = top11.reduce((s, p) => s + p.overall, 0) / 11;
  console.log(`VALIDE : ${club.name} — ${club.players.length} joueurs, moyenne ${avg.toFixed(1)}, onze ${avgTop.toFixed(1)}`);
  console.log(`  postes : ${[...byPos.entries()].map(([k, v]) => `${k}×${v}`).join(' ')}`);
  console.log(`  coach : ${club.coach.firstName} ${club.coach.lastName} (${club.coach.formation}, ${club.coach.ability})`);
} else {
  const file = result.data as import('../data/schema').DatasetFile;
  const seen = new Map<string, string>();
  let dupes = 0;
  for (const club of file.clubs) {
    for (const p of club.players) {
      const key = `${p.firstName.toLowerCase()} ${p.lastName.toLowerCase()} ${p.birthDate}`;
      const prev = seen.get(key);
      if (prev && prev !== club.id) {
        console.warn(`  doublon : ${p.firstName} ${p.lastName} dans ${prev} et ${club.id}`);
        dupes++;
      }
      seen.set(key, club.id);
    }
  }
  console.log(`VALIDE : ${file.label} — ${file.leagues.length} ligue(s), ${file.clubs.length} clubs, ${seen.size} joueurs, ${dupes} doublon(s)`);
  for (const club of [...file.clubs].sort((a, b) => b.prestige - a.prestige)) {
    const top11 = [...club.players].sort((a, b) => b.overall - a.overall).slice(0, 11);
    const avgTop = top11.reduce((s, p) => s + p.overall, 0) / 11;
    console.log(`  ${club.code.padEnd(4)} ${club.name.padEnd(28)} prestige ${String(club.prestige).padStart(3)}  onze ${avgTop.toFixed(1)}  ${club.coach.firstName} ${club.coach.lastName}`);
  }
  if (dupes > 0) process.exit(1);
}
