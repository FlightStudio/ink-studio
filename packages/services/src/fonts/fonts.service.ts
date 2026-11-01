import type { Db, FontWithBuild } from "@repo/db";
import { ServiceError } from "@repo/errors";
import type {
	DrawnGlyph,
	EditableFont,
	Font,
	FontOption,
	FontSource,
	FontStatus,
	Member,
} from "@repo/types";
import { missingChars, missingLowercase } from "@repo/types";
import {
	asApiErrorCode,
	generatedAsset,
	publishAssetJob,
} from "../assets/assets.service.ts";
import type { Publisher } from "../queue/index.ts";
import { parseDrawnGlyph, parseOwnerName } from "./fonts.schemas.ts";
import type { CreateFontParams, SaveGlyphParams } from "./fonts.types.ts";

export function isOwnFont(member: Member, font: Font): boolean {
	return (
		member.user.id === font.ownerUserId &&
		member.userOrganization.organizationId === font.organizationId
	);
}

function replaceCell(
	glyphs: readonly DrawnGlyph[],
	glyph: DrawnGlyph,
): DrawnGlyph[] {
	const index = glyphs.findIndex(
		(existing) =>
			existing.char === glyph.char && existing.variant === glyph.variant,
	);
	if (index < 0) return [...glyphs, glyph];
	return glyphs.map((existing, position) =>
		position === index ? glyph : existing,
	);
}

function statusOf(font: FontWithBuild): {
	status: FontStatus;
	error: string | null;
} {
	const build = font.pendingBuild;
	if (build?.status === "pending" || build?.status === "running") {
		return { status: "building", error: null };
	}
	if (build?.status === "failed") {
		return { status: "failed", error: asApiErrorCode(build.error) };
	}
	if (font.fontAssetId !== null) {
		return {
			status: missingLowercase(font.chars).length > 0 ? "incomplete" : "ready",
			error: null,
		};
	}
	if (font.source.kind === "drawn") return { status: "drawing", error: null };
	return { status: "failed", error: "internal_error" };
}

function toOption(font: FontWithBuild): FontOption {
	return {
		id: font.id,
		ownerName: font.ownerName,
		source: font.source.kind,
		...statusOf(font),
		assetId: font.fontAssetId,
		pendingAssetId: font.pendingFontAssetId,
		chars: font.chars,
		missingRequired:
			font.source.kind === "drawn"
				? missingChars(font.source.glyphs).length
				: 0,
	};
}

function toEditable(font: FontWithBuild): EditableFont {
	return {
		...toOption(font),
		glyphs: font.source.kind === "drawn" ? font.source.glyphs : [],
	};
}

export class FontService {
	constructor(
		private readonly db: Db,
		private readonly publisher: Publisher,
	) {}

	async createFont(
		member: Member,
		params: CreateFontParams,
	): Promise<{ id: string; assetId?: string }> {
		const ownerName = parseOwnerName(params.ownerName);
		const organizationId = member.userOrganization.organizationId;
		if (params.source?.kind === "template-photo") {
			const photo = await this.db.assets.byId(
				organizationId,
				params.source.photoAssetId,
			);
			if (
				photo?.origin.source !== "uploaded" ||
				photo.origin.purpose !== "photo"
			) {
				throw new ServiceError("not_found", "not_found");
			}
			const created = await this.db.transaction(async (tx) => {
				const font = await tx.fonts.create({
					organizationId,
					ownerUserId: member.user.id,
					ownerName,
					source: {
						kind: "template-photo",
						templateVersion: 1,
						photoAssetId: photo.id,
					},
					fontAssetId: null,
					pendingFontAssetId: null,
					chars: "",
				});
				const asset = await tx.assets.create(
					generatedAsset(organizationId, {
						kind: "build-font",
						fontId: font.id,
					}),
				);
				const pending = await tx.fonts.setPending(
					organizationId,
					font.id,
					asset.id,
				);
				if (!pending) throw new ServiceError("not_found", "not_found");
				return { font, asset };
			});
			await publishAssetJob(this.publisher, created.asset);
			return { id: created.font.id, assetId: created.asset.id };
		}
		if (params.source?.kind === "upload") {
			const file = await this.db.assets.byId(
				organizationId,
				params.source.fileAssetId,
			);
			if (!file) throw new ServiceError("not_found", "not_found");
			if (
				file.origin.source !== "uploaded" ||
				file.origin.purpose !== "font-file"
			) {
				throw new ServiceError("invalid_input", "unsupported_file");
			}
			const created = await this.db.transaction(async (tx) => {
				const font = await tx.fonts.create({
					organizationId,
					ownerUserId: member.user.id,
					ownerName,
					source: { kind: "upload", fileAssetId: file.id },
					fontAssetId: null,
					pendingFontAssetId: null,
					chars: "",
				});
				const asset = await tx.assets.create(
					generatedAsset(organizationId, {
						kind: "build-font",
						fontId: font.id,
					}),
				);
				const pending = await tx.fonts.setPending(
					organizationId,
					font.id,
					asset.id,
				);
				if (!pending) throw new ServiceError("not_found", "not_found");
				return { font, asset };
			});
			await publishAssetJob(this.publisher, created.asset);
			return { id: created.font.id, assetId: created.asset.id };
		}
		const font = await this.db.fonts.create({
			organizationId,
			ownerUserId: member.user.id,
			ownerName,
			source: { kind: "drawn", glyphs: [] },
			fontAssetId: null,
			pendingFontAssetId: null,
			chars: "",
		});
		return { id: font.id };
	}

	async saveGlyph(
		member: Member,
		fontId: string,
		params: SaveGlyphParams,
	): Promise<void> {
		const glyph = parseDrawnGlyph(params);
		if (!glyph) throw new ServiceError("invalid_input", "invalid_glyphs");
		const organizationId = member.userOrganization.organizationId;
		await this.db.transaction(async (tx) => {
			const font = await tx.fonts.lockById(organizationId, fontId);
			if (!font) throw new ServiceError("not_found", "not_found");
			if (!isOwnFont(member, font)) {
				throw new ServiceError("forbidden", "not_owner");
			}
			if (font.source.kind !== "drawn") {
				throw new ServiceError("invalid_input", "invalid_glyphs");
			}
			const source: FontSource = {
				kind: "drawn",
				glyphs: replaceCell(font.source.glyphs, glyph),
			};
			const saved = await tx.fonts.saveSource(organizationId, fontId, source);
			if (!saved) throw new ServiceError("not_found", "not_found");
		});
	}

	async listFonts(member: Member): Promise<FontOption[]> {
		const fonts = await this.db.fonts.listByOwner(
			member.userOrganization.organizationId,
			member.user.id,
		);
		return fonts.filter((font) => isOwnFont(member, font)).map(toOption);
	}

	async getFont(member: Member, fontId: string): Promise<EditableFont | null> {
		const font = await this.db.fonts.byId(
			member.userOrganization.organizationId,
			fontId,
		);
		if (!font || !isOwnFont(member, font)) return null;
		return toEditable(font);
	}

	async requestBuild(
		member: Member,
		fontId: string,
	): Promise<{ assetId: string }> {
		const organizationId = member.userOrganization.organizationId;
		const asset = await this.db.transaction(async (tx) => {
			const font = await tx.fonts.lockById(organizationId, fontId);
			if (!font) throw new ServiceError("not_found", "not_found");
			if (!isOwnFont(member, font)) {
				throw new ServiceError("forbidden", "not_owner");
			}
			if (
				font.source.kind === "drawn" &&
				missingChars(font.source.glyphs).length > 0
			) {
				throw new ServiceError("invalid_input", "font_incomplete");
			}
			const created = await tx.assets.create(
				generatedAsset(organizationId, { kind: "build-font", fontId: font.id }),
			);
			const pending = await tx.fonts.setPending(
				organizationId,
				font.id,
				created.id,
			);
			if (!pending) throw new ServiceError("not_found", "not_found");
			return created;
		});
		await publishAssetJob(this.publisher, asset);
		return { assetId: asset.id };
	}

	async deleteFont(member: Member, fontId: string): Promise<void> {
		const organizationId = member.userOrganization.organizationId;
		const font = await this.db.fonts.byId(organizationId, fontId);
		if (!font) throw new ServiceError("not_found", "not_found");
		if (!isOwnFont(member, font)) {
			throw new ServiceError("forbidden", "not_owner");
		}
		const deleted = await this.db.fonts.softDelete(organizationId, fontId);
		if (!deleted) throw new ServiceError("not_found", "not_found");
	}
}
