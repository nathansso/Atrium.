/**
 * Live Firecrawl adapter — source-grounded web research via Firecrawl search.
 *
 * A self-contained HTTP client (no vendor SDK): bounded results, an
 * AbortController timeout, a short retry loop on 429/5xx/network, and zod
 * validation at the boundary.
 *
 * Firecrawl is a retrieval provider — its `/search` returns ranked web results
 * (url/title/description), not an answer engine's structured claims. So the
 * live path grounds one claim per result under a single topic-derived concept:
 * a shallow-but-cited draft. Richer multi-concept claim extraction (Firecrawl
 * `/extract` with a schema, or a RocketRide LLM pass) is a deliberate follow-up;
 * the deterministic mock carries the full multi-concept fixture for demos.
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
      const limit = Math.max(1, Math.min(query.maxResults, config.firecrawlMaxResults));
      const searchQuery = `${query.topic} — teaching ${query.audience}${
        query.teachingIntent ? ` (${query.teachingIntent})` : ""
      }`;

      const json = await postSearch(
        { query: searchQuery, limit },
        config.firecrawlApiKey,
        config.firecrawlBaseUrl,
      );

      const results = extractResults(json).slice(0, limit);
      const retrievedAt = new Date().toISOString();
      const concept = topicSlug(query.topic);

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
            concept_id: concept,
            citations: [sourceId],
            confidence: 0.5,
            conflicting: false,
          }),
        );
      });

      return { provider: PROVIDER, deterministic: false, sources, claims };
    },
  };
}

/** No persistent client to tear down, but present so resetAdapters() can call it. */
export async function closeLiveFirecrawl(): Promise<void> {
  // stateless fetch client — nothing to close.
}
