import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    const duration = toast.duration ?? (toast.variant === 'error' ? 7000 : 4000);
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id, duration }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helpers usable anywhere (components, services, interceptors). */
export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ variant: 'success', title, description }),
  error: (title: string, description?: string) => useToastStore.getState().push({ variant: 'error', title, description }),
  info: (title: string, description?: string) => useToastStore.getState().push({ variant: 'info', title, description }),
  warning: (title: string, description?: string) => useToastStore.getState().push({ variant: 'warning', title, description }),
};
