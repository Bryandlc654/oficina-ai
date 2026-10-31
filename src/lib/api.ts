import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";

export type ApiErrorBody = {
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
};

export function jsonOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function jsonError(
  message: string,
  status = 400,
  code = "BAD_REQUEST",
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { message, code, details } }, { status });
}

export async function route(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError("Validation failed", 422, "VALIDATION_ERROR", error.flatten());
    }
    if (error instanceof AppError) {
      return jsonError(error.message, error.status, error.code, error.details);
    }
    console.error("[api] unhandled error", error);
    return jsonError("Unexpected server error", 500, "INTERNAL_ERROR");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("Request body must be valid JSON", 400, "INVALID_JSON");
  }
}
