"use client";

import type { Entry } from "@/lib/timetable/views";

/** Black or white text, whichever reads better on the background (WCAG contrast). */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#111111" : "#ffffff";
}

const TEACHER_COLORS = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#7B61FF", "#00A3A3", "#B8860B", "#8C564B"];
export const teacherColor = (id: string) => TEACHER_COLORS[[...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % TEACHER_COLORS.length];

export type ColorBy = "subject" | "teacher";
export type Show = "class" | "teacher" | "room";

export function LessonChip({
  e,
  colorBy,
  detailed,
  show,
  clash,
  changed,
  selected,
  bw,
}: {
  e: Entry;
  colorBy: ColorBy;
  detailed: boolean;
  /** Which extra labels to show (we hide the one the view is already about). */
  show: Show[];
  clash?: boolean;
  changed?: boolean;
  selected?: boolean;
  bw?: boolean;
}) {
  const bg = bw ? "#ffffff" : colorBy === "teacher" && e.teachers[0] ? teacherColor(e.teachers[0].id) : e.subject?.color ?? "#999999";
  const ink = bw ? "#000000" : inkOn(bg);
  const subj = detailed ? e.subject?.name ?? "?" : e.subject?.code ?? "?";
  return (
    <div
      className={`relative flex h-full min-h-10 flex-col justify-center overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight ${clash ? "ring-2 ring-bad ring-offset-1" : ""} ${changed ? "outline-2 outline-dashed outline-violet" : ""} ${selected ? "ring-2 ring-primary ring-offset-1" : ""} ${e.continuation ? "opacity-80" : ""} ${bw ? "border border-black" : ""}`}
      style={{ background: bg, color: ink }}
    >
      <span className="font-bold">
        {subj}
        {e.continuation && <span aria-label="continued double period"> ⋯</span>}
      </span>
      {show.includes("class") && <span className="truncate">{e.classNames}</span>}
      {show.includes("teacher") && <span className="truncate">{detailed ? e.teachers.map((t) => t.name).join(", ") : e.teachers.map((t) => t.code).join(", ")}</span>}
      {show.includes("room") && e.room && detailed && <span className="truncate opacity-90">{e.room.name}</span>}
      {e.placement.locked && (
        <span className="absolute right-0.5 top-0.5 text-[9px]" aria-label="locked">
          🔒
        </span>
      )}
      {clash && <span className="sr-only">clash</span>}
    </div>
  );
}
