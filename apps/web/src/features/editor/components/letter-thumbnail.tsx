"use client";

import { LetterPrint } from "@repo/render/html";
import type { LetterPreview } from "@repo/types";
import { PAGE_SPECS, SAMPLE_MERGE_VALUES } from "@repo/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const PX_PER_IN = 96;
const NEAR_MARGIN = "50% 0px";

export type LetterThumbnailProps = {
	letterId: string;
	preview: LetterPreview;
};

export function LetterThumbnail({ letterId, preview }: LetterThumbnailProps) {
	const { side, content, resources } = preview;
	const spec = PAGE_SPECS[content.format];
	const frame = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState<number | null>(null);
	const [near, setNear] = useState(false);

	useLayoutEffect(() => {
		const element = frame.current;
		if (!element) return;
		const update = () =>
			setScale(element.clientWidth / (spec.widthIn * PX_PER_IN));
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => observer.disconnect();
	}, [spec.widthIn]);

	useEffect(() => {
		const element = frame.current;
		if (!element) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				setNear(true);
				observer.disconnect();
			},
			{ rootMargin: NEAR_MARGIN },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={frame}
			data-letter-thumbnail=""
			aria-hidden
			inert
			className="relative overflow-hidden rounded-[3px] bg-white"
			style={{ aspectRatio: `${spec.widthIn} / ${spec.heightIn}` }}
		>
			{scale === null || !near ? null : (
				<div
					className="pointer-events-none absolute top-0 left-0 origin-top-left select-none"
					style={{
						width: `${spec.widthIn}in`,
						transform: `scale(${scale}) translateY(${-side * spec.heightIn}in)`,
					}}
				>
					<LetterPrint
						letterId={letterId}
						content={content}
						resources={resources}
						mergeValues={SAMPLE_MERGE_VALUES}
						sheets={side + 1}
					/>
				</div>
			)}
		</div>
	);
}
