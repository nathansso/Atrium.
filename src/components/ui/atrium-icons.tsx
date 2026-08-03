import type { ReactNode } from "react";

type CanonicalAtriumIconName =
  | "activity"
  | "approve"
  | "ask"
  | "assignment"
  | "classroom"
  | "close"
  | "connection"
  | "course"
  | "details"
  | "external"
  | "help"
  | "keyboard"
  | "labels"
  | "lesson"
  | "mastered"
  | "memory"
  | "more"
  | "notes"
  | "reject"
  | "research"
  | "reset"
  | "saved"
  | "schedule"
  | "score"
  | "search"
  | "sequence"
  | "skip"
  | "sources"
  | "speed"
  | "start"
  | "streak"
  | "timer"
  | "upload"
  | "view"
  | "warning";

export type AtriumIconName =
  | CanonicalAtriumIconName
  | "bookmark"
  | "calendar"
  | "chart"
  | "clock"
  | "document"
  | "eye"
  | "fast-forward"
  | "graph"
  | "info"
  | "library"
  | "play"
  | "question"
  | "run"
  | "star"
  | "status";

export interface AtriumIconProps {
  name: AtriumIconName;
  size?: number;
  className?: string;
}

const ICON_ALIASES: Record<AtriumIconName, CanonicalAtriumIconName> = {
  activity: "activity",
  approve: "approve",
  ask: "ask",
  assignment: "assignment",
  bookmark: "saved",
  calendar: "schedule",
  chart: "score",
  classroom: "classroom",
  clock: "timer",
  close: "close",
  connection: "connection",
  course: "course",
  details: "details",
  document: "assignment",
  eye: "view",
  external: "external",
  "fast-forward": "skip",
  graph: "memory",
  help: "help",
  info: "details",
  keyboard: "keyboard",
  labels: "labels",
  lesson: "lesson",
  library: "course",
  mastered: "mastered",
  memory: "memory",
  more: "more",
  notes: "notes",
  play: "start",
  question: "ask",
  reject: "reject",
  research: "research",
  reset: "reset",
  run: "classroom",
  saved: "saved",
  schedule: "schedule",
  score: "score",
  search: "search",
  sequence: "sequence",
  skip: "skip",
  sources: "sources",
  speed: "speed",
  star: "streak",
  start: "start",
  status: "connection",
  streak: "streak",
  timer: "timer",
  upload: "upload",
  view: "view",
  warning: "warning",
};

const ICONS: Record<CanonicalAtriumIconName, ReactNode> = {
  details: (
    <>
      <path d="M6 4H26V28H6Z" />
      <path d="M14 8H18V12H14ZM14 14H18V24H14Z" fill="currentColor" stroke="none" />
    </>
  ),
  activity: <path d="M4 18H10L14 8L18 24L22 14H28" />,
  assignment: (
    <>
      <path d="M6 4H20L26 10V28H6Z" />
      <path d="M20 4V10H26M10 16H22M10 20H22M10 24H18" />
    </>
  ),
  upload: (
    <>
      <path d="M16 4V20M10 10L16 4L22 10" />
      <path d="M6 18V28H26V18" />
    </>
  ),
  start: <path d="M10 6V26L26 16Z" fill="currentColor" stroke="none" />,
  classroom: (
    <>
      <path d="M4 4H28V22H4ZM8 18L12 14L16 16L22 10L26 12" />
      <path d="M14 22V26H8V28H24V26H18V22" />
    </>
  ),
  speed: (
    <>
      <path d="M4 24V18L6 12L10 8L16 6L22 8L26 12L28 18V24" />
      <path d="M16 20L24 12" />
      <path d="M14 18H18V22H14Z" fill="currentColor" stroke="none" />
    </>
  ),
  view: (
    <>
      <path d="M4 16L10 10H22L28 16L22 22H10Z" />
      <path d="M14 14H18V18H14Z" fill="currentColor" stroke="none" />
    </>
  ),
  memory: (
    <>
      <path d="M8 8L16 16L24 8M16 16L24 24" />
      <path d="M4 4H12V12H4ZM12 12H20V20H12ZM20 4H28V12H20ZM20 20H28V28H20Z" />
    </>
  ),
  labels: (
    <>
      <path d="M4 6H18L28 16L18 26H4Z" />
      <path d="M8 14H12V18H8Z" fill="currentColor" stroke="none" />
    </>
  ),
  skip: (
    <>
      <path d="M4 6V26L14 16ZM14 6V26L24 16Z" fill="currentColor" stroke="none" />
      <path d="M26 6H28V26H26Z" fill="currentColor" stroke="none" />
    </>
  ),
  reset: (
    <>
      <path d="M10 6L4 12L10 18M4 12H20L26 18V22L22 26H10L6 22" />
      <path d="M20 8H24V12H20Z" fill="currentColor" stroke="none" />
    </>
  ),
  help: (
    <>
      <path d="M6 4H26V28H6Z" />
      <path d="M12 10L14 8H20L22 10V14L18 18H14V14H18V12H14V14H10V12Z" fill="currentColor" stroke="none" />
      <path d="M14 22H18V26H14Z" fill="currentColor" stroke="none" />
    </>
  ),
  keyboard: (
    <>
      <path d="M4 6H28V26H4Z" />
      <path d="M8 10H12V14H8ZM14 10H18V14H14ZM20 10H24V14H20ZM8 16H12V20H8ZM14 16H24V20H14Z" />
    </>
  ),
  connection: (
    <>
      <path d="M14 22H18V26H14Z" fill="currentColor" stroke="none" />
      <path d="M12 20L8 16V12L12 8M20 20L24 16V12L20 8M8 24L4 20V8L8 4M24 24L28 20V8L24 4" />
    </>
  ),
  more: <path d="M4 14H8V18H4ZM14 14H18V18H14ZM24 14H28V18H24Z" fill="currentColor" stroke="none" />,
  close: <path d="M6 6L26 26M26 6L6 26" />,
  research: (
    <>
      <path d="M4 4H18V18H4ZM18 18L28 28" />
      <path d="M8 8H14M8 12H14" />
    </>
  ),
  sources: (
    <>
      <path d="M4 8H20V26H4ZM8 4H24V22M12 8V4H28V18" />
      <path d="M8 14H16M8 18H16" />
    </>
  ),
  sequence: (
    <>
      <path d="M4 4H12V12H4ZM20 20H28V28H20Z" />
      <path d="M12 8H22V16H26M22 12L26 16L22 20" />
    </>
  ),
  approve: (
    <>
      <path d="M4 4H28V28H4Z" />
      <path d="M9 16L14 21L24 10" />
    </>
  ),
  reject: (
    <>
      <path d="M4 4H28V28H4Z" />
      <path d="M10 10L22 22M22 10L10 22" />
    </>
  ),
  external: (
    <>
      <path d="M14 6H6V26H26V18M18 6H26V14M26 6L14 18" />
    </>
  ),
  warning: (
    <>
      <path d="M16 4L29 28H3Z" />
      <path d="M14 11H18V19H14Z" fill="currentColor" stroke="none" />
      <path d="M14 22H18V26H14Z" fill="currentColor" stroke="none" />
    </>
  ),

  // Learning-domain glyphs. Drawn as filled 2x2 px units on the same 32x32 grid,
  // so corners step rather than curve and every edge lands on a whole pixel.
  // Open book: the unit a learner actually sits down to.
  lesson: <path d="M4 4H28V6H4ZM2 6H4V24H2ZM14 6H18V26H14ZM28 6H30V24H28ZM6 10H12V12H6ZM20 10H26V12H20ZM6 16H12V18H6ZM20 16H26V18H20ZM4 24H14V26H4ZM18 24H28V26H18Z" fill="currentColor" stroke="none" />,
  // Four modules: a sequence of lessons.
  course: <path d="M4 2H12V4H4ZM20 2H28V4H20ZM2 4H4V12H2ZM12 4H14V12H12ZM18 4H20V12H18ZM28 4H30V12H28ZM4 12H12V14H4ZM20 12H28V14H20ZM4 18H12V20H4ZM20 18H28V20H20ZM2 20H4V28H2ZM12 20H14V28H12ZM18 20H20V28H18ZM28 20H30V28H28ZM4 28H12V30H4ZM20 28H28V30H20Z" fill="currentColor" stroke="none" />,
  // Written notes kept against a lesson.
  notes: <path d="M8 2H24V4H8ZM6 4H8V26H6ZM24 4H26V26H24ZM10 6H22V8H10ZM10 12H22V14H10ZM10 18H22V20H10ZM10 22H18V24H10ZM8 26H24V28H8Z" fill="currentColor" stroke="none" />,
  // Dated work: what is booked, and when.
  schedule: <path d="M8 2H10V8H8ZM22 2H24V8H22ZM4 6H8V8H4ZM10 6H22V8H10ZM24 6H28V8H24ZM2 8H4V26H2ZM28 8H30V26H28ZM4 12H28V14H4ZM8 16H12V20H8ZM14 16H18V20H14ZM20 16H24V20H20ZM4 26H28V28H4Z" fill="currentColor" stroke="none" />,
  // Marked results, one bar per attempt.
  score: <path d="M22 4H26V6H22ZM20 6H22V28H20ZM26 6H28V28H26ZM14 12H18V14H14ZM12 14H14V28H12ZM18 14H20V28H18ZM6 18H10V20H6ZM4 20H6V28H4ZM10 20H12V28H10ZM2 26H4V28H2ZM6 26H10V28H6ZM14 26H18V28H14ZM22 26H26V28H22ZM28 26H30V28H28Z" fill="currentColor" stroke="none" />,
  // Skill cleared: a check inside the ring.
  mastered: <path d="M10 2H22V4H10ZM8 4H10V6H8ZM22 4H24V6H22ZM6 6H8V8H6ZM24 6H26V8H24ZM4 8H6V10H4ZM26 8H28V10H26ZM2 10H4V22H2ZM28 10H30V22H28ZM22 12H24V14H22ZM20 14H22V16H20ZM10 16H12V18H10ZM18 16H20V18H18ZM12 18H14V20H12ZM16 18H18V20H16ZM14 20H16V22H14ZM4 22H6V24H4ZM26 22H28V24H26ZM6 24H8V26H6ZM24 24H26V26H24ZM8 26H10V28H8ZM22 26H24V28H22ZM10 28H22V30H10Z" fill="currentColor" stroke="none" />,
  // Time left in a lesson or an open window.
  timer: <path d="M10 2H22V4H10ZM8 4H10V6H8ZM22 4H24V6H22ZM6 6H8V8H6ZM24 6H26V8H24ZM4 8H6V10H4ZM14 8H16V18H14ZM26 8H28V10H26ZM2 10H4V22H2ZM28 10H30V22H28ZM16 16H22V18H16ZM4 22H6V24H4ZM26 22H28V24H26ZM6 24H8V26H6ZM24 24H26V26H24ZM8 26H10V28H8ZM22 26H24V28H22ZM10 28H22V30H10Z" fill="currentColor" stroke="none" />,
  // Consecutive days of practice.
  streak: <path d="M14 4H18V24H14ZM12 10H14V24H12ZM18 10H20V24H18ZM2 12H12V14H2ZM20 12H30V14H20ZM6 14H12V16H6ZM20 14H26V16H20ZM8 16H12V18H8ZM20 16H24V18H20ZM10 18H12V26H10ZM20 18H22V26H20ZM8 22H10V28H8ZM22 22H24V28H22Z" fill="currentColor" stroke="none" />,
  // Find a lesson, a student or a source.
  search: <path d="M12 2H16V4H12ZM8 4H12V6H8ZM16 4H20V6H16ZM6 6H8V8H6ZM20 6H22V8H20ZM4 8H6V12H4ZM22 8H24V12H22ZM2 12H4V16H2ZM24 12H26V16H24ZM4 16H6V20H4ZM22 16H24V20H22ZM6 20H8V22H6ZM20 20H22V22H20ZM8 22H12V24H8ZM16 22H20V24H16ZM22 22H26V24H22ZM12 24H16V26H12ZM24 24H28V26H24ZM26 26H30V28H26ZM28 28H30V30H28Z" fill="currentColor" stroke="none" />,
  // A question raised for a human to answer.
  ask: <path d="M4 4H28V6H4ZM2 6H4V22H2ZM28 6H30V22H28ZM8 12H12V16H8ZM14 12H18V16H14ZM20 12H24V16H20ZM4 22H28V24H4ZM8 24H26V26H8ZM6 26H10V28H6ZM6 28H8V30H6Z" fill="currentColor" stroke="none" />,
  // Kept for later.
  saved: <path d="M6 2H26V4H6ZM4 4H6V30H4ZM26 4H28V30H26ZM14 20H18V22H14ZM12 22H14V24H12ZM18 22H20V24H18ZM10 24H12V26H10ZM20 24H22V26H20ZM8 26H10V28H8ZM22 26H24V28H22ZM6 28H8V30H6ZM24 28H26V30H24Z" fill="currentColor" stroke="none" />,
};

export function AtriumIcon({ name, size = 24, className }: AtriumIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="crispEdges"
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeWidth="2"
      viewBox="0 0 32 32"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {ICONS[ICON_ALIASES[name]]}
    </svg>
  );
}
