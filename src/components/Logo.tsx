/** Original logo: a wizard hat over a timetable grid, with a sparkle. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="8" y="28" width="48" height="30" rx="6" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3.5" />
      <path d="M8 38h48M24 28v30M40 28v30" stroke="var(--primary)" strokeWidth="2.5" opacity=".55" />
      <rect x="26" y="40" width="12" height="6" rx="1.5" fill="var(--ok)" />
      <path d="M18 29 L33 4 L46 29 Z" fill="var(--violet)" />
      <path d="M14 29 h36" stroke="var(--violet)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="33" cy="17" r="2.2" fill="#fff" opacity=".9" />
      <path d="M52 6l1.6 3.4L57 11l-3.4 1.6L52 16l-1.6-3.4L47 11l3.4-1.6z" fill="#f59e0b" />
    </svg>
  );
}
