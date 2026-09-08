import { useEffect, useRef, useState } from 'react';
import type { SaveSlot } from '../../db/db';
import { deleteSlot, exportSlot, importSlot, listSlots } from '../../db/db';
import { useCareerStore } from '../../store/careerStore';
import { useUiStore } from '../../store/uiStore';
import { POSITION_LABELS } from '../../engine/config/positions';
import { formatDateFrShort } from '../../engine/calendar/dates';
import Button from './Button';
import NumberTabular from './NumberTabular';

type Slot = Omit<SaveSlot, 'careerJson'>;

/** Liste des slots de sauvegarde (§13) : charger, supprimer (avec confirmation), exporter, importer. */
export default function SaveSlotsPanel() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const openModal = useUiStore((s) => s.openModal);
  const toast = useUiStore((s) => s.toast);
  const loadCareer = useCareerStore((s) => s.loadCareer);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setSlots(await listSlots());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleDelete = (slot: Slot) => {
    openModal({
      title: 'Supprimer la sauvegarde',
      message: `Supprimer définitivement « ${slot.name} » ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteSlot(slot.id);
          // Sans cela, la sauvegarde automatique de la journée suivante recréerait aussitôt le slot supprimé.
          if (useCareerStore.getState().slotId === slot.id) useCareerStore.getState().quit();
          toast({ kind: 'success', message: 'Sauvegarde supprimée.' });
          void refresh();
        } catch (e) {
          toast({ kind: 'error', message: e instanceof Error ? e.message : 'Suppression impossible.' });
        }
      },
    });
  };

  const handleExport = async (slot: Slot) => {
    try {
      const blob = await exportSlot(slot.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slot.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Export impossible.' });
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      await importSlot(text);
      toast({ kind: 'success', message: 'Sauvegarde importée.' });
      void refresh();
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Import impossible : fichier invalide.' });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = '';
          }}
        />
        <Button variant="ghost" onClick={() => importInputRef.current?.click()}>
          Importer une sauvegarde
        </Button>
      </div>

      {loading && <p className="text-muted text-sm">Chargement…</p>}
      {!loading && slots.length === 0 && <p className="text-muted text-sm">Aucune carrière pour l'instant.</p>}
      <ul className="divide-y divide-ink-800">
        {slots.map((slot) => (
          <li key={slot.id} className="flex items-center gap-3 py-2 text-sm flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="font-display uppercase tracking-wide truncate">{slot.name}</p>
              <p className="text-muted text-xs">
                {POSITION_LABELS[slot.summary.position]} · {slot.summary.age} ans · {slot.summary.season} · {formatDateFrShort(slot.summary.date)} · Note{' '}
                <NumberTabular value={slot.summary.overall} />
                {slot.summary.sandbox && ' · Bac à sable'}
              </p>
            </div>
            <Button variant="secondary" onClick={() => void loadCareer(slot.id)}>
              Charger
            </Button>
            <Button variant="ghost" onClick={() => void handleExport(slot)}>
              Exporter
            </Button>
            <Button variant="ghost" onClick={() => handleDelete(slot)}>
              Supprimer
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
