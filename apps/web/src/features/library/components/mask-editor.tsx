"use client";

import { STROKE_OPTIONS } from "@repo/render/html";
import { Button } from "@repo/ui/components/ui/button";
import { Slider } from "@repo/ui/components/ui/slider";
import { Redo2, RotateCcw, Undo2 } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type Ref,
	useEffect,
	useId,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	InkCanvas,
	type InkCanvasHandle,
	type InkHistory,
} from "@/features/ink/ink-canvas";
import type { CanvasStroke } from "@/features/ink/pointer-session";
import {
	type ComposedMask,
	composeMask,
	type MaskCrop,
} from "../compose-mask.ts";

const MAX_VIEW = { width: 520, height: 360 };
const MIN_CROP_PX = 32;
const ERASER_LIMITS = { min: 1, max: 6, initial: 2 };
const KEY_STEP_SHARE = 0.02;

export type MaskEditorHandle = {
	compose(): Promise<ComposedMask | null>;
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

const NO_HISTORY: InkHistory = { canUndo: false, canRedo: false };

export function MaskEditor({ assetId, ref }: MaskEditorProps) {
	const eraserSizeId = useId();
	const root = useRef<HTMLDivElement>(null);
	const frame = useRef<HTMLDivElement>(null);
	const canvas = useRef<InkCanvasHandle>(null);
	const drag = useRef<Drag | null>(null);
	const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
	const [stamp, setStamp] = useState<ImageBitmap | null>(null);
	const [crop, setCrop] = useState<MaskCrop | null>(null);
	const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
	const [history, setHistory] = useState<InkHistory>(NO_HISTORY);
	const [strokeScale, setStrokeScale] = useState(ERASER_LIMITS.initial);
	const [failed, setFailed] = useState(false);
	const [shownWidth, setShownWidth] = useState<number | null>(null);

	const latest = useRef({
		bitmap,
		crop,
		strokes,
	});
	latest.current = { bitmap, crop, strokes };

	useEffect(() => {
		let cancelled = false;
		setFailed(false);
		setBitmap(null);
		setStamp(null);
		setCrop(null);
		setStrokes([]);
		setHistory(NO_HISTORY);
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
				setCrop(fullCrop(next));
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

	const ready = stamp !== null;
	useLayoutEffect(() => {
		const node = frame.current;
		if (!ready || !node) return;
		const measure = () => setShownWidth(node.getBoundingClientRect().width);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, [ready]);

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
					viewWidth: view.width,
					viewHeight: view.height,
				});
			},
		}),
		[],
	);

	const view = bitmap ? viewSize(bitmap.width, bitmap.height) : null;
	const cropped =
		bitmap !== null && crop !== null && !sameCrop(crop, fullCrop(bitmap));
	const eraserPx = Math.round(
		STROKE_OPTIONS.size *
			strokeScale *
			(view && shownWidth ? shownWidth / view.width : 1),
	);

	function onCornerDown(
		event: ReactPointerEvent<HTMLButtonElement>,
		corner: Corner,
	) {
		event.preventDefault();
		event.stopPropagation();
		const box = frame.current?.getBoundingClientRect();
		if (!box || !bitmap || !crop || drag.current || event.button !== 0) return;
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

	function onCornerEnd(
		event: ReactPointerEvent<HTMLButtonElement>,
		cancelled: boolean,
	) {
		const current = drag.current;
		if (!current || current.pointerId !== event.pointerId) return;
		drag.current = null;
		if (cancelled) setCrop(current.crop);
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	}

	function onCornerKey(
		event: ReactKeyboardEvent<HTMLButtonElement>,
		corner: Corner,
	) {
		if (!bitmap || !crop) return;
		const step = {
			x: bitmap.width * KEY_STEP_SHARE,
			y: bitmap.height * KEY_STEP_SHARE,
		};
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step.x, 0],
			ArrowRight: [step.x, 0],
			ArrowUp: [0, -step.y],
			ArrowDown: [0, step.y],
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		setCrop(
			resizeCrop(crop, corner, move[0], move[1], bitmap.width, bitmap.height),
		);
	}

	function reset() {
		canvas.current?.clear();
		if (bitmap) setCrop(fullCrop(bitmap));
	}

	return (
		<div ref={root} className="flex flex-col gap-3 text-ink">
			{failed ? (
				<p className="text-ui text-danger">That ink could not be opened.</p>
			) : null}
			{bitmap && crop && stamp && view ? (
				<>
					<div className="p-2 pointer-coarse:p-3">
						<div
							ref={frame}
							data-mask-editor
							data-view-width={view.width}
							data-view-height={view.height}
							data-image-width={bitmap.width}
							data-image-height={bitmap.height}
							data-eraser-scale={strokeScale}
							className="relative mx-auto w-fit max-w-full"
							style={{ cursor: eraserCursor(eraserPx) }}
						>
							<InkCanvas
								ref={canvas}
								widthPx={view.width}
								heightPx={view.height}
								strokeScale={strokeScale}
								composite="destination-out"
								underlay={stamp}
								onStrokeEnd={(next, nextHistory) => {
									setStrokes(next);
									setHistory(nextHistory);
								}}
								aria-label="Eraser"
								className="rounded-md bg-paper ring-1 ring-rule"
							/>
							<CropFrame
								crop={crop}
								imageWidth={bitmap.width}
								imageHeight={bitmap.height}
								onPointerDown={onCornerDown}
								onPointerMove={onCornerMove}
								onPointerUp={(event) => onCornerEnd(event, false)}
								onPointerCancel={(event) => onCornerEnd(event, true)}
								onKeyDown={onCornerKey}
							/>
						</div>
					</div>
					<p className="text-ui text-ink-muted">
						Drag over ink to erase. Drag the corners to crop.
					</p>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={!history.canUndo}
								onClick={() => canvas.current?.undo()}
							>
								<Undo2 />
								Undo
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={!history.canRedo}
								onClick={() => canvas.current?.redo()}
							>
								<Redo2 />
								Redo
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={!cropped && !history.canUndo && !history.canRedo}
								onClick={reset}
							>
								<RotateCcw />
								Reset
							</Button>
						</div>
						<div className="flex min-w-40 flex-1 items-center gap-3 text-ui">
							<span id={eraserSizeId} className="whitespace-nowrap">
								Eraser size
							</span>
							<Slider
								min={ERASER_LIMITS.min}
								max={ERASER_LIMITS.max}
								step={1}
								value={[strokeScale]}
								onValueChange={(value) => {
									const next = Array.isArray(value) ? value[0] : value;
									if (typeof next === "number") setStrokeScale(next);
								}}
								aria-labelledby={eraserSizeId}
							/>
						</div>
					</div>
				</>
			) : failed ? null : (
				<p className="text-ui text-ink-muted">Opening the ink.</p>
			)}
		</div>
	);
}

function eraserCursor(diameterPx: number): string {
	const size = Math.max(diameterPx, 4) + 2;
	const centre = size / 2;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${centre}" cy="${centre}" r="${centre - 1}" fill="none" stroke="white" stroke-width="2"/><circle cx="${centre}" cy="${centre}" r="${centre - 1}" fill="none" stroke="black" stroke-width="1"/></svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${centre} ${centre}, crosshair`;
}

function fullCrop(bitmap: { width: number; height: number }): MaskCrop {
	return { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
}

function sameCrop(a: MaskCrop, b: MaskCrop): boolean {
	return (
		a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
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
	onPointerCancel,
	onKeyDown,
}: {
	crop: MaskCrop;
	imageWidth: number;
	imageHeight: number;
	onPointerDown: (
		event: ReactPointerEvent<HTMLButtonElement>,
		corner: Corner,
	) => void;
	onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
	onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
	onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
	onKeyDown: (
		event: ReactKeyboardEvent<HTMLButtonElement>,
		corner: Corner,
	) => void;
}) {
	const box = {
		left: `${(crop.x / imageWidth) * 100}%`,
		top: `${(crop.y / imageHeight) * 100}%`,
		width: `${(crop.width / imageWidth) * 100}%`,
		height: `${(crop.height / imageHeight) * 100}%`,
	};
	return (
		<>
			<div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
				<div
					data-crop-box
					className="absolute shadow-[0_0_0_999px_oklch(0.25_0.02_262/0.32)] ring-1 ring-ink"
					style={box}
				/>
			</div>
			<div className="pointer-events-none absolute" style={box}>
				{CORNERS.map((handle) => (
					<button
						key={handle.corner}
						type="button"
						aria-label={handle.label}
						className="group pointer-events-auto absolute grid size-8 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full outline-none active:cursor-grabbing pointer-coarse:size-11"
						style={cornerStyle(handle.corner)}
						onPointerDown={(event) => onPointerDown(event, handle.corner)}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
						onPointerCancel={onPointerCancel}
						onLostPointerCapture={onPointerCancel}
						onKeyDown={(event) => onKeyDown(event, handle.corner)}
					>
						<span className="size-4 rounded-full border-2 border-ink bg-paper shadow-float transition-transform group-hover:scale-110 group-focus-visible:ring-3 group-focus-visible:ring-ring group-active:scale-110" />
					</button>
				))}
			</div>
		</>
	);
}
