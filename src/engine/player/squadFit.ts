/**
 * Où le joueur se situerait dans l'effectif d'un club, à son poste.
 *
 * Pourquoi ça existe : un « prometteur » à 55 de note qui signe à Strasbourg
 * (attaquants 74, 70, 67, 67, 65) ne joue jamais. Mesuré sur quatre saisons :
 * zéro titularisation, 96 minutes la première année puis zéro les trois
 * suivantes, confiance du coach collée à son plancher. Il progresse, mais ses
 * concurrents aussi, et comme il ne joue pas il ne prend pas d'XP de match :
 * l'impasse est fermée. Le même joueur à Angers (68, 65, 58, 54, 53) est
 * titulaire dès la deuxième saison et finit à 26 buts.
 *
 * Le jeu ne disait rien de tout ça au moment de choisir. Cette lecture le dit,
 * à partir des seules notes du jeu de données — elle n'invente aucun chiffre et
 * ne change aucune règle.
 *
 * Le discriminant n'est pas le rang mais **l'écart au deuxième choix** : c'est
 * lui qui sépare Angers (écart 10, on finit titulaire) de Strasbourg (écart 15,
 * on ne joue jamais).
 */
import type { DatasetClub, DatasetPlayer } from '../../data/schema';
import type { Position } from '../types';
import { positionCompatibility } from '../config/positions';
import { BALANCE } from '../config/balance';

export type FitVerdict = 'titulaire' | 'rotation' | 'remplacant' | 'hors_plans';

export interface SquadFit {
  /** Notes des concurrents crédibles au poste, décroissantes. */
  concurrents: number[];
  /** Rang du joueur parmi eux, 1 = meilleur du club à ce poste. */
  rang: number;
  /** Nombre de joueurs comparés, joueur incarné inclus. */
  effectif: number;
  /** Points de note qui séparent le joueur du meilleur du club à son poste. */
  ecartAuPremier: number;
  /** Points qui le séparent du deuxième choix : c'est ce qui décide s'il jouera. */
  ecartAuDeuxieme: number;
  verdict: FitVerdict;
}

/** Un joueur du jeu de données compte-t-il comme concurrent à ce poste ? */
function concurrentA(p: DatasetPlayer, position: Position): boolean {
  if (p.position === position) return true;
  if (p.secondaryPositions?.includes(position)) return true;
  // Un joueur d'un poste très proche (latéral droit/gauche, MC/MOC) reste un concurrent.
  return positionCompatibility(p.position, position) >= BALANCE.coach.lineup.secondaryPositionCompat;
}

/**
 * Situation prévisionnelle du joueur dans un effectif.
 *
 * `overall` est la note estimée du joueur (l'écran de création la calcule déjà
 * pour son aperçu). Pure : aucun tirage, aucun accès à l'état de carrière.
 */
export function squadFit(club: DatasetClub, position: Position, overall: number): SquadFit {
  const concurrents = club.players
    .filter((p) => concurrentA(p, position))
    .map((p) => p.overall)
    .sort((a, b) => b - a);

  const premier = concurrents[0] ?? 0;
  // Sans deuxième concurrent, c'est le premier qui fait office de repère.
  const deuxieme = concurrents[1] ?? premier;
  const ecartAuPremier = Math.max(0, premier - overall);
  const ecartAuDeuxieme = Math.max(0, deuxieme - overall);
  const rang = concurrents.filter((n) => n > overall).length + 1;

  const s = BALANCE.coach.squadFit;
  const verdict: FitVerdict =
    ecartAuDeuxieme <= s.titulaire ? 'titulaire'
      : ecartAuDeuxieme <= s.rotation ? 'rotation'
        : ecartAuDeuxieme <= s.remplacant ? 'remplacant'
          : 'hors_plans';

  return {
    concurrents,
    rang,
    effectif: concurrents.length + 1,
    ecartAuPremier,
    ecartAuDeuxieme,
    verdict,
  };
}
