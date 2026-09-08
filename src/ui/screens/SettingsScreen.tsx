import { useEffect, useRef, useState } from 'react';
import type { VoiceMode } from '../../engine/types';
import { VOICE_MODES } from '../../engine/types';
import { DIFFICULTY_LABELS } from '../../engine/config/difficulty';
import { listDatasets, importUserDataset, type DatasetEntry } from '../../data/index';
import { llmAvailable, llmLog } from '../../llm/client';
import { useSettingsStore } from '../../store/settingsStore';
import { useCareerStore } from '../../store/careerStore';
import { useUiStore } from '../../store/uiStore';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';
import Button from '../components/Button';
import SaveSlotsPanel from '../components/SaveSlotsPanel';

const VOICE_MODE_LABELS: Record<VoiceMode, string> = {
  vocal: 'Tout vocal (tu parles, ils parlent)',
  mixte: 'Mixte (ils parlent, tu écris)',
  silencieux: 'Silencieux (tout en texte)',
};

type ProxyStatus = 'inconnu' | 'injoignable' | 'sans_cle' | 'pret';

interface ProxyInfo {
  present: boolean;
  provider: 'ollama' | 'anthropic' | 'aucun';
  gratuit: boolean;
  models: { courant: string; premium: string };
  ollama: { disponible: boolean; url: string; installes: string[] };
  anthropic: { cle: boolean };
}

/** Réglages (§7, §13) : IA (clé Anthropic via le proxy local), voix, difficulté, jeux de données, sauvegardes. */
export default function SettingsScreen() {
  const settings = useSettingsStore();
  const career = useCareerStore((s) => s.career);
  const quit = useCareerStore((s) => s.quit);
  const openModal = useUiStore((s) => s.openModal);
  const toast = useUiStore((s) => s.toast);

  const [datasets, setDatasets] = useState<DatasetEntry[]>([]);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>('inconnu');
  const [info, setInfo] = useState<ProxyInfo | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refreshDatasets = () => {
    void listDatasets().then(setDatasets);
  };

  const refreshProxy = async () => {
    try {
      const res = await fetch('/api/key/status');
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as ProxyInfo;
      setInfo(body);
      settings.setApiKeyPresent(body.anthropic?.cle === true);
      setProxyStatus(body.present ? 'pret' : 'sans_cle');
    } catch {
      setInfo(null);
      settings.setApiKeyPresent(false);
      setProxyStatus('injoignable');
    }
    await llmAvailable(true);
  };

  useEffect(() => {
    refreshDatasets();
    void refreshProxy();
    // Lecture unique au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitKey = async (key: string) => {
    setKeyBusy(true);
    try {
      const res = await fetch('/api/key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setKeyInput('');
      toast({ kind: 'success', message: key ? 'Clé enregistrée sur le proxy local.' : 'Clé retirée.' });
    } catch (e) {
      toast({ kind: 'error', message: `Proxy injoignable (${e instanceof Error ? e.message : 'erreur'}). Lance « npm run server ».` });
    } finally {
      setKeyBusy(false);
      await refreshProxy();
    }
  };

  const handleImportDataset = async (file: File) => {
    try {
      const text = await file.text();
      await importUserDataset(text);
      toast({ kind: 'success', message: 'Jeu de données importé.' });
      refreshDatasets();
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Jeu de données invalide.' });
    }
  };

  const log = [...llmLog()].reverse().slice(0, 12);

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <Panel>
        <SectionTitle
          right={
            <span className={`text-[11px] uppercase tracking-wide ${info?.gratuit ? 'text-broadcast-green' : proxyStatus === 'pret' ? 'text-broadcast-yellow' : proxyStatus === 'injoignable' ? 'text-broadcast-red' : 'text-broadcast-grey'}`}>
              {info?.provider === 'ollama' ? 'Ollama local · gratuit'
                : info?.provider === 'anthropic' ? 'API Anthropic · payante'
                  : proxyStatus === 'sans_cle' ? 'Proxy en ligne, aucun modèle'
                    : proxyStatus === 'injoignable' ? 'Proxy injoignable' : '…'}
            </span>
          }
        >
          Intelligence artificielle (dialogues et narration)
        </SectionTitle>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-broadcast-grey">
            Le jeu est jouable sans rien : sans modèle, il utilise ses textes pré-écrits et un classement par mots-clés.
            Pour des dialogues générés gratuitement, lance Ollama sur ta machine, le proxy le détecte tout seul.
            Une clé Anthropic reste possible, payante, et n'apparaît jamais dans le navigateur.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.llmEnabled} onChange={(e) => settings.setLlmEnabled(e.target.checked)} />
            Utiliser l'IA quand elle est disponible
          </label>

          {info?.ollama?.disponible ? (
            <div className="border border-broadcast-green/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-broadcast-green">Modèle local, sans frais</p>
              <p className="text-xs text-broadcast-grey">Ollama répond sur {info.ollama.url}.</p>
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-broadcast-grey">Modèle utilisé</span>
                <select
                  className="input"
                  value={info.models.courant}
                  onChange={(e) => {
                    const courant = e.target.value;
                    void fetch('/api/ollama/model', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ courant }) })
                      .then(() => {
                        toast({ kind: 'success', message: `Modèle local : ${courant}.` });
                        return refreshProxy();
                      })
                      .catch(() => toast({ kind: 'error', message: 'Changement de modèle impossible.' }));
                  }}
                >
                  {info.ollama.installes.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-xs text-broadcast-grey">
                Un modèle plus gros écrit un meilleur français, un plus petit répond plus vite. Le jeu retombe sur ses textes écrits si le modèle tarde.
              </p>
            </div>
          ) : (
            <p className="text-xs text-broadcast-grey">
              Ollama n'a pas été détecté. Lance-le, puis « Vérifier » : le proxy le préfère automatiquement à l'API payante.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 grow">
              <span className="text-[11px] uppercase tracking-wide text-broadcast-grey">Clé API Anthropic (facultative, payante)</span>
              <input
                type="password"
                autoComplete="off"
                className="input w-full"
                placeholder={settings.apiKeyPresent ? 'Une clé est déjà enregistrée' : 'sk-ant-…'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && keyInput.trim()) void submitKey(keyInput.trim());
                }}
              />
            </label>
            <Button onClick={() => void submitKey(keyInput.trim())} disabled={keyBusy || !keyInput.trim()}>
              Enregistrer
            </Button>
            {settings.apiKeyPresent && (
              <Button variant="ghost" onClick={() => void submitKey('')} disabled={keyBusy}>
                Retirer
              </Button>
            )}
            <Button variant="ghost" onClick={() => void refreshProxy()} disabled={keyBusy}>
              Vérifier
            </Button>
          </div>
          {proxyStatus === 'injoignable' && (
            <p className="text-xs text-broadcast-red">
              Le proxy local ne répond pas. Ouvre un terminal dans le dossier du jeu et lance <code>npm run server</code>, puis « Vérifier ».
            </p>
          )}
          <button type="button" className="text-xs text-broadcast-grey underline" onClick={() => setShowLog((v) => !v)}>
            {showLog ? 'Masquer' : 'Afficher'} le journal des appels IA ({llmLog().length})
          </button>
          {showLog && (
            <ul className="text-xs font-mono space-y-0.5 text-broadcast-grey">
              {log.length === 0 && <li>Aucun appel pour l'instant.</li>}
              {log.map((e, i) => (
                <li key={i}>
                  {new Date(e.at).toLocaleTimeString('fr-FR')} · {e.task} · <span className={e.source === 'llm' ? 'text-broadcast-green' : e.source === 'error' ? 'text-broadcast-red' : ''}>{e.source}</span> · {e.ms} ms
                  {e.tokens ? ` · ${e.tokens} jetons` : ''}{e.detail ? ` · ${e.detail}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Voix</SectionTitle>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-broadcast-grey">Mode vocal</span>
            <select className="input" value={settings.voiceMode} onChange={(e) => settings.setVoiceMode(e.target.value as VoiceMode)}>
              {VOICE_MODES.map((m) => (
                <option key={m} value={m}>
                  {VOICE_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-broadcast-grey">Vitesse de parole ({settings.speechRate.toFixed(1)}×)</span>
            <input type="range" min={0.7} max={1.5} step={0.1} value={settings.speechRate} onChange={(e) => settings.setSpeechRate(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-broadcast-grey">Synthèse vocale</span>
            <select className="input" value={settings.ttsProvider} onChange={(e) => settings.setTtsProvider(e.target.value as 'webspeech' | 'elevenlabs')}>
              <option value="webspeech">Voix du navigateur (gratuit)</option>
              <option value="elevenlabs">ElevenLabs (clé requise)</option>
            </select>
          </label>
          {settings.ttsProvider === 'elevenlabs' && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-broadcast-grey">Clé ElevenLabs (stockée localement)</span>
              <input type="password" autoComplete="off" className="input" value={settings.elevenLabsKey} onChange={(e) => settings.setElevenLabsKey(e.target.value)} placeholder="xi-…" />
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.subtitles} onChange={(e) => settings.setSubtitles(e.target.checked)} />
            Sous-titres
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.pushToTalk} onChange={(e) => settings.setPushToTalk(e.target.checked)} />
            Micro en appui maintenu (barre espace)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.sounds} onChange={(e) => settings.setSounds(e.target.checked)} />
            Sons d'ambiance (situations, buts, sifflets)
          </label>
        </div>
        <p className="text-xs text-broadcast-grey mt-2">
          Reconnaissance vocale : celle du navigateur (fr-FR) quand elle existe, sinon enregistrement transcrit par le proxy (clé ElevenLabs requise). Tu peux toujours corriger le texte avant d'envoyer.
        </p>
      </Panel>

      <Panel>
        <SectionTitle>Difficulté</SectionTitle>
        {career ? (
          <p className="text-sm">
            <span className="font-display uppercase tracking-wide text-broadcast-yellow">{DIFFICULTY_LABELS[career.settings.difficulty]}</span>
            <span className="text-broadcast-grey"> — fixée à la création de la carrière, non modifiable en cours de route.</span>
          </p>
        ) : (
          <p className="text-sm text-broadcast-grey">Choisie lors de la création d'une carrière.</p>
        )}
      </Panel>

      <Panel>
        <SectionTitle
          right={
            <>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportDataset(file);
                  e.target.value = '';
                }}
              />
              <Button variant="ghost" onClick={() => importInputRef.current?.click()}>
                Importer un jeu de données
              </Button>
            </>
          }
        >
          Jeux de données
        </SectionTitle>
        <ul className="text-sm space-y-1">
          {datasets.map((d) => (
            <li key={d.id} className="flex justify-between border-b border-pitch-800 py-1">
              <span>{d.label}</span>
              <span className="text-broadcast-grey">{d.referenceSeason}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <SectionTitle>Sauvegardes</SectionTitle>
        <SaveSlotsPanel />
      </Panel>

      {career && (
        <Panel>
          <Button
            variant="danger"
            onClick={() =>
              openModal({
                title: 'Quitter la carrière',
                message: 'Retourner à l’écran-titre ? La carrière reste sauvegardée telle quelle.',
                confirmLabel: 'Quitter',
                danger: true,
                onConfirm: quit,
              })
            }
          >
            Quitter la carrière
          </Button>
        </Panel>
      )}
    </div>
  );
}
