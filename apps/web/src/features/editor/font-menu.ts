import type { FontOption, FontSourceKind } from "@repo/types";
import { isUsableFont } from "@repo/types";
import { drawPage, fontHome, newFont } from "../fonts/font-links.ts";
import { NEEDED_COUNT } from "../fonts/font-status.ts";

const SOURCE_NOTES = {
	drawn: "drawn",
	"template-photo": "paper",
	upload: "file",
} as const satisfies Record<FontSourceKind, string>;

const LINK = "link:";

export type UsableFontEntry = { font: FontOption; note: string };

export type FontMenuLink = {
	value: string;
	label: string;
	note: string | null;
};

export type FontMenu = { usable: UsableFontEntry[]; links: FontMenuLink[] };

export function hrefOfMenuValue(value: string): string | null {
	return value.startsWith(LINK) ? value.slice(LINK.length) : null;
}

function drawingNote(font: FontOption): string {
	if (font.missingRequired === 0) return "Ready to build";
	return `${NEEDED_COUNT - font.missingRequired} of ${NEEDED_COUNT} · Continue`;
}

function unfinished(font: FontOption, letterId: string): FontMenuLink {
	const label = `${font.ownerName}'s handwriting`;
	if (font.status === "drawing") {
		return {
			value: `${LINK}${drawPage(font.id, letterId)}`,
			label,
			note: drawingNote(font),
		};
	}
	return {
		value: `${LINK}${fontHome(font.id, letterId)}`,
		label,
		note: font.status === "building" ? "Building…" : "Needs attention",
	};
}

export function fontMenu(
	fonts: readonly FontOption[],
	letterId: string,
): FontMenu {
	return {
		usable: fonts
			.filter((font) => isUsableFont(font))
			.map((font) => ({ font, note: SOURCE_NOTES[font.source] })),
		links: [
			...fonts
				.filter((font) => !isUsableFont(font))
				.map((font) => unfinished(font, letterId)),
			{
				value: `${LINK}${newFont(letterId)}`,
				label: "Make your handwriting",
				note: null,
			},
			{ value: `${LINK}/fonts`, label: "Manage handwriting", note: null },
		],
	};
}
