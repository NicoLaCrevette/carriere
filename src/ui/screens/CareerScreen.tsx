import { useCareerStore } from '../../store/careerStore';
import { useUiStore } from '../../store/uiStore';
import { formatDateFrShort } from '../../engine/calendar/dates';
import { canRetire, careerSummary, retire } from '../../engine/career/retirement';
import { activeSponsors, dealStatus, respondToSponsor } from '../../engine/career/sponsors';
import { formatEuros, humanize } from '../lib/labels';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';
import ValueChart from '../components/ValueChart';
import StatsGrid from '../components/StatsGrid';
import NumberTabular from '../components/NumberTabular';
import Button from '../components/Button';
import CareerSummaryPanel from '../components/CareerSummaryPanel';
import CareerJournalPanel from '../components/CareerJournalPanel';
import TransferOffersPanel from '../components/TransferOffersPanel';

const SPONSOR_KIND_LABELS: Record<string, string> = {
  equipementier: 'Équipementier', marque: 'Marque', jeu_video: 'Jeu vidéo', boisson: 'Boisson', automobile: 'Automobile', autre: 'Autre',
};

/** Carrière/Transferts (§13, §11) : valeur, contrat, transferts, sponsors et revenus, retraite. */
export default function CareerScreen() {
  const career = useCareerStore((s) => s.career);
  const mutate = useCareerStore((s) => s.mutate);
  const busy = useCareerStore((s) => s.busy);
  const openModal = useUiStore((s) => s.openModal);
  const toast = useUiStore((s) => s.toast);
  if (!career) return null;
  const player = career.player;
  const isGoalkeeper = player.identity.position === 'GB';
  const proposals = career.sponsors.filter((d) => dealStatus(d) === 'proposee');
  const active = activeSponsors(career);
  const earnings = player.earnings;

  const answerSponsor = async (dealId: string, decision: 'accepter' | 'refuser' | 'negocier') => {
    try {
      const { outcome, deal } = await mutate('Sponsor', (c) => respondToSponsor(c, dealId, decision));
      const message = outcome === 'accepte'
        ? `Contrat signé avec ${deal.brand} : ${formatEuros(deal.amountYearly)} par an.`
        : outcome === 'contre_offre'
          ? `${deal.brand} monte à ${formatEuros(deal.amountYearly)} par an. À toi de signer.`
          : `${deal.brand} se retire.`;
      toast({ kind: outcome === 'refuse' ? 'info' : 'success', message });
    } catch {
      // L'erreur est affichée par le store.
    }
  };

  /** Export du palmarès (§13, Phase 7) : bilan, saisons, transferts, traits, en JSON lisible. */
  const exportPalmares = () => {
    const summary = careerSummary(career);
    const data = {
      joueur: `${player.identity.firstName} ${player.identity.lastName}`,
      exporteLe: career.currentDate,
      bilan: summary,
      saisons: career.pastSeasons.map((s) => ({
        saison: s.label,
        club: career.world.clubs[s.clubId]?.name ?? s.clubId,
        classement: s.leagueRank,
        matchs: s.stats.total.matches,
        buts: s.stats.total.goals,
        passes: s.stats.total.assists,
        noteMoyenne: s.averageRating,
        trophees: s.trophies,
        recompenses: s.awards,
        selections: s.nationalCaps,
        resume: s.narrativeSummary,
      })),
      transferts: career.transfers,
      traits: player.traits.map((t) => ({ id: t.id, label: t.label, depuis: t.acquiredOn, origine: t.origin })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `palmares-${player.identity.lastName.toLowerCase()}-${career.currentDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmRetirement = () =>
    openModal({
      title: 'Prendre ta retraite',
      message: 'Raccrocher les crampons maintenant ? La carrière se termine sur ce bilan, définitivement.',
      confirmLabel: 'Je raccroche',
      danger: true,
      onConfirm: () => {
        void mutate('Retraite', (c) => retire(c, 'décision du joueur')).then((s) => toast({ kind: 'info', message: s.verdict })).catch(() => undefined);
      },
    });

  return (
    <div className="p-4 space-y-4">
      {career.retired && <CareerSummaryPanel career={career} />}

      {!career.retired && <TransferOffersPanel />}

      <Panel>
        <SectionTitle right={<NumberTabular value={formatEuros(player.marketValue)} className="text-broadcast-yellow text-lg" />}>
          Valeur marchande
        </SectionTitle>
        <ValueChart history={player.marketValueHistory} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Contrat</SectionTitle>
          <ul className="text-sm space-y-1">
            <li>Club : {career.world.clubs[player.contract.clubId]?.name ?? '—'}</li>
            {player.contract.loanFromClubId && <li>Prêté par : {career.world.clubs[player.contract.loanFromClubId]?.name ?? player.contract.loanFromClubId}</li>}
            <li>Salaire mensuel : {formatEuros(player.contract.wageMonthly)}</li>
            <li>Fin de contrat : {formatDateFrShort(player.contract.endsOn)}</li>
            {player.contract.releaseClause && <li>Clause libératoire : {formatEuros(player.contract.releaseClause)}</li>}
            <li>Rôle promis : {humanize(player.contract.promisedRole)}</li>
            <li>Prime par match : {formatEuros(player.contract.bonuses.perAppearance)}</li>
            <li>Prime par but : {formatEuros(player.contract.bonuses.perGoal)}</li>
            <li>Prime par passe décisive : {formatEuros(player.contract.bonuses.perAssist)}</li>
          </ul>
        </Panel>

        <Panel>
          <SectionTitle>Transferts</SectionTitle>
          {career.transfers.length === 0 ? (
            <p className="text-sm text-broadcast-grey">Aucun transfert pour l'instant.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {career.transfers.map((t, i) => (
                <li key={i}>
                  {formatDateFrShort(t.date)} : {career.world.clubs[t.fromClubId]?.shortName ?? t.fromClubId} →{' '}
                  {career.world.clubs[t.toClubId]?.shortName ?? t.toClubId} ({t.loan ? 'prêt' : formatEuros(t.fee)}{t.requested ? ', à ta demande' : ''})
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Sponsors</SectionTitle>
          {proposals.length === 0 && active.length === 0 && (
            <p className="text-sm text-broadcast-grey">Aucune marque ne s'est encore manifestée : la réputation mondiale ouvre cette porte.</p>
          )}
          {proposals.map((d) => (
            <div key={d.id} className="mb-3 border border-broadcast-yellow/50 p-3 text-sm">
              <p className="font-display uppercase tracking-wide text-broadcast-yellow">
                {d.brand} <span className="text-[10px] text-broadcast-grey">{SPONSOR_KIND_LABELS[d.kind] ?? humanize(d.kind)} · proposition</span>
              </p>
              <p>{formatEuros(d.amountYearly)} par an jusqu'au {formatDateFrShort(d.endsOn)}.</p>
              <p className="text-xs text-broadcast-grey">Obligations : {d.obligations.join(' ; ')}.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={() => void answerSponsor(d.id, 'accepter')} disabled={busy}>Signer</Button>
                <Button variant="secondary" onClick={() => void answerSponsor(d.id, 'negocier')} disabled={busy || d.negotiated}>
                  {d.negotiated ? 'Déjà négocié' : 'Négocier (+20 %)'}
                </Button>
                <Button variant="ghost" onClick={() => void answerSponsor(d.id, 'refuser')} disabled={busy}>Décliner</Button>
              </div>
            </div>
          ))}
          {active.length > 0 && (
            <ul className="text-sm space-y-1">
              {active.map((d) => (
                <li key={d.id} className="flex justify-between border-b border-pitch-800 py-1">
                  <span>{d.brand} <span className="text-xs text-broadcast-grey">{SPONSOR_KIND_LABELS[d.kind] ?? humanize(d.kind)}</span></span>
                  <span className="text-broadcast-grey">{formatEuros(d.amountYearly)}/an · jusqu'au {formatDateFrShort(d.endsOn)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <SectionTitle>Revenus cumulés</SectionTitle>
          {earnings ? (
            <ul className="text-sm space-y-1">
              <li className="flex justify-between"><span className="text-broadcast-grey">Salaires</span><span>{formatEuros(earnings.wagesTotal)}</span></li>
              <li className="flex justify-between"><span className="text-broadcast-grey">Primes</span><span>{formatEuros(earnings.bonusesTotal)}</span></li>
              <li className="flex justify-between"><span className="text-broadcast-grey">Sponsors</span><span>{formatEuros(earnings.sponsorsTotal)}</span></li>
              <li className="flex justify-between border-t border-pitch-700 pt-1 font-display uppercase tracking-wide">
                <span>Total</span><span className="text-broadcast-yellow">{formatEuros(earnings.wagesTotal + earnings.bonusesTotal + earnings.sponsorsTotal)}</span>
              </li>
            </ul>
          ) : (
            <p className="text-sm text-broadcast-grey">Le premier salaire tombe le 1er du mois.</p>
          )}
        </Panel>
      </div>

      <Panel>
        <SectionTitle right={<Button variant="ghost" onClick={exportPalmares}>Exporter le palmarès</Button>}>Statistiques de carrière</SectionTitle>
        <StatsGrid stats={player.careerStats} goalkeeper={isGoalkeeper} />
        {career.pastSeasons.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-broadcast-grey border-b border-pitch-700">
                  <th className="py-1 pr-2">Saison</th>
                  <th className="py-1 pr-2">Club</th>
                  <th className="py-1 pr-2 text-right">Cl.</th>
                  <th className="py-1 pr-2 text-right">M</th>
                  <th className="py-1 pr-2 text-right">B</th>
                  <th className="py-1 pr-2 text-right">PD</th>
                  <th className="py-1 pr-2 text-right">Note</th>
                  <th className="py-1 pr-2">Palmarès</th>
                </tr>
              </thead>
              <tbody>
                {[...career.pastSeasons].reverse().map((s) => (
                  <tr key={s.seasonId} className="border-b border-pitch-800">
                    <td className="py-1 pr-2">{s.label}</td>
                    <td className="py-1 pr-2">{career.world.clubs[s.clubId]?.shortName ?? s.clubId}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{s.leagueRank}e</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{s.stats.total.matches}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{s.stats.total.goals}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{s.stats.total.assists}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{s.averageRating.toFixed(2)}</td>
                    <td className="py-1 pr-2 text-broadcast-grey">{[...s.trophies.map((x) => humanize(x)), ...s.awards.map((a) => humanize(a.kind))].join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <CareerJournalPanel career={career} />

      {!career.retired && (
        <Panel>
          <SectionTitle>Fin de carrière</SectionTitle>
          {canRetire(career) ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-broadcast-grey">Tu peux raccrocher quand tu veux. Le bilan sera figé.</p>
              <Button variant="danger" onClick={confirmRetirement} disabled={busy}>Prendre ma retraite</Button>
            </div>
          ) : (
            <p className="text-sm text-broadcast-grey">Retraite possible à partir de 33 ans, en fin de contrat, ou après une blessure de fin de carrière. Imposée à 39 ans.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
