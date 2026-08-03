import type {
  AgentEvent,
  AgentName,
  ConceptId,
  MisconceptionId,
  RoomId,
  SupportId,
} from "@/contracts";
import type { Vec2 } from "./iso";
import type { GraphNeighborhood, SharedBarrierGroup } from "@/server/adapters/types";
import type { PositionedGraphNode } from "./graph";

export const buildingIds = [
  "professor_tower",
  "memory_library",
  "agent_workshop",
  "communication_beacon",
  "room_ember",
  "room_forge",
  "room_harbor",
  "room_summit",
  "assessment_forge",
  "planning_observatory",
  "central_table",
] as const;

export type BuildingId = (typeof buildingIds)[number];

export type BuildingKind =
  | "tower"
  | "library"
  | "workshop"
  | "beacon"
  | "room"
  | "forge"
  | "observatory"
  | "table";

export type BuildingSpec = {
  id: BuildingId;
  kind: BuildingKind;
  label: string;
  /** Short caption shown under the label in the world legend. */
  caption: string;
  tile: Vec2;
  /** Footprint in tiles (width along x, depth along y). */
  size: Vec2;
  /** Full height in base pixels when `level` reaches 1. */
  height: number;
  palette: BuildingPalette;
  /** Rooms start unbuilt and rise as the run progresses. */
  startsBuilt: boolean;
  roomId?: RoomId;
};

export type BuildingPalette = {
  top: string;
  left: string;
  right: string;
  trim: string;
  accent: string;
  glow: string;
};

export type BuildingState = {
  id: BuildingId;
  /** 0 = empty plot, 1 = fully risen. */
  level: number;
  targetLevel: number;
  /** 0..1 ambient activity glow. */
  glow: number;
  targetGlow: number;
  /** Seconds remaining on a one-shot attention pulse. */
  pulse: number;
  /** Head-count badge (rooms only). Rendered as a small tally. */
  occupancy: number;
  previousOccupancy: number;
  /** Scroll icon above the roof once a variant exists. */
  hasScroll: boolean;
};

export type ActorMood = "neutral" | "focused" | "struggling" | "rising";

export type ActorKind = "student" | "professor" | "guide";

export type ActorState = {
  id: string;
  kind: ActorKind;
  name: string;
  avatarKey: string;
  pos: Vec2;
  path: Vec2[];
  speedTilesPerSecond: number;
  roomId?: RoomId;
  supports: SupportId[];
  /** 0..1 animation for support badges attaching. */
  badgeReveal: number;
  targetBadgeReveal: number;
  carrying: "none" | "scroll" | "work";
  mood: ActorMood;
  /** Per-actor animation phase so the crowd does not bob in lockstep. */
  phase: number;
  paletteIndex: number;
  walking: boolean;
};

export type FloatKind =
  | "concept"
  | "misconception"
  | "scroll"
  | "support"
  | "spark"
  | "plan";

export type FloatingIcon = {
  id: string;
  kind: FloatKind;
  label: string;
  /** Anchor in tile space. */
  anchor: Vec2;
  /** Screen-space offset applied after projection. */
  offset: Vec2;
  age: number;
  ttl: number;
  rise: number;
  color: string;
};

export type Particle = {
  pos: Vec2;
  target: Vec2;
  progress: number;
  speed: number;
  color: string;
  arc: number;
  seed: number;
};

export type WorldPhase =
  | "idle"
  | "uploaded"
  | "analyzing"
  | "grouping"
  | "variants_ready"
  | "submissions"
  | "assessment"
  | "evolution"
  | "planned";

export type WorldStudentSnapshot = {
  student_id: string;
  display_name: string;
  room_id?: RoomId;
  supports: SupportId[];
  misconceptions: MisconceptionId[];
};

export type GraphOverlay = {
  visible: boolean;
  nodes: PositionedGraphNode[];
  edges: GraphNeighborhood["edges"];
  sharedBarriers: SharedBarrierGroup[];
  cypher: string;
};

export type WorldState = {
  runId: string | null;
  phase: WorldPhase;
  elapsed: number;
  buildings: Record<BuildingId, BuildingState>;
  actors: ActorState[];
  floats: FloatingIcon[];
  particles: Particle[];
  /** Concepts surfaced by `assignment.concepts.extracted`. */
  concepts: ConceptId[];
  /** Misconceptions surfaced by `assessment.completed`. */
  misconceptions: MisconceptionId[];
  /** Tomorrow overlay opacity, 0..1. */
  tomorrowOverlay: number;
  targetTomorrowOverlay: number;
  /** Beacon review banner, driven by `approval.requested`. */
  reviewOpen: boolean;
  /** Most recent agent to act, used for the workshop marquee. */
  activeAgent: AgentName | null;
  /** Ordered list of processed event types, for text rendering and tests. */
  processed: string[];
  seed: number;
  /** FalkorDB constellation floating above the Memory Library. */
  graph?: GraphOverlay;
};

export type WorldSelection =
  | { kind: "none" }
  | { kind: "building"; id: BuildingId }
  | { kind: "room"; roomId: RoomId }
  | { kind: "student"; studentId: string }
  | { kind: "graph"; nodeId: string };

export type WorldEventSink = (event: AgentEvent) => void;
