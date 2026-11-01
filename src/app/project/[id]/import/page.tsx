"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, Select } from "@/components/ui";
import { useProject } from "@/hooks/useProject";
import { downloadBlob, safeFileName } from "@/lib/export/png";
import { exportProjectJson } from "@/lib/export/projectFile";
import { buildWorkbook, templateFile, workbookBytes } from "@/lib/export/sheets";
import { TEMPLATES, autoMap, importRows, templateRows, type Entity } from "@/lib/import/importer";
import { readSpreadsheet } from "@/lib/import/parse";

const ENTITIES: { key: Entity; label: string }[] = [
  { key: "rooms", label: "Rooms" },
  { key: "classes", label: "Classes" },
  { key: "subjects", label: "Subjects" },
  { key: "teachers", label: "Teachers" },
  { key: "lessons", label: "Lessons" },
];

export default function ImportExportPage() {
  const { project, replace, undo } = useProject();
  const toast = useToast();
  const [entity, setEntity] = useState<Entity>("rooms");
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => (file ? importRows(project, entity, file.rows, mapping) : null), [file, project, entity, mapping]);

  const choose = async (f: File) => {
    setError(null);
    const r = await readSpreadsheet(f);
    if (!r.ok) return setError(r.error);
    if (r.rows.length < 2) return setError("The file has no data rows under the header row.");
    const headers = r.rows[0];
    setFile({ name: f.name, headers, rows: r.rows.slice(1) });
    setMapping(autoMap(entity, headers));
  };

  const changeEntity = (e: Entity) => {
    setEntity(e);
    if (file) setMapping(autoMap(e, file.headers));
  };

  const doImport = () => {
    if (!preview) return;
    replace(preview.project);
    toast({ tone: "ok", text: `Imported: ${preview.added} added, ${preview.updated} updated${preview.errors.length ? `, ${preview.errors.length} row(s) skipped` : ""}.`, action: { label: "Undo", run: undo } });
    setFile(null);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">1. Download templates</h2>
        <p className="text-sm text-muted">Fill them in Excel or Google Sheets. Import in this order: rooms → classes → subjects → teachers → lessons (later sheets refer to names and codes from earlier ones).</p>
        <div className="flex flex-wrap gap-2">
          {ENTITIES.map((e) => (
            <div key={e.key} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-sm">
              <span className="font-medium">{e.label}</span>
              <Button size="sm" variant="ghost" onClick={() => downloadBlob(`template-${e.key}.csv`, templateFile(templateRows(e.key), "csv"))}>CSV</Button>
              <Button size="sm" variant="ghost" onClick={() => downloadBlob(`template-${e.key}.xlsx`, templateFile(templateRows(e.key), "xlsx"))}>XLSX</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">2. Import a filled sheet</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            What is in the file?
            <Select value={entity} onChange={(e) => changeEntity(e.target.value as Entity)}>
              {ENTITIES.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            File (.csv or .xlsx)
            <input type="file" accept=".csv,.xlsx,.xls,.ods" className="text-sm" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
          </label>
        </div>
        {error && <p className="text-sm text-bad" role="alert">{error}</p>}
        {file && preview && (
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">Match columns — {file.name}</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATES[entity].map((f) => (
                <label key={f.key} className="flex flex-col gap-1 text-sm">
                  <span>
                    {f.label} {f.required && <span className="text-bad">*</span>}
                  </span>
                  <Select value={mapping[f.key] ?? -1} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                    <option value={-1}>— not in file —</option>
                    {file.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-xs">
                <caption className="sr-only">Preview of the first rows</caption>
                <thead className="bg-surface-2">
                  <tr>
                    <th className="px-2 py-1 text-left">Row</th>
                    {file.headers.map((h, i) => (
                      <th key={i} className="px-2 py-1 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {file.rows.slice(0, 8).map((r, i) => {
                    const err = preview.errors.find((e) => e.row === i + 2);
                    return (
                      <tr key={i} className={`border-t border-line ${err ? "bg-bad-soft" : ""}`} title={err?.message}>
                        <td className="px-2 py-1">{i + 2}</td>
                        {file.headers.map((_, j) => (
                          <td key={j} className="px-2 py-1">{r[j]}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div aria-live="polite" className="flex flex-col gap-1 text-sm">
              <p>
                <Badge tone="ok">{preview.added} new</Badge> <Badge tone="primary">{preview.updated} update</Badge>{" "}
                {preview.errors.length > 0 && <Badge tone="bad">{preview.errors.length} problem(s)</Badge>}
              </p>
              {preview.errors.length > 0 && (
                <ul className="max-h-40 overflow-auto rounded-lg border border-bad p-2">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setFile(null)}>Cancel</Button>
              <Button variant="primary" disabled={preview.added + preview.updated === 0} onClick={doImport}>
                Import {preview.added + preview.updated} row(s){preview.errors.length ? " (skip problems)" : ""}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">3. Export & backup</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => downloadBlob(`${safeFileName(project.name)}.timetable.json`, new Blob([exportProjectJson(project)], { type: "application/json" }))}>💾 Download project file (.json)</Button>
          {project.timetable && (
            <>
              <Button onClick={() => downloadBlob(`${safeFileName(project.name)}.xlsx`, new Blob([workbookBytes(buildWorkbook(project, project.timetable!.placements))]))}>📊 Excel (all views)</Button>
              <Link className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2" href={`/project/${project.id}/print?what=class&id=all`} target="_blank">🖨️ PDF of all classes</Link>
              <Link className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2" href={`/project/${project.id}/print?what=teacher&id=all`} target="_blank">🖨️ PDF of all teachers</Link>
              <Link className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2" href={`/project/${project.id}/print?what=master`} target="_blank">🖨️ PDF master</Link>
            </>
          )}
        </div>
        <p className="text-xs text-muted">To open a project file from a colleague, go to My timetables → Open a project file. Calendar (.ics) and image exports are in the Timetable page&apos;s Export menu.</p>
      </Card>
    </div>
  );
}
