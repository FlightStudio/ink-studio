import { describe, expect, test } from "vitest";
import { variantFeatureSettings } from "./letter-page.tsx";

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
