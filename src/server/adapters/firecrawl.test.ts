import { beforeEach, describe, expect, it, vi } from "vitest";
import { researchClaimSchema, researchSourceSchema } from "@/contracts";
import { getAdapterStatus, getAdapters, resetAdapters } from "./index";
import { createMockFirecrawlAdapter } from "./firecrawlMock";
import { conceptForFirecrawlResult, firecrawlSearchQueries } from "./firecrawlLive";

const query = { topic: "AI literacy", audience: "high school", maxResults: 8 };

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("SPONSOR_MODE", "");
  await resetAdapters();
});

describe("firecrawl mock adapter", () => {
  it("is deterministic: identical queries return identical results", async () => {
    const adapter = createMockFirecrawlAdapter();
    const first = await adapter.research(query);
    const second = await adapter.research(query);
    expect(first).toEqual(second);
    expect(first.deterministic).toBe(true);
    expect(first.provider).toBe("deterministic-fixtures");
  });

  it("returns schema-valid sources and non-bare claims", async () => {
    const { sources, claims } = await createMockFirecrawlAdapter().research(query);
    expect(sources.length).toBeGreaterThan(0);
    expect(claims.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(() => researchSourceSchema.parse(source)).not.toThrow();
    }
    for (const claim of claims) {
      expect(() => researchClaimSchema.parse(claim)).not.toThrow();
      // Every claim carries at least one citation — the load-bearing invariant.
      expect(claim.citations.length).toBeGreaterThan(0);
    }
  });

  it("bounds sources to maxResults and never leaves a claim uncited", async () => {
    const { sources, claims } = await createMockFirecrawlAdapter().research({
      ...query,
      maxResults: 2,
    });
    expect(sources).toHaveLength(2);
    const kept = new Set(sources.map((source) => source.source_id));
    for (const claim of claims) {
      expect(claim.citations.length).toBeGreaterThan(0);
      expect(claim.citations.every((ref) => kept.has(ref))).toBe(true);
    }
  });

  it("does not relabel the AI-literacy and Machine Learning fixture as another topic", async () => {
    await expect(
      createMockFirecrawlAdapter().research({
        ...query,
        topic: "photosynthesis",
      }),
    ).rejects.toThrow("supports AI literacy and machine learning only");
  });
});

describe("firecrawl adapter registration", () => {
  it("is registered and defaults to mock like the other providers", () => {
    expect(getAdapters().firecrawl.info()).toMatchObject({
      name: "firecrawl",
      mode: "mock",
    });
    const status = getAdapterStatus().find((entry) => entry.name === "firecrawl");
    expect(status?.effective_mode).toBe("mock");
  });

  it("is live-capable: goes live when SPONSOR_MODE=live and a key is present", async () => {
    vi.stubEnv("SPONSOR_MODE", "live");
    vi.stubEnv("FIRECRAWL_API_KEY", "lk_test");
    await resetAdapters();

    expect(getAdapters().firecrawl.info()).toMatchObject({
      mode: "live",
      provider: "firecrawl-search",
    });
    const status = getAdapterStatus().find((entry) => entry.name === "firecrawl");
    expect(status).toMatchObject({ keys_present: true, effective_mode: "live" });
  });

  it("stays mock in live mode when the key is missing", async () => {
    vi.stubEnv("SPONSOR_MODE", "live");
    await resetAdapters();
    expect(getAdapters().firecrawl.info().mode).toBe("mock");
  });
});

describe("live Firecrawl lesson classification", () => {
  it("creates a distinct, cited lesson concept for evidence-supported ML themes", () => {
    expect(conceptForFirecrawlResult("machine learning", {
      title: "Supervised learning with labelled data",
    })).toBe("machine-learning:supervised-learning");
    expect(conceptForFirecrawlResult("machine learning", {
      description: "Unsupervised learning finds clusters in unlabeled data.",
    })).toBe("machine-learning:unsupervised-learning");
    expect(conceptForFirecrawlResult("machine learning", {
      description: "Bias and fairness are central to responsible machine learning.",
    })).toBe("machine-learning:responsible-use");
  });

  it("keeps a generic result in an honest foundations lesson", () => {
    expect(conceptForFirecrawlResult("machine learning", {
      title: "An introduction to machine learning",
    })).toBe("machine-learning:foundations");
  });

  it("diversifies normal research across teachable evidence facets", () => {
    expect(firecrawlSearchQueries({
      topic: "machine learning",
      audience: "high school",
      teachingIntent: "Use machine learning responsibly.",
      maxResults: 8,
    })).toEqual([
      "machine learning foundations - teaching high school (Use machine learning responsibly.)",
      "machine learning examples and applications - teaching high school (Use machine learning responsibly.)",
      "machine learning responsible use limitations - teaching high school (Use machine learning responsibly.)",
    ]);
  });
});
