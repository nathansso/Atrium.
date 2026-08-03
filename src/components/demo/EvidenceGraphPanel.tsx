"use client";

import { AtriumIcon } from "@/components/ui/atrium-icons";
import type { GraphNeighborhood } from "@/server/adapters/types";

export function EvidenceGraphPanel({ evidence }: { evidence: GraphNeighborhood | null }) {
  if (!evidence) {
    return <div className="evidence-graph evidence-graph--empty">Loading FalkorDB evidence graph…</div>;
  }
  if (evidence.nodes.length === 0) {
    return <div className="evidence-graph evidence-graph--empty">No source graph is attached to this run.</div>;
  }

  const nodeById = new Map(evidence.nodes.map((node) => [node.id, node]));
  const lessons = evidence.nodes.filter((node) => node.kind === "Lesson");
  return (
    <div className="evidence-graph">
      <header className="evidence-graph__header">
        <AtriumIcon name="graph" size={20} />
        <div>
          <p className="eyebrow">FalkorDB evidence graph</p>
          <h2>Every lesson is linked to its retrieved sources</h2>
        </div>
      </header>
      <p className="evidence-graph__legend">Lesson → citation → source, with the concepts each lesson teaches.</p>
      <div className="evidence-graph__flow" aria-label="Research evidence relationships">
        {lessons.map((lesson) => {
          const citations = evidence.edges
            .filter((edge) => edge.from === lesson.id && edge.kind === "CITES")
            .map((edge) => nodeById.get(edge.to))
            .filter((node): node is NonNullable<typeof node> => Boolean(node));
          const concepts = evidence.edges
            .filter((edge) => edge.from === lesson.id && edge.kind === "TEACHES")
            .map((edge) => nodeById.get(edge.to))
            .filter((node): node is NonNullable<typeof node> => Boolean(node));
          return (
            <article className="evidence-graph__lesson" key={lesson.id}>
              <div className="evidence-node evidence-node--lesson">
                <span>Lesson</span>
                <strong>{lesson.label}</strong>
              </div>
              <div className="evidence-graph__edges">
                <span>cites</span>
                <span>teaches</span>
              </div>
              <div className="evidence-graph__targets">
                <div className="evidence-graph__sources">
                  {citations.map((source) => {
                    const url = typeof source.props.url === "string" ? source.props.url : null;
                    return url ? (
                      <a className="evidence-node evidence-node--source" href={url} target="_blank" rel="noreferrer" key={source.id}>
                        <span>{String(source.props.publisher ?? "Source")}</span><strong>{source.label}</strong>
                      </a>
                    ) : <div className="evidence-node evidence-node--source" key={source.id}><span>Source</span><strong>{source.label}</strong></div>;
                  })}
                </div>
                <div className="evidence-graph__concepts">
                  {concepts.map((concept) => <div className="evidence-node evidence-node--concept" key={concept.id}>{concept.label}</div>)}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
