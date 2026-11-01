"use client";

import { motion, useReducedMotion } from "framer-motion";

const COLORS = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#7B61FF", "#D55E00", "#00A3A3"];
const CODES = ["MAT", "ENG", "SCI", "SOC", "PHY", "TAM", "CHE", "CMP"];
const ROWS = 5;
const COLS = 6;

/** Decorative timetable grid that assembles itself (static when reduced motion is on). */
export function HeroGrid() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="grid gap-1.5 rounded-2xl border border-line bg-surface p-3 shadow-xl" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const c = (i * 7 + Math.floor(i / COLS) * 3) % COLORS.length;
          return (
            <motion.div
              key={i}
              className="flex h-10 items-center justify-center rounded-md text-[10px] font-bold text-white sm:h-12 sm:text-xs"
              style={{ background: COLORS[c] }}
              initial={reduce ? false : { opacity: 0, scale: 0.4, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.15 + ((i * 37) % (ROWS * COLS)) * 0.045, type: "spring", stiffness: 260, damping: 18 }}
            >
              {CODES[c]}
            </motion.div>
          );
        })}
      </div>
      <motion.div
        className="absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ok-soft px-4 py-1.5 text-sm font-bold text-ok shadow"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 1.7 }}
      >
        ✅ Clash-free!
      </motion.div>
    </div>
  );
}
