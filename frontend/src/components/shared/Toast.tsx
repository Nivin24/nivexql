import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

// Global toast queue
let listeners: ((toasts: ToastMessage[]) => void)[] = [];
let toastQueue: ToastMessage[] = [];

export const toast = {
  success: (title: string, message?: string) => addToast('success', title, message),
  error: (title: string, message?: string) => addToast('error', title, message),
  warning: (title: string, message?: string) => addToast('warning', title, message),
  info: (title: string, message?: string) => addToast('info', title, message),
};

function addToast(type: ToastType, title: string, message?: string) {
  const id = Math.random().toString(36).substring(2, 9);
  toastQueue = [...toastQueue, { id, type, title, message }];
  listeners.forEach(l => l(toastQueue));
  // Auto-remove after 4s
  setTimeout(() => removeToast(id), 4000);
}

function removeToast(id: string) {
  toastQueue = toastQueue.filter(t => t.id !== id);
  listeners.forEach(l => l(toastQueue));
}

const icons = {
  success: <CheckCircle2 className="w-4 h-4 text-success" />,
  error: <XCircle className="w-4 h-4 text-danger" />,
  warning: <AlertTriangle className="w-4 h-4 text-warning" />,
  info: <Info className="w-4 h-4 text-accent" />,
};

const colors = {
  success: 'border-success/30 bg-success/10',
  error: 'border-danger/30 bg-danger/10',
  warning: 'border-warning/30 bg-warning/10',
  info: 'border-accent/30 bg-accent/10',
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener = (t: ToastMessage[]) => setToasts([...t]);
    listeners.push(listener);
    return () => { listeners = listeners.filter(l => l !== listener); };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border glass shadow-xl
            ${colors[t.type]} animate-in slide-in-from-right-4 fade-in duration-300 max-w-sm`}
        >
          <div className="mt-0.5 shrink-0">{icons[t.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-text-primary">{t.title}</p>
            {t.message && <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{t.message}</p>}
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="shrink-0 p-0.5 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
