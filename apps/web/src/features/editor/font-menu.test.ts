import type { FontOption } from "@repo/types";
import { expect, it } from "vitest";
import { NEEDED_COUNT } from "../fonts/font-status.ts";
import { fontMenu, hrefOfMenuValue } from "./font-menu.ts";

const letterId = "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a99";
const lowercase = "abcdefghijklmnopqrstuvwxyz";

function font(id: string, change: Partial<FontOption>): FontOption {
	return {
		id,
		ownerName: "Karla",
		source: "drawn",
		status: "ready",
		assetId: `asset-${id}`,
		pendingAssetId: null,
		error: null,
		chars: lowercase,
		missingRequired: 0,
		...change,
	};
}

it("usable fonts are fonts, with how each was made", () => {
	const menu = fontMenu(
		[
			font("a", {}),
			font("b", { source: "template-photo", status: "failed" }),
			font("c", { source: "upload", status: "building" }),
		],
		letterId,
	);
	expect(menu.usable.map((entry) => [entry.font.id, entry.note])).toEqual([
		["a", "drawn"],
		["b", "paper"],
		["c", "file"],
	]);
});

it("a drawn font still being drawn says how far it is and continues on the draw page", () => {
	const menu = fontMenu(
		[
			font("d", {
				status: "drawing",
				assetId: null,
				chars: "",
				missingRequired: NEEDED_COUNT - 12,
			}),
		],
		letterId,
	);
	expect(menu.usable).toEqual([]);
	expect(menu.links[0]).toEqual({
		value: `link:/fonts/d/draw?from=${letterId}`,
		label: "Karla's handwriting",
		note: `12 of ${NEEDED_COUNT} · Continue`,
	});
});

it("a font that is building, failed or incomplete opens its home page", () => {
	const menu = fontMenu(
		[
			font("e", { status: "building", assetId: null, chars: "" }),
			font("f", { status: "failed", assetId: null, chars: "" }),
			font("g", { status: "incomplete", chars: "abc" }),
		],
		letterId,
	);
	expect(menu.links.slice(0, 3)).toEqual([
		{
			value: `link:/fonts/e?from=${letterId}`,
			label: "Karla's handwriting",
			note: "Building…",
		},
		{
			value: `link:/fonts/f?from=${letterId}`,
			label: "Karla's handwriting",
			note: "Needs attention",
		},
		{
			value: `link:/fonts/g?from=${letterId}`,
			label: "Karla's handwriting",
			note: "Needs attention",
		},
	]);
});

it("the menu always ends with making and managing handwriting", () => {
	for (const fonts of [[], [font("a", {})]]) {
		expect(fontMenu(fonts, letterId).links.slice(-2)).toEqual([
			{
				value: `link:/fonts/new?from=${letterId}`,
				label: "Make your handwriting",
				note: null,
			},
			{ value: "link:/fonts", label: "Manage handwriting", note: null },
		]);
	}
});

it("a menu value names a page only when it is a link", () => {
	expect(hrefOfMenuValue("link:/fonts")).toBe("/fonts");
	expect(hrefOfMenuValue("own:a")).toBeNull();
	expect(hrefOfMenuValue("stock:caveat")).toBeNull();
});

it("a drawn font with every required letter is ready to build on the draw page", () => {
	const menu = fontMenu(
		[font("h", { status: "drawing", assetId: null, chars: "" })],
		letterId,
	);
	expect(menu.links[0]).toEqual({
		value: `link:/fonts/h/draw?from=${letterId}`,
		label: "Karla's handwriting",
		note: "Ready to build",
	});
});
