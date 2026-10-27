import type { Db, Tx } from "@repo/db";
import { ServiceError } from "@repo/errors";
import { parseLetterContent } from "@repo/render/schema";
import type {
	FontRef,
	InkStyle,
	LetterContent,
	LetterResources,
	Member,
	PageFormatId,
	ProductKind,
} from "@repo/types";
import { DEFAULT_FORMAT, humanSeal, PAGE_SPECS } from "@repo/types";
import type {
	CreateLetterParams,
	EditableLetter,
	LetterListItem,
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

const TITLE_MAX_CHARACTERS = 120;

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

function fontRefs(content: LetterContent): FontRef[] {
	const refs = [content.defaults.font];
	for (const paragraph of content.doc.content) {
		for (const node of paragraph.content ?? []) {
			for (const mark of node.marks ?? []) {
				if (mark.attrs.font) refs.push(mark.attrs.font);
			}
		}
	}
	return refs;
}

function validContent(json: unknown): LetterContent {
	let content: LetterContent;
	try {
		content = parseLetterContent(json);
	} catch {
		throw new ServiceError("invalid_input", "invalid_letter");
	}
	if (fontRefs(content).some((font) => font.kind === "own")) {
		throw new ServiceError("invalid_input", "invalid_letter");
	}
	return content;
}

function validTitle(title: string): string {
	const trimmed = title.trim();
	if (
		trimmed === "" ||
		/\p{Cc}/u.test(trimmed) ||
		[...trimmed].length > TITLE_MAX_CHARACTERS
	) {
		throw new ServiceError("invalid_input", "invalid_title");
	}
	return trimmed;
}

export async function letterResources(
	_tx: Tx,
	_organizationId: string,
	_content: LetterContent,
): Promise<LetterResources> {
	return {
		assetBaseUrl: "/api/assets/",
		stockFontBaseUrl: "/fonts/stock/",
		fonts: {},
		drawings: {},
	};
}

export async function letterOwnerIds(
	_tx: Tx,
	_organizationId: string,
	_content: LetterContent,
): Promise<Set<string>> {
	return new Set();
}

export class LetterService {
	constructor(private readonly db: Db) {}

	async createLetter(
		member: Member,
		params: CreateLetterParams,
	): Promise<{ id: string }> {
		const format = params.format ?? DEFAULT_FORMAT;
		const letter = await this.db.letters.create({
			organizationId: member.userOrganization.organizationId,
			title: UNTITLED[PAGE_SPECS[format].product],
			content: newLetterContent(format),
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
		const [resources, ownerIds] = await Promise.all([
			letterResources(this.db, organizationId, letter.content),
			letterOwnerIds(this.db, organizationId, letter.content),
		]);
		return {
			id: letter.id,
			title: letter.title,
			content: letter.content,
			revision: letter.revision,
			resources,
			editable: [...ownerIds].every((id) => id === member.user.id),
		};
	}

	async listLetters(member: Member): Promise<LetterListItem[]> {
		const letters = await this.db.letters.list(
			member.userOrganization.organizationId,
		);
		return letters.map((letter) => ({
			id: letter.id,
			title: letter.title,
			updatedAt: letter.updatedAt,
			humanSeal: humanSeal(letter.content, new Map()),
		}));
	}

	async saveLetter(
		member: Member,
		letterId: string,
		params: SaveLetterParams,
	): Promise<{ revision: number }> {
		const content = validContent(params.content);
		const title = validTitle(params.title);
		const organizationId = member.userOrganization.organizationId;
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

	async deleteLetter(member: Member, letterId: string): Promise<void> {
		const deleted = await this.db.letters.softDelete(
			member.userOrganization.organizationId,
			letterId,
		);
		if (!deleted) throw new ServiceError("not_found", "not_found");
	}
}
