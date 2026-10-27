export type MessageAttributes = Record<string, string>;

export interface Publisher {
	publish(type: string, data: unknown): Promise<void>;
}

export type QueueMessage = {
	id: string;
	type: string;
	data: unknown;
	attributes: MessageAttributes;
};

export interface MessageProcessor {
	readonly type: string;
	process(message: QueueMessage): Promise<void>;
}

export type ReceivedMessage = {
	id: string;
	attributes: MessageAttributes;
	data: Uint8Array;
	ack(): void;
	nack(): void;
};

export type MessageHandler = (message: ReceivedMessage) => Promise<void>;

export interface Subscriber {
	start(handler: MessageHandler): Promise<void>;
	close(): Promise<void>;
}
