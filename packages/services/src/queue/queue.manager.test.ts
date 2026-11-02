import type { Logger } from "@repo/logger";
import { describe, expect, it, vi } from "vitest";
import { QueueManager } from "./queue.manager.ts";
import type {
	MessageProcessor,
	QueueMessage,
	ReceivedMessage,
} from "./queue.types.ts";

describe("QueueManager", () => {
	it("a message goes to the processor for its type", async () => {
		const lift = processor("asset.lift-ink");
		const render = processor("asset.render-letter");
		const manager = new QueueManager({
			processors: [lift, render],
			logger: recordingLogger(),
		});

		await manager.handle(received("asset.render-letter", { assetId: "a1" }));

		expect(lift.process).not.toHaveBeenCalled();
		expect(render.process).toHaveBeenCalledOnce();
		expect(render.process).toHaveBeenCalledWith<[QueueMessage]>({
			id: "m1",
			type: "asset.render-letter",
			data: { assetId: "a1" },
			attributes: { type: "asset.render-letter" },
		});
	});

	it("a processed message is acked", async () => {
		const manager = new QueueManager({
			processors: [processor("sweep")],
			logger: recordingLogger(),
		});
		const message = received("sweep", {});

		await manager.handle(message);

		expect(message.ack).toHaveBeenCalledOnce();
		expect(message.nack).not.toHaveBeenCalled();
	});

	it("a message whose processor throws is nacked and logged", async () => {
		const failing = processor("sweep", async () => {
			throw new Error("boom");
		});
		const logger = recordingLogger();
		const manager = new QueueManager({ processors: [failing], logger });
		const message = received("sweep", {});

		await manager.handle(message);

		expect(message.nack).toHaveBeenCalledOnce();
		expect(message.ack).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith(
			"message failed",
			expect.objectContaining({ id: "m1", type: "sweep", error: "boom" }),
		);
	});

	it("a message of an unknown type is acked and logged without processing", async () => {
		const sweep = processor("sweep");
		const logger = recordingLogger();
		const manager = new QueueManager({ processors: [sweep], logger });
		const message = received("asset.unknown", {});

		await manager.handle(message);

		expect(sweep.process).not.toHaveBeenCalled();
		expect(message.ack).toHaveBeenCalledOnce();
		expect(message.nack).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith(
			"unknown message type",
			expect.objectContaining({ id: "m1", type: "asset.unknown" }),
		);
	});

	it("a message without a type is acked and logged without processing", async () => {
		const sweep = processor("sweep");
		const logger = recordingLogger();
		const manager = new QueueManager({ processors: [sweep], logger });
		const message = { ...received("sweep", {}), attributes: {} };

		await manager.handle(message);

		expect(sweep.process).not.toHaveBeenCalled();
		expect(message.ack).toHaveBeenCalledOnce();
		expect(logger.error).toHaveBeenCalledWith(
			"unknown message type",
			expect.objectContaining({ id: "m1", type: null }),
		);
	});

	it("a message whose data is not JSON is acked and logged without processing", async () => {
		const sweep = processor("sweep");
		const logger = recordingLogger();
		const manager = new QueueManager({ processors: [sweep], logger });
		const message = {
			...received("sweep", {}),
			data: new TextEncoder().encode("{not json"),
		};

		await manager.handle(message);

		expect(sweep.process).not.toHaveBeenCalled();
		expect(message.ack).toHaveBeenCalledOnce();
		expect(logger.error).toHaveBeenCalledWith(
			"unreadable message",
			expect.objectContaining({ id: "m1", type: "sweep" }),
		);
	});

	it("two processors for one type are refused", () => {
		expect(
			() =>
				new QueueManager({
					processors: [processor("sweep"), processor("sweep")],
					logger: recordingLogger(),
				}),
		).toThrow("sweep");
	});
});

function processor(
	type: string,
	process: (message: QueueMessage) => Promise<void> = async () => {},
) {
	return { type, process: vi.fn(process) } satisfies MessageProcessor;
}

function received(type: string, data: unknown) {
	return {
		id: "m1",
		attributes: { type },
		data: new TextEncoder().encode(JSON.stringify(data)),
		ack: vi.fn(),
		nack: vi.fn(),
	} satisfies ReceivedMessage;
}

function recordingLogger() {
	const logger = {
		info: vi.fn(),
		error: vi.fn(),
		child: vi.fn((): Logger => logger),
	};
	return logger;
}
