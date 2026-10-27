export const INK_COLORS = {
	midnight: { label: "Midnight", css: "#1c2541" },
	"ink-blue": { label: "Ink blue", css: "#23408e" },
	sepia: { label: "Sepia", css: "#5b3a29" },
	forest: { label: "Forest", css: "#2f4a3a" },
	oxblood: { label: "Oxblood", css: "#6b1f2a" },
} as const satisfies Record<string, { label: string; css: string }>;

export type InkColorId = keyof typeof INK_COLORS;

export const TEXT_SIZES = [16, 20, 24, 30] as const;

export type TextSizePt = (typeof TEXT_SIZES)[number];
