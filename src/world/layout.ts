import type { RoomId } from "@/contracts";
import { ORIGIN_X, ORIGIN_Y, screenToTile, type Vec2 } from "./iso";
import type { BuildingId, BuildingPalette, BuildingSpec } from "./types";

/**
 * Buildings are authored by the screen slot their *center* should occupy, as an
 * offset in base pixels from the projection origin. `screenToTile` converts that
 * back into tile space, and the footprint is then shifted so the stored `tile`
 * is the north corner the renderer expects. Authoring by center keeps the campus
 * spacing predictable regardless of footprint size.
 */
function at(offsetX: number, offsetY: number, size: Vec2): Vec2 {
  const center = screenToTile(ORIGIN_X + offsetX, ORIGIN_Y + offsetY);
  return {
    x: round2(center.x - (size.x - 1) / 2),
    y: round2(center.y - (size.y - 1) / 2),
  };
}

const SIZE_2x2: Vec2 = { x: 2, y: 2 };
const SIZE_3x3: Vec2 = { x: 3, y: 3 };
const SIZE_3x2: Vec2 = { x: 3, y: 2 };
const SIZE_2x1: Vec2 = { x: 2, y: 1 };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const palettes = {
  tower: {
    top: "#66748f",
    left: "#333d50",
    right: "#465369",
    trim: "#c3cbff",
    accent: "#ffd98a",
    glow: "#8fa4ff",
  },
  library: {
    top: "#5e9b8d",
    left: "#294b47",
    right: "#3d6b63",
    trim: "#bff3e4",
    accent: "#ffe9a8",
    glow: "#7ff0d2",
  },
  workshop: {
    top: "#a77d58",
    left: "#4c3a2d",
    right: "#70543e",
    trim: "#ffd7a8",
    accent: "#9ad7ff",
    glow: "#ffb765",
  },
  beacon: {
    top: "#9a7caf",
    left: "#493b58",
    right: "#685477",
    trim: "#efd9ff",
    accent: "#7ef0ff",
    glow: "#d5a6ff",
  },
  forge: {
    top: "#aa624c",
    left: "#4b302a",
    right: "#704338",
    trim: "#ffc9a1",
    accent: "#ffe066",
    glow: "#ff8a4c",
  },
  observatory: {
    top: "#748da8",
    left: "#354252",
    right: "#4c6075",
    trim: "#d8ecff",
    accent: "#ffe9a8",
    glow: "#9fd0ff",
  },
  table: {
    top: "#8c7a65",
    left: "#443c34",
    right: "#605548",
    trim: "#e8d3ab",
    accent: "#ffffff",
    glow: "#ffe1a3",
  },
  ember: {
    top: "#c8875d",
    left: "#593a2b",
    right: "#80543c",
    trim: "#ffd9ae",
    accent: "#ffcf5c",
    glow: "#ffa45c",
  },
  forgeRoom: {
    top: "#ad625c",
    left: "#4d3031",
    right: "#704345",
    trim: "#ffc3bb",
    accent: "#ffdf7a",
    glow: "#ff7a6b",
  },
  harbor: {
    top: "#5a91aa",
    left: "#29434f",
    right: "#3c6070",
    trim: "#bfe9ff",
    accent: "#c8ffe6",
    glow: "#6fd2ff",
  },
  summit: {
    top: "#887dbb",
    left: "#403a55",
    right: "#5c5477",
    trim: "#ded4ff",
    accent: "#ffe9a8",
    glow: "#b3a2ff",
  },
} satisfies Record<string, BuildingPalette>;

export const ROOM_PALETTE_KEY: Record<RoomId, keyof typeof palettes> = {
  ember: "ember",
  forge: "forgeRoom",
  harbor: "harbor",
  summit: "summit",
};

/** Accent color per room, reused by the React panels so the UI matches the world. */
export const ROOM_COLOR: Record<RoomId, string> = {
  ember: palettes.ember.top,
  forge: palettes.forgeRoom.top,
  harbor: palettes.harbor.top,
  summit: palettes.summit.top,
};

export const WORLD_LAYOUT: BuildingSpec[] = [
  {
    id: "communication_beacon",
    kind: "beacon",
    label: "Communication Beacon",
    caption: "Human review + approvals",
    tile: at(0, -176, SIZE_2x2),
    size: SIZE_2x2,
    height: 46,
    palette: palettes.beacon,
    startsBuilt: true,
  },
  {
    id: "professor_tower",
    kind: "tower",
    label: "Professor Tower",
    caption: "Upload + teaching intent",
    tile: at(-204, -118, SIZE_3x3),
    size: SIZE_3x3,
    height: 50,
    palette: palettes.tower,
    startsBuilt: true,
  },
  {
    id: "memory_library",
    kind: "library",
    label: "Memory Library",
    caption: "Student history + mastery",
    tile: at(204, -118, SIZE_3x3),
    size: SIZE_3x3,
    height: 38,
    palette: palettes.library,
    startsBuilt: true,
  },
  {
    id: "agent_workshop",
    kind: "workshop",
    label: "Agent Workshop",
    caption: "Typed agent mesh",
    tile: at(0, -56, SIZE_3x3),
    size: SIZE_3x3,
    height: 36,
    palette: palettes.workshop,
    startsBuilt: true,
  },
  {
    id: "room_ember",
    kind: "room",
    label: "Ember",
    caption: "Temporary learning room",
    tile: at(-252, 62, SIZE_2x2),
    size: SIZE_2x2,
    height: 32,
    palette: palettes.ember,
    startsBuilt: false,
    roomId: "ember",
  },
  {
    id: "room_forge",
    kind: "room",
    label: "Forge",
    caption: "Temporary learning room",
    tile: at(-84, 62, SIZE_2x2),
    size: SIZE_2x2,
    height: 32,
    palette: palettes.forgeRoom,
    startsBuilt: false,
    roomId: "forge",
  },
  {
    id: "room_harbor",
    kind: "room",
    label: "Harbor",
    caption: "Temporary learning room",
    tile: at(84, 62, SIZE_2x2),
    size: SIZE_2x2,
    height: 32,
    palette: palettes.harbor,
    startsBuilt: false,
    roomId: "harbor",
  },
  {
    id: "room_summit",
    kind: "room",
    label: "Summit",
    caption: "Temporary learning room",
    tile: at(252, 62, SIZE_2x2),
    size: SIZE_2x2,
    height: 32,
    palette: palettes.summit,
    startsBuilt: false,
    roomId: "summit",
  },
  {
    id: "central_table",
    kind: "table",
    label: "Assignment Table",
    caption: "Concept extraction",
    tile: at(0, 6, SIZE_2x1),
    size: SIZE_2x1,
    height: 9,
    palette: palettes.table,
    startsBuilt: true,
  },
  {
    id: "assessment_forge",
    kind: "forge",
    label: "Assessment Forge",
    caption: "Grading + misconceptions",
    tile: at(-168, 160, SIZE_3x2),
    size: SIZE_3x2,
    height: 38,
    palette: palettes.forge,
    startsBuilt: true,
  },
  {
    id: "planning_observatory",
    kind: "observatory",
    label: "Planning Observatory",
    caption: "Tomorrow's lesson plan",
    tile: at(168, 160, SIZE_3x2),
    size: SIZE_3x2,
    height: 44,
    palette: palettes.observatory,
    startsBuilt: true,
  },
];

const layoutById = new Map<BuildingId, BuildingSpec>(
  WORLD_LAYOUT.map((spec) => [spec.id, spec]),
);

export function getBuilding(id: BuildingId): BuildingSpec {
  const spec = layoutById.get(id);
  if (!spec) throw new Error(`Unknown building: ${id}`);
  return spec;
}

export const ROOM_BUILDING: Record<RoomId, BuildingId> = {
  ember: "room_ember",
  forge: "room_forge",
  harbor: "room_harbor",
  summit: "room_summit",
};

export function roomBuildingId(roomId: RoomId): BuildingId {
  return ROOM_BUILDING[roomId];
}

/** Tile-space center of a building footprint. */
export function centerOf(spec: BuildingSpec): Vec2 {
  return {
    x: spec.tile.x + (spec.size.x - 1) / 2,
    y: spec.tile.y + (spec.size.y - 1) / 2,
  };
}

export function buildingCenter(id: BuildingId): Vec2 {
  return centerOf(getBuilding(id));
}

/**
 * A stable standing spot in front of a building, spread across `total` slots so
 * a cohort does not stack into one pixel.
 */
export function standingSpot(id: BuildingId, index: number, total: number): Vec2 {
  const spec = getBuilding(id);
  const center = centerOf(spec);
  const count = Math.max(1, total);
  // Wide rows keep large crowds (the whole class at the forge) on screen.
  const columns = Math.min(count > 6 ? 6 : 3, count);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const columnsInRow = Math.min(columns, count - row * columns);
  // Spreading along (+x, -y) moves along the screen horizontal, not into depth.
  const spread = (column - (columnsInRow - 1) / 2) * 0.62;
  const depth = row * 0.45;
  return {
    x: center.x + spec.size.x / 2 + 0.5 + depth + spread,
    y: center.y + spec.size.y / 2 + 0.5 + depth - spread,
  };
}

/** Ground plate bounds, derived from the authored layout with a margin. */
export function groundBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const spec of WORLD_LAYOUT) {
    minX = Math.min(minX, spec.tile.x);
    maxX = Math.max(maxX, spec.tile.x + spec.size.x);
    minY = Math.min(minY, spec.tile.y);
    maxY = Math.max(maxY, spec.tile.y + spec.size.y);
  }
  return {
    minX: Math.floor(minX) - 3,
    maxX: Math.ceil(maxX) + 3,
    minY: Math.floor(minY) - 3,
    maxY: Math.ceil(maxY) + 3,
  };
}
