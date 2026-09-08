/**
 * Match en direct (§5, Phase 3) : score et chrono, note en direct, flux des
 * événements, situation présentée au joueur, réponse libre (clavier ou voix),
 * timer de décision, narration de l'issue, enchaînement. Aucune logique de
 * jeu ici : tout vient du store de match et du moteur.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { CareerState, MatchEvent, VoiceProfile } from '../../engine/types';
import { BALANCE } from '../../engine/config/balance';
import { useCareerStore } from '../../store/careerStore';
import { useMatchStore } from '../../store/matchStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useVoice, speech } from '../../voice/useVoice';
import { COMMENTATOR_VOICE, CROWD_VOICE, effectiveVoice, SYSTEM_VOICE, voiceFor } from '../../voice/voiceRegistry';
import type { NarrationLine } from '../../llm/schemas';
import { eventLabel, formatSigned } from '../lib/labels';
import { acteursDe } from '../lib/eventText';
import { playCue } from '../lib/sounds';
import Button from '../components/Button';
import Panel from '../components/Panel';
import NumberTabular from '../components/NumberTabular';
import ActionExplain from '../components/ActionExplain';

/** Temps forts du fil : ce qui change le match, pas chaque faute. */
const HIGHLIGHT_TYPES: ReadonlySet<MatchEvent['type']> = new Set([
  'coup_d_envoi', 'but', 'but_csc', 'penalty_marque', 'penalty_rate', 'penalty_arrete', 'poteau', 'grosse_occasion', 'passe_decisive',
  'carton_jaune', 'carton_rouge', 'var_but_refuse', 'var_penalty', 'var_rouge', 'remplacement', 'blessure', 'changement_tactique',
  'marquage_individuel', 'mi_temps', 'temps_additionnel', 'coup_de_sifflet_final', 'consigne_coach', 'replique_capitaine',
]);

const SPEAKER_LABELS: Record<NarrationLine['speaker'], string> = {
  commentateur: 'Commentateur', coach: 'Coach', capitaine: 'Capitaine', coequipier: 'Coéquipier', public: 'Public', adversaire: 'Adversaire', arbitre: 'Arbitre',
};

function nameOf(career: CareerState, id: string | undefined): string {
  if (!id) return '';
  if (id === career.player.id) return career.player.identity.lastName;
  const npc = career.world.npcPlayers[id];
  return npc ? npc.identity.lastName : '';
}

/** Voix d'un intervenant de la narration : PNJ réels du club quand ils existent. */
function voiceForSpeaker(career: CareerState, speaker: NarrationLine['speaker']): { npcId: string; voice: VoiceProfile } {
  const club = career.world.clubs[career.player.contract.clubId];
  if (speaker === 'coach' && club) return { npcId: club.coachId, voice: voiceFor(career, club.coachId) };
  if (speaker === 'capitaine') {
    const cap = Object.values(career.world.npcs).find((n) => n.kind === 'capitaine' && n.clubId === club?.id);
    if (cap) return { npcId: cap.id, voice: voiceFor(career, cap.id) };
    return { npcId: 'capitaine', voice: effectiveVoice(SYSTEM_VOICE, 'capitaine', 'capitaine') };
  }
  if (speaker === 'public') return { npcId: 'public', voice: CROWD_VOICE };
  if (speaker === 'commentateur') return { npcId: 'commentateur', voice: COMMENTATOR_VOICE };
  // Coéquipier, adversaire, arbitre : chacun sa voix, stable d'un match à l'autre.
  const kind = speaker === 'coequipier' ? 'coequipier' : speaker === 'adversaire' ? 'adversaire' : undefined;
  return { npcId: speaker, voice: effectiveVoice({ ...SYSTEM_VOICE, gender: 'homme', timbre: speaker }, speaker, kind) };
}

function EventRow({ e, career }: { e: MatchEvent; career: CareerState }) {
  const who = acteursDe(e, (id) => nameOf(career, id));
  return (
    <li className={`flex gap-2 text-xs py-0.5 ${e.involvesPlayer ? 'text-accent' : 'text-muted'}`}>
      <span className="w-8 shrink-0 tabular-nums">{e.minute}'</span>
      <span>{eventLabel(e.type)}{who ? ` — ${who}` : ''}</span>
    </li>
  );
}

export default function LiveMatch() {
  const career = useCareerStore((s) => s.career);
  const phase = useMatchStore((s) => s.phase);
  const ctx = useMatchStore((s) => s.ctx);
  const ms = useMatchStore((s) => s.ms);
  const situation = useMatchStore((s) => s.situation);
  const situationText = useMatchStore((s) => s.situationText);
  const situationSource = useMatchStore((s) => s.situationSource);
  const narration = useMatchStore((s) => s.narration);
  const narrationSource = useMatchStore((s) => s.narrationSource);
  const lastOutcome = useMatchStore((s) => s.lastOutcome);
  const lastAction = useMatchStore((s) => s.lastAction);
  const intentSource = useMatchStore((s) => s.intentSource);
  const deadline = useMatchStore((s) => s.deadline);
  const timerTotalSeconds = useMatchStore((s) => s.timerTotalSeconds);
  const graceExtensions = useMatchStore((s) => s.graceExtensions);
  const tick = useMatchStore((s) => s.tick);
  const error = useMatchStore((s) => s.error);
  const answer = useMatchStore((s) => s.answer);
  const continueMatch = useMatchStore((s) => s.continueMatch);
  const skipToEnd = useMatchStore((s) => s.skipToEnd);
  const extendDeadlineWhileSpeaking = useMatchStore((s) => s.extendDeadlineWhileSpeaking);

  const settings = useSettingsStore();
  const voice = useVoice({ mode: settings.voiceMode, pushToTalk: settings.pushToTalk, speechRate: settings.speechRate, ttsProvider: settings.ttsProvider, elevenLabsKey: settings.elevenLabsKey });
  const [input, setInput] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [highlightsOnly, setHighlightsOnly] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const spokenSituation = useRef<string>('');
  const spokenNarration = useRef<NarrationLine[] | null>(null);
  const cuedEvents = useRef<number>(0);
  const timerCued = useRef<string>('');
  /** Instant d'affichage de la situation courante : ce qui a été entendu avant ne la concerne pas. */
  const presentedAt = useRef<number>(0);
  /** Dernier instant où le micro a entendu quelque chose, et où une phrase terminée est arrivée. */
  const heardAt = useRef<number>(0);
  /** Filet de sécurité d'armement du chrono : annulé à la fin de la lecture et au démontage. */
  const watchdogRef = useRef<number>(0);
  const finalAt = useRef<number>(0);

  // Sons d'ambiance : nouveaux événements (buts, cartons, sifflets) et coup de sifflet final au démontage.
  useEffect(() => {
    if (!ms || !ctx) return;
    const events = ms.events;
    if (cuedEvents.current > events.length) cuedEvents.current = 0;
    const mine = ctx.playerSide ?? 'home';
    for (let i = cuedEvents.current; i < events.length; i++) {
      const e = events[i]!;
      if (e.type === 'but' || e.type === 'penalty_marque' || e.type === 'but_csc') playCue(e.side === mine ? 'but' : 'but_adverse');
      else if (e.type === 'carton_jaune' || e.type === 'carton_rouge') playCue('carton');
      else if (e.type === 'mi_temps' || e.type === 'coup_d_envoi') playCue('sifflet');
    }
    cuedEvents.current = events.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ctx, tick]);
  useEffect(() => () => {
    // Quitter l'écran ne doit pas laisser un chrono s'armer dans le vide.
    window.clearTimeout(watchdogRef.current);
    if (useMatchStore.getState().phase === 'finished') playCue('fin');
  }, []);

  // Timer de décision.
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadline]);
  // Horodatage de ce que le micro entend : sert à distinguer « le joueur parle
  // maintenant » d'une transcription laissée par la situation précédente.
  useEffect(() => {
    if (voice.transcript.trim()) heardAt.current = Date.now();
  }, [voice.transcript]);
  useEffect(() => {
    if (voice.finalTranscript.trim()) finalAt.current = Date.now();
  }, [voice.finalTranscript]);

  // Échéance atteinte. On ne coupe jamais une phrase en cours : tant que le
  // micro entend le joueur, on repousse (quota limité) au lieu de valider
  // l'action par défaut à sa place. Quota épuisé, on prend ce qu'il a dit
  // jusque-là — ses mots valent mieux que l'action par défaut.
  useEffect(() => {
    if (!deadline || phase !== 'awaiting' || now < deadline) return;
    const heard = voice.transcript.trim();
    const parle = voice.listening && heard.length > 0
      && now - heardAt.current < BALANCE.situations.voiceRecentSpeechSeconds * 1000;
    if (parle && extendDeadlineWhileSpeaking()) return;
    // Le joueur a déjà dit ou écrit quelque chose : on l'envoie. L'action par
    // défaut n'est pour ceux qui n'ont rien dit du tout, jamais pour effacer
    // des mots déjà donnés (y compris en mode mixte, où l'on écrit).
    const enAttente = input.trim() || voice.finalTranscript.trim() || heard;
    setInput('');
    if (enAttente) void answer(enAttente, { interrupted: voice.lastInterrupted });
    else void answer('', { timedOut: true });
  }, [now, deadline, phase, answer, input, voice.listening, voice.transcript, voice.finalTranscript, voice.lastInterrupted, extendDeadlineWhileSpeaking]);

  // Voix : situation puis narration, une seule fois chacune.
  // Tout à la voix : le micro s'ouvre dès que la situation a été annoncée.
  const mainsLibres = settings.voiceMode === 'vocal' && voice.handsFree && voice.micAvailable;

  useEffect(() => {
    // Garde indexée sur l'identifiant de la situation : deux situations qui s'enchaînent
    // peuvent porter exactement le même texte (même minute, même repli).
    const situationId = situation?.id ?? '';
    if (!career || phase !== 'awaiting' || !situationText || !situationId || situationId === spokenSituation.current) return;
    spokenSituation.current = situationId;
    presentedAt.current = Date.now();
    playCue('situation');
    if (settings.voiceMode !== 'silencieux') {
      // Le chrono ne part qu'une fois la situation lue : sinon il courait pendant
      // qu'on parlait au joueur, et il ne lui restait rien pour répondre.
      // (armDeadline() est sans effet si la situation a changé entre-temps.)
      const forId = situationId;
      const armIfCurrent = (): void => {
        const st = useMatchStore.getState();
        if (st.phase === 'awaiting' && st.situation?.id === forId) st.armDeadline();
      };
      const handle = voice.say(speech('commentateur', situationText.replace(/^\d+' — /, ''), COMMENTATOR_VOICE, 'haute'));
      // Filet de sécurité si le TTS ne signale jamais la fin (voix absente, onglet en arrière-plan).
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = window.setTimeout(armIfCurrent, BALANCE.situations.voiceReadingWatchdogSeconds * 1000);
      void handle.done.then(() => {
        window.clearTimeout(watchdogRef.current);
        armIfCurrent();
        if (mainsLibres && useMatchStore.getState().phase === 'awaiting') voice.startListening();
      });
    } else if (mainsLibres) {
      voice.startListening();
    }
    inputRef.current?.focus();
  }, [career, phase, situationText, settings.voiceMode, mainsLibres, voice]);

  // Fin de phrase détectée : la décision part sans toucher au clavier. Une phrase
  // arrivée avant l'affichage de cette situation appartient à la précédente :
  // elle ne doit surtout pas répondre à celle-ci sans que le joueur ait parlé.
  useEffect(() => {
    const text = voice.finalTranscript.trim();
    if (!mainsLibres || !text || phase !== 'awaiting') return;
    if (finalAt.current < presentedAt.current) {
      voice.clearFinal();
      return;
    }
    voice.clearFinal();
    setInput('');
    void answer(text, { interrupted: voice.lastInterrupted });
  }, [voice.finalTranscript, mainsLibres, phase, answer, voice]);
  useEffect(() => {
    if (!career || phase !== 'narrated' || narration === spokenNarration.current) return;
    spokenNarration.current = narration;
    if (settings.voiceMode === 'silencieux') return;
    for (const line of narration) {
      const v = voiceForSpeaker(career, line.speaker);
      voice.say(speech(v.npcId, line.text, v.voice));
    }
  }, [career, phase, narration, settings.voiceMode, voice]);
  // Transcription vocale → champ de réponse.
  useEffect(() => {
    if (settings.voiceMode === 'vocal' && voice.transcript) setInput(voice.transcript);
  }, [voice.transcript, settings.voiceMode]);
  // Entrée pour continuer après la narration.
  useEffect(() => {
    if (phase !== 'narrated') return;
    const handler = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        void continueMatch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, continueMatch]);

  const remaining = useMemo(() => (deadline ? Math.max(0, deadline - now) / 1000 : null), [deadline, now]);
  // Dernières secondes du timer : un bip, une seule fois par situation.
  useEffect(() => {
    if (remaining === null || phase !== 'awaiting' || remaining > 3 || !situation) return;
    if (timerCued.current === situation.id) return;
    timerCued.current = situation.id;
    playCue('timer');
  }, [remaining, phase, situation]);
  const feed = useMemo(() => {
    if (!ms) return [];
    const source = highlightsOnly ? ms.events.filter((e) => e.involvesPlayer || HIGHLIGHT_TYPES.has(e.type)) : ms.events;
    return source.slice(-10).reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, tick, highlightsOnly]);

  if (!career || !ctx || !ms) return null;
  const home = ctx.home.club;
  const away = ctx.away.club;
  const lastLog = ms.ratingLog[ms.ratingLog.length - 1];
  const onPitch = ms.playerOnPitch;
  const side = ctx.playerSide ?? 'home';
  const momentum = ms.momentum * (side === 'home' ? 1 : -1);

  const submit = (): void => {
    const text = input.trim();
    const interrupted = voice.lastInterrupted;
    setInput('');
    voice.interrupt();
    void answer(text, { interrupted });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="p-4 space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-signal-red px-2.5 py-0.5 text-[10px] font-display uppercase tracking-widest">En direct</span>
            <span className="font-display uppercase tracking-wide text-2xl">
              {home.shortName} <NumberTabular value={ms.homeGoals} className="mx-1 text-accent" /> - <NumberTabular value={ms.awayGoals} className="mx-1 text-accent" /> {away.shortName}
            </span>
            <span className="tabular-nums text-muted">{ms.minute}{ms.addedTime ? `+${ms.addedTime}` : ''}'</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted">Note</p>
              <p className="font-display text-2xl tabular-nums">{ms.playerRating.toFixed(1)}</p>
            </div>
            {lastLog && (
              <p className={`text-xs tabular-nums ${lastLog.delta >= 0 ? 'text-signal-green' : 'text-signal-red'}`}>
                {formatSigned(lastLog.delta, 2)} {lastLog.reason}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full rounded-full bg-signal-green transition-all duration-500" style={{ width: `${Math.round(50 + momentum * 50)}%` }} title="Momentum" />
        </div>
        {!onPitch && phase !== 'finished' && <p className="mt-2 text-xs text-muted">Tu es sur le banc. Le coach t'observe.</p>}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          {phase === 'running' && <p className="text-sm text-muted">Le match se joue…</p>}
          {(phase === 'awaiting' || phase === 'resolving') && situation && (
            <div className="space-y-3">
              <p className="text-lg leading-relaxed">{situationText || 'Une situation se présente…'}</p>
              {remaining !== null && phase === 'awaiting' && timerTotalSeconds > 0 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                  <div className={`h-full rounded-full transition-all ${remaining < 3 ? 'bg-signal-red' : 'bg-accent'}`} style={{ width: `${Math.round(Math.min(1, remaining / timerTotalSeconds) * 100)}%` }} />
                </div>
              )}
              {phase === 'awaiting' && deadline === null && timerTotalSeconds > 0 && settings.voiceMode !== 'silencieux' && (
                <p className="text-[10px] uppercase tracking-wide text-muted">Écoute… le chrono partira à la fin de l'annonce.</p>
              )}
              {phase === 'awaiting' && graceExtensions > 0 && (
                <p className="text-[10px] uppercase tracking-wide text-muted">Temps prolongé — tu es en train de parler ({graceExtensions}/{BALANCE.situations.voiceGraceMaxExtensions})</p>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                disabled={phase !== 'awaiting'}
                placeholder={mainsLibres ? 'Parle, je t\'écoute — ou écris ici…' : settings.voiceMode === 'vocal' ? 'Maintiens la barre espace et parle, ou écris ici…' : 'Que fais-tu ? Écris librement, puis Entrée.'}
                rows={2}
                className="input w-full resize-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={submit} disabled={phase !== 'awaiting'}>{phase === 'resolving' ? 'Résolution…' : 'Envoyer'}</Button>
                <Button variant="secondary" onClick={() => { setInput(''); void answer('', { timedOut: true }); }} disabled={phase !== 'awaiting'}>Laisser faire</Button>
                {settings.voiceMode === 'vocal' && (
                  voice.listening
                    ? <span className="text-xs text-signal-red">● Parle, j'écoute…</span>
                    : voice.micAvailable
                      ? <Button variant="secondary" onClick={() => voice.startListening()} disabled={phase !== 'awaiting'}>{mainsLibres ? 'Reprendre la parole' : 'Parler (ou espace)'}</Button>
                      : <span className="text-xs text-muted">Micro indisponible</span>
                )}
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted">Texte : {situationSource === 'llm' ? 'IA' : 'repli'}</span>
              </div>
              {voice.error && <p className="text-xs text-signal-red">{voice.error}</p>}
            </div>
          )}
          {phase === 'narrated' && lastOutcome && (
            <div className="space-y-3">
              <ul className="space-y-1">
                {narration.map((line, i) => (
                  <li key={i} className="text-base leading-relaxed">
                    <span className={`mr-2 text-[10px] uppercase tracking-wide ${line.speaker === 'commentateur' ? 'text-accent' : 'text-muted'}`}>{SPEAKER_LABELS[line.speaker]}</span>
                    {line.text}
                  </li>
                ))}
              </ul>
              <ActionExplain outcome={lastOutcome} action={lastAction ?? undefined} />
              <p className="text-[11px] text-muted">
                <span className={lastOutcome.ratingDelta >= 0 ? 'text-signal-green' : 'text-signal-red'}>{formatSigned(lastOutcome.ratingDelta, 2)}</span> {lastOutcome.ratingReason}
                <span className="ml-2">({intentSource === 'llm' ? 'IA' : intentSource === 'mots-cles' ? 'mots-clés' : 'défaut'} · narration {narrationSource === 'llm' ? 'IA' : 'repli'})</span>
              </p>
              <Button onClick={() => void continueMatch()}>Continuer ↵</Button>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-signal-red">{error}</p>}
        </Panel>

        <Panel>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted">Fil du match</p>
            <button type="button" className="text-[10px] uppercase tracking-wide text-muted hover:text-white" onClick={() => setHighlightsOnly((v) => !v)}>
              {highlightsOnly ? 'Temps forts · tout voir' : 'Tout · temps forts'}
            </button>
          </div>
          <ul>{feed.map((e, i) => <EventRow key={`${e.minute}-${e.seq}-${i}`} e={e} career={career} />)}</ul>
          {ms.summaryLines.length > 0 && <p className="mt-2 text-xs italic text-muted">{ms.summaryLines[ms.summaryLines.length - 1]!.text}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" onClick={() => void skipToEnd()} disabled={phase === 'resolving'}>Simuler la fin du match</Button>
            {voice.speaking && <Button variant="ghost" onClick={() => voice.interrupt()}>Couper la parole</Button>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
