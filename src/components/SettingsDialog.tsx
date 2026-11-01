"use client";

import { useState } from "react";
import { BYOK_STORAGE_KEY } from "@/config/ai";
import { Button, Dialog, Field, Input } from "./ui";

/** Settings: Bring Your Own (Gemini) Key — stored only in this browser. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      {open && <SettingsBody onClose={onClose} />}
    </Dialog>
  );
}

function SettingsBody({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(() => {
    try {
      return localStorage.getItem(BYOK_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [saved, setSaved] = useState(false);
  const save = () => {
    try {
      if (key.trim()) localStorage.setItem(BYOK_STORAGE_KEY, key.trim());
      else localStorage.removeItem(BYOK_STORAGE_KEY);
      setSaved(true);
      setTimeout(onClose, 600);
    } catch {
      setSaved(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        The AI assistant is optional. The app already has a shared free key on the server. If it is busy, you can add your own free Gemini key
        here. It is kept <strong>only in this browser</strong>, sent with each AI request, and never stored or logged on the server.
      </p>
      <Field label="Your Gemini API key (optional)" hint="Get one free at aistudio.google.com → Get API key.">
        {(id) => <Input id={id} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your key" />}
      </Field>
      <div className="flex justify-end gap-2">
        {key && (
          <Button variant="ghost" onClick={() => setKey("")}>
            Clear
          </Button>
        )}
        <Button variant="primary" onClick={save}>
          {saved ? "Saved ✓" : "Save"}
        </Button>
      </div>
    </div>
  );
}
