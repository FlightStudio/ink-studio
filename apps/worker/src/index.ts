import { createDb } from "@repo/db";
import { PubSubSubscriber } from "@repo/integrations/shared/gcp";
import { type MessageProcessor, QueueManager } from "@repo/services/queue";
import { env } from "./env.ts";
import { logger } from "./lib/logger.ts";

async function main(): Promise<void> {
	const log = logger.child({ pool: env.WORKER_POOL });
	const db = createDb(env.DATABASE_URL);
	const processors: MessageProcessor[] = [];
	const queue = new QueueManager({ processors, logger: log });
	const subscriber = new PubSubSubscriber({
		projectId: env.GOOGLE_CLOUD_PROJECT,
		emulatorHost: env.PUBSUB_EMULATOR_HOST,
		subscription: env.PUBSUB_JOBS_SUBSCRIPTION,
		onError: (error) => log.error("subscriber error", { error: error.message }),
	});

	await subscriber.start((message) => queue.handle(message));
	log.info("worker listening", {
		subscription: env.PUBSUB_JOBS_SUBSCRIPTION,
		types: processors.map((processor) => processor.type),
	});

	const signal = await new Promise<NodeJS.Signals>((resolve) => {
		process.once("SIGINT", resolve);
		process.once("SIGTERM", resolve);
	});
	log.info("worker stopping", { signal });
	await subscriber.close();
	await db.close();
}

main().catch((error: unknown) => {
	logger.error("worker failed", {
		error: error instanceof Error ? error.message : String(error),
	});
	process.exit(1);
});
