import { parseLetterContent } from "@repo/render/schema";
import type {
	InlineNode,
	LetterContent,
	ParagraphNode,
	PlacedElement,
	TextSizePt,
} from "@repo/types";
import { PAGE_SPECS } from "@repo/types";
import { expect, it } from "vitest";
import { letterPreview } from "./letter-preview.ts";

const letterSpec = PAGE_SPECS["thanksio:letter-windowless"];

function paragraph(...content: InlineNode[]): ParagraphNode {
	return {
		type: "paragraph",
		attrs: { align: "left" },
		...(content.length === 0 ? {} : { content }),
	};
}

function text(value: string): InlineNode {
	return { type: "text", text: value };
}

function doodle(side: number, id: string): PlacedElement {
	return {
		id,
		kind: "drawing",
		drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a31",
		side,
		xIn: 1,
		yIn: 1,
		widthIn: 1,
		heightIn: 1,
		rotationDeg: 0,
		tint: "ink-blue",
		wrap: false,
	};
}

function signature(side: number): PlacedElement {
	return {
		...doodle(side, "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a32"),
		kind: "signature",
		drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a30",
	};
}

function letter(
	blocks: LetterContent["doc"]["content"],
	options: { sizePt?: TextSizePt; elements?: PlacedElement[] } = {},
): LetterContent {
	return {
		schemaVersion: 1,
		format: "thanksio:letter-windowless",
		defaults: {
			font: { kind: "stock", id: "caveat" },
			sizePt: options.sizePt ?? 20,
			color: "ink-blue",
		},
		doc: {
			type: "doc",
			attrs: {
				elements: options.elements ?? [],
				minSides: 1,
				frontImageAssetId: null,
			},
			content: blocks,
		},
	};
}

function postcard(frontImageAssetId: string | null): LetterContent {
	return {
		schemaVersion: 1,
		format: "thanksio:postcard-6x9",
		defaults: {
			font: { kind: "stock", id: "caveat" },
			sizePt: 20,
			color: "ink-blue",
		},
		doc: {
			type: "doc",
			attrs: {
				elements: [doodle(1, "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a32")],
				minSides: 2,
				frontImageAssetId,
			},
			content: [paragraph(text("Greetings from the pier"))],
		},
	};
}

function linesOnOneSide(sizePt: number): number {
	const textHeightPt = (letterSpec.heightIn - 2 * letterSpec.marginIn) * 72;
	return textHeightPt / (sizePt * 1.5);
}

it("a letter that fits on its first side is kept whole", () => {
	const content = letter(
		[paragraph(text("Dear Sam,")), paragraph(), paragraph(text("Thank you."))],
		{ elements: [doodle(0, "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a33")] },
	);
	expect(letterPreview(content)).toEqual({ side: 0, content });
});

it("paragraphs past every line the side can hold are left out", () => {
	const blocks = Array.from({ length: 80 }, (_, index) =>
		paragraph(text(`Line ${index}`)),
	);
	const kept = letterPreview(letter(blocks)).content.doc.content;
	expect(kept.length).toBeGreaterThanOrEqual(linesOnOneSide(20));
	expect(kept.length).toBeLessThan(linesOnOneSide(20) + 2);
	expect(kept).toEqual(blocks.slice(0, kept.length));
});

it("a larger default size holds fewer lines, so fewer paragraphs are kept", () => {
	const blocks = Array.from({ length: 80 }, () => paragraph());
	const small = letterPreview(letter(blocks, { sizePt: 16 })).content;
	const large = letterPreview(letter(blocks, { sizePt: 30 })).content;
	expect(small.doc.content.length).toBeGreaterThanOrEqual(linesOnOneSide(16));
	expect(large.doc.content.length).toBeGreaterThanOrEqual(linesOnOneSide(30));
	expect(large.doc.content.length).toBeLessThan(small.doc.content.length);
});

it("each hard break starts a line, so a paragraph of short lines is cut inside", () => {
	const lines: InlineNode[] = Array.from({ length: 80 }, (_, index) => [
		text(`Line ${index}`),
		{ type: "hardBreak" } as const,
	]).flat();
	const [kept] = letterPreview(letter([paragraph(...lines)])).content.doc
		.content;
	if (kept?.type !== "paragraph") throw new Error("the paragraph is gone");
	const breaks = (kept.content ?? []).filter(
		(node) => node.type === "hardBreak",
	).length;
	expect(breaks).toBeGreaterThanOrEqual(linesOnOneSide(20) - 1);
	expect(breaks).toBeLessThan(80);
	expect(kept.content).toEqual(lines.slice(0, kept.content?.length));
});

it("one long paragraph is cut well past what the side shows, keeping its marks", () => {
	const marks = [
		{
			type: "ink",
			attrs: { font: null, sizePt: 16, color: "oxblood" },
		} as const,
	];
	const long = "Dear Sam, the bread was lovely. ".repeat(600);
	const content = letter([
		paragraph({ type: "text", text: long, marks }),
		paragraph(text("Love, Ada")),
	]);
	const [kept, ...rest] = letterPreview(content).content.doc.content;
	if (kept?.type !== "paragraph") throw new Error("the paragraph is gone");
	const [node] = kept.content ?? [];
	if (node?.type !== "text") throw new Error("the text is gone");
	expect(rest).toEqual([]);
	expect(node.marks).toEqual(marks);
	expect(long.startsWith(node.text)).toBe(true);
	expect(node.text.length).toBeLessThan(long.length);
	expect(node.text.length).toBeGreaterThan(4000);
});

it("a merge field is kept whole", () => {
	const content = letter([
		paragraph(text("Dear "), {
			type: "mergeField",
			attrs: { field: "first_name" },
		}),
	]);
	expect(letterPreview(content).content).toEqual(content);
});

it("the signature shows on the card only when it is placed on the shown side", () => {
	const onFront = letter([paragraph(text("Love,"))], {
		elements: [signature(0)],
	});
	expect(letterPreview(onFront).content.doc.attrs.elements).toEqual([
		signature(0),
	]);
	const onBack = letter([paragraph(text("Love,"))], {
		elements: [signature(1)],
	});
	expect(letterPreview(onBack).content.doc.attrs.elements).toEqual([]);
});

it("only the doodles on the shown side are kept", () => {
	const front = doodle(0, "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a34");
	const back = doodle(1, "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a35");
	const content = letter([paragraph(text("Dear Sam"))], {
		elements: [front, back],
	});
	expect(letterPreview(content).content.doc.attrs.elements).toEqual([front]);
});

it("a postcard with a front image shows the front, with no text behind it", () => {
	const cover = "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a36";
	const preview = letterPreview(postcard(cover));
	expect(preview.side).toBe(0);
	expect(preview.content.doc.attrs).toEqual({
		elements: [],
		minSides: 2,
		frontImageAssetId: cover,
	});
	expect(preview.content.doc.content).toEqual([paragraph()]);
});

it("a postcard without a front image shows its back", () => {
	const content = postcard(null);
	expect(letterPreview(content)).toEqual({ side: 1, content });
});

it("every preview is still a letter the parser accepts", () => {
	const previews = [
		letterPreview(
			letter(
				Array.from({ length: 80 }, () => paragraph(text("More"))),
				{
					elements: [
						doodle(0, "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a33"),
						signature(1),
					],
				},
			),
		),
		letterPreview(
			letter([paragraph(text("Dear Sam, ".repeat(1500)))], { sizePt: 30 }),
		),
		letterPreview(postcard("0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a37")),
		letterPreview(postcard(null)),
	];
	for (const preview of previews) {
		expect(parseLetterContent(preview.content)).toEqual(preview.content);
	}
});
