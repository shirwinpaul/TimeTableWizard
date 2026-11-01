import { newId, SUBJECT_PALETTE } from "@/lib/model/defaults";
import { RoomTypeSchema, type Lesson, type Project, type Room, type RoomType, type SchoolClass, type Subject, type Teacher } from "@/lib/model/schema";

/**
 * Spreadsheet import: templates, column mapping (auto + manual), row validation with a
 * clear error report, and merging into a project (rows with an existing name update it).
 */

export type Entity = "classes" | "subjects" | "teachers" | "rooms" | "lessons";

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  /** Other header spellings we recognise. */
  aliases: string[];
  example: string;
}

export const TEMPLATES: Record<Entity, FieldDef[]> = {
  classes: [
    { key: "name", label: "Name", required: true, aliases: ["class", "section", "class name"], example: "10-A" },
    { key: "strength", label: "Strength", aliases: ["students", "size", "count"], example: "40" },
    { key: "homeroom", label: "Homeroom", aliases: ["room", "home room"], example: "Room 10-A" },
  ],
  subjects: [
    { key: "name", label: "Name", required: true, aliases: ["subject", "subject name"], example: "Mathematics" },
    { key: "code", label: "Code", required: true, aliases: ["short", "short code", "abbr"], example: "MAT" },
    { key: "type", label: "Type", aliases: ["kind"], example: "theory" },
    { key: "heavy", label: "Heavy", aliases: ["is heavy"], example: "yes" },
    { key: "preferredTime", label: "Preferred time", aliases: ["time", "preferred"], example: "morning" },
    { key: "roomType", label: "Room type", aliases: ["needs room", "room"], example: "" },
    { key: "color", label: "Colour", aliases: ["color"], example: "#7B61FF" },
  ],
  teachers: [
    { key: "name", label: "Name", required: true, aliases: ["teacher", "teacher name"], example: "Asha Kumar" },
    { key: "code", label: "Code", required: true, aliases: ["short", "initials"], example: "AK" },
    { key: "subjects", label: "Subjects", aliases: ["subject codes", "teaches"], example: "MAT, PHY" },
    { key: "maxPerDay", label: "Max per day", aliases: ["max/day", "per day"], example: "6" },
    { key: "maxPerWeek", label: "Max per week", aliases: ["max/week", "per week"], example: "30" },
    { key: "maxConsecutive", label: "Max in a row", aliases: ["max consecutive", "consecutive"], example: "4" },
  ],
  rooms: [
    { key: "name", label: "Name", required: true, aliases: ["room", "room name"], example: "Physics Lab" },
    { key: "type", label: "Type", aliases: ["room type", "kind"], example: "science_lab" },
    { key: "capacity", label: "Capacity", aliases: ["seats", "size"], example: "40" },
  ],
  lessons: [
    { key: "classes", label: "Class", required: true, aliases: ["classes", "class name", "section"], example: "10-A" },
    { key: "subject", label: "Subject", required: true, aliases: ["subject code"], example: "MAT" },
    { key: "teachers", label: "Teacher", required: true, aliases: ["teachers", "teacher code"], example: "AK" },
    { key: "periodsPerWeek", label: "Periods per week", required: true, aliases: ["periods", "per week", "ppw"], example: "6" },
    { key: "doubles", label: "Doubles", aliases: ["double periods"], example: "0" },
    { key: "roomType", label: "Room type", aliases: ["room"], example: "" },
    { key: "groupSize", label: "Group size", aliases: ["group"], example: "" },
    { key: "block", label: "Elective block", aliases: ["block", "elective"], example: "" },
  ],
};

export const templateRows = (e: Entity): string[][] => [TEMPLATES[e].map((f) => f.label), TEMPLATES[e].map((f) => f.example)];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** field key → column index (or -1). Matches label, key or alias, ignoring case/punctuation. */
export function autoMap(entity: Entity, headers: string[]): Record<string, number> {
  const H = headers.map(norm);
  const out: Record<string, number> = {};
  for (const f of TEMPLATES[entity]) {
    const names = [f.label, f.key, ...f.aliases].map(norm);
    out[f.key] = H.findIndex((h) => names.includes(h));
  }
  return out;
}

export interface RowError {
  /** 1-based row number as the user sees it in the spreadsheet (header = row 1). */
  row: number;
  message: string;
}

export interface ImportResult {
  added: number;
  updated: number;
  errors: RowError[];
  project: Project;
}

const yes = (s: string) => /^(1|y|yes|true|✓|x)$/i.test(s.trim());
const int = (s: string, fallback: number) => {
  const n = Number(s.trim());
  return s.trim() === "" ? fallback : Number.isFinite(n) ? Math.round(n) : NaN;
};
const list = (s: string) => s.split(/[,;/]/).map((x) => x.trim()).filter(Boolean);
const roomType = (s: string): RoomType | null | undefined => {
  if (!s.trim()) return null;
  const k = s.trim().toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, RoomType> = { lab: "science_lab", science: "science_lab", computer: "computer_lab", ground: "sports", sports_ground: "sports" };
  const v = map[k] ?? k;
  return RoomTypeSchema.safeParse(v).success ? (v as RoomType) : undefined;
};

/** Validate mapped rows and merge them into a copy of the project. Rows with errors are skipped. */
export function importRows(project: Project, entity: Entity, rows: string[][], mapping: Record<string, number>): ImportResult {
  const p: Project = structuredClone(project);
  const errors: RowError[] = [];
  let added = 0;
  let updated = 0;
  const missing = TEMPLATES[entity].filter((f) => f.required && (mapping[f.key] ?? -1) < 0);
  if (missing.length) return { added, updated, project, errors: [{ row: 1, message: `Choose a column for: ${missing.map((m) => m.label).join(", ")}` }] };

  const findBy = <T extends { name: string }>(arr: T[], name: string) => arr.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
  const byCode = <T extends { code: string; name: string }>(arr: T[], s: string) => arr.find((x) => x.code.toLowerCase() === s.toLowerCase() || x.name.toLowerCase() === s.toLowerCase());

  rows.forEach((raw, i) => {
    const rowNo = i + 2;
    const get = (k: string) => (mapping[k] >= 0 ? String(raw[mapping[k]] ?? "").trim() : "");
    if (raw.every((c) => !String(c ?? "").trim())) return; // skip blank lines
    const err = (m: string) => errors.push({ row: rowNo, message: m });
    const upsert = <T extends { id: string; name: string }>(arr: T[], item: T) => {
      const existing = findBy(arr, item.name);
      if (existing) {
        Object.assign(existing, { ...item, id: existing.id });
        updated++;
      } else {
        arr.push(item);
        added++;
      }
    };

    switch (entity) {
      case "classes": {
        const name = get("name");
        const strength = int(get("strength"), 40);
        if (!name) return err("Name is empty");
        if (!(strength >= 1)) return err(`Strength "${get("strength")}" is not a number`);
        const home = get("homeroom");
        const room = home ? findBy(p.rooms, home) : undefined;
        if (home && !room) return err(`Homeroom "${home}" is not in your rooms list (import rooms first)`);
        upsert<SchoolClass>(p.classes, { id: newId("cls"), name, strength, homeroomId: room?.id ?? null, classTeacherId: null, unavailable: [] });
        break;
      }
      case "subjects": {
        const name = get("name");
        const code = get("code").toUpperCase();
        if (!name) return err("Name is empty");
        if (!code || code.length > 8) return err("Code must be 1–8 letters");
        const type = (get("type").toLowerCase() || "theory") as Subject["type"];
        if (!["theory", "lab", "activity"].includes(type)) return err(`Type "${get("type")}" should be theory, lab or activity`);
        const pt = (get("preferredTime").toLowerCase() || "any") as Subject["preferredTime"];
        if (!["any", "morning", "afternoon"].includes(pt)) return err(`Preferred time "${get("preferredTime")}" should be morning, afternoon or any`);
        const rt = roomType(get("roomType"));
        if (rt === undefined) return err(`Room type "${get("roomType")}" is not recognised`);
        const color = /^#[0-9a-f]{6}$/i.test(get("color")) ? get("color") : SUBJECT_PALETTE[p.subjects.length % SUBJECT_PALETTE.length];
        upsert<Subject>(p.subjects, { id: newId("sub"), name, code, color, type, heavy: yes(get("heavy")), preferredTime: pt, roomType: rt });
        break;
      }
      case "teachers": {
        const name = get("name");
        const code = get("code").toUpperCase();
        if (!name) return err("Name is empty");
        if (!code) return err("Code is empty");
        const subs = list(get("subjects")).map((s) => ({ s, found: byCode(p.subjects, s) }));
        const bad = subs.filter((x) => !x.found);
        if (bad.length) return err(`Unknown subject(s): ${bad.map((b) => b.s).join(", ")}`);
        const nums = { maxPerDay: int(get("maxPerDay"), 6), maxPerWeek: int(get("maxPerWeek"), 30), maxConsecutive: int(get("maxConsecutive"), 4) };
        const badNum = Object.entries(nums).find(([, v]) => !(v >= 1));
        if (badNum) return err(`${TEMPLATES.teachers.find((f) => f.key === badNum[0])!.label} must be a number ≥ 1`);
        upsert<Teacher>(p.teachers, { id: newId("tch"), name, code, subjectIds: subs.map((x) => x.found!.id), unavailable: [], preferredFree: [], ...nums });
        break;
      }
      case "rooms": {
        const name = get("name");
        if (!name) return err("Name is empty");
        const rt = roomType(get("type") || "classroom");
        if (!rt) return err(`Room type "${get("type")}" is not recognised`);
        const capacity = int(get("capacity"), 40);
        if (!(capacity >= 1)) return err(`Capacity "${get("capacity")}" is not a number`);
        upsert<Room>(p.rooms, { id: newId("room"), name, type: rt, capacity });
        break;
      }
      case "lessons": {
        const classNames = list(get("classes"));
        const classes = classNames.map((c) => ({ c, found: findBy(p.classes, c) }));
        if (!classes.length) return err("Class is empty");
        const badC = classes.filter((x) => !x.found);
        if (badC.length) return err(`Unknown class(es): ${badC.map((b) => b.c).join(", ")}`);
        const subject = byCode(p.subjects, get("subject"));
        if (!subject) return err(`Unknown subject "${get("subject")}"`);
        const teachers = list(get("teachers")).map((t) => ({ t, found: byCode(p.teachers, t) }));
        if (!teachers.length) return err("Teacher is empty");
        const badT = teachers.filter((x) => !x.found);
        if (badT.length) return err(`Unknown teacher(s): ${badT.map((b) => b.t).join(", ")}`);
        const ppw = int(get("periodsPerWeek"), NaN);
        if (!(ppw >= 1 && ppw <= 40)) return err(`Periods per week "${get("periodsPerWeek")}" must be 1–40`);
        const doubles = int(get("doubles"), 0);
        if (!(doubles >= 0) || doubles * 2 > ppw) return err(`Doubles "${get("doubles")}" must be between 0 and ${Math.floor(ppw / 2)}`);
        const rt = roomType(get("roomType"));
        if (rt === undefined) return err(`Room type "${get("roomType")}" is not recognised`);
        const gs = int(get("groupSize"), 0);
        const lesson: Lesson = {
          id: newId("les"),
          classIds: classes.map((x) => x.found!.id),
          subjectId: subject.id,
          teacherIds: teachers.map((x) => x.found!.id),
          periodsPerWeek: ppw,
          doubles,
          roomType: rt,
          groupSize: gs >= 1 ? gs : null,
          blockId: get("block") || null,
          fixedSlots: [],
        };
        p.lessons.push(lesson);
        added++;
        break;
      }
    }
  });
  p.updatedAt = new Date().toISOString();
  return { added, updated, errors, project: p };
}
