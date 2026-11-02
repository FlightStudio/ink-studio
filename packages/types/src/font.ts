import { type DrawnGlyph, missingLowercase } from "./handwriting.ts";

export const STOCK_FONTS = {
	caveat: { label: "Caveat", file: "Caveat-Regular.ttf" },
	"patrick-hand": { label: "Patrick Hand", file: "PatrickHand-Regular.ttf" },
	"homemade-apple": {
		label: "Homemade Apple",
		file: "HomemadeApple-Regular.ttf",
	},
} as const satisfies Record<string, { label: string; file: string }>;

export type StockFontId = keyof typeof STOCK_FONTS;

export type FontSource =
	| { kind: "drawn"; glyphs: DrawnGlyph[] }
	| { kind: "template-photo"; templateVersion: 1; photoAssetId: string }
	| { kind: "upload"; fileAssetId: string };

export type Font = {
	id: string;
	organizationId: string;
	ownerUserId: string;
	ownerName: string;
	source: FontSource;
	fontAssetId: string | null;
	pendingFontAssetId: string | null;
	chars: string;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
};

export const OWNER_NAME_MAX_CHARACTERS = 40;

export type FontSourceKind = FontSource["kind"];

export type FontStatus =
	| "drawing"
	| "building"
	| "failed"
	| "incomplete"
	| "ready";

export type FontOption = {
	id: string;
	ownerName: string;
	source: FontSourceKind;
	status: FontStatus;
	assetId: string | null;
	pendingAssetId: string | null;
	error: string | null;
	chars: string;
	missingRequired: number;
};

export type EditableFont = FontOption & { glyphs: DrawnGlyph[] };

export function isUsableFont(
	font: Pick<FontOption, "assetId" | "chars">,
): boolean {
	return font.assetId !== null && missingLowercase(font.chars).length === 0;
}
