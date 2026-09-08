/**
 * Mercato (§11, Phase 6) : offres ouvertes avec accepter / négocier / refuser,
 * clubs intéressés, demande de transfert. Le moteur décide de tout ; ici on
 * affiche et on transmet la décision via `careerStore.mutate`.
 */
import type { PromisedRole, TransferOffer } from '../../engine/types';
import { useCareerStore } from '../../store/careerStore';
import { useUiStore } from '../../store/uiStore';
import { computeInterest } from '../../engine/transfers/interest';
import { requestTransfer, respondToOffer, type OfferDecision } from '../../engine/transfers/negotiate';
import { transferWindowOpen } from '../../engine/transfers/offers';
import { formatDateFrShort } from '../../engine/calendar/dates';
import { formatEuros } from '../lib/labels';
import Panel from './Panel';
import SectionTitle from './SectionTitle';
import Button from './Button';

const ROLE_LABELS: Record<PromisedRole, string> = {
  titulaire_indiscutable: 'Titulaire indiscutable', titulaire: 'Titulaire', rotation: 'Rotation', projet: 'Projet',
};
const STANCE_LABELS: Record<TransferOffer['currentClubStance'], string> = {
  ouvert: 'ton club est ouvert à la vente', reticent: 'ton club est réticent', ferme: 'ton club ne veut pas te vendre',
};
const ROLE_UP: Record<PromisedRole, PromisedRole> = {
  projet: 'rotation', rotation: 'titulaire', titulaire: 'titulaire_indiscutable', titulaire_indiscutable: 'titulaire_indiscutable',
};

const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);

export default function TransferOffersPanel() {
  const career = useCareerStore((s) => s.career);
  const mutate = useCareerStore((s) => s.mutate);
  const busy = useCareerStore((s) => s.busy);
  const openModal = useUiStore((s) => s.openModal);
  const toast = useUiStore((s) => s.toast);
  if (!career) return null;

  const clubId = career.player.contract.clubId;
  const open = career.offers.filter((o) => o.status === 'en_attente' || o.status === 'en_negociation');
  const window = transferWindowOpen(career, career.currentDate);
  const interest = computeInterest(career).filter((i) => i.clubId !== clubId).sort((a, b) => b.stars - a.stars).slice(0, 8);
  const requested = career.storylines.some((s) => s.kind === 'demande_transfert' && s.status === 'ouverte');

  const decide = async (offer: TransferOffer, decision: OfferDecision) => {
    try {
      const out = await mutate('Mercato', (c) => respondToOffer(c, offer.id, decision));
      toast({ kind: out.outcome === 'accepte' ? 'success' : 'info', message: out.message });
    } catch {
      // L'erreur est affichée par le store.
    }
  };

  const confirmAccept = (offer: TransferOffer) => {
    const club = career.world.clubs[offer.clubId];
    const renewal = offer.clubId === clubId && offer.fee === 0;
    openModal({
      title: renewal ? 'Prolonger le contrat' : `Signer à ${club?.name ?? offer.clubId}`,
      message: renewal
        ? `Prolonger jusqu'en ${offer.years} an(s) à ${formatEuros(offer.wageMonthly)} par mois ?`
        : `${offer.loan ? 'Partir en prêt' : 'Rejoindre'} ${club?.name ?? offer.clubId} pour ${offer.years} an(s) à ${formatEuros(offer.wageMonthly)} par mois, rôle promis : ${ROLE_LABELS[offer.promisedRole].toLowerCase()} ? ${window ? 'Le transfert est immédiat.' : 'Le transfert prendra effet à l’ouverture du mercato.'}`,
      confirmLabel: renewal ? 'Prolonger' : 'Signer',
      onConfirm: () => void decide(offer, { type: 'accepter' }),
    });
  };

  const negotiate = (offer: TransferOffer) => {
    const counter = { wageMonthly: Math.round((offer.wageMonthly * 1.1) / 100) * 100, promisedRole: ROLE_UP[offer.promisedRole] };
    void decide(offer, { type: 'negocier', counter });
  };

  const confirmRequest = () =>
    openModal({
      title: 'Demander un transfert',
      message: 'Rendre publique ta volonté de partir ? Les supporters et le coach le prendront mal, mais les clubs intéressés sauront que la porte est ouverte.',
      confirmLabel: 'Je demande à partir',
      danger: true,
      onConfirm: () => {
        void mutate('Demande de transfert', (c) => requestTransfer(c)).then(() => toast({ kind: 'info', message: 'Demande de transfert rendue publique.' })).catch(() => undefined);
      },
    });

  return (
    <Panel>
      <SectionTitle right={<span className="text-[11px] uppercase tracking-wide text-muted">{window ? `Mercato ${window === 'summer' ? 'd’été' : 'd’hiver'} ouvert` : 'Mercato fermé'}</span>}>
        Mercato
      </SectionTitle>

      {open.length === 0 ? (
        <p className="text-sm text-muted">Aucune offre sur la table.</p>
      ) : (
        <p className="mb-2 text-xs text-muted">Négocier engage : si le club accepte ta contre-proposition, l'accord est conclu (deux tours au plus).</p>
      )}
      {open.length > 0 && (
        <ul className="space-y-3">
          {open.map((o) => {
            const club = career.world.clubs[o.clubId];
            const renewal = o.clubId === clubId && o.fee === 0;
            const negotiable = o.negotiationLog.filter((l) => l.from === 'joueur' && /contre/i.test(l.text)).length < 2;
            return (
              <li key={o.id} className="rounded-2xl ring-1 ring-accent/40 bg-accent/[0.04] p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display uppercase tracking-wide text-accent">
                    {renewal ? `Prolongation · ${club?.name ?? o.clubId}` : club?.name ?? o.clubId}
                    <span className="ml-2 text-xs text-muted">{stars(o.interest)}</span>
                  </p>
                  <span className="text-xs text-muted">expire le {formatDateFrShort(o.expiresOn)}</span>
                </div>
                <p className="mt-1">
                  {renewal ? '' : `${o.loan ? 'Prêt' : `Indemnité ${formatEuros(o.fee)}`} · `}
                  {formatEuros(o.wageMonthly)} par mois · {o.years} an{o.years > 1 ? 's' : ''} · {ROLE_LABELS[o.promisedRole]}
                  {o.releaseClause ? ` · clause ${formatEuros(o.releaseClause)}` : ''}
                </p>
                {!renewal && <p className="text-xs text-muted">{STANCE_LABELS[o.currentClubStance]}{club ? ` · prestige ${club.prestige}` : ''}</p>}
                {o.negotiationLog.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted">
                    {o.negotiationLog.slice(-4).map((l, i) => (
                      <li key={i}>{formatDateFrShort(l.date)} · {l.from} : {l.text}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button onClick={() => confirmAccept(o)} disabled={busy}>{renewal ? 'Prolonger' : 'Accepter'}</Button>
                  <Button variant="secondary" onClick={() => negotiate(o)} disabled={busy || !negotiable}>Négocier (salaire +10 %, rôle supérieur)</Button>
                  <Button variant="ghost" onClick={() => void decide(o, { type: 'refuser' })} disabled={busy}>Refuser</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted mb-1">Clubs qui te suivent</p>
          {interest.length === 0 ? (
            <p className="text-sm text-muted">Personne pour l'instant : joue, marque, fais parler de toi.</p>
          ) : (
            <ul className="text-sm space-y-0.5">
              {interest.map((i) => (
                <li key={i.clubId} className="flex justify-between gap-2 border-b border-white/[0.05] py-0.5">
                  <span>{career.world.clubs[i.clubId]?.name ?? i.clubId} <span className="text-xs text-muted">{ROLE_LABELS[i.need].toLowerCase()}</span></span>
                  <span className="text-accent text-xs" title={i.reason}>{stars(i.stars)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted mb-1">Ta position</p>
          {requested ? (
            <p className="text-sm text-muted">Tu as demandé publiquement à partir. Ton club est ouvert aux offres.</p>
          ) : (
            <>
              <p className="text-sm text-muted mb-2">Demander un transfert rend ta volonté publique : malus immédiats, mais les offres deviennent plus faciles.</p>
              <Button variant="danger" onClick={confirmRequest} disabled={busy}>Demander un transfert</Button>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
