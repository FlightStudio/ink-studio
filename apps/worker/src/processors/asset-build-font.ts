import type { Db } from "@repo/db";
import { ServiceError } from "@repo/errors";
import type { FontBuilder } from "@repo/integrations/worker/font";
import { strokeOutline } from "@repo/render/html";
import {
	type AssetService,
	type AssetStorage,
	assetJobMessageSchema,
} from "@repo/services/assets";
import type { MessageProcessor, QueueMessage } from "@repo/services/queue";
import { assetMessageType, CELL } from "@repo/types";

export class AssetBuildFontProcessor implements MessageProcessor {
	readonly type = assetMessageType("build-font");

	constructor(
		private readonly params: {
			db: Db;
			assets: AssetService;
			storage: AssetStorage;
			builder: FontBuilder;
		},
	) {}

	private async photoOf(
		organizationId: string,
		assetId: string,
	): Promise<Uint8Array> {
		const photo = await this.params.db.assets.byId(organizationId, assetId);
		if (
			photo?.origin.source !== "uploaded" ||
			photo.origin.purpose !== "photo"
		) {
			throw new ServiceError("invalid_input", "template_markers_not_found");
		}
		return this.params.storage.get(photo.storageKey);
	}

	async process(message: QueueMessage): Promise<void> {
		const parsed = assetJobMessageSchema.safeParse(message.data);
		if (!parsed.success) return;
		await this.params.assets.runJob({
			assetId: parsed.data.assetId,
			kind: "build-font",
			produce: async (job, asset) => {
				const font = await this.params.db.fonts.byId(
					asset.organizationId,
					job.fontId,
				);
				if (!font) throw new ServiceError("invalid_input", "font_incomplete");
				const familyName = `own-${font.id}`;
				const built =
					font.source.kind === "template-photo"
						? await this.params.builder.fromTemplatePhoto({
								familyName,
								photo: await this.photoOf(
									font.organizationId,
									font.source.photoAssetId,
								),
							})
						: await this.params.builder.fromStrokeOutlines({
								familyName,
								glyphs: font.source.glyphs.map((glyph) => ({
									char: glyph.char,
									variant: glyph.variant,
									polygons: glyph.strokes.map((stroke) =>
										strokeOutline(stroke, CELL.strokeScale),
									),
								})),
							});
				return {
					bytes: built.bytes,
					mimeType: "font/otf",
					result: built.chars,
				};
			},
			onComplete: async (tx, asset, chars) => {
				if (
					asset.origin.source !== "generated" ||
					asset.origin.job.kind !== "build-font"
				) {
					throw new Error(`asset ${asset.id} is not a build-font job`);
				}
				const saved = await tx.fonts.finishBuild(
					asset.organizationId,
					asset.origin.job.fontId,
					asset.id,
					chars,
				);
				if (!saved) throw new ServiceError("invalid_input", "font_incomplete");
			},
		});
	}
}
