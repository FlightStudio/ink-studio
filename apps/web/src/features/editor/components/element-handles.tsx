"use client";

import type { PlacementIssue } from "@repo/render/html";
import { sideTopIn } from "@repo/render/html";
import type { PageSpec, PlacedElement } from "@repo/types";
import {
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
} from "react";
import type { ElementChange } from "../elements.ts";
import {
	type Handle,
	moveTo,
	type PointIn,
	resizeFrom,
	rotateToward,
} from "../transform.ts";
import { ElementMenu } from "./element-menu.tsx";

const HANDLES: Handle[] = [
	"top-left",
	"top-right",
	"bottom-left",
	"bottom-right",
];

const ISSUE_COPY: Record<PlacementIssue["kind"], string> = {
	"keep-clear": "Keep this corner clear for the postal barcode.",
	"outside-safe": "Keep this doodle inside the safe area.",
	"beyond-sides": "This doodle is past the last side.",
};

type Gesture =
	| {
			kind: "move";
			origin: PlacedElement;
			offset: PointIn;
			node: HTMLElement;
			moved: boolean;
			latest: PlacedElement | null;
	  }
	| {
			kind: "resize";
			origin: PlacedElement;
			handle: Handle;
			node: HTMLElement;
			moved: boolean;
			latest: PlacedElement | null;
	  }
	| {
			kind: "rotate";
			origin: PlacedElement;
			node: HTMLElement;
			moved: boolean;
			latest: PlacedElement | null;
	  };

export type ElementHandlesProps = {
	elements: PlacedElement[];
	spec: PageSpec;
	gapIn: number;
	scale: number;
	issues: PlacementIssue[];
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onPreview: (element: PlacedElement | null) => void;
	onCommit: (id: string, change: ElementChange) => void;
	onRemove: (id: string) => void;
};

export function placementSentence(issues: PlacementIssue[]): string | null {
	if (issues.length === 0) return null;
	if (issues.some((issue) => issue.kind === "keep-clear")) {
		return ISSUE_COPY["keep-clear"];
	}
	const kind = issues[0]?.kind;
	return kind ? ISSUE_COPY[kind] : null;
}

function changed(
	origin: PlacedElement,
	next: PlacedElement,
): ElementChange | null {
	const change: ElementChange = {};
	if (next.side !== origin.side) change.side = next.side;
	if (next.xIn !== origin.xIn) change.xIn = next.xIn;
	if (next.yIn !== origin.yIn) change.yIn = next.yIn;
	if (next.widthIn !== origin.widthIn) change.widthIn = next.widthIn;
	if (next.heightIn !== origin.heightIn) change.heightIn = next.heightIn;
	if (next.rotationDeg !== origin.rotationDeg)
		change.rotationDeg = next.rotationDeg;
	if (next.tint !== origin.tint) change.tint = next.tint;
	return Object.keys(change).length > 0 ? change : null;
}

function pagePoint(
	spec: PageSpec,
	node: HTMLElement,
	clientX: number,
	clientY: number,
): PointIn {
	const sides = node.closest(".letter-sides");
	if (!(sides instanceof HTMLElement)) {
		throw new Error("the doodle handles are outside the page");
	}
	const rect = sides.getBoundingClientRect();
	const pxPerIn = rect.width / spec.widthIn;
	return {
		xIn: (clientX - rect.left) / pxPerIn,
		yIn: (clientY - rect.top) / pxPerIn,
	};
}

function boxStyle(
	spec: PageSpec,
	element: PlacedElement,
	gapIn: number,
): CSSProperties {
	return {
		left: `${element.xIn}in`,
		top: `${sideTopIn(spec, element.side, gapIn) + element.yIn}in`,
		width: `${element.widthIn}in`,
		height: `${element.heightIn}in`,
		transform: `rotate(${element.rotationDeg}deg)`,
		touchAction: "none",
	};
}

export function ElementHandles(props: ElementHandlesProps) {
	const propsRef = useRef(props);
	propsRef.current = props;
	const gestureRef = useRef<Gesture | null>(null);
	const selected = props.elements.find(
		(element) => element.id === props.selectedId,
	);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const id = propsRef.current.selectedId;
			if (!id) return;
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			if (target.closest("input, textarea, [data-element-menu]")) return;
			const inLetter = target.closest(".letter-text") !== null;
			if (event.key === "Delete" || event.key === "Backspace") {
				event.preventDefault();
				event.stopPropagation();
				propsRef.current.onRemove(id);
				return;
			}
			if (
				inLetter &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				event.key.length === 1
			) {
				propsRef.current.onSelect(null);
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, []);

	function finish() {
		const gesture = gestureRef.current;
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", finish);
		window.removeEventListener("pointercancel", finish);
		gestureRef.current = null;
		if (!gesture) return;
		const change =
			gesture.moved && gesture.latest
				? changed(gesture.origin, gesture.latest)
				: null;
		propsRef.current.onPreview(null);
		if (change) propsRef.current.onCommit(gesture.origin.id, change);
	}

	function onMove(event: PointerEvent) {
		const gesture = gestureRef.current;
		if (!gesture) return;
		const { spec, gapIn } = propsRef.current;
		const pointer = pagePoint(spec, gesture.node, event.clientX, event.clientY);
		const origin = gesture.origin;
		let next = origin;
		if (gesture.kind === "move") {
			next = {
				...origin,
				...moveTo(origin, {
					pointer: {
						xIn: pointer.xIn - gesture.offset.xIn,
						yIn: pointer.yIn - gesture.offset.yIn,
					},
					spec,
					gapIn,
				}),
			};
		} else if (gesture.kind === "resize") {
			next = {
				...origin,
				...resizeFrom(origin, gesture.handle, { pointer, spec, gapIn }),
			};
		} else {
			next = {
				...origin,
				rotationDeg: rotateToward(origin, { pointer, spec, gapIn }),
			};
		}
		gesture.moved = true;
		gesture.latest = next;
		propsRef.current.onPreview(next);
	}

	function begin(event: ReactPointerEvent<HTMLElement>, gesture: Gesture) {
		event.preventDefault();
		event.stopPropagation();
		props.onSelect(gesture.origin.id);
		gestureRef.current = gesture;
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", finish);
		window.addEventListener("pointercancel", finish);
	}

	function startMove(
		event: ReactPointerEvent<HTMLButtonElement>,
		origin: PlacedElement,
	) {
		const { spec, gapIn } = props;
		const pointer = pagePoint(
			spec,
			event.currentTarget,
			event.clientX,
			event.clientY,
		);
		const centre = {
			xIn: origin.xIn + origin.widthIn / 2,
			yIn:
				sideTopIn(spec, origin.side, gapIn) + origin.yIn + origin.heightIn / 2,
		};
		begin(event, {
			kind: "move",
			origin,
			offset: {
				xIn: pointer.xIn - centre.xIn,
				yIn: pointer.yIn - centre.yIn,
			},
			node: event.currentTarget,
			moved: false,
			latest: null,
		});
	}

	const handlePx = 22 / props.scale;

	return (
		<>
			{props.elements.map((element) => {
				const selectedElement = element.id === props.selectedId;
				const danger = props.issues.some(
					(issue) => issue.elementId === element.id,
				);
				return (
					<div
						key={element.id}
						className="absolute"
						data-element-id={element.id}
						style={boxStyle(props.spec, element, props.gapIn)}
					>
						<button
							type="button"
							aria-label="Move doodle"
							className="absolute inset-0 cursor-grab active:cursor-grabbing"
							style={
								selectedElement
									? {
											outline: `2px solid ${danger ? "var(--danger)" : "var(--ink)"}`,
											outlineOffset: `${4 / props.scale}px`,
										}
									: danger
										? {
												outline: "2px solid var(--danger)",
												outlineOffset: `${4 / props.scale}px`,
											}
										: undefined
							}
							onPointerDown={(event) => startMove(event, element)}
						/>
						{selectedElement
							? HANDLES.map((handle) => (
									<button
										key={handle}
										type="button"
										aria-label={`Resize from the ${handle.replace("-", " ")}`}
										className="absolute z-10 rounded-full border border-ink bg-paper"
										style={{
											left: handle.endsWith("right") ? "100%" : "0%",
											top: handle.startsWith("bottom") ? "100%" : "0%",
											width: handlePx,
											height: handlePx,
											transform: "translate(-50%, -50%)",
										}}
										onPointerDown={(event) =>
											begin(event, {
												kind: "resize",
												origin: element,
												handle,
												node: event.currentTarget,
												moved: false,
												latest: null,
											})
										}
									/>
								))
							: null}
						{selectedElement ? (
							<button
								type="button"
								aria-label="Rotate doodle"
								className="absolute z-10 rounded-full border border-ink bg-paper"
								style={{
									left: "50%",
									top: 0,
									width: handlePx,
									height: handlePx,
									transform: "translate(-50%, calc(-100% - 8px))",
								}}
								onPointerDown={(event) =>
									begin(event, {
										kind: "rotate",
										origin: element,
										node: event.currentTarget,
										moved: false,
										latest: null,
									})
								}
							/>
						) : null}
					</div>
				);
			})}
			{selected ? (
				<ElementMenu
					tint={selected.tint}
					onTint={(tint) => props.onCommit(selected.id, { tint })}
					onRemove={() => props.onRemove(selected.id)}
					style={{
						left: `${selected.xIn}in`,
						top: `${sideTopIn(props.spec, selected.side, props.gapIn) + selected.yIn + selected.heightIn + 0.15}in`,
						transform: `scale(${1 / props.scale})`,
						transformOrigin: "top left",
					}}
				/>
			) : null}
		</>
	);
}
