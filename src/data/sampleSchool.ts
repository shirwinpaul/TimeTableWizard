import { defaultCalendar, defaultRules } from "@/lib/model/defaults";
import { slotOf, type Lesson, type Project, type RoomType, type Subject, type Teacher } from "@/lib/model/schema";

/**
 * "Sunrise Public School" — a FICTIONAL school. Every name here is made up.
 * 12 classes (6-A … 11-B), 23 teachers, 16 rooms, Mon–Fri 8 periods + Saturday half day.
 * Includes a combined class (11-A + 11-B PE) and an elective block (11 CS / Biology).
 */

const subject = (
  id: string,
  name: string,
  code: string,
  color: string,
  type: Subject["type"],
  extra: Partial<Subject> = {},
): Subject => ({ id, name, code, color, type, heavy: false, preferredTime: "any", roomType: null, ...extra });

const SUBJECTS: Subject[] = [
  subject("sub_eng", "English", "ENG", "#0072B2", "theory"),
  subject("sub_tam", "Tamil", "TAM", "#E69F00", "theory"),
  subject("sub_mat", "Mathematics", "MAT", "#7B61FF", "theory", { heavy: true, preferredTime: "morning" }),
  subject("sub_sci", "Science", "SCI", "#009E73", "theory", { heavy: true }),
  subject("sub_soc", "Social Science", "SOC", "#CC79A7", "theory"),
  subject("sub_phy", "Physics", "PHY", "#56B4E9", "theory", { heavy: true }),
  subject("sub_che", "Chemistry", "CHE", "#D55E00", "theory", { heavy: true }),
  subject("sub_bio", "Biology", "BIO", "#6B8E23", "theory"),
  subject("sub_slb", "Science Practical", "SLB", "#00A3A3", "lab", { roomType: "science_lab" }),
  subject("sub_chl", "Chemistry Practical", "CHL", "#A0522D", "lab", { roomType: "science_lab" }),
  subject("sub_cmp", "Computer Studies", "CMP", "#17BECF", "lab", { roomType: "computer_lab" }),
  subject("sub_cs", "Computer Science", "CS", "#8C564B", "lab", { roomType: "computer_lab" }),
  subject("sub_pe", "Physical Education", "PE", "#B8860B", "activity", { roomType: "sports", preferredTime: "afternoon" }),
  subject("sub_art", "Art", "ART", "#E377C2", "activity", { preferredTime: "afternoon" }),
  subject("sub_lib", "Library", "LIB", "#999999", "activity"),
  subject("sub_gk", "General Knowledge", "GK", "#F0E442", "theory"),
];

const teacher = (id: string, name: string, code: string, subjectIds: string[], extra: Partial<Teacher> = {}): Teacher => ({
  id,
  name,
  code,
  subjectIds,
  unavailable: [],
  maxPerDay: 6,
  maxPerWeek: 30,
  maxConsecutive: 4,
  preferredFree: [],
  ...extra,
});

const range = (day: number, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => slotOf(day, from + i));

const TEACHERS: Teacher[] = [
  teacher("t_anita", "Anita Raman", "AR", ["sub_eng"]),
  teacher("t_bharat", "Bharat Menon", "BM", ["sub_eng"]),
  teacher("t_celine", "Celine Dsouza", "CD", ["sub_eng"]),
  teacher("t_deepa", "Deepa Murugan", "DM", ["sub_tam"]),
  teacher("t_elango", "Elango Selvam", "ES", ["sub_tam"]),
  teacher("t_fathima", "Fathima Noor", "FN", ["sub_tam"]),
  teacher("t_ganesh", "Ganesh Iyer", "GI", ["sub_mat"]),
  teacher("t_harini", "Harini Venkat", "HV", ["sub_mat"]),
  teacher("t_imran", "Imran Qadir", "IQ", ["sub_mat"]),
  teacher("t_janaki", "Janaki Rao", "JR", ["sub_mat"]),
  teacher("t_karthik", "Karthik Sundar", "KS", ["sub_sci", "sub_phy"]),
  teacher("t_lakshmi", "Lakshmi Prasad", "LP", ["sub_sci", "sub_bio"]),
  teacher("t_mohan", "Mohan Dasan", "MD", ["sub_phy", "sub_sci"]),
  teacher("t_nisha", "Nisha Pillai", "NP", ["sub_che", "sub_chl"]),
  teacher("t_omar", "Omar Farooqui", "OF", ["sub_bio", "sub_slb"]),
  teacher("t_priya", "Priya Nairam", "PN", ["sub_soc"]),
  teacher("t_rahul", "Rahul Vermani", "RV", ["sub_soc"]),
  teacher("t_sangeetha", "Sangeetha Bosco", "SB", ["sub_soc", "sub_gk"]),
  teacher("t_tarun", "Tarun Joshwa", "TJ", ["sub_cmp", "sub_cs"]),
  teacher("t_uma", "Uma Shankari", "US", ["sub_pe"]),
  // Part-time: not in school on Mondays.
  teacher("t_vikram", "Vikram Patelan", "VP", ["sub_pe"], { unavailable: range(0, 0, 7), maxPerWeek: 12 }),
  // Part-time: leaves early on Fridays.
  teacher("t_kavya", "Kavya Ilango", "KI", ["sub_art"], { unavailable: range(4, 4, 7), maxPerWeek: 14 }),
  teacher("t_wilson", "Wilson Georgey", "WG", ["sub_lib", "sub_gk"]),
];

const JUNIOR = ["6-A", "6-B", "7-A", "7-B", "8-A", "8-B"];
const SENIOR = ["9-A", "9-B", "10-A", "10-B"];
const ELEVEN = ["11-A", "11-B"];
const cid = (name: string) => `c_${name.toLowerCase().replace("-", "")}`;
const rid = (name: string) => `r_${name.toLowerCase().replace("-", "")}`;

let lessonNo = 0;
const lesson = (
  classes: string[],
  subjectId: string,
  teachers: string[],
  periodsPerWeek: number,
  extra: Partial<Lesson> = {},
): Lesson => ({
  id: `l_${String(++lessonNo).padStart(3, "0")}`,
  classIds: classes.map(cid),
  subjectId,
  teacherIds: teachers,
  periodsPerWeek,
  doubles: 0,
  roomType: null,
  groupSize: null,
  blockId: null,
  fixedSlots: [],
  ...extra,
});

function buildLessons(): Lesson[] {
  lessonNo = 0;
  const out: Lesson[] = [];
  const each = (classes: string[], teachersByClass: string[], subjectId: string, ppw: number, extra: Partial<Lesson> = {}) =>
    classes.forEach((c, i) => out.push(lesson([c], subjectId, [teachersByClass[i]], ppw, extra)));

  // Classes 6–8
  each(JUNIOR, ["t_anita", "t_anita", "t_anita", "t_bharat", "t_bharat", "t_bharat"], "sub_eng", 7);
  each(JUNIOR, ["t_deepa", "t_deepa", "t_deepa", "t_deepa", "t_elango", "t_elango"], "sub_tam", 5);
  each(JUNIOR, ["t_ganesh", "t_ganesh", "t_ganesh", "t_harini", "t_harini", "t_harini"], "sub_mat", 7);
  each(JUNIOR, ["t_karthik", "t_karthik", "t_karthik", "t_lakshmi", "t_lakshmi", "t_lakshmi"], "sub_sci", 7);
  each(JUNIOR, ["t_priya", "t_priya", "t_priya", "t_priya", "t_rahul", "t_rahul"], "sub_soc", 6);
  each(JUNIOR, Array(6).fill("t_tarun"), "sub_cmp", 2, { doubles: 1 });
  each(JUNIOR, Array(6).fill("t_uma"), "sub_pe", 3);
  each(JUNIOR, Array(6).fill("t_kavya"), "sub_art", 2);
  each(JUNIOR, Array(6).fill("t_wilson"), "sub_lib", 1);
  each(JUNIOR, Array(6).fill("t_sangeetha"), "sub_gk", 1);

  // Classes 9–10
  each(SENIOR, Array(4).fill("t_celine"), "sub_eng", 6);
  each(SENIOR, ["t_elango", "t_elango", "t_fathima", "t_fathima"], "sub_tam", 5);
  each(SENIOR, ["t_imran", "t_imran", "t_imran", "t_janaki"], "sub_mat", 8);
  each(SENIOR, Array(4).fill("t_mohan"), "sub_phy", 3);
  each(SENIOR, Array(4).fill("t_nisha"), "sub_che", 3);
  each(SENIOR, Array(4).fill("t_omar"), "sub_bio", 3);
  each(SENIOR, Array(4).fill("t_omar"), "sub_slb", 2, { doubles: 1 });
  each(SENIOR, ["t_rahul", "t_rahul", "t_sangeetha", "t_sangeetha"], "sub_soc", 6);
  each(SENIOR, Array(4).fill("t_tarun"), "sub_cmp", 2, { doubles: 1 });
  each(SENIOR, Array(4).fill("t_vikram"), "sub_pe", 2);

  // Class 11
  each(ELEVEN, ["t_anita", "t_bharat"], "sub_eng", 5);
  each(ELEVEN, ["t_fathima", "t_fathima"], "sub_tam", 4);
  each(ELEVEN, ["t_janaki", "t_janaki"], "sub_mat", 7);
  each(ELEVEN, ["t_mohan", "t_mohan"], "sub_phy", 6);
  each(ELEVEN, ["t_nisha", "t_nisha"], "sub_che", 6);
  each(ELEVEN, ["t_nisha", "t_nisha"], "sub_chl", 2, { doubles: 1 });
  // Combined class: 11-A and 11-B together for PE.
  out.push(lesson(ELEVEN, "sub_pe", ["t_vikram"], 2));
  // Elective block: CS and Biology groups run in parallel for both sections.
  out.push(lesson(ELEVEN, "sub_cs", ["t_tarun"], 6, { doubles: 1, blockId: "blk_11_elective", groupSize: 40 }));
  out.push(lesson(ELEVEN, "sub_bio", ["t_omar"], 6, { doubles: 1, blockId: "blk_11_elective", groupSize: 38, roomType: "science_lab" }));
  return out;
}

export function sampleSchool(): Project {
  const now = new Date().toISOString();
  const calendar = defaultCalendar();
  calendar.days = [0, 1, 2, 3, 4].map((day) => ({ day, periods: 8 }));
  calendar.days.push({ day: 5, periods: 4 });
  calendar.fixedEvents = [{ id: "ev_clubs", name: "Club Activities", day: 5, period: 3, classIds: [] }];

  const allClasses = [...JUNIOR, ...SENIOR, ...ELEVEN];
  const rooms: { id: string; name: string; type: RoomType; capacity: number }[] = allClasses.map((c) => ({
    id: rid(c),
    name: `Room ${c}`,
    type: "classroom",
    capacity: 45,
  }));
  rooms.push(
    { id: "r_scilab1", name: "Science Lab 1", type: "science_lab", capacity: 45 },
    { id: "r_scilab2", name: "Science Lab 2", type: "science_lab", capacity: 45 },
    { id: "r_complab", name: "Computer Lab", type: "computer_lab", capacity: 45 },
    { id: "r_ground", name: "Sports Ground", type: "sports", capacity: 120 },
  );

  // Deep copy so callers can never mutate the shared constants above.
  return structuredClone({
    id: "prj_sample_sunrise",
    name: "Sunrise Public School",
    type: "School",
    academicYear: "2026-27",
    createdAt: now,
    updatedAt: now,
    calendar,
    classes: allClasses.map((name, i) => ({
      id: cid(name),
      name,
      strength: name === "11-B" ? 38 : 40,
      homeroomId: rid(name),
      classTeacherId: TEACHERS[i % TEACHERS.length].id,
      unavailable: [],
    })),
    subjects: SUBJECTS,
    teachers: TEACHERS,
    rooms,
    lessons: buildLessons(),
    rules: [
      ...defaultRules(),
      {
        id: "rule_pe_lunch",
        label: "PE should not be right after lunch",
        enabled: true,
        hard: false,
        weight: 6,
        soft: null,
        custom: { kind: "notAfterBreak", subjectId: "sub_pe", classIds: [], breakKind: "lunch" },
      },
    ],
    settings: { maxSameSubjectPerDay: 2, allowDoubleAcrossShortBreak: false },
    timetable: null,
    versions: [],
    substitutions: [],
  } satisfies Project);
}
