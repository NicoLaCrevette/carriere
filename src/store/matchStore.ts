/**
 * Match interactif minute par minute (§5, Phase 3). Le moteur décide de tout ;
 * ce store orchestre : situation → réponse libre → classification (mots-clés
 * ou LLM) → résolution → narration → situation suivante, avec sauvegarde à
 * chaque situation pour reprendre après rechargement.
 *
 * Chrono de décision : le moteur ne donne qu'une durée nue ; c'est ici qu'on
 * l'adapte au joueur qui parle (durée allongée, armement seulement après la
 * lecture à haute voix via `armDeadline()`, prolongation si le micro l'entend
 * encore au moment de l'échéance).
 */
import { create } from 'zustand';
import type { ActionOutcome, ClassifiedAction, MatchContext, MatchResult, MatchState, Situation } from '../engine/types';
import { advanceUntilSituation, applyDecision, createMatchState, finishMatch, resumeMatchState, runMatchAuto } from '../engine/match/simulateMatch';
import { buildContextFor } from '../engine/calendar/advanceDay';
import { autoDecide } from '../engine/match/autoplay';
import { BALANCE } from '../engine/config/balance';
import { rngFor } from '../engine/rng/derive';
import { classifyIntent } from '../llm/classify/intent';
import { describeSituation, matchNames, narrateOutcome } from '../llm/narrate/match';
import type { NarrationLine } from '../llm/schemas';
import { useCareerStore } from './careerStore';
import { useSettingsStore } from './settingsStore';

export type LivePhase = 'idle' | 'running' | 'awaiting' | 'resolving' | 'narrated' | 'finished';

const S = BALANCE.situations;

/**
 * Durée du chrono de cette situation, en millisecondes (null = chrono coupé).
 *
 * Le moteur ne fournit qu'un chrono NU (`situation.timerSeconds`), pensé pour
 * un joueur qui écrit. Le multiplicateur et le plancher ne valent donc que pour
 * le mode « vocal », où répondre demande de formuler une phrase à l'oral puis
 * d'attendre la détection de fin de phrase. En « mixte » (les PNJ parlent, le
 * joueur écrit) le chrono nu suffit : il démarre simplement après l'annonce.
 */
/** Adapte une durée nue au mode de jeu : parler prend plus de temps qu'écrire. */
function adapteALaVoix(secondes: number): number {
  if (useSettingsStore.getState().voiceMode !== 'vocal') return secondes * 1000;
  return Math.max(secondes * S.voiceTimerMultiplier, S.voiceTimerMinimumSeconds) * 1000;
}

function timerMsFor(situation: Situation): number | null {
  const career = useCareerStore.getState().career;
  if (!(career?.settings.decisionTimer ?? true)) return null;
  return adapteALaVoix(situation.timerSeconds);
}

/** Reprise d'une situation déjà écoulée : le temps de réagir, adapté à la voix lui aussi. */
function graceMs(): number {
  return adapteALaVoix(S.graceOnResumeSeconds);
}

interface MatchStore {
  phase: LivePhase;
  ctx: MatchContext | null;
  ms: MatchState | null;
  situation: Situation | null;
  situationText: string;
  situationSource: 'llm' | 'fallback';
  narration: NarrationLine[];
  narrationSource: 'llm' | 'fallback';
  lastOutcome: ActionOutcome | null;
  lastAction: ClassifiedAction | null;
  lastInput: string;
  intentSource: 'mots-cles' | 'llm' | 'defaut';
  /** Échéance du timer de décision (ms epoch), null si désactivé ou pas encore armé. */
  deadline: number | null;
  /** Durée totale du chrono en cours (secondes) : dénominateur de la jauge. */
  timerTotalSeconds: number;
  /** Nombre de prolongations accordées sur la situation en cours (le joueur parlait). */
  graceExtensions: number;
  /** Compteur de version : le moteur mute `ms` en place, ce compteur force le rendu. */
  tick: number;
  result: MatchResult | null;
  error: string | null;

  start(): Promise<void>;
  answer(text: string, opts?: { timedOut?: boolean; interrupted?: boolean }): Promise<void>;
  continueMatch(): Promise<void>;
  skipToEnd(): Promise<void>;
  /**
   * Démarre le chrono maintenant. À la voix, l'écran l'appelle quand la
   * situation a fini d'être LUE : sinon le chrono courait pendant l'annonce.
   * Sans effet si un chrono est déjà armé (relire ou rouvrir ne rend pas de temps).
   */
  armDeadline(): void;
  /**
   * Le chrono expire alors que le joueur est en train de parler : on repousse
   * l'échéance du délai de grâce plutôt que de couper sa phrase. Faux si le
   * quota de prolongations est épuisé (l'écran valide alors par défaut).
   */
  extendDeadlineWhileSpeaking(): boolean;
  reset(): void;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur inconnue.';
}

function useLlm(): boolean {
  return useSettingsStore.getState().llmEnabled;
}

export const useMatchStore = create<MatchStore>((set, get) => {
  /** Le moteur mute `ms` en place : on ne le copie jamais (deux objets divergeraient), on incrémente la version. */
  const bump = (): void => set((s) => ({ tick: s.tick + 1 }));

  /** Durée du chrono préparée par `present()` et posée plus tard par `armDeadline()` (null : rien à armer). */
  let chronoEnAttenteMs: number | null = null;

  async function persist(): Promise<void> {
    const { ms } = get();
    const career = useCareerStore.getState().career;
    if (!career || !ms) return;
    career.liveMatch = ms;
    await useCareerStore.getState().saveNow();
  }

  async function present(situation: Situation): Promise<void> {
    const { ctx, ms } = get();
    if (!ctx || !ms) return;
    const career = useCareerStore.getState().career ?? undefined;
    set({ phase: 'running', situation, narration: [], lastOutcome: null, lastAction: null });
    bump();
    const described = await describeSituation(situation, ctx, ms, career, useLlm());
    const totalMs = timerMsFor(situation);
    // Une situation déjà présentée garde son échéance : rouvrir l'écran ne rend pas
    // du temps ; si elle était écoulée, juste le temps de réagir.
    const dejaPresentee = ms.situationDeadlineAt !== undefined;
    const reprise = dejaPresentee && ms.situationDeadlineAt! > Date.now();
    const dureeMs = totalMs === null ? null : dejaPresentee ? graceMs() : totalMs;
    // La situation va être lue à haute voix : on n'arme rien ici, l'écran appellera
    // armDeadline() à la fin de la lecture. Sinon personne ne parle : le chrono part tout de suite.
    const lue = useSettingsStore.getState().voiceMode !== 'silencieux';
    const deadline = reprise ? ms.situationDeadlineAt!
      : dureeMs !== null && !lue ? Date.now() + dureeMs
        : null;
    chronoEnAttenteMs = deadline === null ? dureeMs : null;
    if (deadline !== null) ms.situationDeadlineAt = deadline;
    set({
      phase: 'awaiting',
      situationText: described.text,
      situationSource: described.source,
      deadline,
      // La jauge part toujours pleine : reprise et grâce ont leur propre durée.
      timerTotalSeconds: deadline !== null ? (deadline - Date.now()) / 1000 : (dureeMs ?? 0) / 1000,
      graceExtensions: 0,
    });
    await persist();
  }

  async function finish(): Promise<void> {
    const { ctx, ms } = get();
    if (!ctx || !ms) return;
    const result = finishMatch(ms, ctx);
    set({ phase: 'finished', result, situation: null, deadline: null });
    bump();
    try {
      await useCareerStore.getState().completePlayerMatch(result);
    } catch (e) {
      set({ error: messageOf(e) });
    }
  }

  async function advance(): Promise<void> {
    const { ctx, ms } = get();
    if (!ctx || !ms) return;
    set({ phase: 'running', situation: null, deadline: null });
    const step = advanceUntilSituation(ms, ctx);
    if ('finished' in step) {
      await finish();
      return;
    }
    await present(step.situation);
  }

  return {
    phase: 'idle',
    ctx: null,
    ms: null,
    situation: null,
    situationText: '',
    situationSource: 'fallback',
    narration: [],
    narrationSource: 'fallback',
    lastOutcome: null,
    lastAction: null,
    lastInput: '',
    intentSource: 'defaut',
    deadline: null,
    timerTotalSeconds: 0,
    graceExtensions: 0,
    tick: 0,
    result: null,
    error: null,

    async start() {
      const career = useCareerStore.getState().career;
      if (!career?.pendingDay) {
        set({ error: 'Aucun match en attente : commence la journée d\'abord.' });
        return;
      }
      const match = career.matches[career.pendingDay.matchId];
      if (!match) {
        set({ error: 'Match introuvable.' });
        return;
      }
      try {
        const ctx = buildContextFor(career, match, 'interactif');
        const pid = career.player.id;
        const side = ctx.playerSide;
        const inSquad = !!side && (ctx[side].lineup.starters.includes(pid) || ctx[side].lineup.bench.includes(pid));
        if (!inSquad) {
          // Tribune : pas de décision à prendre, le match se joue tout seul.
          const result = runMatchAuto(ctx);
          set({ ctx, ms: null, phase: 'finished', result, error: null });
          await useCareerStore.getState().completePlayerMatch(result);
          return;
        }
        const saved = career.liveMatch && career.liveMatch.matchId === match.id ? career.liveMatch : null;
        const ms = saved ? resumeMatchState(saved, ctx) : createMatchState(ctx);
        set({ ctx, ms, phase: 'running', result: null, narration: [], lastOutcome: null, lastAction: null, error: null, situation: null, deadline: null });
        bump();
        if (ms.pendingSituation) await present(ms.pendingSituation);
        else await advance();
      } catch (e) {
        set({ error: `Impossible de lancer le match : ${messageOf(e)}` });
      }
    },

    async answer(text, opts = {}) {
      const { phase, ctx, ms, situation } = get();
      if (phase !== 'awaiting' || !ctx || !ms || !situation) return;
      chronoEnAttenteMs = null;
      set({ phase: 'resolving', deadline: null, graceExtensions: 0, lastInput: text });
      const career = useCareerStore.getState().career ?? undefined;
      try {
        let action: ClassifiedAction = situation.defaultAction;
        let source: MatchStore['intentSource'] = 'defaut';
        if (!opts.timedOut && text.trim().length > 0) {
          const intent = await classifyIntent(text, situation, matchNames(ctx), { useLlm: useLlm() });
          action = intent.action;
          source = intent.source;
        }
        const outcome = applyDecision(ms, ctx, situation, action, text, !!opts.timedOut);
        // La décision est prise : la prochaine situation repart sur un chrono neuf.
        delete ms.situationDeadlineAt;
        const narrated = await narrateOutcome(situation, action, outcome, ctx, ms, career, useLlm());
        set({ phase: 'narrated', lastOutcome: outcome, lastAction: action, intentSource: source, narration: narrated.lines, narrationSource: narrated.source });
        bump();
        await persist();
      } catch (e) {
        set({ phase: 'awaiting', error: `Erreur pendant la résolution : ${messageOf(e)}` });
      }
    },

    armDeadline() {
      const { phase, ms, situation, deadline } = get();
      // Une seule fois par situation : relire l'annonce ou rouvrir l'écran ne rend pas de temps.
      if (phase !== 'awaiting' || !ms || !situation || deadline !== null) return;
      const totalMs = chronoEnAttenteMs;
      if (totalMs === null) return;
      chronoEnAttenteMs = null;
      const at = Date.now() + totalMs;
      ms.situationDeadlineAt = at;
      set({ deadline: at, timerTotalSeconds: totalMs / 1000, graceExtensions: 0 });
      void persist();
    },

    extendDeadlineWhileSpeaking() {
      const { phase, ms, deadline, graceExtensions } = get();
      if (phase !== 'awaiting' || !ms || deadline === null) return false;
      if (graceExtensions >= S.voiceGraceMaxExtensions) return false;
      const at = Date.now() + S.voiceGraceSeconds * 1000;
      ms.situationDeadlineAt = at;
      set({ deadline: at, timerTotalSeconds: S.voiceGraceSeconds, graceExtensions: graceExtensions + 1 });
      return true;
    },

    async continueMatch() {
      const { phase, ms } = get();
      if (phase !== 'narrated' || !ms) return;
      if (ms.pendingSituation) await present(ms.pendingSituation);
      else await advance();
    },

    async skipToEnd() {
      const { ctx, ms, phase } = get();
      if (!ctx || !ms || phase === 'finished' || phase === 'idle') return;
      set({ phase: 'running', deadline: null, situation: null });
      bump();
      for (let guard = 0; guard < 300; guard++) {
        const step = advanceUntilSituation(ms, ctx);
        if ('finished' in step) break;
        const rng = rngFor(ctx.seed, { scope: `${ctx.match.id}:aux`, index: ms.actionIndex * 10 + (ms.tickActions ?? 0) });
        applyDecision(ms, ctx, step.situation, autoDecide(step.situation, ctx, ms, rng), '', false);
      }
      await finish();
    },

    reset() {
      set({ phase: 'idle', ctx: null, ms: null, situation: null, situationText: '', narration: [], lastOutcome: null, lastAction: null, deadline: null, timerTotalSeconds: 0, graceExtensions: 0, result: null, error: null });
    },
  };
});
