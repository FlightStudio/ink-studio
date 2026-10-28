import type { Db } from "@repo/db";
import { ServiceError } from "@repo/errors";
import type {
	DrawnGlyph,
	EditableFont,
	Font,
	FontOption,
	FontSource,
	Member,
} from "@repo/types";
import { missingChars } from "@repo/types";
import { generatedAsset, publishAssetJob } from "../assets/assets.service.ts";
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

function toOption(font: Font): FontOption {
	return {
		id: font.id,
		ownerName: font.ownerName,
		assetId: font.fontAssetId,
		building: font.pendingFontAssetId !== null,
		chars: font.chars,
	};
}

function toEditable(font: Font): EditableFont {
	return {
		id: font.id,
		ownerName: font.ownerName,
		glyphs: font.source.glyphs,
		assetId: font.fontAssetId,
		building: font.pendingFontAssetId !== null,
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
	): Promise<{ id: string }> {
		const ownerName = parseOwnerName(params.ownerName);
		if (ownerName === null) {
			throw new ServiceError("invalid_input", "invalid_owner_name");
		}
		const font = await this.db.fonts.create({
			organizationId: member.userOrganization.organizationId,
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
			if (missingChars(font.source.glyphs).length > 0) {
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
