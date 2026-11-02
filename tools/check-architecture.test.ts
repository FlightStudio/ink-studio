import { describe, expect, it } from "vitest";
import { findMissingPaths } from "./check-architecture.ts";

describe("findMissingPaths", () => {
	it("a repo path that does not exist is reported with its line", () => {
		const findings = findMissingPaths({
			markdown: "See `apps/missing.ts` on line one.\n",
			exists: () => false,
		});
		expect(findings).toEqual([{ line: 1, path: "apps/missing.ts" }]);
	});

	it("code spans that are not repo paths are ignored", () => {
		const findings = findMissingPaths({
			markdown: "Run `pnpm test` and `xParams`.\n",
			exists: () => false,
		});
		expect(findings).toEqual([]);
	});
});
