/**
 * Clé d'un fournisseur hébergé, saisie depuis le jeu.
 *
 * Sans ça il fallait éditer `.env` à la main puis relancer le proxy — trop
 * d'obstacles pour quelqu'un qui veut juste coller une clé. Le proxy l'écrit
 * dans `.env` (jamais dans le dépôt, jamais dans le bundle du navigateur) et la
 * prend en compte immédiatement.
 *
 * Les fournisseurs proposés ont tous un palier gratuit. On en propose plusieurs
 * volontairement : une console peut refuser l'accès selon l'espace de travail,
 * et le jeu ne doit pas dépendre d'un compte qu'on n'arrive pas à ouvrir.
 */
import { useState } from 'react';
import Button from './Button';

interface Fournisseur {
  nom: string;
  url: string;
  courant: string;
  premium: string;
  console: string;
  note: string;
}

const FOURNISSEURS: Fournisseur[] = [
  {
    nom: 'Mistral', url: 'https://api.mistral.ai/v1',
    courant: 'mistral-small-latest', premium: 'mistral-large-latest',
    console: 'https://console.mistral.ai',
    note: 'Modèles français natifs — le meilleur choix pour ce jeu, quand la console veut bien.',
  },
  {
    nom: 'Groq', url: 'https://api.groq.com/openai/v1',
    courant: 'llama-3.3-70b-versatile', premium: 'llama-3.3-70b-versatile',
    console: 'https://console.groq.com',
    note: 'Inscription simple, très rapide à répondre.',
  },
  {
    nom: 'Google AI Studio', url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    courant: 'gemini-2.0-flash', premium: 'gemini-2.0-flash',
    console: 'https://aistudio.google.com/apikey',
    note: 'Palier gratuit généreux, bon en français, compte Google suffisant.',
  },
  {
    nom: 'Cerebras', url: 'https://api.cerebras.ai/v1',
    courant: 'llama-3.3-70b', premium: 'llama-3.3-70b',
    console: 'https://cloud.cerebras.ai',
    note: 'Palier gratuit, très rapide.',
  },
];

interface Props {
  /** Fournisseur actuellement configuré, tel que le proxy le voit. */
  actuel?: { cle: boolean; nom: string; url: string } | undefined;
  onEnregistre: () => void;
}

export default function HostedProviderForm({ actuel, onEnregistre }: Props) {
  const initial = FOURNISSEURS.find((f) => actuel?.url === f.url) ?? FOURNISSEURS[0]!;
  const [choix, setChoix] = useState<Fournisseur>(initial);
  const [cle, setCle] = useState('');
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'ok' | 'erreur'>('repos');
  const [message, setMessage] = useState('');

  const enregistrer = async (): Promise<void> => {
    setEtat('envoi');
    setMessage('');
    try {
      const res = await fetch('/api/hote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cle: cle.trim(), url: choix.url, courant: choix.courant, premium: choix.premium }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; nom?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEtat('ok');
      setCle('');
      setMessage(cle.trim() ? `${data.nom} est branché.` : 'Clé retirée.');
      onEnregistre();
    } catch (e) {
      setEtat('erreur');
      setMessage(e instanceof Error ? e.message : 'Le proxy est-il lancé ?');
    }
  };

  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3 space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted">Modèle hébergé, gratuit</p>
        <p className="mt-1 text-xs text-muted">
          Rien à installer. Crée une clé chez l’un d’eux, colle-la ici : le proxy l’écrit dans <code>.env</code>,
          elle ne passe jamais par le navigateur. Prends celui où tu arrives à ouvrir un compte.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FOURNISSEURS.map((f) => (
          <button
            key={f.nom}
            type="button"
            aria-pressed={choix.nom === f.nom}
            onClick={() => setChoix(f)}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              choix.nom === f.nom ? 'bg-accent text-ink-950 font-semibold' : 'ring-1 ring-white/10 text-muted hover:text-white hover:ring-white/25'
            }`}
          >
            {f.nom}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted">
        {choix.note}{' '}
        <a href={choix.console} target="_blank" rel="noreferrer" className="text-accent underline">
          Créer une clé ↗
        </a>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          className="input flex-1 min-w-48"
          value={cle}
          onChange={(e) => setCle(e.target.value)}
          placeholder={actuel?.cle ? `Clé ${actuel.nom} enregistrée — en coller une autre` : `Clé ${choix.nom}…`}
          aria-label={`Clé ${choix.nom}`}
        />
        <Button onClick={() => void enregistrer()} disabled={etat === 'envoi'}>
          {etat === 'envoi' ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      <p className="text-[11px] text-muted">
        Modèle : <code>{choix.courant}</code>
      </p>
      {message && (
        <p className={`text-xs ${etat === 'erreur' ? 'text-signal-red' : 'text-signal-green'}`}>{message}</p>
      )}
    </div>
  );
}
