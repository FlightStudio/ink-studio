export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type KeepClearZone = {
	side: number;
	corner: Corner;
	widthIn: number;
	heightIn: number;
};

export type ProductKind = "letter" | "postcard";

export type PageSpec = {
	provider: string;
	product: ProductKind;
	label: string;
	widthIn: number;
	heightIn: number;
	dpi: number;
	safeIn: number;
	marginIn: number;
	maxPages: number;
	providerMaxPages: number;
	front: "writing" | "image";
	duplex: boolean;
	output: "pdf" | "png";
	keepClear: readonly KeepClearZone[];
};

export const PAGE_SPECS = {
	"thanksio:letter-windowless": {
		provider: "thanksio",
		product: "letter",
		label: "Letter",
		widthIn: 2550 / 300,
		heightIn: 3300 / 300,
		dpi: 300,
		safeIn: 50 / 300,
		marginIn: 0.75,
		maxPages: 3,
		providerMaxPages: 12,
		front: "writing",
		duplex: true,
		output: "pdf",
		keepClear: [
			{ side: 0, corner: "top-right", widthIn: 135 / 300, heightIn: 140 / 300 },
			{
				side: 0,
				corner: "bottom-left",
				widthIn: 200 / 300,
				heightIn: 260 / 300,
			},
		],
	},
	"thanksio:postcard-6x9": {
		provider: "thanksio",
		product: "postcard",
		label: "Postcard 6 × 9",
		widthIn: 2738 / 300,
		heightIn: 1838 / 300,
		dpi: 300,
		safeIn: (19 + 42) / 300,
		marginIn: 0.375,
		maxPages: 2,
		providerMaxPages: 2,
		front: "image",
		duplex: true,
		output: "png",
		keepClear: [
			{
				side: 1,
				corner: "bottom-right",
				widthIn: 1193 / 300,
				heightIn: 923 / 300,
			},
		],
	},
} as const satisfies Record<string, PageSpec>;

export type PageFormatId = keyof typeof PAGE_SPECS;

export const DEFAULT_FORMAT: PageFormatId = "thanksio:letter-windowless";
