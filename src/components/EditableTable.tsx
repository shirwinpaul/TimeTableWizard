"use client";

import { useState, type ClipboardEvent } from "react";
import { Button, Select } from "./ui";

/**
 * Spreadsheet-like editable table: inline editing, paste from Excel (tab-separated),
 * duplicate row, delete, bulk edit of a column for selected rows, inline validation.
 */

export type Option = { value: string; label: string };

export type Column<T> = {
  key: keyof T & string;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "color" | "multi";
  options?: Option[];
  width?: string;
  min?: number;
  max?: number;
  /** Return an error message, or null. */
  validate?: (row: T, all: T[]) => string | null;
  placeholder?: string;
};

/** Convert pasted / bulk text to the column's value type. Returns undefined if not understood. */
export function parseCell<T>(col: Column<T>, text: string): unknown {
  const t = text.trim();
  switch (col.type) {
    case "number": {
      const n = Number(t);
      return t === "" || Number.isNaN(n) ? undefined : Math.round(n);
    }
    case "checkbox":
      return /^(1|y|yes|true|✓|x)$/i.test(t);
    case "select": {
      const o = col.options?.find((x) => x.value.toLowerCase() === t.toLowerCase() || x.label.toLowerCase() === t.toLowerCase());
      return o ? o.value : undefined;
    }
    case "multi":
      return t
        .split(/[,;/]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .map((s) => col.options?.find((x) => x.value.toLowerCase() === s || x.label.toLowerCase() === s)?.value)
        .filter((v): v is string => !!v);
    case "color":
      return /^#[0-9a-f]{6}$/i.test(t) ? t : undefined;
    default:
      return t;
  }
}

export function EditableTable<T extends { id: string }>({
  rows,
  columns,
  onChange,
  makeRow,
  onDelete,
  addLabel = "Add row",
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  onChange: (rows: T[]) => void;
  makeRow: () => T;
  /** Return false to cancel the delete (e.g. after a confirm dialog). */
  onDelete?: (row: T) => boolean;
  addLabel?: string;
  caption: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCol, setBulkCol] = useState<string>(columns[0].key);
  const [bulkVal, setBulkVal] = useState("");

  const set = (i: number, key: keyof T, value: unknown) => {
    const next = rows.slice();
    next[i] = { ...next[i], [key]: value };
    onChange(next);
  };

  const onPaste = (e: ClipboardEvent, r: number, c: number) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l, i, a) => l !== "" || i < a.length - 1);
    const next = rows.slice();
    lines.forEach((line, i) => {
      const ri = r + i;
      if (!next[ri]) next[ri] = makeRow();
      const row = { ...next[ri] } as Record<string, unknown>;
      line.split("\t").forEach((cell, j) => {
        const col = columns[c + j];
        if (!col) return;
        const v = parseCell(col, cell);
        if (v !== undefined) row[col.key] = v;
      });
      next[ri] = row as T;
    });
    onChange(next);
  };

  const remove = (row: T) => {
    if (onDelete && !onDelete(row)) return;
    onChange(rows.filter((x) => x.id !== row.id));
  };

  const duplicate = (i: number) => {
    const copy = { ...structuredClone(rows[i]), id: makeRow().id };
    const next = rows.slice();
    next.splice(i + 1, 0, copy);
    onChange(next);
  };

  const applyBulk = () => {
    const col = columns.find((c) => c.key === bulkCol);
    if (!col) return;
    const v = parseCell(col, bulkVal);
    if (v === undefined) return;
    onChange(rows.map((r) => (selected.has(r.id) ? { ...r, [col.key]: v } : r)));
  };

  const cellInput = (row: T, i: number, col: Column<T>, ci: number, err: string | null) => {
    const v = row[col.key] as unknown;
    const label = `${col.label}, row ${i + 1}`;
    const cls = `w-full rounded border bg-transparent px-2 py-1 text-sm ${err ? "border-bad" : "border-transparent hover:border-line focus:border-primary"}`;
    const paste = (e: ClipboardEvent) => onPaste(e, i, ci);
    switch (col.type) {
      case "number":
        return (
          <input aria-label={label} aria-invalid={!!err} type="number" min={col.min} max={col.max} className={`${cls} tabular`} value={Number.isFinite(v as number) ? (v as number) : ""} onPaste={paste}
            onChange={(e) => set(i, col.key, e.target.value === "" ? 0 : Math.round(Number(e.target.value)))} />
        );
      case "checkbox":
        return <input aria-label={label} type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={!!v} onChange={(e) => set(i, col.key, e.target.checked)} />;
      case "color":
        return <input aria-label={label} type="color" className="h-7 w-10 cursor-pointer rounded border border-line" value={(v as string) || "#000000"} onChange={(e) => set(i, col.key, e.target.value)} />;
      case "select":
        return (
          <select aria-label={label} aria-invalid={!!err} className={cls} value={(v as string | null) ?? ""} onPaste={paste} onChange={(e) => set(i, col.key, e.target.value === "" ? null : e.target.value)}>
            <option value="">—</option>
            {col.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      case "multi": {
        const vals = (v as string[]) ?? [];
        return (
          <details className="relative">
            <summary aria-label={label} className={`${cls} cursor-pointer list-none truncate`}>
              {vals.length ? vals.map((x) => col.options?.find((o) => o.value === x)?.label ?? x).join(", ") : <span className="text-muted">Choose…</span>}
            </summary>
            <div className="absolute z-20 mt-1 max-h-60 w-56 overflow-auto rounded-lg border border-line bg-surface p-2 shadow-lg">
              {col.options?.map((o) => (
                <label key={o.value} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-surface-2">
                  <input type="checkbox" checked={vals.includes(o.value)} onChange={(e) => set(i, col.key, e.target.checked ? [...vals, o.value] : vals.filter((x) => x !== o.value))} />
                  {o.label}
                </label>
              ))}
            </div>
          </details>
        );
      }
      default:
        return <input aria-label={label} aria-invalid={!!err} className={cls} value={(v as string) ?? ""} placeholder={col.placeholder} onPaste={paste} onChange={(e) => set(i, col.key, e.target.value)} />;
    }
  };

  const errorCount = rows.reduce((n, r) => n + columns.filter((c) => c.validate?.(r, rows)).length, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Tip: copy cells from Excel or Google Sheets and paste into any cell to fill many rows at once.</p>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-violet-soft px-2 py-1 text-sm">
            <span>{selected.size} selected — set</span>
            <Select aria-label="Column to bulk edit" className="!w-auto !py-1" value={bulkCol} onChange={(e) => setBulkCol(e.target.value)}>
              {columns.filter((c) => c.type !== "color").map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
            <input aria-label="Bulk value" className="w-28 rounded border border-line bg-surface px-2 py-1" value={bulkVal} onChange={(e) => setBulkVal(e.target.value)} placeholder="value" />
            <Button size="sm" variant="primary" onClick={applyBulk}>
              Apply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-2 font-semibold" style={{ width: c.width }}>
                  {c.label}
                </th>
              ))}
              <th className="w-20 px-2 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    aria-label={`Select row ${i + 1}`}
                    checked={selected.has(row.id)}
                    onChange={(e) => {
                      const s = new Set(selected);
                      if (e.target.checked) s.add(row.id);
                      else s.delete(row.id);
                      setSelected(s);
                    }}
                  />
                </td>
                {columns.map((c, ci) => {
                  const err = c.validate?.(row, rows) ?? null;
                  return (
                    <td key={c.key} className="px-1 py-1">
                      {cellInput(row, i, c, ci, err)}
                      {err && <p className="px-2 text-xs text-bad">{err}</p>}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-1 py-1">
                  <button className="rounded p-1 hover:bg-surface-2" onClick={() => duplicate(i)} aria-label={`Duplicate row ${i + 1}`} title="Duplicate">
                    ⧉
                  </button>
                  <button className="rounded p-1 hover:bg-surface-2" onClick={() => remove(row)} aria-label={`Delete row ${i + 1}`} title="Delete">
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-6 text-center text-muted">
                  Nothing here yet — add a row or paste from a spreadsheet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => onChange([...rows, makeRow()])}>+ {addLabel}</Button>
        {errorCount > 0 && (
          <span className="text-sm text-bad" role="status">
            {errorCount} problem{errorCount > 1 ? "s" : ""} to fix
          </span>
        )}
      </div>
    </div>
  );
}
