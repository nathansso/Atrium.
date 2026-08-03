import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Error body shape shared by every route this branch owns. */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function apiOk<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status });
}

/** Maps a thrown value to the shared error body. */
export function toApiError(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) {
    return apiError(
      "invalid_request",
      "Request body failed contract validation.",
      400,
      error.flatten(),
    );
  }
  if (error instanceof Error && error.name === "AssignmentNotFoundError") {
    return apiError("assignment_not_found", error.message, 404);
  }
  if (error instanceof Error && error.name === "AssignmentInputError") {
    return apiError("invalid_assignment_input", error.message, 400);
  }
  const message =
    error instanceof Error ? error.message : "Unexpected server error.";
  return apiError("internal_error", message, 500);
}

/** Parses a JSON body, tolerating an empty body as `{}`. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.trim() === "") return {};
  return JSON.parse(raw) as unknown;
}
