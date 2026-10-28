import type {
	LetterContent,
	LetterResources,
	MergeValues,
	ParagraphNode,
} from "@repo/types";
import { SAMPLE_MERGE_VALUES } from "@repo/types";
import { describe, expect, test } from "vitest";
import { fixtureContent, letterFixture } from "./html/fixtures/index.ts";
import { renderLetterHtml } from "./render-letter-html.tsx";

const LETTER_ID = "0190a8d6-5c1e-7b3a-9f00-000000000001";
const DRAWING_ID = "0190a8d6-5c1e-7b3a-9f00-000000000002";
const MASK_ASSET_ID = "0190a8d6-5c1e-7b3a-9f00-000000000003";
const OWN_FONT_ID = "0190a8d6-5c1e-7b3a-9f00-000000000004";
const OWN_FONT_ASSET_ID = "0190a8d6-5c1e-7b3a-9f00-000000000005";
const FRONT_ASSET_ID = "0190a8d6-5c1e-7b3a-9f00-000000000006";
const ELEMENT_ID = "0190a8d6-5c1e-7b3a-9f00-000000000007";

const resources: LetterResources = {
	assetBaseUrl: "https://letter.invalid/assets/",
	stockFontBaseUrl: "https://letter.invalid/stock/",
	fonts: { [OWN_FONT_ID]: OWN_FONT_ASSET_ID },
	drawings: { [DRAWING_ID]: { maskAssetId: MASK_ASSET_ID, aspect: 1 } },
	frontImageAssetId: null,
};

function withParagraphs(
	content: LetterContent,
	paragraphs: ParagraphNode[],
): LetterContent {
	return { ...content, doc: { ...content.doc, content: paragraphs } };
}

function withDrawing(content: LetterContent, drawingId: string): LetterContent {
	return {
		...content,
		doc: {
			...content.doc,
			attrs: {
				...content.doc.attrs,
				elements: [
					{
						id: ELEMENT_ID,
						kind: "drawing",
						drawingId,
						side: 0,
						xIn: 1,
						yIn: 1,
						widthIn: 2,
						heightIn: 1,
						rotationDeg: 12,
						tint: "sepia",
						wrap: false,
					},
				],
			},
		},
	};
}

function render(
	content: LetterContent,
	mergeValues: MergeValues = SAMPLE_MERGE_VALUES,
): string {
	return renderLetterHtml({
		letterId: LETTER_ID,
		content,
		resources,
		mergeValues,
	});
}

function urlsIn(html: string): string[] {
	const decoded = html.replaceAll("&quot;", '"').replaceAll("&#x27;", "'");
	const fromCss = [...decoded.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gu)];
	const fromSrc = [...decoded.matchAll(/src=(["'])([^"']*)\1/gu)];
	return [...fromCss, ...fromSrc].map((match) => match[2] ?? "");
}

describe("renderLetterHtml", () => {
	test("the signature's mask URL comes from the resources", () => {
		const signatureId = "0190a8d6-5c1e-7b3a-9f00-000000000008";
		const content = fixtureContent(letterFixture("note"));
		content.doc.content = [
			...content.doc.content,
			{
				type: "signature",
				attrs: {
					drawingId: signatureId,
					widthIn: 2.25,
					align: "right",
					color: "sepia",
				},
			},
		];
		const signedResources: LetterResources = {
			...resources,
			drawings: {
				...resources.drawings,
				[signatureId]: { maskAssetId: MASK_ASSET_ID, aspect: 3 },
			},
		};
		const html = renderLetterHtml({
			letterId: LETTER_ID,
			content,
			resources: signedResources,
			mergeValues: SAMPLE_MERGE_VALUES,
		});
		expect(html).toContain(`${resources.assetBaseUrl}${MASK_ASSET_ID}`);
		expect(html).toContain(`data-signature="${signatureId}"`);
	});

	test("a signature drawing the resources lack throws", () => {
		const content = fixtureContent(letterFixture("note"));
		content.doc.content = [
			...content.doc.content,
			{
				type: "signature",
				attrs: {
					drawingId: "0190a8d6-5c1e-7b3a-9f00-0000000000ee",
					widthIn: 3,
					align: "center",
					color: "ink-blue",
				},
			},
		];
		expect(() => render(content)).toThrow();
	});

	test("a chip prints the recipient's value", () => {
		const content = withParagraphs(fixtureContent(letterFixture("note")), [
			{
				type: "paragraph",
				attrs: { align: "left" },
				content: [
					{ type: "mergeField", attrs: { field: "first_name" } },
					{ type: "text", text: " " },
					{ type: "mergeField", attrs: { field: "last_name" } },
				],
			},
		]);
		const sample = render(content);
		expect(sample).toContain("Alex");
		expect(sample).toContain("Rivera");
		const custom = render(content, {
			first_name: "<b>Jo</b>",
			last_name: "Lee",
		});
		expect(custom).toContain("&lt;b&gt;Jo&lt;/b&gt;");
		expect(custom).not.toContain("<b>Jo</b>");
		expect(custom).toContain("Lee");
	});

	test("text that looks like markup stays text", () => {
		const html = render(
			withParagraphs(fixtureContent(letterFixture("note")), [
				{
					type: "paragraph",
					attrs: { align: "left" },
					content: [{ type: "text", text: "<script>alert(1)</script>" }],
				},
			]),
		);
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).not.toContain("<script");
	});

	test("the only URLs are built from the resources", () => {
		const letter = withParagraphs(
			withDrawing(fixtureContent(letterFixture("note")), DRAWING_ID),
			[
				{
					type: "paragraph",
					attrs: { align: "left" },
					content: [
						{
							type: "text",
							text: "In my own hand",
							marks: [
								{
									type: "ink",
									attrs: {
										font: { kind: "own", fontId: OWN_FONT_ID },
										sizePt: null,
										color: null,
									},
								},
							],
						},
					],
				},
			],
		);
		const postcard = fixtureContent(letterFixture("postcard-back"));
		const front: LetterContent = {
			...postcard,
			doc: {
				...postcard.doc,
				attrs: { ...postcard.doc.attrs, frontImageAssetId: FRONT_ASSET_ID },
			},
		};
		const urls = [...urlsIn(render(letter)), ...urlsIn(render(front))];
		expect(urls).toContain(`${resources.assetBaseUrl}${MASK_ASSET_ID}`);
		expect(urls).toContain(`${resources.assetBaseUrl}${OWN_FONT_ASSET_ID}`);
		expect(urls).toContain(`${resources.assetBaseUrl}${FRONT_ASSET_ID}`);
		expect(urls).toContain(`${resources.stockFontBaseUrl}caveat`);
		expect(
			urls.filter(
				(url) =>
					!url.startsWith(resources.assetBaseUrl) &&
					!url.startsWith(resources.stockFontBaseUrl),
			),
		).toEqual([]);
		for (const html of [render(letter), render(front)]) {
			expect(html).toContain("var(--letter-paper-texture");
			expect(html).not.toMatch(/--letter-paper-texture\s*:/u);
		}
	});

	test("a drawing the resources lack is a broken state", () => {
		const missing = "0190a8d6-5c1e-7b3a-9f00-0000000000ff";
		expect(() =>
			render(withDrawing(fixtureContent(letterFixture("note")), missing)),
		).toThrow();
	});

	test("an empty paragraph keeps its line", () => {
		const html = render(
			withParagraphs(fixtureContent(letterFixture("note")), [
				{
					type: "paragraph",
					attrs: { align: "left" },
					content: [{ type: "text", text: "Dear Alex," }],
				},
				{ type: "paragraph", attrs: { align: "left" } },
				{
					type: "paragraph",
					attrs: { align: "left" },
					content: [{ type: "text", text: "Love," }, { type: "hardBreak" }],
				},
			]),
		);
		expect(html).not.toMatch(/<p[^>]*><\/p>/u);
		expect(html).toMatch(/<p[^>]*><br\/?><\/p>/u);
		expect(html).toMatch(/Love,<br\/?><br\/?><\/p>/u);
	});
});
