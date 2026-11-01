import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		DEV_USER_EMAIL: z.string().min(1),
		GCS_ASSETS_BUCKET: z.string().min(1),
		GOOGLE_CLOUD_PROJECT: z.string().min(1),
		STORAGE_EMULATOR_HOST: z.url().optional(),
		PUBSUB_EMULATOR_HOST: z.string().min(1).optional(),
		PUBSUB_JOBS_TOPIC: z.string().min(1),
		NODE_ENV: z.enum(["development", "test", "production"]),
	},
	client: {
		NEXT_PUBLIC_PLATFORM_URL: z.string().min(1),
	},
	runtimeEnv: {
		DATABASE_URL: process.env.DATABASE_URL,
		DEV_USER_EMAIL: process.env.DEV_USER_EMAIL,
		GCS_ASSETS_BUCKET: process.env.GCS_ASSETS_BUCKET,
		GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
		STORAGE_EMULATOR_HOST: process.env.STORAGE_EMULATOR_HOST,
		PUBSUB_EMULATOR_HOST: process.env.PUBSUB_EMULATOR_HOST,
		PUBSUB_JOBS_TOPIC: process.env.PUBSUB_JOBS_TOPIC,
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_PLATFORM_URL: process.env.NEXT_PUBLIC_PLATFORM_URL,
	},
	emptyStringAsUndefined: true,
	skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
