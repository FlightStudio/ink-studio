import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		GOOGLE_CLOUD_PROJECT: z.string().min(1),
		PUBSUB_EMULATOR_HOST: z.string().min(1).optional(),
		PUBSUB_JOBS_TOPIC: z.string().min(1),
		PUBSUB_JOBS_SUBSCRIPTION: z.string().min(1),
		WORKER_POOL: z.enum(["standard", "render"]),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
