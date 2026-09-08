/**
 * Navigation, modales et notifications transverses. Aucune logique métier :
 * seulement de l'état d'affichage.
 */
import { create } from 'zustand';
import type { WeekPlan } from '../engine/season/week';

export type Screen =
  | 'title'
  | 'new_career'
  | 'home'
  | 'match'
  | 'profile'
  | 'league'
  | 'club'
  | 'media'
  | 'career'
  | 'national'
  | 'settings';

export interface ModalSpec {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
}

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface UiStore {
  screen: Screen;
  navigate(s: Screen): void;
  /** Plan d'entraînement courant, conservé d'une semaine à l'autre et d'un écran à l'autre. */
  weekPlan: WeekPlan;
  setWeekPlan(plan: WeekPlan): void;
  modal: ModalSpec | null;
  openModal(m: ModalSpec): void;
  closeModal(): void;
  toasts: Toast[];
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: string): void;
}

let toastSeq = 0;

export const useUiStore = create<UiStore>((set) => ({
  screen: 'title',
  navigate: (screen) => set({ screen }),
  weekPlan: { focus: 'auto', intensity: 'normale' },
  setWeekPlan: (weekPlan) => set({ weekPlan }),
  modal: null,
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  toasts: [],
  toast: (t) => {
    const id = `toast-${++toastSeq}`;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
