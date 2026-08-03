/**
 * 2:1 isometric projection.
 *
 * Tile space is continuous (floats allowed) so actors can walk between tiles.
 * Screen space is measured in base-canvas pixels; the canvas element is scaled
 * up by CSS with `image-rendering: pixelated`, which keeps the pixel look
 * without forcing an integer device scale.
 */

export const TILE_W = 40;
export const TILE_H = 20;

/** Base canvas resolution. Everything is drawn in these units. */
export const BASE_W = 680;
export const BASE_H = 470;

/**
 * Screen-space origin of tile (0,0) inside the base canvas. Chosen so the
 * tallest building (the beacon, highest on screen) clears the top edge and the
 * front row (forge / observatory) clears the bottom.
 */
export const ORIGIN_X = BASE_W / 2;
export const ORIGIN_Y = 250;

export type Vec2 = { x: number; y: number };

export type ScreenPoint = { sx: number; sy: number };

/** Tile coordinate (plus optional height in pixels) to base-canvas pixels. */
export function tileToScreen(x: number, y: number, z = 0): ScreenPoint {
  return {
    sx: ORIGIN_X + (x - y) * (TILE_W / 2),
    sy: ORIGIN_Y + (x + y) * (TILE_H / 2) - z,
  };
}

/**
 * Inverse projection, used to author the layout: buildings are positioned by
 * the screen slot they should occupy, then stored as tile coordinates so depth
 * sorting and actor pathing work in a single coordinate system.
 */
export function screenToTile(sx: number, sy: number): Vec2 {
  const dx = (sx - ORIGIN_X) / (TILE_W / 2);
  const dy = (sy - ORIGIN_Y) / (TILE_H / 2);
  return { x: (dx + dy) / 2, y: (dy - dx) / 2 };
}

/** Depth key. Larger draws later (in front). */
export function depthOf(x: number, y: number): number {
  return x + y;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Frame-rate independent approach: moves `current` a fraction of the way to
 * `target` such that the result only depends on elapsed time, not step count.
 */
export function approach(
  current: number,
  target: number,
  ratePerSecond: number,
  dtSeconds: number,
): number {
  const t = 1 - Math.exp(-ratePerSecond * dtSeconds);
  return current + (target - current) * t;
}

export function easeOutCubic(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
}
