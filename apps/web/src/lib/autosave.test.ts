import { expect, it } from "vitest";
import { retryDelayMs } from "./autosave.ts";

it("save retries back off without exceeding the retry interval cap", () => {
	expect([0, 1, 2, 3, 4, 5].map(retryDelayMs)).toEqual([
		2000, 4000, 8000, 16000, 30000, 30000,
	]);
	expect(retryDelayMs(100)).toBe(30000);
});
