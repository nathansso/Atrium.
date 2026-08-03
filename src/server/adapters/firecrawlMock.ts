/**
 * Deterministic Firecrawl mock — an offline AI-literacy research fixture.
 *
 * Mirrors the shape of `rocketrideMock`: a frozen fixture, boundary schema
 * validation, and a `globalThis`-cached reset hook. The same request always
 * yields the same sources and claims, so demos and tests are reproducible with
 * no network. This is the corpus the Curriculum Research agent turns into a
 * cited, prerequisite-aware draft.
 */
import {
  researchClaimSchema,
  researchSourceSchema,
  type ResearchClaim,
  type ResearchSource,
} from "@/contracts";
import type {
  AdapterInfo,
  FirecrawlResearchAdapter,
  FirecrawlResearchResult,
  FirecrawlSearchQuery,
} from "./types";

const PROVIDER = "deterministic-fixtures";
/** Fixed retrieval time so the fixture never depends on the wall clock. */
const RETRIEVED_AT = "2026-08-01T00:00:00.000Z";

const AI_LITERACY_SOURCES: ResearchSource[] = [
  {
    source_id: "src_unesco_framework",
    url: "https://www.unesco.org/en/digital-education/ai-future-learning",
    title: "AI competency framework for students",
    publisher: "UNESCO",
    source_type: "official_standard",
    published_at: "2024-09-01",
    retrieved_at: RETRIEVED_AT,
    excerpt:
      "Students should understand what AI is, how it uses data, its ethical implications, and how to use it responsibly and critically.",
    credibility:
      "UN agency standard-setting body; framework developed with international expert consultation.",
    provenance: "mock",
  },
  {
    source_id: "src_stanford_ai_index",
    url: "https://hai.stanford.edu/ai-index",
    title: "Artificial Intelligence Index Report",
    publisher: "Stanford Institute for Human-Centered AI",
    source_type: "academic",
    published_at: "2025-04-01",
    retrieved_at: RETRIEVED_AT,
    excerpt:
      "Foundation models predict likely continuations of text and can generate fluent output that is not necessarily factually accurate.",
    credibility:
      "Peer-reviewed academic institute; widely cited annual measurement of AI capability and impact.",
    provenance: "mock",
  },
  {
    source_id: "src_google_ml_course",
    url: "https://developers.google.com/machine-learning/crash-course",
    title: "Machine Learning Crash Course",
    publisher: "Google",
    source_type: "educational",
    published_at: "2024-11-15",
    retrieved_at: RETRIEVED_AT,
    excerpt:
      "Machine learning systems learn patterns from labelled examples instead of relying on explicitly programmed rules.",
    credibility:
      "Vendor educational material; technically authoritative for ML fundamentals, reviewed for classroom use.",
    provenance: "mock",
  },
  {
    source_id: "src_mit_day_of_ai",
    url: "https://www.dayofai.org",
    title: "Day of AI curriculum",
    publisher: "MIT RAISE",
    source_type: "educational",
    published_at: "2024-05-20",
    retrieved_at: RETRIEVED_AT,
    excerpt:
      "The behaviour of an AI system is shaped by the data it is trained on; incomplete or skewed data produces skewed results.",
    credibility:
      "University-developed K-12 curriculum; classroom-tested and pedagogically reviewed.",
    provenance: "mock",
  },
  {
    source_id: "src_oecd_ai_principles",
    url: "https://oecd.ai/en/ai-principles",
    title: "OECD AI Principles",
    publisher: "OECD",
    source_type: "official_standard",
    published_at: "2024-05-03",
    retrieved_at: RETRIEVED_AT,
    excerpt:
      "Trustworthy AI rests on transparency, human oversight, accountability, and respect for privacy and human rights.",
    credibility:
      "Intergovernmental policy standard adopted by member countries; widely referenced by regulators.",
    provenance: "mock",
  },
  {
    source_id: "src_mozilla_ai_literacy",
    url: "https://foundation.mozilla.org/en/",
    title: "AI literacy resources",
    publisher: "Mozilla Foundation",
    source_type: "reference",
    published_at: "2024-10-10",
    retrieved_at: RETRIEVED_AT,
    excerpt:
      "Treat AI-generated content as a draft to verify, not an authority, and keep a human accountable for decisions.",
    credibility:
      "Non-profit public-interest technology organisation; advocacy framing, corroborate specific claims.",
    provenance: "mock",
  },
];

const AI_LITERACY_CLAIMS: ResearchClaim[] = [
  {
    claim_id: "clm_what_is_ai",
    statement:
      "AI systems perform tasks that usually require human intelligence, such as recognising patterns, but they do not have understanding or consciousness.",
    concept_id: "ai:what-is-ai",
    citations: ["src_unesco_framework", "src_stanford_ai_index"],
    confidence: 0.9,
    conflicting: false,
  },
  {
    claim_id: "clm_ml_dominates",
    statement:
      "Modern AI is dominated by machine learning: systems learn statistical patterns from examples rather than following hand-written rules.",
    concept_id: "ai:what-is-ai",
    citations: ["src_google_ml_course", "src_stanford_ai_index"],
    confidence: 0.88,
    conflicting: false,
  },
  {
    claim_id: "clm_training_data",
    statement:
      "Machine-learning models learn from training data; the size, quality, and representativeness of that data shape what the model can and cannot do.",
    concept_id: "ai:training-data",
    citations: ["src_google_ml_course", "src_mit_day_of_ai"],
    confidence: 0.9,
    conflicting: false,
  },
  {
    claim_id: "clm_bias_from_data",
    statement:
      "Because models learn from historical data, they can absorb and amplify societal biases present in that data.",
    concept_id: "ai:bias-fairness",
    citations: ["src_unesco_framework", "src_mozilla_ai_literacy", "src_oecd_ai_principles"],
    confidence: 0.85,
    conflicting: false,
  },
  {
    claim_id: "clm_fairness_definitions",
    statement:
      "Fairness has several mathematical definitions that can be mutually incompatible, so whether a system is 'unbiased' is context-dependent rather than absolute.",
    concept_id: "ai:bias-fairness",
    citations: ["src_stanford_ai_index"],
    confidence: 0.68,
    conflicting: true,
    note: "Single academic source; competing fairness definitions are an active research debate.",
  },
  {
    claim_id: "clm_hallucination",
    statement:
      "Language models can produce fluent but factually incorrect statements (hallucinations) because they predict likely text rather than retrieve verified facts.",
    concept_id: "ai:limitations-hallucination",
    citations: ["src_stanford_ai_index", "src_google_ml_course"],
    confidence: 0.86,
    conflicting: false,
  },
  {
    claim_id: "clm_verify_outputs",
    statement:
      "AI outputs should be treated as drafts to verify, not authoritative answers, especially for high-stakes decisions.",
    concept_id: "ai:limitations-hallucination",
    citations: ["src_mozilla_ai_literacy"],
    confidence: 0.6,
    conflicting: false,
  },
  {
    claim_id: "clm_responsible_use",
    statement:
      "Responsible use of AI includes disclosing when AI is used, protecting personal data, and keeping a human accountable for consequential decisions.",
    concept_id: "ai:responsible-use",
    citations: ["src_oecd_ai_principles", "src_unesco_framework"],
    confidence: 0.88,
    conflicting: false,
  },
  {
    claim_id: "clm_frameworks_converge",
    statement:
      "International frameworks such as UNESCO and OECD converge on transparency, human oversight, and accountability as core principles for trustworthy AI.",
    concept_id: "ai:responsible-use",
    citations: ["src_oecd_ai_principles", "src_unesco_framework"],
    confidence: 0.9,
    conflicting: false,
  },
];

const RESET_KEY = "__atrium_firecrawl_mock__";

type MockState = { calls: number };

function getState(): MockState {
  const store = globalThis as Record<string, unknown>;
  if (!store[RESET_KEY]) {
    store[RESET_KEY] = { calls: 0 } satisfies MockState;
  }
  return store[RESET_KEY] as MockState;
}

/** Test helper: reset per-process call accounting. */
export function resetMockFirecrawl(): void {
  delete (globalThis as Record<string, unknown>)[RESET_KEY];
}

/**
 * Bound sources to `maxResults`, then keep only claims still backed by a
 * retained source (trimming dropped citations). A claim with no surviving
 * citation is dropped rather than left bare — citations are load-bearing.
 */
function boundCorpus(maxResults: number): {
  sources: ResearchSource[];
  claims: ResearchClaim[];
} {
  const sources = AI_LITERACY_SOURCES.slice(0, Math.max(1, maxResults));
  const kept = new Set(sources.map((s) => s.source_id));
  const claims = AI_LITERACY_CLAIMS.map((claim) => ({
    ...claim,
    citations: claim.citations.filter((ref) => kept.has(ref)),
  })).filter((claim) => claim.citations.length > 0);
  return { sources, claims };
}

export function createMockFirecrawlAdapter(): FirecrawlResearchAdapter {
  const info: AdapterInfo = { name: "firecrawl", mode: "mock", provider: PROVIDER };
  return {
    info: () => info,
    async research(query: FirecrawlSearchQuery): Promise<FirecrawlResearchResult> {
      getState().calls += 1;
      const normalizedTopic = query.topic
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      if (
        normalizedTopic !== "ai literacy" &&
        normalizedTopic !== "artificial intelligence literacy"
      ) {
        throw new Error(
          `The zero-credit mock fixture supports AI literacy only; configure Firecrawl to research "${query.topic}".`,
        );
      }
      const { sources, claims } = boundCorpus(query.maxResults);
      // Validate at the boundary exactly like the live adapter, so a malformed
      // fixture fails loudly here rather than downstream.
      return {
        provider: PROVIDER,
        deterministic: true,
        sources: sources.map((s) => researchSourceSchema.parse(s)),
        claims: claims.map((c) => researchClaimSchema.parse(c)),
      };
    },
  };
}
