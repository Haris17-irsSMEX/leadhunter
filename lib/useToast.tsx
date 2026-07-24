"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";

type ToastState = {
  message: string;
  type: ToastType;
  visible: boolean;
};

type ToastContextValue = {
  hideToast: () => void;
  showToast: (message: string, type?: ToastType) => void;
  toast: ToastState;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>({
    message: "",
    type: "success",
    visible: false,
  });

  useEffect(() => {
    if (!toast.visible) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }));
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [toast.visible, toast.message]);

  const hideToast = useCallback(() => {
    setToast((current) => ({ ...current, visible: false }));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    setToast({
      message,
      type,
      visible: true,
    });
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      hideToast,
      showToast,
      toast,
    }),
    [hideToast, showToast, toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast.visible ? (
        <div
          role={toast.type === "error" ? "alert" : "status"}
          aria-live={toast.type === "error" ? "assertive" : "polite"}
          className="fixed inset-x-4 bottom-5 z-[100] sm:left-auto sm:right-5 sm:w-full sm:max-w-sm"
        >
          <div
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm font-medium shadow-[var(--shadow-elevated)] ${
              toast.type === "success"
                ? "border-[var(--success-border)] bg-[var(--success-soft)] text-green-800"
                : toast.type === "info"
                  ? "border-blue-200 bg-blue-50 text-blue-900"
                  : "border-[var(--danger-border)] bg-[var(--danger-soft)] text-red-800"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]" aria-hidden="true" />
            ) : toast.type === "info" ? (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            ) : (
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
            <button
              type="button"
              onClick={hideToast}
              className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-current opacity-60 transition hover:bg-black/5 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }

  return context;
}
