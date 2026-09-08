import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { configureLlm } from './llm/client';
import { setSoundsEnabled } from './ui/lib/sounds';
import { useCareerStore } from './store/careerStore';
import { useSettingsStore } from './store/settingsStore';
import { useUiStore, type Screen } from './store/uiStore';
import AppShell from './ui/AppShell';
import ToastStack from './ui/components/Toast';
import Modal from './ui/components/Modal';
import TitleScreen from './ui/screens/TitleScreen';
import NewCareerScreen from './ui/screens/NewCareerScreen';
import HomeScreen from './ui/screens/HomeScreen';
import MatchScreen from './ui/screens/MatchScreen';
import ProfileScreen from './ui/screens/ProfileScreen';
import LeagueScreen from './ui/screens/LeagueScreen';
import ClubScreen from './ui/screens/ClubScreen';
import MediaScreen from './ui/screens/MediaScreen';
import CareerScreen from './ui/screens/CareerScreen';
import NationalScreen from './ui/screens/NationalScreen';
import SettingsScreen from './ui/screens/SettingsScreen';

/** Écrans qui exigent une carrière chargée : sans carrière, on retombe sur l'écran-titre plutôt que de planter. */
const CAREER_SCREENS: ReadonlySet<Screen> = new Set(['home', 'match', 'profile', 'league', 'club', 'media', 'career', 'national']);

const SCREEN_COMPONENTS: Partial<Record<Screen, React.ComponentType>> = {
  home: HomeScreen,
  match: MatchScreen,
  profile: ProfileScreen,
  league: LeagueScreen,
  club: ClubScreen,
  media: MediaScreen,
  career: CareerScreen,
  national: NationalScreen,
  settings: SettingsScreen,
};

export default function App() {
  const screen = useUiStore((s) => s.screen);
  const career = useCareerStore((s) => s.career);
  const error = useCareerStore((s) => s.error);
  const clearError = useCareerStore((s) => s.clearError);
  const llmEnabled = useSettingsStore((s) => s.llmEnabled);
  const sounds = useSettingsStore((s) => s.sounds);

  // Le client LLM suit le réglage « utiliser l'IA » ; sans proxy ni clé, les replis prennent le relais tout seuls.
  useEffect(() => {
    configureLlm({ enabled: llmEnabled });
  }, [llmEnabled]);
  useEffect(() => {
    setSoundsEnabled(sounds);
  }, [sounds]);

  let content: React.ReactNode;
  if (screen === 'title') {
    content = <TitleScreen />;
  } else if (screen === 'new_career') {
    content = <NewCareerScreen />;
  } else if (CAREER_SCREENS.has(screen) && !career) {
    // Garde-fou (§15) : jamais d'écran de carrière sans carrière chargée.
    content = <TitleScreen />;
  } else {
    const ScreenComponent = SCREEN_COMPONENTS[screen] ?? HomeScreen;
    content = (
      <AppShell>
        <ScreenComponent />
      </AppShell>
    );
  }

  return (
    <>
      {error && (
        <div className="fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-4 bg-signal-red px-4 py-2 text-sm text-white">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="font-display uppercase tracking-wide">
            Fermer
          </button>
        </div>
      )}
      {/* Pas d'animation de sortie : un onglet en arrière-plan suspend les frames et « wait » bloquerait la navigation. */}
      <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
        {content}
      </motion.div>
      <ToastStack />
      <Modal />
    </>
  );
}
