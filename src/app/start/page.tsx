"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { sampleSchool } from "@/data/sampleSchool";
import { emptyProject } from "@/lib/model/defaults";
import { importProjectJson } from "@/lib/export/projectFile";
import { deleteProject, listProjects, saveProject, type ProjectMeta } from "@/lib/storage";
import { Badge, Button, Card, Dialog, Field, Input, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";

export default function StartPage() {
  return (
    <Suspense fallback={<div className="p-8"><Spinner /></div>}>
      <Start />
    </Suspense>
  );
}

function Start() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [newOpen, setNewOpen] = useState(params.get("new") === "1");
  const [name, setName] = useState("");
  const [type, setType] = useState<"School" | "College">("School");
  const [busy, setBusy] = useState(false);
  const sampleStarted = useRef(false);

  useEffect(() => {
    listProjects().then(setProjects, () => setProjects([]));
  }, []);

  const openSample = async () => {
    setBusy(true);
    try {
      const p = sampleSchool();
      await saveProject(p);
      router.push(`/project/${p.id}/setup?step=9`);
    } catch {
      toast({ tone: "bad", text: "Couldn't save in this browser. Check that site storage isn't blocked." });
      setBusy(false);
    }
  };

  useEffect(() => {
    if (params.get("sample") === "1" && !sampleStarted.current) {
      sampleStarted.current = true;
      void openSample();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const create = async (then: "setup" | "import") => {
    setBusy(true);
    const p = emptyProject(name.trim() || "My timetable", type);
    try {
      await saveProject(p);
      router.push(then === "setup" ? `/project/${p.id}/setup?step=1` : `/project/${p.id}/import`);
    } catch {
      toast({ tone: "bad", text: "Couldn't save in this browser." });
      setBusy(false);
    }
  };

  const openFile = async (f: File) => {
    const res = importProjectJson(await f.text());
    if (!res.ok) return toast({ tone: "bad", text: res.error });
    await saveProject(res.project);
    router.push(`/project/${res.project.id}/timetable`);
  };

  const remove = async (m: ProjectMeta) => {
    if (!confirm(`Delete "${m.name}" from this browser? This can't be undone. (Export a backup first if you need it.)`)) return;
    await deleteProject(m.id);
    setProjects(await listProjects());
  };

  const choices = [
    { icon: "✨", title: "New timetable", text: "Guided setup, step by step.", run: () => setNewOpen(true) },
    { icon: "📥", title: "Import from spreadsheet", text: "Use our CSV / Excel templates.", run: () => create("import") },
    { icon: "🧪", title: "Try the sample school", text: "Fictional “Sunrise Public School”.", run: openSample },
    { icon: "📂", title: "Open a project file", text: "A .json backup from Timetable Wizard.", run: () => document.getElementById("project-file")?.click() },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-extrabold">Start</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {choices.map((c) => (
          <button
            key={c.title}
            onClick={c.run}
            disabled={busy}
            className="flex flex-col items-start gap-1 rounded-xl border border-line bg-surface p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary disabled:opacity-60"
          >
            <span className="text-2xl" aria-hidden>
              {c.icon}
            </span>
            <span className="font-bold">{c.title}</span>
            <span className="text-sm text-muted">{c.text}</span>
          </button>
        ))}
      </div>
      <input id="project-file" type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />

      <h2 className="mb-3 mt-10 text-xl font-bold">📂 Saved in this browser</h2>
      {projects === null ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted">No saved timetables yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((m) => (
            <li key={m.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-muted">
                    {m.type} · {m.classes} classes · updated {new Date(m.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {m.hasTimetable && <Badge tone="ok">Has timetable</Badge>}
                  <Button variant="primary" size="sm" onClick={() => router.push(`/project/${m.id}/${m.hasTimetable ? "timetable" : "setup"}`)}>
                    Open
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(m)} aria-label={`Delete ${m.name}`}>
                    🗑️
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="New timetable">
        <div className="flex flex-col gap-4">
          <Field label="Name of your school or college">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Green Valley School" />}</Field>
          <Field label="Type">
            {(id) => (
              <Select id={id} value={type} onChange={(e) => setType(e.target.value as "School" | "College")}>
                <option>School</option>
                <option>College</option>
              </Select>
            )}
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => create("setup")} disabled={busy}>
              Start setup →
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
