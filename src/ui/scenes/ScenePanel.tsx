/**
 * Liste des scènes proposées (interview, conférence, vestiaire, agent,
 * bureau du coach) et panneau de conversation quand une scène est ouverte.
 * Utilisé sur l'accueil (scènes du jour) et après un match.
 */
import { useSceneStore, sceneKey } from '../../store/sceneStore';
import type { SceneSpec } from '../../llm/scenes/conversation';
import ConversationPanel from './ConversationPanel';
import Button from '../components/Button';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';

const KIND_HINTS: Record<SceneSpec['kind'], string> = {
  flash: 'Un journaliste t’attend au bord du terrain, micro tendu.',
  conference: 'Salle de presse : plusieurs questions, tout est enregistré.',
  vestiaire: 'Quelques mots dans le vestiaire, à chaud.',
  agent: 'Ton agent t’appelle.',
  bureau_coach: 'Le coach veut te parler en tête-à-tête.',
  evenement: 'Quelque chose se passe dans ta vie : ta réponse décidera de la suite.',
};

interface ScenePanelProps {
  /** N'afficher que les scènes liées à un match (post-match) ou que celles du jour. */
  filter?: 'match' | 'jour';
  title?: string;
}

export default function ScenePanel({ filter, title = 'Prises de parole' }: ScenePanelProps) {
  const proposed = useSceneStore((s) => s.proposed);
  const active = useSceneStore((s) => s.active);
  const error = useSceneStore((s) => s.error);
  const open = useSceneStore((s) => s.open);
  const dismiss = useSceneStore((s) => s.dismiss);

  const visible = proposed.filter((s) => (filter === 'match' ? !!s.matchId : filter === 'jour' ? !s.matchId : true));

  if (active) return <ConversationPanel />;
  if (visible.length === 0 && !error) return null;

  return (
    <Panel>
      <SectionTitle>{title}</SectionTitle>
      <ul className="space-y-2">
        {visible.map((s) => (
          <li key={sceneKey(s)} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] pb-2">
            <div>
              <p className="font-display uppercase tracking-wide text-sm">
                {s.title}
                {s.mandatory ? <span className="ml-2 text-[10px] text-signal-red">obligatoire</span> : null}
              </p>
              <p className="text-xs text-muted">{KIND_HINTS[s.kind]}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => open(s)}>Répondre</Button>
              {!s.mandatory && <Button variant="ghost" onClick={() => dismiss(s)}>Esquiver</Button>}
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-signal-red">{error}</p>}
    </Panel>
  );
}
