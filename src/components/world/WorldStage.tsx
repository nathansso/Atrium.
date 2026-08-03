"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtriumIcon } from "@/components/ui/atrium-icons";
import { BASE_H, BASE_W, tileToScreen } from "@/world/iso";
import { getGraph } from "@/world/api";
import { layoutGraph } from "@/world/graph";
import { graphNodeScreenPoint } from "@/world/render";
import { WORLD_LAYOUT, centerOf } from "@/world/layout";
import { hitTest, toBaseCanvasPoint } from "@/world/hitTest";
import type { WorldEngine } from "@/world/engine";
import type { WorldSelection } from "@/world/types";
import type { Selection } from "@/components/demo/useAtrium";
import type { RunProjection } from "@/world/runState";

type Props = {
  engine: WorldEngine;
  projection: RunProjection;
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

type LabelPosition = {
  id: string;
  label: string;
  caption: string;
  leftPercent: number;
  topPercent: number;
  roomId?: string;
};

function toSelection(world: WorldSelection): Selection {
  switch (world.kind) {
    case "student":
      return { kind: "student", studentId: world.studentId };
    case "graph":
      return { kind: "graph", nodeId: world.nodeId };
    case "room":
      return { kind: "room", roomId: world.roomId };
    case "building":
      return { kind: "building", id: world.id };
    default:
      return { kind: "none" };
  }
}

function toWorldSelection(selection: Selection): WorldSelection {
  switch (selection.kind) {
    case "room":
      return { kind: "room", roomId: selection.roomId };
    case "building":
      return { kind: "building", id: selection.id };
    case "student":
      return { kind: "student", studentId: selection.studentId };
    case "graph":
      return { kind: "graph", nodeId: selection.nodeId };
    default:
      return { kind: "none" };
  }
}

export function WorldStage({ engine, projection, selection, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showGraph, setShowGraph] = useState(true);
  const [graphNodes, setGraphNodes] = useState<Array<{ id: string; label: string }>>([]);

  const attach = useCallback(
    (node: HTMLCanvasElement | null) => {
      canvasRef.current = node;
      if (node) engine.attach(node);
      else engine.detach();
    },
    [engine],
  );

  useEffect(() => {
    engine.setSelected(toWorldSelection(selection));
  }, [engine, selection]);

  useEffect(() => {
    if (!projection.runId) return;
    let cancelled = false;
    const firstStudentId = projection.students[0]?.student_id;
    getGraph(projection.runId, firstStudentId)
      .then((response) => {
        if (cancelled) return;
        setGraphNodes(response.nodes.map(({ id, label }) => ({ id, label })));
        engine.setGraphOverlay({
          visible: showGraph,
          nodes: layoutGraph(response.nodes),
          edges: response.edges,
          sharedBarriers: response.shared_barriers,
          cypher: response.cypher,
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [engine, projection.events.length, projection.runId, projection.students, showGraph]);

  const labels = useMemo<LabelPosition[]>(
    () =>
      WORLD_LAYOUT.filter((spec) => spec.id !== "central_table").map((spec) => {
        const center = centerOf(spec);
        const point = tileToScreen(center.x, center.y, spec.height + 14);
        return {
          id: spec.id,
          label: spec.label,
          caption: spec.caption,
          leftPercent: (point.sx / BASE_W) * 100,
          topPercent: (point.sy / BASE_H) * 100,
          roomId: spec.roomId,
        };
      }),
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const point = toBaseCanvasPoint(canvas, event.clientX, event.clientY);
      const graphNode = engine.getState().graph?.visible
        ? engine.getState().graph?.nodes.find((node) => {
            const screen = graphNodeScreenPoint(node);
            return Math.hypot(screen.sx - point.sx, screen.sy - point.sy) <= 8;
          })
        : undefined;
      const hit = graphNode ? { kind: "graph" as const, nodeId: graphNode.id } : hitTest(engine.getState(), point.sx, point.sy);
      engine.setHover(hit);
      canvas.style.cursor = hit.kind === "none" ? "default" : "pointer";
    },
    [engine],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const point = toBaseCanvasPoint(canvas, event.clientX, event.clientY);
      const graphNode = engine.getState().graph?.visible
        ? engine.getState().graph?.nodes.find((node) => {
            const screen = graphNodeScreenPoint(node);
            return Math.hypot(screen.sx - point.sx, screen.sy - point.sy) <= 8;
          })
        : undefined;
      onSelect(graphNode ? { kind: "graph", nodeId: graphNode.id } : toSelection(hitTest(engine.getState(), point.sx, point.sy)));
    },
    [engine, onSelect],
  );

  const roomHeadcount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const roomId of Object.values(projection.studentRoom)) {
      counts[roomId] = (counts[roomId] ?? 0) + 1;
    }
    return counts;
  }, [projection.studentRoom]);

  const toggleGraph = () => {
    setShowGraph((visible) => {
      const next = !visible;
      const graph = engine.getState().graph;
      if (graph) engine.setGraphOverlay({ ...graph, visible: next });
      return next;
    });
  };

  return (
    <div className="stage">
      <div className="stage__frame">
        <canvas
          ref={attach}
          className="stage__canvas"
          width={BASE_W}
          height={BASE_H}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => engine.setHover({ kind: "none" })}
          onClick={handleClick}
          aria-label="Atrium isometric school world"
          role="img"
        />
        {showLabels && (
          <div className="stage__labels" aria-hidden="true">
            {labels.map((label) => {
              const isSelected =
                (selection.kind === "building" && selection.id === label.id) ||
                (selection.kind === "room" && `room_${selection.roomId}` === label.id);
              const count = label.roomId ? roomHeadcount[label.roomId] : undefined;
              return (
                <button
                  key={label.id}
                  type="button"
                  className={`stage__label${label.roomId ? " stage__label--room" : ""}${
                    isSelected ? " stage__label--active" : ""
                  }`}
                  style={{ left: `${label.leftPercent}%`, top: `${label.topPercent}%` }}
                  onClick={() =>
                    onSelect(
                      label.roomId
                        ? { kind: "room", roomId: label.roomId as never }
                        : { kind: "building", id: label.id as never },
                    )
                  }
                  tabIndex={-1}
                >
                  <span className="stage__label-name">{label.label}</span>
                  {count !== undefined && (
                    <span className="stage__label-count">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="stage__footer">
        <p className="stage__hint">
          Select a building or student to inspect its learning record.
        </p>
        <details className="stage__view-menu">
          <summary className="stage__view-trigger">
            <AtriumIcon name="view" size={18} />
            View
          </summary>
          <div className="stage__view-popover">
            <button
              type="button"
              className="stage__view-option"
              aria-pressed={showLabels}
              onClick={() => setShowLabels((value) => !value)}
            >
              <AtriumIcon name="labels" size={18} />
              <span>World labels</span>
              <span className="stage__view-state" aria-hidden="true">
                {showLabels ? "On" : "Off"}
              </span>
            </button>
            <button
              type="button"
              className="stage__view-option"
              aria-pressed={showGraph}
              onClick={toggleGraph}
            >
              <AtriumIcon name="memory" size={18} />
              <span>Memory graph</span>
              <span className="stage__view-state" aria-hidden="true">
                {showGraph ? "On" : "Off"}
              </span>
            </button>
          </div>
        </details>
      </div>

      {/* Keyboard/screen-reader route to the same selections the canvas offers. */}
      <div className="stage__a11y sr-only">
        <span className="stage__a11y-title">Jump to</span>
        {showGraph && graphNodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className="chip-button chip-button--tiny"
            onClick={() => onSelect({ kind: "graph", nodeId: node.id })}
          >
            Graph: {node.label}
          </button>
        ))}
        {WORLD_LAYOUT.filter((spec) => spec.id !== "central_table").map((spec) => (
          <button
            key={spec.id}
            type="button"
            className="chip-button chip-button--tiny"
            onClick={() =>
              onSelect(
                spec.roomId
                  ? { kind: "room", roomId: spec.roomId }
                  : { kind: "building", id: spec.id },
              )
            }
          >
            {spec.label}
          </button>
        ))}
      </div>
    </div>
  );
}
