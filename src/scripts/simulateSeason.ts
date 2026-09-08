/**
 * Simulation d'une carrière en console.
 *
 *   npm run sim -- --seed=1 --dataset=fictional --position=BU --age=18 --level=prometteur --difficulty=exigeant --seasons=1
 *   npm run sim -- --dataset=real --club=psg
 *
 * Options : --seed, --dataset=fictional|real|<chemin.json>, --position, --age, --level, --difficulty, --seasons, --club, --quiet
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseDataset, type DatasetFile } from '../data/schema';
import { runHeadlessSeason, type HeadlessSeasonSummary } from '../engine/sim/headless';
import type { DecisionRecord, Difficulty, Position, StartingLevel } from '../engine/types';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
  if (m) args.set(m[1]!, m[2] ?? 'true');
}
const quiet = args.get('quiet') === 'true';

function loadDataset(name: string): 'fictional' | DatasetFile {
  if (name === 'fictional') return 'fictional';
  const path = name === 'real' ? 'src/data/leagues/real/ligue1-2026-27.json' : name;
  if (!existsSync(path)) {
    console.error(`Jeu de données introuvable : ${path}`);
    process.exit(1);
  }
  return parseDataset(JSON.parse(readFileSync(path, 'utf8')));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function printSeason(s: HeadlessSeasonSummary, dataset: 'fictional' | DatasetFile): void {
  const names = new Map<string, string>();
  if (dataset !== 'fictional') for (const c of dataset.clubs) names.set(c.id, c.shortName);
  console.log(`\n═══ Saison ${s.label} — ${s.clubName} — ${s.durationMs} ms ═══`);
  console.log('\nClassement final :');
  s.table.forEach((r, i) => {
    const mark = r.clubId === s.clubId ? '►' : ' ';
    console.log(`${mark}${String(i + 1).padStart(2)}. ${(names.get(r.clubId) ?? r.clubId).padEnd(22)} ${String(r.points).padStart(3)} pts  ${String(r.won).padStart(2)}V ${String(r.drawn).padStart(2)}N ${String(r.lost).padStart(2)}D  ${String(r.goalsFor).padStart(3)}:${String(r.goalsAgainst).padEnd(3)} ${r.goalDifference >= 0 ? '+' : ''}${r.goalDifference}`);
  });
  console.log(`\nButs par match de ligue : ${(s.leagueGoals / Math.max(1, s.leagueMatches)).toFixed(2)} (${s.leagueGoals} buts, ${s.leagueMatches} matchs)`);
  console.log('\nMeilleurs buteurs :');
  s.scorers.slice(0, 8).forEach((r, i) => console.log(`  ${i + 1}. ${r.playerId.padEnd(24)} ${(names.get(r.clubId) ?? r.clubId).padEnd(14)} ${r.goals} buts, ${r.assists} passes, ${r.matches} matchs`));
  const p = s.player;
  console.log('\nJoueur :');
  console.log(`  ${p.matches} matchs (${p.starts} titularisations), ${p.minutes} min, ${p.goals} buts, ${p.assists} passes, ${p.shots} tirs, xG ${p.xG}, xA ${p.xA}`);
  console.log(`  note moyenne ${p.averageRating}, médiane ${median(p.ratings).toFixed(2)}, ≥ 7.5 : ${p.ratings.filter((r) => r >= 7.5).length}/${p.ratings.length}, ≥ 9 : ${p.ratings.filter((r) => r >= 9).length}, homme du match ${p.motm}, sorti pour mauvais match ${p.subbedOffBad}, cartons ${p.yellowCards}J/${p.redCards}R`);
  const distribution = [3, 4, 5, 6, 7, 8, 9].map((b) => `${b}-${b + 1}: ${p.ratings.filter((r) => r >= b && r < b + 1).length}`).join('  ');
  console.log(`  distribution des notes : ${distribution}`);
  console.log(`  note globale ${s.overallStart} → ${s.overallEnd} (${s.age} ans), confiance du coach ${s.coachTrustEnd}, valeur ${Math.round(s.marketValueEnd / 1000)} k€`);
  const gains = (Object.keys(s.attributesEnd) as (keyof typeof s.attributesEnd)[])
    .map((k) => [k, s.attributesEnd[k] - s.attributesStart[k]] as const)
    .filter(([, d]) => d !== 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, d]) => `${k} ${d > 0 ? '+' : ''}${d}`)
    .join(', ');
  console.log(`  progression : ${gains || 'aucune'}`);
  console.log(`  blessures : ${s.injuries.length > 0 ? s.injuries.map((i) => `${i.type} ${i.days} j (${i.origin})`).join(', ') : 'aucune'}`);
  console.log(`  traversées du désert : ${s.desertsScheduled} programmée(s), ${s.desertMatches} match(s) subi(s)`);
}

const dataset = loadDataset(args.get('dataset') ?? 'fictional');
let debugMatches = Number(args.get('debug') ?? 0);

function printDecision(d: DecisionRecord): void {
  const mods = Object.entries(d.outcome.modifiers)
    .filter(([k]) => k !== 'final' && k !== 'plafond')
    .map(([k, v]) => `${k} ${typeof v === 'number' ? v.toFixed(2) : v}`)
    .join(' ');
  console.log(`    ${String(d.minute).padStart(3)}' ${d.kind.padEnd(24)} ${d.classified.action.padEnd(22)} r=${d.classified.risque.toFixed(2)} p=${d.outcome.probability.toFixed(3)} roll=${d.outcome.roll.toFixed(3)} → ${d.outcome.kind.padEnd(18)} note ${d.outcome.ratingDelta >= 0 ? '+' : ''}${d.outcome.ratingDelta.toFixed(2)} | ${mods}`);
}

const result = runHeadlessSeason({
  seed: Number(args.get('seed') ?? 1),
  dataset,
  position: (args.get('position') ?? 'BU') as Position,
  age: Number(args.get('age') ?? 18),
  level: (args.get('level') ?? 'prometteur') as StartingLevel,
  difficulty: (args.get('difficulty') ?? 'exigeant') as Difficulty,
  seasons: Number(args.get('seasons') ?? 1),
  clubId: args.get('club'),
  offerPolicy: args.get('offers') === 'ambitieux' ? 'ambitieux' : 'ignorer',
  onDay: (day, state) => {
    const report = day.matchResult?.playerReport;
    if (debugMatches <= 0 || !report || report.minutesPlayed <= 0) return;
    debugMatches--;
    console.log(`\n── Match ${day.date} : ${day.matchResult!.homeGoals}-${day.matchResult!.awayGoals}, ${report.started ? 'titulaire' : `entré ${report.subbedOnMinute}'`}, ${report.minutesPlayed} min, note ${report.rating}, ${report.stats.shots} tirs, ${report.stats.goals} buts, xG ${report.stats.xG} | fitness après match ${Math.round(state.player.fitness)}, forme ${state.player.form.toFixed(1)}, confiance coach ${state.player.coachTrust}`);
    for (const d of report.decisions) printDecision(d);
    for (const line of day.matchResult!.summaryLines) console.log(`    ${line.text}`);
    for (const r of report.ratingLog) console.log(`    note ${r.minute}' ${r.delta >= 0 ? '+' : ''}${r.delta} ${r.reason}`);
  },
});

if (!quiet) for (const s of result.seasons) printSeason(s, dataset);

// Profondeur (Phase 6) : ce que la carrière a produit hors terrain.
{
  const st = result.state;
  const clubName = (id: string): string => st.world.clubs[id]?.shortName ?? id;
  const byStatus = new Map<string, number>();
  for (const o of st.offers) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  console.log('\nProfondeur :');
  console.log(`  offres reçues : ${st.offers.length}${st.offers.length > 0 ? ` (${[...byStatus].map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`);
  console.log(`  transferts : ${st.transfers.length > 0 ? st.transfers.map((t) => `${t.date} ${clubName(t.fromClubId)} → ${clubName(t.toClubId)} ${t.loan ? 'prêt' : `${Math.round(t.fee / 1000)} k€`}${t.requested ? ' (demandé)' : ''}`).join(' ; ') : 'aucun'}`);
  console.log(`  contrat : ${clubName(st.player.contract.clubId)} jusqu'au ${st.player.contract.endsOn}, ${Math.round(st.player.contract.wageMonthly / 1000)} k€/mois, rôle ${st.player.contract.promisedRole}`);
  console.log(`  sponsors : ${st.sponsors.length > 0 ? st.sponsors.map((d) => `${d.brand} ${Math.round(d.amountYearly / 1000)} k€/an (${d.status ?? 'active'})`).join(', ') : 'aucun'}`);
  const e = st.player.earnings;
  if (e) console.log(`  revenus cumulés : salaires ${Math.round(e.wagesTotal / 1000)} k€, primes ${Math.round(e.bonusesTotal / 1000)} k€, sponsors ${Math.round(e.sponsorsTotal / 1000)} k€`);
  console.log(`  traits : ${st.player.traits.length > 0 ? st.player.traits.map((t) => `${t.label} (${t.acquiredOn})`).join(', ') : 'aucun'}`);
  console.log(`  sélection ${st.national.countryCode} : ${st.national.stage}, ${st.national.caps} sélections, ${st.national.goals} buts${st.national.lockedIn ? ', verrouillée' : ''}`);
  console.log(`  événements : ${st.events.length} (${st.events.filter((x) => !x.resolved).length} ouverts) ; storylines : ${st.storylines.length} (${st.storylines.filter((x) => x.status === 'ouverte').length} ouvertes) ; promesses : ${st.promises.length}`);
  const coachChanges = st.log.filter((l) => /entraîneur|coach/i.test(l.text) && /licenci|nouvel|remplac/i.test(l.text)).length;
  console.log(`  changements d'entraîneur : ${coachChanges} ; réputation club ${Math.round(st.reputation.club.value)}, supporters ${Math.round(st.reputation.supporters.value)}, ligue ${Math.round(st.reputation.league.value)}, monde ${Math.round(st.reputation.world.value)}`);
  const errors = st.log.filter((l) => l.category === 'systeme' && /^Erreur/.test(l.text));
  if (errors.length > 0) console.log(`  ERREURS journalisées : ${errors.length} — ${errors.slice(0, 3).map((l) => `${l.date} ${l.text}`).join(' | ')}`);
}
console.log(`\nDurée totale ${result.durationMs} ms — empreinte ${result.hash}`);
