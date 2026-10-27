import {
	type ApiErrorCode,
	apiError,
	ServiceError,
	type ServiceErrorKind,
} from "@repo/errors";
import type { Member } from "@repo/types";
import type { z } from "zod";
import { env } from "../env.ts";
import { logger } from "../lib/logger.ts";
import { requireUserOrganization, SessionError } from "./auth.ts";

type Handler<Context> = (context: Context) => Promise<Response> | Response;

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const statusByKind = {
	invalid_input: 400,
	not_found: 404,
	forbidden: 403,
	conflict: 409,
} as const satisfies Record<ServiceErrorKind, number>;

export function errorResponse(status: number, code: ApiErrorCode): Response {
	return Response.json(apiError(code), { status });
}

export function handleRequest(
	request: Request,
	handler: Handler<{ member: Member }>,
): Promise<Response> {
	return respond(request, async () =>
		handler({ member: await requireUserOrganization() }),
	);
}

export function handleJson<Body>(
	request: Request,
	options: { body: z.ZodType<Body> },
	handler: Handler<{ member: Member; body: Body }>,
): Promise<Response> {
	return respond(request, async () => {
		if (!isJson(request)) {
			return errorResponse(415, "unsupported_media_type");
		}
		const member = await requireUserOrganization();
		let json: unknown;
		try {
			json = await request.json();
		} catch {
			return errorResponse(400, "invalid_request");
		}
		const body = options.body.safeParse(json);
		if (!body.success) return errorResponse(400, "invalid_request");
		return handler({ member, body: body.data });
	});
}

async function respond(
	request: Request,
	run: () => Promise<Response>,
): Promise<Response> {
	try {
		if (mutatingMethods.has(request.method) && !hasPlatformOrigin(request)) {
			return errorResponse(403, "invalid_origin");
		}
		return await run();
	} catch (error) {
		return failure(request, error);
	}
}

function hasPlatformOrigin(request: Request): boolean {
	return (
		request.headers.get("origin") ===
		new URL(env.NEXT_PUBLIC_PLATFORM_URL).origin
	);
}

function isJson(request: Request): boolean {
	const mediaType = request.headers.get("content-type")?.split(";")[0];
	return mediaType?.trim().toLowerCase() === "application/json";
}

function failure(request: Request, error: unknown): Response {
	if (error instanceof SessionError) {
		return errorResponse(
			error.code === "unauthenticated" ? 401 : 403,
			error.code,
		);
	}
	if (error instanceof ServiceError) {
		return errorResponse(statusByKind[error.kind], error.code);
	}
	logger.error("request failed", {
		method: request.method,
		path: new URL(request.url).pathname,
		error: error instanceof Error ? (error.stack ?? error.message) : error,
	});
	return errorResponse(500, "internal_error");
}
