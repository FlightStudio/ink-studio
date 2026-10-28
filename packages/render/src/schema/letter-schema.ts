import type { Align, InkMark, MergeFieldKey, StockFontId } from "@repo/types";
import { INK_COLORS, MERGE_FIELDS, STOCK_FONTS, TEXT_SIZES } from "@repo/types";
import type { Extensions } from "@tiptap/core";
import { Extension, Mark, Node } from "@tiptap/core";
import { history, redo, undo } from "@tiptap/pm/history";
import { z } from "zod";

export const ALIGNS = [
	"left",
	"center",
	"right",
] as const satisfies readonly Align[];

const FALLBACK_FONT: StockFontId = "caveat";

const uuid = z.uuid();

function lookup<K extends string, V>(
	catalogue: Record<K, V>,
	key: unknown,
): V | undefined {
	return typeof key === "string" && Object.hasOwn(catalogue, key)
		? catalogue[key as K]
		: undefined;
}

function alignOf(value: unknown): Align | undefined {
	return ALIGNS.find((align) => align === value);
}

function fontFamily(font: InkMark["attrs"]["font"]): string | undefined {
	if (font?.kind === "stock" && lookup(STOCK_FONTS, font.id))
		return `"stock-${font.id}"`;
	if (font?.kind === "own" && uuid.safeParse(font.fontId).success) {
		return `"own-${font.fontId}", "stock-${FALLBACK_FONT}"`;
	}
	return undefined;
}

export type InkProperties = {
	fontFamily?: string;
	fontSize?: string;
	color?: string;
};

export function inkProperties(attrs: InkMark["attrs"]): InkProperties {
	const family = fontFamily(attrs.font);
	const size = TEXT_SIZES.find((sizePt) => sizePt === attrs.sizePt);
	const color = lookup(INK_COLORS, attrs.color);
	return {
		...(family === undefined ? {} : { fontFamily: family }),
		...(size === undefined ? {} : { fontSize: `${size}pt` }),
		...(color === undefined ? {} : { color: color.css }),
	};
}

function inkStyle(attrs: InkMark["attrs"]): string {
	const properties = inkProperties(attrs);
	return [
		properties.fontFamily === undefined
			? null
			: `font-family: ${properties.fontFamily}`,
		properties.fontSize === undefined
			? null
			: `font-size: ${properties.fontSize}`,
		properties.color === undefined ? null : `color: ${properties.color}`,
	]
		.filter((rule) => rule !== null)
		.join("; ");
}

const LetterDocument = Node.create({
	name: "doc",
	topNode: true,
	content: "paragraph+ signature?",
	addAttributes() {
		return {
			elements: { default: [], rendered: false },
			minSides: { default: 1, rendered: false },
			frontImageAssetId: { default: null, rendered: false },
		};
	},
});

const Paragraph = Node.create({
	name: "paragraph",
	group: "block",
	content: "inline*",
	addAttributes() {
		return {
			align: {
				default: "left",
				rendered: false,
				parseHTML: (element) => alignOf(element.style.textAlign) ?? null,
			},
		};
	},
	parseHTML() {
		return [{ tag: "p" }];
	},
	renderHTML({ node }) {
		const align = alignOf(node.attrs.align);
		return [
			"p",
			align === undefined ? {} : { style: `text-align: ${align}` },
			0,
		];
	},
});

const Text = Node.create({
	name: "text",
	group: "inline",
});

const Signature = Node.create({
	name: "signature",
	group: "block",
	atom: true,
	addAttributes() {
		return {
			drawingId: { default: null, rendered: false },
			widthIn: { default: 2.25, rendered: false },
			align: { default: "right", rendered: false },
			color: { default: "ink-blue", rendered: false },
		};
	},
	renderHTML({ node }) {
		const drawingId = node.attrs.drawingId;
		return [
			"div",
			typeof drawingId === "string" ? { "data-signature": drawingId } : {},
		];
	},
});

const MergeField = Node.create({
	name: "mergeField",
	inline: true,
	group: "inline",
	atom: true,
	marks: "ink",
	addAttributes() {
		return {
			field: {
				default: null,
				rendered: false,
				parseHTML: (element) => {
					const field = element.getAttribute("data-field");
					return field !== null && Object.hasOwn(MERGE_FIELDS, field)
						? (field as MergeFieldKey)
						: null;
				},
			},
		};
	},
	parseHTML() {
		return [{ tag: "span[data-field]" }];
	},
	renderHTML({ node }) {
		const field = node.attrs.field;
		return ["span", typeof field === "string" ? { "data-field": field } : {}];
	},
});

const HardBreak = Node.create({
	name: "hardBreak",
	inline: true,
	group: "inline",
	selectable: false,
	linebreakReplacement: true,
	parseHTML() {
		return [{ tag: "br" }];
	},
	renderHTML() {
		return ["br"];
	},
	renderText() {
		return "\n";
	},
});

const Ink = Mark.create({
	name: "ink",
	addAttributes() {
		return {
			font: { default: null, rendered: false },
			sizePt: { default: null, rendered: false },
			color: { default: null, rendered: false },
		};
	},
	renderHTML({ mark }) {
		const style = inkStyle(mark.attrs as InkMark["attrs"]);
		return ["span", style === "" ? {} : { style }, 0];
	},
});

const LetterHistory = Extension.create({
	name: "letterHistory",
	addProseMirrorPlugins() {
		return [history()];
	},
	addKeyboardShortcuts() {
		const run = (command: typeof undo) => () =>
			command(this.editor.state, (transaction) =>
				this.editor.view.dispatch(transaction),
			);
		return {
			"Mod-z": run(undo),
			"Shift-Mod-z": run(redo),
			"Mod-y": run(redo),
			"Meta-z": run(undo),
			"Shift-Meta-z": run(redo),
		};
	},
});

export const letterExtensions: Extensions = [
	LetterDocument,
	Paragraph,
	Signature,
	Text,
	HardBreak,
	MergeField,
	Ink,
	LetterHistory,
];
