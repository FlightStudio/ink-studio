import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: "esm",
	platform: "node",
	target: "node22",
	fixedExtension: true,
	noExternal: [/^@repo\//],
	dts: false,
});
