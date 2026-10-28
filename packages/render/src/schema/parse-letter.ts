import type { LetterContent, LetterDoc } from "@repo/types";
import {
	INK_COLORS,
	MERGE_FIELDS,
	PAGE_SPECS,
	SIGNATURE_WIDTHS,
	STOCK_FONTS,
	TEXT_SIZES,
} from "@repo/types";
import { getSchema } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { z } from "zod";
import { ALIGNS, letterExtensions } from "./letter-schema.ts";

export const LETTER_LIMITS = { characters: 20_000, elements: 200 } as const;

function keyOf<K extends string>(catalogue: Record<K, unknown>) {
	return z.enum(Object.keys(catalogue) as [K, ...K[]]);
}

const inkColor = keyOf(INK_COLORS);
const textSize = z.literal(TEXT_SIZES);

const fontRef = z.discriminatedUnion("kind", [
	z.strictObject({ kind: z.literal("stock"), id: keyOf(STOCK_FONTS) }),
	z.strictObject({ kind: z.literal("own"), fontId: z.uuid() }),
]);

const inkMarks = z
	.array(
		z.strictObject({
			type: z.literal("ink"),
			attrs: z.strictObject({
				font: fontRef.nullable(),
				sizePt: textSize.nullable(),
				color: inkColor.nullable(),
			}),
		}),
	)
	.max(1)
	.optional();

const inlineNode = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("text"),
		text: z.string().min(1),
		marks: inkMarks,
	}),
	z.strictObject({ type: z.literal("hardBreak"), marks: inkMarks }),
	z.strictObject({
		type: z.literal("mergeField"),
		attrs: z.strictObject({ field: keyOf(MERGE_FIELDS) }),
		marks: inkMarks,
	}),
]);

const paragraphNode = z.strictObject({
	type: z.literal("paragraph"),
	attrs: z.strictObject({ align: z.enum(ALIGNS) }),
	content: z.array(inlineNode).optional(),
});

const signatureNode = z.strictObject({
	type: z.literal("signature"),
	attrs: z.strictObject({
		drawingId: z.uuid(),
		widthIn: z.union([
			z.literal(SIGNATURE_WIDTHS[0]),
			z.literal(SIGNATURE_WIDTHS[1]),
			z.literal(SIGNATURE_WIDTHS[2]),
		]),
		align: z.enum(ALIGNS),
		color: inkColor,
	}),
});

const placedElement = z.strictObject({
	id: z.uuid(),
	kind: z.literal("drawing"),
	drawingId: z.uuid(),
	side: z.int().nonnegative(),
	xIn: z.number(),
	yIn: z.number(),
	widthIn: z.number().positive(),
	heightIn: z.number().positive(),
	rotationDeg: z.number(),
	tint: inkColor,
	wrap: z.boolean().default(false),
});

function characterCount(doc: Pick<LetterDoc, "content">): number {
	let count = doc.content.length - 1;
	for (const block of doc.content) {
		if (block.type !== "paragraph") continue;
		for (const node of block.content ?? []) {
			count += node.type === "text" ? node.text.length : 1;
		}
	}
	return count;
}

const letterDoc = z
	.strictObject({
		type: z.literal("doc"),
		attrs: z.strictObject({
			elements: z.array(placedElement).max(LETTER_LIMITS.elements),
			minSides: z.int().min(1).default(1),
			frontImageAssetId: z.uuid().nullable().default(null),
		}),
		content: z.array(z.union([paragraphNode, signatureNode])).min(1),
	})
	.refine((doc) => characterCount(doc) <= LETTER_LIMITS.characters, {
		message: "The letter is longer than the character limit.",
	});

const letterContentSchema: z.ZodType<LetterContent> = z
	.strictObject({
		schemaVersion: z.literal(1),
		format: keyOf(PAGE_SPECS),
		defaults: z.strictObject({
			font: fontRef,
			sizePt: textSize,
			color: inkColor,
		}),
		doc: letterDoc,
	})
	.superRefine((content, context) => {
		const spec = PAGE_SPECS[content.format];
		if (content.doc.attrs.minSides > spec.maxPages) {
			context.addIssue({
				code: "custom",
				path: ["doc", "attrs", "minSides"],
				message: "The letter asks for more sides than its product allows.",
			});
		}
		if (
			content.doc.attrs.frontImageAssetId !== null &&
			spec.front !== "image"
		) {
			context.addIssue({
				code: "custom",
				path: ["doc", "attrs", "frontImageAssetId"],
				message: "The product's front is for writing, not an image.",
			});
		}
	});

const letterSchema = getSchema(letterExtensions);

export function parseLetterContent(json: unknown): LetterContent {
	const content = letterContentSchema.parse(json);
	Node.fromJSON(letterSchema, content.doc).check();
	return content;
}
