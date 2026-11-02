import { type ApiErrorCode, errorMessages, isApiErrorCode } from "@repo/errors";
import type { FontSourceKind } from "@repo/types";

export type FontAction = "photograph" | "choose-file" | "retry" | "draw";

export type FontFailure = { message: string; action: FontAction };

export type UploadKind = "photo" | "font-file";

export const CREATE_FAILED =
	"That handwriting could not be started, so try again.";

export const LETTER_FAILED = "That letter could not be started, so try again.";

const SOURCE_CODES: Record<FontSourceKind, readonly ApiErrorCode[]> = {
	drawn: ["font_incomplete"],
	"template-photo": [
		"template_markers_not_found",
		"no_ink_found",
		"photo_unreadable",
		"photo_too_large",
		"heic_not_supported",
	],
	upload: ["font_unreadable", "font_timeout", "font_missing_glyphs"],
};

const FIX: Record<FontSourceKind, FontAction> = {
	drawn: "draw",
	"template-photo": "photograph",
	upload: "choose-file",
};

const WRONG_FILE: Record<UploadKind, string> = {
	photo: "That is not a JPEG, PNG or WebP photo, so choose another one.",
	"font-file": "That is not a .ttf or .otf file, so choose another one.",
};

const NOT_SENT: Record<UploadKind, string> = {
	photo: "That photo could not be sent, so try again.",
	"font-file": "That file could not be sent, so try again.",
};

function codeOf(value: string | null | undefined): ApiErrorCode | null {
	return value && isApiErrorCode(value) && value !== "internal_error"
		? value
		: null;
}

export function failureOf(
	source: FontSourceKind,
	error: string | null,
): FontFailure {
	const code = codeOf(error);
	if (code && SOURCE_CODES[source].includes(code)) {
		return { message: errorMessages[code], action: FIX[source] };
	}
	return { message: errorMessages.processing_failed, action: "retry" };
}

export function incompleteActionOf(source: FontSourceKind): FontAction {
	return FIX[source];
}

export function uploadMessage(
	kind: UploadKind,
	error: string | null | undefined,
): string {
	const code = codeOf(error);
	if (code === "unsupported_file") return WRONG_FILE[kind];
	return code ? errorMessages[code] : NOT_SENT[kind];
}

export function createMessage(error: string | null | undefined): string {
	const code = codeOf(error);
	return code === "invalid_owner_name" || code === "owner_name_too_long"
		? errorMessages[code]
		: CREATE_FAILED;
}

export function buildMessage(error: string | null | undefined): string {
	const code = codeOf(error);
	return code ? errorMessages[code] : errorMessages.processing_failed;
}
