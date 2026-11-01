"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

/** Small set of reusable, accessible UI primitives. */

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink hover:bg-primary-hover shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-bad text-white hover:opacity-90 dark:text-black",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "px-2.5 py-1 text-sm", md: "px-3.5 py-2 text-sm", lg: "px-5 py-3 text-base" };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface p-4 shadow-sm ${className}`}>{children}</div>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "bad" | "warn" | "primary"; children: ReactNode }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    ok: "bg-ok-soft text-ok",
    bad: "bg-bad-soft text-bad",
    warn: "bg-warn-soft text-warn",
    primary: "bg-violet-soft text-violet",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-xs text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

/** Modal dialog built on the native <dialog> element (focus trap + Esc for free). */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40`}
      aria-label={title}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Close">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden />
      {label}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden>
        <path d="M32 6 L44 30 H20 Z" fill="var(--violet)" opacity=".85" />
        <rect x="14" y="30" width="36" height="26" rx="4" fill="none" stroke="var(--primary)" strokeWidth="3" />
        <path d="M14 39h36M26 30v26M38 30v26" stroke="var(--primary)" strokeWidth="2" opacity=".6" />
        <path d="M50 10l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="var(--warn)" />
      </svg>
      <h3 className="font-bold">{title}</h3>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}
