import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAdapters } from "@/server/adapters";
import { resetCurriculumStore } from "@/server/curriculum";
import { GET as getDraftRoute } from "../[draftId]/route";
import { POST as approveRoute } from "../[draftId]/approve/route";
import { POST as researchRoute } from "./route";

function jsonRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("SPONSOR_MODE", "");
  await resetAdapters();
  resetCurriculumStore();
});

describe("POST /api/curriculum/research", () => {
  it("returns a 201 with a cited, review-pending draft", async () => {
    const response = await researchRoute(
      jsonRequest("http://localhost/api/curriculum/research", {
        topic: "AI literacy",
        audience: "high school",
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.draft.draft_id).toBe("draft_0001");
    expect(body.draft.approval_state).toBe("pending");
    expect(body.draft.chunks.length).toBeGreaterThan(0);
    expect(body.draft.chunks.every((c: { citations: string[] }) => c.citations.length > 0)).toBe(true);
    expect(body.agent_result.human_review_required).toBe(true);
    expect(body.provider).toBe("deterministic-fixtures");
  });

  it("rejects an invalid request body with 400", async () => {
    const response = await researchRoute(
      jsonRequest("http://localhost/api/curriculum/research", { audience: "hs" }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
  });
});

describe("GET + approve routes", () => {
  it("fetches a stored draft and 404s for an unknown one", async () => {
    await researchRoute(
      jsonRequest("http://localhost/api/curriculum/research", {
        topic: "AI literacy",
        audience: "high school",
      }),
    );

    const ok = await getDraftRoute(new Request("http://localhost/api/curriculum/draft_0001"), {
      params: Promise.resolve({ draftId: "draft_0001" }),
    });
    expect(ok.status).toBe(200);

    const missing = await getDraftRoute(new Request("http://localhost/api/curriculum/nope"), {
      params: Promise.resolve({ draftId: "nope" }),
    });
    expect(missing.status).toBe(404);
  });

  it("records an educator approval decision", async () => {
    await researchRoute(
      jsonRequest("http://localhost/api/curriculum/research", {
        topic: "AI literacy",
        audience: "high school",
      }),
    );

    const approved = await approveRoute(
      jsonRequest("http://localhost/api/curriculum/draft_0001/approve", { approved_by: "Ms. Rivera" }),
      { params: Promise.resolve({ draftId: "draft_0001" }) },
    );
    expect(approved.status).toBe(200);
    const body = await approved.json();
    expect(body.draft.approval_state).toBe("approved");
    expect(body.approval.approved_by).toBe("Ms. Rivera");
  });

  it("404s when approving an unknown draft", async () => {
    const response = await approveRoute(
      jsonRequest("http://localhost/api/curriculum/ghost/approve", {}),
      { params: Promise.resolve({ draftId: "ghost" }) },
    );
    expect(response.status).toBe(404);
  });
});
