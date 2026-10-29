import type {
	LetterContent,
	LetterResources,
	PlacedElement,
} from "@repo/types";
import { PAGE_SPECS, SAMPLE_MERGE_VALUES } from "@repo/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fixtureContent, letterFixture } from "./fixtures/index.ts";
import { sideTopIn } from "./geometry.ts";
import { LETTER_CSS } from "./letter-css.ts";
import {
	elementFrame,
	LetterPage,
	pageGapIn,
	variantFeatureSettings,
} from "./letter-page.tsx";
import { LetterPrint, LetterText } from "./letter-print.tsx";

const LETTER_IDS = [
	"0190a8d6-5c1e-7b3a-9f00-000000000001",
	"0190a8d6-5c1e-7b3a-9f00-000000000002",
	"0190a8d6-5c1e-7b3a-9f00-000000000003",
	"0190a8d6-5c1e-7b3a-9f00-000000000004",
	"0190a8d6-5c1e-7b3a-9f00-000000000005",
	"0190a8d6-5c1e-7b3a-9f00-000000000006",
	"0190a8d6-5c1e-7b3a-9f00-000000000007",
	"0190a8d6-5c1e-7b3a-9f00-000000000008",
	"0190a8d6-5c1e-7b3a-9f00-000000000009",
	"0190a8d6-5c1e-7b3a-9f00-00000000000a",
];

const DRAWING_ID = "0190a8d6-5c1e-7b3a-9f00-0000000000d1";

const element: PlacedElement = {
	id: "0190a8d6-5c1e-7b3a-9f00-0000000000e1",
	kind: "drawing",
	drawingId: DRAWING_ID,
	side: 1,
	xIn: 1.5,
	yIn: 2,
	widthIn: 2,
	heightIn: 1,
	rotationDeg: 40,
	tint: "ink-blue",
	wrap: true,
};

const resources: LetterResources = {
	assetBaseUrl: "https://letter.invalid/assets/",
	stockFontBaseUrl: "https://letter.invalid/stock/",
	fonts: {},
	drawings: { [DRAWING_ID]: { maskAssetId: DRAWING_ID, aspect: 2 } },
	frontImageAssetId: null,
};

function richLetter(name: "note" | "postcard-back"): LetterContent {
	const content = fixtureContent(letterFixture(name));
	content.doc.content = [
		{
			type: "paragraph",
			attrs: { align: "left" },
			content: [
				{ type: "text", text: "Dear " },
				{ type: "mergeField", attrs: { field: "first_name" } },
			],
		},
		...content.doc.content,
	];
	content.doc.attrs.elements = [
		element,
		{
			...element,
			id: "0190a8d6-5c1e-7b3a-9f00-0000000000e2",
			kind: "signature",
			wrap: false,
		},
	];
	return content;
}

function classesOf(markup: string): Set<string> {
	const names = new Set<string>();
	for (const match of markup.matchAll(/class="([^"]*)"/gu)) {
		for (const name of (match[1] ?? "").split(/\s+/u)) {
			if (name) names.add(name);
		}
	}
	return names;
}

describe("variantFeatureSettings", () => {
	test("a letter keeps its variant set, and letters differ", () => {
		const sets = LETTER_IDS.map((id) => variantFeatureSettings(id));
		for (const [index, id] of LETTER_IDS.entries()) {
			expect(variantFeatureSettings(id)).toBe(sets[index]);
			expect(['"ss01" 1', '"ss02" 1', '"ss03" 1']).toContain(sets[index]);
		}
		expect(new Set(sets).size).toBeGreaterThanOrEqual(2);
	});
});

describe("LetterPage", () => {
	test("every class the page draws has its rule in LETTER_CSS, so the studio's styles cannot change the letter", () => {
		for (const name of ["note", "postcard-back"] as const) {
			const content = richLetter(name);
			const spec = PAGE_SPECS[content.format];
			for (const mode of ["edit", "print"] as const) {
				const markup = renderToStaticMarkup(
					<LetterPage
						letterId={LETTER_IDS[0] ?? ""}
						content={content}
						resources={resources}
						mode={mode}
						mergeValues={null}
						sheets={spec.maxPages}
						flow={<LetterText doc={content.doc} />}
						handles={<span />}
					/>,
				);
				const unstyled = [...classesOf(markup)].filter(
					(className) => !LETTER_CSS.includes(`.${className}`),
				);
				expect(unstyled, `${name} in ${mode}`).toEqual([]);
			}
		}
	});

	test("a placed element turns with the rotate property, which no transform animation can undo", () => {
		const spec = PAGE_SPECS["thanksio:letter-windowless"];
		const gapIn = pageGapIn("edit");
		expect(elementFrame(spec, element, gapIn)).toEqual({
			left: "1.5in",
			top: `${sideTopIn(spec, 1, gapIn) + 2}in`,
			width: "2in",
			height: "1in",
			rotate: "40deg",
		});
	});
});

describe("LetterPrint", () => {
	test("prints every side the product has, or only the sides asked for", () => {
		const content = richLetter("note");
		const spec = PAGE_SPECS[content.format];
		const sheetsIn = (markup: string) =>
			markup.match(/class="letter-sheet"/gu)?.length ?? 0;
		const print = (sheets?: number) =>
			renderToStaticMarkup(
				<LetterPrint
					letterId={LETTER_IDS[0] ?? ""}
					content={content}
					resources={resources}
					mergeValues={SAMPLE_MERGE_VALUES}
					sheets={sheets}
				/>,
			);
		expect(sheetsIn(print())).toBe(spec.maxPages);
		expect(sheetsIn(print(1))).toBe(1);
	});
});
