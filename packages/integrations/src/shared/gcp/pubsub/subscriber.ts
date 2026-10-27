import { type Message, PubSub, type Subscription } from "@google-cloud/pubsub";
import type { MessageHandler, Subscriber } from "@repo/services/queue";

export type PubSubSubscriberParams = {
	projectId: string;
	emulatorHost?: string;
	subscription: string;
	onError: (error: Error) => void;
};

export class PubSubSubscriber implements Subscriber {
	private readonly client: PubSub;
	private readonly subscription: Subscription;
	private readonly onError: (error: Error) => void;

	constructor(params: PubSubSubscriberParams) {
		this.client = new PubSub({
			projectId: params.projectId,
			apiEndpoint: params.emulatorHost,
		});
		this.subscription = this.client.subscription(params.subscription);
		this.onError = params.onError;
	}

	async start(handler: MessageHandler): Promise<void> {
		await this.subscription.getMetadata();
		this.subscription.on("error", this.onError);
		this.subscription.on("message", (message: Message) => {
			handler({
				id: message.id,
				attributes: message.attributes,
				data: new Uint8Array(message.data),
				ack: () => message.ack(),
				nack: () => message.nack(),
			}).catch((error: unknown) => {
				message.nack();
				this.onError(error instanceof Error ? error : new Error(String(error)));
			});
		});
	}

	async close(): Promise<void> {
		await this.subscription.close();
		await this.client.close();
	}
}
