import { describe, expect, it } from "vitest";
import { isUsableFont } from "./font.ts";
import { LOWERCASE_LETTERS } from "./handwriting.ts";

const EVERY_LETTER = LOWERCASE_LETTERS.join("");

describe("isUsableFont", () => {
	it("a font with a build that has every lowercase letter is usable", () => {
		expect(isUsableFont({ assetId: "build", chars: `${EVERY_LETTER}.,` })).toBe(
			true,
		);
	});

	it("a font with nothing built is not usable", () => {
		expect(isUsableFont({ assetId: null, chars: EVERY_LETTER })).toBe(false);
	});

	it("a build missing lowercase letters is not usable", () => {
		expect(
			isUsableFont({ assetId: "build", chars: EVERY_LETTER.replace("q", "") }),
		).toBe(false);
	});
});
