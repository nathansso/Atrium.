import type { CreateRunRequest, CreateRunResponse, RunState } from "@/contracts";
import type { GraphNeighborhood, SharedBarrierGroup } from "@/server/adapters/types";

/**
 * Thin client for the routes in docs/CONTRACTS.md. Every call is written so a
 * missing backend (404 from the Next.js catch-all, or a network failure)
 * surfaces as `null` rather than an exception — the app then falls back to mock
 * replay instead of showing an error screen mid-demo.
 */

export class ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiUnavailableError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 404 || response.status === 405 || response.status === 501) {
    throw new ApiUnavailableError(`${path} is not implemented yet`);
  }
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function createRun(body: CreateRunRequest): Promise<CreateRunResponse> {
  return request<CreateRunResponse>("/api/runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getRun(runId: string): Promise<RunState> {
  const response = await request<{ run_id: string; state: RunState }>(
    `/api/runs/${encodeURIComponent(runId)}`,
  );
  return response.state;
}

export type GraphResponse = GraphNeighborhood & {
  run_id: string;
  shared_barriers: SharedBarrierGroup[];
  cypher: string;
};

export async function getGraph(runId: string, nodeId?: string): Promise<GraphResponse> {
  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : "";
  return request<GraphResponse>(`/api/runs/${encodeURIComponent(runId)}/graph${query}`);
}

export type EvidenceGraphResponse = GraphNeighborhood & { run_id: string; provider: string };

export async function getCurriculumEvidence(runId: string): Promise<EvidenceGraphResponse> {
  return request<EvidenceGraphResponse>(`/api/runs/${encodeURIComponent(runId)}/evidence`);
}

export type LessonProgress = {
  run_id: string;
  current: { chunk_id: string; title: string; position: number; assignment_id: string; run_id: string };
  next: { chunk_id: string; title: string; position: number; assignment_id: string; run_id: string } | null;
  total_lessons: number;
  can_advance: boolean;
};

export async function getLessonProgress(runId: string): Promise<LessonProgress> {
  return request<LessonProgress>(`/api/runs/${encodeURIComponent(runId)}/next-lesson`);
}

export async function simulateSubmissions(runId: string): Promise<void> {
  await request<unknown>(
    `/api/runs/${encodeURIComponent(runId)}/simulate-submissions`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function approvePlan(runId: string, reviewId?: string): Promise<void> {
  await request<unknown>(`/api/runs/${encodeURIComponent(runId)}/approve-plan`, {
    method: "POST",
    body: JSON.stringify(reviewId ? { review_id: reviewId } : {}),
  });
}

/**
 * True when `POST /api/runs` exists. Used once at startup to pick live vs mock
 * without making the user choose.
 */
export async function backendAvailable(): Promise<boolean> {
  if (typeof fetch !== "function") return false;
  try {
    const response = await fetch("/api/runs", { method: "OPTIONS" });
    if (response.status === 404) return false;
    return response.status < 500;
  } catch {
    return false;
  }
}
