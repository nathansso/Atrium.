import { describe, expect, it } from "vitest";
import { humanize, readConceptIds, readConceptSummaries } from "./payloads";

describe("run-scoped concept payloads", () => {
  const payload = {
    concepts: [
      { concept_id: "ai:what-is-ai", label: "What is AI?", prerequisite_of: ["ai:data"] },
      { concept_id: "ai:data", label: "Data for AI" },
    ],
  };

  it("keeps researched concept IDs instead of filtering to the Algebra fixture", () => {
    expect(readConceptIds(payload)).toEqual(["ai:what-is-ai", "ai:data"]);
    expect(readConceptSummaries(payload).map((concept) => concept.concept_id)).toEqual([
      "ai:what-is-ai",
      "ai:data",
    ]);
  });

  it("renders scoped IDs as readable labels", () => {
    expect(humanize("ai:what-is-ai")).toBe("Ai What Is Ai");
  });
});
