import type { Logger } from "@repo/logger";
import type { MessageProcessor, ReceivedMessage } from "./queue.types.ts";

export type QueueManagerParams = {
	processors: MessageProcessor[];
	logger: Logger;
};

export class QueueManager {
	private readonly processors = new Map<string, MessageProcessor>();
	private readonly logger: Logger;

	constructor(params: QueueManagerParams) {
		for (const processor of params.processors) {
			if (this.processors.has(processor.type)) {
				throw new Error(`Two processors for ${processor.type}`);
			}
			this.processors.set(processor.type, processor);
		}
		this.logger = params.logger;
	}

	async handle(message: ReceivedMessage): Promise<void> {
		const type = message.attributes.type ?? null;
		const processor = type === null ? undefined : this.processors.get(type);
		if (type === null || !processor) {
			this.logger.error("unknown message type", { id: message.id, type });
			message.ack();
			return;
		}

		let data: unknown;
		try {
			data = JSON.parse(new TextDecoder().decode(message.data));
		} catch (error) {
			this.logger.error("unreadable message", {
				id: message.id,
				type,
				error: errorText(error),
			});
			message.ack();
			return;
		}

		try {
			await processor.process({
				id: message.id,
				type,
				data,
				attributes: message.attributes,
			});
		} catch (error) {
			this.logger.error("message failed", {
				id: message.id,
				type,
				error: errorText(error),
			});
			message.nack();
			return;
		}
		message.ack();
	}
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
