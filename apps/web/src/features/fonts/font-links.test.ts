import { describe, expect, test } from "vitest";
import {
	drawPage,
	fontHome,
	letterWithFont,
	newFont,
	templatePage,
} from "./font-links.ts";

const FONT = "3f0c5e1a-9d1b-4c4e-9a7e-2f6b1c0d8e11";
const LETTER = "7b2d9c40-1e5f-4a3b-8c6d-0e9f1a2b3c4d";

describe("font links", () => {
	test("the font home keeps the letter the creator came from", () => {
		expect(fontHome(FONT, null)).toBe(`/fonts/${FONT}`);
		expect(fontHome(FONT, LETTER)).toBe(`/fonts/${FONT}?from=${LETTER}`);
	});

	test("the draw page carries from and an encoded glyph", () => {
		expect(drawPage(FONT, null)).toBe(`/fonts/${FONT}/draw`);
		expect(drawPage(FONT, LETTER)).toBe(`/fonts/${FONT}/draw?from=${LETTER}`);
		expect(drawPage(FONT, null, "A")).toBe(`/fonts/${FONT}/draw?glyph=A`);
		expect(drawPage(FONT, LETTER, "&")).toBe(
			`/fonts/${FONT}/draw?from=${LETTER}&glyph=%26`,
		);
		expect(drawPage(FONT, null, "?")).toBe(`/fonts/${FONT}/draw?glyph=%3F`);
	});

	test("a letter link offers the font", () => {
		expect(letterWithFont(LETTER, FONT)).toBe(
			`/letters/${LETTER}?font=${FONT}`,
		);
	});

	test("the start page and the template pass from and the name on", () => {
		expect(newFont(null)).toBe("/fonts/new");
		expect(newFont(LETTER)).toBe(`/fonts/new?from=${LETTER}`);
		expect(templatePage(null, "")).toBe("/fonts/template");
		expect(templatePage(LETTER, "Karla Ann")).toBe(
			`/fonts/template?from=${LETTER}&name=Karla%20Ann`,
		);
	});
});
