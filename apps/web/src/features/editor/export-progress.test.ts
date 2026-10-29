import { errorMessages } from "@repo/errors";
import { PAGE_SPECS } from "@repo/types";
import { expect, it } from "vitest";
import {
	afterReading,
	type ExportState,
	exportBlocker,
	proofLabels,
	workingOn,
} from "./export-progress.ts";

const working = workingOn(["a", "b"]);

const quiet = { error: null, slow: false, unreachable: false };

it("words past the last side stop the export and say what to do", () => {
	expect(
		exportBlocker({
			wordsPastLimit: 42,
			maxPages: 3,
			placement: null,
			frontMissing: false,
		}),
	).toBe(
		"About 42 words won't fit on 3 sides. Shorten the letter or pick a smaller text size, then export again.",
	);
});

it("a doodle in the wrong place stops the export with the placement sentence", () => {
	expect(
		exportBlocker({
			wordsPastLimit: 0,
			maxPages: 3,
			placement: "Move the doodle inside the safe area.",
			frontMissing: false,
		}),
	).toBe("Move the doodle inside the safe area. Then export again.");
});

it("a postcard without a front image stops the export until one is chosen", () => {
	expect(
		exportBlocker({
			wordsPastLimit: 0,
			maxPages: 2,
			placement: null,
			frontMissing: true,
		}),
	).toBe("Choose a front image, then export again.");
});

it("a letter that fits can be exported", () => {
	expect(
		exportBlocker({
			wordsPastLimit: 0,
			maxPages: 3,
			placement: null,
			frontMissing: false,
		}),
	).toBeNull();
});

it("an export starts with every proof pending", () => {
	expect(working).toEqual({
		phase: "working",
		proofs: [
			{ id: "a", status: "pending", ...quiet },
			{ id: "b", status: "pending", ...quiet },
		],
	});
});

it("the export keeps working until every proof is done", () => {
	const one = afterReading(working, "a", { status: "done", ...quiet });
	expect(one).toEqual({
		phase: "working",
		proofs: [
			{ id: "a", status: "done", ...quiet },
			{ id: "b", status: "pending", ...quiet },
		],
	});
	expect(afterReading(one, "b", { status: "done", ...quiet })).toEqual({
		phase: "ready",
		proofs: [
			{ id: "a", status: "done", ...quiet },
			{ id: "b", status: "done", ...quiet },
		],
	});
});

it("one failed proof fails the export with its message", () => {
	expect(
		afterReading(working, "a", {
			status: "failed",
			error: "letter_overflow",
			slow: false,
			unreachable: false,
		}),
	).toEqual({ phase: "failed", message: errorMessages.letter_overflow });
	expect(
		afterReading(working, "b", {
			status: "failed",
			error: "nonsense",
			slow: false,
			unreachable: false,
		}),
	).toEqual({ phase: "failed", message: errorMessages.processing_failed });
	expect(
		afterReading(working, "a", {
			status: "failed",
			error: null,
			slow: false,
			unreachable: true,
		}),
	).toEqual({ phase: "failed", message: errorMessages.processing_failed });
});

it("a reading that lands after the export ended, or for another export, changes nothing", () => {
	const idle: ExportState = { phase: "idle" };
	expect(afterReading(idle, "a", { status: "done", ...quiet })).toBe(idle);
	expect(afterReading(working, "old", { status: "done", ...quiet })).toBe(
		working,
	);
});

it("a postcard has a front and a back proof, a letter has one", () => {
	expect(proofLabels(PAGE_SPECS["thanksio:postcard-6x9"], 2)).toEqual([
		"Open the front",
		"Open the back",
	]);
	expect(proofLabels(PAGE_SPECS["thanksio:letter-windowless"], 1)).toEqual([
		"Open the proof",
	]);
	expect(proofLabels(PAGE_SPECS["thanksio:letter-windowless"], 3)).toEqual([
		"Open side 1",
		"Open side 2",
		"Open side 3",
	]);
});
