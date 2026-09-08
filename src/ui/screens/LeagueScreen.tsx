import { useMemo, useState } from 'react';
import { useCareerStore } from '../../store/careerStore';
import {
  selectAllMatchdays, selectLeagueTable, selectMatchdayFixtures, selectPlayerClub, topAssists, topScorers,
} from '../../store/selectors';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';
import LeagueTable from '../components/LeagueTable';
import FixtureList from '../components/FixtureList';
import ScorersTable from '../components/ScorersTable';
import Button from '../components/Button';

/** Championnat (§13) : classement, calendrier/résultats par journée, buteurs et passeurs. */
export default function LeagueScreen() {
  const career = useCareerStore((s) => s.career);
  const club = career ? selectPlayerClub(career) : undefined;
  const leagueData = career ? selectLeagueTable(career) : undefined;
  const matchdays = career ? selectAllMatchdays(career) : [];
  const [matchday, setMatchday] = useState<number | undefined>(undefined);

  const currentMatchday = matchday ?? (career && leagueData ? career.season.leagues[leagueData.leagueId]?.currentMatchday || matchdays[0] : matchdays[0]);

  const fixtures = useMemo(() => (career && currentMatchday ? selectMatchdayFixtures(career, currentMatchday) : []), [career, currentMatchday]);

  if (!career || !club || !leagueData) return null;

  const league = career.world.leagues[leagueData.leagueId];
  const europeCount = league?.format.continentalSlots.length ?? 0;
  const relegationCount = league?.format.relegated ?? 0;
  const scorers = topScorers(career, leagueData.leagueId, 15);
  const assists = topAssists(career, leagueData.leagueId, 15);
  const nameOf = (id: string): string => {
    if (id === career.player.id) return `${career.player.identity.firstName} ${career.player.identity.lastName}`;
    const npc = career.world.npcPlayers[id];
    return npc ? `${npc.identity.firstName} ${npc.identity.lastName}` : id;
  };

  return (
    <div className="p-4 space-y-4">
      <Panel>
        <SectionTitle>{league?.name ?? 'Classement'}</SectionTitle>
        <LeagueTable table={leagueData.table} clubs={career.world.clubs} highlightClubId={club.id} europeCount={europeCount} relegationCount={relegationCount} />
      </Panel>

      <Panel>
        <SectionTitle
          right={
            <div className="flex gap-1">
              <Button variant="ghost" disabled={!currentMatchday || currentMatchday <= (matchdays[0] ?? 1)} onClick={() => setMatchday((currentMatchday ?? 1) - 1)}>
                ◀
              </Button>
              <span className="text-xs uppercase tracking-wide self-center">Journée {currentMatchday ?? '—'}</span>
              <Button
                variant="ghost"
                disabled={!currentMatchday || currentMatchday >= (matchdays[matchdays.length - 1] ?? 1)}
                onClick={() => setMatchday((currentMatchday ?? 1) + 1)}
              >
                ▶
              </Button>
            </div>
          }
        >
          Calendrier et résultats
        </SectionTitle>
        <FixtureList matches={fixtures} clubs={career.world.clubs} highlightClubId={club.id} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Meilleurs buteurs</SectionTitle>
          <ScorersTable rows={scorers} clubs={career.world.clubs} nameOf={nameOf} playerId={career.player.id} metric="goals" />
        </Panel>
        <Panel>
          <SectionTitle>Meilleurs passeurs</SectionTitle>
          <ScorersTable rows={assists} clubs={career.world.clubs} nameOf={nameOf} playerId={career.player.id} metric="assists" />
        </Panel>
      </div>
    </div>
  );
}
