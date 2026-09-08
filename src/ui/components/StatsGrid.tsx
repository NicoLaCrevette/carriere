import type { Stats } from '../../engine/types';
import NumberTabular from './NumberTabular';

interface StatsGridProps {
  stats: Stats;
  goalkeeper?: boolean;
}

function pct(a: number, b: number): string {
  return b > 0 ? `${Math.round((a / b) * 100)} %` : '—';
}

/** Statistiques complètes de fin de match (§5.6). */
export default function StatsGrid({ stats, goalkeeper }: StatsGridProps) {
  const items: { label: string; value: string | number }[] = [
    { label: 'Buts', value: stats.goals },
    { label: 'Passes décisives', value: stats.assists },
    { label: 'Tirs', value: stats.shots },
    { label: 'Tirs cadrés', value: stats.shotsOnTarget },
    { label: 'xG', value: stats.xG.toFixed(2) },
    { label: 'xA', value: stats.xA.toFixed(2) },
    { label: 'Dribbles', value: `${stats.dribblesCompleted} / ${stats.dribblesAttempted}` },
    { label: 'Duels gagnés', value: `${stats.duelsWon} / ${stats.duelsTotal}` },
    { label: 'Ballons touchés', value: stats.touches },
    { label: 'Passes réussies', value: pct(stats.passesCompleted, stats.passesAttempted) },
    { label: 'Hors-jeu', value: stats.offsides },
    { label: 'Distance', value: `${stats.distanceKm.toFixed(1)} km` },
    { label: 'Sprints', value: stats.sprints },
  ];
  if (goalkeeper) {
    items.push(
      { label: 'Arrêts', value: stats.saves },
      { label: 'Buts encaissés', value: stats.goalsConceded },
      { label: 'Clean sheets', value: stats.cleanSheets },
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 text-sm">
      {items.map((it) => (
        <div key={it.label} className="flex justify-between border-b border-pitch-800 pb-1">
          <dt className="text-broadcast-grey">{it.label}</dt>
          <dd className="font-semibold">
            <NumberTabular value={it.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
