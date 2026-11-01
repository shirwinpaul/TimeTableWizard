import { del, get, set } from "idb-keyval";
import { ProjectSchema, type Project } from "@/lib/model/schema";

/** Projects live only in this browser's IndexedDB. */

export interface ProjectMeta {
  id: string;
  name: string;
  type: Project["type"];
  updatedAt: string;
  classes: number;
  hasTimetable: boolean;
}

const INDEX = "ttw:index";
const key = (id: string) => `ttw:project:${id}`;

export async function listProjects(): Promise<ProjectMeta[]> {
  const idx = (await get<ProjectMeta[]>(INDEX)) ?? [];
  return [...idx].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadProject(id: string): Promise<Project | null> {
  const raw = await get(key(id));
  if (!raw) return null;
  const parsed = ProjectSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveProject(p: Project): Promise<void> {
  await set(key(p.id), p);
  const idx = ((await get<ProjectMeta[]>(INDEX)) ?? []).filter((m) => m.id !== p.id);
  idx.push({ id: p.id, name: p.name, type: p.type, updatedAt: p.updatedAt, classes: p.classes.length, hasTimetable: !!p.timetable });
  await set(INDEX, idx);
}

export async function deleteProject(id: string): Promise<void> {
  await del(key(id));
  const idx = ((await get<ProjectMeta[]>(INDEX)) ?? []).filter((m) => m.id !== id);
  await set(INDEX, idx);
}
