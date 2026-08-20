import { useSyncExternalStore } from "react";

type Kind = "info" | "ok" | "danger";
interface Toast {
  id: number;
  text: string;
  kind: Kind;
  leaving?: boolean;
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, kind: Kind = "info", ms = 3200) {
  const id = ++seq;
  toasts = [...toasts, { id, text, kind }];
  emit();
  setTimeout(() => {
    toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
    emit();
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      emit();
    }, 180);
  }, ms);
}

export function ToastRegion() {
  const items = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
  if (!items.length) return null;
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind} ${t.leaving ? "is-leaving" : ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
