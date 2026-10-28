import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		"parse-thread":
			"../../packages/integrations/src/worker/font/parse-thread.ts",
	},
	format: "esm",
	platform: "node",
	target: "node22",
	fixedExtension: true,
	noExternal: [/^@repo\//],
	external: ["sharp"],
	dts: false,
});
