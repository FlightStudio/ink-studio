import type { FontOption, LetterContent } from "@repo/types";
import { expect, it } from "vitest";
import { missingLetterHref } from "./seal-link.ts";

const letterId = "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a99";
const drawnId = "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a10";
const paperId = "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a11";

function font(id: string, source: FontOption["source"]): FontOption {
	return {
		id,
		ownerName: "Karla",
		source,
		status: "ready",
		assetId: "asset",
		pendingAssetId: null,
		error: null,
		chars: "abcdefghijklmnopqrstuvwxyz'",
		missingRequired: 0,
	};
}

function letter(runs: { text: string; fontId?: string }[]): LetterContent {
	return {
		schemaVersion: 1,
		format: "thanksio:letter-windowless",
		defaults: {
			font: { kind: "stock", id: "caveat" },
			sizePt: 20,
			color: "ink-blue",
		},
		doc: {
			type: "doc",
			attrs: { elements: [], minSides: 1, frontImageAssetId: null },
			content: [
				{
					type: "paragraph",
					attrs: { align: "left" },
					content: runs.map((run) => ({
						type: "text" as const,
						text: run.text,
						marks: run.fontId
							? [
									{
										type: "ink" as const,
										attrs: {
											font: { kind: "own" as const, fontId: run.fontId },
											sizePt: null,
											color: null,
										},
									},
								]
							: undefined,
					})),
				},
			],
		},
	};
}

const fonts = [font(drawnId, "drawn"), font(paperId, "template-photo")];

it("a capital the drawn font lacks links to its cell on the draw page", () => {
	expect(
		missingLetterHref(
			letter([{ text: "dear Sam", fontId: drawnId }]),
			fonts,
			letterId,
		),
	).toBe(`/fonts/${drawnId}/draw?from=${letterId}&glyph=S`);
});

it("a curly quote asks for the straight quote it is drawn as", () => {
	expect(
		missingLetterHref(
			letter([{ text: "it’s", fontId: drawnId }]),
			fonts,
			letterId,
		),
	).toBeNull();
	const plain = [{ ...font(drawnId, "drawn"), chars: "its" }];
	expect(
		missingLetterHref(
			letter([{ text: "it’s", fontId: drawnId }]),
			plain,
			letterId,
		),
	).toBe(
		`/fonts/${drawnId}/draw?from=${letterId}&glyph=${encodeURIComponent("'")}`,
	);
});

it("text in a stock font or a paper font has no letters to draw", () => {
	expect(
		missingLetterHref(
			letter([{ text: "Dear Sam" }, { text: "Dear Sam", fontId: paperId }]),
			fonts,
			letterId,
		),
	).toBeNull();
});

it("a character no cell can hold is skipped", () => {
	expect(
		missingLetterHref(
			letter([{ text: "café", fontId: drawnId }]),
			fonts,
			letterId,
		),
	).toBeNull();
});

it("someone else's font has no draw link", () => {
	expect(
		missingLetterHref(letter([{ text: "Sam", fontId: drawnId }]), [], letterId),
	).toBeNull();
});
