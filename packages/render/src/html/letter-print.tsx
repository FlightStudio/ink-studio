import type { LetterDoc, MergeValues } from "@repo/types";
import { PAGE_SPECS } from "@repo/types";
import type { DOMOutputSpec, Node } from "@tiptap/pm/model";
import type { NodeProps } from "@tiptap/static-renderer";
import {
	domOutputSpecToReactElement,
	renderToReactElement,
} from "@tiptap/static-renderer/pm/react";
import React, { type ReactElement, type ReactNode } from "react";
import { letterExtensions } from "../schema/letter-schema.ts";
import { LetterPage, type LetterPageProps } from "./letter-page.tsx";

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

export function LetterText({ doc }: { doc: LetterDoc }): ReactElement {
	return (
		<div className="letter-text">
			{renderToReactElement({
				extensions: letterExtensions,
				content: doc,
				options: { nodeMapping: { paragraph: StaticParagraph } },
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
