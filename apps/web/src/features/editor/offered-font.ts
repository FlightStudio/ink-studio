import type { FontOption, LetterContent } from "@repo/types";
import { isUsableFont } from "@repo/types";

export function fontOfferFor(
	content: LetterContent,
	fonts: readonly FontOption[],
	requested: string | string[] | undefined,
	editable: boolean,
): FontOption | null {
	if (!editable) return null;
	const fontId = Array.isArray(requested) ? requested[0] : requested;
	if (!fontId) return null;
	const font = fonts.find((item) => item.id === fontId);
	if (!font || !isUsableFont(font)) return null;
	if (usesOwnFont(content, fontId)) return null;
	return font;
}

function usesOwnFont(content: LetterContent, fontId: string): boolean {
	if (
		content.defaults.font.kind === "own" &&
		content.defaults.font.fontId === fontId
	) {
		return true;
	}
	for (const block of content.doc.content) {
		for (const node of block.content ?? []) {
			for (const mark of node.marks ?? []) {
				const font = mark.attrs.font;
				if (font?.kind === "own" && font.fontId === fontId) return true;
			}
		}
	}
	return false;
}
