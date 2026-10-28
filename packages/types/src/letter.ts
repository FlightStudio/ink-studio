import type { StockFontId } from "./font.ts";
import type { InkColorId, TextSizePt } from "./ink.ts";
import type { PageFormatId } from "./page.ts";

export type Align = "left" | "center" | "right";
export type FontRef =
	| { kind: "stock"; id: StockFontId }
	| { kind: "own"; fontId: string };
export type InkStyle = { font: FontRef; sizePt: TextSizePt; color: InkColorId };
export type InkMark = {
	type: "ink";
	attrs: {
		font: FontRef | null;
		sizePt: TextSizePt | null;
		color: InkColorId | null;
	};
};
export type TextNode = { type: "text"; text: string; marks?: InkMark[] };
export type HardBreakNode = { type: "hardBreak"; marks?: InkMark[] };
export type InlineNode = TextNode | HardBreakNode;
export type ParagraphNode = {
	type: "paragraph";
	attrs: { align: Align };
	content?: InlineNode[];
};

export type PlacedElement = {
	id: string;
	kind: "drawing";
	drawingId: string;
	side: number;
	xIn: number;
	yIn: number;
	widthIn: number;
	heightIn: number;
	rotationDeg: number;
	tint: InkColorId;
	wrap: boolean;
};
export type LetterDoc = {
	type: "doc";
	attrs: {
		elements: PlacedElement[];
		minSides: number;
		frontImageAssetId: string | null;
	};
	content: ParagraphNode[];
};
export type LetterContent = {
	schemaVersion: 1;
	format: PageFormatId;
	defaults: InkStyle;
	doc: LetterDoc;
};

export type LetterResources = {
	assetBaseUrl: string;
	stockFontBaseUrl: string;
	fonts: Record<string, string>;
	drawings: Record<string, { maskAssetId: string; aspect: number }>;
	frontImageAssetId: string | null;
};

export type SealFont = { ownerName: string; chars: ReadonlySet<string> };

function listOf(items: readonly string[]): string {
	const last = items.at(-1) ?? "";
	return items.length < 2
		? last
		: `${items.slice(0, -1).join(", ")} and ${last}`;
}

export function humanSeal(
	content: LetterContent,
	ownFonts: ReadonlyMap<string, SealFont>,
): string | null {
	let visible = 0;
	let handwritten = 0;
	const owners = new Set<string>();
	for (const paragraph of content.doc.content) {
		for (const node of paragraph.content ?? []) {
			if (node.type !== "text") continue;
			const ink = node.marks?.find((mark) => mark.type === "ink");
			const font = ink?.attrs.font ?? content.defaults.font;
			const own = font.kind === "own" ? ownFonts.get(font.fontId) : undefined;
			for (const char of node.text) {
				if (/\s/u.test(char)) continue;
				visible += 1;
				if (!own?.chars.has(char)) continue;
				handwritten += 1;
				owners.add(own.ownerName);
			}
		}
	}
	const clauses: string[] = [];
	if (handwritten > 0) {
		const written = handwritten === visible ? "Written" : "Partly written";
		const names = listOf([...owners].map((name) => `${name}'s`));
		clauses.push(`${written} in ${names} own handwriting`);
	}
	if (
		content.doc.attrs.elements.some((element) => element.kind === "drawing")
	) {
		clauses.push("doodles hand-drawn");
	}
	const seal = clauses.join(" · ");
	return seal === "" ? null : `${seal.charAt(0).toUpperCase()}${seal.slice(1)}`;
}
