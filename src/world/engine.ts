import type { AgentEvent } from "@/contracts";
import { BASE_H, BASE_W } from "./iso";
import { drawWorld } from "./render";
import { createWorldState, ingestEvent, isSettled, renderWorldToText, stepWorld } from "./sim";
import type { BuildingId, GraphOverlay, WorldSelection, WorldState } from "./types";

const FIXED_STEP = 1 / 60;

export type EngineOptions = {
  /**
   * Minimum seconds between two ingested events. Keeps animations legible when
   * a backend flushes several events in the same tick.
   */
  minEventSpacing?: number;
  seed?: number;
  onStateChange?: (state: WorldState) => void;
};

/**
 * Owns the world state, the animation clock, and the canvas. Kept free of React
 * so it can be driven headlessly by `advanceTime` in tests and screenshots.
 */
export class WorldEngine {
  private state: WorldState;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private lastFrameMs: number | null = null;
  private accumulator = 0;
  private queue: AgentEvent[] = [];
  private sinceLastEvent = Number.POSITIVE_INFINITY;
  private readonly minEventSpacing: number;
  private readonly onStateChange?: (state: WorldState) => void;

  hoverId: BuildingId | null = null;
  selectedId: string | null = null;
  selectedGraphNodeId: string | null = null;

  constructor(options: EngineOptions = {}) {
    this.state = createWorldState(options.seed);
    this.minEventSpacing = options.minEventSpacing ?? 0.4;
    this.onStateChange = options.onStateChange;
  }

  attach(canvas: HTMLCanvasElement): void {
    canvas.width = BASE_W;
    canvas.height = BASE_H;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
    this.draw();
  }

  detach(): void {
    this.stop();
    this.canvas = null;
    this.ctx = null;
  }

  getState(): WorldState {
    return this.state;
  }

  /** Queue an event. It is ingested on the next tick, respecting event spacing. */
  push(event: AgentEvent): void {
    this.queue.push(event);
  }

  pushAll(events: AgentEvent[]): void {
    for (const event of events) this.queue.push(event);
  }

  /** Number of events waiting on the spacing gate. */
  get pending(): number {
    return this.queue.length;
  }

  reset(seed?: number): void {
    this.state = createWorldState(seed ?? this.state.seed);
    this.queue = [];
    this.sinceLastEvent = Number.POSITIVE_INFINITY;
    this.accumulator = 0;
    this.lastFrameMs = null;
    this.selectedId = null;
    this.selectedGraphNodeId = null;
    this.hoverId = null;
    this.onStateChange?.(this.state);
    this.draw();
  }

  start(): void {
    if (this.rafId !== null) return;
    if (typeof requestAnimationFrame !== "function") return;
    const loop = (timestampMs: number) => {
      this.rafId = requestAnimationFrame(loop);
      const previous = this.lastFrameMs ?? timestampMs;
      this.lastFrameMs = timestampMs;
      // Clamp so a backgrounded tab does not fast-forward the whole demo.
      const deltaMs = Math.min(120, Math.max(0, timestampMs - previous));
      this.tick(deltaMs / 1000);
      this.draw();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.lastFrameMs = null;
  }

  /**
   * Deterministically advance the world by `ms`, ingesting any queued events on
   * the same virtual clock, then redraw once. Exposed as `window.advanceTime`.
   */
  advanceTime(ms: number): void {
    const seconds = Math.max(0, ms) / 1000;
    this.tick(seconds);
    this.draw();
  }

  /** Drain every queued event and settle all animations, up to a safety bound. */
  fastForward(maxSeconds = 60): void {
    let spent = 0;
    while (spent < maxSeconds && (this.queue.length > 0 || !isSettled(this.state))) {
      this.tick(FIXED_STEP * 4);
      spent += FIXED_STEP * 4;
    }
    this.draw();
  }

  private tick(seconds: number): void {
    this.accumulator += seconds;
    let steps = 0;
    // Bound the catch-up work so a long pause cannot lock the main thread.
    const maxSteps = Math.ceil(seconds / FIXED_STEP) + 8;
    while (this.accumulator >= FIXED_STEP && steps < maxSteps) {
      this.accumulator -= FIXED_STEP;
      steps += 1;
      this.sinceLastEvent += FIXED_STEP;
      if (this.queue.length > 0 && this.sinceLastEvent >= this.minEventSpacing) {
        const next = this.queue.shift();
        if (next) {
          ingestEvent(this.state, next);
          this.sinceLastEvent = 0;
          this.onStateChange?.(this.state);
        }
      }
      stepWorld(this.state, FIXED_STEP);
    }
    if (steps >= maxSteps) this.accumulator = 0;
  }

  draw(): void {
    if (!this.ctx) return;
    drawWorld(this.ctx, this.state, {
      hoverId: this.hoverId,
      selectedId: this.selectedId,
      selectedGraphNodeId: this.selectedGraphNodeId,
    });
  }

  renderToText(): string {
    return renderWorldToText(this.state);
  }

  setHover(selection: WorldSelection): void {
    const next = selectionToBuildingId(selection);
    if (next !== this.hoverId) {
      this.hoverId = next;
      this.draw();
    }
  }

  setSelected(selection: WorldSelection): void {
    this.selectedId = selectionToBuildingId(selection);
    this.selectedGraphNodeId = selection.kind === "graph" ? selection.nodeId : null;
    this.draw();
  }

  setGraphOverlay(graph: GraphOverlay): void {
    this.state.graph = graph;
    this.onStateChange?.(this.state);
    this.draw();
  }
}

function selectionToBuildingId(selection: WorldSelection): BuildingId | null {
  if (selection.kind === "building") return selection.id;
  if (selection.kind === "room") return `room_${selection.roomId}` as BuildingId;
  return null;
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    __atrium?: {
      engine: WorldEngine;
      state: () => WorldState;
      fastForward: (seconds?: number) => void;
    };
  }
}

/**
 * Install the debug/automation hooks required by the Person A checklist.
 * Returns a cleanup function that removes them again.
 */
export function installWorldGlobals(engine: WorldEngine): () => void {
  if (typeof window === "undefined") return () => {};
  window.render_game_to_text = () => engine.renderToText();
  window.advanceTime = (ms: number) => engine.advanceTime(ms);
  window.__atrium = {
    engine,
    state: () => engine.getState(),
    fastForward: (seconds?: number) => engine.fastForward(seconds),
  };
  return () => {
    delete window.render_game_to_text;
    delete window.advanceTime;
    delete window.__atrium;
  };
}
