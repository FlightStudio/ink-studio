export const STOCK_FONTS = {
	caveat: { label: "Caveat", file: "Caveat-Regular.ttf" },
	"patrick-hand": { label: "Patrick Hand", file: "PatrickHand-Regular.ttf" },
	"homemade-apple": {
		label: "Homemade Apple",
		file: "HomemadeApple-Regular.ttf",
	},
} as const satisfies Record<string, { label: string; file: string }>;

export type StockFontId = keyof typeof STOCK_FONTS;
