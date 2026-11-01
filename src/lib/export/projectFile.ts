import { ProjectSchema, type Project } from "@/lib/model/schema";

/** Whole-project backup as JSON (share with a colleague or keep as a backup). */

export function exportProjectJson(p: Project): string {
  return JSON.stringify({ app: "timetable-wizard", format: 1, project: p }, null, 2);
}

export function importProjectJson(text: string): { ok: true; project: Project } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  const raw = data && typeof data === "object" && "project" in data ? (data as { project: unknown }).project : data;
  const parsed = ProjectSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `This isn't a Timetable Wizard project file (${first?.path.join(".") || "root"}: ${first?.message}).` };
  }
  return { ok: true, project: parsed.data };
}
