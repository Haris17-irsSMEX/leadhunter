"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ToastType = "success" | "error";

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
        <div className="pointer-events-none fixed bottom-5 right-5 z-[100] max-w-sm rounded-2xl border px-4 py-3 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              toast.type === "success"
                ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                : "border border-red-400/30 bg-red-500/15 text-red-100"
            }`}
          >
            {toast.message}
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
