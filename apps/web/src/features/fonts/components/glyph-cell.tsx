"use client";

import { outlinePath, strokeOutline } from "@repo/render/html";
import type { Stroke } from "@repo/types";
import { CELL } from "@repo/types";
import { Button } from "@repo/ui/components/ui/button";
import { X } from "lucide-react";
import {
	memo,
	type RefObject,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { InkCanvas, type InkCanvasHandle } from "@/features/ink/ink-canvas";
import { toCellUnits } from "../cell-units.ts";
import type { GlyphSlot } from "../glyph-sections.ts";

const DEFAULT_PX = 128;

export const FULL_CELL = "This box is full. Use × to clear it and start again.";

export type GlyphCellProps = {
	slot: GlyphSlot;
	strokes: readonly Stroke[];
	penOnly: boolean;
	highlighted: boolean;
	full: boolean;
	error: string | null;
	onStroke(key: string, stroke: Stroke): void;
	onClear(key: string): void;
};

function useSquareSide(): [RefObject<HTMLDivElement | null>, number] {
	const box = useRef<HTMLDivElement>(null);
	const [side, setSide] = useState(DEFAULT_PX);
	useEffect(() => {
		const element = box.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width;
			if (width) setSide(Math.round(width));
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return [box, side];
}

function Guides() {
	const y = (value: number) => (value / CELL.size) * 100;
	return (
		<svg
			aria-hidden
			className="absolute inset-0 size-full text-ink"
			preserveAspectRatio="none"
			viewBox="0 0 100 100"
		>
			<line
				x1="6"
				x2="94"
				y1={y(CELL.xHeight)}
				y2={y(CELL.xHeight)}
				stroke="currentColor"
				strokeOpacity="0.14"
				strokeDasharray="2 2"
				vectorEffect="non-scaling-stroke"
			/>
			<line
				x1="6"
				x2="94"
				y1={y(CELL.baseline)}
				y2={y(CELL.baseline)}
				stroke="currentColor"
				strokeOpacity="0.42"
				strokeWidth="1.25"
				vectorEffect="non-scaling-stroke"
			/>
			<line
				x1="6"
				x2="94"
				y1={y(CELL.descender)}
				y2={y(CELL.descender)}
				stroke="currentColor"
				strokeOpacity="0.14"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function GlyphCellView({
	slot,
	strokes,
	penOnly,
	highlighted,
	full,
	error,
	onStroke,
	onClear,
}: GlyphCellProps) {
	const [box, side] = useSquareSide();
	const canvas = useRef<InkCanvasHandle>(null);
	const paths = useMemo(
		() =>
			strokes.map((stroke) =>
				outlinePath(strokeOutline(stroke, CELL.strokeScale)),
			),
		[strokes],
	);
	const message = error ?? (full ? FULL_CELL : null);
	const messageId = `${slot.key}-message`;
	return (
		<li className="flex min-w-0 flex-col gap-2">
			<div
				ref={box}
				data-cell={slot.key}
				data-strokes={strokes.length}
				data-highlighted={highlighted || undefined}
				className={[
					"relative aspect-square w-full rounded-xl bg-paper shadow-sheet transition-shadow duration-300 ease-settle",
					error
						? "ring-2 ring-danger/50"
						: highlighted
							? "ring-2 ring-ink-accent/35"
							: "ring-1 ring-ink/5",
				].join(" ")}
			>
				<Guides />
				<span
					aria-hidden
					className="pointer-events-none absolute top-2 left-2.5 text-label text-ink-muted/80"
				>
					{slot.char}
					{slot.variant > 0 ? (
						<span className="ml-0.5 font-semibold">·{slot.variant + 1}</span>
					) : null}
				</span>
				<svg
					aria-hidden
					viewBox={`0 0 ${CELL.size} ${CELL.size}`}
					className="pointer-events-none absolute inset-0 size-full text-ink"
				>
					{paths.map((d, index) => (
						<path key={index} d={d} fill="currentColor" />
					))}
				</svg>
				<div className="absolute inset-0">
					<InkCanvas
						ref={canvas}
						widthPx={side}
						heightPx={side}
						strokeScale={(CELL.strokeScale * side) / CELL.size}
						penOnly={penOnly}
						aria-label={`Draw ${slot.label}`}
						className="rounded-xl"
						onStrokeEnd={(drawn) => {
							const last = drawn.at(-1);
							if (!last) return;
							canvas.current?.clear();
							onStroke(slot.key, toCellUnits(last, side));
						}}
					/>
				</div>
				{strokes.length > 0 ? (
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={`Clear ${slot.label}`}
						aria-describedby={message ? messageId : undefined}
						className="absolute top-1 right-1 rounded-full text-ink-muted hover:text-ink"
						onClick={() => onClear(slot.key)}
					>
						<X />
					</Button>
				) : null}
			</div>
			{message ? (
				<p
					id={messageId}
					role={error ? "alert" : "status"}
					className={[
						"text-label",
						error ? "text-danger" : "text-ink-muted",
					].join(" ")}
				>
					{message}
				</p>
			) : null}
		</li>
	);
}

export const GlyphCell = memo(GlyphCellView);
