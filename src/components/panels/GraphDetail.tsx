"use client";

import type { GraphOverlay } from "@/world/types";
import { EmptyState, KeyValue, Section } from "./atoms";

export function GraphDetail({ nodeId, graph }: { nodeId: string; graph?: GraphOverlay }) {
  const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || !graph) {
    return <EmptyState title="Graph node unavailable" body="Run the classroom to load its FalkorDB neighborhood." />;
  }

  return (
    <div className="detail">
      <header className="detail__head">
        <div>
          <h2 className="detail__title">{node.label}</h2>
          <p className="detail__subtitle">FalkorDB · {node.kind}</p>
        </div>
      </header>
      <Section title="Record">
        <KeyValue label="Node id">{node.id}</KeyValue>
        {Object.entries(node.props).map(([key, value]) => (
          <KeyValue key={key} label={key}>{typeof value === "string" ? value : JSON.stringify(value)}</KeyValue>
        ))}
      </Section>
      <Section title="Cypher traversal">
        <pre className="json">{graph.cypher}</pre>
      </Section>
    </div>
  );
}