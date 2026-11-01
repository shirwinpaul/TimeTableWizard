import Link from "next/link";
import { HeroGrid } from "@/components/HeroGrid";

const STEPS = [
  { n: 1, title: "Enter your school", text: "Days, periods, classes, subjects, teachers and rooms — or import a spreadsheet." },
  { n: 2, title: "Add your rules", text: "Lab doubles, teacher availability, “Maths in the morning”… pick from a list or describe them." },
  { n: 3, title: "Generate & adjust", text: "The solver builds a clash-free timetable. Drag to fine-tune with live clash checks." },
];

const FEATURES = [
  { icon: "🧠", title: "Real constraint solver", text: "Backtracking search with smart ordering, then quality optimisation. Every timetable is re-checked by a validator." },
  { icon: "🖐️", title: "Drag-and-drop editing", text: "Valid cells glow green; invalid ones tell you why (“Teacher busy with 9-B”). Lock cells and re-solve the rest." },
  { icon: "🔄", title: "Daily substitutions", text: "Mark a teacher absent and get free substitutes ranked by subject and fairness. Print or share on WhatsApp." },
  { icon: "📤", title: "Exports", text: "PDF (print), Excel / CSV, calendar (.ics), image and a full project backup file." },
];

export default function Home() {
  return (
    <div>
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:py-20">
        <div className="flex flex-col gap-5">
          <span className="w-fit rounded-full bg-ok-soft px-3 py-1 text-sm font-semibold text-ok">🔒 Your data stays on your device</span>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Clash-free timetables in seconds, not weeks. <span aria-hidden>🧙‍♂️📅</span>
          </h1>
          <p className="max-w-xl text-lg text-muted">
            Timetable Wizard builds school and college timetables with a tested constraint solver — no teacher, class or room is ever double-booked.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/start?new=1" className="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-ink shadow hover:bg-primary-hover">
              Create a timetable
            </Link>
            <Link href="/start?sample=1" className="rounded-lg border border-line bg-surface px-5 py-3 font-semibold hover:bg-surface-2">
              🧪 Try the sample school
            </Link>
          </div>
        </div>
        <HeroGrid />
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="mb-6 text-2xl font-bold">How it works</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-xl border border-line bg-bg p-5">
                <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary font-bold text-primary-ink">{s.n}</span>
                <h3 className="font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="mb-6 text-2xl font-bold">Built for real school offices</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
              <div className="mb-2 text-2xl" aria-hidden>
                {f.icon}
              </div>
              <h3 className="font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">
          The optional AI assistant helps you write rules and understand conflicts — it never builds the timetable itself. Everything works without it.
        </p>
      </section>
    </div>
  );
}
