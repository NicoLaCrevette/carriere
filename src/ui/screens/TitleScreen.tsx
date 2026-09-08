import { useUiStore } from '../../store/uiStore';
import Button from '../components/Button';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';
import SaveSlotsPanel from '../components/SaveSlotsPanel';

/** Écran-titre (§13) : logo, slots de sauvegarde, nouvelle carrière, réglages. */
export default function TitleScreen() {
  const navigate = useUiStore((s) => s.navigate);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 py-10">
      <h1 className="font-display uppercase tracking-[0.3em] text-5xl sm:text-6xl">
        CARRI<span className="text-accent">È</span>RE
      </h1>

      <div className="w-full max-w-2xl flex flex-col gap-4">
        <Panel>
          <SectionTitle>Sauvegardes</SectionTitle>
          <SaveSlotsPanel />
        </Panel>

        <div className="flex justify-center gap-4">
          <Button onClick={() => navigate('new_career')}>Nouvelle carrière</Button>
          <Button variant="secondary" onClick={() => navigate('settings')}>
            Réglages
          </Button>
        </div>
      </div>
    </div>
  );
}
