/**
 * Ce que travaille chaque séance d'entraînement (§10) : poids relatifs des
 * attributs ciblés (1 = attribut principal), et libellés d'affichage.
 * Séparé de training.ts pour éviter un cycle d'import avec progression.ts.
 */
import type { AttributeKey, TrainingFocus } from '../types';

export const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string> = {
  physique: 'Physique',
  finition: 'Finition',
  dribble: 'Dribble',
  vitesse: 'Vitesse',
  jeu_de_tete: 'Jeu de tête',
  placement: 'Placement',
  musculation: 'Musculation',
  recuperation: 'Récupération',
  tactique_individuelle: 'Tactique individuelle',
  coups_de_pied_arretes: 'Coups de pied arrêtés',
  passes: 'Passes',
  defense: 'Défense',
  gardien_specifique: 'Spécifique gardien',
};

/** Attributs travaillés par chaque focus (poids relatifs, 1 = principal). */
export const TRAINING_TARGETS: Record<TrainingFocus, Partial<Record<AttributeKey, number>>> = {
  physique: { endurance: 1, force: 0.6, equilibre: 0.4, agilite: 0.4 },
  finition: { finition: 1, sangFroid: 0.5, tirLointain: 0.4, controle: 0.3 },
  dribble: { dribble: 1, controle: 0.6, agilite: 0.5, equilibre: 0.4 },
  vitesse: { vitesse: 1, acceleration: 0.9, agilite: 0.3 },
  jeu_de_tete: { tete: 1, detente: 0.6, force: 0.3, placement: 0.2 },
  placement: { placement: 1, vision: 0.5, travailDefensif: 0.3, sangFroid: 0.2 },
  musculation: { force: 1, equilibre: 0.5, detente: 0.4, endurance: 0.2 },
  recuperation: { endurance: 0.15 },
  tactique_individuelle: { vision: 0.8, placement: 0.7, travailDefensif: 0.4, resistancePression: 0.3, leadership: 0.2 },
  coups_de_pied_arretes: { coupsFrancs: 1, penalty: 0.8, centres: 0.4, tirLointain: 0.3 },
  passes: { passeCourte: 1, passeLongue: 0.7, vision: 0.4, centres: 0.3, controle: 0.3 },
  defense: { travailDefensif: 1, placement: 0.5, agressivite: 0.4, force: 0.3, tete: 0.3 },
  gardien_specifique: { reflexes: 1, plongeon: 0.8, unContreUn: 0.7, sortiesAeriennes: 0.6, jeuAuPied: 0.5, placement: 0.3 },
};
