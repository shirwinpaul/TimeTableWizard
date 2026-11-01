import { z } from "zod";

/**
 * Core data model. Everything the solver, validator and UI use is defined here.
 *
 * Time is addressed by (day, period): `day` is 0..5 (Mon..Sat) and `period` is the
 * 0-based index of a TEACHING period within that day. Breaks are not periods; they sit
 * "after" a teaching period. A slot is packed into one number: day * MAX_PERIODS + period.
 */
export const MAX_PERIODS = 16;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const slotOf = (day: number, period: number) => day * MAX_PERIODS + period;
export const dayOf = (slot: number) => Math.floor(slot / MAX_PERIODS);
export const periodOf = (slot: number) => slot % MAX_PERIODS;

const id = z.string().min(1).max(64);
const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const slot = z.number().int().min(0).max(6 * MAX_PERIODS - 1);

export const RoomTypeSchema = z.enum(["classroom", "science_lab", "computer_lab", "sports", "music"]);
export type RoomType = z.infer<typeof RoomTypeSchema>;
export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  classroom: "Classroom",
  science_lab: "Science lab",
  computer_lab: "Computer lab",
  sports: "Sports ground",
  music: "Music room",
};

export const DayConfigSchema = z.object({
  day: z.number().int().min(0).max(5),
  periods: z.number().int().min(1).max(MAX_PERIODS),
});

export const PeriodTimeSchema = z.object({ start: time, end: time });

export const BreakSchema = z.object({
  id,
  label: z.string().min(1).max(40),
  afterPeriod: z.number().int().min(0).max(MAX_PERIODS - 1),
  kind: z.enum(["short", "lunch"]),
  start: time,
  end: time,
});

export const FixedEventSchema = z.object({
  id,
  name: z.string().max(60),
  day: z.number().int().min(0).max(5),
  period: z.number().int().min(0).max(MAX_PERIODS - 1),
  /** Empty array = all classes. */
  classIds: z.array(id),
});

export const CalendarSchema = z.object({
  days: z.array(DayConfigSchema).min(1).max(6),
  /** Times of teaching periods by index (shared by all days; shorter days use the first N). */
  periodTimes: z.array(PeriodTimeSchema).max(MAX_PERIODS),
  breaks: z.array(BreakSchema),
  fixedEvents: z.array(FixedEventSchema),
});

export const ClassSchema = z.object({
  id,
  name: z.string().max(40),
  strength: z.number().int().min(1).max(500),
  homeroomId: id.nullable().default(null),
  classTeacherId: id.nullable().default(null),
  unavailable: z.array(slot).default([]),
});

export const SubjectSchema = z.object({
  id,
  name: z.string().max(60),
  code: z.string().max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  type: z.enum(["theory", "lab", "activity"]),
  heavy: z.boolean().default(false),
  preferredTime: z.enum(["morning", "any", "afternoon"]).default("any"),
  /** Default room type for lessons of this subject (lessons may override). */
  roomType: RoomTypeSchema.nullable().default(null),
});

export const TeacherSchema = z.object({
  id,
  name: z.string().max(60),
  code: z.string().max(8),
  subjectIds: z.array(id).default([]),
  unavailable: z.array(slot).default([]),
  maxPerDay: z.number().int().min(1).max(MAX_PERIODS).default(6),
  maxPerWeek: z.number().int().min(1).max(96).default(30),
  maxConsecutive: z.number().int().min(1).max(MAX_PERIODS).default(4),
  preferredFree: z.array(slot).default([]),
});

export const RoomSchema = z.object({
  id,
  name: z.string().max(40),
  type: RoomTypeSchema,
  capacity: z.number().int().min(1).max(1000),
});

export const LessonSchema = z.object({
  id,
  /** More than one class = combined class (taught together). */
  classIds: z.array(id),
  subjectId: z.string().max(64),
  teacherIds: z.array(id),
  periodsPerWeek: z.number().int().min(1).max(40),
  /** Number of double (2 consecutive) periods inside periodsPerWeek. */
  doubles: z.number().int().min(0).max(20).default(0),
  /** null = use the subject's room type (or the class homeroom if none). */
  roomType: RoomTypeSchema.nullable().default(null),
  /** Students in this group, when smaller than the classes' total strength (electives). */
  groupSize: z.number().int().min(1).max(1000).nullable().default(null),
  /** Lessons sharing a blockId are an elective block: taught in parallel, same slots. */
  blockId: id.nullable().default(null),
  /** Slots this lesson must occupy (start slots of single periods). */
  fixedSlots: z.array(slot).default([]),
});

/** Built-in soft rule kinds, scored by score.ts. */
export const SoftKindSchema = z.enum([
  "spread",
  "heavyMorning",
  "teacherGaps",
  "balancedLoad",
  "subjectTimePref",
  "lastPeriod",
]);
export type SoftKind = z.infer<typeof SoftKindSchema>;

const target = {
  subjectId: id.nullable().default(null),
  /** Empty = all classes. */
  classIds: z.array(id).default([]),
};

/** Rules users can create with the rule builder (or the AI "Describe a rule"). */
export const CustomRuleParamsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("subjectPeriods"),
    ...target,
    days: z.array(z.number().int().min(0).max(5)).default([]),
    fromPeriod: z.number().int().min(0).max(MAX_PERIODS - 1),
    toPeriod: z.number().int().min(0).max(MAX_PERIODS - 1),
  }),
  z.object({
    kind: z.literal("teacherUnavailable"),
    teacherId: id,
    days: z.array(z.number().int().min(0).max(5)).min(1),
    fromPeriod: z.number().int().min(0).max(MAX_PERIODS - 1),
    toPeriod: z.number().int().min(0).max(MAX_PERIODS - 1),
  }),
  z.object({
    kind: z.literal("classUnavailable"),
    classIds: z.array(id).default([]),
    days: z.array(z.number().int().min(0).max(5)).min(1),
    fromPeriod: z.number().int().min(0).max(MAX_PERIODS - 1),
    toPeriod: z.number().int().min(0).max(MAX_PERIODS - 1),
  }),
  z.object({ kind: z.literal("notAfterBreak"), ...target, breakKind: z.enum(["lunch", "short", "any"]) }),
  z.object({ kind: z.literal("notLastPeriod"), ...target }),
  z.object({ kind: z.literal("notFirstPeriod"), ...target }),
  z.object({ kind: z.literal("maxPerDay"), ...target, max: z.number().int().min(1).max(8) }),
]);
export type CustomRuleParams = z.infer<typeof CustomRuleParamsSchema>;

export const RuleSchema = z.object({
  id,
  label: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  hard: z.boolean().default(false),
  weight: z.number().int().min(1).max(10).default(5),
  soft: SoftKindSchema.nullable().default(null),
  custom: CustomRuleParamsSchema.nullable().default(null),
});

export const SettingsSchema = z.object({
  maxSameSubjectPerDay: z.number().int().min(1).max(8).default(2),
  allowDoubleAcrossShortBreak: z.boolean().default(false),
});

export const PlacementSchema = z.object({
  lessonId: id,
  /** Index of the unit within the lesson (doubles first). */
  unit: z.number().int().min(0),
  day: z.number().int().min(0).max(5),
  period: z.number().int().min(0).max(MAX_PERIODS - 1),
  length: z.number().int().min(1).max(2),
  roomId: id.nullable(),
  locked: z.boolean().default(false),
});

export const TimetableSchema = z.object({
  placements: z.array(PlacementSchema),
  seed: z.number().int(),
  generatedAt: z.string(),
  solveMs: z.number().default(0),
});

export const VersionSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  savedAt: z.string(),
  timetable: TimetableSchema,
});

export const SubstitutionSchema = z.object({
  id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  absentTeacherId: id,
  lessonId: id,
  period: z.number().int().min(0).max(MAX_PERIODS - 1),
  substituteId: id.nullable(),
});

export const ProjectSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  type: z.enum(["School", "College"]),
  academicYear: z.string().max(20).default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
  calendar: CalendarSchema,
  classes: z.array(ClassSchema),
  subjects: z.array(SubjectSchema),
  teachers: z.array(TeacherSchema),
  rooms: z.array(RoomSchema),
  lessons: z.array(LessonSchema),
  rules: z.array(RuleSchema),
  settings: SettingsSchema,
  timetable: TimetableSchema.nullable().default(null),
  versions: z.array(VersionSchema).default([]),
  substitutions: z.array(SubstitutionSchema).default([]),
});

export type DayConfig = z.infer<typeof DayConfigSchema>;
export type Calendar = z.infer<typeof CalendarSchema>;
export type BreakDef = z.infer<typeof BreakSchema>;
export type FixedEvent = z.infer<typeof FixedEventSchema>;
export type SchoolClass = z.infer<typeof ClassSchema>;
export type Subject = z.infer<typeof SubjectSchema>;
export type Teacher = z.infer<typeof TeacherSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type Placement = z.infer<typeof PlacementSchema>;
export type Timetable = z.infer<typeof TimetableSchema>;
export type Version = z.infer<typeof VersionSchema>;
export type Substitution = z.infer<typeof SubstitutionSchema>;
export type Project = z.infer<typeof ProjectSchema>;
