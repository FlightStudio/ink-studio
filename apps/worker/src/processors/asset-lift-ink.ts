import type { Db } from "@repo/db";
import { ServiceError } from "@repo/errors";
import {
	type AssetService,
	type AssetStorage,
	assetJobMessageSchema,
} from "@repo/services/assets";
import type { ImageProcessor } from "@repo/services/drawings";
import type { MessageProcessor, QueueMessage } from "@repo/services/queue";
import { assetMessageType } from "@repo/types";

export class AssetLiftInkProcessor implements MessageProcessor {
	readonly type = assetMessageType("lift-ink");

	constructor(
		private readonly params: {
			db: Db;
			assets: AssetService;
			storage: AssetStorage;
			images: ImageProcessor;
		},
	) {}

	async process(message: QueueMessage): Promise<void> {
		const parsed = assetJobMessageSchema.safeParse(message.data);
		if (!parsed.success) return;
		await this.params.assets.runJob({
			assetId: parsed.data.assetId,
			kind: "lift-ink",
			produce: async (job, asset) => {
				const photo = await this.params.db.assets.byId(
					asset.organizationId,
					job.photoAssetId,
				);
				if (!photo) throw new ServiceError("invalid_input", "photo_unreadable");
				const bytes = await this.params.storage.get(photo.storageKey);
				const mask = await this.params.images.liftInk(bytes);
				return { bytes: mask, mimeType: "image/png", result: null };
			},
		});
	}
}
