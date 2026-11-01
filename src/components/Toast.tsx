"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; text: string; tone: "info" | "ok" | "bad"; action?: { label: string; run: () => void } };

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

/** Lightweight toasts, announced to screen readers via aria-live. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 6000);
  }, []);
  const tone = { info: "border-line", ok: "border-ok", bad: "border-bad" };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="no-print pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-center justify-between gap-3 rounded-lg border-l-4 bg-surface px-4 py-3 text-sm shadow-lg ${tone[t.tone]}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="font-semibold text-primary underline"
                onClick={() => {
                  t.action!.run();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
