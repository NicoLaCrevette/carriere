/**
 * État vivant de la carrière (§13, UI_CONTRACTS). Le moteur mute en place :
 * on clone (`structuredClone`) l'état courant, on appelle le moteur sur la
 * copie, puis on remplace la référence — React voit un nouvel objet et
 * l'ancien état reste intact si le moteur lève une exception.
 */
import { create } from 'zustand';
import type { CareerSetup, CareerState, DayResult, MatchResult } from '../engine/types';
import type { DatasetFile } from '../data/schema';
import { newCareer } from '../engine/career/newCareer';
import { advanceDay as engineAdvanceDay, completePlayerMatch as engineCompleteMatch, playerMatchOfDay, type DayChoices } from '../engine/calendar/advanceDay';
import { advanceWeek as engineAdvanceWeek, type WeekPlan, type WeekResult } from '../engine/season/week';
import { listSlots, loadSlot, saveSlot, exportSlot } from '../db/db';
import { useUiStore } from './uiStore';

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur inconnue.';
}

/**
 * Remet à zéro les états volatils liés à une carrière (match en direct, scène
 * en cours). Import différé : ces stores importent `careerStore`.
 */
function resetTransientStores(): void {
  void import('./matchStore').then((m) => m.useMatchStore.getState().reset()).catch(() => undefined);
  void import('./sceneStore').then((m) => m.useSceneStore.setState({ date: null, proposed: [], dismissed: [], active: null, busy: false, lastAnswer: null, error: null })).catch(() => undefined);
}

/** Identifiant de sauvegarde libre : `carriere-x`, puis `carriere-x-2`, `carriere-x-3`… */
async function freeSlotId(base: string): Promise<string> {
  try {
    const taken = new Set((await listSlots()).map((s) => s.id));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }
  } catch {
    // Liste illisible : on garde l'identifiant de base plutôt que d'empêcher la création.
  }
  return base;
}

/** Rend la main à l'interface entre deux journées sans passer par un timer (bridé dans un onglet en arrière-plan). */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });
}

interface CareerStore {
  career: CareerState | null;
  slotId: string | null;
  /** Dernière journée jouée, pour afficher ce qui vient de se passer. */
  lastDay: DayResult | null;
  /** Simulation en cours (création, avance de journée). */
  busy: boolean;
  error: string | null;

  startNewCareer(setup: CareerSetup, dataset: DatasetFile): Promise<void>;
  loadCareer(slotId: string): Promise<void>;
  advanceDay(choices?: DayChoices): Promise<DayResult>;
  /**
   * Mode interactif : commence la journée (entraînement, autres matchs) et s'arrête
   * avant le match du joueur. Renvoie l'id du match à jouer, ou null si la journée
   * s'est terminée normalement (pas de match du joueur aujourd'hui).
   */
  beginDay(choices?: DayChoices): Promise<string | null>;
  /** Applique le résultat du match joué par l'interface et termine la journée. */
  completePlayerMatch(result: MatchResult): Promise<DayResult>;
  /** Enchaîne les journées (entraînement par défaut) jusqu'à la veille du prochain match du joueur, sans le jouer. */
  advanceToNextMatch(): Promise<void>;
  /**
   * Joue la semaine avec le plan d'entraînement choisi et s'arrête dès qu'il se
   * passe quelque chose : match à jouer, quelqu'un qui veut te parler, fin de saison.
   */
  advanceWeek(plan: WeekPlan): Promise<WeekResult | null>;
  /** Bilan de la dernière semaine jouée. */
  lastWeek: WeekResult | null;
  /**
   * Applique une mutation du moteur (offre acceptée, sponsor, retraite…) sur une
   * copie de l'état, sauvegarde, puis remplace la référence. Renvoie le résultat de `fn`.
   */
  mutate<T>(label: string, fn: (career: CareerState) => T): Promise<T>;
  saveNow(): Promise<void>;
  exportJson(): Promise<Blob>;
  quit(): void;
  clearError(): void;
}

export const useCareerStore = create<CareerStore>((set, get) => ({
  career: null,
  slotId: null,
  lastDay: null,
  lastWeek: null,
  busy: false,
  error: null,

  async startNewCareer(setup, dataset) {
    set({ busy: true, error: null });
    // Laisse React peindre l'état « Création de la carrière… » avant le calcul synchrone.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const state = newCareer(setup, dataset);
      // `careerId` est déterministe (même joueur, même club, même jeu de données) : sans identifiant de
      // sauvegarde distinct, une nouvelle carrière écraserait silencieusement la précédente.
      const slotId = await freeSlotId(state.careerId);
      await saveSlot(slotId, state);
      set({ career: state, slotId, lastDay: null, busy: false, error: null });
      useUiStore.getState().navigate('home');
    } catch (e) {
      set({ busy: false, error: `Impossible de créer la carrière : ${messageOf(e)}` });
    }
  },

  async loadCareer(slotId) {
    set({ busy: true, error: null });
    try {
      const state = await loadSlot(slotId);
      if (!state) throw new Error('Sauvegarde introuvable.');
      resetTransientStores();
      set({ career: state, slotId, lastDay: null, busy: false, error: null });
      useUiStore.getState().navigate('home');
    } catch (e) {
      set({ busy: false, error: `Impossible de charger la sauvegarde : ${messageOf(e)}` });
    }
  },

  async advanceDay(choices) {
    const { career, slotId } = get();
    if (!career || !slotId) throw new Error('Aucune carrière chargée.');
    set({ busy: true, error: null });
    try {
      const clone = structuredClone(career);
      const result = engineAdvanceDay(clone, choices);
      await saveSlot(slotId, clone);
      set({ career: clone, lastDay: result, busy: false });
      // Match du joueur (titulaire, remplaçant entré ou resté sur le banc) : l'écran Match prend le relais.
      if (result.matchResult?.playerReport) useUiStore.getState().navigate('match');
      return result;
    } catch (e) {
      set({ busy: false, error: `Erreur pendant la journée : ${messageOf(e)}` });
      throw e;
    }
  },

  async beginDay(choices) {
    const { career, slotId } = get();
    if (!career || !slotId) throw new Error('Aucune carrière chargée.');
    set({ busy: true, error: null });
    try {
      const clone = structuredClone(career);
      const result = engineAdvanceDay(clone, { ...choices, playerMatchMode: 'interactif' });
      await saveSlot(slotId, clone);
      set({ career: clone, lastDay: result, busy: false });
      return result.pendingPlayerMatchId ?? null;
    } catch (e) {
      set({ busy: false, error: `Erreur pendant la journée : ${messageOf(e)}` });
      throw e;
    }
  },

  async completePlayerMatch(result) {
    const { career, slotId } = get();
    if (!career || !slotId) throw new Error('Aucune carrière chargée.');
    set({ busy: true, error: null });
    try {
      // Comme pour une journée : le moteur travaille sur une copie, l'état affiché ne change
      // qu'une fois la sauvegarde écrite, et une exception laisse la carrière intacte.
      const clone = structuredClone(career);
      const dayResult = engineCompleteMatch(clone, result);
      await saveSlot(slotId, clone);
      set({ career: clone, lastDay: dayResult, busy: false });
      useUiStore.getState().navigate('match');
      return dayResult;
    } catch (e) {
      set({ busy: false, error: `Erreur à la fin du match : ${messageOf(e)}` });
      throw e;
    }
  },

  async advanceWeek(plan) {
    const { career, slotId, busy } = get();
    if (!career || !slotId || busy) return null;
    // Une seule copie et une seule sauvegarde pour toute la semaine.
    const clone = structuredClone(career);
    set({ busy: true, error: null });
    let result: WeekResult | null = null;
    try {
      result = engineAdvanceWeek(clone, plan, {
        // Nouvelle référence chaque jour : la barre de progression et les jauges suivent.
        onDay: (day) => set({ career: { ...clone }, lastDay: day }),
      });
    } catch (e) {
      set({ error: `Erreur pendant la semaine : ${messageOf(e)}` });
    }
    try {
      await saveSlot(slotId, clone);
    } catch (e) {
      set({ error: `Échec de la sauvegarde : ${messageOf(e)}` });
    }
    set({ career: { ...clone }, lastWeek: result, busy: false });
    return result;
  },

  async advanceToNextMatch() {
    const { career, slotId, busy } = get();
    if (!career || !slotId || busy) return;
    // Un seul clone et une seule sauvegarde pour toute l'avance : sur une carrière avancée,
    // copier puis sérialiser l'état coûte bien plus cher que la journée elle-même.
    const clone = structuredClone(career);
    set({ busy: true, error: null });
    let navigateToMatch = false;
    try {
      for (let i = 0; i < 400; i++) {
        if (clone.retired || playerMatchOfDay(clone, clone.currentDate)) break;
        const result = engineAdvanceDay(clone);
        // Nouvelle référence pour React, sans recopier l'état.
        set({ career: { ...clone }, lastDay: result });
        if (result.matchResult?.playerReport) {
          navigateToMatch = true;
          break;
        }
        if (clone.retired) break;
        // Laisse l'UI respirer entre deux journées (barre de progression réactive).
        await yieldToUi();
      }
    } catch (e) {
      set({ error: `Erreur pendant la journée : ${messageOf(e)}` });
    }
    try {
      await saveSlot(slotId, clone);
    } catch (e) {
      set({ error: `Échec de la sauvegarde : ${messageOf(e)}` });
    }
    set({ career: { ...clone }, busy: false });
    if (navigateToMatch) useUiStore.getState().navigate('match');
  },

  async mutate(label, fn) {
    const { career, slotId, busy } = get();
    if (!career || !slotId) throw new Error('Aucune carrière chargée.');
    // Sans ce verrou, deux clics rapprochés clonent le même état et la première mutation est perdue.
    if (busy) throw new Error('Une action est déjà en cours.');
    set({ busy: true, error: null });
    try {
      const clone = structuredClone(career);
      const out = fn(clone);
      await saveSlot(slotId, clone);
      set({ career: clone, busy: false, error: null });
      return out;
    } catch (e) {
      set({ busy: false, error: `${label} : ${messageOf(e)}` });
      throw e;
    }
  },

  async saveNow() {
    const { career, slotId } = get();
    if (!career || !slotId) return;
    try {
      await saveSlot(slotId, career);
    } catch (e) {
      set({ error: `Échec de la sauvegarde : ${messageOf(e)}` });
    }
  },

  async exportJson() {
    const { slotId } = get();
    if (!slotId) throw new Error('Aucune carrière chargée.');
    return exportSlot(slotId);
  },

  quit() {
    // Un match ou une scène en cours ne doit pas survivre au changement de carrière :
    // son état serait écrit dans la sauvegarde suivante.
    resetTransientStores();
    set({ career: null, slotId: null, lastDay: null, error: null, busy: false });
    useUiStore.getState().navigate('title');
  },

  clearError() {
    set({ error: null });
  },
}));
