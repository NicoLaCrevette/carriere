/**
 * Sponsors et revenus (Phase 6) : marques fictives qui se proposent quand la
 * réputation le permet, négociation à un tour, obligations, revenus cumulés.
 * Tout est déterministe (RNG dérivé de la graine) et borné par la balance.
 */
import type { CareerState, Euros, PlayerMatchReport, SponsorDeal } from '../types';
import { CAREER_DEPTH_BALANCE } from '../config/balance/careerDepth';
import { addMonths, diffDays } from '../calendar/dates';
import { nextRng } from '../rng/derive';
import { addLog, addMemory, applyDeltas } from './apply';

const S = CAREER_DEPTH_BALANCE.sponsors;

export const SPONSOR_BRANDS: readonly { brand: string; kind: SponsorDeal['kind'] }[] = [
  { brand: 'Aerion', kind: 'equipementier' },
  { brand: 'Volta', kind: 'boisson' },
  { brand: 'Brava', kind: 'marque' },
  { brand: 'Nordik', kind: 'automobile' },
  { brand: 'Pixelforge', kind: 'jeu_video' },
  { brand: 'Maison Delcourt', kind: 'marque' },
  { brand: 'Kairo Mobile', kind: 'autre' },
  { brand: 'Helios Optique', kind: 'autre' },
  { brand: 'Sativa Nutrition', kind: 'boisson' },
  { brand: 'Orbital', kind: 'marque' },
];

const OBLIGATIONS: readonly string[] = [
  'deux publications par mois sur les réseaux',
  'une apparition publique par trimestre',
  'une séance photo par an',
  'porter la marque en conférence de presse',
  'une visite de magasin par an',
  'un spot publicitaire par saison',
];

export function dealStatus(deal: SponsorDeal): NonNullable<SponsorDeal['status']> {
  return deal.status ?? 'active';
}

export function activeSponsors(state: CareerState): SponsorDeal[] {
  return state.sponsors.filter((d) => dealStatus(d) === 'active');
}

function resolveEvent(state: CareerState, dealId: string): void {
  const ev = state.events.find((e) => e.id === `event-${dealId}`);
  if (ev) ev.resolved = true;
}

function earnings(state: CareerState): NonNullable<CareerState['player']['earnings']> {
  state.player.earnings ??= { wagesTotal: 0, bonusesTotal: 0, sponsorsTotal: 0 };
  return state.player.earnings;
}

/** Expire les propositions sans réponse et clôt les contrats arrivés à terme. */
export function expireSponsorDeals(state: CareerState): void {
  const today = state.currentDate;
  for (const d of state.sponsors) {
    const status = dealStatus(d);
    if (status === 'proposee' && d.proposedOn && diffDays(d.proposedOn, today) > S.proposalExpiryDays) {
      d.status = 'refusee';
      resolveEvent(state, d.id);
      addLog(state, 'contrat', `${d.brand} retire sa proposition restée sans réponse.`);
    } else if (status === 'active' && d.endsOn < today) {
      d.status = 'terminee';
      addLog(state, 'contrat', `Fin du contrat de sponsoring avec ${d.brand}.`);
    }
  }
}

/**
 * Le 1er du mois : au plus une nouvelle proposition, si la réputation monde
 * suffit et que le joueur n'a pas déjà le maximum de contrats.
 */
export function rollSponsorOffers(state: CareerState): SponsorDeal[] {
  expireSponsorDeals(state);
  const world = state.reputation.world.value;
  if (world < S.minWorldReputation) return [];
  const busy = state.sponsors.filter((d) => dealStatus(d) === 'active' || dealStatus(d) === 'proposee');
  if (busy.length >= S.maxActive) return [];
  const rng = nextRng(state, 'sponsors');
  if (!rng.chance(S.monthlyOfferProb)) return [];
  const taken = new Set(busy.map((d) => d.brand));
  const candidates = SPONSOR_BRANDS.filter((b) => !taken.has(b.brand));
  if (candidates.length === 0) return [];
  const pick = rng.pick(candidates);
  const tier = [...S.tiers].reverse().find((t) => world >= t.fromWorld) ?? S.tiers[0]!;
  const media = state.reputation.media.value;
  const spread = S.amountSpread[0] + (S.amountSpread[1] - S.amountSpread[0]) * rng.next();
  const amountYearly: Euros = Math.max(1000, Math.round((tier.amountYearly * (1 + media * S.mediaBonusPerPoint) * spread * state.world.marketInflation) / 1000) * 1000);
  const years = rng.int(S.yearsRange[0], S.yearsRange[1]);
  const obligations = rng.shuffle(OBLIGATIONS).slice(0, rng.int(S.obligationsPerDeal[0], S.obligationsPerDeal[1]));
  const today = state.currentDate;
  const deal: SponsorDeal = {
    id: `sponsor-${state.sponsors.length + 1}-${today}`,
    brand: pick.brand,
    kind: pick.kind,
    signedOn: today,
    endsOn: addMonths(today, years * 12),
    amountYearly,
    obligations,
    status: 'proposee',
    proposedOn: today,
  };
  state.sponsors.push(deal);
  state.events.push({
    id: `event-${deal.id}`,
    definitionId: 'sponsor_proposition',
    category: 'sponsor',
    date: today,
    title: `Proposition de ${pick.brand}`,
    facts: { marque: pick.brand, montantAnnuel: amountYearly, annees: years, obligations: obligations.join(' ; ') },
    npcIds: [],
    resolved: false,
  });
  addLog(state, 'contrat', `Proposition de sponsoring : ${pick.brand}, ${amountYearly.toLocaleString('fr-FR')} € par an sur ${years} an${years > 1 ? 's' : ''}.`);
  return [deal];
}

/** Réponse à une proposition : accepter, refuser, ou négocier (+20 %, un seul tour). */
export function respondToSponsor(state: CareerState, dealId: string, decision: 'accepter' | 'refuser' | 'negocier'): { outcome: 'accepte' | 'refuse' | 'contre_offre'; deal: SponsorDeal } {
  const deal = state.sponsors.find((d) => d.id === dealId);
  if (!deal) throw new Error(`Proposition de sponsor introuvable : ${dealId}`);
  if (dealStatus(deal) !== 'proposee') throw new Error(`La proposition ${dealId} n'est plus ouverte.`);
  const today = state.currentDate;
  if (decision === 'accepter') {
    deal.status = 'active';
    deal.signedOn = today;
    resolveEvent(state, dealId);
    applyDeltas(state, {
      reputation: { media: S.signingMediaBonus },
      log: [{ category: 'contrat', text: `Contrat signé avec ${deal.brand} : ${deal.amountYearly.toLocaleString('fr-FR')} € par an jusqu'au ${deal.endsOn}.` }],
    }, `Sponsor ${deal.brand}`);
    addMemory(state, { date: today, type: 'vie_privee', importance: 2, summary: `Contrat de sponsoring signé avec ${deal.brand}.`, entities: [deal.brand, 'sponsor'] });
    return { outcome: 'accepte', deal };
  }
  if (decision === 'refuser') {
    deal.status = 'refusee';
    resolveEvent(state, dealId);
    addLog(state, 'contrat', `Proposition de ${deal.brand} déclinée.`);
    return { outcome: 'refuse', deal };
  }
  if (deal.negotiated) {
    deal.status = 'refusee';
    resolveEvent(state, dealId);
    addLog(state, 'contrat', `${deal.brand} se retire : une seule négociation était possible.`);
    return { outcome: 'refuse', deal };
  }
  deal.negotiated = true;
  const rng = nextRng(state, `sponsors:negociation:${deal.id}`);
  if (rng.chance(S.negotiation.acceptProb)) {
    deal.amountYearly = Math.round((deal.amountYearly * (1 + S.negotiation.raise)) / 1000) * 1000;
    addLog(state, 'contrat', `${deal.brand} accepte de monter à ${deal.amountYearly.toLocaleString('fr-FR')} € par an. À toi de signer.`);
    return { outcome: 'contre_offre', deal };
  }
  deal.status = 'refusee';
  resolveEvent(state, dealId);
  addLog(state, 'contrat', `${deal.brand} refuse de payer plus et se retire.`);
  return { outcome: 'refuse', deal };
}

/** Le 1er du mois : salaire et part mensuelle des sponsors actifs dans les revenus cumulés. */
export function accrueMonthlyEarnings(state: CareerState): void {
  const e = earnings(state);
  e.wagesTotal += state.player.contract.wageMonthly;
  for (const d of activeSponsors(state)) e.sponsorsTotal += Math.round(d.amountYearly / 12);
}

/** Après un match joué : primes contractuelles (apparition, buts, passes). */
export function accrueMatchBonuses(state: CareerState, report: PlayerMatchReport): void {
  if (report.minutesPlayed <= 0) return;
  const b = state.player.contract.bonuses;
  const e = earnings(state);
  e.bonusesTotal += b.perAppearance + b.perGoal * report.stats.goals + b.perAssist * report.stats.assists;
}
