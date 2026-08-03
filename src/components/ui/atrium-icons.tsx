import type { ReactNode } from "react";

type CanonicalAtriumIconName =
  | "activity"
  | "approve"
  | "assignment"
  | "classroom"
  | "close"
  | "connection"
  | "details"
  | "external"
  | "help"
  | "keyboard"
  | "labels"
  | "memory"
  | "more"
  | "reject"
  | "research"
  | "reset"
  | "sequence"
  | "skip"
  | "sources"
  | "speed"
  | "start"
  | "upload"
  | "view"
  | "warning";

export type AtriumIconName =
  | CanonicalAtriumIconName
  | "document"
  | "eye"
  | "fast-forward"
  | "graph"
  | "info"
  | "play"
  | "run"
  | "status";

export interface AtriumIconProps {
  name: AtriumIconName;
  size?: number;
  className?: string;
}

const ICON_ALIASES: Record<AtriumIconName, CanonicalAtriumIconName> = {
  activity: "activity",
  approve: "approve",
  assignment: "assignment",
  classroom: "classroom",
  close: "close",
  connection: "connection",
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
  memory: "memory",
  more: "more",
  play: "start",
  reject: "reject",
  research: "research",
  reset: "reset",
  run: "classroom",
  sequence: "sequence",
  skip: "skip",
  sources: "sources",
  speed: "speed",
  start: "start",
  status: "connection",
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
