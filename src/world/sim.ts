import type { AgentEvent, RoomId, SupportId } from "@/contracts";
import { roomIds } from "@/contracts";
import { approach, clamp, distance, type Vec2 } from "./iso";
import {
  WORLD_LAYOUT,
  buildingCenter,
  centerOf,
  getBuilding,
  roomBuildingId,
  standingSpot,
} from "./layout";
import {
  humanize,
  readConceptIds,
  readMisconceptions,
  readMoves,
  readRooms,
  readStudents,
  readSubmissions,
  readSupportLayers,
  readVariants,
} from "./payloads";
import {
  buildingIds,
  type ActorState,
  type BuildingId,
  type BuildingState,
  type FloatingIcon,
  type WorldPhase,
  type WorldState,
} from "./types";

const ACTOR_PALETTES = 6;
const WALK_SPEED = 1.9;

/** Deterministic RNG so replays and text snapshots are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function emptyBuildingState(id: BuildingId): BuildingState {
  const spec = getBuilding(id);
  return {
    id,
    level: spec.startsBuilt ? 1 : 0,
    targetLevel: spec.startsBuilt ? 1 : 0,
    glow: 0,
    targetGlow: 0,
    pulse: 0,
    occupancy: 0,
    previousOccupancy: 0,
    hasScroll: false,
  };
}

export function createWorldState(seed = 20260724): WorldState {
  const buildings = {} as Record<BuildingId, BuildingState>;
  for (const id of buildingIds) buildings[id] = emptyBuildingState(id);

  return {
    runId: null,
    phase: "idle",
    elapsed: 0,
    buildings,
    actors: [createProfessor(), createGuide()],
    floats: [],
    particles: [],
    concepts: [],
    misconceptions: [],
    tomorrowOverlay: 0,
    targetTomorrowOverlay: 0,
    reviewOpen: false,
    activeAgent: null,
    processed: [],
    seed,
  };
}

function createProfessor(): ActorState {
  const home = standingSpot("professor_tower", 0, 1);
  return {
    id: "professor",
    kind: "professor",
    name: "Professor",
    avatarKey: "professor",
    pos: { ...home },
    path: [],
    speedTilesPerSecond: WALK_SPEED,
    supports: [],
    badgeReveal: 0,
    targetBadgeReveal: 0,
    carrying: "none",
    mood: "neutral",
    phase: 0,
    paletteIndex: 0,
    walking: false,
  };
}

function createGuide(): ActorState {
  const home = standingSpot("agent_workshop", 0, 1);
  return {
    id: "guide",
    kind: "guide",
    name: "AI Guide",
    avatarKey: "guide",
    pos: { ...home },
    path: [],
    speedTilesPerSecond: WALK_SPEED,
    supports: [],
    badgeReveal: 0,
    targetBadgeReveal: 0,
    carrying: "none",
    mood: "focused",
    phase: 1.7,
    paletteIndex: 1,
    walking: false,
  };
}

function students(state: WorldState): ActorState[] {
  return state.actors.filter((actor) => actor.kind === "student");
}

export function roomMembers(state: WorldState, roomId: RoomId): ActorState[] {
  return students(state).filter((actor) => actor.roomId === roomId);
}

function findActor(state: WorldState, id: string): ActorState | undefined {
  return state.actors.find((actor) => actor.id === id);
}

/** Commons position used before students are grouped into rooms. */
function commonsSpot(index: number, total: number): Vec2 {
  const center = centerOf(getBuilding("central_table"));
  const columns = 6;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const inRow = Math.min(columns, total - row * columns);
  const spread = (column - (inRow - 1) / 2) * 0.75;
  return {
    x: center.x + 1.4 + row * 0.7 + spread,
    y: center.y + 1.4 + row * 0.7 - spread,
  };
}

function ensureStudent(state: WorldState, id: string, name: string): ActorState {
  const existing = findActor(state, id);
  if (existing) return existing;
  const index = students(state).length;
  const rng = mulberry32(hashString(id));
  const actor: ActorState = {
    id,
    kind: "student",
    name,
    avatarKey: `student_${index % 8}`,
    pos: commonsSpot(index, Math.max(index + 1, 12)),
    path: [],
    speedTilesPerSecond: WALK_SPEED * (0.85 + rng() * 0.3),
    supports: [],
    badgeReveal: 0,
    targetBadgeReveal: 0,
    carrying: "none",
    mood: "neutral",
    phase: rng() * Math.PI * 2,
    paletteIndex: hashString(id) % ACTOR_PALETTES,
    walking: false,
  };
  state.actors.push(actor);
  return actor;
}

/** Re-spread every member of a room across its standing spots. */
function restageRoom(state: WorldState, roomId: RoomId): void {
  const members = roomMembers(state, roomId);
  const buildingId = roomBuildingId(roomId);
  members.forEach((actor, index) => {
    walkTo(actor, standingSpot(buildingId, index, members.length));
  });
  const building = state.buildings[buildingId];
  building.previousOccupancy = building.occupancy;
  building.occupancy = members.length;
}

function restageCommons(state: WorldState): void {
  const loose = students(state).filter((actor) => !actor.roomId);
  loose.forEach((actor, index) => {
    walkTo(actor, commonsSpot(index, loose.length));
  });
}

function walkTo(actor: ActorState, target: Vec2): void {
  actor.path = [target];
  actor.walking = true;
}

function pulse(state: WorldState, id: BuildingId, seconds = 1.6): void {
  const building = state.buildings[id];
  building.pulse = Math.max(building.pulse, seconds);
  building.targetGlow = 1;
}

function addFloat(
  state: WorldState,
  icon: Omit<FloatingIcon, "id" | "age"> & { id?: string },
): void {
  state.floats.push({
    id: icon.id ?? `float_${state.floats.length}_${state.processed.length}`,
    age: 0,
    ...icon,
  });
}

function emitParticles(
  state: WorldState,
  from: Vec2,
  to: Vec2,
  count: number,
  color: string,
): void {
  const rng = mulberry32(hashString(`${state.processed.length}:${count}:${color}`));
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      pos: { ...from },
      target: { ...to },
      progress: -(i / count) * 0.6,
      speed: 0.45 + rng() * 0.35,
      color,
      arc: 16 + rng() * 22,
      seed: rng(),
    });
  }
}

const PHASE_BY_EVENT: Partial<Record<string, WorldPhase>> = {
  "assignment.uploaded": "uploaded",
  "assignment.concepts.extracted": "analyzing",
  "student.context.ready": "analyzing",
  "groups.proposed": "grouping",
  "accessibility.layers.ready": "grouping",
  "assignment.variants.ready": "variants_ready",
  "submissions.received": "submissions",
  "assessment.completed": "assessment",
  "student.models.updated": "evolution",
  "lesson.plan.ready": "planned",
};

const CONCEPT_COLOR: Record<string, string> = {
  integer_operations: "#7ef0ff",
  distributive_property: "#ffd45c",
  equation_sequencing: "#a6ff8f",
  combining_like_terms: "#ff9ede",
};

/**
 * Apply one agent event to the world. Every event in docs/CONTRACTS.md has a
 * visible consequence here; unknown events are recorded but change nothing.
 */
export function ingestEvent(state: WorldState, event: AgentEvent): void {
  state.runId = event.run_id;
  state.activeAgent = event.source_agent;
  state.processed.push(event.event_type);
  const phase = PHASE_BY_EVENT[event.event_type];
  if (phase) state.phase = phase;
  const payload = event.payload ?? {};
  pulse(state, "agent_workshop", 1.2);

  switch (event.event_type) {
    case "assignment.uploaded": {
      // Professor carries the scroll from the tower to the AI guide.
      const professor = findActor(state, "professor");
      const guide = findActor(state, "guide");
      if (professor && guide) {
        professor.carrying = "scroll";
        walkTo(professor, {
          x: guide.pos.x - 0.9,
          y: guide.pos.y - 0.9,
        });
      }
      pulse(state, "professor_tower", 2.2);
      addFloat(state, {
        kind: "scroll",
        label: "Assignment",
        anchor: buildingCenter("professor_tower"),
        offset: { x: 0, y: -34 },
        ttl: 3.2,
        rise: 16,
        color: "#ffe9a8",
      });
      break;
    }

    case "assignment.concepts.extracted": {
      const concepts = readConceptIds(payload);
      state.concepts = concepts.length > 0 ? concepts : state.concepts;
      const table = buildingCenter("central_table");
      state.concepts.forEach((concept, index) => {
        const spread = (index - (state.concepts.length - 1) / 2) * 44;
        addFloat(state, {
          id: `concept_${concept}`,
          kind: "concept",
          label: humanize(concept),
          anchor: table,
          offset: { x: spread, y: -12 },
          ttl: Number.POSITIVE_INFINITY,
          rise: 10,
          color: CONCEPT_COLOR[concept] ?? "#ffe9a8",
        });
      });
      pulse(state, "central_table", 2);
      break;
    }

    case "student.context.ready": {
      const incoming = readStudents(payload);
      incoming.forEach((student, index) => {
        const actor = ensureStudent(
          state,
          student.student_id,
          student.display_name ?? `Student ${index + 1}`,
        );
        if (Array.isArray(student.supports)) actor.supports = student.supports;
      });
      restageCommons(state);
      pulse(state, "memory_library", 3);
      state.buildings.memory_library.targetGlow = 1;
      emitParticles(
        state,
        buildingCenter("memory_library"),
        buildingCenter("agent_workshop"),
        18,
        "#7ff0d2",
      );
      break;
    }

    case "groups.proposed": {
      const rooms = readRooms(payload);
      for (const room of rooms) {
        const buildingId = roomBuildingId(room.room_id);
        // Foundations first: the plot appears but the room is not yet built.
        state.buildings[buildingId].targetLevel = Math.max(
          state.buildings[buildingId].targetLevel,
          0.28,
        );
        pulse(state, buildingId, 1.8);
        const members = Array.isArray(room.members) ? room.members : [];
        for (const studentId of members) {
          const actor = ensureStudent(state, studentId, studentId);
          actor.roomId = room.room_id;
        }
      }
      for (const roomId of roomIds) restageRoom(state, roomId);
      restageCommons(state);
      break;
    }

    case "accessibility.layers.ready": {
      const layers = readSupportLayers(payload);
      for (const layer of layers) {
        const actor = findActor(state, layer.student_id);
        if (!actor) continue;
        if (layer.supports.length > 0) actor.supports = layer.supports;
        actor.targetBadgeReveal = 1;
        addFloat(state, {
          kind: "support",
          label: supportGlyph(actor.supports),
          anchor: actor.pos,
          offset: { x: 0, y: -22 },
          ttl: 2.4,
          rise: 10,
          color: "#c8ffe6",
        });
      }
      pulse(state, "communication_beacon", 1.6);
      break;
    }

    case "assignment.variants.ready": {
      const variants = readVariants(payload);
      const targets = variants.length > 0 ? variants.map((v) => v.room_id) : roomIds;
      for (const roomId of targets) {
        const buildingId = roomBuildingId(roomId);
        state.buildings[buildingId].targetLevel = 1;
        state.buildings[buildingId].hasScroll = true;
        state.buildings[buildingId].targetGlow = 0.75;
        pulse(state, buildingId, 2.4);
        addFloat(state, {
          id: `variant_scroll_${roomId}`,
          kind: "scroll",
          label: "Variant",
          anchor: buildingCenter(buildingId),
          offset: { x: 0, y: -30 },
          ttl: Number.POSITIVE_INFINITY,
          rise: 12,
          color: "#ffe9a8",
        });
      }
      break;
    }

    case "submissions.received": {
      const submissions = readSubmissions(payload);
      const walkers =
        submissions.length > 0
          ? submissions
              .map((submission) => findActor(state, submission.student_id))
              .filter((actor): actor is ActorState => Boolean(actor))
          : students(state);
      walkers.forEach((actor, index) => {
        actor.carrying = "work";
        actor.mood = "focused";
        walkTo(actor, standingSpot("assessment_forge", index, walkers.length));
      });
      pulse(state, "assessment_forge", 2.6);
      state.buildings.assessment_forge.targetGlow = 1;
      break;
    }

    case "assessment.completed": {
      const misconceptions = readMisconceptions(payload);
      state.misconceptions = misconceptions.length > 0 ? misconceptions : state.misconceptions;
      const forge = buildingCenter("assessment_forge");
      state.misconceptions.forEach((misconception, index) => {
        const spread = (index - (state.misconceptions.length - 1) / 2) * 40;
        addFloat(state, {
          kind: "misconception",
          label: humanize(misconception),
          anchor: forge,
          offset: { x: spread, y: -34 },
          ttl: 7,
          rise: 34,
          color: "#ff9a6b",
        });
      });
      emitParticles(state, forge, buildingCenter("memory_library"), 14, "#ffb765");
      for (const actor of students(state)) {
        actor.carrying = "none";
      }
      pulse(state, "assessment_forge", 2.4);
      break;
    }

    case "student.models.updated": {
      const moves = readMoves(payload);
      const touched = new Set<RoomId>();
      for (const move of moves) {
        const actor = findActor(state, move.student_id);
        if (!actor) continue;
        if (move.from_room) touched.add(move.from_room);
        if (move.to_room) {
          const changed = actor.roomId !== move.to_room;
          if (actor.roomId) touched.add(actor.roomId);
          actor.roomId = move.to_room;
          touched.add(move.to_room);
          actor.mood = changed ? "rising" : "focused";
        }
      }
      const affected = touched.size > 0 ? Array.from(touched) : Array.from(roomIds);
      for (const roomId of affected) restageRoom(state, roomId);
      for (const roomId of roomIds) {
        if (!affected.includes(roomId)) restageRoom(state, roomId);
      }
      emitParticles(
        state,
        buildingCenter("memory_library"),
        buildingCenter("planning_observatory"),
        12,
        "#9fd0ff",
      );
      pulse(state, "memory_library", 2);
      break;
    }

    case "lesson.plan.ready": {
      state.targetTomorrowOverlay = 1;
      pulse(state, "planning_observatory", 3);
      state.buildings.planning_observatory.targetGlow = 1;
      addFloat(state, {
        id: "tomorrow_plan",
        kind: "plan",
        label: "Tomorrow",
        anchor: buildingCenter("planning_observatory"),
        offset: { x: 0, y: -44 },
        ttl: Number.POSITIVE_INFINITY,
        rise: 18,
        color: "#d8ecff",
      });
      break;
    }

    case "approval.requested": {
      state.reviewOpen = true;
      pulse(state, "communication_beacon", 3.4);
      state.buildings.communication_beacon.targetGlow = 1;
      addFloat(state, {
        id: "approval_flag",
        kind: "spark",
        label: "Review",
        anchor: buildingCenter("communication_beacon"),
        offset: { x: 0, y: -50 },
        ttl: Number.POSITIVE_INFINITY,
        rise: 12,
        color: "#ffd45c",
      });
      break;
    }

    default:
      break;
  }
}

function supportGlyph(supports: SupportId[]): string {
  if (supports.length === 0) return "Support";
  return humanize(supports[0]);
}

/** Advance every animated quantity by `dtSeconds`. Pure function of dt. */
export function stepWorld(state: WorldState, dtSeconds: number): void {
  const dt = clamp(dtSeconds, 0, 0.25);
  if (dt <= 0) return;
  state.elapsed += dt;

  for (const id of buildingIds) {
    const building = state.buildings[id];
    building.level = approach(building.level, building.targetLevel, 2.4, dt);
    if (building.pulse > 0) {
      building.pulse = Math.max(0, building.pulse - dt);
      if (building.pulse === 0 && building.targetGlow < 0.35) {
        building.targetGlow = 0.15;
      }
    }
    building.glow = approach(building.glow, building.targetGlow, 3, dt);
  }

  for (const actor of state.actors) {
    actor.badgeReveal = approach(actor.badgeReveal, actor.targetBadgeReveal, 3, dt);
    const target = actor.path[0];
    if (!target) {
      actor.walking = false;
      continue;
    }
    const remaining = distance(actor.pos, target);
    const stepLength = actor.speedTilesPerSecond * dt;
    if (remaining <= stepLength || remaining < 0.01) {
      actor.pos = { ...target };
      actor.path.shift();
      actor.walking = actor.path.length > 0;
      if (!actor.walking && actor.kind === "professor") actor.carrying = "none";
    } else {
      const ratio = stepLength / remaining;
      actor.pos = {
        x: actor.pos.x + (target.x - actor.pos.x) * ratio,
        y: actor.pos.y + (target.y - actor.pos.y) * ratio,
      };
      actor.walking = true;
    }
  }

  state.floats = state.floats.filter((icon) => {
    icon.age += dt;
    return icon.age < icon.ttl;
  });

  state.particles = state.particles.filter((particle) => {
    particle.progress += particle.speed * dt;
    return particle.progress < 1.15;
  });

  state.tomorrowOverlay = approach(
    state.tomorrowOverlay,
    state.targetTomorrowOverlay,
    1.6,
    dt,
  );
}

/** True once every animated quantity has settled. Used by tests and by advanceTime callers. */
export function isSettled(state: WorldState): boolean {
  const movingActor = state.actors.some((actor) => actor.path.length > 0);
  const buildingsMoving = buildingIds.some((id) => {
    const building = state.buildings[id];
    return (
      Math.abs(building.level - building.targetLevel) > 0.01 || building.pulse > 0
    );
  });
  return !movingActor && !buildingsMoving && state.particles.length === 0;
}

/**
 * Deterministic text description of the world, exposed as
 * `window.render_game_to_text`. Written for a screen reader or an agent
 * inspecting the demo without pixels.
 */
export function renderWorldToText(state: WorldState): string {
  const lines: string[] = [];
  lines.push("ATRIUM WORLD");
  lines.push(`run: ${state.runId ?? "(none)"}`);
  lines.push(`phase: ${state.phase}`);
  lines.push(`elapsed: ${state.elapsed.toFixed(1)}s`);
  lines.push(`events processed: ${state.processed.length}`);
  if (state.processed.length > 0) {
    lines.push(`last event: ${state.processed[state.processed.length - 1]}`);
  }
  lines.push("");

  lines.push("BUILDINGS");
  for (const spec of WORLD_LAYOUT) {
    const building = state.buildings[spec.id];
    const parts = [`built ${Math.round(building.level * 100)}%`];
    if (building.glow > 0.4) parts.push("active");
    if (building.pulse > 0) parts.push("pulsing");
    if (building.hasScroll) parts.push("variant scroll");
    if (spec.roomId) parts.push(`${building.occupancy} students`);
    lines.push(`- ${spec.label}: ${parts.join(", ")}`);
  }
  lines.push("");

  lines.push("ROOMS");
  for (const roomId of roomIds) {
    const members = roomMembers(state, roomId);
    const names = members.map((actor) => actor.name).join(", ") || "(empty)";
    lines.push(`- ${humanize(roomId)} (${members.length}): ${names}`);
  }
  const unassigned = students(state).filter((actor) => !actor.roomId);
  lines.push(`- Commons (${unassigned.length}): ${
    unassigned.map((actor) => actor.name).join(", ") || "(empty)"
  }`);
  lines.push("");

  lines.push("CONCEPTS");
  lines.push(
    state.concepts.length > 0
      ? state.concepts.map(humanize).join(", ")
      : "(none extracted)",
  );
  lines.push("");

  lines.push("MISCONCEPTIONS");
  lines.push(
    state.misconceptions.length > 0
      ? state.misconceptions.map(humanize).join(", ")
      : "(none detected)",
  );
  lines.push("");

  lines.push("ACTORS");
  for (const actor of state.actors) {
    const where = actor.roomId ? `room ${actor.roomId}` : "commons";
    const moving = actor.walking ? "walking" : "idle";
    const supports =
      actor.supports.length > 0 && actor.badgeReveal > 0.5
        ? ` supports=[${actor.supports.join(",")}]`
        : "";
    lines.push(
      `- ${actor.name} (${actor.kind}) at ${actor.pos.x.toFixed(1)},${actor.pos.y.toFixed(
        1,
      )} ${moving}, ${where}, carrying=${actor.carrying}${supports}`,
    );
  }
  lines.push("");

  lines.push("OVERLAYS");
  lines.push(`tomorrow plan overlay: ${Math.round(state.tomorrowOverlay * 100)}%`);
  lines.push(`professor review requested: ${state.reviewOpen ? "yes" : "no"}`);
  lines.push(`active agent: ${state.activeAgent ?? "(none)"}`);
  lines.push(
    `floating icons: ${state.floats.length}, particles: ${state.particles.length}`,
  );

  return lines.join("\n");
}
