/**
 * Panneau de dialogue libre (§8) : réplique du PNJ (texte + voix), réponse
 * libre du joueur (clavier ou micro), analyse affichée après coup avec
 * l'impact chiffré, enchaînement des questions, interruption notée.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useCareerStore } from '../../store/careerStore';
import { useSceneStore } from '../../store/sceneStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useVoice, speech } from '../../voice/useVoice';
import { SYSTEM_VOICE, voiceFor } from '../../voice/voiceRegistry';
import { analysisBadges } from '../../llm/scenes/conversation';
import { REPUTATION_LABELS, formatSigned, humanize } from '../lib/labels';
import Button from '../components/Button';
import Panel from '../components/Panel';
import PlayerAvatar from '../components/PlayerAvatar';

export default function ConversationPanel() {
  const career = useCareerStore((s) => s.career);
  const active = useSceneStore((s) => s.active);
  const busy = useSceneStore((s) => s.busy);
  const lastAnswer = useSceneStore((s) => s.lastAnswer);
  const error = useSceneStore((s) => s.error);
  const answer = useSceneStore((s) => s.answer);
  const close = useSceneStore((s) => s.close);
  const settings = useSettingsStore();
  const voice = useVoice({ mode: settings.voiceMode, pushToTalk: settings.pushToTalk, speechRate: settings.speechRate, ttsProvider: settings.ttsProvider, elevenLabsKey: settings.elevenLabsKey });
  const [input, setInput] = useState('');
  const spoken = useRef<string>('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const lastTurn = active ? active.turns[active.turns.length - 1] : null;
  const couleursClub = career ? career.world.clubs[career.player.contract.clubId]?.colors : undefined;
  const npcVoice = career && lastTurn ? voiceFor(career, lastTurn.npcId) : null;

  // Tout à la voix : le micro s'ouvre dès que le PNJ a fini de parler.
  const mainsLibres = settings.voiceMode === 'vocal' && voice.handsFree && voice.micAvailable;

  // Chaque nouvelle réplique est lue une seule fois (clé = scène + nombre de tours, ou fin).
  useEffect(() => {
    if (!active || !lastTurn || !npcVoice || settings.voiceMode === 'silencieux') return;
    const key = active.done ? `${active.id}:fin` : `${active.id}:${active.turns.length}`;
    if (spoken.current === key) return;
    spoken.current = key;
    const text = active.done ? lastAnswer?.reply ?? '' : lastTurn.npcLine;
    if (text) {
      // Première réplique : le cadre est annoncé, sinon un joueur qui écoute sans lire ne sait ni où il est ni à qui il parle.
      const premiere = active.turns.length === 1 && !active.turns[0]!.playerText;
      if (premiere) voice.say(speech('systeme', `${active.title}. ${lastTurn.npcName}, ${humanize(lastTurn.npcKind).toLowerCase()}.`, SYSTEM_VOICE, 'haute'));
      const handle = voice.say(speech(lastTurn.npcId, text, npcVoice, 'haute', lastTurn.npcKind));
      if (mainsLibres && !active.done) {
        void handle.done.then(() => {
          if (!useSceneStore.getState().busy) voice.startListening();
        });
      }
    }
    if (!active.done) inputRef.current?.focus();
  }, [active, lastTurn, lastAnswer, npcVoice, settings.voiceMode, mainsLibres, voice]);

  useEffect(() => {
    if (settings.voiceMode === 'vocal' && voice.transcript) setInput(voice.transcript);
  }, [voice.transcript, settings.voiceMode]);

  // Fin de phrase détectée : on envoie sans passer par le clavier.
  useEffect(() => {
    const text = voice.finalTranscript.trim();
    if (!mainsLibres || !text || busy || !active || active.done) return;
    voice.clearFinal();
    setInput('');
    void answer(text, { interrupted: voice.lastInterrupted });
  }, [voice.finalTranscript, mainsLibres, busy, active, answer, voice]);

  if (!career || !active || !lastTurn) return null;

  const submit = (): void => {
    const text = input.trim();
    if (!text || busy) return;
    const interrupted = voice.lastInterrupted || !!voice.speaking;
    voice.interrupt();
    setInput('');
    voice.setTranscript('');
    void answer(text, { interrupted });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const answered = active.turns.filter((t) => t.playerText);

  return (
    <Panel accent>
      <div className="flex items-center gap-3">
        {/* Le portrait de l'interlocuteur : savoir à qui on parle avant même de lire. */}
        <PlayerAvatar id={lastTurn.npcId} {...(couleursClub ? { couleurs: couleursClub } : {})} taille={44} anneau />
        <div className="min-w-0">
          <p className="font-display uppercase tracking-wide text-accent leading-tight truncate">{active.title}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted truncate">{lastTurn.npcName} · {humanize(lastTurn.npcKind)}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-3">
        {answered.map((t, i) => (
          <li key={i} className="space-y-1">
            <p className="text-sm"><span className="text-muted">{t.npcName} :</span> « {t.npcLine} »</p>
            <p className="text-sm text-accent"><span className="text-muted">Toi :</span> « {t.playerText} »{t.interrupted ? ' (en lui coupant la parole)' : ''}</p>
            {t.analysis && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                {analysisBadges(t.analysis).map((b, j) => (
                  <span key={j} className={`rounded-full px-2 py-0.5 ring-1 ${b.good ? 'ring-signal-green/50 text-signal-green' : 'ring-signal-red/50 text-signal-red'}`}>{b.label} {b.good ? '✔' : '✘'}</span>
                ))}
                <span className="text-muted">score {t.analysis.communication_score.toFixed(1)}/10</span>
                {t.applied && Object.entries(t.applied).map(([k, v]) => (
                  <span key={k} className={`tabular-nums ${(v ?? 0) >= 0 ? 'text-signal-green' : 'text-signal-red'}`}>{REPUTATION_LABELS[k as keyof typeof REPUTATION_LABELS]} {formatSigned(v ?? 0, 1)}</span>
                ))}
                <span className="text-muted">({t.source === 'llm' ? 'IA' : 'repli'})</span>
              </div>
            )}
          </li>
        ))}
        {!active.done && (
          <li className="text-base leading-relaxed"><span className="text-muted">{lastTurn.npcName} :</span> « {lastTurn.npcLine} »</li>
        )}
        {active.done && lastAnswer?.reply && (
          <li className="text-base leading-relaxed"><span className="text-muted">{lastTurn.npcName} :</span> « {lastAnswer.reply} »</li>
        )}
      </ul>

      {!active.done ? (
        <div className="mt-3 space-y-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={busy}
            rows={2}
            placeholder={settings.voiceMode === 'vocal' ? 'Maintiens la barre espace et réponds, ou écris…' : 'Réponds librement, puis Entrée.'}
            className="input w-full resize-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={submit} disabled={busy || !input.trim()}>{busy ? 'Analyse…' : 'Répondre'}</Button>
            {voice.speaking && <Button variant="ghost" onClick={() => voice.interrupt()}>Couper la parole</Button>}
            {settings.voiceMode !== 'silencieux' && <Button variant="ghost" onClick={() => voice.replayLast()}>Réécouter</Button>}
            <Button variant="ghost" onClick={close}>Écourter</Button>
            {settings.voiceMode === 'vocal' && (
              voice.listening
                ? <span className="text-xs text-signal-red">● Parle, j'écoute…</span>
                : voice.micAvailable
                  ? (
                    <Button variant="secondary" onClick={() => voice.startListening()}>
                      {mainsLibres ? 'Reprendre la parole' : 'Parler (ou barre espace)'}
                    </Button>
                  )
                  : <span className="text-xs text-muted">Micro indisponible</span>
            )}
            {voice.error && <span className="text-xs text-signal-red">{voice.error}</span>}
          </div>
          {settings.subtitles && voice.speaking && <p className="text-xs italic text-muted">{voice.speaking.text}</p>}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <p className="text-sm text-muted">Fin de la scène.</p>
          <Button variant="secondary" onClick={close}>Terminer</Button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-signal-red">{error}</p>}
    </Panel>
  );
}
