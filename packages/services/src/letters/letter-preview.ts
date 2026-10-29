import type { InlineNode, LetterContent, ParagraphNode } from "@repo/types";
import { PAGE_SPECS, SAMPLE_MERGE_VALUES, TEXT_LINE_HEIGHT } from "@repo/types";

const PT_PER_IN = 72;
const MIN_ADVANCE_EM = 0.1;

type Room = { linesLeft: number; lineWidthPt: number };

class Lines {
	used = 1;
	private widthPt = 0;

	constructor(private readonly room: Room) {}

	get full(): boolean {
		return this.used > this.room.linesLeft;
	}

	breakLine(): void {
		this.used += 1;
		this.widthPt = 0;
	}

	advance(char: string, sizePt: number): void {
		if (/\s/u.test(char)) return;
		const widthPt = sizePt * MIN_ADVANCE_EM;
		if (this.widthPt + widthPt > this.room.lineWidthPt) this.breakLine();
		this.widthPt += widthPt;
	}
}

function sizeOf(node: InlineNode, content: LetterContent): number {
	const ink = node.marks?.find((mark) => mark.type === "ink");
	return ink?.attrs.sizePt ?? content.defaults.sizePt;
}

function cutParagraph(
	block: ParagraphNode,
	room: Room,
	content: LetterContent,
): { block: ParagraphNode; lines: number } {
	const lines = new Lines(room);
	const kept: InlineNode[] = [];
	for (const node of block.content ?? []) {
		if (lines.full) break;
		const sizePt = sizeOf(node, content);
		if (node.type === "hardBreak") {
			kept.push(node);
			lines.breakLine();
			continue;
		}
		if (node.type === "mergeField") {
			kept.push(node);
			for (const char of SAMPLE_MERGE_VALUES[node.attrs.field]) {
				lines.advance(char, sizePt);
			}
			continue;
		}
		let text = "";
		for (const char of node.text) {
			lines.advance(char, sizePt);
			if (lines.full) break;
			text += char;
		}
		kept.push(text === node.text ? node : { ...node, text });
	}
	return {
		block: sameNodes(kept, block.content ?? [])
			? block
			: { ...block, content: kept },
		lines: lines.used,
	};
}

function sameNodes<T>(kept: readonly T[], all: readonly T[]): boolean {
	return (
		kept.length === all.length &&
		kept.every((node, index) => node === all[index])
	);
}

function sideBlocks(content: LetterContent): ParagraphNode[] {
	const spec = PAGE_SPECS[content.format];
	const strutPt = content.defaults.sizePt * TEXT_LINE_HEIGHT;
	const room: Room = {
		linesLeft: Math.ceil(
			((spec.heightIn - 2 * spec.marginIn) * PT_PER_IN) / strutPt,
		),
		lineWidthPt: (spec.widthIn - 2 * spec.marginIn) * PT_PER_IN,
	};
	const kept: ParagraphNode[] = [];
	for (const block of content.doc.content) {
		if (room.linesLeft <= 0) break;
		const { block: cut, lines } = cutParagraph(block, room, content);
		kept.push(cut);
		room.linesLeft -= lines;
	}
	return kept;
}

function previewSide(content: LetterContent): number {
	const spec = PAGE_SPECS[content.format];
	return spec.front === "image" && content.doc.attrs.frontImageAssetId === null
		? 1
		: 0;
}

export function letterPreview(content: LetterContent): {
	side: number;
	content: LetterContent;
} {
	const side = previewSide(content);
	const front = PAGE_SPECS[content.format].front === "image" && side === 0;
	const blocks: ParagraphNode[] = front
		? [{ type: "paragraph", attrs: { align: "left" } }]
		: sideBlocks(content);
	const elements = content.doc.attrs.elements.filter(
		(element) => element.side === side,
	);
	return {
		side,
		content:
			sameNodes(blocks, content.doc.content) &&
			sameNodes(elements, content.doc.attrs.elements)
				? content
				: {
						...content,
						doc: {
							...content.doc,
							attrs: { ...content.doc.attrs, elements },
							content: blocks,
						},
					},
	};
}
