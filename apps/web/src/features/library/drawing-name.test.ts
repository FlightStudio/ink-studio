import { describe, expect, it } from "vitest";
import { nextDrawingName } from "./drawing-name.ts";

describe("nextDrawingName", () => {
	it("the first doodle is Doodle 1 and the first signature is Signature 1", () => {
		expect(nextDrawingName("doodle", [])).toBe("Doodle 1");
		expect(nextDrawingName("signature", [])).toBe("Signature 1");
	});

	it("counts on from the highest number already used", () => {
		expect(nextDrawingName("doodle", ["Doodle 3", "Spiral", "Doodle 1"])).toBe(
			"Doodle 4",
		);
	});

	it("an old unnumbered default counts as the first", () => {
		expect(nextDrawingName("doodle", ["Doodle", "Doodle"])).toBe("Doodle 2");
		expect(nextDrawingName("signature", ["Signature"])).toBe("Signature 2");
	});

	it("names that only start with the default are the creator's own", () => {
		expect(nextDrawingName("doodle", ["Doodle 7 for Sam", "Doodles"])).toBe(
			"Doodle 1",
		);
	});
});
