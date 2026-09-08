/**
 * Négociation et exécution des offres de transfert (§11). La négociation est
 * déterministe (RNG dérivé de la graine, un seul tirage par tour), au plus 2
 * tours. `executeTransfer` met à jour tout ce que le contrat exige : contrat
 * du joueur, matchs à venir des deux clubs, hiérarchies, historique,
 * inflation, réputation, confiance du coach, souvenir, journal.
 */
import type {
  CareerState, Contract, Euros, Id, PromisedRole, Storyline, TransferOffer, TransferRecord,
} from '../types';
import { BALANCE } from '../config/balance';
import { addDays, addMonths, ageAt, diffDays } from '../calendar/dates';
import { nextRng } from '../rng/derive';
import { addLog, applyDeltas, clamp } from '../career/apply';
import { computeMarketValue } from '../player/marketValue';
import { updatePositionHierarchy } from '../season/lineupSelection';
import { resolveOfferEvent, transferWindowOpen } from './offers';

export interface CounterProposal { wageMonthly?: Euros; years?: number; releaseClause?: Euros; promisedRole?: PromisedRole }
export type OfferDecision = { type: 'accepter' } | { type: 'refuser' } | { type: 'negocier'; counter: CounterProposal };

const T = BALANCE.depth.transfers;

function clubName(state: CareerState, clubId: Id): string {
  return state.world.clubs[clubId]?.name ?? clubId;
}

/** Renouvellement de contrat au club actuel : met à jour le contrat, sans transfert ni changement de club. */
function applyRenewal(state: CareerState, offer: TransferOffer): void {
  const player = state.player;
  const contract: Contract = {
    ...player.contract,
    signedOn: state.currentDate,
    endsOn: addMonths(state.currentDate, offer.years * 12),
    wageMonthly: offer.wageMonthly,
    promisedRole: offer.promisedRole,
  };
  if (offer.releaseClause !== undefined) contract.releaseClause = offer.releaseClause;
  else delete contract.releaseClause;
  player.contract = contract;
  const name = clubName(state, player.contract.clubId);
  applyDeltas(state, {
    reputation: { club: 2, supporters: 1 },
    memory: [{
      date: state.currentDate, type: 'transfert', importance: 3,
      summary: `Prolongation de contrat avec ${name} jusqu'au ${contract.endsOn}.`,
      entities: [player.contract.clubId, player.id],
    }],
    log: [{ category: 'contrat', text: `Contrat prolongé jusqu'au ${contract.endsOn}, ${Math.round(contract.wageMonthly)} €/mois.` }],
  }, 'Prolongation de contrat');
}

/**
 * Exécute un transfert : contrat (club, salaire, durée, rôle, clause, prêt),
 * matchs à venir des deux clubs (involvesPlayer recalculé), hiérarchies des
 * deux clubs, TransferRecord, inflation du marché, réputation (supporters de
 * l'ancien club en baisse, jauge « club » vers un niveau cohérent avec le
 * prestige du nouveau club), confiance du coach ≈ 45, souvenir, journal. Le
 * prêt garde le club propriétaire dans `contract.loanFromClubId`.
 */
export function executeTransfer(state: CareerState, offer: TransferOffer): TransferRecord {
  const player = state.player;
  const fromClubId = player.contract.clubId;
  const toClubId = offer.clubId;
  const fromClub = state.world.clubs[fromClubId];
  const toClub = state.world.clubs[toClubId];
  if (!toClub) throw new Error(`Club acheteur inconnu : ${toClubId}`);
  const cfg = T.execution;

  const bonusesCfg = BALANCE.contracts.bonuses;
  const contract: Contract = {
    clubId: toClubId,
    signedOn: state.currentDate,
    endsOn: addMonths(state.currentDate, offer.years * 12),
    wageMonthly: offer.wageMonthly,
    promisedRole: offer.promisedRole,
    bonuses: {
      perAppearance: Math.round(offer.wageMonthly * bonusesCfg.perAppearance),
      perGoal: Math.round(offer.wageMonthly * bonusesCfg.perGoal),
      perAssist: Math.round(offer.wageMonthly * bonusesCfg.perAssist),
      perTrophy: Math.round(offer.wageMonthly * bonusesCfg.perTrophy),
    },
  };
  if (offer.releaseClause !== undefined) contract.releaseClause = offer.releaseClause;
  if (offer.loan) {
    contract.loanFromClubId = fromClubId;
    // Le contrat au club propriétaire doit survivre au prêt : sans cela, le joueur rentrerait
    // avec le salaire, le rôle et la date de fin du club prêteur.
    const { loanOriginal: _ignore, ...origine } = player.contract;
    contract.loanOriginal = origine;
  }
  player.contract = contract;

  // Confiance du coach avant le recalcul des hiérarchies : un nouvel arrivant part d'une confiance neutre,
  // c'est cette valeur qui doit compter pour sa place dans la hiérarchie du club acheteur.
  player.coachTrust = cfg.coachTrustAfterByRole[offer.promisedRole] ?? cfg.coachTrustAfter;

  // Matchs à venir des deux clubs : involvesPlayer recalculé.
  for (const m of Object.values(state.matches)) {
    if (m.status !== 'a_venir') continue;
    if (m.homeClubId === fromClubId || m.awayClubId === fromClubId || m.homeClubId === toClubId || m.awayClubId === toClubId) {
      m.involvesPlayer = m.homeClubId === toClubId || m.awayClubId === toClubId;
    }
  }

  // Hiérarchies des deux clubs.
  if (fromClub) {
    try { updatePositionHierarchy(state, fromClubId); } catch { /* club sans effectif exploitable : ignoré */ }
  }
  updatePositionHierarchy(state, toClubId);

  // Historique de transfert. Une demande de transfert publique en cours est résolue par ce transfert.
  const activeRequest = state.storylines.find((s) => s.kind === 'demande_transfert' && s.status === 'ouverte');
  if (activeRequest) {
    activeRequest.status = 'resolue';
    activeRequest.resolution = { date: state.currentDate, text: `Transfert obtenu vers ${toClub.name}.` };
    activeRequest.log.push({ date: state.currentDate, text: `Transfert finalisé vers ${toClub.name}.` });
  }
  const record: TransferRecord = { date: state.currentDate, fromClubId, toClubId, fee: offer.fee, loan: offer.loan, requested: !!activeRequest };
  state.transfers.push(record);

  // Inflation du marché.
  const inflationGain = (offer.fee / 1_000_000_000) * cfg.inflationPerFeeBillion;
  state.world.marketInflation = Math.min(cfg.inflationMax, state.world.marketInflation + inflationGain);

  // Réputation : les supporters de l'ancien club encaissent le départ, la jauge « club » évolue vers un niveau
  // cohérent avec le prestige du nouveau club (borné comme tout applyDeltas, pas un reset brut).
  const targetClubRep = clamp(cfg.clubReputationFromPrestige.base + toClub.prestige * cfg.clubReputationFromPrestige.perPrestigePoint, 0, 100);
  const clubRepDelta = targetClubRep - state.reputation.club.value;
  applyDeltas(state, {
    reputation: { supporters: -cfg.supportersMalusOnLeave, club: clubRepDelta },
    memory: [{
      date: state.currentDate, type: 'transfert', importance: cfg.memoryImportance,
      summary: `${offer.loan ? 'Prêt' : 'Transfert'} ${fromClub ? `de ${fromClub.name} ` : ''}vers ${toClub.name}`
        + (offer.fee > 0 ? ` (${Math.round(offer.fee / 1_000_000)} M€).` : '.'),
      entities: [fromClubId, toClubId, player.id],
    }],
    log: [{
      category: 'transfert',
      text: `${offer.loan ? 'Prêt' : 'Transfert'} : ${fromClub?.name ?? fromClubId} → ${toClub.name}, ${Math.round(offer.fee)} €.`,
    }],
  }, offer.loan ? 'Prêt' : 'Transfert');

  // Valeur marchande recalculée immédiatement dans le nouveau contexte (club, ligue).
  const toLeague = state.world.leagues[toClub.leagueId];
  if (toLeague) {
    const age = ageAt(player.identity.birthDate, state.currentDate);
    player.marketValue = computeMarketValue(player, age, toClub, toLeague, state.world.marketInflation, state.currentDate);
  }

  return record;
}

/** Un accord conclu retire les autres offres de la table : on ne signe qu'une fois. */
function withdrawOtherOffers(state: CareerState, accepted: TransferOffer): void {
  for (const other of state.offers) {
    if (other.id === accepted.id) continue;
    if (other.status !== 'en_attente' && other.status !== 'en_negociation') continue;
    other.status = 'retiree';
    resolveOfferEvent(state, other.id);
    other.negotiationLog.push({ date: state.currentDate, from: 'club', text: 'Offre retirée : le joueur s\'est engagé ailleurs.' });
  }
}

/**
 * Exécute l'accord trouvé pendant que le mercato était fermé, maintenant que
 * la fenêtre est rouverte. Un seul transfert par ouverture : les autres
 * accords en attente deviennent caducs, sinon le joueur changerait deux fois
 * de club le même jour.
 */
export function runScheduledTransfers(state: CareerState): TransferRecord[] {
  const records: TransferRecord[] = [];
  if (!transferWindowOpen(state, state.currentDate)) return records;
  for (const offer of state.offers) {
    if (offer.status !== 'acceptee' || offer.executedOn) continue;
    if (offer.clubId === state.player.contract.clubId) {
      offer.executedOn = state.currentDate; // renouvellement déjà appliqué
      continue;
    }
    if (!state.world.clubs[offer.clubId]) {
      // Le club acheteur a disparu (relégation, refonte du monde) : l'accord tombe au lieu d'échouer chaque jour.
      offer.status = 'retiree';
      offer.executedOn = state.currentDate;
      resolveOfferEvent(state, offer.id);
      offer.negotiationLog.push({ date: state.currentDate, from: 'club', text: 'Accord caduc : le club n\'existe plus.' });
      continue;
    }
    if (records.length > 0) {
      // Un accord plus ancien vient d'être honoré : celui-ci tombe.
      offer.status = 'retiree';
      offer.executedOn = state.currentDate;
      resolveOfferEvent(state, offer.id);
      offer.negotiationLog.push({ date: state.currentDate, from: 'club', text: 'Accord caduc : le joueur a rejoint un autre club à l\'ouverture du mercato.' });
      continue;
    }
    records.push(executeTransfer(state, offer));
    offer.executedOn = state.currentDate;
  }
  return records;
}

function applyCounterToOffer(offer: TransferOffer, counter: CounterProposal): void {
  if (counter.wageMonthly !== undefined) offer.wageMonthly = Math.max(0, Math.round(counter.wageMonthly));
  if (counter.years !== undefined) offer.years = Math.max(1, Math.min(6, Math.round(counter.years)));
  if (counter.releaseClause !== undefined) offer.releaseClause = Math.max(0, Math.round(counter.releaseClause));
  if (counter.promisedRole !== undefined) offer.promisedRole = counter.promisedRole;
}

/** Écart relatif demandé par la contre-proposition (sert à moduler la probabilité d'acceptation). */
function gapShareOf(offer: TransferOffer, counter: CounterProposal): number {
  if (counter.wageMonthly !== undefined && offer.wageMonthly > 0) {
    return Math.max(0, (counter.wageMonthly - offer.wageMonthly) / offer.wageMonthly);
  }
  if (counter.releaseClause !== undefined && offer.releaseClause) {
    return Math.max(0, (offer.releaseClause - counter.releaseClause) / offer.releaseClause);
  }
  if (counter.years !== undefined) return Math.abs(counter.years - offer.years) * 0.15;
  return 0.05;
}

function describeCounter(counter: CounterProposal): string {
  const parts: string[] = [];
  if (counter.wageMonthly !== undefined) parts.push(`${Math.round(counter.wageMonthly / 1000)} k€/mois`);
  if (counter.years !== undefined) parts.push(`${counter.years} ans`);
  if (counter.releaseClause !== undefined) parts.push(`clause ${Math.round(counter.releaseClause / 1_000_000)} M€`);
  if (counter.promisedRole !== undefined) parts.push(counter.promisedRole);
  return parts.length > 0 ? parts.join(', ') : 'conditions inchangées';
}

/** Le club rapproche ses conditions de la demande, sans tout céder d'un coup. */
function bridgeCounter(offer: TransferOffer, counter: CounterProposal): CounterProposal {
  const easing = T.negotiation.clubCounterEasing;
  const out: CounterProposal = {};
  if (counter.wageMonthly !== undefined) out.wageMonthly = Math.round(offer.wageMonthly + (counter.wageMonthly - offer.wageMonthly) * easing);
  if (counter.years !== undefined) out.years = Math.round(offer.years + (counter.years - offer.years) * easing);
  if (counter.releaseClause !== undefined) {
    const base = offer.releaseClause ?? counter.releaseClause;
    out.releaseClause = Math.round(base + (counter.releaseClause - base) * easing);
  }
  return out;
}

function negotiationRounds(offer: TransferOffer): number {
  return offer.negotiationLog.filter((l) => l.from === 'joueur' && l.text.startsWith('Contre-proposition')).length;
}

/** Finalise un accord de négociation : prolongation, transfert immédiat, ou programmé à l'ouverture du mercato. */
function settleAgreement(state: CareerState, offer: TransferOffer): void {
  resolveOfferEvent(state, offer.id);
  if (offer.clubId === state.player.contract.clubId && offer.fee === 0) {
    applyRenewal(state, offer);
    offer.status = 'acceptee';
    offer.executedOn = state.currentDate;
    withdrawOtherOffers(state, offer);
    return;
  }
  if (transferWindowOpen(state, state.currentDate)) {
    executeTransfer(state, offer);
    offer.executedOn = state.currentDate;
  }
  offer.status = 'acceptee';
  withdrawOtherOffers(state, offer);
}

function negotiateCounter(
  state: CareerState, offer: TransferOffer, counter: CounterProposal,
): { offer: TransferOffer; outcome: 'accepte' | 'refuse' | 'contre_offre' | 'retire'; message: string } {
  const cfg = T.negotiation;
  const name = clubName(state, offer.clubId);
  const rounds = negotiationRounds(offer);
  offer.status = 'en_negociation';
  offer.negotiationLog.push({ date: state.currentDate, from: 'joueur', text: `Contre-proposition : ${describeCounter(counter)}.` });

  const rng = nextRng(state, `negociation:${offer.id}:${rounds}`);
  const gapShare = gapShareOf(offer, counter);
  const prob = clamp(cfg.baseAcceptProb + cfg.acceptProbPerGapShare * gapShare, 0.03, 0.95);

  if (rng.chance(prob)) {
    applyCounterToOffer(offer, counter);
    settleAgreement(state, offer);
    offer.negotiationLog.push({ date: state.currentDate, from: 'club', text: `${name} accepte votre contre-proposition.` });
    return { offer, outcome: 'accepte', message: `${name} accepte votre contre-proposition.` };
  }

  if (rounds + 1 >= cfg.maxRounds) {
    offer.status = 'refusee';
    resolveOfferEvent(state, offer.id);
    offer.negotiationLog.push({ date: state.currentDate, from: 'club', text: `${name} refuse et retire son offre.` });
    return { offer, outcome: 'refuse', message: `${name} refuse la négociation et retire son offre.` };
  }

  const bridged = bridgeCounter(offer, counter);
  applyCounterToOffer(offer, bridged);
  offer.status = 'en_negociation';
  offer.negotiationLog.push({ date: state.currentDate, from: 'club', text: `${name} propose : ${describeCounter(bridged)}.` });
  return { offer, outcome: 'contre_offre', message: `${name} fait une contre-proposition.` };
}

/**
 * Réponse à une offre : accepter (→ executeTransfer si la fenêtre est
 * ouverte, sinon transfert programmé à l'ouverture via
 * `runScheduledTransfers`), refuser, négocier (contre-proposition acceptée
 * avec une probabilité qui décroît avec l'écart, ou contre-contre-offre, au
 * plus 2 tours). Journal dans `offer.negotiationLog`. Mute state.
 */
export function respondToOffer(
  state: CareerState, offerId: Id, decision: OfferDecision,
): { offer: TransferOffer; outcome: 'accepte' | 'refuse' | 'contre_offre' | 'retire'; message: string } {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) throw new Error(`Offre inconnue : ${offerId}`);
  const name = clubName(state, offer.clubId);
  if (offer.status !== 'en_attente' && offer.status !== 'en_negociation') {
    return { offer, outcome: 'retire', message: 'Cette offre a déjà été traitée.' };
  }

  if (decision.type === 'refuser') {
    offer.status = 'refusee';
    resolveOfferEvent(state, offer.id);
    offer.negotiationLog.push({ date: state.currentDate, from: 'joueur', text: 'Offre refusée.' });
    addLog(state, 'transfert', `Offre de ${name} refusée.`);
    return { offer, outcome: 'refuse', message: `Offre de ${name} refusée.` };
  }

  if (decision.type === 'accepter') {
    const isRenewal = offer.clubId === state.player.contract.clubId && offer.fee === 0;
    const windowOpen = transferWindowOpen(state, state.currentDate) !== null;
    settleAgreement(state, offer);
    offer.negotiationLog.push({
      date: state.currentDate, from: 'joueur',
      text: isRenewal ? 'Prolongation acceptée.' : (windowOpen ? 'Offre acceptée.' : 'Accord trouvé, transfert programmé à l\'ouverture du mercato.'),
    });
    const message = isRenewal
      ? `Prolongation signée avec ${name}.`
      : (windowOpen ? `Transfert à ${name} finalisé.` : `Accord avec ${name}, transfert effectif à l'ouverture du mercato.`);
    return { offer, outcome: 'accepte', message };
  }

  return negotiateCounter(state, offer, decision.counter);
}

/** Demande de transfert publique : malus immédiats (BALANCE.coach.transferRequest), club « ouvert », storyline. */
export function requestTransfer(state: CareerState): void {
  const player = state.player;
  const name = clubName(state, player.contract.clubId);
  const rq = BALANCE.coach.transferRequest;

  applyDeltas(state, {
    reputation: { supporters: -rq.supportersMalus, coach: -rq.coachRepMalus },
    memory: [{
      date: state.currentDate, type: 'transfert', importance: 4,
      summary: `${player.identity.firstName} ${player.identity.lastName} demande publiquement son transfert (${name}).`,
      entities: [player.contract.clubId, player.id],
    }],
    log: [{ category: 'transfert', text: `Demande de transfert publique (${name}).` }],
  }, 'Demande de transfert');
  player.coachTrust = clamp(player.coachTrust - rq.trustMalus, 0, 100);

  const storyline: Storyline = {
    id: `storyline-demande-transfert-${state.currentDate}`,
    kind: 'demande_transfert',
    title: 'Demande de transfert',
    startedOn: state.currentDate,
    deadline: addDays(state.currentDate, T.request.storylineDeadlineDays),
    status: 'ouverte',
    stage: 'demande',
    vars: { clubId: player.contract.clubId },
    npcIds: state.world.npcs['npc-agent'] ? ['npc-agent'] : [],
    log: [{ date: state.currentDate, text: `${player.identity.firstName} ${player.identity.lastName} a demandé son transfert.` }],
  };
  state.storylines.push(storyline);
}

/**
 * Prolongation proposée par le club actuel quand le contrat expire dans
 * moins de 12 mois et que le joueur est utile (haut dans la hiérarchie ou
 * confiance du coach suffisante) : nouvelle offre dans `state.offers` avec
 * `clubId` = club actuel et `fee` = 0.
 */
export function rollContractRenewal(state: CareerState): TransferOffer | null {
  const player = state.player;
  const cfg = T.renewal;
  const monthsLeft = diffDays(state.currentDate, player.contract.endsOn) / 30.44;
  if (monthsLeft > cfg.monthsLeftThreshold) return null;

  const clubId = player.contract.clubId;
  const alreadyPending = state.offers.some(
    (o) => o.clubId === clubId && o.fee === 0 && (o.status === 'en_attente' || o.status === 'en_negociation'),
  );
  if (alreadyPending) return null;

  const club = state.world.clubs[clubId];
  if (!club) return null;
  const hierarchy = club.positionHierarchy[player.identity.position] ?? [];
  const rank = hierarchy.indexOf(player.id);
  const useful = (rank >= 0 && rank < cfg.usefulHierarchyRankMax) || player.coachTrust >= cfg.usefulCoachTrustMin;
  if (!useful) return null;

  const rng = nextRng(state, `renouvellement:${state.currentDate}`);
  if (!rng.chance(cfg.probPerMonth)) return null;

  const league = state.world.leagues[club.leagueId];
  const age = ageAt(player.identity.birthDate, state.currentDate);
  const marketValue = league ? computeMarketValue(player, age, club, league, state.world.marketInflation, state.currentDate) : player.marketValue;
  const [growLo, growHi] = cfg.wageGrowth;
  const growth = growLo + rng.next() * (growHi - growLo);
  const wageMonthly = Math.max(player.contract.wageMonthly, Math.round((player.contract.wageMonthly * growth) / 500) * 500);
  const years = rng.int(cfg.years[0], cfg.years[1]);

  const offer: TransferOffer = {
    id: `renouvellement-${state.currentDate}`,
    clubId,
    receivedOn: state.currentDate,
    expiresOn: addDays(state.currentDate, T.expirationDays),
    interest: 5,
    fee: 0,
    wageMonthly,
    years,
    promisedRole: player.contract.promisedRole,
    loan: false,
    status: 'en_attente',
    currentClubStance: 'ouvert',
    negotiationLog: [{
      date: state.currentDate, from: 'club',
      text: `${club.name} propose une prolongation : ${Math.round(wageMonthly / 1000)} k€/mois sur ${years} ans.`,
    }],
  };
  state.offers.push(offer);
  addLog(state, 'contrat', `${club.name} propose une prolongation de contrat (${Math.round(marketValue / 1_000_000)} M€ de valeur estimée).`);
  return offer;
}
