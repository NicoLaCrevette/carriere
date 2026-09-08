import type { AvatarConfig } from '../../engine/types';
import { ACCESSOIRES_AVATAR, COIFFURES, PILOSITES } from '../../engine/types';
import {
  COULEURS_CHEVEUX, LABELS_ACCESSOIRE, LABELS_COIFFURE, LABELS_PILOSITE, TEINTES_PEAU,
  type CouleursClub,
} from '../lib/avatar';
import PlayerAvatar from './PlayerAvatar';

interface AvatarPickerProps {
  value: AvatarConfig;
  onChange: (config: AvatarConfig) => void;
  couleurs?: CouleursClub;
}

/** Choix du portrait : peau, cheveux, coiffure, pilosité, accessoire. */
export default function AvatarPicker({ value, onChange, couleurs }: AvatarPickerProps) {
  const set = <K extends keyof AvatarConfig>(key: K, v: AvatarConfig[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col sm:flex-row gap-5">
      <div className="flex flex-col items-center gap-2">
        <PlayerAvatar config={value} couleurs={couleurs} taille={112} anneau alt="Aperçu de ton portrait" />
        <span className="text-[11px] uppercase tracking-wide text-muted">Aperçu</span>
      </div>

      <div className="flex-1 space-y-3">
        <Nuancier
          legende="Peau"
          couleurs={TEINTES_PEAU}
          index={value.peau}
          onPick={(i) => set('peau', i)}
        />
        <Nuancier
          legende="Cheveux"
          couleurs={COULEURS_CHEVEUX}
          index={value.cheveux}
          onPick={(i) => set('cheveux', i)}
        />
        <Choix
          legende="Coiffure"
          options={COIFFURES}
          labels={LABELS_COIFFURE}
          valeur={value.coiffure}
          onPick={(v) => set('coiffure', v)}
        />
        <Choix
          legende="Barbe"
          options={PILOSITES}
          labels={LABELS_PILOSITE}
          valeur={value.pilosite}
          onPick={(v) => set('pilosite', v)}
        />
        <Choix
          legende="Accessoire"
          options={ACCESSOIRES_AVATAR}
          labels={LABELS_ACCESSOIRE}
          valeur={value.accessoire}
          onPick={(v) => set('accessoire', v)}
        />
      </div>
    </div>
  );
}

function Nuancier({ legende, couleurs, index, onPick }: {
  legende: string; couleurs: readonly string[]; index: number; onPick: (i: number) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[11px] uppercase tracking-wide text-muted mb-1.5">{legende}</legend>
      <div className="flex flex-wrap gap-2">
        {couleurs.map((couleur, i) => (
          <button
            key={couleur}
            type="button"
            aria-label={`${legende} ${i + 1}`}
            aria-pressed={i === index}
            onClick={() => onPick(i)}
            style={{ backgroundColor: couleur }}
            className={`pastille h-7 w-7 transition ${i === index ? 'ring-2 ring-accent ring-offset-2 ring-offset-ink-900' : 'ring-1 ring-white/15 hover:ring-white/40'}`}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Choix<T extends string>({ legende, options, labels, valeur, onPick }: {
  legende: string; options: readonly T[]; labels: Record<T, string>; valeur: T; onPick: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[11px] uppercase tracking-wide text-muted mb-1.5">{legende}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={o === valeur}
            onClick={() => onPick(o)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              o === valeur ? 'bg-accent text-ink-950' : 'ring-1 ring-white/12 text-muted hover:text-white hover:ring-white/30'
            }`}
          >
            {labels[o]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
