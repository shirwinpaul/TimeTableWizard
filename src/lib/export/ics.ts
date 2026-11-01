import type { Placement, Project } from "@/lib/model/schema";
import { gridFor, lookup, entryOf, type ViewKind } from "@/lib/timetable/views";

/**
 * iCalendar (.ics, RFC 5545) with one weekly recurring event per lesson slot,
 * from `startDate` until `endDate`, in the chosen time zone.
 */

export interface IcsOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  timeZone: string; // IANA, e.g. Asia/Kolkata
  now?: Date;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Fold lines longer than 75 octets (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const ymd = (s: string) => s.replace(/-/g, "");
const hm = (s: string) => s.replace(":", "") + "00";

/** UTC offset (e.g. "+0530") of a time zone on a date, via Intl. */
export function tzOffset(timeZone: string, date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(date);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = name.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (!m) return "+0000";
    return `${m[1]}${m[2].padStart(2, "0")}${m[3] ?? "00"}`;
  } catch {
    return "+0000";
  }
}

/** First date on/after `start` that falls on weekday `day` (0 = Monday). */
export function firstWeekday(start: string, day: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  const js = (day + 1) % 7; // JS: 0 = Sunday
  while (d.getUTCDay() !== js) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildIcs(p: Project, placements: Placement[], kind: ViewKind, id: string, o: IcsOptions): string {
  const lk = lookup(p);
  const now = (o.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const offset = tzOffset(o.timeZone, new Date(`${o.startDate}T12:00:00Z`));
  const who = kind === "class" ? p.classes.find((c) => c.id === id)?.name : kind === "teacher" ? p.teachers.find((t) => t.id === id)?.name : p.rooms.find((r) => r.id === id)?.name;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Timetable Wizard//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`${p.name} — ${who ?? ""}`)}`,
    `X-WR-TIMEZONE:${o.timeZone}`,
    "BEGIN:VTIMEZONE",
    `TZID:${o.timeZone}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    `TZOFFSETFROM:${offset}`,
    `TZOFFSETTO:${offset}`,
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  const grid = gridFor(p, placements, kind, id);
  const seen = new Set<string>();
  for (const day of grid.keys())
    for (const cell of grid[day])
      for (const e0 of cell) {
        if (e0.continuation) continue;
        const pl = e0.placement;
        const key = `${pl.lessonId}#${pl.unit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const e = entryOf(lk, pl)!;
        const start = p.calendar.periodTimes[pl.period];
        const end = p.calendar.periodTimes[pl.period + pl.length - 1];
        if (!start || !end) continue;
        const date = firstWeekday(o.startDate, pl.day);
        if (date > o.endDate) continue;
        const summary = `${e.subject?.name ?? "Lesson"} — ${kind === "class" ? e.teachers.map((t) => t.name).join(", ") : e.classNames}`;
        lines.push(
          "BEGIN:VEVENT",
          `UID:${pl.lessonId}-${pl.unit}-${kind}-${id}@timetable-wizard`,
          `DTSTAMP:${now}`,
          `DTSTART;TZID=${o.timeZone}:${ymd(date)}T${hm(start.start)}`,
          `DTEND;TZID=${o.timeZone}:${ymd(date)}T${hm(end.end)}`,
          `RRULE:FREQ=WEEKLY;UNTIL=${ymd(o.endDate)}T235959Z`,
          `SUMMARY:${esc(summary)}`,
          ...(e.room ? [`LOCATION:${esc(e.room.name)}`] : []),
          "END:VEVENT",
        );
      }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
