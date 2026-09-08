import { useEffect, useMemo, useState } from 'react';
import type { Archetype, AttributeKey, CareerSetup, Difficulty, Foot, Position, StartingLevel } from '../../engine/types';
import { ARCHETYPES, DIFFICULTIES, FEET, POSITIONS, STARTING_LEVELS } from '../../engine/types';
import { ATTRIBUTE_GROUPS } from '../../engine/types';
import { POSITION_LABELS } from '../../engine/config/positions';
import { DIFFICULTY_LABELS } from '../../engine/config/difficulty';
import { allocationLimits, validateAllocation } from '../../engine/player/createPlayer';
import { computeOverall } from '../../engine/player/overall';
import { buildAllocation } from '../../engine/sim/headless';
import { formatSeed, parseSeed, randomSeed } from '../../engine/rng/derive';
import { avatarParDefaut } from '../lib/avatar';
import { NATIONALITIES } from '../../data/nationalities';
import type { DatasetFile, DatasetClub } from '../../data/schema';
import { listDatasets, type DatasetEntry } from '../../data/index';
import { useCareerStore } from '../../store/careerStore';
import { useUiStore } from '../../store/uiStore';
import { ARCHETYPE_LABELS, ATTRIBUTE_LABELS, FOOT_LABELS, STARTING_LEVEL_HELP, STARTING_LEVEL_LABELS, formatEuros } from '../lib/labels';
import Button from '../components/Button';
import AvatarPicker from '../components/AvatarPicker';
import Panel from '../components/Panel';
import SectionTitle from '../components/SectionTitle';
import NumberTabular from '../components/NumberTabular';

const STEPS = ['Identité', 'Poste et style', 'Niveau et difficulté', 'Jeu de données et club', 'Répartition', 'Récapitulatif'] as const;

function defaultDraft(): CareerSetup {
  return {
    firstName: '',
    lastName: '',
    startAge: 18,
    nationality: 'FRA',
    position: 'BU',
    foot: 'droit',
    heightCm: 180,
    weightKg: 75,
    archetypes: [],
    clubId: '',
    startingLevel: 'prometteur',
    difficulty: 'exigeant',
    allocation: {},
    datasetId: '',
    // Chaque carrière tire sa propre graine : deux joueurs de même nom dans le
    // même club ne vivent pas la même saison. La graine est figée dans la
    // sauvegarde, donc la carrière reste parfaitement déterministe.
    seed: randomSeed(),
    avatar: avatarParDefaut(),
    sandbox: false,
  };
}

/** Clubs proposés selon le niveau de départ (règle Phase 2) : prometteur plafonné en prestige, les autres niveaux voient tout. */
function eligibleClubs(dataset: DatasetFile, level: StartingLevel): DatasetClub[] {
  const clubs = level === 'prometteur' ? dataset.clubs.filter((c) => c.prestige <= 80) : dataset.clubs.slice();
  return clubs.sort((a, b) => b.prestige - a.prestige || a.name.localeCompare(b.name, 'fr'));
}

/** Écran de création de carrière (§2), en étapes. */
export default function NewCareerScreen() {
  const [step, setStep] = useState(0);
  const [seedInput, setSeedInput] = useState<string | undefined>();
  const [draft, setDraft] = useState<CareerSetup>(defaultDraft);
  const [entries, setEntries] = useState<DatasetEntry[]>([]);
  const [entryId, setEntryId] = useState<string>('');
  const [dataset, setDataset] = useState<DatasetFile | undefined>();
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState<string | undefined>();

  const navigate = useUiStore((s) => s.navigate);
  const startNewCareer = useCareerStore((s) => s.startNewCareer);
  const busy = useCareerStore((s) => s.busy);
  const error = useCareerStore((s) => s.error);

  useEffect(() => {
    void listDatasets().then((list) => {
      setEntries(list);
      if (list[0]) setEntryId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!entryId) return;
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    setDatasetLoading(true);
    setDatasetError(undefined);
    setDataset(undefined);
    entry
      .load()
      .then((file) => {
        setDataset(file);
        setDraft((d) => ({ ...d, datasetId: file.id, clubId: '' }));
      })
      .catch((e: unknown) => setDatasetError(e instanceof Error ? e.message : 'Chargement impossible.'))
      .finally(() => setDatasetLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, entries]);

  const limits = useMemo(
    () => allocationLimits({ startAge: draft.startAge, position: draft.position, startingLevel: draft.startingLevel }),
    [draft.startAge, draft.position, draft.startingLevel],
  );

  const spent = useMemo(
    () => Object.values(draft.allocation).reduce((s, v) => s + (v ?? 0), 0),
    [draft.allocation],
  );
  const remaining = limits.total - spent;

  const previewAttributes = useMemo(() => {
    const out = { ...limits.base };
    for (const [k, v] of Object.entries(draft.allocation) as [AttributeKey, number | undefined][]) {
      if (v) out[k] = Math.min(99, out[k] + v);
    }
    return out;
  }, [limits.base, draft.allocation]);

  const previewOverall = computeOverall(previewAttributes, draft.position);
  const allocationErrors = useMemo(() => validateAllocation(draft), [draft]);

  const eligible = dataset ? eligibleClubs(dataset, draft.startingLevel) : [];
  const selectedClub = eligible.find((c) => c.id === draft.clubId);

  function setAllocation(key: AttributeKey, delta: number) {
    setDraft((d) => {
      const current = d.allocation[key] ?? 0;
      const next = Math.max(0, Math.min(limits.perAttributeMax[key], current + delta));
      if (delta > 0 && spent >= limits.total) return d;
      return { ...d, allocation: { ...d.allocation, [key]: next } };
    });
  }

  function toggleArchetype(a: Archetype) {
    setDraft((d) => {
      const has = d.archetypes.includes(a);
      if (has) return { ...d, archetypes: d.archetypes.filter((x) => x !== a) };
      if (d.archetypes.length >= 3) return d;
      return { ...d, archetypes: [...d.archetypes, a] };
    });
  }

  const canProceed = (() => {
    switch (step) {
      case 0:
        return draft.firstName.trim().length > 0 && draft.lastName.trim().length > 0 && draft.startAge >= 16 && draft.startAge <= 21;
      case 1:
        return draft.archetypes.length >= 1;
      case 2:
        return true;
      case 3:
        return !!dataset && !datasetLoading && !!draft.clubId;
      case 4:
        return allocationErrors.length === 0;
      default:
        return true;
    }
  })();

  const handleCreate = () => {
    if (!dataset) return;
    void startNewCareer(draft, dataset);
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 gap-6">
      <h1 className="font-display uppercase tracking-widest text-2xl">Nouvelle carrière</h1>

      <div className="flex gap-1 text-[11px] uppercase tracking-wide">
        {STEPS.map((label, i) => (
          <span key={label} className={`px-2 py-1 ${i === step ? 'bg-accent text-ink-950' : 'text-muted'}`}>
            {i + 1}. {label}
          </span>
        ))}
      </div>

      <Panel className="w-full max-w-3xl">
        {step === 0 && (
          <div className="space-y-4">
            <SectionTitle>Identité</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prénom">
                <input className="input" value={draft.firstName} onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))} />
              </Field>
              <Field label="Nom">
                <input className="input" value={draft.lastName} onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))} />
              </Field>
              <Field label="Âge de départ (16-21)">
                <input
                  type="number"
                  min={16}
                  max={21}
                  className="input"
                  value={draft.startAge}
                  onChange={(e) => setDraft((d) => ({ ...d, startAge: Number(e.target.value), allocation: {} }))}
                />
              </Field>
              <Field label="Nationalité">
                <select className="input" value={draft.nationality} onChange={(e) => setDraft((d) => ({ ...d, nationality: e.target.value }))}>
                  {NATIONALITIES.map((n) => (
                    <option key={n.code} value={n.code}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pied fort">
                <select className="input" value={draft.foot} onChange={(e) => setDraft((d) => ({ ...d, foot: e.target.value as Foot }))}>
                  {FEET.map((f) => (
                    <option key={f} value={f}>
                      {FOOT_LABELS[f]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Taille (cm)">
                  <input
                    type="number"
                    min={150}
                    max={215}
                    className="input"
                    value={draft.heightCm}
                    onChange={(e) => setDraft((d) => ({ ...d, heightCm: Number(e.target.value) }))}
                  />
                </Field>
                <Field label="Poids (kg)">
                  <input
                    type="number"
                    min={50}
                    max={120}
                    className="input"
                    value={draft.weightKg}
                    onChange={(e) => setDraft((d) => ({ ...d, weightKg: Number(e.target.value) }))}
                  />
                </Field>
              </div>
            </div>
            <div className="border-t border-white/[0.07] pt-4">
              <SectionTitle>Portrait</SectionTitle>
              <AvatarPicker
                value={draft.avatar ?? avatarParDefaut()}
                onChange={(avatar) => setDraft((d) => ({ ...d, avatar }))}
                {...(selectedClub ? { couleurs: selectedClub.colors } : {})}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <SectionTitle>Poste</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => setDraft((d) => ({ ...d, position: p, allocation: {} }))}
                  className={`rounded-full px-3.5 py-1.5 text-sm ring-1 transition ${draft.position === p ? 'ring-accent text-accent bg-accent/10' : 'ring-white/10 hover:ring-white/25'}`}
                >
                  {POSITION_LABELS[p]}
                </button>
              ))}
            </div>
            <SectionTitle>Style de jeu (1 à 3 archétypes)</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ARCHETYPES.map((a) => {
                const active = draft.archetypes.includes(a);
                return (
                  <button
                    key={a}
                    onClick={() => toggleArchetype(a)}
                    className={`rounded-full px-3.5 py-1.5 text-left text-sm ring-1 transition ${active ? 'ring-accent text-accent bg-accent/10' : 'ring-white/10 hover:ring-white/25'}`}
                  >
                    {ARCHETYPE_LABELS[a]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">{draft.archetypes.length} / 3 sélectionnés</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <SectionTitle>Niveau de départ</SectionTitle>
            <div className="grid sm:grid-cols-3 gap-2">
              {STARTING_LEVELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setDraft((d) => ({ ...d, startingLevel: l, allocation: {}, clubId: '' }))}
                  className={`rounded-2xl p-3 text-left ring-1 transition ${draft.startingLevel === l ? 'ring-accent bg-accent/10' : 'ring-white/10 hover:ring-white/25'}`}
                >
                  <p className="font-display uppercase tracking-wide">{STARTING_LEVEL_LABELS[l]}</p>
                  <p className="text-xs text-muted">{STARTING_LEVEL_HELP[l]}</p>
                </button>
              ))}
            </div>
            <SectionTitle>Difficulté</SectionTitle>
            <div className="grid sm:grid-cols-3 gap-2">
              {DIFFICULTIES.map((diff) => (
                <button
                  key={diff}
                  onClick={() => setDraft((d) => ({ ...d, difficulty: diff }))}
                  className={`rounded-2xl p-3 text-left ring-1 transition ${draft.difficulty === diff ? 'ring-accent bg-accent/10' : 'ring-white/10 hover:ring-white/25'}`}
                >
                  <p className="font-display uppercase tracking-wide">{DIFFICULTY_LABELS[diff as Difficulty]}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <SectionTitle>Jeu de données</SectionTitle>
            <select className="input" value={entryId} onChange={(e) => setEntryId(e.target.value)}>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            {datasetLoading && <p className="text-sm text-muted">Chargement du jeu de données…</p>}
            {datasetError && <p className="text-sm text-signal-red">{datasetError}</p>}

            {dataset && (
              <>
                <SectionTitle>Club de départ ({eligible.length} proposés)</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                  {eligible.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setDraft((d) => ({ ...d, clubId: c.id }))}
                      className={`rounded-2xl p-3 text-left ring-1 transition ${draft.clubId === c.id ? 'ring-accent bg-accent/10' : 'ring-white/10 hover:ring-white/25'}`}
                    >
                      <p className="font-display uppercase tracking-wide">{c.name}</p>
                      <p className="text-xs text-muted">{c.city} · Prestige {c.prestige}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle>Répartition des 40 points</SectionTitle>
              <Button variant="ghost" onClick={() => setDraft((d) => ({ ...d, allocation: buildAllocation({ startAge: d.startAge, position: d.position, startingLevel: d.startingLevel }) }))}>
                Répartir automatiquement
              </Button>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>
                Points restants : <NumberTabular value={remaining} className={remaining < 0 ? 'text-signal-red' : 'text-accent'} />
              </span>
              <span>
                Note globale estimée : <NumberTabular value={previewOverall} className="text-accent text-lg" />
              </span>
            </div>
            {(['GB'].includes(draft.position) ? (['physique', 'mental', 'gardien'] as const) : (['technique', 'physique', 'mental'] as const)).map(
              (group) => (
                <div key={group}>
                  <h4 className="text-[11px] uppercase tracking-wide text-muted mb-1">{group}</h4>
                  <div className="grid sm:grid-cols-2 gap-x-6">
                    {ATTRIBUTE_GROUPS[group].map((key) => {
                      const alloc = draft.allocation[key] ?? 0;
                      const base = limits.base[key];
                      const cap = limits.perAttributeMax[key];
                      return (
                        <div key={key} className="flex items-center gap-2 py-1 text-sm">
                          <span className="flex-1 truncate">{ATTRIBUTE_LABELS[key]}</span>
                          <span className="text-muted w-8 text-right tabular-nums">{base}</span>
                          <button className="btn-step" disabled={alloc <= 0} onClick={() => setAllocation(key, -1)}>
                            −
                          </button>
                          <NumberTabular value={alloc} className="w-6 text-center" />
                          <button className="btn-step" disabled={alloc >= cap || remaining <= 0} onClick={() => setAllocation(key, 1)}>
                            +
                          </button>
                          <span className="w-10 text-right font-semibold tabular-nums">{Math.min(99, base + alloc)}</span>
                          <span className="text-muted text-xs w-14">plaf. {cap}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ),
            )}
            {allocationErrors.length > 0 && (
              <ul className="text-signal-red text-xs space-y-0.5">
                {allocationErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3 text-sm">
            <SectionTitle>Récapitulatif</SectionTitle>
            <p>
              <strong className="font-display uppercase tracking-wide">
                {draft.firstName} {draft.lastName}
              </strong>{' '}
              — {draft.startAge} ans — {POSITION_LABELS[draft.position]}
            </p>
            <p className="text-muted">
              {draft.archetypes.map((a) => ARCHETYPE_LABELS[a]).join(', ')} · {FOOT_LABELS[draft.foot]} · {draft.heightCm} cm / {draft.weightKg} kg
            </p>
            <p>
              Niveau {STARTING_LEVEL_LABELS[draft.startingLevel]} · Difficulté {DIFFICULTY_LABELS[draft.difficulty]}
            </p>
            <p>
              Club : <strong>{selectedClub?.name ?? '—'}</strong>
              {selectedClub && (
                <span className="text-muted"> · Prestige {selectedClub.prestige} · Budget transfert {formatEuros(selectedClub.transferBudget)}</span>
              )}
            </p>
            <p>
              Note globale de départ : <NumberTabular value={previewOverall} className="text-accent text-lg" />
            </p>
            <label className="flex items-center gap-2 text-muted">
              <input type="checkbox" checked={draft.sandbox} onChange={(e) => setDraft((d) => ({ ...d, sandbox: e.target.checked }))} />
              Mode bac à sable (désactive le palmarès et les records, rechargements libres)
            </label>

            <div className="space-y-1 border-t border-white/[0.08] pt-3">
              <SectionTitle>Graine</SectionTitle>
              <p className="text-muted text-xs">
                Elle décide de tous les tirages de la carrière. Deux carrières de graines différentes ne se ressemblent pas ;
                deux carrières de même graine et même fiche sont identiques.
              </p>
              <div className="flex items-center gap-2">
                <input
                  className="input w-36 font-mono uppercase tracking-widest"
                  value={seedInput ?? formatSeed(draft.seed ?? 0)}
                  onChange={(e) => {
                    setSeedInput(e.target.value);
                    const parsed = parseSeed(e.target.value);
                    if (parsed !== undefined) setDraft((d) => ({ ...d, seed: parsed }));
                  }}
                  aria-label="Graine de la carrière"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    const s = randomSeed();
                    setDraft((d) => ({ ...d, seed: s }));
                    setSeedInput(formatSeed(s));
                  }}
                >
                  Retirer au hasard
                </Button>
              </div>
              {seedInput !== undefined && parseSeed(seedInput) === undefined && (
                <p className="text-signal-red text-xs">Graine illisible : garde des chiffres et des lettres A-Z.</p>
              )}
            </div>
            {busy && <p className="text-accent">Création de la carrière…</p>}
            {error && <p className="text-signal-red">{error}</p>}
          </div>
        )}
      </Panel>

      <div className="flex w-full max-w-3xl justify-between">
        <Button variant="secondary" onClick={() => (step === 0 ? navigate('title') : setStep((s) => s - 1))} disabled={busy}>
          {step === 0 ? 'Annuler' : 'Précédent'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed}>
            Suivant
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={busy || allocationErrors.length > 0 || !dataset || !draft.clubId}>
            {busy ? 'Création…' : 'Créer la carrière'}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
