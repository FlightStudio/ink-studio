import { PubSub, type Topic } from "@google-cloud/pubsub";
import type { Publisher } from "@repo/services/queue";

export type PubSubPublisherParams = {
	projectId: string;
	emulatorHost?: string;
	topic: string;
};

export class PubSubPublisher implements Publisher {
	private readonly client: PubSub;
	private readonly topic: Topic;

	constructor(params: PubSubPublisherParams) {
		this.client = new PubSub({
			projectId: params.projectId,
			apiEndpoint: params.emulatorHost,
		});
		this.topic = this.client.topic(params.topic);
	}

	async publish(type: string, data: unknown): Promise<void> {
		await this.topic.publishMessage({
			data: Buffer.from(JSON.stringify(data)),
			attributes: { type },
		});
	}

	async close(): Promise<void> {
		await this.topic.flush();
		await this.client.close();
	}
}
