import type { Fix } from "@/lib/model/fixes";
import { ROOM_TYPE_LABELS } from "@/lib/model/schema";
import type { Ctx } from "./context";
import type { ReasonCode, State } from "./state";
import { lessonLabel } from "./validator";

/**
 * Conflict explanation (pure code, no AI): for each lesson that couldn't be placed,
 * count which checks failed most often during the search and turn the top ones into
 * plain-language reasons with concrete suggestions.
 */

export interface ExplainedReason {
  code: ReasonCode;
  count: number;
  message: string;
  fixes: Fix[];
}

export interface Unplaced {
  lessonId: string;
  label: string;
  periods: number;
  reasons: ExplainedReason[];
}

function describe(ctx: Ctx, code: ReasonCode, ref: number): { message: string; fixes: Fix[] } {
  const p = ctx.project;
  switch (code) {
    case "teacherBusy":
    case "teacherDayMax":
    case "teacherWeekMax":
    case "teacherConsecutive": {
      const t = p.teachers[ref];
      if (code === "teacherBusy") {
        const fixes: Fix[] = [{ label: `Give some of ${t.name}'s lessons to another teacher` }];
        if (t.unavailable.length) {
          const day = Math.floor(t.unavailable[0] / 16);
          fixes.push({ label: `Make ${t.name} available on ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]}`, action: { type: "clearTeacherUnavailable", teacherId: t.id, day } });
        }
        return { message: `${t.name} is already teaching in the free slots.`, fixes };
      }
      if (code === "teacherDayMax")
        return {
          message: `${t.name} would go over ${t.maxPerDay} periods a day.`,
          fixes: [{ label: `Allow ${t.name} ${t.maxPerDay + 1} periods per day`, action: { type: "setTeacherLimit", teacherId: t.id, field: "maxPerDay", value: t.maxPerDay + 1 } }],
        };
      if (code === "teacherWeekMax")
        return {
          message: `${t.name} would go over ${t.maxPerWeek} periods a week.`,
          fixes: [{ label: `Allow ${t.name} ${t.maxPerWeek + 2} periods per week`, action: { type: "setTeacherLimit", teacherId: t.id, field: "maxPerWeek", value: t.maxPerWeek + 2 } }],
        };
      return {
        message: `${t.name} would teach more than ${t.maxConsecutive} periods in a row.`,
        fixes: [{ label: `Allow ${t.maxConsecutive + 1} periods in a row for ${t.name}`, action: { type: "setTeacherLimit", teacherId: t.id, field: "maxConsecutive", value: t.maxConsecutive + 1 } }],
      };
    }
    case "classBusy":
      return { message: `Class ${p.classes[ref].name}'s week is already full at those times.`, fixes: [{ label: `Reduce periods per week for ${p.classes[ref].name}, or add periods to the day` }] };
    case "subjectDayMax": {
      const subj = p.subjects[ctx.lessonSubject[ref]]?.name ?? "this subject";
      const max = ctx.lessonDayMax[ref];
      return {
        message: `It would put more than ${max} ${subj} periods on one day.`,
        fixes: [{ label: `Allow ${max + 1} ${subj} periods on one day`, action: { type: "setMaxSameSubjectPerDay", value: max + 1 } }],
      };
    }
    case "noRoom":
    case "roomBusy": {
      const need = ctx.lessonRoom[ref];
      if (need.kind === "type") {
        const label = ROOM_TYPE_LABELS[need.type];
        return {
          message: `Every suitable ${label.toLowerCase()} is booked at those times.`,
          fixes: [{ label: `Add a second ${label.toLowerCase()}`, action: { type: "addRoom", roomType: need.type, capacity: need.minCap } }],
        };
      }
      return { message: "The class's room is booked at those times.", fixes: [{ label: "Give the lesson a room type so another room can be used" }] };
    }
    case "banned":
      return {
        message: "Unavailable periods, fixed events or hard rules leave no time for it.",
        fixes: [{ label: "Relax a hard rule or unavailable period (steps 5 and 8)" }],
      };
  }
}

export function explainUnplaced(st: State): Unplaced[] {
  const ctx = st.ctx;
  const out: Unplaced[] = [];
  ctx.groups.forEach((g, gi) => {
    const missing = ctx.unitsOfGroup[gi].filter((u) => st.pos[u] < 0);
    if (!missing.length) return;
    const totals = new Map<string, number>();
    for (const u of ctx.unitsOfGroup[gi]) for (const [k, n] of st.fails[u]) totals.set(k, (totals.get(k) ?? 0) + n);
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const reasons = top.map(([k, count]) => {
      const [code, ref] = k.split(":");
      return { code: code as ReasonCode, count, ...describe(ctx, code as ReasonCode, Number(ref)) };
    });
    if (!reasons.length) reasons.push({ code: "banned", count: 0, ...describe(ctx, "banned", g.lessons[0]) });
    for (const li of g.lessons)
      out.push({
        lessonId: ctx.lessons[li].id,
        label: lessonLabel(ctx, li),
        periods: missing.reduce((n, u) => n + ctx.units[u].length, 0),
        reasons,
      });
  });
  return out;
}
