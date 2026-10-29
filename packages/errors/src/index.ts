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
	"invalid_owner_name",
	"owner_name_too_long",
	"invalid_glyphs",
	"font_incomplete",
	"font_not_ready",
	"not_owner",
	"stale_revision",
	"file_too_large",
	"unsupported_file",
	"heic_not_supported",
	"processing_failed",
	"photo_unreadable",
	"photo_too_large",
	"no_ink_found",
	"invalid_mask",
	"invalid_drawing",
	"invalid_photo",
	"template_markers_not_found",
	"font_unreadable",
	"font_timeout",
	"font_missing_glyphs",
	"letter_overflow",
	"letter_placement",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export function isApiErrorCode(value: string): value is ApiErrorCode {
	return (apiErrorCodes as readonly string[]).includes(value);
}

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
	invalid_owner_name: "Add a name for the seal.",
	owner_name_too_long: "That name is too long, so keep it to 40 characters.",
	invalid_glyphs: "That letter could not be saved, so draw it again.",
	font_incomplete: "Some needed letters are still blank, so draw them first.",
	font_not_ready: "That handwriting is not ready yet.",
	not_owner: "Only the owner can do that.",
	stale_revision: "This letter changed in another tab.",
	file_too_large: "That file is too large.",
	unsupported_file: "That kind of file cannot be used here.",
	heic_not_supported:
		"HEIC photos cannot be uploaded, so choose a JPEG, PNG or WebP.",
	processing_failed: "Something went wrong on our side, so try again.",
	photo_unreadable: "That photo could not be opened, so try another one.",
	photo_too_large: "That photo has too many pixels, so try a smaller one.",
	no_ink_found:
		"No ink was found in that photo, so try a darker pen or more light.",
	invalid_mask: "That picture cannot be used as a mask.",
	invalid_drawing: "That drawing is not valid.",
	invalid_photo: "Only a photo can be lifted.",
	template_markers_not_found:
		"We could not find all four black squares. Lay the page flat and fit all four in the photo.",
	font_unreadable: "That file could not be read, so choose another one.",
	font_timeout: "That file took too long to read, so choose another one.",
	font_missing_glyphs:
		"That font is missing some of a to z, so choose one that has them all.",
	letter_overflow: "The words do not fit on the page.",
	letter_placement: "A doodle sits where the printer needs clear paper.",
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
