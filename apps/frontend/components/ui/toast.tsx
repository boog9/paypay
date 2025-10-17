"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

export type ToastVariant = "default" | "success" | "destructive";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export interface ToastHandle {
  id: string;
  dismiss: () => void;
}

type ToastInternal = ToastOptions & { id: string };

type ToastContextValue = {
  toast: (options: ToastOptions) => ToastHandle;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastInternal[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
    const timerId = timers.current.get(id);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      timers.current.delete(id);
    }
  }, []);

  const scheduleRemoval = useCallback(
    (id: string, duration?: number) => {
      const effective = typeof duration === "number" && duration > 0 ? duration : 6000;
      if (typeof window === "undefined") {
        return;
      }
      const timeoutId = window.setTimeout(() => {
        dismiss(id);
      }, effective);
      timers.current.set(id, timeoutId);
    },
    [dismiss]
  );

  const toast = useCallback(
    (options: ToastOptions): ToastHandle => {
      const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      setToasts((previous) => [...previous, { id, ...options }]);
      scheduleRemoval(id, options.duration);
      return {
        id,
        dismiss: () => dismiss(id),
      } satisfies ToastHandle;
    },
    [dismiss, scheduleRemoval]
  );

  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      timersMap.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timersMap.clear();
    };
  }, []);

  const contextValue = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-3 p-2 sm:p-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-auto flex w-full items-start gap-3 rounded-md border bg-background p-3 shadow-lg transition",
              toast.variant === "success" && "border-emerald-400/50 bg-emerald-50 text-emerald-900",
              toast.variant === "destructive" && "border-red-400/50 bg-red-50 text-red-900"
            )}
          >
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold leading-none">{toast.title}</p>
              {toast.description ? (
                <p className="text-sm text-muted-foreground">{toast.description}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              <X aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
