import { createDb } from "@repo/db";
import {
	GcsAssetStorage,
	PubSubPublisher,
	PubSubSubscriber,
} from "@repo/integrations/shared/gcp";
import { OpentypeFontBuilder } from "@repo/integrations/worker/font";
import { SharpImageProcessor } from "@repo/integrations/worker/image";
import { AssetService, SWEEP_MESSAGE_TYPE } from "@repo/services/assets";
import { type MessageProcessor, QueueManager } from "@repo/services/queue";
import { env } from "./env.ts";
import { logger } from "./lib/logger.ts";
import { AssetBuildFontProcessor } from "./processors/asset-build-font.ts";
import { AssetLiftInkProcessor } from "./processors/asset-lift-ink.ts";
import { sweepProcessor } from "./processors/sweep.ts";

function fontBuilderParams() {
	const source = import.meta.url.endsWith(".ts");
	return {
		thread: source
			? {
					url: new URL(
						"../../../packages/integrations/src/worker/font/parse-thread.ts",
						import.meta.url,
					),
					execArgv: ["--import", "tsx"],
				}
			: {
					url: new URL(
						import.meta.url.replace(/index(\.m?js)$/, "parse-thread$1"),
					),
					execArgv: [],
				},
		parseTimeoutMs: 5_000,
		parseMaxMemoryMb: 256,
	};
}

async function main(): Promise<void> {
	const log = logger.child({ pool: env.WORKER_POOL });
	const db = createDb(env.DATABASE_URL);
	const storage = new GcsAssetStorage({
		bucket: env.GCS_ASSETS_BUCKET,
		projectId: env.GOOGLE_CLOUD_PROJECT,
		emulatorBaseUrl: env.STORAGE_EMULATOR_HOST,
	});
	const publisher = new PubSubPublisher({
		projectId: env.GOOGLE_CLOUD_PROJECT,
		emulatorHost: env.PUBSUB_EMULATOR_HOST,
		topic: env.PUBSUB_JOBS_TOPIC,
	});
	const assets = new AssetService(db, storage, publisher);
	const standard = env.WORKER_POOL === "standard";
	const processors: MessageProcessor[] = standard
		? [
				sweepProcessor(assets, log),
				new AssetLiftInkProcessor({
					db,
					assets,
					storage,
					images: new SharpImageProcessor(),
				}),
				new AssetBuildFontProcessor({
					db,
					assets,
					storage,
					builder: new OpentypeFontBuilder(fontBuilderParams()),
				}),
			]
		: [];
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

	const sweepEveryMs = standard ? env.SWEEP_EVERY_MS : undefined;
	const sweepTimer =
		sweepEveryMs === undefined
			? undefined
			: setInterval(() => {
					publisher.publish(SWEEP_MESSAGE_TYPE, {}).catch((error: unknown) => {
						log.error("sweep publish failed", {
							error: error instanceof Error ? error.message : String(error),
						});
					});
				}, sweepEveryMs);

	const signal = await new Promise<NodeJS.Signals>((resolve) => {
		process.once("SIGINT", resolve);
		process.once("SIGTERM", resolve);
	});
	log.info("worker stopping", { signal });
	clearInterval(sweepTimer);
	await subscriber.close();
	await publisher.close();
	await db.close();
}

main().catch((error: unknown) => {
	logger.error("worker failed", {
		error: error instanceof Error ? error.message : String(error),
	});
	process.exit(1);
});
