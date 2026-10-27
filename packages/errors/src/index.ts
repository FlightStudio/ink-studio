export const apiErrorCodes = [
	"invalid_request",
	"unauthenticated",
	"forbidden",
	"not_found",
	"invalid_origin",
	"unsupported_media_type",
	"internal_error",
	"no_organization",
	"invalid_letter",
	"invalid_title",
	"stale_revision",
	"file_too_large",
	"unsupported_file",
	"heic_not_supported",
	"processing_failed",
	"photo_unreadable",
	"photo_too_large",
	"no_ink_found",
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
	invalid_letter: "The letter could not be read.",
	invalid_title: "A title needs 1 to 120 characters and no control characters.",
	stale_revision: "This letter changed in another tab.",
	file_too_large: "That file is too large.",
	unsupported_file: "That kind of file cannot be used here.",
	heic_not_supported:
		"HEIC photos cannot be uploaded, so choose a JPEG, PNG or WebP.",
	processing_failed: "That file could not be made, so try again.",
	photo_unreadable: "That photo could not be opened, so try another one.",
	photo_too_large: "That photo has too many pixels, so try a smaller one.",
	no_ink_found: "No ink was found in that photo.",
} as const satisfies Record<ApiErrorCode, string>;

export type ApiErrorBody = {
	code: ApiErrorCode;
	message: string;
};

export function apiError(code: ApiErrorCode): ApiErrorBody {
	return { code, message: errorMessages[code] };
}

export const serviceErrorKinds = [
	"invalid_input",
	"not_found",
	"forbidden",
	"conflict",
] as const;

export type ServiceErrorKind = (typeof serviceErrorKinds)[number];

export class ServiceError extends Error {
	readonly kind: ServiceErrorKind;
	readonly code: ApiErrorCode;

	constructor(kind: ServiceErrorKind, code: ApiErrorCode) {
		super(errorMessages[code]);
		this.name = "ServiceError";
		this.kind = kind;
		this.code = code;
	}
}
