import type { DrawnGlyph, Stroke } from "@repo/types";
import { HANDWRITING_GLYPHS, OWNER_NAME_MAX_CHARACTERS } from "@repo/types";
import { describe, expect, test } from "vitest";
import {
	blankSentence,
	cleanOwnerName,
	defaultSealName,
	drawnCount,
	fillsIn,
	fillsInPhrase,
	fontAnnouncement,
	fontHeading,
	lettersDrawn,
	listOf,
	NEEDED_COUNT,
	pillStatus,
	sealLine,
	sealNameFrom,
	statusLabel,
} from "./font-status.ts";

const ink: Stroke[] = [{ input: "pen", points: [[1, 2, 0.5, 0]] }];

const required = HANDWRITING_GLYPHS.filter((entry) => entry.required).map(
	(entry) => entry.char,
);

function drawn(chars: Iterable<string>): DrawnGlyph[] {
	return [...chars].map((char) => ({ char, variant: 0, strokes: ink }));
}

describe("drawnCount", () => {
	test("counts the needed characters that have ink", () => {
		expect(NEEDED_COUNT).toBe(required.length);
		expect(drawnCount([])).toBe(0);
		expect(drawnCount(drawn("abc"))).toBe(3);
		expect(drawnCount(drawn(required))).toBe(NEEDED_COUNT);
	});

	test("a live glyph session decides the count, and a missing session uses the stored gap", () => {
		expect(lettersDrawn(null, 4)).toBe(NEEDED_COUNT - 4);
		expect(lettersDrawn(drawn(required), NEEDED_COUNT)).toBe(required.length);
		expect(lettersDrawn(drawn("ab"), 0)).toBe(2);
	});

	test("capitals, extra variants and blank cells do not count", () => {
		expect(
			drawnCount([
				...drawn("AB"),
				{ char: "a", variant: 1, strokes: ink },
				{ char: "b", variant: 0, strokes: [] },
			]),
		).toBe(1);
	});
});

describe("statusLabel", () => {
	test("says what each status means in the list", () => {
		expect(statusLabel("drawing", 12)).toBe(`Drawing 12/${NEEDED_COUNT}`);
		expect(statusLabel("building", 0)).toBe("Building");
		expect(statusLabel("incomplete", 0)).toBe("Needs attention");
		expect(statusLabel("failed", 0)).toBe("Didn't work");
		expect(statusLabel("ready", 0)).toBe("Ready");
	});

	test("each status has a pill state", () => {
		expect(pillStatus("drawing")).toBe("pending");
		expect(pillStatus("building")).toBe("running");
		expect(pillStatus("incomplete")).toBe("failed");
		expect(pillStatus("failed")).toBe("failed");
		expect(pillStatus("ready")).toBe("done");
	});
});

describe("listOf and blankSentence", () => {
	test("joins with commas and a final and", () => {
		expect(listOf([])).toBe("");
		expect(listOf(["q"])).toBe("q");
		expect(listOf(["q", "z"])).toBe("q and z");
		expect(listOf(["q", "x", "z"])).toBe("q, x and z");
	});

	test("names the blank letters", () => {
		expect(blankSentence(["q"])).toBe("q was blank.");
		expect(blankSentence(["q", "z"])).toBe("q and z were blank.");
	});
});

describe("fillsIn", () => {
	test("lists every catalogue character the font lacks, in order", () => {
		const all = HANDWRITING_GLYPHS.map((entry) => entry.char).join("");
		expect(fillsIn(all)).toEqual([]);
		expect(fillsIn(all.replace("D", "").replace("2", ""))).toEqual(["D", "2"]);
	});

	test("a whole missing group is named instead of listed", () => {
		const lower = required.join("");
		expect(fillsInPhrase(fillsIn(lower))).toBe("capitals, numbers and symbols");
		const most = HANDWRITING_GLYPHS.map((entry) => entry.char)
			.filter((char) => !["D", "S", "2"].includes(char))
			.join("");
		expect(fillsInPhrase(fillsIn(most))).toBe("D, S and 2");
		const noNumbers = HANDWRITING_GLYPHS.map((entry) => entry.char)
			.filter((char) => !/[0-9]/.test(char) && char !== "S")
			.join("");
		expect(fillsInPhrase(fillsIn(noNumbers))).toBe("S and numbers");
	});

	test("a group that is mostly missing names the few that were drawn", () => {
		const twoCapitals = [...required, "A", "S"].join("");
		expect(fillsInPhrase(fillsIn(twoCapitals))).toBe(
			"capitals (all but A and S), numbers and symbols",
		);
		const oneNumber = HANDWRITING_GLYPHS.map((entry) => entry.char)
			.filter((char) => !/[1-9]/.test(char))
			.join("");
		expect(fillsInPhrase(fillsIn(oneNumber))).toBe("numbers (all but 0)");
	});
});

describe("sealNameFrom", () => {
	test("takes the first word of the user's name", () => {
		expect(sealNameFrom("Karla Example")).toBe("Karla");
		expect(sealNameFrom("  Sam\tBaker ")).toBe("Sam");
	});

	test("an email, a blank or a missing name gives nothing", () => {
		expect(sealNameFrom("e2e-1@inkstudio.local")).toBe("");
		expect(sealNameFrom("   ")).toBe("");
		expect(sealNameFrom(null)).toBe("");
		expect(sealNameFrom(undefined)).toBe("");
	});

	test("control characters go and the name fits the seal", () => {
		expect(sealNameFrom("Ka\u0007rla")).toBe("Karla");
		expect(sealNameFrom("x".repeat(60))).toHaveLength(
			OWNER_NAME_MAX_CHARACTERS,
		);
	});

	test("the seal line reads like the letter's seal", () => {
		expect(sealLine("Karla")).toBe("Written in Karla's own handwriting");
	});
});

describe("cleanOwnerName", () => {
	test("keeps every word the creator typed", () => {
		expect(cleanOwnerName("Mary Ann")).toBe("Mary Ann");
		expect(cleanOwnerName("Sam Paper")).toBe("Sam Paper");
	});

	test("collapses spaces and tabs to one space and trims", () => {
		expect(cleanOwnerName(" Sam\tBaker ")).toBe("Sam Baker");
		expect(cleanOwnerName("Sam \n  Baker")).toBe("Sam Baker");
	});

	test("control characters go", () => {
		expect(cleanOwnerName("Ma\u0007ry Ann")).toBe("Mary Ann");
		expect(cleanOwnerName("Sam \u0007 Baker")).toBe("Sam Baker");
	});

	test("a long name is cut to the seal limit without a trailing space", () => {
		expect([...cleanOwnerName("x".repeat(60))]).toHaveLength(
			OWNER_NAME_MAX_CHARACTERS,
		);
		const spaced = `${"x".repeat(OWNER_NAME_MAX_CHARACTERS - 1)} yz`;
		expect(cleanOwnerName(spaced)).toBe(
			"x".repeat(OWNER_NAME_MAX_CHARACTERS - 1),
		);
		expect([...cleanOwnerName("\u{1F58B}".repeat(50))]).toHaveLength(
			OWNER_NAME_MAX_CHARACTERS,
		);
	});

	test("nothing typed gives nothing", () => {
		expect(cleanOwnerName("  \t ")).toBe("");
		expect(cleanOwnerName(null)).toBe("");
		expect(cleanOwnerName(undefined)).toBe("");
	});
});

describe("defaultSealName", () => {
	test("a typed name wins as typed", () => {
		expect(defaultSealName("Mary Ann", "Karla Example")).toBe("Mary Ann");
	});

	test("an empty typed name falls back to the account's first name", () => {
		expect(defaultSealName(null, "Karla Example")).toBe("Karla");
		expect(defaultSealName("   ", "Karla Example")).toBe("Karla");
		expect(defaultSealName("", "e2e-1@inkstudio.local")).toBe("");
	});
});

describe("fontHeading and fontAnnouncement", () => {
	const font = { ownerName: "Karla", source: "drawn" as const };

	test("the heading says how the font is doing", () => {
		expect(fontHeading({ ...font, status: "drawing" })).toBe(
			"Karla's handwriting",
		);
		expect(fontHeading({ ...font, status: "building" })).toBe(
			"Karla's handwriting",
		);
		expect(fontHeading({ ...font, status: "ready" })).toBe(
			"Karla's handwriting is ready",
		);
		expect(fontHeading({ ...font, status: "failed" })).toBe(
			"Karla's handwriting didn't work",
		);
		expect(fontHeading({ ...font, status: "incomplete" })).toBe(
			"Karla's handwriting needs a few letters",
		);
	});

	test("the announcement names each outcome and the build in progress", () => {
		expect(fontAnnouncement({ ...font, status: "drawing" })).toBe("");
		expect(fontAnnouncement({ ...font, status: "building" })).toBe(
			"Building your font…",
		);
		expect(
			fontAnnouncement({ ...font, source: "upload", status: "building" }),
		).toBe("Rebuilding your file…");
		for (const status of ["ready", "failed", "incomplete"] as const) {
			expect(fontAnnouncement({ ...font, status })).toBe(
				fontHeading({ ...font, status }),
			);
		}
	});
});
