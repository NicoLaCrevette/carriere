/**
 * Moteur de semaine (§4) : le joueur choisit un plan d'entraînement, lance la
 * semaine, et le moteur avance seul jusqu'à ce que quelque chose mérite son
 * attention — un match à jouer, un événement à vivre, la fin de la saison, la
 * retraite. Sans cela il faudrait valider ~300 journées par saison alors qu'il
 * ne se passe rien la plupart du temps.
 *
 * `advanceWeek` ne joue JAMAIS le match du joueur : il s'arrête AVANT, sans
 * consommer la journée, et laisse l'interface le jouer (`calendar/advanceDay`
 * en mode interactif, puis `completePlayerMatch`). Mute `state` comme le reste
 * du moteur ; l'interface clone avant d'appeler.
 */
import type { AttributeKey, CareerState, DayKind, DayResult, Id, ISODate, TrainingFocus } from '../types';
import { BALANCE } from '../config/balance';
import { addDays } from '../calendar/dates';
import { advanceDay, messageMatchsDeFond, playerMatchOfDay } from '../calendar/advanceDay';
import { dayKindFor, TRAINING_DAY_KINDS } from '../calendar/dayKind';
import { addLog } from '../career/apply';

const W = BALANCE.week;

/** Plan d'entraînement de la semaine. 'auto' laisse la rotation du staff décider. */
export interface WeekPlan {
  focus: TrainingFocus | 'auto';
  intensity: 'legere' | 'normale' | 'intense';
}

/** Pourquoi la semaine s'est arrêtée. */
export type WeekStopReason = 'match' | 'evenement' | 'fin_de_semaine' | 'fin_de_saison' | 'retraite' | 'erreur';

export interface WeekResult {
  from: ISODate;
  /** Dernière date effectivement jouée (peut être < from si on s'arrête tout de suite). */
  to: ISODate;
  days: DayResult[];
  stop: WeekStopReason;
  /** Match du joueur à jouer, quand stop vaut 'match'. */
  matchId?: Id;
  /** Événements non résolus apparus pendant la semaine, quand stop vaut 'evenement'. */
  eventIds: Id[];
  /** Cumuls lisibles pour le bilan de semaine. */
  resume: {
    entrainements: number;
    gains: { key: string; from: number; to: number }[];
    /**
     * Ce que l'entraînement a réellement rapporté, y compris quand aucun point
     * entier n'est tombé. Sans cela, la plupart des semaines n'affichent rien
     * et le joueur croit ne rien gagner alors qu'il progresse.
     */
    progression: ProgressionAttribut[];
    blessures: number;
    messages: string[];
    conditionAvant: number;
    conditionApres: number;
    rythmeAvant: number;
    rythmeApres: number;
    globalAvant: number;
    globalApres: number;
  };
}

/** Progression d'un attribut sur la semaine : points gagnés et avancée vers le point suivant. */
export interface ProgressionAttribut {
  key: AttributeKey;
  /** Valeur de l'attribut à la fin de la semaine. */
  valeur: number;
  /** Avancée vers le point suivant, 0-1, à la fin de la semaine. */
  xp: number;
  /** XP gagnée pendant la semaine (1 = un point entier d'attribut). */
  xpGagne: number;
  /** Points entiers gagnés pendant la semaine. */
  pointsGagnes: number;
}

/**
 * Séance à appliquer un jour donné selon le plan (undefined = pas
 * d'entraînement imposé ce jour-là, `advanceDay` décide).
 *
 * Deux cas rendent la main au moteur :
 *  - plan 'auto' : la rotation par poste de `advanceDay` s'applique partout ;
 *  - journée sans entraînement (jour de match, repos, vacances, rééducation…).
 *
 * La veille et le lendemain d'un match gardent leur séance fixe
 * (`BALANCE.career.defaultTraining`) : s'entraîner intensément la veille d'un
 * match n'a aucun sens, et le lendemain est un décrassage. Le plan du joueur
 * ne doit pas pouvoir saboter son propre week-end.
 */
export function trainingForPlan(
  // Réservé : la séance ne dépend pas encore de l'état du joueur (blessure, forme), mais la signature le permettra sans casser les appelants.
  _state: CareerState,
  plan: WeekPlan,
  kind: DayKind,
): { focus: TrainingFocus; intensity: 'legere' | 'normale' | 'intense' } | undefined {
  if (plan.focus === 'auto') return undefined;
  if (!TRAINING_DAY_KINDS.includes(kind)) return undefined;
  const fixed = BALANCE.career.defaultTraining[kind];
  if (!fixed) return undefined;
  if (kind === 'veille_match' || kind === 'lendemain_match') return fixed;
  return { focus: plan.focus, intensity: plan.intensity };
}

/**
 * Le bruit à écarter est reconnu en régénérant la ligne exacte produite par la
 * journée, pas en devinant sa formulation : si elle est reformulée un jour, le
 * filtre suit sans se taire silencieusement.
 */
function estBruitDeFond(message: string): boolean {
  const n = /^(\d+) match/.exec(message);
  return n !== null && message === messageMatchsDeFond(Number(n[1]));
}

/** Mot-clé en tête d'une ligne (« finition : 62 → 63 » → « finition »). */
function enTeteDe(message: string): string {
  return message.split(' :')[0] ?? '';
}

/**
 * Lignes qui comptent pour le bilan : matchs, blessures, offres, événements,
 * trophées, fin de saison. On jette les gains d'attribut ligne par ligne — ils
 * sont déjà agrégés dans `resume.gains` — et les matchs de fond.
 */
function messagesUtiles(day: DayResult): string[] {
  const clesDeGain = new Set<string>(day.attributeGains.map((g) => String(g.key)));
  return day.messages.filter((m) => !clesDeGain.has(enTeteDe(m)) && !estBruitDeFond(m));
}

/**
 * Ce que les séances de la semaine ont rapporté, attribut par attribut.
 *
 * Un point entier d'attribut demande plusieurs semaines : n'afficher que les
 * points entiers revient à ne rien afficher la plupart du temps. On remonte donc
 * l'XP accumulée, qui est la vraie mesure de ce qu'a rapporté une séance.
 */
function cumulerProgression(days: DayResult[], state: CareerState, max: number): ProgressionAttribut[] {
  const xpGagne = new Map<AttributeKey, number>();
  for (const day of days) {
    for (const [key, xp] of Object.entries(day.training?.xpAdded ?? {}) as [AttributeKey, number][]) {
      if (!xp) continue;
      xpGagne.set(key, (xpGagne.get(key) ?? 0) + xp);
    }
  }
  const pointsGagnes = new Map<AttributeKey, number>();
  for (const day of days) {
    for (const gain of day.attributeGains) {
      pointsGagnes.set(gain.key, (pointsGagnes.get(gain.key) ?? 0) + (gain.to - gain.from));
    }
  }
  return [...xpGagne.entries()]
    .map(([key, gagne]) => ({
      key,
      valeur: state.player.attributes[key] ?? 0,
      xp: state.player.attributeXp[key] ?? 0,
      xpGagne: gagne,
      pointsGagnes: pointsGagnes.get(key) ?? 0,
    }))
    .sort((a, b) => b.pointsGagnes - a.pointsGagnes || b.xpGagne - a.xpGagne)
    .slice(0, max);
}

/** Fusionne les gains d'une même clé : premier `from`, dernier `to`, ordre d'apparition. */
function cumulerGains(days: DayResult[]): { key: string; from: number; to: number }[] {
  const parCle = new Map<string, { key: string; from: number; to: number }>();
  for (const day of days) {
    for (const gain of day.attributeGains) {
      const cle = String(gain.key);
      const existant = parCle.get(cle);
      if (existant) existant.to = gain.to;
      else parCle.set(cle, { key: cle, from: gain.from, to: gain.to });
    }
  }
  return [...parCle.values()];
}

/**
 * Avance jusqu'à 7 jours au maximum en appliquant le plan, et s'arrête dès
 * qu'il se passe quelque chose : match du joueur (sans le jouer), nouvel
 * événement non résolu, fin de saison, retraite.
 */
export function advanceWeek(
  state: CareerState,
  plan: WeekPlan,
  hooks?: { onDay?: (result: DayResult, state: CareerState) => void },
): WeekResult {
  const from = state.currentDate;
  const globalAvant = state.player.overall;
  const conditionAvant = state.player.fitness;
  const rythmeAvant = state.player.sharpness;
  const days: DayResult[] = [];
  const messages: string[] = [];
  // Les événements déjà là avant la semaine ne l'interrompent pas : le joueur les a déjà vus passer.
  const evenementsConnus = new Set(state.events.map((e) => e.id));

  let stop: WeekStopReason = 'fin_de_semaine';
  let matchId: Id | undefined;
  let eventIds: Id[] = [];
  // Aucune journée jouée : la semaine s'est arrêtée avant `from`.
  let to: ISODate = addDays(from, -1);

  if (state.retired) {
    stop = 'retraite';
  } else if (state.pendingDay) {
    // Journée interactive laissée en plan : le match doit être joué avant toute chose.
    stop = 'match';
    matchId = state.pendingDay.matchId;
  } else {
    for (let i = 0; i < W.maxDays; i++) {
      const date = state.currentDate;
      const match = playerMatchOfDay(state, date);
      if (match) {
        // On ne consomme pas la journée : l'interface joue le match, puis relance une semaine.
        stop = 'match';
        matchId = match.id;
        break;
      }

      const saisonAvant = state.season.id;
      let day: DayResult;
      try {
        day = advanceDay(state, { training: trainingForPlan(state, plan, dayKindFor(state, date)), playerMatchMode: 'interactif' });
      } catch (e) {
        const texte = e instanceof Error ? e.message : String(e);
        addLog(state, 'systeme', `Erreur pendant la semaine (${date}) : ${texte}`);
        messages.push(`La semaine s'est interrompue le ${date} : ${texte}`);
        stop = 'erreur';
        break;
      }

      days.push(day);
      to = day.date;
      messages.push(...messagesUtiles(day));
      hooks?.onDay?.(day, state);

      if (state.retired) {
        stop = 'retraite';
        break;
      }
      if (state.season.id !== saisonAvant) {
        stop = 'fin_de_saison';
        break;
      }
      const nouveaux = state.events.filter((e) => !e.resolved && !evenementsConnus.has(e.id)).map((e) => e.id);
      if (nouveaux.length > 0) {
        stop = 'evenement';
        eventIds = nouveaux;
        break;
      }
    }
  }

  const result: WeekResult = {
    from,
    to,
    days,
    stop,
    eventIds,
    resume: {
      entrainements: days.filter((d) => d.training).length,
      gains: cumulerGains(days),
      progression: cumulerProgression(days, state, W.maxProgression),
      blessures: days.reduce((total, d) => total + d.newInjuries.length, 0),
      messages: messages.slice(-W.maxMessages),
      conditionAvant,
      conditionApres: state.player.fitness,
      rythmeAvant,
      rythmeApres: state.player.sharpness,
      globalAvant,
      globalApres: state.player.overall,
    },
  };
  if (matchId) result.matchId = matchId;
  return result;
}
