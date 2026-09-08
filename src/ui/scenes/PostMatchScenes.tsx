/**
 * Après un match du joueur : titres de presse du lendemain et scènes
 * déclenchées par la performance (flash, conférence, vestiaire).
 */
import { useEffect } from 'react';
import type { DayResult } from '../../engine/types';
import { useCareerStore } from '../../store/careerStore';
import { useSceneStore } from '../../store/sceneStore';
import ScenePanel from './ScenePanel';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';

const TONE_CLASSES: Record<string, string> = {
  elogieux: 'text-signal-green',
  neutre: 'text-white',
  critique: 'text-signal-red',
  moqueur: 'text-signal-red',
};

export default function PostMatchScenes({ day }: { day: DayResult }) {
  const career = useCareerStore((s) => s.career);
  const proposeAfterMatch = useSceneStore((s) => s.proposeAfterMatch);
  const pressAfterMatch = useSceneStore((s) => s.pressAfterMatch);
  const matchId = day.matchId;
  const hasReport = !!day.matchResult?.playerReport;

  useEffect(() => {
    if (!matchId || !hasReport) return;
    proposeAfterMatch(day);
    void pressAfterMatch(matchId);
    // Les propositions ne dépendent que du match du jour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, hasReport]);

  if (!career || !matchId) return null;
  const report = career.matches[matchId]?.result?.playerReport;
  const headlines = report?.headlines ?? [];

  return (
    <>
      {headlines.length > 0 && (
        <Panel>
          <SectionTitle>La presse du lendemain</SectionTitle>
          <ul className="space-y-1">
            {headlines.map((h, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <span className="w-28 shrink-0 text-[10px] uppercase tracking-wide text-muted">{h.outlet}</span>
                <span className={`font-display uppercase tracking-wide ${TONE_CLASSES[h.tone] ?? 'text-white'}`}>« {h.title} »</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <ScenePanel filter="match" title="Après le match" />
    </>
  );
}
