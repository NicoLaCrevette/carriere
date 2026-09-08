import type { ReactNode } from 'react';
import { useUiStore, type Screen } from '../store/uiStore';
import { useCareerStore } from '../store/careerStore';

const NAV_ITEMS: { screen: Screen; label: string }[] = [
  { screen: 'home', label: 'Accueil' },
  { screen: 'profile', label: 'Profil' },
  { screen: 'league', label: 'Championnat' },
  { screen: 'club', label: 'Club' },
  { screen: 'media', label: 'Médias' },
  { screen: 'career', label: 'Carrière' },
  { screen: 'national', label: 'Sélection' },
  { screen: 'settings', label: 'Réglages' },
];

interface AppShellProps {
  children: ReactNode;
}

/** Bandeau de navigation supérieur + écran courant. Onglets en pilules, fond translucide. */
export default function AppShell({ children }: AppShellProps) {
  const screen = useUiStore((s) => s.screen);
  const navigate = useUiStore((s) => s.navigate);
  const openModal = useUiStore((s) => s.openModal);
  const quit = useCareerStore((s) => s.quit);

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-30 flex items-center gap-1 border-b border-white/[0.06] bg-ink-950/85 px-4 py-2 overflow-x-auto backdrop-blur-xl">
        <span className="font-display uppercase tracking-widest text-accent mr-4 shrink-0">Carrière</span>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.screen}
            type="button"
            onClick={() => navigate(item.screen)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-display uppercase tracking-wide shrink-0 transition ${
              screen === item.screen ? 'bg-accent text-ink-950' : 'text-muted hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            openModal({
              title: 'Quitter la carrière',
              message: 'Retourner à l’écran-titre ? La carrière reste sauvegardée telle quelle.',
              confirmLabel: 'Quitter',
              danger: true,
              onConfirm: quit,
            })
          }
          className="ml-auto rounded-full px-3.5 py-1.5 text-xs font-display uppercase tracking-wide text-signal-red hover:bg-signal-red/10 shrink-0 transition"
        >
          Quitter
        </button>
      </nav>
      <main className="flex-1">{children}</main>
    </div>
  );
}
