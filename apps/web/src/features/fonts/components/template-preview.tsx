"use client";

import { HANDWRITING_TEMPLATE } from "@repo/types";
import { useEffect, useRef, useState } from "react";
import { TemplateSheet } from "./template-sheet.tsx";

const CSS_PX_PER_IN = 96;

const SHEET_WIDTH_PX = HANDWRITING_TEMPLATE.page.widthIn * CSS_PX_PER_IN;

export function TemplatePreview() {
	const box = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useEffect(() => {
		const element = box.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width;
			if (width) setScale(Math.min(1, width / SHEET_WIDTH_PX));
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={box}
			data-template-preview=""
			className="mx-auto w-full max-w-[8.5in]"
			style={{ height: `${HANDWRITING_TEMPLATE.page.heightIn * scale}in` }}
		>
			<div
				className="origin-top-left shadow-float"
				style={{
					width: `${HANDWRITING_TEMPLATE.page.widthIn}in`,
					transform: scale < 1 ? `scale(${scale})` : undefined,
				}}
			>
				<TemplateSheet />
			</div>
		</div>
	);
}
