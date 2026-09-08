import { AnimatePresence, motion } from 'framer-motion';
import { useUiStore } from '../../store/uiStore';
import Button from './Button';

/** Modale générique de confirmation, pilotée par `uiStore.modal`. */
export default function Modal() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);

  return (
    <AnimatePresence>
      {modal && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeModal}
        >
          <motion.div
            className="w-full max-w-md rounded-card ring-1 ring-white/10 bg-ink-900 p-5 shadow-card"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display uppercase tracking-wide text-lg text-white mb-2">{modal.title}</h3>
            {modal.message && <p className="text-sm text-muted mb-4">{modal.message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal}>
                {modal.cancelLabel ?? 'Annuler'}
              </Button>
              <Button
                variant={modal.danger ? 'danger' : 'primary'}
                onClick={() => {
                  modal.onConfirm?.();
                  closeModal();
                }}
              >
                {modal.confirmLabel ?? 'Confirmer'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
