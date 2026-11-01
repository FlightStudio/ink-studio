import type { FontOption, LetterContent } from "@repo/types";
import { describe, expect, it } from "vitest";
import { fontOfferFor } from "./offered-font.ts";

const fontId = "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a10";

function font(change: Partial<FontOption> = {}): FontOption {
	return {
		id: fontId,
		ownerName: "Karla",
		source: "drawn",
		status: "ready",
		assetId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a11",
		pendingAssetId: null,
		error: null,
		chars: "abcdefghijklmnopqrstuvwxyz",
		missingRequired: 0,
		...change,
	};
}

function letter(fontRef: LetterContent["defaults"]["font"]): LetterContent {
	return {
		schemaVersion: 1,
		format: "thanksio:letter-windowless",
		defaults: { font: fontRef, sizePt: 20, color: "ink-blue" },
		doc: {
			type: "doc",
			attrs: { elements: [], minSides: 1, frontImageAssetId: null },
			content: [{ type: "paragraph", attrs: { align: "left" } }],
		},
	};
}

describe("fontOfferFor", () => {
	it("offers a usable font the letter does not use", () => {
		expect(
			fontOfferFor(
				letter({ kind: "stock", id: "caveat" }),
				[font()],
				fontId,
				true,
			),
		).toEqual(font());
	});

	it("stays quiet when the letter already defaults to that font", () => {
		expect(
			fontOfferFor(letter({ kind: "own", fontId }), [font()], fontId, true),
		).toBeNull();
	});

	it("stays quiet when the letter already writes in that font", () => {
		const content = letter({ kind: "stock", id: "caveat" });
		content.doc.content = [
			{
				type: "paragraph",
				attrs: { align: "left" },
				content: [
					{
						type: "text",
						text: "Dear Sam",
						marks: [
							{
								type: "ink",
								attrs: {
									font: { kind: "own", fontId },
									sizePt: null,
									color: null,
								},
							},
						],
					},
				],
			},
		];
		expect(fontOfferFor(content, [font()], fontId, true)).toBeNull();
	});

	it("stays quiet for a read-only letter, a missing font, or one that is not ready", () => {
		const content = letter({ kind: "stock", id: "caveat" });
		expect(fontOfferFor(content, [font()], fontId, false)).toBeNull();
		expect(fontOfferFor(content, [font()], undefined, true)).toBeNull();
		expect(fontOfferFor(content, [], fontId, true)).toBeNull();
		expect(
			fontOfferFor(content, [font({ assetId: null })], fontId, true),
		).toBeNull();
	});
});
