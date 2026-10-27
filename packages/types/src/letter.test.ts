import { describe, expect, it } from "vitest";
import type {
	FontRef,
	InlineNode,
	LetterContent,
	PlacedElement,
	SealFont,
} from "./letter.ts";
import { humanSeal } from "./letter.ts";

const karla: FontRef = { kind: "own", fontId: "font-k" };
const sam: FontRef = { kind: "own", fontId: "font-s" };
const caveat: FontRef = { kind: "stock", id: "caveat" };

const ownFonts = new Map<string, SealFont>([
	[
		"font-k",
		{
			ownerName: "Karla",
			chars: new Set([..."abcdefghijklmnopqrstuvwxyz", "D"]),
		},
	],
	[
		"font-s",
		{
			ownerName: "Sam",
			chars: new Set("abcdefghijklmnopqrstuvwxyz"),
		},
	],
]);

const doodle: PlacedElement = {
	id: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a01",
	kind: "drawing",
	drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a02",
	side: 0,
	xIn: 1,
	yIn: 1,
	widthIn: 2,
	heightIn: 1,
	rotationDeg: 0,
	tint: "ink-blue",
	wrap: false,
};

function run(text: string, font: FontRef | null): InlineNode {
	return {
		type: "text",
		text,
		marks: [{ type: "ink", attrs: { font, sizePt: null, color: null } }],
	};
}

function letter(
	inline: InlineNode[],
	options: { defaultFont?: FontRef; elements?: PlacedElement[] } = {},
): LetterContent {
	return {
		schemaVersion: 1,
		format: "thanksio:letter-windowless",
		defaults: {
			font: options.defaultFont ?? caveat,
			sizePt: 20,
			color: "ink-blue",
		},
		doc: {
			type: "doc",
			attrs: {
				elements: options.elements ?? [],
				minSides: 1,
				frontImageAssetId: null,
			},
			content: [
				{ type: "paragraph", attrs: { align: "left" }, content: inline },
			],
		},
	};
}

describe("humanSeal", () => {
	it("a letter all in one person's handwriting", () => {
		const content = letter([run("dear sam", karla)]);
		expect(humanSeal(content, ownFonts)).toBe(
			"Written in Karla's own handwriting",
		);
	});

	it("a letter partly in it", () => {
		const content = letter([run("abc", karla), run("defg hij", caveat)]);
		expect(humanSeal(content, ownFonts)).toBe(
			"Partly written in Karla's own handwriting",
		);
	});

	it("spaces do not make a letter partial", () => {
		const content = letter([
			run("hello", karla),
			run("   ", caveat),
			{ type: "hardBreak" },
			run("there friend", karla),
		]);
		expect(humanSeal(content, ownFonts)).toBe(
			"Written in Karla's own handwriting",
		);
	});

	it("characters the font does not have do not count as handwriting", () => {
		const content = letter([run("Dear Alex", karla)]);
		expect(humanSeal(content, ownFonts)).toBe(
			"Partly written in Karla's own handwriting",
		);
	});

	it("two people's handwriting", () => {
		const content = letter([run("dear ", karla), run("alex", sam)]);
		expect(humanSeal(content, ownFonts)).toBe(
			"Written in Karla's and Sam's own handwriting",
		);
	});

	it("the default style counts when a run sets no font", () => {
		const content = letter(
			[run("dear ", null), { type: "text", text: "alex" }],
			{ defaultFont: karla },
		);
		expect(humanSeal(content, ownFonts)).toBe(
			"Written in Karla's own handwriting",
		);
	});

	it("doodles alone", () => {
		const content = letter([run("Dear Alex", caveat)], { elements: [doodle] });
		expect(humanSeal(content, ownFonts)).toBe("Doodles hand-drawn");
	});

	it("handwriting and doodles", () => {
		const content = letter([run("dear sam", karla)], { elements: [doodle] });
		expect(humanSeal(content, ownFonts)).toBe(
			"Written in Karla's own handwriting · doodles hand-drawn",
		);
	});

	it("nothing human gives no seal", () => {
		const content = letter([run("Dear Alex", caveat)]);
		expect(humanSeal(content, ownFonts)).toBeNull();
	});
});
