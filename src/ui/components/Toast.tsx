import { AnimatePresence, motion } from 'framer-motion';
import { useUiStore } from '../../store/uiStore';

const KIND_CLASSES: Record<'info' | 'success' | 'error', string> = {
  info: 'border-signal-blue text-signal-blue',
  success: 'border-signal-green text-signal-green',
  error: 'border-signal-red text-signal-red',
};

/** Pile de notifications éphémères, coin bas-droit. */
export default function ToastStack() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`border bg-ink-900 px-3 py-2 text-sm ${KIND_CLASSES[t.kind]}`}
            onClick={() => dismiss(t.id)}
            role="status"
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
