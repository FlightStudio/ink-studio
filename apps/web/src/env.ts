import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		DEV_USER_EMAIL: z.string().min(1),
		NODE_ENV: z.enum(["development", "test", "production"]),
	},
	client: {
		NEXT_PUBLIC_PLATFORM_URL: z.string().min(1),
	},
	runtimeEnv: {
		DATABASE_URL: process.env.DATABASE_URL,
		DEV_USER_EMAIL: process.env.DEV_USER_EMAIL,
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_PLATFORM_URL: process.env.NEXT_PUBLIC_PLATFORM_URL,
	},
	emptyStringAsUndefined: true,
	skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
