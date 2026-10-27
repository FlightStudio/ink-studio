import { defineConfig } from "orval";

export default defineConfig({
	api: {
		input: "./openapi.yaml",
		output: {
			target: "./src/gen/api.ts",
			client: "fetch",
			mode: "single",
			clean: true,
		},
	},
});
