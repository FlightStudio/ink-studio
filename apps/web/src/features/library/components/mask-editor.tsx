"use client";

import type { Stroke } from "@repo/types";
import { Button } from "@repo/ui/components/ui/button";
import { Slider } from "@repo/ui/components/ui/slider";
import {
	type PointerEvent as ReactPointerEvent,
	type Ref,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { InkCanvas, type InkCanvasHandle } from "@/features/ink/ink-canvas";
import { composeMask, type MaskCrop } from "../compose-mask.ts";

const MAX_VIEW = { width: 520, height: 360 };
const MIN_CROP_PX = 32;
const ERASER_LIMITS = { min: 1, max: 6, initial: 2 };

export type MaskEditorHandle = {
	compose(): Promise<{ png: Blob; aspect: number }>;
};

export type MaskEditorProps = {
	assetId: string;
	ref?: Ref<MaskEditorHandle>;
};

type Corner = "nw" | "ne" | "sw" | "se";

type Drag = {
	pointerId: number;
	corner: Corner;
	crop: MaskCrop;
	clientX: number;
	clientY: number;
	imageWidth: number;
	imageHeight: number;
	rect: DOMRect;
};

export function MaskEditor({ assetId, ref }: MaskEditorProps) {
	const root = useRef<HTMLDivElement>(null);
	const frame = useRef<HTMLDivElement>(null);
	const canvas = useRef<InkCanvasHandle>(null);
	const drag = useRef<Drag | null>(null);
	const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
	const [stamp, setStamp] = useState<ImageBitmap | null>(null);
	const [crop, setCrop] = useState<MaskCrop | null>(null);
	const [strokes, setStrokes] = useState<Stroke[]>([]);
	const [strokeScale, setStrokeScale] = useState(ERASER_LIMITS.initial);
	const [failed, setFailed] = useState(false);

	const latest = useRef({
		bitmap,
		crop,
		strokes,
		strokeScale,
	});
	latest.current = { bitmap, crop, strokes, strokeScale };

	useEffect(() => {
		let cancelled = false;
		setFailed(false);
		setBitmap(null);
		setStamp(null);
		setCrop(null);
		setStrokes([]);
		void (async () => {
			try {
				const response = await fetch(`/api/assets/${assetId}`);
				if (!response.ok) throw new Error("mask");
				const next = await createImageBitmap(await response.blob());
				if (cancelled) {
					next.close();
					return;
				}
				setBitmap(next);
				setCrop({ x: 0, y: 0, width: next.width, height: next.height });
			} catch {
				if (!cancelled) setFailed(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [assetId]);

	useEffect(() => {
		const node = root.current;
		if (!bitmap || !node) return;
		const ink = getComputedStyle(node).color;
		const tinted = document.createElement("canvas");
		tinted.width = bitmap.width;
		tinted.height = bitmap.height;
		const context = tinted.getContext("2d");
		if (!context) return;
		context.drawImage(bitmap, 0, 0);
		context.globalCompositeOperation = "source-in";
		context.fillStyle = ink;
		context.fillRect(0, 0, tinted.width, tinted.height);
		let cancelled = false;
		let nextStamp: ImageBitmap | null = null;
		void createImageBitmap(tinted).then((next) => {
			if (cancelled) {
				next.close();
				return;
			}
			nextStamp = next;
			setStamp(next);
		});
		return () => {
			cancelled = true;
			nextStamp?.close();
		};
	}, [bitmap]);

	useImperativeHandle(
		ref,
		() => ({
			compose() {
				const current = latest.current;
				if (!current.bitmap || !current.crop) {
					throw new Error("The doodle could not be drawn.");
				}
				const view = viewSize(current.bitmap.width, current.bitmap.height);
				return composeMask({
					bitmap: current.bitmap,
					imageWidth: current.bitmap.width,
					imageHeight: current.bitmap.height,
					crop: current.crop,
					strokes: current.strokes,
					strokeScale: current.strokeScale,
					viewWidth: view.width,
					viewHeight: view.height,
				});
			},
		}),
		[],
	);

	const view = bitmap ? viewSize(bitmap.width, bitmap.height) : null;

	function onCornerDown(
		event: ReactPointerEvent<HTMLButtonElement>,
		corner: Corner,
	) {
		event.preventDefault();
		event.stopPropagation();
		const box = frame.current?.getBoundingClientRect();
		if (!box || !bitmap || !crop) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = {
			pointerId: event.pointerId,
			corner,
			crop,
			clientX: event.clientX,
			clientY: event.clientY,
			imageWidth: bitmap.width,
			imageHeight: bitmap.height,
			rect: box,
		};
	}

	function onCornerMove(event: ReactPointerEvent<HTMLButtonElement>) {
		const current = drag.current;
		if (!current || current.pointerId !== event.pointerId) return;
		const dx =
			((event.clientX - current.clientX) / current.rect.width) *
			current.imageWidth;
		const dy =
			((event.clientY - current.clientY) / current.rect.height) *
			current.imageHeight;
		setCrop(
			resizeCrop(
				current.crop,
				current.corner,
				dx,
				dy,
				current.imageWidth,
				current.imageHeight,
			),
		);
	}

	return (
		<div ref={root} className="flex flex-col gap-3 text-ink">
			{failed ? (
				<p className="text-ui text-danger">That ink could not be opened.</p>
			) : null}
			{bitmap && crop && stamp && view ? (
				<>
					<div
						ref={frame}
						data-mask-editor
						data-view-width={view.width}
						data-view-height={view.height}
						data-image-width={bitmap.width}
						data-image-height={bitmap.height}
						data-eraser-scale={strokeScale}
						className="relative overflow-hidden rounded-md"
					>
						<InkCanvas
							ref={canvas}
							widthPx={view.width}
							heightPx={view.height}
							strokeScale={strokeScale}
							composite="destination-out"
							underlay={stamp}
							onStrokeEnd={setStrokes}
							aria-label="Eraser"
							className="bg-paper ring-1 ring-rule"
						/>
						<CropFrame
							crop={crop}
							imageWidth={bitmap.width}
							imageHeight={bitmap.height}
							onPointerDown={onCornerDown}
							onPointerMove={onCornerMove}
							onPointerUp={() => {
								drag.current = null;
							}}
						/>
					</div>
					<div className="flex flex-col gap-1 text-ui">
						<p>Eraser size</p>
						<Slider
							min={ERASER_LIMITS.min}
							max={ERASER_LIMITS.max}
							step={1}
							value={[strokeScale]}
							onValueChange={(value) => {
								const next = Array.isArray(value) ? value[0] : value;
								if (typeof next === "number") setStrokeScale(next);
							}}
							aria-label="Eraser size"
						/>
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={() => canvas.current?.undo()}
					>
						Undo
					</Button>
				</>
			) : failed ? null : (
				<p className="text-ui text-ink-muted">Opening the ink.</p>
			)}
		</div>
	);
}

function viewSize(
	width: number,
	height: number,
): { width: number; height: number } {
	const scale = Math.min(MAX_VIEW.width / width, MAX_VIEW.height / height, 1);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

function resizeCrop(
	crop: MaskCrop,
	corner: Corner,
	dx: number,
	dy: number,
	imageWidth: number,
	imageHeight: number,
): MaskCrop {
	const east = corner === "ne" || corner === "se";
	const south = corner === "sw" || corner === "se";
	const left = east ? crop.x : crop.x + dx;
	const top = south ? crop.y : crop.y + dy;
	const right = east ? crop.x + crop.width + dx : crop.x + crop.width;
	const bottom = south ? crop.y + crop.height + dy : crop.y + crop.height;
	const x = clamp(
		Math.min(left, right - MIN_CROP_PX),
		0,
		imageWidth - MIN_CROP_PX,
	);
	const y = clamp(
		Math.min(top, bottom - MIN_CROP_PX),
		0,
		imageHeight - MIN_CROP_PX,
	);
	const width = clamp(Math.abs(right - left), MIN_CROP_PX, imageWidth - x);
	const height = clamp(Math.abs(bottom - top), MIN_CROP_PX, imageHeight - y);
	return { x, y, width, height };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

const CORNERS: { corner: Corner; label: string }[] = [
	{ corner: "nw", label: "Crop from the top left" },
	{ corner: "ne", label: "Crop from the top right" },
	{ corner: "sw", label: "Crop from the bottom left" },
	{ corner: "se", label: "Crop from the bottom right" },
];

function cornerStyle(corner: Corner): { left: string; top: string } {
	return {
		left: corner === "ne" || corner === "se" ? "100%" : "0%",
		top: corner === "sw" || corner === "se" ? "100%" : "0%",
	};
}

function CropFrame({
	crop,
	imageWidth,
	imageHeight,
	onPointerDown,
	onPointerMove,
	onPointerUp,
}: {
	crop: MaskCrop;
	imageWidth: number;
	imageHeight: number;
	onPointerDown: (
		event: ReactPointerEvent<HTMLButtonElement>,
		corner: Corner,
	) => void;
	onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
	onPointerUp: () => void;
}) {
	return (
		<div
			className="pointer-events-none absolute"
			style={{
				left: `${(crop.x / imageWidth) * 100}%`,
				top: `${(crop.y / imageHeight) * 100}%`,
				width: `${(crop.width / imageWidth) * 100}%`,
				height: `${(crop.height / imageHeight) * 100}%`,
			}}
		>
			<div className="absolute inset-0 shadow-[0_0_0_999px_rgba(28,27,24,0.35)] ring-1 ring-ink" />
			{CORNERS.map((handle) => (
				<button
					key={handle.corner}
					type="button"
					aria-label={handle.label}
					className="pointer-events-auto absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink bg-paper touch-none"
					style={cornerStyle(handle.corner)}
					onPointerDown={(event) => onPointerDown(event, handle.corner)}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				/>
			))}
		</div>
	);
}
