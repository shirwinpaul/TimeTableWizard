import { z } from "zod";
import { newId } from "./defaults";
import { ROOM_TYPE_LABELS, RoomTypeSchema, type Project } from "./schema";

/** A concrete, one-tap change to the project that can fix a problem. */
export const FixActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setMaxSameSubjectPerDay"), value: z.number().int().min(1).max(8) }),
  z.object({
    type: z.literal("setTeacherLimit"),
    teacherId: z.string(),
    field: z.enum(["maxPerWeek", "maxPerDay", "maxConsecutive"]),
    value: z.number().int().min(1).max(96),
  }),
  z.object({ type: z.literal("setLessonPeriods"), lessonId: z.string(), value: z.number().int().min(1).max(40) }),
  z.object({ type: z.literal("setLessonDoubles"), lessonId: z.string(), value: z.number().int().min(0).max(20) }),
  z.object({ type: z.literal("addRoom"), roomType: RoomTypeSchema, capacity: z.number().int().min(1).max(1000) }),
  z.object({ type: z.literal("allowDoubleAcrossShortBreak") }),
  z.object({ type: z.literal("disableRule"), ruleId: z.string() }),
  z.object({ type: z.literal("clearTeacherUnavailable"), teacherId: z.string(), day: z.number().int().min(0).max(5) }),
]);
export type FixAction = z.infer<typeof FixActionSchema>;

export interface Fix {
  label: string;
  action?: FixAction;
}

/** Apply a fix, returning a new project (inputs are never mutated). */
export function applyFix(project: Project, a: FixAction): Project {
  const p: Project = structuredClone(project);
  switch (a.type) {
    case "setMaxSameSubjectPerDay":
      p.settings.maxSameSubjectPerDay = a.value;
      break;
    case "setTeacherLimit": {
      const t = p.teachers.find((x) => x.id === a.teacherId);
      if (t) t[a.field] = a.value;
      break;
    }
    case "setLessonPeriods": {
      const l = p.lessons.find((x) => x.id === a.lessonId);
      if (l) {
        // Every lesson in an elective block must keep the same length.
        const targets = l.blockId ? p.lessons.filter((x) => x.blockId === l.blockId) : [l];
        for (const t of targets) {
          t.periodsPerWeek = a.value;
          t.doubles = Math.min(t.doubles, Math.floor(a.value / 2));
        }
      }
      break;
    }
    case "setLessonDoubles": {
      const l = p.lessons.find((x) => x.id === a.lessonId);
      if (l) {
        const targets = l.blockId ? p.lessons.filter((x) => x.blockId === l.blockId) : [l];
        for (const t of targets) t.doubles = Math.min(a.value, Math.floor(t.periodsPerWeek / 2));
      }
      break;
    }
    case "addRoom": {
      const n = p.rooms.filter((r) => r.type === a.roomType).length + 1;
      p.rooms.push({ id: newId("room"), name: `${ROOM_TYPE_LABELS[a.roomType]} ${n}`, type: a.roomType, capacity: a.capacity });
      break;
    }
    case "allowDoubleAcrossShortBreak":
      p.settings.allowDoubleAcrossShortBreak = true;
      break;
    case "disableRule": {
      const r = p.rules.find((x) => x.id === a.ruleId);
      if (r) r.enabled = false;
      break;
    }
    case "clearTeacherUnavailable": {
      const t = p.teachers.find((x) => x.id === a.teacherId);
      if (t) t.unavailable = t.unavailable.filter((s) => Math.floor(s / 16) !== a.day);
      break;
    }
  }
  p.updatedAt = new Date().toISOString();
  return p;
}
