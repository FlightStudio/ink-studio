import type {
	DrawnGlyph,
	FontOption,
	FontSourceKind,
	FontStatus,
} from "@repo/types";
import {
	HANDWRITING_GLYPHS,
	listOf,
	missingChars,
	OWNER_NAME_MAX_CHARACTERS,
} from "@repo/types";
import type { StatusPillProps } from "@repo/ui/components/status-pill";

export const NEEDED_COUNT = HANDWRITING_GLYPHS.filter(
	(entry) => entry.required,
).length;

export const METHOD_LABELS: Record<FontSourceKind, string> = {
	drawn: "Written here",
	"template-photo": "Written on paper",
	upload: "From a font file",
};

export const BUILDING_LABELS: Record<FontSourceKind, string> = {
	drawn: "Building your font…",
	"template-photo": "Reading your page…",
	upload: "Rebuilding your file…",
};

const STATUS_LABELS: Record<Exclude<FontStatus, "drawing">, string> = {
	building: "Building",
	incomplete: "Needs attention",
	failed: "Didn't work",
	ready: "Ready",
};

const PILL_STATUS: Record<FontStatus, StatusPillProps["status"]> = {
	drawing: "pending",
	building: "running",
	incomplete: "failed",
	failed: "failed",
	ready: "done",
};

const GROUPS = [
	{ name: "capitals", test: /^[A-Z]$/ },
	{ name: "numbers", test: /^[0-9]$/ },
	{ name: "symbols", test: /^[^a-zA-Z0-9]$/ },
] as const;

const OPTIONAL = HANDWRITING_GLYPHS.filter((entry) => !entry.required).map(
	(entry) => entry.char,
);

export function drawnCount(glyphs: readonly DrawnGlyph[]): number {
	return NEEDED_COUNT - missingChars(glyphs).length;
}

export function lettersDrawn(
	glyphs: readonly DrawnGlyph[] | null,
	missingRequired: number,
): number {
	return glyphs === null ? NEEDED_COUNT - missingRequired : drawnCount(glyphs);
}

export function statusLabel(status: FontStatus, drawn: number): string {
	return status === "drawing"
		? `Drawing ${drawn}/${NEEDED_COUNT}`
		: STATUS_LABELS[status];
}

export function pillStatus(status: FontStatus): StatusPillProps["status"] {
	return PILL_STATUS[status];
}

export function blankSentence(missing: readonly string[]): string {
	return `${listOf(missing)} ${missing.length === 1 ? "was" : "were"} blank.`;
}

export function fillsIn(chars: string): string[] {
	const present = new Set(chars);
	return HANDWRITING_GLYPHS.map((entry) => entry.char).filter(
		(char) => !present.has(char),
	);
}

export function fillsInPhrase(missing: readonly string[]): string {
	const lacking = new Set(missing);
	const parts = missing.filter((char) => !OPTIONAL.includes(char));
	for (const group of GROUPS) {
		const members = OPTIONAL.filter((char) => group.test.test(char));
		const absent = members.filter((char) => lacking.has(char));
		const present = members.filter((char) => !lacking.has(char));
		if (present.length === 0) parts.push(group.name);
		else if (absent.length > present.length) {
			parts.push(`${group.name} (all but ${listOf(present)})`);
		} else parts.push(...absent);
	}
	return listOf(parts);
}

export function cleanOwnerName(raw: string | null | undefined): string {
	const name = (raw ?? "")
		.replace(/[^\P{Cc}\s]/gu, "")
		.replace(/\s+/gu, " ")
		.trim();
	return [...name].slice(0, OWNER_NAME_MAX_CHARACTERS).join("").trimEnd();
}

export function sealNameFrom(name: string | null | undefined): string {
	const first = cleanOwnerName(name).split(" ")[0] ?? "";
	return first.includes("@") ? "" : first;
}

export function defaultSealName(
	typed: string | null,
	accountName: string | null | undefined,
): string {
	return cleanOwnerName(typed) || sealNameFrom(accountName);
}

export function sealLine(ownerName: string): string {
	return `Written in ${ownerName}'s own handwriting`;
}

export const DELETE_NOTE =
	"You can't use it in new letters. Letters already written in it keep it.";

type HeadedFont = Pick<FontOption, "ownerName" | "status" | "source">;

const HEADING_ENDS: Record<FontStatus, string> = {
	drawing: "",
	building: "",
	ready: " is ready",
	failed: " didn't work",
	incomplete: " needs a few letters",
};

export function fontHeading(font: HeadedFont): string {
	return `${font.ownerName}'s handwriting${HEADING_ENDS[font.status]}`;
}

export function fontAnnouncement(font: HeadedFont): string {
	if (font.status === "drawing") return "";
	if (font.status === "building") return BUILDING_LABELS[font.source];
	return fontHeading(font);
}
