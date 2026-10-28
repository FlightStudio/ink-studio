"use client";

import { outlinePath, strokeOutline } from "@repo/render/html";
import type { Stroke } from "@repo/types";
import { CELL } from "@repo/types";
import { InkCanvas } from "@/features/ink/ink-canvas";

const LINES = [CELL.ascender, CELL.xHeight, CELL.baseline, CELL.descender];

export type GlyphCellProps = {
	char: string;
	strokes: Stroke[];
	cellPx: number;
	onStrokeEnd: (strokes: Stroke[]) => void;
};

export function GlyphCell({
	char,
	strokes,
	cellPx,
	onStrokeEnd,
}: GlyphCellProps) {
	const strokeScale = (CELL.strokeScale * cellPx) / CELL.size;
	return (
		<InkCanvas
			widthPx={cellPx}
			heightPx={cellPx}
			strokeScale={strokeScale}
			aria-label={`Draw ${char}`}
			className="rounded-md bg-paper shadow-sheet"
			background={
				<div className="absolute inset-0 text-ink-muted">
					{LINES.map((y) => (
						<div
							key={y}
							className="absolute right-1 left-1 border-t border-current opacity-30"
							style={{ top: `${(y / CELL.size) * 100}%` }}
						/>
					))}
					<span className="absolute inset-0 grid place-items-center font-display text-2xl opacity-40">
						{char}
					</span>
				</div>
			}
			guides={
				<svg
					viewBox={`0 0 ${CELL.size} ${CELL.size}`}
					className="absolute inset-0 size-full text-ink"
					aria-hidden
				>
					{strokes.map((stroke, index) => (
						<path
							key={index}
							d={outlinePath(strokeOutline(stroke, CELL.strokeScale))}
							fill="currentColor"
						/>
					))}
				</svg>
			}
			onStrokeEnd={onStrokeEnd}
		/>
	);
}
