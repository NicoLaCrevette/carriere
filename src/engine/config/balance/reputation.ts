/**
 * Section « reputation » de BALANCE : 8 jauges, bornes, inertie, deltas après match.
 * Composée dans ../balance.ts. Ajouts par Edit ciblé, jamais de suppression.
 */
import type { ReputationKey, StartingLevel } from '../../types';

export const REPUTATION_BALANCE = {
  reputation: {
    /** Bornes §8 : ±5 par interaction, ±12 par jour. */
    maxPerInteraction: 5,
    maxPerDay: 12,
    /** Inertie par jauge : fraction du delta réellement appliquée (monde lente, supporters volatile). */
    inertia: {
      club: 0.55, supporters: 1.0, coach: 0.65, teammates: 0.6, league: 0.35,
      world: 0.15, nationalTeam: 0.3, media: 0.85,
    } as Record<ReputationKey, number>,
    /** Valeurs initiales par niveau de départ (avant ajustement club). */
    initial: {
      espoir: { club: 20, supporters: 15, coach: 25, teammates: 30, league: 5, world: 1, nationalTeam: 3, media: 10 },
      prometteur: { club: 30, supporters: 25, coach: 35, teammates: 35, league: 12, world: 3, nationalTeam: 8, media: 18 },
      pepite: { club: 42, supporters: 38, coach: 42, teammates: 38, league: 25, world: 8, nationalTeam: 18, media: 30 },
    } as Record<StartingLevel, Record<ReputationKey, number>>,
    /** Deltas après match, par point de note autour de 6.3 (avant inertie et bornes). */
    afterMatch: {
      ratingPivot: 6.3,
      perRatingPoint: { club: 1.2, supporters: 2.5, coach: 1.5, teammates: 1.2, league: 0.8, world: 0.3, nationalTeam: 0.5, media: 2.0 } as Record<ReputationKey, number>,
      goalBonus: { supporters: 1.5, media: 1.0, league: 0.5, world: 0.2 } as Partial<Record<ReputationKey, number>>,
      motmBonus: { supporters: 2, media: 2, league: 1, world: 0.4 } as Partial<Record<ReputationKey, number>>,
      redCardMalus: { supporters: -3, coach: -3, teammates: -2, media: -2 } as Partial<Record<ReputationKey, number>>,
      /** Enjeu du match : multiplicateur 0.8 (anodin) à 1.5 (finale). */
      importanceMultiplier: { atZero: 0.8, atHundred: 1.5 },
      /** Un remplaçant peu utilisé bouge moins. */
      minutesForFullEffect: 60,
      /** Résultat du match : effet sur les jauges du club (victoire / défaite), avant enjeu. */
      resultEffect: {
        win: { club: 0.6, supporters: 1.0, teammates: 0.4, coach: 0.4 } as Partial<Record<ReputationKey, number>>,
        loss: { club: -0.5, supporters: -1.0, teammates: -0.3, coach: -0.3 } as Partial<Record<ReputationKey, number>>,
      },
      /** Une note sous ce seuil fait chuter supporters et médias en plus du barème linéaire. */
      lowRating: { threshold: 5.0, extra: { supporters: -2, media: -2, coach: -1 } as Partial<Record<ReputationKey, number>> },
      /** Passe décisive : bonus. */
      assistBonus: { supporters: 0.8, media: 0.6, league: 0.3, world: 0.1 } as Partial<Record<ReputationKey, number>>,
    },
    /**
     * Match de sélection nationale (§9) : ni le coach du club ni les supporters
     * du club ne sont concernés ; la vitrine est la sélection, le monde et les médias.
     */
    afterInternationalMatch: {
      ratingPivot: 6.3,
      perRatingPoint: { nationalTeam: 3.0, world: 1.2, media: 1.0, league: 0.3 } as Partial<Record<ReputationKey, number>>,
      goalBonus: { nationalTeam: 2.0, world: 1.0, media: 1.0 } as Partial<Record<ReputationKey, number>>,
      assistBonus: { nationalTeam: 1.0, world: 0.5, media: 0.5 } as Partial<Record<ReputationKey, number>>,
      motmBonus: { nationalTeam: 2.0, world: 1.0, media: 1.0 } as Partial<Record<ReputationKey, number>>,
      redCardMalus: { nationalTeam: -3, media: -2 } as Partial<Record<ReputationKey, number>>,
      /** Un remplaçant peu utilisé bouge moins (mêmes minutes de référence qu'en club). */
      minutesForFullEffect: 60,
    },
    /** Ajustement initial selon le prestige du club : exposition (ligue, monde, médias) et ancrage local (club, supporters, coach). */
    initialClubAdjust: { prestigePivot: 50, exposurePerPoint: 0.15, localPerPoint: -0.1 },
    /** Dérive hebdomadaire : niveau mérité de base et échelle par jauge (le monde ne connaît pas un joueur de Ligue 1 moyen). */
    weeklyDriftMerit: {
      base: 50,
      scale: {
        club: 1.0, supporters: 1.0, coach: 1.0, teammates: 1.0, league: 0.7, world: 0.3, nationalTeam: 0.5, media: 0.9,
      } as Record<ReputationKey, number>,
      /** Nombre de derniers matchs pris en compte pour la note moyenne. */
      lastMatches: 10,
    },
    /** Dérive hebdomadaire vers le niveau mérité : fraction de l'écart. */
    weeklyDrift: { share: 0.06, meritFromOverall: { pivot: 60, perPoint: 1.4 }, meritFromRating: { pivot: 6.3, perPoint: 12 } },
    /** Compactage de l'historique. */
    history: { keepLast: 200, monthlyPoints: true },
    /** Deux matchs ratés et la presse s'emballe (§6.5). */
    mediaStorm: { afterConsecutiveBad: 2, badRating: 5.8, mediaMalus: 4, supportersMalus: 3 },
  },
} as const;
