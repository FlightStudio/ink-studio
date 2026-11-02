import type { LetterDoc, MergeFieldKey, MergeValues } from "@repo/types";
import { MERGE_FIELDS, PAGE_SPECS } from "@repo/types";
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

export type LetterPrintProps = Pick<
	LetterPageProps,
	"letterId" | "content" | "resources"
> & { mergeValues: MergeValues; sheets?: number };

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
					},
				},
			})}
		</div>
	);
}

export function LetterPrint(props: LetterPrintProps): ReactElement {
	void React;
	return (
		<LetterPage
			letterId={props.letterId}
			content={props.content}
			resources={props.resources}
			mergeValues={props.mergeValues}
			mode="print"
			sheets={props.sheets ?? PAGE_SPECS[props.content.format].maxPages}
			flow={<LetterText doc={props.content.doc} />}
		/>
	);
}
