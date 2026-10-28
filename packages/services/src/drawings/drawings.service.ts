import type { Db } from "@repo/db";
import { ServiceError } from "@repo/errors";
import type { Drawing, DrawingKind, LibraryDrawing, Member } from "@repo/types";
import { generatedAsset, publishAssetJob } from "../assets/assets.service.ts";
import type { AssetStorage } from "../assets/assets.types.ts";
import type { Publisher } from "../queue/queue.types.ts";
import {
	DRAWING_LIMITS,
	drawnSourceSchema,
	photoSourceSchema,
} from "./drawings.schemas.ts";
import type {
	CreateDrawingParams,
	RequestLiftParams,
} from "./drawings.types.ts";

export type { CreateDrawingParams };

const PNG_HEADER_BYTES = 33;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function isUsableBy(member: Member, drawing: Drawing): boolean {
	if (drawing.organizationId !== member.userOrganization.organizationId) {
		return false;
	}
	if (drawing.deletedAt !== null) return false;
	if (drawing.kind === "signature") {
		return drawing.ownerUserId === member.user.id;
	}
	return true;
}

function invalidDrawing(): ServiceError {
	return new ServiceError("invalid_input", "invalid_drawing");
}

function invalidMask(): ServiceError {
	return new ServiceError("invalid_input", "invalid_mask");
}

function validName(name: string): string {
	const trimmed = name.trim();
	if (
		trimmed === "" ||
		/\p{Cc}/u.test(name) ||
		[...trimmed].length > DRAWING_LIMITS.nameCharacters
	) {
		throw invalidDrawing();
	}
	return trimmed;
}

function maskSize(bytes: Uint8Array): { width: number; height: number } {
	if (bytes.byteLength < PNG_HEADER_BYTES) throw invalidMask();
	if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
		throw invalidMask();
	}
	const type = String.fromCharCode(
		bytes[12] ?? 0,
		bytes[13] ?? 0,
		bytes[14] ?? 0,
		bytes[15] ?? 0,
	);
	if (type !== "IHDR") throw invalidMask();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const width = view.getUint32(16);
	const height = view.getUint32(20);
	if (
		width < 1 ||
		height < 1 ||
		width > DRAWING_LIMITS.maskSidePx ||
		height > DRAWING_LIMITS.maskSidePx
	) {
		throw invalidMask();
	}
	return { width, height };
}

function libraryDrawing(drawing: Drawing): LibraryDrawing {
	return {
		id: drawing.id,
		kind: drawing.kind,
		name: drawing.name,
		aspect: drawing.aspect,
		maskAssetId: drawing.maskAssetId,
	};
}

export class DrawingService {
	constructor(
		private readonly db: Db,
		private readonly storage: AssetStorage,
		private readonly publisher: Publisher,
	) {}

	async requestLift(
		member: Member,
		params: RequestLiftParams,
	): Promise<{ assetId: string }> {
		const organizationId = member.userOrganization.organizationId;
		const photo = await this.db.assets.byId(
			organizationId,
			params.photoAssetId,
		);
		if (!photo) throw new ServiceError("not_found", "not_found");
		if (
			photo.origin.source !== "uploaded" ||
			photo.origin.purpose !== "photo"
		) {
			throw new ServiceError("invalid_input", "invalid_photo");
		}
		const asset = await this.db.transaction(async (tx) =>
			tx.assets.create(
				generatedAsset(organizationId, {
					kind: "lift-ink",
					photoAssetId: photo.id,
				}),
			),
		);
		await publishAssetJob(this.publisher, asset);
		return { assetId: asset.id };
	}

	async createDrawing(
		member: Member,
		params: CreateDrawingParams,
	): Promise<{ id: string }> {
		const name = validName(params.name);
		const drawn = drawnSourceSchema.safeParse(params.source);
		const photo = photoSourceSchema.safeParse(params.source);
		if (!drawn.success && !photo.success) throw invalidDrawing();
		if (params.kind !== "doodle" && params.kind !== "signature") {
			throw invalidDrawing();
		}
		const organizationId = member.userOrganization.organizationId;
		const asset = await this.db.assets.byId(organizationId, params.maskAssetId);
		if (!asset) throw new ServiceError("not_found", "not_found");
		if (asset.origin.source !== "uploaded" || asset.origin.purpose !== "mask") {
			throw invalidMask();
		}
		if (photo.success) {
			const sourcePhoto = await this.db.assets.byId(
				organizationId,
				photo.data.photoAssetId,
			);
			if (!sourcePhoto) throw new ServiceError("not_found", "not_found");
			if (
				sourcePhoto.origin.source !== "uploaded" ||
				sourcePhoto.origin.purpose !== "photo"
			) {
				throw invalidDrawing();
			}
		}
		const source = drawn.success
			? drawn.data
			: photo.success
				? photo.data
				: null;
		if (!source) throw invalidDrawing();
		const bytes = await this.storage.get(asset.storageKey);
		const { width, height } = maskSize(bytes);
		const drawing = await this.db.drawings.create({
			organizationId,
			ownerUserId: member.user.id,
			kind: params.kind,
			name,
			source,
			maskAssetId: asset.id,
			aspect: width / height,
		});
		return { id: drawing.id };
	}

	async listDrawings(
		member: Member,
		kind: DrawingKind,
	): Promise<LibraryDrawing[]> {
		const rows = await this.db.drawings.list(
			member.userOrganization.organizationId,
			kind,
		);
		return rows
			.filter((drawing) => isUsableBy(member, drawing))
			.map(libraryDrawing);
	}

	async renameDrawing(
		member: Member,
		drawingId: string,
		name: string,
	): Promise<void> {
		const next = validName(name);
		const drawing = await this.requireUsable(member, drawingId);
		await this.db.drawings.rename(drawing.organizationId, drawing.id, next);
	}

	async deleteDrawing(member: Member, drawingId: string): Promise<void> {
		const drawing = await this.requireUsable(member, drawingId);
		await this.db.drawings.softDelete(drawing.organizationId, drawing.id);
	}

	private async requireUsable(
		member: Member,
		drawingId: string,
	): Promise<Drawing> {
		const drawing = await this.db.drawings.byId(
			member.userOrganization.organizationId,
			drawingId,
		);
		if (!drawing) throw new ServiceError("not_found", "not_found");
		if (!isUsableBy(member, drawing)) {
			throw new ServiceError("forbidden", "not_owner");
		}
		return drawing;
	}
}
