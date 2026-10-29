"use client";

import { outlinePath, strokeOutline } from "@repo/render/html";
import type { Stroke, StrokeInput } from "@repo/types";
import {
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	type Ref,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
} from "react";
import {
	drawsWith,
	EMPTY_POINTER_SESSION,
	type PointerSample,
	type PointerSessionEvent,
	pointerSession,
} from "./pointer-session.ts";

export type InkCanvasHandle = { undo(): void; redo(): void; clear(): void };

export type InkHistory = { canUndo: boolean; canRedo: boolean };

export type InkCanvasProps = {
	widthPx: number;
	heightPx: number;
	guides?: ReactNode;
	background?: ReactNode;
	strokeScale?: number;
	composite?: "source-over" | "destination-out";
	underlay?: CanvasImageSource | null;
	penOnly?: boolean;
	onStrokeEnd(strokes: Stroke[], history: InkHistory): void;
	ref?: Ref<InkCanvasHandle>;
	className?: string;
	"aria-label"?: string;
};

function inputOf(pointerType: string): StrokeInput {
	if (pointerType === "pen") return "pen";
	if (pointerType === "touch") return "touch";
	return "mouse";
}

function samplesOf(
	event: PointerEvent,
	canvas: HTMLCanvasElement,
	widthPx: number,
	heightPx: number,
): PointerSample[] {
	const box = canvas.getBoundingClientRect();
	const coalesced =
		typeof event.getCoalescedEvents === "function"
			? event.getCoalescedEvents()
			: [];
	const events = coalesced.length > 0 ? coalesced : [event];
	return events.map((each) => ({
		pointerId: event.pointerId,
		input: inputOf(event.pointerType),
		x: ((each.clientX - box.left) * widthPx) / box.width,
		y: ((each.clientY - box.top) * heightPx) / box.height,
		pressure: each.pressure,
		t: each.timeStamp,
	}));
}

export function InkCanvas({
	widthPx,
	heightPx,
	guides,
	background,
	strokeScale = 1,
	composite = "source-over",
	underlay = null,
	penOnly = false,
	onStrokeEnd,
	ref,
	className,
	"aria-label": ariaLabel,
}: InkCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const session = useRef(EMPTY_POINTER_SESSION);
	const frame = useRef(0);
	const cache = useRef({
		scale: strokeScale,
		paths: new WeakMap<Stroke, Path2D>(),
	});
	const strokeEnd = useRef(onStrokeEnd);

	useEffect(() => {
		strokeEnd.current = onStrokeEnd;
	});

	const draw = useCallback(() => {
		frame.current = 0;
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return;
		if (cache.current.scale !== strokeScale) {
			cache.current = { scale: strokeScale, paths: new WeakMap() };
		}
		const { paths } = cache.current;
		const pathOf = (stroke: Stroke) => {
			const known = paths.get(stroke);
			if (known) return known;
			const path = new Path2D(outlinePath(strokeOutline(stroke, strokeScale)));
			paths.set(stroke, path);
			return path;
		};
		const ratio = canvas.width / widthPx;
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.globalCompositeOperation = "source-over";
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		if (underlay) {
			context.globalCompositeOperation = "source-over";
			context.drawImage(underlay, 0, 0, widthPx, heightPx);
		}
		context.globalCompositeOperation = composite;
		context.fillStyle = getComputedStyle(canvas).color;
		const { strokes, active } = session.current;
		for (const stroke of strokes) context.fill(pathOf(stroke));
		if (active) {
			context.fill(
				new Path2D(outlinePath(strokeOutline(active.stroke, strokeScale))),
			);
		}
	}, [widthPx, heightPx, strokeScale, composite, underlay]);

	const dispatch = useCallback(
		(event: PointerSessionEvent) => {
			const previous = session.current;
			const next = pointerSession(previous, event);
			if (next === previous) return;
			session.current = next;
			if (!frame.current) frame.current = requestAnimationFrame(draw);
			if (
				next.strokes !== previous.strokes ||
				next.undone !== previous.undone
			) {
				strokeEnd.current(next.strokes, {
					canUndo: next.strokes.length > 0,
					canRedo: next.undone.length > 0,
				});
			}
		},
		[draw],
	);

	useImperativeHandle(
		ref,
		() => ({
			undo: () => dispatch({ type: "undo" }),
			redo: () => dispatch({ type: "redo" }),
			clear: () => dispatch({ type: "clear" }),
		}),
		[dispatch],
	);

	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(widthPx * ratio);
		canvas.height = Math.round(heightPx * ratio);
		draw();
	}, [widthPx, heightPx, draw]);

	useEffect(
		() => () => {
			if (frame.current) cancelAnimationFrame(frame.current);
		},
		[],
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!penOnly || !canvas) return;
		const holdStylus = (event: TouchEvent) => {
			if (
				[...event.changedTouches].some(
					(touch) => "touchType" in touch && touch.touchType === "stylus",
				)
			) {
				event.preventDefault();
			}
		};
		canvas.addEventListener("touchstart", holdStylus, { passive: false });
		canvas.addEventListener("touchmove", holdStylus, { passive: false });
		return () => {
			canvas.removeEventListener("touchstart", holdStylus);
			canvas.removeEventListener("touchmove", holdStylus);
		};
	}, [penOnly]);

	function samples(event: ReactPointerEvent<HTMLCanvasElement>) {
		return samplesOf(event.nativeEvent, event.currentTarget, widthPx, heightPx);
	}

	function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
		if (!drawsWith(event, penOnly)) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		const [sample] = samples(event).slice(-1);
		if (sample) dispatch({ type: "down", sample });
	}

	function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
		if (session.current.active?.pointerId !== event.pointerId) return;
		dispatch({ type: "move", samples: samples(event) });
	}

	return (
		<div
			className={["relative select-none text-ink", className]
				.filter(Boolean)
				.join(" ")}
			style={{
				width: widthPx,
				maxWidth: "100%",
				aspectRatio: `${widthPx} / ${heightPx}`,
			}}
		>
			{background ? (
				<div className="pointer-events-none absolute inset-0">{background}</div>
			) : null}
			{guides ? (
				<div className="pointer-events-none absolute inset-0">{guides}</div>
			) : null}
			<canvas
				ref={canvasRef}
				aria-label={ariaLabel}
				className={[
					"absolute inset-0 size-full [-webkit-touch-callout:none]",
					penOnly ? "touch-pan-y" : "touch-none",
				].join(" ")}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={(event) =>
					dispatch({ type: "up", pointerId: event.pointerId })
				}
				onPointerCancel={(event) =>
					dispatch({ type: "cancel", pointerId: event.pointerId })
				}
			/>
		</div>
	);
}
