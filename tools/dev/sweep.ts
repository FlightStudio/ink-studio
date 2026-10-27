import { existsSync, readFileSync } from "node:fs";
import { PubSubPublisher } from "@repo/integrations/shared/gcp";
import { SWEEP_MESSAGE_TYPE } from "@repo/services/assets";

function loadEnv(path: string) {
	if (!existsSync(path)) return;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
		const splitAt = trimmed.indexOf("=");
		if (splitAt < 0) continue;
		const key = trimmed.slice(0, splitAt);
		if (process.env[key] !== undefined) continue;
		process.env[key] = trimmed.slice(splitAt + 1);
	}
}

loadEnv(".env");
loadEnv("tools/.env");

const projectId = process.env.GOOGLE_CLOUD_PROJECT;
const topic = process.env.PUBSUB_JOBS_TOPIC;
if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT is required");
if (!topic) throw new Error("PUBSUB_JOBS_TOPIC is required");

const publisher = new PubSubPublisher({
	projectId,
	emulatorHost: process.env.PUBSUB_EMULATOR_HOST || undefined,
	topic,
});
await publisher.publish(SWEEP_MESSAGE_TYPE, {});
await publisher.close();
console.log(JSON.stringify({ published: SWEEP_MESSAGE_TYPE, topic }));
