import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/index.ts",
		"../../packages/integrations/src/worker/font/parse-thread.ts",
	],
	format: "esm",
	platform: "node",
	target: "node22",
	fixedExtension: true,
	noExternal: [/^@repo\//],
	external: ["sharp"],
	dts: false,
});
