import Papa from "papaparse";
import * as XLSX from "xlsx";

/** Read a CSV or Excel file into rows of strings (first row = headers). */
export async function readSpreadsheet(file: File): Promise<{ ok: true; rows: string[][] } | { ok: false; error: string }> {
  try {
    if (/\.csv$/i.test(file.name) || file.type === "text/csv") return { ok: true, rows: parseCsv(await file.text()) };
    if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
      return { ok: true, rows: rows.map((r) => r.map((c) => String(c ?? ""))) };
    }
    return { ok: false, error: "Please choose a .csv or .xlsx file." };
  } catch {
    return { ok: false, error: "This file couldn't be read. Is it a valid spreadsheet?" };
  }
}

export function parseCsv(text: string): string[][] {
  const r = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  return r.data.map((row) => row.map((c) => String(c ?? "")));
}
