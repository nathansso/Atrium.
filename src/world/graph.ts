import type { GraphNeighborhood } from "@/server/adapters/types";

export type GraphNodeKind = "Student" | "Misconception" | "Concept";
export type GraphMark = "dot" | "diamond" | "ring";

export type PositionedGraphNode = GraphNeighborhood["nodes"][number] & {
  kind: GraphNodeKind;
  mark: GraphMark;
  x: number;
  y: number;
  z: number;
};

const NODE_STYLE: Record<GraphNodeKind, { mark: GraphMark; radius: number; z: number }> = {
  Student: { mark: "dot", radius: 22, z: 0 },
  Misconception: { mark: "diamond", radius: 48, z: 22 },
  Concept: { mark: "ring", radius: 76, z: 46 },
};

export function graphMark(kind: string): GraphMark {
  if (kind === "Student" || kind === "Misconception" || kind === "Concept") {
    return NODE_STYLE[kind].mark;
  }
  throw new Error(`Unsupported graph node kind: ${kind}`);
}

/** Stable FNV-1a hash. Its only job is to turn a node id into a repeatable angle. */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function layoutGraph(nodes: GraphNeighborhood["nodes"]): PositionedGraphNode[] {
  return [...nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => {
      if (!(node.kind in NODE_STYLE)) throw new Error(`Unsupported graph node kind: ${node.kind}`);
      const kind = node.kind as GraphNodeKind;
      const style = NODE_STYLE[kind];
      const angle = (hashId(node.id) / 0x100000000) * Math.PI * 2;
      return {
        ...node,
        kind,
        mark: style.mark,
        x: Math.round(Math.cos(angle) * style.radius * 100) / 100,
        y: Math.round(Math.sin(angle) * style.radius * 0.48 * 100) / 100,
        z: style.z,
      };
    });
}

export function twoHopPath(
  edges: GraphNeighborhood["edges"],
  studentId: string,
  conceptId: string,
): GraphNeighborhood["edges"] {
  const exhibited = edges.filter((edge) => edge.from === studentId && edge.kind === "EXHIBITED");
  for (const first of exhibited) {
    const second = edges.find(
      (edge) => edge.from === first.to && edge.to === conceptId && edge.kind === "BLOCKS",
    );
    if (second) return [first, second];
  }
  return [];
}
export function graphForRun(graph: GraphNeighborhood, runId: string): GraphNeighborhood {
  const exhibited = graph.edges.filter(
    (edge) => edge.kind === "EXHIBITED" && edge.props.run_id === runId,
  );
  const misconceptionIds = new Set(exhibited.map((edge) => edge.to));
  const edges = [
    ...exhibited,
    ...graph.edges.filter((edge) => edge.kind === "BLOCKS" && misconceptionIds.has(edge.from)),
  ];
  const nodeIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  return { nodes: graph.nodes.filter((node) => nodeIds.has(node.id)), edges };
}