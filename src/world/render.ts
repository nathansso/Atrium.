import {
  BASE_H,
  BASE_W,
  TILE_H,
  TILE_W,
  clamp,
  easeOutCubic,
  tileToScreen,
  type ScreenPoint,
} from "./iso";
import { WORLD_LAYOUT, centerOf, getBuilding, groundBounds } from "./layout";
import type {
  ActorState,
  BuildingId,
  BuildingSpec,
  BuildingState,
  FloatingIcon,
  GraphOverlay,
  Particle,
  WorldState,
} from "./types";
import type { PositionedGraphNode } from "./graph";

const CONVEYORS: Array<[BuildingId, BuildingId]> = [
  ["professor_tower", "central_table"],
  ["central_table", "agent_workshop"],
  ["memory_library", "agent_workshop"],
  ["agent_workshop", "communication_beacon"],
  ["agent_workshop", "room_ember"],
  ["agent_workshop", "room_forge"],
  ["agent_workshop", "room_harbor"],
  ["agent_workshop", "room_summit"],
  ["room_ember", "assessment_forge"],
  ["room_forge", "assessment_forge"],
  ["room_harbor", "assessment_forge"],
  ["room_summit", "assessment_forge"],
  ["assessment_forge", "planning_observatory"],
];

const ACTOR_PALETTE: Array<{ skin: string; shirt: string; shirtDark: string; hair: string }> = [
  { skin: "#f0c49a", shirt: "#ff8f6b", shirtDark: "#b85440", hair: "#3a2418" },
  { skin: "#c98d63", shirt: "#7fd4ff", shirtDark: "#3f87ad", hair: "#241a12" },
  { skin: "#8a5a3b", shirt: "#a6ff8f", shirtDark: "#4f9c45", hair: "#141014" },
  { skin: "#f7d9b8", shirt: "#d3a6ff", shirtDark: "#7b52ad", hair: "#8a5a2b" },
  { skin: "#e0a97e", shirt: "#ffd45c", shirtDark: "#b08924", hair: "#4a2c16" },
  { skin: "#6d4326", shirt: "#ff9ede", shirtDark: "#ad5b8c", hair: "#100c10" },
];

type Cmd = { depth: number; draw: () => void };

export type RenderOptions = {
  /** Currently highlighted building id, if any. */
  hoverId?: string | null;
  selectedId?: string | null;
  selectedGraphNodeId?: string | null;
};

function px(value: number): number {
  return Math.round(value);
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  state: WorldState,
  options: RenderOptions = {},
): void {
  ctx.imageSmoothingEnabled = false;
  drawSky(ctx, state);
  drawGround(ctx, state);
  drawConveyors(ctx, state);

  const commands: Cmd[] = [];

  for (const spec of WORLD_LAYOUT) {
    const building = state.buildings[spec.id];
    const center = centerOf(spec);
    const highlighted =
      options.hoverId === spec.id || options.selectedId === spec.id;
    commands.push({
      depth: center.x + center.y,
      draw: () => drawBuilding(ctx, spec, building, state, highlighted),
    });
  }

  for (const actor of state.actors) {
    commands.push({
      depth: actor.pos.x + actor.pos.y + 0.4,
      draw: () => drawActor(ctx, actor, state),
    });
  }

  commands.sort((a, b) => a.depth - b.depth);
  for (const command of commands) command.draw();

  if (state.graph?.visible) {
    drawGraphOverlay(ctx, state.graph, state, options.selectedGraphNodeId);
  }

  for (const particle of state.particles) drawParticle(ctx, particle);
  for (const icon of state.floats) drawFloatingIcon(ctx, icon);

  if (state.tomorrowOverlay > 0.01) drawTomorrowOverlay(ctx, state);
  drawVignette(ctx);
}

function drawSky(ctx: CanvasRenderingContext2D, state: WorldState): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, BASE_H);
  const dusk = clamp(state.tomorrowOverlay, 0, 1);
  gradient.addColorStop(0, mix("#141a33", "#241a3d", dusk));
  gradient.addColorStop(0.55, mix("#1d2547", "#2f2350", dusk));
  gradient.addColorStop(1, mix("#101529", "#1a1330", dusk));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  // Static starfield, seeded by position so it never flickers between frames.
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 60; i += 1) {
    const x = (i * 97) % BASE_W;
    const y = (i * 53) % 150;
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(state.elapsed * 0.6 + i));
    ctx.globalAlpha = 0.18 + twinkle * 0.25;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawGround(ctx: CanvasRenderingContext2D, state: WorldState): void {
  const bounds = groundBounds();
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      const point = tileToScreen(x, y);
      if (
        point.sx < -TILE_W ||
        point.sx > BASE_W + TILE_W ||
        point.sy < -TILE_H ||
        point.sy > BASE_H + TILE_H * 3
      ) {
        continue;
      }
      const base = "#252f39";
      const dusk = clamp(state.tomorrowOverlay, 0, 1) * 0.5;
      fillTile(ctx, point, mix(base, "#3b2f5e", dusk));
      ctx.strokeStyle = "rgba(77,208,225,0.08)";
      ctx.beginPath();
      ctx.moveTo(px(point.sx - TILE_W / 4), px(point.sy));
      ctx.lineTo(px(point.sx), px(point.sy + TILE_H / 4));
      ctx.stroke();
    }
  }
}

function drawConveyors(ctx: CanvasRenderingContext2D, state: WorldState): void {
  for (const [fromId, toId] of CONVEYORS) {
    const fromCenter = centerOf(WORLD_LAYOUT.find((item) => item.id === fromId)!);
    const toCenter = centerOf(WORLD_LAYOUT.find((item) => item.id === toId)!);
    const from = tileToScreen(fromCenter.x, fromCenter.y);
    const to = tileToScreen(toCenter.x, toCenter.y);
    const active = Math.max(state.buildings[fromId].glow, state.buildings[toId].glow);
    ctx.strokeStyle = withAlpha(active > 0.08 ? "#4dd0e1" : "#526170", 0.28 + active * 0.62);
    ctx.lineWidth = active > 0.08 ? 2 : 1;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = active > 0.08 ? -state.elapsed * 18 : 0;
    ctx.beginPath();
    ctx.moveTo(px(from.sx), px(from.sy));
    ctx.lineTo(px(to.sx), px(to.sy));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function fillTile(ctx: CanvasRenderingContext2D, point: ScreenPoint, color: string): void {
  const { sx, sy } = point;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(px(sx), px(sy - TILE_H / 2));
  ctx.lineTo(px(sx + TILE_W / 2), px(sy));
  ctx.lineTo(px(sx), px(sy + TILE_H / 2));
  ctx.lineTo(px(sx - TILE_W / 2), px(sy));
  ctx.closePath();
  ctx.fill();
}

function polygon(ctx: CanvasRenderingContext2D, points: ScreenPoint[], color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(px(points[0].sx), px(points[0].sy));
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(px(points[i].sx), px(points[i].sy));
  }
  ctx.closePath();
  ctx.fill();
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  spec: BuildingSpec,
  building: BuildingState,
  state: WorldState,
  highlighted: boolean,
): void {
  const { x, y } = spec.tile;
  const w = spec.size.x;
  const d = spec.size.y;
  const level = clamp(building.level, 0, 1);
  const height = spec.height * easeOutCubic(level);

  // Plot outline, always visible so unbuilt rooms read as reserved ground.
  const plot = [
    tileToScreen(x, y),
    tileToScreen(x + w, y),
    tileToScreen(x + w, y + d),
    tileToScreen(x, y + d),
  ];
  polygon(ctx, plot, level < 0.98 ? "#1b2440" : "#161d33");
  strokePolygon(ctx, plot, level < 0.98 ? withAlpha(spec.palette.glow, 0.55) : "rgba(0,0,0,0.35)");

  if (level < 0.02) {
    drawFoundationMarkers(ctx, spec, state);
    return;
  }

  const north = tileToScreen(x, y, height);
  const east = tileToScreen(x + w, y, height);
  const south = tileToScreen(x + w, y + d, height);
  const west = tileToScreen(x, y + d, height);

  const glow = clamp(building.glow, 0, 1);
  const pulseAmount =
    building.pulse > 0 ? 0.5 + 0.5 * Math.sin(state.elapsed * 9) : 0;
  const lift = glow * 0.18 + pulseAmount * 0.22 + (highlighted ? 0.25 : 0);

  // Left face (facing screen-left), then right face, then roof.
  polygon(
    ctx,
    [west, south, { sx: south.sx, sy: south.sy + height }, { sx: west.sx, sy: west.sy + height }],
    lighten(spec.palette.left, lift * 0.6),
  );
  polygon(
    ctx,
    [south, east, { sx: east.sx, sy: east.sy + height }, { sx: south.sx, sy: south.sy + height }],
    lighten(spec.palette.right, lift * 0.6),
  );
  polygon(ctx, [north, east, south, west], lighten(spec.palette.top, lift));

  strokePolygon(ctx, [north, east, south, west], withAlpha(spec.palette.trim, 0.5));
  strokePolygon(ctx, [west, south, { sx: south.sx, sy: south.sy + height }, { sx: west.sx, sy: west.sy + height }], withAlpha(spec.palette.trim, 0.45));
  strokePolygon(ctx, [south, east, { sx: east.sx, sy: east.sy + height }, { sx: south.sx, sy: south.sy + height }], withAlpha(spec.palette.trim, 0.45));

  drawFaceDetail(ctx, spec, building, state, height, { north, east, south, west });
  drawRoofDetail(ctx, spec, building, state, height, { north, east, south, west });

  if (glow > 0.05 || pulseAmount > 0) {
    drawGlowHalo(ctx, spec, height, glow + pulseAmount * 0.4);
  }

  if (highlighted) {
    strokePolygon(ctx, [north, east, south, west], "#ffffff");
  }
}

type Corners = {
  north: ScreenPoint;
  east: ScreenPoint;
  south: ScreenPoint;
  west: ScreenPoint;
};

function strokePolygon(
  ctx: CanvasRenderingContext2D,
  points: ScreenPoint[],
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px(points[0].sx) + 0.5, px(points[0].sy) + 0.5);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(px(points[i].sx) + 0.5, px(points[i].sy) + 0.5);
  }
  ctx.closePath();
  ctx.stroke();
}

/** Instrument ticks and banners on the two visible vertical faces. */
function drawFaceDetail(
  ctx: CanvasRenderingContext2D,
  spec: BuildingSpec,
  building: BuildingState,
  state: WorldState,
  height: number,
  corners: Corners,
): void {
  if (height < 10) return;
  const lit = clamp(building.glow, 0, 1);
  const rows = Math.max(1, Math.floor((height - 6) / 12));
  const columns = Math.max(2, spec.size.x + 1);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const flicker =
        0.35 + 0.65 * Math.abs(Math.sin(state.elapsed * 1.4 + row * 2.1 + column));
      const alpha = 0.22 + lit * 0.62 * flicker;
      ctx.fillStyle = withAlpha(spec.palette.accent, alpha);

      const t = (column + 0.5) / columns;
      const yOffset = height - 8 - row * 12;

      const leftX = corners.west.sx + (corners.south.sx - corners.west.sx) * t;
      const leftY = corners.west.sy + (corners.south.sy - corners.west.sy) * t;
      ctx.fillRect(px(leftX - 2), px(leftY + yOffset), 5, 1);

      const rightX = corners.south.sx + (corners.east.sx - corners.south.sx) * t;
      const rightY = corners.south.sy + (corners.east.sy - corners.south.sy) * t;
      ctx.fillRect(px(rightX - 2), px(rightY + yOffset), 5, 1);
    }
  }

  // Base plinth: a darker band along both visible faces grounds the massing.
  ctx.fillStyle = withAlpha("#000000", 0.28);
  ctx.beginPath();
  ctx.moveTo(px(corners.west.sx), px(corners.west.sy + height - 3));
  ctx.lineTo(px(corners.south.sx), px(corners.south.sy + height - 3));
  ctx.lineTo(px(corners.east.sx), px(corners.east.sy + height - 3));
  ctx.lineTo(px(corners.east.sx), px(corners.east.sy + height));
  ctx.lineTo(px(corners.south.sx), px(corners.south.sy + height));
  ctx.lineTo(px(corners.west.sx), px(corners.west.sy + height));
  ctx.closePath();
  ctx.fill();

  if (spec.kind === "room") {
    // Room banner in the room's own color, hung on the front corner.
    const bannerX = corners.south.sx;
    const bannerY = corners.south.sy + 6;
    ctx.fillStyle = spec.palette.top;
    ctx.fillRect(px(bannerX - 3), px(bannerY), 6, 12);
    ctx.fillStyle = withAlpha("#000000", 0.35);
    ctx.fillRect(px(bannerX - 3), px(bannerY + 12), 6, 2);
  }
}

function drawRoofDetail(
  ctx: CanvasRenderingContext2D,
  spec: BuildingSpec,
  building: BuildingState,
  state: WorldState,
  height: number,
  corners: Corners,
): void {
  const cx = (corners.north.sx + corners.south.sx) / 2;
  const cy = (corners.north.sy + corners.south.sy) / 2;
  const glow = clamp(building.glow, 0, 1);

  switch (spec.kind) {
    case "beacon": {
      ctx.fillStyle = spec.palette.trim;
      ctx.fillRect(px(cx - 1), px(cy - 20), 2, 20);
      const ring = 4 + ((state.elapsed * 18) % 22);
      ctx.strokeStyle = withAlpha(spec.palette.glow, clamp(1 - ring / 26, 0, 1) * 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px(cx), px(cy - 20), ring, ring / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = spec.palette.accent;
      ctx.fillRect(px(cx - 2), px(cy - 24), 4, 4);
      break;
    }
    case "tower": {
      ctx.fillStyle = spec.palette.trim;
      ctx.fillRect(px(cx - 6), px(cy - 12), 12, 12);
      ctx.fillStyle = spec.palette.left;
      ctx.fillRect(px(cx - 4), px(cy - 10), 8, 8);
      ctx.fillStyle = spec.palette.accent;
      ctx.fillRect(px(cx - 1), px(cy - 8), 2, 4);
      ctx.fillRect(px(cx - 1), px(cy - 6), 4, 2);
      break;
    }
    case "library": {
      ctx.fillStyle = spec.palette.trim;
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(px(cx - 10 + i * 8), px(cy - 8), 5, 8);
      }
      ctx.fillStyle = withAlpha(spec.palette.glow, 0.4 + glow * 0.6);
      ctx.fillRect(px(cx - 12), px(cy - 10), 24, 2);
      break;
    }
    case "workshop": {
      const spin = state.elapsed * 2.4;
      ctx.strokeStyle = withAlpha(spec.palette.accent, 0.5 + glow * 0.5);
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i += 1) {
        const angle = spin + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(px(cx), px(cy - 8));
        ctx.lineTo(px(cx + Math.cos(angle) * 10), px(cy - 8 + Math.sin(angle) * 5));
        ctx.stroke();
      }
      ctx.fillStyle = spec.palette.accent;
      ctx.fillRect(px(cx - 2), px(cy - 10), 4, 4);
      break;
    }
    case "forge": {
      ctx.fillStyle = spec.palette.left;
      ctx.fillRect(px(cx + 6), px(cy - 14), 6, 14);
      const smoke = (state.elapsed * 12) % 26;
      ctx.fillStyle = withAlpha(spec.palette.glow, clamp(1 - smoke / 26, 0, 1) * 0.8);
      ctx.fillRect(px(cx + 7), px(cy - 16 - smoke), 4, 4);
      ctx.fillStyle = withAlpha(spec.palette.accent, 0.5 + glow * 0.5);
      ctx.fillRect(px(cx - 10), px(cy - 6), 14, 5);
      break;
    }
    case "observatory": {
      ctx.fillStyle = spec.palette.trim;
      ctx.beginPath();
      ctx.ellipse(px(cx), px(cy - 4), 12, 8, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = spec.palette.left;
      ctx.fillRect(px(cx + 2), px(cy - 18), 10, 3);
      ctx.fillStyle = withAlpha(spec.palette.glow, 0.5 + glow * 0.5);
      ctx.fillRect(px(cx - 3), px(cy - 12), 3, 3);
      break;
    }
    case "room": {
      ctx.fillStyle = spec.palette.trim;
      ctx.fillRect(px(cx - 8), px(cy - 6), 16, 3);
      if (building.hasScroll) {
        ctx.fillStyle = "#f4e3b8";
        ctx.fillRect(px(cx - 4), px(cy - 16), 8, 9);
        ctx.fillStyle = "#8a6a3a";
        ctx.fillRect(px(cx - 4), px(cy - 16), 8, 1);
        ctx.fillRect(px(cx - 4), px(cy - 8), 8, 1);
      }
      break;
    }
    case "table": {
      ctx.fillStyle = "#f4e3b8";
      ctx.fillRect(px(cx - 8), px(cy - 3), 16, 5);
      ctx.fillStyle = "#c2ab7d";
      ctx.fillRect(px(cx - 8), px(cy + 2), 16, 1);
      break;
    }
    default:
      break;
  }
}

function drawGlowHalo(
  ctx: CanvasRenderingContext2D,
  spec: BuildingSpec,
  height: number,
  strength: number,
): void {
  const center = centerOf(spec);
  const point = tileToScreen(center.x, center.y, height * 0.4);
  const radius = 26 + spec.size.x * 8;
  const gradient = ctx.createRadialGradient(
    point.sx,
    point.sy,
    2,
    point.sx,
    point.sy,
    radius,
  );
  gradient.addColorStop(0, withAlpha(spec.palette.glow, clamp(strength, 0, 1) * 0.35));
  gradient.addColorStop(1, withAlpha(spec.palette.glow, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(point.sx - radius, point.sy - radius, radius * 2, radius * 2);
}

/** Blueprint stakes shown on a room plot before `groups.proposed` lands. */
function drawFoundationMarkers(
  ctx: CanvasRenderingContext2D,
  spec: BuildingSpec,
  state: WorldState,
): void {
  const blink = 0.3 + 0.25 * Math.sin(state.elapsed * 2 + spec.tile.x);
  ctx.fillStyle = withAlpha(spec.palette.glow, blink);
  const corners = [
    tileToScreen(spec.tile.x, spec.tile.y),
    tileToScreen(spec.tile.x + spec.size.x, spec.tile.y),
    tileToScreen(spec.tile.x + spec.size.x, spec.tile.y + spec.size.y),
    tileToScreen(spec.tile.x, spec.tile.y + spec.size.y),
  ];
  for (const corner of corners) {
    ctx.fillRect(px(corner.sx - 1), px(corner.sy - 4), 2, 5);
  }
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  actor: ActorState,
  state: WorldState,
): void {
  const point = tileToScreen(actor.pos.x, actor.pos.y);
  const bob = actor.walking
    ? Math.round(Math.abs(Math.sin(state.elapsed * 9 + actor.phase)) * 2)
    : Math.round(Math.abs(Math.sin(state.elapsed * 2 + actor.phase)) * 1);
  const baseX = px(point.sx);
  const baseY = px(point.sy) - bob;

  // Contact shadow keeps the figure grounded on the iso plane.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(baseX, px(point.sy) + 1, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const palette =
    actor.kind === "student"
      ? ACTOR_PALETTE[actor.paletteIndex % ACTOR_PALETTE.length]
      : actor.kind === "professor"
        ? { skin: "#f0c49a", shirt: "#e8e3ff", shirtDark: "#9a94c4", hair: "#dcdcdc" }
        : { skin: "#bff3e4", shirt: "#3ad9c0", shirtDark: "#1d8a7a", hair: "#7ef0ff" };

  const legSwing = actor.walking ? (Math.sin(state.elapsed * 9 + actor.phase) > 0 ? 1 : -1) : 0;

  // Legs
  ctx.fillStyle = palette.shirtDark;
  ctx.fillRect(baseX - 3, baseY - 4, 2, 4 + (legSwing > 0 ? 0 : 1));
  ctx.fillRect(baseX + 1, baseY - 4, 2, 4 + (legSwing > 0 ? 1 : 0));

  // Body
  ctx.fillStyle = palette.shirt;
  ctx.fillRect(baseX - 4, baseY - 11, 8, 7);
  ctx.fillStyle = palette.shirtDark;
  ctx.fillRect(baseX - 4, baseY - 5, 8, 1);

  // Head
  ctx.fillStyle = palette.skin;
  ctx.fillRect(baseX - 3, baseY - 17, 6, 6);
  ctx.fillStyle = palette.hair;
  ctx.fillRect(baseX - 3, baseY - 18, 6, 2);
  ctx.fillStyle = "#1b1420";
  ctx.fillRect(baseX - 2, baseY - 15, 1, 1);
  ctx.fillRect(baseX + 1, baseY - 15, 1, 1);

  if (actor.kind === "guide") {
    // Floating ring marks the AI guide rather than a human.
    ctx.strokeStyle = withAlpha("#7ef0ff", 0.6 + 0.4 * Math.sin(state.elapsed * 3));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(baseX, baseY - 20, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (actor.carrying === "scroll") {
    ctx.fillStyle = "#f4e3b8";
    ctx.fillRect(baseX + 4, baseY - 12, 5, 6);
    ctx.fillStyle = "#8a6a3a";
    ctx.fillRect(baseX + 4, baseY - 12, 5, 1);
  } else if (actor.carrying === "work") {
    ctx.fillStyle = "#dfe7ff";
    ctx.fillRect(baseX + 4, baseY - 11, 5, 6);
    ctx.fillStyle = "#8f9bd0";
    ctx.fillRect(baseX + 5, baseY - 9, 3, 1);
  }

  if (actor.badgeReveal > 0.02 && actor.supports.length > 0) {
    const reveal = easeOutCubic(actor.badgeReveal);
    for (let i = 0; i < Math.min(3, actor.supports.length); i += 1) {
      const alpha = clamp(reveal * 1.2 - i * 0.2, 0, 1);
      ctx.fillStyle = withAlpha("#c8ffe6", alpha);
      ctx.fillRect(baseX - 6 - i * 3, baseY - 20 - Math.round(reveal * 2), 2, 2);
    }
  }

  if (actor.mood === "rising") {
    const t = (state.elapsed * 1.6) % 1;
    ctx.fillStyle = withAlpha("#a6ff8f", (1 - t) * 0.9);
    ctx.fillRect(baseX - 1, baseY - 22 - Math.round(t * 8), 2, 2);
  }
}

export function graphNodeScreenPoint(node: PositionedGraphNode): ScreenPoint {
  const memory = getBuilding("memory_library");
  const center = centerOf(memory);
  const anchor = tileToScreen(center.x, center.y, memory.height + 10);
  return { sx: anchor.sx + node.x, sy: anchor.sy + node.y - node.z };
}

function drawGraphOverlay(
  ctx: CanvasRenderingContext2D,
  graph: GraphOverlay,
  state: WorldState,
  selectedNodeId?: string | null,
): void {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const revealedEdges = state.phase === "grouping"
    ? Math.min(graph.edges.length, Math.floor(state.elapsed * 2) % (graph.edges.length + 1))
    : graph.edges.length;

  graph.edges.forEach((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return;
    const a = graphNodeScreenPoint(from);
    const b = graphNodeScreenPoint(to);
    const active = index < revealedEdges;
    ctx.strokeStyle = withAlpha(edge.kind === "EXHIBITED" ? "#f0a848" : "#4dd0e1", active ? 0.95 : 0.18);
    ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(px(a.sx), px(a.sy));
    ctx.lineTo(px(b.sx), px(b.sy));
    ctx.stroke();
  });

  for (const node of graph.nodes) {
    const point = graphNodeScreenPoint(node);
    const selected = node.id === selectedNodeId;
    ctx.fillStyle = selected ? "#ffffff" : node.kind === "Concept" ? "#4dd0e1" : "#f0a848";
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.beginPath();
    if (node.mark === "dot") {
      ctx.arc(px(point.sx), px(point.sy), selected ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (node.mark === "diamond") {
      const size = selected ? 6 : 5;
      ctx.moveTo(px(point.sx), px(point.sy - size));
      ctx.lineTo(px(point.sx + size), px(point.sy));
      ctx.lineTo(px(point.sx), px(point.sy + size));
      ctx.lineTo(px(point.sx - size), px(point.sy));
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.arc(px(point.sx), px(point.sy), selected ? 7 : 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle): void {
  const t = clamp(particle.progress, 0, 1);
  if (particle.progress < 0) return;
  const x = particle.pos.x + (particle.target.x - particle.pos.x) * t;
  const y = particle.pos.y + (particle.target.y - particle.pos.y) * t;
  const lift = Math.sin(t * Math.PI) * particle.arc + 14;
  const point = tileToScreen(x, y, lift);
  const alpha = clamp(1 - Math.max(0, particle.progress - 0.8) * 5, 0, 1);
  ctx.fillStyle = withAlpha(particle.color, alpha);
  const size = particle.seed > 0.6 ? 2 : 1;
  ctx.fillRect(px(point.sx), px(point.sy), size, size);
}

function drawFloatingIcon(ctx: CanvasRenderingContext2D, icon: FloatingIcon): void {
  const appear = easeOutCubic(clamp(icon.age / 0.45, 0, 1));
  const fade = Number.isFinite(icon.ttl)
    ? clamp((icon.ttl - icon.age) / 0.7, 0, 1)
    : 1;
  const alpha = appear * fade;
  if (alpha <= 0.01) return;

  const float = Math.sin(icon.age * 2) * 2;
  const point = tileToScreen(icon.anchor.x, icon.anchor.y);
  const cx = px(point.sx + icon.offset.x);
  const cy = px(point.sy + icon.offset.y - icon.rise * appear + float);

  ctx.globalAlpha = alpha;
  switch (icon.kind) {
    case "concept":
      drawDiamondBadge(ctx, cx, cy, icon.color);
      break;
    case "misconception":
      drawWarningBadge(ctx, cx, cy, icon.color);
      break;
    case "scroll":
      drawScrollBadge(ctx, cx, cy, icon.color);
      break;
    case "support":
      drawPlusBadge(ctx, cx, cy, icon.color);
      break;
    case "plan":
      drawPlanBadge(ctx, cx, cy, icon.color);
      break;
    default:
      drawDiamondBadge(ctx, cx, cy, icon.color);
      break;
  }
  ctx.globalAlpha = 1;
}

function drawDiamondBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.fillStyle = withAlpha("#0d1226", 0.75);
  ctx.fillRect(cx - 7, cy - 7, 14, 14);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx + 5, cy);
  ctx.lineTo(cx, cy + 5);
  ctx.lineTo(cx - 5, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withAlpha("#ffffff", 0.85);
  ctx.fillRect(cx - 1, cy - 2, 2, 2);
}

function drawWarningBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.fillStyle = withAlpha("#1a0d0d", 0.8);
  ctx.fillRect(cx - 7, cy - 7, 14, 14);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx + 6, cy + 5);
  ctx.lineTo(cx - 6, cy + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2b1206";
  ctx.fillRect(cx - 1, cy - 2, 2, 4);
  ctx.fillRect(cx - 1, cy + 3, 2, 1);
}

function drawScrollBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.fillStyle = withAlpha("#0d1226", 0.7);
  ctx.fillRect(cx - 6, cy - 8, 12, 16);
  ctx.fillStyle = color;
  ctx.fillRect(cx - 4, cy - 6, 8, 12);
  ctx.fillStyle = "#8a6a3a";
  ctx.fillRect(cx - 4, cy - 6, 8, 1);
  ctx.fillRect(cx - 4, cy + 5, 8, 1);
  ctx.fillRect(cx - 2, cy - 2, 4, 1);
  ctx.fillRect(cx - 2, cy + 1, 4, 1);
}

function drawPlusBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.fillStyle = withAlpha("#0d1f1a", 0.75);
  ctx.fillRect(cx - 6, cy - 6, 12, 12);
  ctx.fillStyle = color;
  ctx.fillRect(cx - 4, cy - 1, 8, 2);
  ctx.fillRect(cx - 1, cy - 4, 2, 8);
}

function drawPlanBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.fillStyle = withAlpha("#0d1226", 0.75);
  ctx.fillRect(cx - 9, cy - 7, 18, 14);
  ctx.fillStyle = color;
  ctx.fillRect(cx - 7, cy - 5, 14, 10);
  ctx.fillStyle = "#2b3a63";
  for (let i = 0; i < 3; i += 1) {
    ctx.fillRect(cx - 5, cy - 3 + i * 3, 10 - i * 2, 1);
  }
}

/** Translucent "tomorrow" wash over the whole campus once the plan is ready. */
function drawTomorrowOverlay(ctx: CanvasRenderingContext2D, state: WorldState): void {
  const alpha = clamp(state.tomorrowOverlay, 0, 1);
  ctx.fillStyle = withAlpha("#8fb6ff", alpha * 0.14);
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  const sweep = ((state.elapsed * 40) % (BASE_W + 200)) - 100;
  const gradient = ctx.createLinearGradient(sweep - 60, 0, sweep + 60, 0);
  gradient.addColorStop(0, withAlpha("#ffffff", 0));
  gradient.addColorStop(0.5, withAlpha("#dff0ff", alpha * 0.1));
  gradient.addColorStop(1, withAlpha("#ffffff", 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BASE_W, BASE_H);
}

function drawVignette(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createRadialGradient(
    BASE_W / 2,
    BASE_H / 2,
    BASE_H * 0.35,
    BASE_W / 2,
    BASE_H / 2,
    BASE_H * 0.95,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BASE_W, BASE_H);
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1).toFixed(3)})`;
}

export function lighten(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  const t = clamp(amount, 0, 1);
  return `rgb(${Math.round(r + (255 - r) * t)},${Math.round(
    g + (255 - g) * t,
  )},${Math.round(b + (255 - b) * t)})`;
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const ratio = clamp(t, 0, 1);
  return `rgb(${Math.round(r1 + (r2 - r1) * ratio)},${Math.round(
    g1 + (g2 - g1) * ratio,
  )},${Math.round(b1 + (b2 - b1) * ratio)})`;
}
