/**
 * Constantes du système d'événements (`src/engine/events/`).
 *
 * Fichier AUTONOME, importé directement par `events/*`
 * (`import { EVENTS_BALANCE } from '../config/balance/events'`) — volontairement
 * PAS composé dans `config/balance.ts` ni dans `config/balance/depth.ts` (cf.
 * docs/PHASE6_CONTRACTS.md : l'intégration finale dans `BALANCE.depth.events`
 * est faite séparément, par Edit ciblé de `depth.ts`).
 */
export const EVENTS_BALANCE = {
  events: {
    /** Probabilité totale qu'un événement se déclenche un jour donné (au plus un par jour). */
    dailyProb: 0.06,
    /** Cooldown par défaut si une définition ne précise pas le sien. */
    cooldownDaysDefault: 45,
    /** Plafond glissant : jamais plus de N événements sur les 7 derniers jours (§12, BALANCE.career.events.maxPerWeek). */
    maxPerWeek: 2,
    /**
     * Un événement laissé sans réponse pendant ce délai se referme SANS issue :
     * les conséquences suivent ce que le joueur dit ou fait, jamais son silence (§6.2).
     */
    expiryDaysWithoutAnswer: 7,
    /** Amplitudes usuelles pour les issues du catalogue (`career/apply.applyDeltas` borne de toute façon). */
    reputationDelta: { small: 2, medium: 4, large: 6 },
    moraleDelta: { small: 3, medium: 5, large: 8 },
    /** Durée par défaut d'une storyline ouverte par un événement (jours). */
    storylineDeadlineDaysDefault: 21,
    /** Changement d'entraîneur (`maybeChangeCoach`, appelé au lendemain d'un match du joueur). */
    coachChange: {
      /** Fenêtre d'observation : N derniers matchs de championnat du club. */
      windowMatches: 8,
      /** Matchs de championnat déjà joués cette saison, minimum avant d'envisager un licenciement. */
      minMatchesSeason: 8,
      /** Licenciement seulement si les points pris sur la fenêtre sont ≤ ce seuil. */
      pointsOver8MatchesMax: 6,
      /** Probabilité de licenciement une fois le seuil de points franchi (vérifié au lendemain de chaque match). */
      prob: 0.15,
      /** Un club ne change pas d'entraîneur deux fois coup sur coup : délai minimal entre deux limogeages. */
      minDaysBetweenChanges: 300,
      /** Niveau vers lequel converge la confiance du joueur sous un nouveau coach. */
      trustReset: 40,
      /** Part du chemin parcouru vers `trustReset` : un cadre reconnu n'est pas ramené à zéro, mais doit reconvaincre. */
      trustResetShare: 0.6,
      /** Bruit (±) autour de la compétence de l'ancien coach pour celle du nouveau. */
      abilityNoise: 10,
      memoryImportance: 4,
    },
  },
} as const;

export type EventsBalance = typeof EVENTS_BALANCE;
