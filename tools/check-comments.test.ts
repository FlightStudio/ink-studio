import { describe, expect, it } from "vitest";
import { findComments } from "./check-comments.ts";

describe("findComments", () => {
	it("a line comment after code is found", () => {
		const findings = findComments({
			file: "a.ts",
			source: "const a = 1; // note\n",
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.line).toBe(1);
	});

	it("block and JSX comments are found", () => {
		const findings = findComments({
			file: "a.tsx",
			source: "const a = /* x */ 1;\nconst b = <div>{/* y */}</div>;\n",
		});
		expect(findings).toHaveLength(2);
	});

	it("JSX text with an apostrophe is not a string", () => {
		const findings = findComments({
			file: "a.tsx",
			source: "<p>Don't</p>; const b = 2;\n",
		});
		expect(findings).toHaveLength(0);
	});

	it("a closing tag followed by code is not a regex", () => {
		const findings = findComments({
			file: "a.tsx",
			source: "<b>x</b>; const c = 3; // tail\n",
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.text).toBe("tail");
	});

	it("JSX text with slashes is not a comment", () => {
		const findings = findComments({
			file: "a.tsx",
			source: "<p>see https://example.com</p>\n",
		});
		expect(findings).toHaveLength(0);
	});

	it("slashes in strings, templates and regex literals are not comments", () => {
		const source = [
			'const a = "https://a/b";',
			"const b = `a // b ${" + '"/*"}' + "`;",
			"const c = /" + "\\/\\/" + "/g;",
		].join("\n");
		const findings = findComments({ file: "a.ts", source });
		expect(findings).toHaveLength(0);
	});

	it("CSS comments are found and CSS strings are not", () => {
		const findings = findComments({
			file: "a.css",
			source: 'a { content: "/*"; } /* x */\n',
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.text).toBe("x");
	});
});
