import type { SignatureNode } from "@repo/types";
import { INK_COLORS } from "@repo/types";
import React, { type CSSProperties, type ReactElement } from "react";
import { useLetterPage } from "./letter-page.tsx";

const ALIGN: Record<
	SignatureNode["attrs"]["align"],
	CSSProperties["justifyContent"]
> = {
	left: "flex-start",
	center: "center",
	right: "flex-end",
};

export function SignatureMark(props: SignatureNode["attrs"]): ReactElement {
	void React;
	const { resources } = useLetterPage();
	const drawing = Object.hasOwn(resources.drawings, props.drawingId)
		? resources.drawings[props.drawingId]
		: undefined;
	if (!drawing) {
		throw new Error(
			`Signature ${props.drawingId} is on the letter but missing from its resources`,
		);
	}
	const mask = `url("${resources.assetBaseUrl}${drawing.maskAssetId}")`;
	return (
		<div
			className="letter-signature"
			data-signature={props.drawingId}
			style={{ display: "flex", justifyContent: ALIGN[props.align] }}
		>
			<span
				style={{
					display: "block",
					width: `${props.widthIn}in`,
					aspectRatio: String(drawing.aspect),
					WebkitMaskImage: mask,
					maskImage: mask,
					WebkitMaskRepeat: "no-repeat",
					maskRepeat: "no-repeat",
					WebkitMaskSize: "100% 100%",
					maskSize: "100% 100%",
					backgroundColor: INK_COLORS[props.color].css,
				}}
			/>
		</div>
	);
}
