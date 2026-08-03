/**
 * Curriculum Research agent — turns grounded evidence into a reviewable draft.
 *
 * Like the other specialist agents it is a pure, synchronous function: the
 * async Firecrawl retrieval happens in the service layer and the resulting sources
 * and claims are passed in. From those it builds a concept/prerequisite map,
 * sequenced student-facing chunks with comprehension checks, and citations on
 * every chunk — then flags weak, conflicting, or stale evidence.
 *
 * `human_review_required` is hard-wired to true: a research draft is never
 * student-facing until an educator approves it.
 */
import {
  curriculumDraftSchema,
  type AgentResult,
  type CurriculumChunk,
  type CurriculumConcept,
  type CurriculumConceptId,
  type CurriculumDraft,
  type ResearchClaim,
  type ResearchSource,
  type ResearchRequest,
  type ResearchWarning,
} from "@/contracts";
import { buildAgentResult, uniqueSorted } from "@/server/agentRuntime";

export const AGENT = "curriculum_research_agent" as const;

/** `ai:training-data` -> `Training Data`. */
function slugToLabel(conceptId: CurriculumConceptId): string {
  const tail = conceptId.includes(":")
    ? conceptId.slice(conceptId.lastIndexOf(":") + 1)
    : conceptId;
  return tail
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Distinct concept ids in first-seen order across the claims. */
function orderedConceptIds(claims: ResearchClaim[]): CurriculumConceptId[] {
  const seen = new Set<CurriculumConceptId>();
  const order: CurriculumConceptId[] = [];
  for (const claim of claims) {
    if (!seen.has(claim.concept_id)) {
      seen.add(claim.concept_id);
      order.push(claim.concept_id);
    }
  }
  return order;
}

export type BuildCurriculumDraftInput = {
  request: ResearchRequest;
  sources: ResearchSource[];
  claims: ResearchClaim[];
  draft_id: string;
  created_at: string;
};

/** Pure draft assembly — deterministic given its inputs. */
export function buildCurriculumDraft(
  input: BuildCurriculumDraftInput,
): CurriculumDraft {
  const { request, sources, claims } = input;
  const conceptOrder = orderedConceptIds(claims);
  const claimsByConcept = new Map<CurriculumConceptId, ResearchClaim[]>();
  for (const claim of claims) {
    const list = claimsByConcept.get(claim.concept_id) ?? [];
    list.push(claim);
    claimsByConcept.set(claim.concept_id, list);
  }

  // Concepts form a linear prerequisite chain in pedagogical order. The educator
  // edits this in review; the point is a sensible, source-derived starting map.
  const concepts: CurriculumConcept[] = conceptOrder.map((conceptId, index) => ({
    concept_id: conceptId,
    label: slugToLabel(conceptId),
    summary: (claimsByConcept.get(conceptId) ?? [])
      .map((claim) => claim.statement)
      .join(" "),
    prerequisites: index === 0 ? [] : [conceptOrder[index - 1]],
  }));

  const perChunkMinutes = Math.max(
    5,
    Math.floor(request.time_budget_minutes / Math.max(1, conceptOrder.length)),
  );

  const chunks: CurriculumChunk[] = conceptOrder.map((conceptId, index) => {
    const conceptClaims = claimsByConcept.get(conceptId) ?? [];
    const citations = uniqueSorted(
      conceptClaims.flatMap((claim) => claim.citations),
    );
    const label = slugToLabel(conceptId);
    return {
      chunk_id: `chunk_${index + 1}_${conceptId.replace(/[^a-z0-9]+/gi, "_")}`,
      title: label,
      order: index,
      concept_ids: [conceptId],
      objective_ids: [`obj:${conceptId}`],
      body: conceptClaims.map((claim) => claim.statement).join(" "),
      duration_minutes: perChunkMinutes,
      comprehension_check: {
        prompt: `In your own words, explain "${label}" and give one concrete example relevant to ${request.audience}.`,
        answer: `A correct response references: ${conceptClaims[0]?.statement ?? label}`,
        kind: "explanation",
      },
      citations,
    };
  });

  const warnings = buildWarnings(request, sources, claims, concepts, chunks);

  return curriculumDraftSchema.parse({
    draft_id: input.draft_id,
    topic: request.topic,
    audience: request.audience,
    teaching_intent: request.teaching_intent ?? null,
    created_at: input.created_at,
    concepts,
    sources,
    claims,
    chunks,
    sequence: conceptOrder,
    warnings,
    approval_state: "pending",
  });
}

function buildWarnings(
  request: ResearchRequest,
  sources: ResearchSource[],
  claims: ResearchClaim[],
  concepts: CurriculumConcept[],
  chunks: CurriculumChunk[],
): ResearchWarning[] {
  const warnings: ResearchWarning[] = [];
  const sourceById = new Map(sources.map((s) => [s.source_id, s]));

  for (const claim of claims) {
    if (claim.conflicting) {
      warnings.push({
        kind: "conflicting_evidence",
        message: `Sources disagree on: ${claim.statement}`,
        concept_id: claim.concept_id,
        refs: [claim.claim_id],
      });
    }
  }

  for (const concept of concepts) {
    const conceptClaims = claims.filter((c) => c.concept_id === concept.concept_id);
    const maxConfidence = Math.max(0, ...conceptClaims.map((c) => c.confidence));
    if (maxConfidence < 0.7) {
      warnings.push({
        kind: "weak_evidence",
        message: `"${concept.label}" is supported only by lower-confidence evidence (max ${maxConfidence.toFixed(2)}).`,
        concept_id: concept.concept_id,
        refs: conceptClaims.map((c) => c.claim_id),
      });
    }
    const distinctSources = new Set(conceptClaims.flatMap((c) => c.citations));
    if (distinctSources.size < 2) {
      warnings.push({
        kind: "thin_coverage",
        message: `"${concept.label}" rests on a single source; corroborate before teaching.`,
        concept_id: concept.concept_id,
        refs: [...distinctSources],
      });
    }
  }

  if (request.freshness_cutoff) {
    for (const source of sources) {
      if (source.published_at && source.published_at < request.freshness_cutoff) {
        warnings.push({
          kind: "stale_source",
          message: `${source.publisher} — "${source.title}" (${source.published_at}) predates the freshness cutoff.`,
          refs: [source.source_id],
        });
      }
    }
  }

  // Defensive: the schema already forbids uncited chunks, but surface any that
  // reference a source id we did not retrieve.
  for (const chunk of chunks) {
    const dangling = chunk.citations.filter((ref) => !sourceById.has(ref));
    if (dangling.length > 0) {
      warnings.push({
        kind: "uncited_chunk",
        message: `Chunk "${chunk.title}" cites unknown sources: ${dangling.join(", ")}.`,
        refs: dangling,
      });
    }
  }

  return warnings;
}

export type RunCurriculumResearchInput = BuildCurriculumDraftInput & {
  run_id: string;
};

/** Build the draft and wrap it in the validated agent-result envelope. */
export function runCurriculumResearchAgent(
  input: RunCurriculumResearchInput,
): AgentResult<CurriculumDraft> {
  const draft = buildCurriculumDraft(input);
  const confidence =
    input.claims.reduce((sum, claim) => sum + claim.confidence, 0) /
    Math.max(1, input.claims.length);
  const evidenceRefs = uniqueSorted([
    ...input.sources.map((source) => source.source_id),
    ...input.claims.map((claim) => claim.claim_id),
  ]);

  return buildAgentResult(curriculumDraftSchema, {
    run_id: input.run_id,
    agent: AGENT,
    confidence: Math.round(confidence * 100) / 100,
    evidence_refs: evidenceRefs,
    result: draft,
    // Educator review is mandatory for every research draft.
    human_review_required: true,
  });
}
