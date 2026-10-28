import type { LetterContent, PageFormatId, PlacedElement } from "@repo/types";
import { INK_COLORS, PAGE_SPECS } from "@repo/types";
import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
	LETTER_LIMITS,
	letterExtensions,
	parseLetterContent,
} from "./index.ts";

const ownFontId = "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a10";
const frontImageAssetId = "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a11";

function element(index: number): PlacedElement {
	const suffix = index.toString(16).padStart(4, "0");
	return {
		id: `0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c${suffix}`,
		kind: "drawing",
		drawingId: `0192e4a0-7b1c-7cc3-8a5e-3f1d2b4c${suffix}`,
		side: 1,
		xIn: 0.5,
		yIn: 1.25,
		widthIn: 2,
		heightIn: 1.5,
		rotationDeg: -12.5,
		tint: "sepia",
		wrap: false,
	};
}

const canonical: LetterContent = {
	schemaVersion: 1,
	format: "thanksio:postcard-6x9",
	defaults: {
		font: { kind: "stock", id: "patrick-hand" },
		sizePt: 24,
		color: "forest",
	},
	doc: {
		type: "doc",
		attrs: {
			elements: [element(1), { ...element(2), wrap: true }],
			minSides: 2,
			frontImageAssetId,
		},
		content: [
			{
				type: "paragraph",
				attrs: { align: "left" },
				content: [
					{ type: "text", text: "Dear Alex," },
					{
						type: "hardBreak",
						marks: [
							{
								type: "ink",
								attrs: { font: null, sizePt: 30, color: null },
							},
						],
					},
					{
						type: "text",
						text: "in my own hand",
						marks: [
							{
								type: "ink",
								attrs: {
									font: { kind: "own", fontId: ownFontId },
									sizePt: 16,
									color: "oxblood",
								},
							},
						],
					},
				],
			},
			{ type: "paragraph", attrs: { align: "center" } },
			{
				type: "paragraph",
				attrs: { align: "right" },
				content: [
					{
						type: "text",
						text: "Love, Sam",
						marks: [
							{
								type: "ink",
								attrs: {
									font: { kind: "stock", id: "homemade-apple" },
									sizePt: null,
									color: "midnight",
								},
							},
						],
					},
				],
			},
		],
	},
};

function copy(): LetterContent {
	return structuredClone(canonical);
}

function letterOf(format: PageFormatId): LetterContent {
	const content = copy();
	content.format = format;
	content.doc.attrs.minSides = 1;
	content.doc.attrs.frontImageAssetId = null;
	return content;
}

function inkAttrs(content: unknown): Record<string, unknown> {
	const doc = (content as LetterContent).doc;
	const block = doc.content[0];
	if (block?.type !== "paragraph") {
		throw new Error("the fixture lost its ink mark");
	}
	const node = block.content?.[2];
	const attrs = node?.marks?.[0]?.attrs;
	if (!attrs) throw new Error("the fixture lost its ink mark");
	return attrs;
}

function withText(text: string): LetterContent {
	const content = letterOf("thanksio:letter-windowless");
	content.doc.content = [
		{
			type: "paragraph",
			attrs: { align: "left" },
			content: [{ type: "text", text }],
		},
	];
	return content;
}

describe("parseLetterContent", () => {
	it("a canonical letter parses to itself", () => {
		expect(parseLetterContent(copy())).toEqual(canonical);
	});

	it("an ink colour outside the catalogue is refused", () => {
		const content: unknown = copy();
		inkAttrs(content).color = "red;background:url(x)";
		expect(() => parseLetterContent(content)).toThrow();
	});

	it("an align outside left, center and right is refused", () => {
		const content = copy();
		const paragraph = content.doc.content[1] as { attrs: { align: string } };
		paragraph.attrs.align = "justify";
		expect(() => parseLetterContent(content)).toThrow();
	});

	it("a size outside the catalogue is refused", () => {
		const content: unknown = copy();
		inkAttrs(content).sizePt = 19;
		expect(() => parseLetterContent(content)).toThrow();
	});

	it("a stock font outside the catalogue is refused", () => {
		const content: unknown = copy();
		inkAttrs(content).font = { kind: "stock", id: "comic-sans" };
		expect(() => parseLetterContent(content)).toThrow();
	});

	it("a node the schema does not have is refused", () => {
		const content = copy();
		(content.doc.content as unknown[]).push({ type: "image" });
		expect(() => parseLetterContent(content)).toThrow();
	});

	it("a bold mark is refused", () => {
		const content = copy();
		const block = content.doc.content[0];
		if (block?.type !== "paragraph") {
			throw new Error("the fixture lost its text");
		}
		const text = block.content?.[0] as { marks?: unknown[] };
		text.marks = [{ type: "bold" }];
		expect(() => parseLetterContent(content)).toThrow();
	});

	it("an HTML string instead of a document is refused", () => {
		const content: Record<string, unknown> = { ...copy() };
		content.doc = "<p>Dear Alex</p>";
		expect(() => parseLetterContent(content)).toThrow();
		expect(() => parseLetterContent("<p>Dear Alex</p>")).toThrow();
	});

	it("a future schema version is refused", () => {
		const content: Record<string, unknown> = { ...copy() };
		content.schemaVersion = 2;
		expect(() => parseLetterContent(content)).toThrow();
	});

	it("an element with no width is refused", () => {
		const missing = copy();
		delete (missing.doc.attrs.elements[0] as Partial<PlacedElement>).widthIn;
		expect(() => parseLetterContent(missing)).toThrow();
		const zero = copy();
		zero.doc.attrs.elements[0] = { ...element(1), widthIn: 0 };
		expect(() => parseLetterContent(zero)).toThrow();
	});

	it("a front image on a product whose front is for writing is refused", () => {
		const letter = letterOf("thanksio:letter-windowless");
		letter.doc.attrs.frontImageAssetId = frontImageAssetId;
		expect(PAGE_SPECS[letter.format].front).toBe("writing");
		expect(() => parseLetterContent(letter)).toThrow();
		const postcard = letterOf("thanksio:postcard-6x9");
		postcard.doc.attrs.frontImageAssetId = frontImageAssetId;
		expect(parseLetterContent(postcard).doc.attrs.frontImageAssetId).toBe(
			frontImageAssetId,
		);
	});

	it("an id that is not a UUID is refused", () => {
		const font: unknown = copy();
		inkAttrs(font).font = { kind: "own", fontId: 'x" } body { color: red' };
		expect(() => parseLetterContent(font)).toThrow();
		const id = copy();
		id.doc.attrs.elements[0] = { ...element(1), id: "element-1" };
		expect(() => parseLetterContent(id)).toThrow();
		const drawingId = copy();
		drawingId.doc.attrs.elements[0] = { ...element(1), drawingId: "drawing-1" };
		expect(() => parseLetterContent(drawingId)).toThrow();
		const frontImage = copy();
		frontImage.doc.attrs.frontImageAssetId = "front";
		expect(() => parseLetterContent(frontImage)).toThrow();
	});

	it("more elements or characters than the limits are refused", () => {
		const elements = Array.from(
			{ length: LETTER_LIMITS.elements + 1 },
			(_, index) => element(index),
		);
		const atElementLimit = copy();
		atElementLimit.doc.attrs.elements = elements.slice(1);
		expect(parseLetterContent(atElementLimit).doc.attrs.elements).toHaveLength(
			LETTER_LIMITS.elements,
		);
		const pastElementLimit = copy();
		pastElementLimit.doc.attrs.elements = elements;
		expect(() => parseLetterContent(pastElementLimit)).toThrow();
		const atCharacterLimit = withText("a".repeat(LETTER_LIMITS.characters));
		expect(parseLetterContent(atCharacterLimit)).toEqual(atCharacterLimit);
		expect(() =>
			parseLetterContent(withText("a".repeat(LETTER_LIMITS.characters + 1))),
		).toThrow();
	});

	it("a missing minSides reads as 1, a missing wrap as false, and a missing front image as null", () => {
		const content = copy();
		const attrs: Partial<LetterContent["doc"]["attrs"]> = content.doc.attrs;
		delete attrs.minSides;
		delete attrs.frontImageAssetId;
		delete (content.doc.attrs.elements[1] as Partial<PlacedElement>).wrap;
		const parsed = parseLetterContent(content);
		expect(parsed.doc.attrs.minSides).toBe(1);
		expect(parsed.doc.attrs.frontImageAssetId).toBeNull();
		expect(parsed.doc.attrs.elements[1]?.wrap).toBe(false);
	});

	it("a signature in the middle is refused", () => {
		const content = copy();
		const paragraph = content.doc.content[0];
		if (!paragraph) throw new Error("the letter has no paragraph");
		content.doc.content = [
			paragraph,
			{
				type: "signature",
				attrs: {
					drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a20",
					widthIn: 2.25,
					align: "right",
					color: "ink-blue",
				},
			},
			paragraph,
		];
		expect(() => parseLetterContent(content)).toThrow();
	});

	it("a field the catalogue does not have is refused", () => {
		const content = copy();
		const json = {
			...content,
			doc: {
				...content.doc,
				content: [
					{
						type: "paragraph",
						attrs: { align: "left" },
						content: [{ type: "mergeField", attrs: { field: "nickname" } }],
					},
				],
			},
		};
		expect(() => parseLetterContent(json)).toThrow();
		const chip = copy();
		chip.doc.content = [
			{
				type: "paragraph",
				attrs: { align: "left" },
				content: [{ type: "mergeField", attrs: { field: "first_name" } }],
			},
		];
		const stored = parseLetterContent(chip).doc.content[0];
		if (stored?.type !== "paragraph") {
			throw new Error("the chip was not stored");
		}
		expect(stored.content?.[0]).toMatchObject({
			type: "mergeField",
			attrs: { field: "first_name" },
		});
	});

	it("minSides above the spec's maxPages is refused", () => {
		for (const format of Object.keys(PAGE_SPECS) as PageFormatId[]) {
			const { maxPages } = PAGE_SPECS[format];
			const atLimit = letterOf(format);
			atLimit.doc.attrs.minSides = maxPages;
			expect(parseLetterContent(atLimit).doc.attrs.minSides).toBe(maxPages);
			const pastLimit = letterOf(format);
			pastLimit.doc.attrs.minSides = maxPages + 1;
			expect(() => parseLetterContent(pastLimit)).toThrow();
		}
	});
});

describe("letterExtensions", () => {
	it("ink and alignment reach CSS only through the catalogues", () => {
		const schema = getSchema(letterExtensions);
		const toDOM = (attrs: Record<string, unknown>) =>
			JSON.stringify(
				schema.marks.ink?.spec.toDOM?.(schema.mark("ink", attrs), true),
			);
		expect(
			toDOM({
				font: { kind: "own", fontId: ownFontId },
				sizePt: 16,
				color: "oxblood",
			}),
		).toContain(
			`font-family: \\"own-${ownFontId}\\", \\"stock-caveat\\"; font-size: 16pt; color: ${INK_COLORS.oxblood.css}`,
		);
		expect(toDOM({ font: { kind: "stock", id: "patrick-hand" } })).toContain(
			'font-family: \\"stock-patrick-hand\\"',
		);
		const injected = toDOM({
			font: { kind: "own", fontId: 'x" } body { color: red' },
			sizePt: 19,
			color: "red;background:url(x)",
		});
		expect(injected).not.toMatch(/red|url|font|19/);
		const paragraph = schema.nodes.paragraph;
		expect(
			JSON.stringify(
				paragraph?.spec.toDOM?.(paragraph.create({ align: "center" })),
			),
		).toContain("text-align: center");
		expect(
			JSON.stringify(
				paragraph?.spec.toDOM?.(paragraph.create({ align: "x;color:red" })),
			),
		).not.toContain("red");
	});
});
