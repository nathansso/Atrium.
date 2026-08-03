import { describe, expect, it } from "vitest";
import { graphForRun, graphMark, layoutGraph, twoHopPath } from "./graph";

const nodes = [
  { id: "maya", label: "Maya", kind: "Student", props: {} },
  { id: "sign_error_negatives", label: "Sign error", kind: "Misconception", props: {} },
  { id: "integer_operations", label: "Integer operations", kind: "Concept", props: {} },
];

const edges = [
  { from: "maya", to: "sign_error_negatives", kind: "EXHIBITED", props: {} },
  { from: "sign_error_negatives", to: "integer_operations", kind: "BLOCKS", props: {} },
];

describe("memory graph layout", () => {
  it("is deterministic regardless of input order", () => {
    expect(layoutGraph(nodes)).toEqual(layoutGraph([...nodes].reverse()));
  });

  it("maps graph kinds to their schematic marks", () => {
    expect(graphMark("Student")).toBe("dot");
    expect(graphMark("Misconception")).toBe("diamond");
    expect(graphMark("Concept")).toBe("ring");
  });

  it("drops stale edges from earlier runs", () => {
    const stale = { from: "devan", to: "operation_order_confusion", kind: "EXHIBITED", props: { run_id: "old" } };
    expect(graphForRun({ nodes: [...nodes, { id: "devan", label: "Devan", kind: "Student", props: {} }], edges: [...edges.map((edge) => ({ ...edge, props: { ...edge.props, run_id: edge.kind === "EXHIBITED" ? "current" : undefined } })), stale] }, "current").edges).not.toContain(stale);
  });

  it("resolves the student-to-misconception-to-concept path", () => {
    expect(twoHopPath(edges, "maya", "integer_operations")).toEqual(edges);
  });
});