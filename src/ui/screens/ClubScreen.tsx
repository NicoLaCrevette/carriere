import type { Coach } from '../../engine/types';
import { useCareerStore } from '../../store/careerStore';
import { selectPlayerClub, selectPositionHierarchy, selectSquadByPosition } from '../../store/selectors';
import { POSITION_LABELS } from '../../engine/config/positions';
import { SQUAD_STATUS_LABELS } from '../lib/labels';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';
import SquadList from '../components/SquadList';
import Gauge from '../components/Gauge';
import NumberTabular from '../components/NumberTabular';

/** Club (§13) : effectif par poste, hiérarchie au poste du joueur, coach et confiance, moral d'équipe. */
export default function ClubScreen() {
  const career = useCareerStore((s) => s.career);
  if (!career) return null;
  const club = selectPlayerClub(career);
  if (!club) return null;

  const byPosition = selectSquadByPosition(career);
  const hierarchy = selectPositionHierarchy(career);
  const coachNpc = career.world.npcs[club.coachId];
  const coach = coachNpc && coachNpc.kind === 'coach' ? (coachNpc as Coach) : undefined;

  return (
    <div className="p-4 space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle>{club.name}</SectionTitle>
          <p className="text-sm text-muted mb-2">
            {club.city} · Prestige {club.prestige} · {club.stadium.name} ({club.stadium.capacity.toLocaleString('fr-FR')} places)
          </p>
          <Gauge label="Moral de l'équipe" value={club.teamMorale} />
        </Panel>
        <Panel>
          <SectionTitle>Coach</SectionTitle>
          {coach ? (
            <>
              <p className="font-display uppercase tracking-wide">{coach.firstName} {coach.lastName}</p>
              <p className="text-xs text-muted mb-2">{club.tactic.formation} · {club.tactic.mentality.replace(/_/g, ' ')}</p>
              <Gauge label="Confiance envers toi" value={career.player.coachTrust} />
            </>
          ) : (
            <p className="text-sm text-muted">Coach inconnu.</p>
          )}
          <p className="text-sm mt-2">
            Statut : <NumberTabular value={SQUAD_STATUS_LABELS[career.player.squadStatus]} />
          </p>
        </Panel>
      </div>

      <Panel>
        <SectionTitle>Hiérarchie au poste ({POSITION_LABELS[career.player.identity.position]})</SectionTitle>
        {hierarchy.length === 0 ? (
          <p className="text-sm text-muted">Hiérarchie non encore établie.</p>
        ) : (
          <ol className="space-y-1 text-sm list-decimal list-inside">
            {hierarchy.map((p) => (
              <li key={p.id} className={p.id === career.player.id ? 'text-accent' : ''}>
                {p.identity.firstName} {p.identity.lastName} — <NumberTabular value={p.overall} />
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel>
        <SectionTitle>Effectif</SectionTitle>
        <SquadList byPosition={byPosition} playerId={career.player.id} asOf={career.currentDate} {...(club ? { couleurs: club.colors } : {})} />
      </Panel>
    </div>
  );
}
