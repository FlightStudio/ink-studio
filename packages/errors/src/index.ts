export const apiErrorCodes = [
	"invalid_request",
	"unauthenticated",
	"forbidden",
	"not_found",
	"invalid_origin",
	"unsupported_media_type",
	"internal_error",
	"no_organization",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const errorMessages = {
	invalid_request: "The request is not valid.",
	unauthenticated: "Sign in is required.",
	forbidden: "You cannot do that.",
	not_found: "That was not found.",
	invalid_origin: "The origin is not allowed.",
	unsupported_media_type: "That file type is not supported.",
	internal_error: "Something went wrong.",
	no_organization: "You are not in an organization.",
} as const satisfies Record<ApiErrorCode, string>;

export type ApiErrorBody = {
	code: ApiErrorCode;
	message: string;
};

export function apiError(code: ApiErrorCode): ApiErrorBody {
	return { code, message: errorMessages[code] };
}
