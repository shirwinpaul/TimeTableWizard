import { DAY_SHORT, type Placement, type Project } from "@/lib/model/schema";
import { gridFor, type ViewKind } from "@/lib/timetable/views";
import { inkOn } from "@/components/timetable/LessonChip";

/** Draw one timetable onto a canvas and return a PNG blob (for sharing on WhatsApp). Browser only. */
export async function timetablePng(p: Project, placements: Placement[], kind: ViewKind, id: string, title: string): Promise<Blob> {
  const grid = gridFor(p, placements, kind, id);
  const days = [...p.calendar.days].sort((a, b) => a.day - b.day);
  const maxP = Math.max(...days.map((d) => d.periods));
  const scale = 2;
  const cw = 110;
  const ch = 56;
  const left = 60;
  const top = 86;
  const W = left + maxP * cw + 20;
  const H = top + days.length * ch + 40;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const g = canvas.getContext("2d")!;
  g.scale(scale, scale);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#1b1a33";
  g.font = "bold 20px Inter, Arial, sans-serif";
  g.fillText(title, 16, 30);
  g.font = "12px Inter, Arial, sans-serif";
  g.fillStyle = "#55546f";
  g.fillText(p.name + (p.academicYear ? ` · ${p.academicYear}` : ""), 16, 50);
  for (let q = 0; q < maxP; q++) {
    g.fillStyle = "#1b1a33";
    g.font = "bold 12px Inter, Arial, sans-serif";
    g.fillText(`P${q + 1}`, left + q * cw + 6, top - 18);
    const t = p.calendar.periodTimes[q];
    if (t) {
      g.font = "10px Inter, Arial, sans-serif";
      g.fillStyle = "#55546f";
      g.fillText(`${t.start}-${t.end}`, left + q * cw + 6, top - 5);
    }
  }
  days.forEach((d, r) => {
    const y = top + r * ch;
    g.fillStyle = "#1b1a33";
    g.font = "bold 13px Inter, Arial, sans-serif";
    g.fillText(DAY_SHORT[d.day], 12, y + ch / 2 + 4);
    for (let q = 0; q < maxP; q++) {
      const x = left + q * cw;
      g.strokeStyle = "#e0def0";
      g.strokeRect(x, y, cw, ch);
      if (q >= d.periods) continue;
      const es = grid[d.day][q];
      const ev = p.calendar.fixedEvents.find((x) => x.day === d.day && x.period === q);
      if (!es.length && ev) {
        g.fillStyle = "#55546f";
        g.font = "italic 11px Inter, Arial, sans-serif";
        g.fillText(ev.name.slice(0, 16), x + 6, y + ch / 2 + 4);
      }
      es.forEach((e, k) => {
        const h = (ch - 4) / es.length;
        const bg = e.subject?.color ?? "#999999";
        g.fillStyle = bg;
        g.fillRect(x + 2, y + 2 + k * h, cw - 4, h - 1);
        g.fillStyle = inkOn(bg);
        g.font = "bold 12px Inter, Arial, sans-serif";
        g.fillText((e.subject?.code ?? "?") + (e.continuation ? " …" : ""), x + 6, y + 16 + k * h);
        g.font = "10px Inter, Arial, sans-serif";
        const sub = kind === "class" ? e.teachers.map((t) => t.code).join(", ") : e.classNames;
        if (h > 24) g.fillText(sub.slice(0, 18), x + 6, y + 30 + k * h);
      });
    }
  });
  g.fillStyle = "#55546f";
  g.font = "10px Inter, Arial, sans-serif";
  g.fillText("Made with Timetable Wizard", 16, H - 14);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png"));
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (s: string) => s.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || "timetable";
