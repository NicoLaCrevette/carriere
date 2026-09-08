/**
 * Ouverture de semaine : où on en est, ce qui arrive, ce qu'on doit surveiller.
 *
 * Sans elle, chaque semaine commençait sur un bouton « Passer la semaine » et
 * toutes se ressemblaient. Le briefing est déduit de l'état — classement,
 * prochain adversaire, statut dans l'équipe, série en cours, condition — et sa
 * formulation varie avec la date, de sorte que deux semaines ne se lisent pas
 * pareil même quand il ne se passe rien.
 *
 * Tout est déjà dans `CareerState` : cette lecture n'invente aucun chiffre.
 */
import type { CareerState, Match } from '../../engine/types';
import { diffDays } from '../../engine/calendar/dates';
import { hashKey } from '../../engine/rng/derive';
import {
  selectLastPlayerMatch, selectLeagueTable, selectNextMatch, selectPlayerClub,
  selectPlayerMatchdayForClub, selectRecentResults,
} from '../../store/selectors';

export interface Briefing {
  /** Titre de la semaine : « Semaine 12 · avant Lens ». */
  titre: string;
  /** Une à trois phrases qui situent la semaine. Lisible à voix haute. */
  phrases: string[];
  /** Le point à surveiller cette semaine, s'il y en a un. */
  alerte?: string;
  /** Prochain match, s'il y en a un. */
  match?: { match: Match; adversaire: string; domicile: boolean; jours: number; enjeu: boolean };
}

/** Variante stable pour une semaine donnée : la formulation change, jamais les faits. */
function variante<T>(state: CareerState, portee: string, options: readonly T[]): T {
  return options[hashKey(state.seed, `${portee}:${state.currentDate}`, 0) % options.length]!;
}

export function buildBriefing(state: CareerState): Briefing {
  const club = selectPlayerClub(state);
  const clubId = state.player.contract.clubId;
  const prochain = selectNextMatch(state);
  const phrases: string[] = [];

  const match = prochain
    ? {
        match: prochain,
        adversaire: state.world.clubs[prochain.homeClubId === clubId ? prochain.awayClubId : prochain.homeClubId]?.name ?? 'un adversaire',
        domicile: prochain.homeClubId === clubId,
        jours: Math.max(0, diffDays(state.currentDate, prochain.date)),
        enjeu: prochain.importance >= 70,
      }
    : undefined;

  const journee = selectPlayerMatchdayForClub(state);
  const titre = match
    ? `${journee > 0 ? `${journee}\u1d49 journ\u00e9e` : 'Semaine'} \u00b7 avant ${match.adversaire}`
    : 'Semaine sans match';

  // 1. Où en est l'équipe.
  const classement = selectLeagueTable(state);
  const rang = classement ? classement.table.findIndex((r) => r.clubId === clubId) + 1 : 0;
  if (club && rang > 0) {
    phrases.push(
      variante(state, 'rang', [
        `${club.shortName} est ${rang}\u1d49 de ${state.world.leagues[classement!.leagueId]?.shortName ?? 'la ligue'}.`,
        `Au classement, ${club.shortName} pointe \u00e0 la ${rang}\u1d49 place.`,
        `${rang}\u1d49 : voil\u00e0 o\u00f9 en est ${club.shortName} cette semaine.`,
      ]),
    );
  }

  // 2. Ce qui arrive.
  if (match) {
    const quand = match.jours === 0 ? "aujourd'hui" : match.jours === 1 ? 'demain' : `dans ${match.jours} jours`;
    const lieu = match.domicile ? 'à la maison' : 'à l’extérieur';
    phrases.push(
      variante(state, 'match', [
        `Prochain match ${quand}, ${lieu}, contre ${match.adversaire}.`,
        `${match.adversaire} ${quand}, ${lieu}.`,
        `On joue ${match.adversaire} ${quand} — ${match.domicile ? 'chez nous' : 'chez eux'}.`,
      ]),
    );
    if (match.enjeu) phrases.push(variante(state, 'enjeu', ['Le match compte double, tout le monde le sait.', 'C’est un gros match.', 'La semaine est tendue : l’affiche est lourde.']));
  } else {
    phrases.push(variante(state, 'sansmatch', ['Pas de match cette semaine : que du travail.', 'Semaine creuse, tout se joue à l’entraînement.', 'Rien au calendrier : c’est le moment de bosser.']));
  }

  // 3. Où en est le joueur — c'est ce qui manquait le plus.
  const dernier = selectLastPlayerMatch(state);
  const rapport = dernier?.result?.playerReport;
  if (rapport) {
    const note = rapport.rating.toFixed(1);
    phrases.push(
      rapport.rating >= 7
        ? variante(state, 'bon', [`Ton dernier match t’a valu ${note} : le staff a vu.`, `Tu sors d’un ${note}. Continue.`])
        : rapport.rating < 5.5
          ? variante(state, 'mauvais', [`Ton dernier match, ${note}. Il faut relever la tête.`, `${note} la dernière fois : tu es attendu.`])
          : variante(state, 'moyen', [`Dernier match : ${note}, sans plus.`, `Tu tournes autour de ${note}. Il faut passer un cap.`]),
    );
  }

  const alerte = trouverAlerte(state);
  return {
    titre,
    phrases,
    ...(alerte ? { alerte } : {}),
    ...(match ? { match } : {}),
  };
}

/** Le point à surveiller : blessure, condition, série noire, contrat qui file. */
function trouverAlerte(state: CareerState): string | undefined {
  const p = state.player;
  const blessure = p.injuries.find((i) => !i.healedOn && i.daysRemaining > 0);
  if (blessure) {
    // On annonce la durée communiquée par le staff, pas la vraie : le joueur ne la connaît pas.
    const jours = Math.max(1, blessure.announcedDays - (blessure.actualDays - blessure.daysRemaining));
    return `Tu es blessé, encore ${jours} jour${jours > 1 ? 's' : ''} d’après le staff. L’entraînement ne rapporte presque rien d’ici là.`;
  }
  if (p.fitness < 55) return `Condition ${Math.round(p.fitness)} : tu es cuit. Une semaine légère te remettrait d’aplomb.`;
  if (p.sharpness < 40) return `Rythme ${Math.round(p.sharpness)} : tu manques de matchs, tu seras court sur les duels.`;
  if (p.morale < 35) return `Moral ${Math.round(p.morale)}. Ça se voit sur le terrain.`;

  const derniers = selectRecentResults(state, 4);
  const clubId = p.contract.clubId;
  const defaites = derniers.filter((m) => {
    const r = m.result;
    if (!r) return false;
    const chezNous = m.homeClubId === clubId;
    return chezNous ? r.homeGoals < r.awayGoals : r.awayGoals < r.homeGoals;
  }).length;
  if (derniers.length >= 3 && defaites >= 3) return 'Trois défaites sur les quatre derniers matchs : le vestiaire est lourd.';
  return undefined;
}
