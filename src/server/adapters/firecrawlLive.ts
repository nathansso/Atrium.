/**
 * Live Firecrawl adapter — source-grounded web research via Firecrawl search.
 *
 * A self-contained HTTP client (no vendor SDK): bounded results, an
 * AbortController timeout, a short retry loop on 429/5xx/network, and zod
 * validation at the boundary.
 *
 * Firecrawl is a retrieval provider — its `/search` returns ranked web results
 * (url/title/description), not an answer engine's structured claims. So the
 * live path grounds one claim per result and assigns it to an evidence-matched
 * lesson concept.  The mapping is deliberately deterministic: it only groups
 * a result when terminology appears in that result, so it never invents an
 * unsupported topic.  This produces a real ordered lesson sequence from a
 * normal search while preserving each source-level citation. A richer
 * extraction pass can replace this classification later without changing the
 * curriculum contract.
 *
 * Runtime failures throw so the curriculum service can fall back to the mock,
 * degrading a draft rather than failing the request.
 */
import {
  researchClaimSchema,
  researchSourceSchema,
  type CurriculumConceptId,
  type ResearchClaim,
  type ResearchSource,
} from "@/contracts";
import { getEnvConfig } from "@/server/config";
import type {
  AdapterInfo,
  FirecrawlResearchAdapter,
  FirecrawlResearchResult,
  FirecrawlSearchQuery,
} from "./types";

const PROVIDER = "firecrawl-search";
const TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

type FirecrawlResult = { url: string; title?: string; description?: string; markdown?: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `AI literacy` -> `ai-literacy`, constrained to the curriculum concept-id slug. */
function topicSlug(topic: string): CurriculumConceptId {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (slug.length > 0 ? slug : "topic") as CurriculumConceptId;
}

/**
 * Assign a retrieved result to a teachable concept only when the result itself
 * contains the matching signal. The order is intentionally pedagogical: core
 * model types precede evaluation and responsible-use discussion in a lesson
 * sequence. Generic results remain in a plainly-labelled foundation lesson.
 */
export function conceptForFirecrawlResult(
  topic: string,
  result: Pick<FirecrawlResult, "title" | "description" | "markdown">,
): CurriculumConceptId {
  const text = [result.title, result.description, result.markdown]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const prefix = topicSlug(topic);
  const suffix = (value: string) => `${prefix}:${value}` as CurriculumConceptId;

  if (/\bsupervised\b|\blabel(?:led)? data\b|\bclassification\b|\bregression\b/.test(text)) {
    return suffix("supervised-learning");
  }
  if (/\bunsupervised\b|\bunlabel(?:led)? data\b|\bclustering\b|\bdimensionality reduction\b/.test(text)) {
    return suffix("unsupervised-learning");
  }
  if (/\btraining data\b|\bdataset\b|\bdata quality\b|\bfeatures?\b/.test(text)) {
    return suffix("training-data");
  }
  if (/\bvalidation\b|\btest set\b|\bevaluation\b|\bmetrics?\b|\baccuracy\b/.test(text)) {
    return suffix("model-evaluation");
  }
  if (/\bbias\b|\bfair(?:ness)?\b|\bethics?\b|\bresponsible\b|\bprivacy\b|\bsafety\b/.test(text)) {
    return suffix("responsible-use");
  }
  if (/\bapplications?\b|\buse cases?\b|\bexamples?\b|\breal.world\b/.test(text)) {
    return suffix("applications");
  }
  return suffix("foundations");
}

/**
 * A broad web query can return near-identical explainer pages. Search the
 * instructional facets separately so a draft can form lessons from distinct,
 * cited evidence instead of splitting a single concept arbitrarily.
 */
export function firecrawlSearchQueries(query: FirecrawlSearchQuery): string[] {
  const teachingContext = `teaching ${query.audience}${
    query.teachingIntent ? ` (${query.teachingIntent})` : ""
  }`;
  if (query.maxResults < 3) return [`${query.topic} - ${teachingContext}`];
  return [
    `${query.topic} foundations - ${teachingContext}`,
    `${query.topic} examples and applications - ${teachingContext}`,
    `${query.topic} responsible use limitations - ${teachingContext}`,
  ];
}

/**
 * Firecrawl ranks results for the full facet query, so a generic "responsible
 * use" result can otherwise describe AI-in-education rather than the topic
 * the educator asked us to teach. Only title/description matches are admitted
 * to the curriculum; page markdown is deliberately excluded because a stray
 * keyword in a long page is not adequate topic evidence.
 */
export function isTopicRelevantFirecrawlResult(
  topic: string,
  result: Pick<FirecrawlResult, "title" | "description">,
): boolean {
  const normalize = (value: string) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const topicTerms = normalize(topic).split(" ").filter((term) => term.length >= 2);
  const resultText = normalize([result.title, result.description].filter(Boolean).join(" "));
  return topicTerms.length > 0 && topicTerms.every((term) => resultText.includes(term));
}

async function postSearch(
  body: unknown,
  apiKey: string,
  baseUrl: string,
): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Firecrawl responded ${response.status}`);
        await sleep(300 * attempt);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Firecrawl request failed: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.startsWith("Firecrawl request failed")) {
        throw error;
      }
      await sleep(300 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(
    `Firecrawl search failed after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`,
  );
}

/** Firecrawl returns results under `data` (v1) or `data.web` (v2); tolerate both. */
function extractResults(json: unknown): FirecrawlResult[] {
  const data = (json as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as FirecrawlResult[];
  const web = (data as { web?: unknown })?.web;
  if (Array.isArray(web)) return web as FirecrawlResult[];
  return [];
}

export function createLiveFirecrawlAdapter(): FirecrawlResearchAdapter {
  const info: AdapterInfo = { name: "firecrawl", mode: "live", provider: PROVIDER };
  return {
    info: () => info,
    async research(query: FirecrawlSearchQuery): Promise<FirecrawlResearchResult> {
      const config = getEnvConfig();
      if (!config.firecrawlApiKey) {
        throw new Error("FIRECRAWL_API_KEY is required for the live Firecrawl adapter.");
      }
      const apiKey = config.firecrawlApiKey;
      const limit = Math.max(1, Math.min(query.maxResults, config.firecrawlMaxResults));
      const searchQueries = firecrawlSearchQueries({ ...query, maxResults: limit });
      const perQueryLimit = Math.max(1, Math.ceil(limit / searchQueries.length));
      const responses = await Promise.all(searchQueries.map((searchQuery) => postSearch(
        { query: searchQuery, limit: perQueryLimit },
        apiKey,
        config.firecrawlBaseUrl,
      )));
      const uniqueUrls = new Set<string>();
      const results = responses
        .flatMap(extractResults)
        .filter((result) => {
          if (!result.url || uniqueUrls.has(result.url) || !isTopicRelevantFirecrawlResult(query.topic, result)) return false;
          uniqueUrls.add(result.url);
          return true;
        })
        .slice(0, limit);
      const retrievedAt = new Date().toISOString();
      const sources: ResearchSource[] = [];
      const claims: ResearchClaim[] = [];
      results.forEach((result, index) => {
        if (!result.url) return;
        const sourceId = `src_${index + 1}`;
        const excerpt = (result.description ?? result.markdown ?? result.title ?? "").slice(0, 400);
        let hostname = result.url;
        try {
          hostname = new URL(result.url).hostname;
        } catch {
          // keep the raw url as publisher fallback
        }
        const source = researchSourceSchema.parse({
          source_id: sourceId,
          url: result.url,
          title: result.title ?? hostname,
          publisher: hostname,
          source_type: "other",
          published_at: null,
          retrieved_at: retrievedAt,
          excerpt: excerpt.length > 0 ? excerpt : (result.title ?? hostname),
          credibility: "Web result returned by Firecrawl search; verify before classroom use.",
          provenance: "firecrawl",
        });
        sources.push(source);
        claims.push(
          researchClaimSchema.parse({
            claim_id: `clm_${index + 1}`,
            statement: source.excerpt,
            concept_id: conceptForFirecrawlResult(query.topic, result),
            citations: [sourceId],
            confidence: 0.5,
            conflicting: false,
          }),
        );
      });

      if (claims.length === 0) {
        throw new Error("Firecrawl search returned no usable cited results.");
      }

      return { provider: PROVIDER, deterministic: false, sources, claims };
    },
  };
}

/** No persistent client to tear down, but present so resetAdapters() can call it. */
export async function closeLiveFirecrawl(): Promise<void> {
  // stateless fetch client — nothing to close.
}
