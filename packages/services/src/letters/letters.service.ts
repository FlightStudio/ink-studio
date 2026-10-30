import type { BlankDraft, Db, LetterCursor, Tx } from "@repo/db";
import { ServiceError } from "@repo/errors";
import { parseLetterContent } from "@repo/render/schema";
import type {
	Asset,
	Drawing,
	Font,
	InkStyle,
	LetterContent,
	LetterResources,
	Member,
	PageFormatId,
	PlacedElement,
	PrintOutput,
	ProductKind,
} from "@repo/types";
import {
	DEFAULT_FORMAT,
	missingLowercase,
	normaliseLetterTitle,
	ownFontIds,
	PAGE_SPECS,
	SAMPLE_MERGE_VALUES,
} from "@repo/types";
import { z } from "zod";
import { generatedAsset, publishAssetJob } from "../assets/assets.service.ts";
import type { Publisher } from "../queue/queue.types.ts";
import { letterPreview } from "./letter-preview.ts";
import type {
	CreateLetterParams,
	EditableLetter,
	LetterListPage,
	ListLettersParams,
	RequestExportParams,
	SaveLetterParams,
} from "./letters.types.ts";

const UNTITLED = {
	letter: "Untitled letter",
	postcard: "Untitled postcard",
} as const satisfies Record<ProductKind, string>;

const DEFAULT_INK_STYLE: InkStyle = {
	font: { kind: "stock", id: "caveat" },
	sizePt: 20,
	color: "ink-blue",
};

export const LETTER_PAGE_SIZE = 24;

function newLetterContent(format: PageFormatId): LetterContent {
	const spec = PAGE_SPECS[format];
	return {
		schemaVersion: 1,
		format,
		defaults: DEFAULT_INK_STYLE,
		doc: {
			type: "doc",
			attrs: {
				elements: [],
				minSides: spec.front === "image" ? 2 : 1,
				frontImageAssetId: null,
			},
			content: [{ type: "paragraph", attrs: { align: "left" } }],
		},
	};
}

const BLANK_DRAFTS: readonly BlankDraft[] = (
	Object.keys(PAGE_SPECS) as PageFormatId[]
).map((format) => ({
	format,
	title: UNTITLED[PAGE_SPECS[format].product],
	minSides: newLetterContent(format).doc.attrs.minSides,
}));

const cursorSchema = z.tuple([z.iso.datetime({ precision: 6 }), z.uuid()]);

function encodeCursor(cursor: LetterCursor): string {
	return Buffer.from(`${cursor.updatedAt}|${cursor.id}`).toString("base64url");
}

function decodeCursor(cursor: string): LetterCursor {
	const parsed = cursorSchema.safeParse(
		Buffer.from(cursor, "base64url").toString("utf8").split("|"),
	);
	if (!parsed.success) {
		throw new ServiceError("invalid_input", "invalid_request");
	}
	const [updatedAt, id] = parsed.data;
	return { updatedAt, id };
}

function validContent(json: unknown): LetterContent {
	let content: LetterContent;
	try {
		content = parseLetterContent(json);
	} catch {
		throw new ServiceError("invalid_input", "invalid_letter");
	}
	return content;
}

async function referencedFonts(
	db: Tx,
	organizationId: string,
	content: LetterContent,
): Promise<Font[]> {
	const ids = ownFontIds(content);
	if (ids.length === 0) return [];
	return db.fonts.referenced(organizationId, ids);
}

async function knownFonts(
	db: Tx,
	member: Member,
	letterId: string,
	content: LetterContent,
): Promise<void> {
	const ids = ownFontIds(content);
	if (ids.length === 0) return;
	const organizationId = member.userOrganization.organizationId;
	const found = await referencedFonts(db, organizationId, content);
	if (found.length !== ids.length) {
		throw new ServiceError("invalid_input", "invalid_letter");
	}
	for (const font of found) {
		if (font.ownerUserId !== member.user.id) {
			throw new ServiceError("forbidden", "not_owner");
		}
	}
	const deleted = found.filter((font) => font.deletedAt !== null);
	if (deleted.length > 0) {
		const stored = await db.letters.byId(organizationId, letterId);
		if (stored === null) throw new ServiceError("not_found", "not_found");
		const used = new Set(ownFontIds(stored.content));
		if (deleted.some((font) => !used.has(font.id))) {
			throw new ServiceError("invalid_input", "invalid_letter");
		}
	}
	for (const font of found) {
		if (font.fontAssetId === null) {
			throw new ServiceError("invalid_input", "font_not_ready");
		}
	}
}

function sealRecord(
	fonts: readonly Font[],
): Record<string, { ownerName: string; chars: string }> {
	const record: Record<string, { ownerName: string; chars: string }> = {};
	for (const font of fonts) {
		record[font.id] = { ownerName: font.ownerName, chars: font.chars };
	}
	return record;
}

function validTitle(title: string): string {
	const trimmed = normaliseLetterTitle(title);
	if (trimmed === null) {
		throw new ServiceError("invalid_input", "invalid_title");
	}
	return trimmed;
}

function placedDrawingIds(
	content: LetterContent,
	kind?: PlacedElement["kind"],
): string[] {
	return [
		...new Set(
			content.doc.attrs.elements
				.filter((element) => kind === undefined || element.kind === kind)
				.map((element) => element.drawingId),
		),
	];
}

function signatureIds(content: LetterContent): string[] {
	return placedDrawingIds(content, "signature");
}

async function knownDrawings(
	db: Tx,
	organizationId: string,
	content: LetterContent,
): Promise<void> {
	const ids = placedDrawingIds(content, "drawing");
	if (ids.length === 0) return;
	const found = await db.drawings.referenced(organizationId, ids);
	if (
		found.length !== ids.length ||
		found.some((drawing) => drawing.kind !== "doodle")
	) {
		throw new ServiceError("invalid_input", "invalid_letter");
	}
}

async function knownSignatures(
	db: Tx,
	member: Member,
	content: LetterContent,
): Promise<void> {
	const ids = signatureIds(content);
	if (ids.length === 0) return;
	const found = await db.drawings.referenced(
		member.userOrganization.organizationId,
		ids,
	);
	if (found.length !== ids.length) {
		throw new ServiceError("invalid_input", "invalid_letter");
	}
	for (const drawing of found) {
		if (drawing.kind !== "signature") {
			throw new ServiceError("invalid_input", "invalid_letter");
		}
		if (drawing.ownerUserId !== member.user.id) {
			throw new ServiceError("forbidden", "not_owner");
		}
	}
}

async function knownCover(
	db: Tx,
	organizationId: string,
	content: LetterContent,
): Promise<void> {
	const assetId = content.doc.attrs.frontImageAssetId;
	if (assetId === null) return;
	const asset = await db.assets.byId(organizationId, assetId);
	if (asset?.origin.source !== "uploaded" || asset.origin.purpose !== "cover") {
		throw new ServiceError("invalid_input", "invalid_letter");
	}
}

const EDITOR_BASES = {
	assetBaseUrl: "/api/assets/",
	stockFontBaseUrl: "/fonts/stock/",
};

type ResourceRows = {
	drawings: readonly Drawing[];
	fonts: readonly Font[];
	covers: readonly Asset[];
};

async function resourceRows(
	tx: Tx,
	organizationId: string,
	contents: readonly LetterContent[],
): Promise<ResourceRows> {
	const unique = (ids: string[]) => [...new Set(ids)];
	const drawingIds = unique(
		contents.flatMap((content) => placedDrawingIds(content)),
	);
	const fontIds = unique(contents.flatMap(ownFontIds));
	const coverIds = unique(
		contents.flatMap((content) => {
			const id = content.doc.attrs.frontImageAssetId;
			return id === null ? [] : [id];
		}),
	);
	const [drawings, fonts, covers] = await Promise.all([
		tx.drawings.referenced(organizationId, drawingIds),
		tx.fonts.referenced(organizationId, fontIds),
		tx.assets.referenced(organizationId, coverIds),
	]);
	return { drawings, fonts, covers };
}

function resourcesFrom(
	content: LetterContent,
	rows: ResourceRows,
	bases: { assetBaseUrl: string; stockFontBaseUrl: string },
): LetterResources {
	const drawingIds = new Set(placedDrawingIds(content));
	const drawings: LetterResources["drawings"] = {};
	for (const drawing of rows.drawings) {
		if (!drawingIds.has(drawing.id)) continue;
		drawings[drawing.id] = {
			maskAssetId: drawing.maskAssetId,
			aspect: drawing.aspect,
		};
	}
	const fontIds = new Set(ownFontIds(content));
	const fonts: LetterResources["fonts"] = {};
	for (const font of rows.fonts) {
		if (fontIds.has(font.id) && font.fontAssetId !== null) {
			fonts[font.id] = font.fontAssetId;
		}
	}
	const frontId = content.doc.attrs.frontImageAssetId;
	const front = rows.covers.find((asset) => asset.id === frontId);
	const frontImageAssetId =
		front?.origin.source === "uploaded" && front.origin.purpose === "cover"
			? front.id
			: null;
	return {
		assetBaseUrl: bases.assetBaseUrl,
		stockFontBaseUrl: bases.stockFontBaseUrl,
		fonts,
		drawings,
		frontImageAssetId,
	};
}

export async function letterResources(
	tx: Tx,
	organizationId: string,
	content: LetterContent,
	bases: { assetBaseUrl: string; stockFontBaseUrl: string } = EDITOR_BASES,
): Promise<LetterResources> {
	return resourcesFrom(
		content,
		await resourceRows(tx, organizationId, [content]),
		bases,
	);
}

export async function proofFontBindings(
	tx: Tx,
	organizationId: string,
	content: LetterContent,
	supplied: unknown,
): Promise<Record<string, string>> {
	const parsed = z.record(z.uuid(), z.uuid()).safeParse(supplied);
	if (!parsed.success)
		throw new ServiceError("invalid_input", "proof_fonts_unavailable");
	const ids = ownFontIds(content);
	const fonts = await tx.fonts.referenced(organizationId, ids);
	if (fonts.length !== ids.length || ids.some((id) => !parsed.data[id])) {
		throw new ServiceError("invalid_input", "proof_fonts_unavailable");
	}
	const bindings: Record<string, string> = {};
	const assets = await tx.assets.referenced(
		organizationId,
		ids.map((id) => parsed.data[id] ?? ""),
	);
	const byId = new Map(assets.map((asset) => [asset.id, asset]));
	for (const fontId of ids) {
		const asset = byId.get(parsed.data[fontId] ?? "");
		if (
			asset?.processing.status !== "done" ||
			asset.origin.source !== "generated" ||
			asset.origin.job.kind !== "build-font" ||
			asset.origin.job.fontId !== fontId
		) {
			throw new ServiceError("invalid_input", "proof_fonts_unavailable");
		}
		bindings[fontId] = asset.id;
	}
	return bindings;
}

export async function letterOwnerIds(
	tx: Tx,
	organizationId: string,
	content: LetterContent,
): Promise<Set<string>> {
	const owners = new Set<string>();
	for (const font of await referencedFonts(tx, organizationId, content)) {
		owners.add(font.ownerUserId);
	}
	const signatures = signatureIds(content);
	if (signatures.length > 0) {
		for (const drawing of await tx.drawings.referenced(
			organizationId,
			signatures,
		)) {
			if (drawing.kind === "signature") owners.add(drawing.ownerUserId);
		}
	}
	return owners;
}

async function creatableFont(
	db: Tx,
	member: Member,
	fontId: string,
): Promise<void> {
	const found = await db.fonts.referenced(
		member.userOrganization.organizationId,
		[fontId],
	);
	const font = found[0];
	if (found.length !== 1 || !font || font.deletedAt !== null) {
		throw new ServiceError("invalid_input", "invalid_letter");
	}
	if (font.ownerUserId !== member.user.id) {
		throw new ServiceError("forbidden", "not_owner");
	}
	if (font.fontAssetId === null || missingLowercase(font.chars).length > 0) {
		throw new ServiceError("invalid_input", "font_not_ready");
	}
}

function proofOutputs(content: LetterContent): PrintOutput[] {
	const spec = PAGE_SPECS[content.format];
	if (spec.output === "pdf") {
		return [{ format: "pdf", duplex: spec.duplex }];
	}
	return Array.from({ length: spec.maxPages }, (_, side) => ({
		format: "png",
		side,
	}));
}

export class LetterService {
	constructor(
		private readonly db: Db,
		private readonly publisher: Publisher,
	) {}

	async createLetter(
		member: Member,
		params: CreateLetterParams,
	): Promise<{ id: string }> {
		const format = params.format ?? DEFAULT_FORMAT;
		const content = newLetterContent(format);
		if (params.fontId) {
			await creatableFont(this.db, member, params.fontId);
			content.defaults = {
				...content.defaults,
				font: { kind: "own", fontId: params.fontId },
			};
		}
		const letter = await this.db.letters.create({
			organizationId: member.userOrganization.organizationId,
			title: UNTITLED[PAGE_SPECS[format].product],
			content,
		});
		return { id: letter.id };
	}

	async getLetter(
		member: Member,
		letterId: string,
	): Promise<EditableLetter | null> {
		const organizationId = member.userOrganization.organizationId;
		const letter = await this.db.letters.byId(organizationId, letterId);
		if (!letter) return null;
		const [resources, ownerIds, fonts] = await Promise.all([
			letterResources(this.db, organizationId, letter.content),
			letterOwnerIds(this.db, organizationId, letter.content),
			referencedFonts(this.db, organizationId, letter.content),
		]);
		return {
			id: letter.id,
			title: letter.title,
			content: letter.content,
			revision: letter.revision,
			resources,
			sealFonts: sealRecord(fonts),
			editable: [...ownerIds].every((id) => id === member.user.id),
		};
	}

	async listLetters(
		member: Member,
		params: ListLettersParams,
	): Promise<LetterListPage> {
		const organizationId = member.userOrganization.organizationId;
		const page = await this.db.letters.list(organizationId, {
			limit: LETTER_PAGE_SIZE,
			after: params.cursor === undefined ? null : decodeCursor(params.cursor),
			hideBlank: BLANK_DRAFTS,
		});
		const listed = page.letters.map((letter) => ({
			letter,
			...letterPreview(letter.content),
		}));
		const rows = await resourceRows(
			this.db,
			organizationId,
			listed.map(({ content }) => content),
		);
		return {
			items: listed.map(({ letter, side, content }) => ({
				id: letter.id,
				title: letter.title,
				updatedAt: letter.updatedAt,
				productLabel: PAGE_SPECS[letter.content.format].label,
				preview: {
					side,
					content,
					resources: resourcesFrom(content, rows, EDITOR_BASES),
				},
			})),
			nextCursor: page.next === null ? null : encodeCursor(page.next),
		};
	}

	async saveLetter(
		member: Member,
		letterId: string,
		params: SaveLetterParams,
	): Promise<{ revision: number }> {
		const content = validContent(params.content);
		const title = validTitle(params.title);
		const organizationId = member.userOrganization.organizationId;
		await knownDrawings(this.db, organizationId, content);
		await knownSignatures(this.db, member, content);
		await knownCover(this.db, organizationId, content);
		await knownFonts(this.db, member, letterId, content);
		const revision = await this.db.letters.save(organizationId, letterId, {
			title,
			content,
			expectedRevision: params.expectedRevision,
		});
		if (revision !== null) return { revision };
		const existing = await this.db.letters.byId(organizationId, letterId);
		if (existing) throw new ServiceError("conflict", "stale_revision");
		throw new ServiceError("not_found", "not_found");
	}

	async requestExport(
		member: Member,
		letterId: string,
		params: RequestExportParams,
	): Promise<{ assetIds: string[] }> {
		const organizationId = member.userOrganization.organizationId;
		const created = await this.db.transaction(async (tx) => {
			const letter = await tx.letters.byId(organizationId, letterId);
			if (!letter) throw new ServiceError("not_found", "not_found");
			if (letter.revision !== params.revision) {
				throw new ServiceError("conflict", "stale_revision");
			}
			const owners = await letterOwnerIds(tx, organizationId, letter.content);
			if (![...owners].every((id) => id === member.user.id)) {
				throw new ServiceError("forbidden", "not_owner");
			}
			const fonts = await proofFontBindings(
				tx,
				organizationId,
				letter.content,
				params.fonts,
			);
			const assets = [];
			for (const output of proofOutputs(letter.content)) {
				assets.push(
					await tx.assets.create(
						generatedAsset(organizationId, {
							kind: "render-letter",
							letterId,
							title: letter.title,
							content: letter.content,
							fonts,
							mergeValues: SAMPLE_MERGE_VALUES,
							output,
						}),
					),
				);
			}
			return assets;
		});
		for (const asset of created) {
			await publishAssetJob(this.publisher, asset);
		}
		return { assetIds: created.map((asset) => asset.id) };
	}

	async deleteLetter(member: Member, letterId: string): Promise<void> {
		const deleted = await this.db.letters.softDelete(
			member.userOrganization.organizationId,
			letterId,
		);
		if (!deleted) throw new ServiceError("not_found", "not_found");
	}
}
