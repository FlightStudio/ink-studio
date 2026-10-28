import type {
	LetterDoc,
	MergeFieldKey,
	MergeValues,
	SignatureNode,
} from "@repo/types";
import {
	INK_COLORS,
	MERGE_FIELDS,
	PAGE_SPECS,
	SIGNATURE_WIDTHS,
} from "@repo/types";
import type { DOMOutputSpec, Node } from "@tiptap/pm/model";
import type { NodeProps } from "@tiptap/static-renderer";
import {
	domOutputSpecToReactElement,
	renderToReactElement,
} from "@tiptap/static-renderer/pm/react";
import React, { type ReactElement, type ReactNode } from "react";
import { letterExtensions } from "../schema/letter-schema.ts";
import { LetterPage, type LetterPageProps } from "./letter-page.tsx";
import { MergeChip } from "./merge-chip.tsx";
import { SignatureMark } from "./signature-mark.tsx";

export type LetterPrintProps = Pick<
	LetterPageProps,
	"letterId" | "content" | "resources"
> & { mergeValues: MergeValues };

function endsWithoutLine(node: Node): boolean {
	return node.childCount === 0 || node.lastChild?.type.name === "hardBreak";
}

function StaticParagraph({
	node,
	children,
}: NodeProps<Node, ReactNode>): ReactNode {
	const spec: DOMOutputSpec = node.type.spec.toDOM?.(node) ?? ["p", 0];
	const render = domOutputSpecToReactElement(spec);
	return render(
		endsWithoutLine(node) ? [children, <br key="trailing-break" />] : children,
	);
}

function signatureAttrs(node: Node): SignatureNode["attrs"] {
	const { drawingId, widthIn, align, color } = node.attrs;
	const width = SIGNATURE_WIDTHS.find((value) => value === widthIn);
	if (
		typeof drawingId !== "string" ||
		width === undefined ||
		(align !== "left" && align !== "center" && align !== "right") ||
		typeof color !== "string" ||
		!Object.hasOwn(INK_COLORS, color)
	) {
		throw new Error("The letter's signature is not one the catalogue allows.");
	}
	return {
		drawingId,
		widthIn: width,
		align,
		color: color as SignatureNode["attrs"]["color"],
	};
}

function StaticSignature({ node }: NodeProps<Node, ReactNode>): ReactElement {
	return <SignatureMark {...signatureAttrs(node)} />;
}

function StaticMergeField({ node }: NodeProps<Node, ReactNode>): ReactElement {
	const field = node.attrs.field;
	if (typeof field !== "string" || !Object.hasOwn(MERGE_FIELDS, field)) {
		throw new Error("The letter names a field the catalogue does not have.");
	}
	return <MergeChip field={field as MergeFieldKey} />;
}

export function LetterText({ doc }: { doc: LetterDoc }): ReactElement {
	return (
		<div className="letter-text">
			{renderToReactElement({
				extensions: letterExtensions,
				content: doc,
				options: {
					nodeMapping: {
						paragraph: StaticParagraph,
						mergeField: StaticMergeField,
						signature: StaticSignature,
					},
				},
			})}
		</div>
	);
}

export function LetterPrint(props: LetterPrintProps): ReactElement {
	void React;
	const spec = PAGE_SPECS[props.content.format];
	return (
		<LetterPage
			letterId={props.letterId}
			content={props.content}
			resources={props.resources}
			mergeValues={props.mergeValues}
			mode="print"
			sheets={spec.maxPages}
			flow={<LetterText doc={props.content.doc} />}
		/>
	);
}
