import { BALANCE } from '../engine/config/balance';
import { runHeadlessSeason } from '../engine/sim/headless';

const N = Number(process.env.N ?? 24);
const penalite = Number(process.env.PEN ?? 16);
(BALANCE.coach.lineup.playerTrust as { maxPenalty: number }).maxPenalty = penalite;

let titulaires = 0;
const notes: number[] = [];
const titularisations: number[] = [];
const buts: number[] = [];
for (let seed = 1; seed <= N; seed++) {
  const r = runHeadlessSeason({ seed, dataset: 'fictional', position: 'BU', age: 18, level: 'prometteur', difficulty: 'exigeant', seasons: 8 });
  if (r.seasons.some((s) => s.player.starts >= 10)) titulaires += 1;
  notes.push(r.seasons[r.seasons.length - 1]!.overallEnd);
  titularisations.push(r.seasons.reduce((n, s) => n + s.player.starts, 0));
  buts.push(r.seasons.reduce((n, s) => n + s.player.goals, 0));
}
const moy = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
console.log(`malus=${penalite} n=${N} → titulaires ${titulaires}/${N} (${Math.round((titulaires / N) * 100)} %) · note finale ${moy(notes).toFixed(1)} · titularisations/carrière ${moy(titularisations).toFixed(0)} · buts/carrière ${moy(buts).toFixed(0)}`);
