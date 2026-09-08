/**
 * Scènes de dialogue (§8, Phase 4) : conférence de presse, interview flash,
 * vestiaire, appel de l'agent, bureau du coach. Le joueur répond librement,
 * l'analyse (LLM ou repli) est appliquée par le moteur avec ses bornes.
 * Les propositions sont recalculées par des règles déterministes et
 * remises à zéro à chaque changement de date.
 */
import { create } from 'zustand';
import type { DayResult } from '../engine/types';
import { answerScene, startScene, type AnswerResult, type ConversationState, type SceneSpec } from '../llm/scenes/conversation';
import { scenesAfterMatch, scenesForDay } from '../llm/scenes/scheduler';
import { generateHeadlines } from '../llm/narrate/press';
import { useCareerStore } from './careerStore';
import { useSettingsStore } from './settingsStore';

interface SceneStore {
  /** Date de carrière à laquelle correspondent les propositions courantes. */
  date: string | null;
  /** Scènes proposées (après un match, ou pour la journée). */
  proposed: SceneSpec[];
  /** Clés des scènes déjà jouées ou refusées à cette date. */
  dismissed: string[];
  active: ConversationState | null;
  busy: boolean;
  lastAnswer: AnswerResult | null;
  error: string | null;

  proposeAfterMatch(day: DayResult): void;
  proposeForDay(): void;
  open(spec: SceneSpec): void;
  answer(text: string, opts?: { interrupted?: boolean }): Promise<void>;
  close(): void;
  dismiss(spec: SceneSpec): void;
  /** Titres de presse du lendemain (LLM ou repli), écrits dans le rapport du match. */
  pressAfterMatch(matchId: string): Promise<void>;
}

export const sceneKey = (spec: Pick<SceneSpec, 'kind' | 'matchId' | 'topic' | 'eventId'>): string => `${spec.kind}:${spec.matchId ?? ''}:${spec.topic ?? ''}:${spec.eventId ?? ''}`;

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur inconnue.';
}

export const useSceneStore = create<SceneStore>((set, get) => {
  /** Nouvelle date de carrière : les propositions et refus de la veille ne valent plus. */
  const syncDate = (date: string): void => {
    if (get().date !== date) set({ date, proposed: [], dismissed: [], active: null, lastAnswer: null, error: null });
  };

  const merge = (incoming: SceneSpec[], keepMatchScenes: boolean): SceneSpec[] => {
    const { proposed, dismissed } = get();
    const kept = proposed.filter((s) => (keepMatchScenes ? !!s.matchId : !s.matchId));
    const seen = new Set(kept.map(sceneKey));
    const out = [...kept];
    for (const s of incoming) {
      const k = sceneKey(s);
      if (dismissed.includes(k) || seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  };

  /** Une scène obligatoire s'ouvre d'elle-même (le joueur peut toujours l'écourter). */
  const autoOpenMandatory = (): void => {
    if (get().active) return;
    const mandatory = get().proposed.find((s) => s.mandatory);
    if (mandatory) get().open(mandatory);
  };

  return {
    date: null,
    proposed: [],
    dismissed: [],
    active: null,
    busy: false,
    lastAnswer: null,
    error: null,

    proposeAfterMatch(day) {
      const career = useCareerStore.getState().career;
      if (!career) return;
      syncDate(career.currentDate);
      set({ proposed: merge(scenesAfterMatch(career, day), false) });
      autoOpenMandatory();
    },

    proposeForDay() {
      const career = useCareerStore.getState().career;
      if (!career) return;
      syncDate(career.currentDate);
      set({ proposed: merge(scenesForDay(career), true) });
      autoOpenMandatory();
    },

    open(spec) {
      const career = useCareerStore.getState().career;
      if (!career) return;
      try {
        const conv = startScene(career, spec);
        set({ active: conv, lastAnswer: null, error: null });
      } catch (e) {
        set({ error: `Impossible d'ouvrir la scène : ${messageOf(e)}` });
      }
    },

    async answer(text, opts = {}) {
      const { active, busy } = get();
      const career = useCareerStore.getState().career;
      if (!active || !career || active.done || busy) return;
      set({ busy: true, error: null });
      try {
        const result = await answerScene(career, active, text, { interrupted: opts.interrupted, useLlm: useSettingsStore.getState().llmEnabled });
        // D'abord l'état de la scène (réplique, analyse), puis la carrière mutée par le moteur
        // (réputation, citations, promesses) sous une nouvelle référence pour React, puis la sauvegarde.
        set({ active: { ...active }, lastAnswer: result, busy: false });
        useCareerStore.setState({ career: { ...career } });
        await useCareerStore.getState().saveNow();
      } catch (e) {
        set({ busy: false, error: `Erreur pendant la scène : ${messageOf(e)}` });
      }
    },

    close() {
      const { active, proposed } = get();
      if (!active) {
        set({ lastAnswer: null });
        return;
      }
      const spec = proposed.find((s) => s.kind === active.kind && (s.matchId ?? '') === (active.matchId ?? '') && (s.eventId ?? '') === (active.eventId ?? ''));
      const key = spec ? sceneKey(spec) : sceneKey({ kind: active.kind, matchId: active.matchId, eventId: active.eventId });
      set({ active: null, lastAnswer: null, dismissed: [...get().dismissed, key], proposed: proposed.filter((s) => sceneKey(s) !== key) });
    },

    dismiss(spec) {
      const key = sceneKey(spec);
      set({ dismissed: [...get().dismissed, key], proposed: get().proposed.filter((s) => sceneKey(s) !== key) });
    },

    async pressAfterMatch(matchId) {
      const career = useCareerStore.getState().career;
      if (!career) return;
      const report = career.matches[matchId]?.result?.playerReport;
      if (!report || (report.headlines && report.headlines.length > 0)) return;
      try {
        await generateHeadlines(career, matchId, useSettingsStore.getState().llmEnabled);
        useCareerStore.setState({ career: { ...career } });
        await useCareerStore.getState().saveNow();
      } catch {
        // Le titre de repli existe déjà dans le rapport : rien à faire.
      }
    },
  };
});
