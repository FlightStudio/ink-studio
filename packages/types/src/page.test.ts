import { describe, expect, it } from "vitest";
import { PAGE_SPECS } from "./page.ts";

describe("PAGE_SPECS", () => {
	it("every spec allows no more pages than its provider", () => {
		for (const spec of Object.values(PAGE_SPECS)) {
			expect(spec.maxPages).toBeLessThanOrEqual(spec.providerMaxPages);
		}
	});
});
