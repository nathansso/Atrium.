import { BASE_H, BASE_W, clamp, easeOutCubic, tileToScreen, type ScreenPoint } from "./iso";
import { WORLD_LAYOUT, centerOf } from "./layout";
import type { BuildingSpec, WorldSelection, WorldState } from "./types";

function pointInPolygon(sx: number, sy: number, points: ScreenPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    const intersects =
      a.sy > sy !== b.sy > sy &&
      sx < ((b.sx - a.sx) * (sy - a.sy)) / (b.sy - a.sy) + a.sx;
    if (intersects) inside = !inside;
  }
  return inside;
}

function buildingPolygons(spec: BuildingSpec, level: number): ScreenPoint[][] {
  const { x, y } = spec.tile;
  const w = spec.size.x;
  const d = spec.size.y;
  const height = spec.height * easeOutCubic(clamp(level, 0, 1));

  const north = tileToScreen(x, y, height);
  const east = tileToScreen(x + w, y, height);
  const south = tileToScreen(x + w, y + d, height);
  const west = tileToScreen(x, y + d, height);

  const roof = [north, east, south, west];
  const left = [
    west,
    south,
    { sx: south.sx, sy: south.sy + height },
    { sx: west.sx, sy: west.sy + height },
  ];
  const right = [
    south,
    east,
    { sx: east.sx, sy: east.sy + height },
    { sx: south.sx, sy: south.sy + height },
  ];
  // Always include the ground plot so unbuilt room plots stay clickable.
  const plot = [
    tileToScreen(x, y),
    tileToScreen(x + w, y),
    tileToScreen(x + w, y + d),
    tileToScreen(x, y + d),
  ];
  return [roof, left, right, plot];
}

/**
 * Resolve a base-canvas pixel to a world selection. Actors win over buildings
 * because they are smaller and drawn in front; among equals, the nearest to the
 * camera (largest depth) wins.
 */
export function hitTest(state: WorldState, sx: number, sy: number): WorldSelection {
  if (sx < 0 || sy < 0 || sx > BASE_W || sy > BASE_H) return { kind: "none" };

  let bestActor: { depth: number; studentId: string } | null = null;
  for (const actor of state.actors) {
    if (actor.kind !== "student") continue;
    const point = tileToScreen(actor.pos.x, actor.pos.y);
    const withinX = sx >= point.sx - 7 && sx <= point.sx + 9;
    const withinY = sy >= point.sy - 21 && sy <= point.sy + 3;
    if (!withinX || !withinY) continue;
    const depth = actor.pos.x + actor.pos.y;
    if (!bestActor || depth > bestActor.depth) {
      bestActor = { depth, studentId: actor.id };
    }
  }
  if (bestActor) return { kind: "student", studentId: bestActor.studentId };

  let bestBuilding: { depth: number; spec: BuildingSpec } | null = null;
  for (const spec of WORLD_LAYOUT) {
    const level = state.buildings[spec.id].level;
    const polygons = buildingPolygons(spec, level);
    if (!polygons.some((polygon) => pointInPolygon(sx, sy, polygon))) continue;
    const center = centerOf(spec);
    const depth = center.x + center.y;
    if (!bestBuilding || depth > bestBuilding.depth) {
      bestBuilding = { depth, spec };
    }
  }
  if (bestBuilding) {
    const spec = bestBuilding.spec;
    return spec.roomId
      ? { kind: "room", roomId: spec.roomId }
      : { kind: "building", id: spec.id };
  }

  return { kind: "none" };
}

/** Convert a pointer event on the scaled canvas element into base-canvas pixels. */
export function toBaseCanvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): ScreenPoint {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width === 0 ? 1 : BASE_W / rect.width;
  const scaleY = rect.height === 0 ? 1 : BASE_H / rect.height;
  return {
    sx: (clientX - rect.left) * scaleX,
    sy: (clientY - rect.top) * scaleY,
  };
}
