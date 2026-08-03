import { beforeEach, describe, expect, it } from "vitest";
import { researchRequestSchema, type ResearchClaim, type ResearchSource } from "@/contracts";
import { createMockFirecrawlAdapter } from "@/server/adapters/firecrawlMock";
import { buildCurriculumDraft, runCurriculumResearchAgent } from "./curriculumResearch";

const request = researchRequestSchema.parse({
  topic: "AI literacy",
  audience: "high school",
  teaching_intent: "critical, responsible use",
});

let sources: ResearchSource[];
let claims: ResearchClaim[];

beforeEach(async () => {
  const research = await createMockFirecrawlAdapter().research({
    topic: request.topic,
    audience: request.audience,
    maxResults: request.max_sources,
  });
  sources = research.sources;
  claims = research.claims;
});

function draft() {
  return buildCurriculumDraft({
    request,
    sources,
    claims,
    draft_id: "draft_0001",
    created_at: "2026-08-03T00:00:00.000Z",
  });
}

describe("curriculum research agent", () => {
  it("derives one chunk per concept, each with required citations and a check", () => {
    const result = draft();
    const conceptCount = new Set(claims.map((claim) => claim.concept_id)).size;
    expect(result.chunks).toHaveLength(conceptCount);

    const knownSources = new Set(sources.map((source) => source.source_id));
    for (const chunk of result.chunks) {
      expect(chunk.citations.length).toBeGreaterThan(0); // never uncited
      expect(chunk.citations.every((ref) => knownSources.has(ref))).toBe(true);
      expect(chunk.objective_ids.length).toBeGreaterThan(0);
      expect(chunk.concept_ids.length).toBeGreaterThan(0);
      expect(chunk.comprehension_check.prompt).toContain(chunk.title);
    }
  });

  it("builds a prerequisite-topological concept sequence", () => {
    const result = draft();
    const seen = new Set<string>();
    for (const conceptId of result.sequence) {
      const concept = result.concepts.find((c) => c.concept_id === conceptId)!;
      // Every prerequisite appears earlier in the sequence.
      for (const prerequisite of concept.prerequisites) {
        expect(seen.has(prerequisite)).toBe(true);
      }
      seen.add(conceptId);
    }
    expect(result.concepts[0].prerequisites).toEqual([]);
  });

  it("flags conflicting evidence and nothing spurious at full corpus", () => {
    const result = draft();
    const conflicting = result.warnings.filter((w) => w.kind === "conflicting_evidence");
    expect(conflicting).toHaveLength(1);
    expect(conflicting[0].concept_id).toBe("ai:bias-fairness");
  });

  it("flags stale sources when a freshness cutoff is set", () => {
    const strict = buildCurriculumDraft({
      request: researchRequestSchema.parse({
        topic: request.topic,
        audience: request.audience,
        freshness_cutoff: "2025-01-01",
      }),
      sources,
      claims,
      draft_id: "draft_0002",
      created_at: "2026-08-03T00:00:00.000Z",
    });
    const stale = strict.warnings.filter((w) => w.kind === "stale_source");
    expect(stale.length).toBeGreaterThan(0);
  });

  it("always requires educator review and reports provenance evidence", () => {
    const envelope = runCurriculumResearchAgent({
      request,
      sources,
      claims,
      draft_id: "draft_0001",
      created_at: "2026-08-03T00:00:00.000Z",
      run_id: "draft_0001",
    });
    expect(envelope.human_review_required).toBe(true);
    expect(envelope.status).toBe("needs_review");
    expect(envelope.agent).toBe("curriculum_research_agent");
    // Evidence references every source and claim used.
    for (const source of sources) {
      expect(envelope.evidence_refs).toContain(source.source_id);
    }
  });
});
