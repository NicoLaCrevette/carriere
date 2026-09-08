import { useCareerStore } from '../../store/careerStore';
import { useUiStore } from '../../store/uiStore';
import { countryName } from '../../data/nationalities';
import { compareDates, formatDateFr } from '../../engine/calendar/dates';
import { canSwitchCountry, eligibleCountries, switchCountry } from '../../engine/national/eligibility';
import { countryStrength } from '../../engine/national/squads';
import { NATIONAL_STAGE_LABELS } from '../lib/labels';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';
import NumberTabular from '../components/NumberTabular';
import Button from '../components/Button';

const STAGE_HINTS: Record<string, string> = {
  aucun: 'Le sélectionneur ne te connaît pas encore. Il faut jouer, et bien.',
  espoirs: 'Suivi chez les Espoirs : la porte des A s\'ouvre avec des minutes et des notes régulières.',
  pre_liste: 'Sur la pré-liste : chaque trêve, le staff regarde tes derniers matchs.',
  convoque: 'Convoqué : un rassemblement à chaque trêve, des minutes à aller chercher.',
  titulaire: 'Titulaire en sélection.',
  cadre: 'Cadre de la sélection : on attend de toi que tu portes le groupe.',
  capitaine: 'Capitaine de la sélection.',
};

/** Sélection nationale (§9, §13) : statut, sélectionneur, matchs internationaux joués et à venir. */
export default function NationalScreen() {
  const career = useCareerStore((s) => s.career);
  const mutate = useCareerStore((s) => s.mutate);
  const openModal = useUiStore((s) => s.openModal);
  const toast = useUiStore((s) => s.toast);
  if (!career) return null;
  const national = career.national;
  const otherCountries = eligibleCountries(career.player).filter((c) => c !== national.countryCode);
  const switchable = canSwitchCountry(career) && otherCountries.length > 0;
  const confirmSwitch = (country: string) =>
    openModal({
      title: `Jouer pour ${countryName(country)}`,
      message: `Choisir ${countryName(country)} (force ${countryStrength(country)}) plutôt que ${countryName(national.countryCode)} (force ${countryStrength(national.countryCode)}) ? Le choix devient définitif dès ton premier match A.`,
      confirmLabel: 'Changer de sélection',
      onConfirm: () => {
        void mutate('Sélection', (c) => switchCountry(c, country)).then(() => toast({ kind: 'success', message: `Tu joueras pour ${countryName(country)}.` })).catch(() => undefined);
      },
    });
  const selectionneur = national.selectionneurId ? career.world.npcs[national.selectionneurId] : undefined;
  const international = Object.values(career.matches)
    .filter((m) => m.competitionId === 'international' && m.involvesPlayer)
    .sort((a, b) => compareDates(a.date, b.date));
  const upcoming = international.filter((m) => m.status !== 'joue');
  const played = international.filter((m) => m.status === 'joue').reverse().slice(0, 12);
  const nextBreak = career.season.internationalBreaks.find(([, end]) => end >= career.currentDate);
  const stageEvents = career.events.filter((e) => e.category === 'selection').sort((a, b) => compareDates(b.date, a.date)).slice(0, 6);

  return (
    <div className="p-4 space-y-4">
      <Panel>
        <SectionTitle right={national.lockedIn ? <span className="text-[11px] uppercase tracking-wide text-broadcast-grey">Sélection verrouillée</span> : null}>
          Sélection {countryName(national.countryCode)}
        </SectionTitle>
        <p className="font-display uppercase tracking-wide text-xl text-broadcast-yellow mb-1">{NATIONAL_STAGE_LABELS[national.stage]}</p>
        <p className="text-sm text-broadcast-grey mb-3">{STAGE_HINTS[national.stage]}</p>
        <div className="grid grid-cols-3 gap-4 text-sm max-w-sm">
          <Stat label="Sélections" value={national.caps} />
          <Stat label="Buts" value={national.goals} />
          <Stat label="Passes" value={national.assists} />
        </div>
        <ul className="mt-3 text-sm space-y-1 text-broadcast-grey">
          {selectionneur && <li>Sélectionneur : {selectionneur.firstName} {selectionneur.lastName}</li>}
          {national.firstCallOn && <li>Première convocation : {formatDateFr(national.firstCallOn)}</li>}
          {national.lastCallOn && <li>Dernière convocation : {formatDateFr(national.lastCallOn)}</li>}
          {nextBreak && <li>Prochaine trêve internationale : du {formatDateFr(nextBreak[0])} au {formatDateFr(nextBreak[1])}</li>}
          <li>Force de la sélection : {countryStrength(national.countryCode)} / 100</li>
        </ul>
        {switchable && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-broadcast-grey">Double nationalité : tu peux encore choisir.</span>
            {otherCountries.map((c) => (
              <Button key={c} variant="secondary" onClick={() => confirmSwitch(c)}>Jouer pour {countryName(c)}</Button>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Matchs à venir</SectionTitle>
          {upcoming.length === 0 ? (
            <p className="text-sm text-broadcast-grey">Aucun match international programmé pour toi.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {upcoming.map((m) => (
                <li key={m.id} className="flex justify-between border-b border-pitch-800 py-1">
                  <span>{career.world.clubs[m.homeClubId]?.name ?? m.homeClubId} – {career.world.clubs[m.awayClubId]?.name ?? m.awayClubId}</span>
                  <span className="text-broadcast-grey">{formatDateFr(m.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <SectionTitle>Matchs joués</SectionTitle>
          {played.length === 0 ? (
            <p className="text-sm text-broadcast-grey">Pas encore de match en sélection.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {played.map((m) => {
                const r = m.result!;
                const rep = r.playerReport;
                return (
                  <li key={m.id} className="flex justify-between border-b border-pitch-800 py-1">
                    <span>
                      {career.world.clubs[m.homeClubId]?.name ?? m.homeClubId} <span className="text-broadcast-yellow tabular-nums">{r.homeGoals}-{r.awayGoals}</span> {career.world.clubs[m.awayClubId]?.name ?? m.awayClubId}
                    </span>
                    <span className="text-broadcast-grey">{formatDateFr(m.date)}{rep ? ` · ${rep.minutesPlayed} min · note ${rep.rating.toFixed(1)}` : ''}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {stageEvents.length > 0 && (
        <Panel>
          <SectionTitle>Parcours en sélection</SectionTitle>
          <ul className="text-sm space-y-1">
            {stageEvents.map((e) => (
              <li key={e.id} className="border-b border-pitch-800 py-1">
                <span className="text-broadcast-grey">{formatDateFr(e.date)} · </span>{e.title}
                {typeof e.facts.raison === 'string' && <span className="text-broadcast-grey"> — {e.facts.raison}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-broadcast-grey">{label}</div>
      <NumberTabular value={value} className="text-lg" />
    </div>
  );
}
