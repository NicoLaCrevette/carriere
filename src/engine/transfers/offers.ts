/**
 * Fenêtres de mercato et tirage quotidien des offres (§11). Une offre naît
 * d'un club intéressé (`interest.ts`), avec un montant et un salaire
 * cohérents avec `player/marketValue.ts`, une position du club actuel
 * (ouvert / réticent / fermé) et une expiration. Au plus 3 offres ouvertes
 * en même temps.
 */
import type { CareerState, ISODate, TransferOffer } from '../types';
import { BALANCE } from '../config/balance';
import { addDays, ageAt, compareDates, diffDays, isBetween } from '../calendar/dates';
import { nextRng } from '../rng/derive';
import { computeMarketValue, suggestedWage } from '../player/marketValue';
import { computeInterest } from './interest';

const T = BALANCE.depth.transfers;

/** Vrai si une fenêtre de mercato est ouverte à la date. */
export function transferWindowOpen(state: CareerState, date: ISODate): 'summer' | 'winter' | null {
  const w = state.season.transferWindows;
  if (isBetween(date, w.summer[0], w.summer[1])) return 'summer';
  if (isBetween(date, w.winter[0], w.winter[1])) return 'winter';
  return null;
}

/** Marque comme résolu l'événement « offre » lié (l'offre a été traitée ou a expiré). */
export function resolveOfferEvent(state: CareerState, offerId: string): void {
  const ev = state.events.find((e) => e.id === `evt-offre-${offerId}`);
  if (ev) ev.resolved = true;
}

/** Expire les offres dépassées (en_attente ou en_negociation, hors accord déjà trouvé). */
export function expireOffers(state: CareerState): TransferOffer[] {
  const expired: TransferOffer[] = [];
  for (const offer of state.offers) {
    if (offer.status !== 'en_attente' && offer.status !== 'en_negociation') continue;
    if (compareDates(state.currentDate, offer.expiresOn) <= 0) continue;
    offer.status = 'expiree';
    offer.negotiationLog.push({ date: state.currentDate, from: 'club', text: 'Offre retirée (délai dépassé).' });
    resolveOfferEvent(state, offer.id);
    expired.push(offer);
  }
  return expired;
}

/** Nombre d'offres reçues depuis l'ouverture de la fenêtre en cours. */
function offersThisWindow(state: CareerState): number {
  const w = transferWindowOpen(state, state.currentDate);
  if (!w) return 0;
  const [from, to] = state.season.transferWindows[w];
  return state.offers.filter((o) => isBetween(o.receivedOn, from, to)).length;
}

/** Position du club actuel face à une offre : durée de contrat restante, importance du joueur, montant proposé. */
function currentClubStance(state: CareerState, fee: number): 'ouvert' | 'reticent' | 'ferme' {
  const S = T.stance;
  const hasOpenRequest = state.storylines.some((s) => s.kind === 'demande_transfert' && s.status === 'ouverte');
  if (hasOpenRequest) return 'ouvert';
  const monthsLeft = diffDays(state.currentDate, state.player.contract.endsOn) / 30.44;
  const feeRatio = fee / Math.max(1, state.player.marketValue);
  const ownClub = state.world.clubs[state.player.contract.clubId];
  const hierarchy = ownClub?.positionHierarchy[state.player.identity.position] ?? [];
  const rank = hierarchy.indexOf(state.player.id);
  const isKeyPlayer = rank >= 0 && rank < S.keyPlayerHierarchyRank + 1;
  if (monthsLeft <= S.openIfMonthsLeftBelow || feeRatio >= S.openIfFeeOverValue) return 'ouvert';
  if (isKeyPlayer && feeRatio < S.reluctantIfFeeOverValue) return 'ferme';
  if (monthsLeft <= S.reluctantIfMonthsLeftBelow || feeRatio < S.reluctantIfFeeOverValue) return 'reticent';
  return 'ouvert';
}

/**
 * Tirage quotidien pendant une fenêtre : au plus `maxOpenOffers` offres
 * ouvertes, nouvelles offres depuis les clubs intéressés (probabilité par
 * étoile), montant et salaire cohérents avec la valeur marchande, durée 2-5
 * ans (1 an pour un prêt), rôle promis selon le besoin, clause libératoire
 * parfois, prêt pour un jeune peu utilisé, expiration +10 j. Crée un
 * GameEvent 'agent' par offre.
 */
export function rollTransferOffers(state: CareerState): TransferOffer[] {
  if (!transferWindowOpen(state, state.currentDate)) return [];
  const openCount = state.offers.filter((o) => o.status === 'en_attente' || o.status === 'en_negociation').length;
  if (openCount >= T.maxOpenOffers) return [];
  // Une fenêtre ne produit qu'un nombre limité d'offres concrètes (§11), et au plus une par jour.
  if (offersThisWindow(state) >= BALANCE.career.transfers.offersPerWindowMax) return [];
  // Un joueur qui vient de signer ne repart pas dans la même fenêtre.
  const w = transferWindowOpen(state, state.currentDate)!;
  const [from, to] = state.season.transferWindows[w];
  if (state.transfers.some((t) => isBetween(t.date, from, to))) return [];

  const player = state.player;
  const age = ageAt(player.identity.birthDate, state.currentDate);
  const rng = nextRng(state, `mercato:${state.currentDate}`);
  const created: TransferOffer[] = [];

  for (const candidate of computeInterest(state)) {
    if (openCount + created.length >= T.maxOpenOffers) break;
    const alreadyOffering = state.offers.some(
      (o) => o.clubId === candidate.clubId && (o.status === 'en_attente' || o.status === 'en_negociation'),
    );
    if (alreadyOffering) continue;
    if (!rng.chance(T.offerProbByStar[candidate.stars])) continue;

    const club = state.world.clubs[candidate.clubId];
    const league = state.world.leagues[club.leagueId];
    if (!league) continue;

    const marketValue = computeMarketValue(player, age, club, league, state.world.marketInflation, state.currentDate);
    const [feeLo, feeHi] = T.feeFactorByStar[candidate.stars];
    const feeFactor = feeLo + rng.next() * (feeHi - feeLo);

    const isLoanCandidate = age <= T.loanMaxAge && player.sharpness < T.loanSharpnessBelow;
    const loan = isLoanCandidate && rng.chance(T.loanProbShare);
    const fee = loan ? 0 : Math.round((marketValue * feeFactor) / 10_000) * 10_000;

    const [wageLo, wageHi] = T.wageFactor;
    const wageBase = suggestedWage(player.overall, age, club, league);
    const wageMonthly = Math.round((wageBase * (wageLo + rng.next() * (wageHi - wageLo))) / 500) * 500;

    const years = loan ? T.loanYears : rng.int(T.years[0], T.years[1]);
    let releaseClause: number | undefined;
    if (!loan && rng.chance(T.releaseClauseProb)) {
      const [rcLo, rcHi] = T.releaseClauseFactor;
      releaseClause = Math.round((fee * (rcLo + rng.next() * (rcHi - rcLo))) / 100_000) * 100_000;
    }

    const stance = currentClubStance(state, fee);
    const offer: TransferOffer = {
      id: `offre-${state.currentDate}-${candidate.clubId}`,
      clubId: candidate.clubId,
      receivedOn: state.currentDate,
      expiresOn: addDays(state.currentDate, T.expirationDays),
      interest: candidate.stars,
      fee,
      wageMonthly,
      years,
      promisedRole: candidate.need,
      loan,
      status: 'en_attente',
      currentClubStance: stance,
      negotiationLog: [{
        date: state.currentDate, from: 'agent',
        text: loan
          ? `${club.name} propose un prêt d'un an (${Math.round(wageMonthly / 1000)} k€/mois).`
          : `${club.name} propose ${Math.round(fee / 1_000_000)} M€, ${Math.round(wageMonthly / 1000)} k€/mois sur ${years} ans.`,
      }],
    };
    if (releaseClause !== undefined) offer.releaseClause = releaseClause;
    if (created.length >= T.maxNewOffersPerDay) break;
    state.offers.push(offer);
    state.events.push({
      id: `evt-offre-${offer.id}`,
      definitionId: 'mercato:offre',
      category: 'agent',
      date: state.currentDate,
      title: `Offre de ${club.name}`,
      facts: { clubId: club.id, clubName: club.name, fee: offer.fee, wageMonthly: offer.wageMonthly, years: offer.years, loan: offer.loan, interest: offer.interest },
      npcIds: state.world.npcs['npc-agent'] ? ['npc-agent'] : [],
      resolved: false,
    });
    created.push(offer);
  }
  return created;
}
