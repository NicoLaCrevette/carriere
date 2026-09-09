/**
 * Écoute d'un exemple de voix depuis les Réglages.
 *
 * Sans ça, la seule façon de savoir à quoi ressemblent les PNJ était de lancer
 * une carrière et d'attendre qu'on te parle. On peut désormais entendre le
 * coach, une journaliste, l'agent et sa mère en un clic, et voir quel
 * fournisseur est réellement utilisé.
 */
import { useEffect, useState } from 'react';
import type { NpcKind } from '../../engine/types';
import { effectiveVoice, resolveEdgeVoice, SYSTEM_VOICE } from '../../voice/voiceRegistry';
import Button from './Button';

interface Exemple {
  kind: NpcKind;
  npcId: string;
  label: string;
  texte: string;
}

/** Quatre rôles très différents : si ceux-là se distinguent, les autres aussi. */
const EXEMPLES: Exemple[] = [
  { kind: 'coach', npcId: 'apercu-coach', label: 'Le coach', texte: "Tu rentres à la place d'Édouard. Tu joues devant, et tu me presses le porteur. C'est clair ?" },
  { kind: 'journaliste', npcId: 'apercu-journaliste', label: 'Une journaliste', texte: 'Un nul un partout contre Toulouse. Deux points perdus, ou un point pris ?' },
  { kind: 'agent', npcId: 'apercu-agent', label: 'Ton agent', texte: "Écoute-moi bien. Lens veut prolonger, mais j'ai Lyon au téléphone depuis mardi." },
  { kind: 'mere', npcId: 'apercu-mere', label: 'Ta mère', texte: "Je t'ai vu à la télé. Tu avais l'air fatigué. Tu manges correctement au moins ?" },
];

type Etat = 'inconnu' | 'neuronales' | 'navigateur';

export default function VoicePreview({ speechRate }: { speechRate: number }) {
  const [etat, setEtat] = useState<Etat>('inconnu');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    void fetch('/api/voices/edge/status')
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d: { available?: boolean }) => {
        if (vivant) setEtat(d.available ? 'neuronales' : 'navigateur');
      })
      .catch(() => { if (vivant) setEtat('navigateur'); });
    return () => { vivant = false; };
  }, []);

  const ecouter = async (ex: Exemple): Promise<void> => {
    setErreur(null);
    setEnCours(ex.npcId);
    const profil = effectiveVoice(SYSTEM_VOICE, ex.npcId, ex.kind);
    try {
      if (etat === 'neuronales') {
        const res = await fetch('/api/voices/edge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text: ex.texte,
            voice: resolveEdgeVoice(profil, ex.npcId, ex.kind),
            rate: profil.rate,
            pitch: profil.pitch,
          }),
        });
        if (!res.ok) throw new Error(`Voix ${res.status}`);
        const audio = new Audio(URL.createObjectURL(await res.blob()));
        audio.playbackRate = speechRate;
        await new Promise<void>((fin) => {
          audio.onended = () => fin();
          audio.onerror = () => fin();
          void audio.play().catch(() => fin());
        });
      } else {
        // Repli : la synthèse du navigateur, avec exactement la même prosodie qu'en jeu.
        const u = new SpeechSynthesisUtterance(ex.texte);
        u.lang = 'fr-FR';
        u.pitch = profil.pitch;
        u.rate = profil.rate * speechRate;
        await new Promise<void>((fin) => {
          u.onend = () => fin();
          u.onerror = () => fin();
          speechSynthesis.speak(u);
        });
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible');
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">Écouter les voix</p>
      <p className="mt-1 text-xs text-muted">
        {etat === 'neuronales' && 'Voix neuronales via le proxy local — gratuites, une voix réelle par rôle.'}
        {etat === 'navigateur' && 'Voix du navigateur. Lance le proxy (npm run server) pour des voix nettement plus humaines.'}
        {etat === 'inconnu' && 'Recherche du proxy…'}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXEMPLES.map((ex) => (
          <Button
            key={ex.npcId}
            variant="secondary"
            disabled={enCours !== null || etat === 'inconnu'}
            onClick={() => void ecouter(ex)}
          >
            {enCours === ex.npcId ? '♪ …' : ex.label}
          </Button>
        ))}
      </div>
      {erreur && <p className="mt-2 text-xs text-signal-red">{erreur}</p>}
    </div>
  );
}
