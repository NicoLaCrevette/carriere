/**
 * Avatars de joueurs : figure ronde, dessinée, déduite d'un identifiant.
 *
 * Pourquoi pas une photo : les joueurs des jeux de données réels sont des
 * personnes réelles, leur image ne nous appartient pas. Ce que l'on peut
 * légitimement reprendre du réel, ce sont les **couleurs du club**, qui sont
 * un fait ; le reste du visage est une figure générée.
 *
 * Les traits ne sont jamais déduits de la nationalité : ils viennent d'un
 * hachage de l'identifiant, comme un tirage. Le joueur incarné, lui, choisit
 * les siens à la création et peut les changer.
 */
import type { AccessoireAvatar, AvatarConfig, Coiffure, Id, Pilosite } from '../../engine/types';
import { ACCESSOIRES_AVATAR, COIFFURES, PILOSITES } from '../../engine/types';
import { hashKey } from '../../engine/rng/derive';

export type { AvatarConfig };
export { ACCESSOIRES_AVATAR, COIFFURES, PILOSITES };

/** Teintes de peau, du plus clair au plus foncé. Neutre : rien n'y est déduit d'une origine. */
export const TEINTES_PEAU = ['#f2d0b6', '#e5b592', '#c98e63', '#a26a41', '#7a4a2b', '#4f2f1b'] as const;
export const COULEURS_CHEVEUX = ['#12100f', '#3b2417', '#6b4423', '#a9702f', '#d9b36c', '#8d8d92', '#e8e6e3'] as const;
export const LABELS_COIFFURE: Record<Coiffure, string> = {
  court: 'Cheveux courts', boucles: 'Boucles', rase: 'Crâne rasé', mi_long: 'Mi-longs',
  afro: 'Afro', chignon: 'Chignon', tresses: 'Tresses', degarni: 'Dégarni',
};
export const LABELS_PILOSITE: Record<Pilosite, string> = {
  aucune: 'Glabre', bouc: 'Bouc', barbe_courte: 'Barbe courte', moustache: 'Moustache', barbe_pleine: 'Barbe pleine',
};
export const LABELS_ACCESSOIRE: Record<AccessoireAvatar, string> = {
  aucun: 'Aucun', bandeau: 'Bandeau', boucle_oreille: "Boucle d'oreille",
};

function pioche<T>(liste: readonly T[], graine: number, portee: string, index: number): T {
  return liste[hashKey(graine, portee, index) % liste.length]!;
}

/** Avatar déduit d'un identifiant : stable pour toute la carrière, différent d'un joueur à l'autre. */
export function avatarDepuisId(id: Id): AvatarConfig {
  const graine = hashKey(0, `avatar:${id}`, 0);
  return {
    peau: hashKey(graine, 'peau', 0) % TEINTES_PEAU.length,
    cheveux: hashKey(graine, 'cheveux', 0) % COULEURS_CHEVEUX.length,
    coiffure: pioche(COIFFURES, graine, 'coiffure', 0),
    pilosite: pioche(PILOSITES, graine, 'pilosite', 0),
    // Les accessoires restent rares : un joueur sur quatre environ.
    accessoire: hashKey(graine, 'accessoire', 0) % 4 === 0 ? pioche(ACCESSOIRES_AVATAR, graine, 'accessoire', 1) : 'aucun',
  };
}

/** Avatar par défaut proposé à la création, avant que le joueur n'y touche. */
export function avatarParDefaut(): AvatarConfig {
  return { peau: 1, cheveux: 1, coiffure: 'court', pilosite: 'aucune', accessoire: 'aucun' };
}

export interface CouleursClub {
  primary: string;
  secondary: string;
}

/** Couleurs de repli quand le club est inconnu (sélection, joueur sans club). */
export const COULEURS_NEUTRES: CouleursClub = { primary: '#28313f', secondary: '#8d97a8' };
