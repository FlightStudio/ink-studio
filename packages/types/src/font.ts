import type { DrawnGlyph } from "./handwriting.ts";

export const STOCK_FONTS = {
	caveat: { label: "Caveat", file: "Caveat-Regular.ttf" },
	"patrick-hand": { label: "Patrick Hand", file: "PatrickHand-Regular.ttf" },
	"homemade-apple": {
		label: "Homemade Apple",
		file: "HomemadeApple-Regular.ttf",
	},
} as const satisfies Record<string, { label: string; file: string }>;

export type StockFontId = keyof typeof STOCK_FONTS;

export type FontSource = { kind: "drawn"; glyphs: DrawnGlyph[] };

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

export type FontOption = {
	id: string;
	ownerName: string;
	assetId: string | null;
	building: boolean;
	chars: string;
};

export type EditableFont = {
	id: string;
	ownerName: string;
	glyphs: DrawnGlyph[];
	assetId: string | null;
	building: boolean;
};
