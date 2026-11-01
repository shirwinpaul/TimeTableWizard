"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Logo } from "./Logo";
import { SettingsDialog } from "./SettingsDialog";

const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
};
const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("ttw-theme", next ? "dark" : "light");
    } catch {}
  };
  return (
    <button onClick={toggle} className="rounded-lg p-2 text-lg hover:bg-surface-2" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={dark}>
      <span aria-hidden>{dark ? "☀️" : "🌙"}</span>
    </button>
  );
}

export function SiteHeader() {
  const [settings, setSettings] = useState(false);
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/" aria-label="Timetable Wizard — home" className="flex items-center gap-2 font-heading text-lg font-extrabold">
          <Logo size={30} />
          <span className="hidden min-[400px]:inline">Timetable Wizard</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          <Link href="/start" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-2">
            My timetables
          </Link>
          <ThemeToggle />
          <button onClick={() => setSettings(true)} className="rounded-lg p-2 text-lg hover:bg-surface-2" aria-label="Settings">
            <span aria-hidden>⚙️</span>
          </button>
        </nav>
      </div>
      <SettingsDialog open={settings} onClose={() => setSettings(false)} />
    </header>
  );
}
