import { readFile } from "node:fs/promises";
import type { Db } from "@repo/db";
import { ServiceError } from "@repo/errors";
import { renderLetterHtml } from "@repo/render";
import {
	measureInputFor,
	measureLetter,
	placementIssues,
	sidesUsed,
} from "@repo/render/html";
import { parseLetterContent } from "@repo/render/schema";
import {
	type AssetService,
	type AssetStorage,
	assetJobMessageSchema,
} from "@repo/services/assets";
import {
	letterResources,
	type PrintRenderer,
	type PrintResource,
	proofFontBindings,
} from "@repo/services/letters";
import type { MessageProcessor, QueueMessage } from "@repo/services/queue";
import {
	assetMessageType,
	type LetterContent,
	LONGEST_MERGE_VALUES,
	PAGE_SPECS,
	STOCK_FONTS,
} from "@repo/types";

const ASSET_BASE = "https://letter.invalid/assets/";
const STOCK_BASE = "https://letter.invalid/stock/";

export class AssetRenderLetterProcessor implements MessageProcessor {
	readonly type = assetMessageType("render-letter");

	constructor(
		private readonly params: {
			db: Db;
			assets: AssetService;
			storage: AssetStorage;
			renderer: PrintRenderer;
			stockFontsDir: URL;
		},
	) {}

	async process(message: QueueMessage): Promise<void> {
		const parsed = assetJobMessageSchema.safeParse(message.data);
		if (!parsed.success) return;
		await this.params.assets.runJob({
			assetId: parsed.data.assetId,
			kind: "render-letter",
			produce: async (job, asset) => {
				let content: LetterContent;
				try {
					content = parseLetterContent(job.content);
				} catch {
					throw new ServiceError("invalid_input", "invalid_letter");
				}
				const spec = PAGE_SPECS[content.format];
				const fonts = await proofFontBindings(
					this.params.db,
					asset.organizationId,
					content,
					job.fonts,
				);
				const resources = {
					...(await letterResources(
						this.params.db,
						asset.organizationId,
						content,
						{ assetBaseUrl: ASSET_BASE, stockFontBaseUrl: STOCK_BASE },
					)),
					fonts,
				};
				const files = await this.filesOf(
					asset.organizationId,
					content,
					resources,
				);
				const input = measureInputFor(spec, "print");
				const boxes = content.doc.attrs.elements.map((element) => ({
					id: element.id,
					side: element.side,
					xIn: element.xIn,
					yIn: element.yIn,
					widthIn: element.widthIn,
					heightIn: element.heightIn,
					rotationDeg: element.rotationDeg,
				}));
				const measured = await this.params.renderer.measure({
					html: renderLetterHtml({
						letterId: job.letterId,
						content,
						resources,
						mergeValues: LONGEST_MERGE_VALUES,
					}),
					resources: files,
					measure: measureLetter,
					input,
				});
				const sides = sidesUsed(spec, {
					textBottomIn: measured.textBottomIn,
					boxes,
					minSides: content.doc.attrs.minSides,
				});
				if (placementIssues(spec, { boxes, sides }).length > 0) {
					throw new ServiceError("invalid_input", "letter_placement");
				}
				if (measured.wordsPastLimit > 0) {
					throw new ServiceError("invalid_input", "letter_overflow");
				}
				const bytes = await this.params.renderer.render({
					html: renderLetterHtml({
						letterId: job.letterId,
						content,
						resources,
						mergeValues: job.mergeValues,
					}),
					resources: files,
					measure: measureLetter,
					input,
					sheet: { widthIn: spec.widthIn, heightIn: spec.heightIn },
					output: job.output,
					sides: (next) =>
						sidesUsed(spec, {
							textBottomIn: next.textBottomIn,
							boxes,
							minSides: content.doc.attrs.minSides,
						}),
				});
				return {
					bytes,
					mimeType:
						job.output.format === "pdf" ? "application/pdf" : "image/png",
					result: null,
				};
			},
		});
	}

	private async filesOf(
		organizationId: string,
		content: LetterContent,
		resources: Awaited<ReturnType<typeof letterResources>>,
	): Promise<Map<string, PrintResource>> {
		const files = new Map<string, PrintResource>();
		const ids = new Set<string>([
			...Object.values(resources.fonts),
			...Object.values(resources.drawings).map(
				(drawing) => drawing.maskAssetId,
			),
		]);
		const front = content.doc.attrs.frontImageAssetId;
		if (front) ids.add(front);
		for (const assetId of ids) {
			const stored = await this.params.db.assets.byId(organizationId, assetId);
			if (!stored) throw new Error(`asset ${assetId} is missing`);
			files.set(`${ASSET_BASE}${assetId}`, {
				bytes: await this.params.storage.get(stored.storageKey),
				contentType: stored.mimeType,
			});
		}
		for (const [id, font] of Object.entries(STOCK_FONTS)) {
			files.set(`${STOCK_BASE}${id}`, {
				bytes: new Uint8Array(
					await readFile(new URL(font.file, this.params.stockFontsDir)),
				),
				contentType: "font/ttf",
			});
		}
		return files;
	}
}
