import type { Club, Id, TableRow } from '../../engine/types';
import NumberTabular from './NumberTabular';

interface LeagueTableProps {
  table: TableRow[];
  clubs: Record<Id, Club>;
  highlightClubId?: Id;
  europeCount?: number;
  relegationCount?: number;
}

const RESULT_COLOR: Record<'V' | 'N' | 'D', string> = {
  V: 'text-broadcast-green',
  N: 'text-broadcast-grey',
  D: 'text-broadcast-red',
};

/** Classement complet (§13), club du joueur surligné, zones Europe/relégation marquées. */
export default function LeagueTable({ table, clubs, highlightClubId, europeCount = 0, relegationCount = 0 }: LeagueTableProps) {
  const total = table.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-broadcast-grey border-b border-pitch-700">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Club</th>
            <th className="py-1 px-1 text-right">J</th>
            <th className="py-1 px-1 text-right">G</th>
            <th className="py-1 px-1 text-right">N</th>
            <th className="py-1 px-1 text-right">P</th>
            <th className="py-1 px-1 text-right">BP</th>
            <th className="py-1 px-1 text-right">BC</th>
            <th className="py-1 px-1 text-right">Diff.</th>
            <th className="py-1 px-1 text-right">Pts</th>
            <th className="py-1 pl-2">Forme</th>
          </tr>
        </thead>
        <tbody>
          {table.map((row, i) => {
            const rank = i + 1;
            const isHighlight = row.clubId === highlightClubId;
            const zone = rank <= europeCount ? 'border-l-2 border-broadcast-blue' : rank > total - relegationCount ? 'border-l-2 border-broadcast-red' : 'border-l-2 border-transparent';
            return (
              <tr
                key={row.clubId}
                className={`border-b border-pitch-800 ${zone} ${isHighlight ? 'bg-broadcast-yellow/10 text-broadcast-yellow' : ''}`}
              >
                <td className="py-1 pr-2 pl-2 tabular-nums">{rank}</td>
                <td className="py-1 pr-2 font-display uppercase tracking-wide">{clubs[row.clubId]?.shortName ?? row.clubId}</td>
                <td className="py-1 px-1 text-right"><NumberTabular value={row.played} /></td>
                <td className="py-1 px-1 text-right"><NumberTabular value={row.won} /></td>
                <td className="py-1 px-1 text-right"><NumberTabular value={row.drawn} /></td>
                <td className="py-1 px-1 text-right"><NumberTabular value={row.lost} /></td>
                <td className="py-1 px-1 text-right"><NumberTabular value={row.goalsFor} /></td>
                <td className="py-1 px-1 text-right"><NumberTabular value={row.goalsAgainst} /></td>
                <td className="py-1 px-1 text-right"><NumberTabular value={row.goalDifference} /></td>
                <td className="py-1 px-1 text-right font-semibold"><NumberTabular value={row.points} /></td>
                <td className="py-1 pl-2">
                  <span className="flex gap-0.5">
                    {row.last5.map((r, j) => (
                      <span key={j} className={`text-[10px] font-display ${RESULT_COLOR[r]}`}>
                        {r}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
