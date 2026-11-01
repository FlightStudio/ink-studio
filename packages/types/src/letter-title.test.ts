import { describe, expect, it } from "vitest";
import { normaliseLetterTitle, TITLE_MAX_CHARACTERS } from "./index.ts";

describe("letter titles", () => {
	it("trims surrounding whitespace while preserving meaningful internal whitespace", () => {
		expect(normaliseLetterTitle(" \tFor  Alex\n")).toBe("For  Alex");
	});

	it("counts Unicode code points at the shared title limit", () => {
		expect(normaliseLetterTitle(` ${"😀".repeat(TITLE_MAX_CHARACTERS)} `)).toBe(
			"😀".repeat(TITLE_MAX_CHARACTERS),
		);
		expect(
			normaliseLetterTitle("😀".repeat(TITLE_MAX_CHARACTERS + 1)),
		).toBeNull();
	});

	it("refuses empty titles and remaining control characters", () => {
		for (const title of ["", " \t\n", "Dear\nAlex", "Dear\u0000Alex"]) {
			expect(normaliseLetterTitle(title)).toBeNull();
		}
	});
});
