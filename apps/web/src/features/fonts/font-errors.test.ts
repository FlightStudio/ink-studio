import { errorMessages } from "@repo/errors";
import { describe, expect, test } from "vitest";
import {
	buildMessage,
	CREATE_FAILED,
	createMessage,
	failureOf,
	incompleteActionOf,
	uploadMessage,
} from "./font-errors.ts";

describe("failureOf", () => {
	test("a photo the worker could not read asks for another photo", () => {
		for (const code of [
			"template_markers_not_found",
			"no_ink_found",
			"photo_unreadable",
			"photo_too_large",
		] as const) {
			expect(failureOf("template-photo", code)).toEqual({
				message: errorMessages[code],
				action: "photograph",
			});
		}
	});

	test("a file the worker could not read asks for another file", () => {
		for (const code of [
			"font_unreadable",
			"font_timeout",
			"font_missing_glyphs",
		] as const) {
			expect(failureOf("upload", code)).toEqual({
				message: errorMessages[code],
				action: "choose-file",
			});
		}
	});

	test("a drawn font missing letters goes back to drawing", () => {
		expect(failureOf("drawn", "font_incomplete")).toEqual({
			message: errorMessages.font_incomplete,
			action: "draw",
		});
	});

	test("anything else is our side and offers to try again", () => {
		const retry = {
			message: errorMessages.processing_failed,
			action: "retry",
		};
		expect(failureOf("drawn", "processing_failed")).toEqual(retry);
		expect(failureOf("template-photo", "internal_error")).toEqual(retry);
		expect(failureOf("upload", null)).toEqual(retry);
		expect(failureOf("upload", "not a code")).toEqual(retry);
		expect(failureOf("drawn", "template_markers_not_found")).toEqual(retry);
	});

	test("an incomplete font is fixed where it came from", () => {
		expect(incompleteActionOf("drawn")).toBe("draw");
		expect(incompleteActionOf("template-photo")).toBe("photograph");
		expect(incompleteActionOf("upload")).toBe("choose-file");
	});
});

describe("uploadMessage", () => {
	test("a wrong kind of file names the files that work", () => {
		expect(uploadMessage("font-file", "unsupported_file")).toBe(
			"That is not a .ttf or .otf file, so choose another one.",
		);
		expect(uploadMessage("photo", "unsupported_file")).toBe(
			"That is not a JPEG, PNG or WebP photo, so choose another one.",
		);
	});

	test("other codes read from the shared messages", () => {
		expect(uploadMessage("photo", "heic_not_supported")).toBe(
			errorMessages.heic_not_supported,
		);
		expect(uploadMessage("font-file", "file_too_large")).toBe(
			errorMessages.file_too_large,
		);
	});

	test("no code or an internal error falls back to a retry line", () => {
		expect(uploadMessage("photo", null)).toBe(
			"That photo could not be sent, so try again.",
		);
		expect(uploadMessage("font-file", "internal_error")).toBe(
			"That file could not be sent, so try again.",
		);
	});
});

describe("createMessage", () => {
	test("a name problem reads from the shared messages", () => {
		expect(createMessage("invalid_owner_name")).toBe(
			errorMessages.invalid_owner_name,
		);
		expect(createMessage("owner_name_too_long")).toBe(
			errorMessages.owner_name_too_long,
		);
	});

	test("anything else falls back to a retry line", () => {
		expect(createMessage(undefined)).toBe(CREATE_FAILED);
		expect(createMessage("internal_error")).toBe(CREATE_FAILED);
	});
});

describe("buildMessage", () => {
	test("a refused build says why, and anything else is our side", () => {
		expect(buildMessage("font_incomplete")).toBe(errorMessages.font_incomplete);
		expect(buildMessage("not_found")).toBe(errorMessages.not_found);
		expect(buildMessage(undefined)).toBe(errorMessages.processing_failed);
		expect(buildMessage("internal_error")).toBe(
			errorMessages.processing_failed,
		);
	});
});
